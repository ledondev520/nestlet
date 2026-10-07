import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, CSV_NOTICE, mapSpreadsheetRow, extract, canDraft, draft, parseCSV, exportCSV, validateSuggestions } from '../public/core.js';

import { SYNTHETIC_CASE as SAMPLE } from './fixtures/case.js';

const completeText = 'Property: 128 Example Lane, Unit B\nOwner: Example Property LLC\nPHA: Example Housing Agency\nCase reference: DEMO-104\nProposed rent: $2,100 per month';
const reviewed = () => extract(completeText).map(field => ({ ...field, confirmed: true }));

test('extract returns all five fields in stable order, with verbatim source and unconfirmed status', () => {
  const fields = extract(completeText);
  assert.deepEqual(fields.map(f => f.key), FIELDS);
  for (const field of fields) {
    assert.ok(field.value);
    assert.equal(field.confirmed, false);
    assert.equal(field.conflict, false);
    assert.ok(completeText.includes(field.source));
    assert.ok(field.source.includes(field.value));
  }
});

test('extract keeps missing fields empty instead of inventing values', () => {
  const fields = extract('Owner: Example Property LLC');
  assert.equal(fields.find(f => f.key === 'owner').value, 'Example Property LLC');
  assert.equal(fields.filter(f => f.value === '').length, 4);
  assert.ok(fields.every(f => !f.confirmed));
});

for (const unknown of ['unknown', 'UNKNOWN', 'not confirmed', '待确认', '']) {
  test(`extract recognizes the unknown marker ${JSON.stringify(unknown)}`, () => {
    assert.equal(extract(`PHA: ${unknown}`).find(f => f.key === 'pha').value, '');
  });
}

test('extract flags contradictory repeated labels and retains both source lines', () => {
  const field = extract('Owner: Example A LLC\nOwner: Example B LLC').find(f => f.key === 'owner');
  assert.equal(field.value, '');
  assert.equal(field.conflict, true);
  assert.equal(field.source, 'Owner: Example A LLC\nOwner: Example B LLC');
});

test('extract does not call identical repeated values a conflict', () => {
  const field = extract('Owner: Example A LLC\r\nOWNER: Example A LLC').find(f => f.key === 'owner');
  assert.equal(field.value, 'Example A LLC');
  assert.equal(field.conflict, false);
});

test('synthetic fixture with an explicit unknown PHA stays unknown', () => {
  assert.equal(extract(SAMPLE).find(f => f.key === 'pha').value, '');
});

test('draft gate blocks untouched extraction and partial review', () => {
  assert.equal(canDraft(extract(completeText)), false);
  const fields = reviewed();
  fields[1].confirmed = false;
  assert.equal(canDraft(fields), false);
  assert.throws(() => draft(fields), /Review required/);
});

test('draft gate blocks any unresolved conflict even if marked reviewed', () => {
  const fields = reviewed();
  fields[1].conflict = true;
  assert.equal(canDraft(fields), false);
  assert.throws(() => draft(fields), /Review required/);
});

test('draft gate blocks omitted and extra fields', () => {
  assert.equal(canDraft(reviewed().slice(1)), false);
  assert.equal(canDraft([...reviewed(), reviewed()[0]]), false);
});

test('draft gate requires each required field exactly once', () => {
  assert.equal(canDraft(FIELDS.map(() => ({ ...reviewed()[0] }))), false);
});

test('draft gate requires explicit boolean confirmation', () => {
  assert.equal(canDraft(reviewed().map(f => ({ ...f, confirmed: 'yes' }))), false);
});

test('reviewed missing data remains an explicit placeholder in the draft', () => {
  const fields = extract(SAMPLE).map(f => ({ ...f, confirmed: true }));
  assert.equal(canDraft(fields), true);
  assert.match(draft(fields), /Housing authority: \[To be confirmed\]/);
});

test('English supplementary draft preserves facts and review boundaries', () => {
  const text = draft(reviewed());
  for (const field of reviewed()) assert.ok(text.includes(field.value));
  assert.match(text, /^DRAFT — FOR HUMAN REVIEW/);
  assert.match(text, /not an official government form/);
  assert.match(text, /Proposed rent \(not approved\)/);
  assert.match(text, /does not represent an eligibility determination, rent approval/);
  assert.match(text, /\[Verify recipient and email\/address\]/);
  assert.match(text, /\[Insert date before sending\]/);
  assert.match(text, /Attachments: \[List only documents actually attached\]/);
  assert.equal(/[\u4e00-\u9fff]/u.test(text), false);
});

