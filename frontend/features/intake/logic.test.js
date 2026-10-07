import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, LIMITS, caseWork, casePayload, appendSource, fileType, mergeSuggestions, reconcileWork, extract, parseCSV, mapSpreadsheetRow, validateSuggestions, importMatches, recoverySnapshot, validRecovery, restoreEdits } from './logic.js';
const id = '11111111-1111-4111-8111-111111111111';
const field = (key, value, extra = {}) => ({ key, value, source: `${key}: ${value}`, confirmed: false, conflict: false, ...extra });

test('blank workspace is empty, five unknown fields, and save whitelist excludes history/context', () => {
  const empty = caseWork(); assert.equal(empty.sourceText, ''); assert.equal(empty.fields.length, 5); assert.ok(empty.fields.every(item => !item.value && !item.confirmed));
  const record = { ...empty, title: ' Case ', clientId: id, documentContext: { senderName: 'Protected' }, caseIssues: [{ question: 'Keep' }], id, version: 8 };
  const payload = casePayload(record, 'Untitled'); assert.equal(payload.title, 'Case'); assert.equal(payload.clientId, id); assert.ok(!('documentContext' in payload)); assert.ok(!('caseIssues' in payload)); assert.ok(!('version' in payload));
});
test('source appends preserve prior evidence and never silently truncate', () => {
  assert.equal(appendSource('Earlier', 'New source'), 'Earlier\n\nNew source');
  assert.throws(() => appendSource('x'.repeat(LIMITS.source), 'extra'), { code: 'TEXT_TOO_LARGE' });
  assert.throws(() => appendSource('', '  '), { code: 'SOURCE_EMPTY' });
});
test('file acceptance checks bounded actual bytes and canonical MIME by supported extension', () => {
  assert.equal(fileType({ name: 'Synthetic.XLSX', size: 12 }).mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.throws(() => fileType({ name: 'report.pdf', size: LIMITS.fileBytes + 1 }), { code: 'ASSET_TOO_LARGE' });
  assert.throws(() => fileType({ name: 'report.docx', size: 12 }), { code: 'ASSET_TYPE_UNSUPPORTED' });
  assert.throws(() => fileType({ name: 'report.txt', size: 0 }), { code: 'ASSET_EMPTY' });
});
test('new suggestions preserve reviewed values, expose conflicting sources, and keep unknowns', () => {
  const original = [field('property', 'Synthetic old', { confirmed: true }), field('owner', 'Reviewed owner', { confirmed: true })];
  const merged = mergeSuggestions(original, [field('property', 'Synthetic new')]);
  assert.equal(merged[0].value, 'Synthetic old'); assert.equal(merged[0].confirmed, false); assert.equal(merged[0].conflict, true); assert.match(merged[0].source, /Synthetic old/); assert.match(merged[0].source, /Synthetic new/);
  assert.equal(merged[1].value, 'Reviewed owner'); assert.equal(merged[1].confirmed, true); assert.equal(merged[2].value, '');
  assert.equal(mergeSuggestions(original, [field('property', 'Synthetic old')])[0].confirmed, true);
});
test('manual labels and AI validation do not invent or trust ungrounded facts', () => {
  const source = 'Property: Synthetic Lane\nOwner: Example LLC\nProposed rent: $2100';
  assert.equal(extract(source)[0].value, 'Synthetic Lane');
  const suggestions = validateSuggestions([field('property', 'Invented Lane', { source: 'Imaginary evidence', confirmed: true })], source);
  assert.equal(suggestions[0].value, ''); assert.equal(suggestions[0].confirmed, false);
  assert.equal(extract('Property: A\nProperty: B')[0].conflict, true);
});
test('CSV parsing remains one-row mapping; workbook cell provenance and blocked cells are real', () => {
  const text = parseCSV('property,owner,pha,caseReference,rent\n"Synthetic Lane, Unit 1",Example LLC,,REF-1,$2100\n');
  assert.match(text, /Property: Synthetic Lane, Unit 1/);
  assert.throws(() => parseCSV('property,owner,pha,caseReference,rent\na,b,c,d,e\nf,g,h,i,j'));
  const sheet = { name: 'Synthetic', hidden: false, rows: [['Synthetic Lane', '$2100']], blockedCells: [] };
  const mapping = Object.fromEntries(FIELDS.map(key => [key, null])); mapping.property = 0; mapping.rent = 1;
  const mapped = mapSpreadsheetRow(sheet, { rowIndex: 0, mapping }); assert.equal(mapped.fields[0].source, 'Synthetic!A1: Synthetic Lane'); assert.equal(mapped.fields[4].value, '$2100');
  assert.throws(() => mapSpreadsheetRow({ ...sheet, blockedCells: [{ row: 0, column: 0, reason: 'formula' }] }, { rowIndex: 0, mapping }));
});
test('three-way reconciliation adopts untouched remote fields and explicitly conflicts shared edits', () => {
  const base = { ...caseWork(), title: 'Original', fields: FIELDS.map(key => field(key, `before-${key}`)), sourceText: 'Base source', clientId: id, draftText: '' };
  const local = { ...caseWork(base), title: 'My title', sourceText: 'My source', fields: base.fields.map(item => item.key === 'property' ? { ...item, value: 'Mine', edited: true } : item) };
  const remote = { ...base, sourceText: 'Remote source', fields: base.fields.map(item => item.key === 'property' ? { ...item, value: 'Theirs', source: 'Remote: Theirs' } : item.key === 'owner' ? { ...item, value: 'Remote owner' } : item), draftText: 'Immutable old draft' };
  const merged = reconcileWork(base, local, remote); assert.equal(merged.title, 'My title'); assert.equal(merged.clientId, id); assert.equal(merged.draftText, 'Immutable old draft'); assert.equal(merged.sourceText, 'My source\n\nRemote source'); assert.equal(merged.fields[0].value, 'Mine'); assert.equal(merged.fields[0].conflict, true); assert.equal(merged.fields[1].value, 'Remote owner');
});
test('imports require current account and case; recovery excludes binary/draft/context history', () => {
  const request = { id: 'request', userId: 'account-a', caseId: id, files: [] };
  assert.equal(importMatches(request, 'account-a', id), true); assert.equal(importMatches(request, 'account-b', id), false); assert.equal(importMatches(request, 'account-a', null), false);
  const work = { ...caseWork(), sourceText: 'Unsaved', title: 'Recovered', draftText: 'Must not cache' };
  const saved = recoverySnapshot(work, { version: 2 }, id); assert.equal(validRecovery(saved, id), true); assert.ok(!('draftText' in saved)); assert.equal(validRecovery({ ...saved, sourceText: 'x'.repeat(50001) }, id), false);
  assert.equal(restoreEdits(saved, { ...work, clientId: id, draftText: 'Keep canonical' }).draftText, 'Keep canonical');
});
