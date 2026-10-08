/** Local-only, bounded PDF rendering. Never interprets document text as HTML. */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const MAX_BYTES = 8 * 1024 * 1024;
let active = 0;
export class DocumentPdfError extends Error {
  constructor(code, status = 422) { super(code); this.code = code; this.status = status; }
}
export function createDocumentPdf(artifact) {
  if (active >= 2) return Promise.reject(new DocumentPdfError('PDF_EXPORT_BUSY', 503));
  if (typeof artifact?.content !== 'string' || !artifact.content || artifact.content.length > 50000) return Promise.reject(new DocumentPdfError('PDF_EXPORT_FAILED'));
  active++;
  return new Promise((resolve, reject) => {
    let worker, timer, settled = false;
    const finish = (error, bytes) => {
      if (settled) return; settled = true; clearTimeout(timer); active--;
      worker?.terminate(); error ? reject(error) : resolve(Buffer.from(bytes));
    };
    try {
      worker = new Worker(new URL(import.meta.url), {workerData: {content:artifact.content, id:artifact.id, version:artifact.version, status:artifact.status}, resourceLimits:{maxOldGenerationSizeMb:128}});
      timer = setTimeout(() => finish(new DocumentPdfError('PDF_EXPORT_FAILED',503)), 15000);
      worker.on('message', result => result.code ? finish(new DocumentPdfError(result.code, result.code === 'PDF_EXPORT_UNAVAILABLE' ? 503 : 422)) :
        result.bytes?.length <= MAX_BYTES ? finish(null,result.bytes) : finish(new DocumentPdfError('PDF_EXPORT_FAILED')));
      worker.on('error', () => finish(new DocumentPdfError('PDF_EXPORT_FAILED',503)));
      worker.on('exit', () => {if (!settled) finish(new DocumentPdfError('PDF_EXPORT_FAILED',503));});
    } catch {finish(new DocumentPdfError('PDF_EXPORT_UNAVAILABLE',503));}
  });
}
if (!isMainThread && parentPort) {
  try {
    const {default:PDFDocument} = await import('pdfkit');
    const doc = new PDFDocument({size:'LETTER', margin:54, autoFirstPage:true, info:{
      Title:`Nestlet document v${workerData.version} (${workerData.status})`,
      Subject:`Saved artifact ${workerData.id}`, Creator:'Nestlet', Producer:'Nestlet / PDFKit'
    }});
    try {doc.font('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','NotoSansCJKsc-Regular');}
    catch {throw new DocumentPdfError('PDF_EXPORT_UNAVAILABLE');}
    // PDFKit's embedded font exposes the fontkit glyph map. Never emit missing-glyph boxes.
    for (const char of workerData.content) {
      if (!'\n\r\t'.includes(char) && !doc._font.font.hasGlyphForCodePoint(char.codePointAt(0))) throw new DocumentPdfError('PDF_EXPORT_UNSUPPORTED_TEXT');
    }
    let pages = 1, length = 0; const chunks = [];
    doc.on('pageAdded', () => {if (++pages > 100) throw new DocumentPdfError('PDF_EXPORT_TOO_LARGE');});
    doc.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_BYTES) throw new DocumentPdfError('PDF_EXPORT_TOO_LARGE');
      chunks.push(chunk);
    });
    doc.on('error', () => parentPort.postMessage({code:'PDF_EXPORT_FAILED'}));
    doc.on('end', () => parentPort.postMessage({bytes:Buffer.concat(chunks)}));
    doc.fontSize(11).text(workerData.content, {lineGap:4, paragraphGap:0, features:{liga:false,clig:false}});
    doc.end();
  } catch (error) {parentPort.postMessage({code:error instanceof DocumentPdfError ? error.code : 'PDF_EXPORT_FAILED'});}
}