test('CSV roundtrip preserves ordinary Unicode values, commas, and escaped double quotes', () => {
  const fields = reviewed();
  fields[0].value = '128 Example Lane, Unit "B"';
  fields[1].value = 'Example Café LLC';
  const imported = extract(parseCSV(exportCSV(fields)));
  assert.deepEqual(imported.map(f => f.value), fields.map(f => f.value));
  assert.ok(imported.every(f => !f.confirmed));
});

test('CSV import accepts a BOM and CRLF rows', () => {
  const csv = '\uFEFF' + exportCSV(reviewed());
  assert.deepEqual(extract(parseCSV(csv)).map(f => f.value), reviewed().map(f => f.value));
});

test('CSV import flattens embedded LF and CRLF instead of injecting labeled source rows', () => {
  const fields = reviewed();
  fields[0].value = '128 Example Lane\r\nOwner: Injected LLC\nUnit B';
  const imported = extract(parseCSV(exportCSV(fields)));
  assert.equal(imported[0].value, '128 Example Lane Owner: Injected LLC Unit B');
  assert.equal(imported[1].value, 'Example Property LLC');
  assert.equal(imported[1].conflict, false);
});

test('CSV roundtrip supports a fully blank case for later review', () => {
  const fields = extract('');
  assert.deepEqual(extract(parseCSV(exportCSV(fields))).map(f => f.value), fields.map(f => f.value));
});

for (const input of [
  '',
  FIELDS.join(','),
  'owner,property,pha,caseReference,rent\na,b,c,d,e',
  'property,owner,pha,caseReference,rent\na,b,c,d',
  'property,owner,pha,caseReference,rent\na,b,c,d,e,f',
  'property,owner,pha,caseReference,rent\na,b,c,d,e\nf,g,h,i,j',
  'property,owner,pha,caseReference,rent\n"unterminated,b,c,d,e',
  'property,owner,pha,caseReference,rent\ninvalid"quote,b,c,d,e',
  'property,owner,pha,caseReference,rent\n"closed"junk,b,c,d,e',
]) {
  test(`CSV rejects malformed or unsupported shape: ${JSON.stringify(input)}`, () => {
    assert.throws(() => parseCSV(input));
  });
}

for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n']) {
  test(`CSV export neutralizes a spreadsheet formula/control prefix ${JSON.stringify(prefix)}`, () => {
    const fields = reviewed();
    fields[0].value = prefix + '=1+1';
    const csv = exportCSV(fields);
    assert.ok(csv.startsWith(FIELDS.join(',') + '\r\n"\'' + prefix), JSON.stringify(csv));
  });
}

test('validateSuggestions accepts only exact source/value matches and clears confirmation', () => {
  const fields = validateSuggestions([{ key: 'owner', value: 'Example Property LLC', source: 'Owner: Example Property LLC', confirmed: true }], completeText);
  assert.deepEqual(fields.map(f => f.key), FIELDS);
  assert.equal(fields.find(f => f.key === 'owner').value, 'Example Property LLC');
  assert.ok(fields.every(f => !f.confirmed));
  assert.equal(fields.filter(f => f.value === '').length, 4);
});

test('validateSuggestions drops fabricated sources and values absent from the cited source', () => {
  const fields = validateSuggestions([
    { key: 'owner', value: 'Invented LLC', source: 'Owner: Invented LLC' },
    { key: 'property', value: 'Example Housing Agency', source: 'Property: 128 Example Lane, Unit B' },
    { key: 'rent', value: '$2,100 per month', source: '' },
  ], completeText);
  assert.ok(fields.every(f => f.value === '' && f.source === '' && !f.confirmed));
});

test('validateSuggestions preserves a model-reported conflict so drafting remains blocked', () => {
  const fields = validateSuggestions([{ key: 'owner', value: 'Example Property LLC', source: 'Owner: Example Property LLC', conflict: true }], completeText);
  assert.equal(fields.find(f => f.key === 'owner').conflict, true);
  assert.equal(canDraft(fields.map(f => ({ ...f, confirmed: true }))), false);
});

