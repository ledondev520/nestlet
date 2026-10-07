/** Isolated read-only workbook parser. Never evaluates formulae or follows links. */
import * as XLSX from 'xlsx';
import { inflateRawSync } from 'node:zlib';

const MAX_ROWS = 200;
const MAX_COLUMNS = 50;
const MAX_SHEETS = 12;
const MAX_TEXT = 200000;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

try {
  const chunks = [];
  let inputSize = 0;
  for await (const chunk of process.stdin) {
    inputSize += chunk.length;
    if (inputSize > 5 * 1024 * 1024) fail('WORKBOOK_TOO_COMPLEX', 'Workbook exceeds the byte limit.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const isZip = bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  const isCfb = bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!isZip && !isCfb) fail('INVALID_WORKBOOK', 'Use a valid .xlsx or Excel 97-2003 .xls workbook. Text files renamed as Excel are not supported.');
  // Enforce actual decompressed sizes before handing the package to SheetJS.
  if (isZip) {
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
    }
    if (end < 0) fail('INVALID_WORKBOOK', 'The Excel package is incomplete or corrupt.');
    const entries = bytes.readUInt16LE(end + 10);
    const directorySize = bytes.readUInt32LE(end + 12);
    let offset = bytes.readUInt32LE(end + 16), totalSize = 0;
    if (entries > 3000 || entries === 65535 || offset === 0xffffffff || directorySize === 0xffffffff ||
        offset + directorySize > end || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) fail('WORKBOOK_TOO_COMPLEX', 'Large or multipart Excel packages are not supported.');
    const directoryStart = offset;
    const names = new Set();
    for (let entry = 0; entry < entries; entry++) {
      if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail('INVALID_WORKBOOK', 'The Excel package directory is corrupt.');
      const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
      const compressed = bytes.readUInt32LE(offset + 20), uncompressed = bytes.readUInt32LE(offset + 24);
      const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
      const local = bytes.readUInt32LE(offset + 42);
      const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      if (names.has(name)) fail('INVALID_WORKBOOK', 'Duplicate Excel package entries are not supported.');
      names.add(name);
      totalSize += uncompressed;
      if (flags & 1) fail('WORKBOOK_ENCRYPTED', 'Encrypted Excel packages are not supported.');
      if (![0, 8].includes(method) || uncompressed > 20 * 1024 * 1024 || totalSize > 40 * 1024 * 1024 || compressed === 0xffffffff || local === 0xffffffff) fail('WORKBOOK_TOO_COMPLEX', 'Workbook expands beyond the safe preview limit. Use a smaller workbook.');
      if (local + 30 > directoryStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) fail('INVALID_WORKBOOK', 'The Excel package has inconsistent entries.');
      const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
      if (bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) fail('INVALID_WORKBOOK', 'The Excel package has inconsistent names.');
      const start = local + 30 + localNameLength + localExtraLength;
      if (start + compressed > directoryStart) fail('INVALID_WORKBOOK', 'The Excel package is truncated.');
      const compressedBytes = bytes.subarray(start, start + compressed);
      const inflated = method === 0 ? compressedBytes : inflateRawSync(compressedBytes, { maxOutputLength: 20 * 1024 * 1024 });
      if (inflated.length !== uncompressed) fail('INVALID_WORKBOOK', 'The Excel package declares an incorrect expanded size.');
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset !== directoryStart + directorySize || !names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) fail('INVALID_WORKBOOK', 'Use an XLSX workbook, not another ZIP-based document format.');
  }
  const options = { type: 'buffer', cellFormula: true, cellHTML: false, cellStyles: true, cellText: true,
    bookVBA: false, bookDeps: false, bookFiles: false, WTF: true, sheetRows: MAX_ROWS + 1 };
  const metadata = XLSX.read(bytes, { ...options, bookSheets: true });
  if (!Array.isArray(metadata.SheetNames) || !metadata.SheetNames.length) fail('INVALID_WORKBOOK', 'No worksheets were found.');
  if (metadata.SheetNames.length > MAX_SHEETS) fail('WORKBOOK_TOO_COMPLEX', `This preview supports up to ${MAX_SHEETS} worksheets. Use a smaller workbook.`);
  const workbook = XLSX.read(bytes, options);
  let totalText = 0;
  const warnings = ['Values-only preview. Formula results, hyperlinks, hidden cells, and merged cells cannot be imported. Macros are not run and external links are not followed.'];
  const sheets = workbook.SheetNames.map((name, sheetIndex) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) fail('INVALID_WORKBOOK', 'A worksheet could not be read.');
    const fullRange = sheet['!fullref'] || sheet['!ref'];
    const range = fullRange ? XLSX.utils.decode_range(fullRange) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    const rowCount = Math.min(range.e.r + 1, MAX_ROWS);
    const columnCount = Math.min(range.e.c + 1, MAX_COLUMNS);
    if (rowCount < 0 || columnCount < 0 || !Number.isSafeInteger(rowCount) || !Number.isSafeInteger(columnCount)) fail('INVALID_WORKBOOK', 'Invalid worksheet dimensions.');
    const blockedCells = [];
    const rows = [];
    const hidden = Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden);
    for (let row = 0; row < rowCount; row++) {
      const values = [];
      for (let column = 0; column < columnCount; column++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        let reason = '';
        if (sheet['!rows']?.[row]?.hidden || sheet['!cols']?.[column]?.hidden) reason = 'hidden';
        else if (sheet['!merges']?.some(merge => row >= merge.s.r && row <= merge.e.r && column >= merge.s.c && column <= merge.e.c)) reason = 'merged';
        else if (cell && (cell.f !== undefined || cell.F !== undefined || cell.D)) reason = 'formula';
        else if (cell?.l) reason = 'hyperlink';
        else if (cell?.t === 'e') reason = 'cell-error';
        let value = '';
        if (reason) blockedCells.push({ row, column, reason });
        else if (cell && cell.v !== undefined && cell.v !== null) {
          value = typeof cell.w === 'string' ? cell.w : String(cell.v);
          if (value.length > 3000) { blockedCells.push({ row, column, reason: 'cell-too-long' }); value = ''; }
          totalText += value.length;
          if (totalText > MAX_TEXT) fail('WORKBOOK_TOO_COMPLEX', 'Workbook text exceeds the safe preview limit. Use a smaller workbook.');
        }
        values.push(value);
      }
      rows.push(values);
    }
    const truncated = range.e.r >= MAX_ROWS || range.e.c >= MAX_COLUMNS;
    if (truncated) warnings.push(`Worksheet "${name}" is limited to its first ${MAX_ROWS} rows and ${MAX_COLUMNS} columns.`);
    if (hidden) warnings.push(`Worksheet "${name}" is hidden and cannot be imported.`);
    return { name, hidden, rows, blockedCells, truncated };
  });
  process.stdout.write(JSON.stringify({ ok: true, data: { sheets, warnings, mode: 'local-workbook', limits: { rows: MAX_ROWS, columns: MAX_COLUMNS, sheets: MAX_SHEETS } } }));
} catch (error) {
  const encrypted = /password|encrypt|crypto|FilePass/iu.test(error.message);
  process.stdout.write(JSON.stringify({ ok: false, code: encrypted ? 'WORKBOOK_ENCRYPTED' : error.code || 'INVALID_WORKBOOK',
    error: encrypted ? 'Password-protected workbooks are not supported. Export a de-identified values-only copy instead.' : error.code ? error.message : 'The workbook could not be read. Use a valid .xlsx or Excel 97-2003 .xls file.' }));
}
