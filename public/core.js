/** Shared, deterministic case logic. All imported/provider text is untrusted data. */
export const FIELDS = Object.freeze(['property', 'owner', 'pha', 'caseReference', 'rent']);
export const LABELS = Object.freeze({ property: 'Property', owner: 'Owner', pha: 'PHA', caseReference: 'Case reference', rent: 'Proposed rent' });
export const CSV_NOTICE = 'NESTLET OPERATOR CASE WORKSHEET | DRAFT - DE-IDENTIFIED WORKING COPY - NOT FOR SUBMISSION | Facts may be unconfirmed; human review required; not compliance certification';
export const DRAFT_TYPES = Object.freeze(['followup', 'missing-documents', 'status-summary']);
const emptyField = key => ({ key, value: '', source: '', conflict: false, confirmed: false });
const unknown = value => /^(unknown|not confirmed|not provided|待确认)$/iu.test(value.trim());

/** Narrow language check, not a general English-language detector. Never translates facts. */
export function hasCJKText(text) {
  return typeof text === 'string' && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

export function extract(text) {
  if (typeof text !== 'string') throw new Error('Expected document text');
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  return FIELDS.map(key => {
    const matches = lines.filter(line => line.trimStart().toLowerCase().startsWith(LABELS[key].toLowerCase() + ':'));
    const values = [...new Set(matches.map(line => line.slice(line.indexOf(':') + 1).trim()).filter(Boolean))];
    return { key, value: values.length === 1 && !unknown(values[0]) ? values[0] : '', source: matches.join('\n'), sources: matches, conflict: values.length > 1, confirmed: false };
  });
}

/** Missing facts can be explicitly reviewed; malformed or duplicate records cannot. */
export function canDraft(fields) {
  return Array.isArray(fields) && fields.length === FIELDS.length &&
    FIELDS.every(key => fields.filter(field => field?.key === key).length === 1) &&
    fields.every(field => typeof field.value === 'string' && typeof field.source === 'string' &&
      field.confirmed === true && field.conflict === false && field.value.length <= 3000 &&
      !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(field.value));
}

export function draft(fields, kind = 'followup') {
  if (!canDraft(fields)) throw new Error('Review required');
  if (!DRAFT_TYPES.includes(kind)) throw new Error('Unknown draft type');
  const val = key => fields.find(field => field.key === key).value.trim() || '[To be confirmed]';
  const facts = `Property: ${val('property')}\nOwner: ${val('owner')}\nHousing authority: ${val('pha')}\nCase reference: ${val('caseReference')}\nProposed rent (not approved): ${val('rent')}`;
  const header = `DRAFT — FOR HUMAN REVIEW\nDE-IDENTIFIED WORKING COPY — NOT FOR SUBMISSION\nOperator-prepared supplementary document; not an official government form`;
  const disclaimer = 'This message does not represent an eligibility determination, rent approval, completed official form, or confirmation of program acceptance.';
  if (kind === 'status-summary') {
    const missing = fields.filter(field => !field.value.trim()).map(field => LABELS[field.key]);
    return `${header}\n\nCASE STATUS SUMMARY\nDate: [Insert date before use]\n\n${facts}\n\nInformation not provided in this working copy:\n${missing.length ? missing.map(label => '- ' + label + ': [To be confirmed]').join('\n') : '- No blank case fields. Document receipt and agency acceptance are not verified.'}\n\nAdministrative next step:\nConfirm the responsible housing authority, current RFTA package, applicable supporting documents, and submission method with the verified agency.\n\nDocument receipt, submission, inspection, and approval status: [Not independently verified]\nNext-action owner: [Assign operator]\nTarget date: [Confirm deadline]\n\n${disclaimer}\n\nPrepared by: [Operator name / Organization]\nSource verification: [Record reviewed materials and date]`;
  }
  const subject = kind === 'missing-documents' ? 'Request for missing information and document confirmation' : 'Request for lease-up instructions and missing information';
  const body = kind === 'missing-documents'
    ? `Please help confirm the information below that is not provided in this working copy. This does not mean it has not already been submitted to the housing authority.\n\n${fields.filter(field => !field.value.trim()).map(field => '- ' + LABELS[field.key] + ': [To be confirmed]').join('\n') || '- No blank case fields; please confirm document receipt and any outstanding requests.'}\n\nPlease confirm the current agency-required documents and whether any are outstanding. Do not send sensitive identity, tax, or banking documents by an unapproved channel; please confirm the agency-approved secure submission method first.`
    : 'Please confirm the responsible housing authority, current Request for Tenancy Approval package, required supporting documents, and submission method. Please also advise whether any additional information is needed for this case.';
  return `${header}\nSupplementary correspondence; not an official government form\n\nDate: [Insert date before sending]\nTo: [Verify recipient and email/address]\nSubject: ${subject} — ${val('caseReference')}\n\nDear [Verified recipient name],\n\nI am preparing lease-up materials for the property listed below and would appreciate your assistance in confirming the applicable instructions and outstanding items.\n\n${facts}\n\n${body}\n\n${disclaimer}\n\nThank you for your assistance.\n\nSincerely,\n[Sender name]\n[Role / Organization]\n[Verified contact details]\n\nAttachments: [List only documents actually attached]`;
}

/** RFC-style quotes with exactly one case; embedded line breaks cannot inject labels. */
export function parseCSV(text) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid CSV');
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', state = 'start', active = false;
  const finishCell = () => { row.push(cell); cell = ''; state = 'start'; };
  const finishRow = () => { finishCell(); if (active || row.length > 1) rows.push(row); row = []; active = false; };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; } else state = 'closed';
      } else cell += character;
      continue;
    }
    if (character === ',' ) { active = true; finishCell(); continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      finishRow(); continue;
    }
    if (state === 'closed') throw new Error('Invalid CSV');
    if (character === '"') {
      if (state !== 'start') throw new Error('Invalid CSV');
      state = 'quoted'; active = true;
    } else { cell += character; state = 'plain'; active = true; }
  }
  if (state === 'quoted') throw new Error('Invalid CSV');
  if (active || row.length || cell.length) finishRow();
  if (rows[0]?.length === 1 && rows[0][0] === CSV_NOTICE) rows.shift();
  if (rows.length !== 2 || rows[0].length !== FIELDS.length || rows[0].some((header, index) => header !== FIELDS[index]) || rows[1].length !== FIELDS.length) throw new Error('Expected header and one case');
  return rows[1].map((value, index) => `${LABELS[FIELDS[index]]}: ${value.replace(/[\r\n\u2028\u2029]+/gu, ' ').replace(/\u0000/gu, '')}`).join('\n');
}