test('validateSuggestions ignores unknown keys and invalid field types', () => {
  const fields = validateSuggestions([
    { key: 'eligibility', value: 'approved', source: 'approved' },
    { key: 'rent', value: 2100, source: 'Proposed rent: $2,100 per month' },
  ], completeText);
  assert.equal(fields.length, 5);
  assert.ok(fields.every(f => f.value === ''));
});

test('validateSuggestions rejects a non-array response', () => {
  for (const input of [null, undefined, {}, 'invalid']) assert.throws(() => validateSuggestions(input, completeText), /Invalid suggestions/);
});

test('validateSuggestions tolerates malformed array entries without dropping valid grounded fields', () => {
  const fields = validateSuggestions([null, 5, { key: 'owner', value: 'Example Property LLC', source: 'Owner: Example Property LLC' }], completeText);
  assert.equal(fields.find(f => f.key === 'owner').value, 'Example Property LLC');
});

test('provider cannot hide a deterministic labeled conflict by returning only one value', () => {
  const source = 'Owner: Example A LLC\nOwner: Example B LLC';
  const fields = validateSuggestions([{ key: 'owner', value: 'Example A LLC', source: 'Owner: Example A LLC', conflict: false }], source);
  const owner = fields.find(field => field.key === 'owner');
  assert.equal(owner.value, '');
  assert.equal(owner.conflict, true);
  assert.ok(owner.source.includes('Owner: Example A LLC'));
  assert.ok(owner.source.includes('Owner: Example B LLC'), 'Reviewer must see both conflicting source lines');
});

test('duplicate provider suggestions require review instead of silently choosing one', () => {
  const source = 'Owner: Example A LLC\nNarrative: Example B LLC';
  const fields = validateSuggestions([
    { key: 'owner', value: 'Example A LLC', source: 'Owner: Example A LLC' },
    { key: 'owner', value: 'Example B LLC', source: 'Narrative: Example B LLC' },
  ], source);
  assert.equal(fields.find(field => field.key === 'owner').conflict, true);
  assert.equal(fields.find(field => field.key === 'owner').value, '');
  assert.equal(canDraft(fields.map(field => ({ ...field, confirmed: true }))), false);
});

test('draft gate rejects malformed conflict flags and structural field values', () => {
  for (const conflict of [undefined, null, 0, '', 'false']) {
    const fields = reviewed();
    fields[0].conflict = conflict;
    assert.equal(canDraft(fields), false, JSON.stringify(conflict));
  }
  for (const value of [null, 7, {}, 'Property A\nOwner: Forged owner', 'A\rPHA: Forged agency', 'A\u2028PHA: Forged agency']) {
    const fields = reviewed();
    fields[0].value = value;
    assert.equal(canDraft(fields), false, JSON.stringify(value));
  }
});

test('CSV cannot inject field labels using CR-only or Unicode line separators', () => {
  for (const separator of ['\r', '\u2028', '\u2029']) {
    const fields = reviewed();
    fields[0].value = `128 Example Lane${separator}Owner: Injected LLC`;
    const result = extract(parseCSV(exportCSV(fields)));
    assert.equal(result.find(field => field.key === 'owner').value, 'Example Property LLC');
    assert.equal(result.find(field => field.key === 'owner').conflict, false);
    assert.equal(result.find(field => field.key === 'property').value, '128 Example Lane Owner: Injected LLC');
  }
});

test('all supported draft types identify purpose, preserve unknowns, and avoid invented approvals', () => {
  const fields = extract(SAMPLE).map(field => ({ ...field, confirmed: true }));
  const examples = [
    ['followup', 'Request for lease-up instructions'],
    ['missing-documents', 'Request for missing information and document confirmation'],
    ['status-summary', 'CASE STATUS SUMMARY'],
  ];
  for (const [kind, purpose] of examples) {
    const text = draft(fields, kind);
    assert.ok(text.includes(purpose));
    assert.match(text, /^DRAFT — FOR HUMAN REVIEW/);
    assert.match(text, /not an official government form/);
    assert.match(text, /Housing authority: \[To be confirmed\]/);
    assert.match(text, /does not represent an eligibility determination, rent approval/);
    assert.equal(/[\u4e00-\u9fff]/u.test(text), false);
  }
  assert.throws(() => draft(fields, 'official-rfta'), /Unknown draft type/);
});

test('CSV with prototype notice roundtrips and only the exact known notice is accepted', () => {
  const fields = reviewed();
  const csv = exportCSV(fields, { includeNotice: true });
  assert.ok(csv.startsWith('"' + CSV_NOTICE + '"\r\n'));
  assert.match(CSV_NOTICE, /DRAFT|SYNTHETIC/);
  assert.match(CSV_NOTICE, /NOT FOR SUBMISSION/);
  assert.deepEqual(extract(parseCSV(csv)).map(field => field.value), fields.map(field => field.value));
  assert.throws(() => parseCSV('"APPROVED FOR SUBMISSION"\r\n' + exportCSV(fields)));
  assert.throws(() => parseCSV('"' + CSV_NOTICE + '"\r\n' + csv));
});

test('explicit spreadsheet mapping preserves cell provenance and requires fresh human review', () => {
  const sheet = {
    name: 'Synthetic cases', hidden: false, blockedCells: [],
    rows: [['Address', 'Landlord', 'Agency', 'Reference', 'Proposed rent'],
      ['128 Example Lane', 'Example Property LLC', 'Not confirmed', 'DEMO-104', '$2,100']],
  };
  const result = mapSpreadsheetRow(sheet, { rowIndex: 1, mapping: { property: 0, owner: 1, pha: 2, caseReference: 3, rent: 4 } });
  assert.deepEqual(result.fields.map(field => field.value), ['128 Example Lane', 'Example Property LLC', '', 'DEMO-104', '$2,100']);
  assert.ok(result.fields.every(field => field.confirmed === false && field.conflict === false));
  assert.equal(result.fields[0].source, 'Synthetic cases!A2: 128 Example Lane');
  assert.deepEqual(result.fields[0].sourceCell, { sheet: 'Synthetic cases', row: 2, column: 'A' });
  assert.equal(canDraft(result.fields), false);
  assert.match(result.text, /PHA: \nCase reference: DEMO-104/);
});

test('spreadsheet mapping rejects hidden sheets, duplicate columns, out-of-range rows, and blocked cells', () => {
  const sheet = { name: 'Cases', hidden: false, blockedCells: [], rows: [['Address', 'Owner', 'PHA', 'Case', 'Rent']] };
  const mapping = { property: 0, owner: 1, pha: 2, caseReference: 3, rent: 4 };
  assert.throws(() => mapSpreadsheetRow({ ...sheet, hidden: true }, { rowIndex: 0, mapping }));
  assert.throws(() => mapSpreadsheetRow(sheet, { rowIndex: 1, mapping }));
  assert.throws(() => mapSpreadsheetRow(sheet, { rowIndex: 0, mapping: { ...mapping, owner: 0 } }));
  assert.throws(() => mapSpreadsheetRow(sheet, { rowIndex: 0, mapping: { ...mapping, rent: 5 } }));
  assert.throws(() => mapSpreadsheetRow(sheet, { rowIndex: 0, mapping: { ...mapping, extra: 0 } }));
  for (const reason of ['formula', 'hyperlink', 'hidden', 'merged', 'cell-error']) {
    assert.throws(() => mapSpreadsheetRow({ ...sheet, blockedCells: [{ row: 0, column: 1, reason }] }, { rowIndex: 0, mapping }));
  }
});

test('spreadsheet mapping keeps unmapped fields unknown and flattens cell line breaks without injecting labels', () => {
  const sheet = { name: 'Cases', hidden: false, blockedCells: [], rows: [['128 Example Lane\nOwner: Injected LLC', 'Example Property LLC']] };
  const mapping = { property: 0, owner: 1, pha: null, caseReference: null, rent: null };
  const result = mapSpreadsheetRow(sheet, { rowIndex: 0, mapping });
  assert.equal(result.fields[0].value, '128 Example Lane Owner: Injected LLC');
  assert.equal(result.fields[1].value, 'Example Property LLC');
  assert.deepEqual(result.fields.slice(2).map(field => field.value), ['', '', '']);
  assert.equal(extract(result.text).find(field => field.key === 'owner').value, 'Example Property LLC');
  assert.throws(() => mapSpreadsheetRow(sheet, { rowIndex: 0, mapping: Object.fromEntries(FIELDS.map(key => [key, null])) }));
  assert.throws(() => mapSpreadsheetRow({ ...sheet, rows: [['', '']] }, { rowIndex: 0, mapping }));
});