export function exportCSV(fields, { includeNotice = false } = {}) {
  const safe = value => {
    let text = String(value);
    // Prefixing a single quote neutralizes formula and control/whitespace bypasses.
    if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (includeNotice ? safe(CSV_NOTICE) + '\r\n' : '') + FIELDS.join(',') + '\r\n' + FIELDS.map(key => safe(fields?.find(field => field?.key === key)?.value || '')).join(',') + '\r\n';
}

/** Provider suggestions never grant approval or override contradictory labeled evidence. */
export function validateSuggestions(items, text) {
  if (!Array.isArray(items) || typeof text !== 'string') throw new Error('Invalid suggestions');
  const labeled = extract(text);
  return FIELDS.map(key => {
    const candidates = items.filter(item => item && typeof item === 'object' && !Array.isArray(item) && item.key === key);
    const evidence = labeled.find(field => field.key === key);
    const grounded = candidates.filter(item => typeof item.value === 'string' && typeof item.source === 'string' &&
      item.value.length <= 3000 && item.source.length <= 12000 && item.source.length > 0 &&
      text.includes(item.source) && item.source.includes(item.value) &&
      !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(item.value) &&
      (item.conflict === undefined || typeof item.conflict === 'boolean'));
    const values = new Set(grounded.map(item => item.value));
    const conflict = evidence.conflict || candidates.some(item => item.conflict === true) || values.size > 1 || candidates.length > 1;
    if (grounded.length === 0) return { ...emptyField(key), source: evidence.conflict ? evidence.source : '', sources: evidence.conflict ? evidence.sources : [], conflict };
    const item = grounded[0];
    // An explicit deterministic label mismatch cannot be silently accepted from AI.
    const mismatch = Boolean(evidence.value && item.value && evidence.value !== item.value);
    return { key, value: conflict || mismatch || unknown(item.value) ? '' : item.value,
      source: conflict || mismatch ? [...new Set([...evidence.sources, ...grounded.map(candidate => candidate.source)])].join('\n') : item.source,
      sources: [...new Set([...(evidence.conflict || mismatch ? evidence.sources : []), ...grounded.map(candidate => candidate.source)])], confirmed: false, conflict: conflict || mismatch };
  });
}

/** Validate one explicit worksheet/row/column mapping before changing the case. */
export function mapSpreadsheetRow(sheet, { rowIndex, mapping } = {}) {
  if (!sheet || typeof sheet.name !== 'string' || sheet.hidden !== false || !Array.isArray(sheet.rows) ||
      !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sheet.rows.length ||
      !mapping || typeof mapping !== 'object' || Array.isArray(mapping) ||
      Object.keys(mapping).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(mapping, key))) {
    throw new Error('Invalid worksheet mapping');
  }
  const row = sheet.rows[rowIndex];
  if (!Array.isArray(row) || !Array.isArray(sheet.blockedCells)) throw new Error('Invalid worksheet preview');
  const columns = FIELDS.map(key => mapping[key]).filter(column => column !== null);
  if (!columns.length || new Set(columns).size !== columns.length ||
      columns.some(column => !Number.isInteger(column) || column < 0 || column >= row.length)) {
    throw new Error('Select distinct, valid columns for the mapped fields');
  }
  const columnName = index => {
    let name = '';
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
    return name;
  };
  const fields = FIELDS.map(key => {
    const column = mapping[key];
    if (column === null) return emptyField(key);
    if (sheet.blockedCells.some(cell => cell.row === rowIndex && cell.column === column)) throw new Error('Selected cells include formulas, links, hidden, merged, or invalid data. Choose plain visible values.');
    if (typeof row[column] !== 'string' || row[column].length > 3000) throw new Error('Invalid cell value');
    const original = row[column];
    const value = original.replace(/[\r\n\u2028\u2029]+/gu, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim();
    return { ...emptyField(key), value: unknown(value) ? '' : value,
      source: `${sheet.name}!${columnName(column)}${rowIndex + 1}: ${original}`,
      sourceCell: { sheet: sheet.name, row: rowIndex + 1, column: columnName(column) } };
  });
  if (!fields.some(field => field.value)) throw new Error('The selected row has no usable mapped values');
  return { fields, text: fields.map(field => `${LABELS[field.key]}: ${field.value}`).join('\n') };
}
