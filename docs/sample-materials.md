# Optional synthetic test materials

These five small files describe the same authored, fictional case. They contain no customer material, tenant details, contact information, identity records, bank/tax records or credentials. Every format retains the label **SYNTHETIC TEST / NOT A REAL CASE** inside its case reference.

The product still starts empty. Downloading a sample does not populate a case, send anything to an AI provider or replace a failed provider request. A tester chooses a file, imports it and reviews the result explicitly. The files are import practice materials, not official forms, accepted agency templates, agency records or evidence of a completed customer pilot.

## Files

The running app exposes these exact paths as attachment downloads. Repository links below open the corresponding source files.

| Format | Repository file | App download path | Bytes |
| --- | --- | --- | ---: |
| UTF-8 TXT | [Text sample](../public/samples/nestlet-synthetic-case.txt) | `/samples/nestlet-synthetic-case.txt` | 470 |
| CSV | [CSV sample](../public/samples/nestlet-synthetic-case.csv) | `/samples/nestlet-synthetic-case.csv` | 195 |
| Text PDF | [PDF sample](../public/samples/nestlet-synthetic-case.pdf) | `/samples/nestlet-synthetic-case.pdf` | 43,936 |
| XLSX | [Excel sample](../public/samples/nestlet-synthetic-case.xlsx) | `/samples/nestlet-synthetic-case.xlsx` | 3,910 |
| Excel 97-2003 XLS | [Legacy Excel sample](../public/samples/nestlet-synthetic-case.xls) | `/samples/nestlet-synthetic-case.xls` | 4,096 |

The static download allowlist contains only these five sample files. It does not publish source fixtures, directory listings or arbitrary files.

## Expected review result

These are an answer key for a human reviewer, not a fabricated AI response. A live extraction can fail or need correction. No sample is automatically confirmed.

| Field | Source value | Expected reviewed value |
| --- | --- | --- |
| Property | `128 Example Lane, Unit B (fictional)` | Same text |
| Owner | `Example Property LLC (fictional)` | Same text |
| Housing authority / PHA | `Not confirmed` | Blank / unknown; do not invent an agency |
| Case reference | `SYNTHETIC TEST / NOT A REAL CASE / DEMO-104` | Same text, including the warning |
| Proposed rent | `$2,100 per month` | Same text; this is not approved rent |

All five fields require explicit human review. An unknown PHA can be reviewed while left blank; generated drafts must retain a visible placeholder. Nothing here establishes receipt, submission, inspection, eligibility, rent approval or program acceptance. Do not send or submit the sample or its generated draft.

## Import steps

1. Start a new empty case and download one format.
2. Choose that file using the ordinary file-import control.
3. For TXT, CSV and PDF, inspect the resulting source text. AI extraction is a separate, explicitly consented request to the configured `deepseek-flash` service. Missing configuration or a provider failure remains visible. Use the explicit manual-review option if that is the workflow being tested; it is not a substitute AI success.
4. For XLSX or XLS, choose sheet **Synthetic case**, data **row 2**, then map A → property, B → owner, C → PHA, D → case reference and E → proposed rent. Mapping produces unconfirmed review fields directly. It does not require an AI response.
5. Compare the five fields with the answer key. Leave the unknown PHA blank, confirm each field yourself, then create and review a supported English draft.

### CSV contract

CSV contains exactly this header and one case row:

```csv
property,owner,pha,caseReference,rent
"128 Example Lane, Unit B (fictional)","Example Property LLC (fictional)","Not confirmed","SYNTHETIC TEST / NOT A REAL CASE / DEMO-104","$2,100 per month"
```

The warning is part of the case reference because the parser expects those exact five headers and one data row. Do not add a free-form title row, extra columns or another case. Quoting preserves the commas in the property and rent values. CSV import does not restore prior review confirmation or agency status.

### Workbook contract

Both workbooks contain one visible sheet, **Synthetic case**, with headers in A1:E1 and one case in A2:E2. There are no formulas, macros, hyperlinks, external links, merged cells or hidden rows/columns. Rent is the numeric value `2100`, formatted to display `$2,100 per month`; the parser and mapping preserve that displayed value. PHA is the text `Not confirmed`, which mapping keeps as a blank/unknown reviewed value.

## Actual limits and data handling

- TXT/CSV file selection accepts UTF-8 files up to 50,000 bytes. Source text is limited to 50,000 characters. A multibyte file can reach the byte limit earlier. CSV also requires the fixed one-case schema above.
- PDF accepts up to 5 MiB and 50,000 extracted characters. It needs the local Poppler `pdftotext` dependency. This sample has selectable text; scanned/image-only, encrypted or corrupt PDFs are unsupported. There is no OCR. Review extracted reading order against the original.
- XLSX/XLS accepts up to 5 MiB. The real isolated workbook parser previews up to 12 sheets, the first 200 rows and 50 columns per sheet, with additional resource/text limits. Excessive sheets or resource use are rejected; oversized row/column previews are visibly truncated. Formula results, links, hidden cells and merged cells cannot be imported. Macros do not run and external links are not followed.
- TXT/CSV parsing occurs in the browser. PDF and workbook bytes go to the application's backend for parsing after the required sign-in and consent. Raw binary imports are not retained. Sending extracted text to DeepSeek is a separate action with its own explicit consent.
- Saving a case is optional and explicit. Saved source text, fields and drafts are stored under the signed-in user according to the [SQLite storage contract](sqlite-runtime.md). Downloading/importing these samples does not change that retention behavior.

## Observed verification, October 7, 2026

- TXT decoded with the same fatal UTF-8 `TextDecoder` policy used by the app; byte/text bounds checked.
- CSV passed the actual `parseCSV` function, with exact header, exactly one record and quoted-comma handling verified.
- PDF parsed successfully with the real installed `pdftotext`; all five source values were present. The single page was rendered and visually checked. Embedded fonts avoid dependence on the PDF viewer's substitute fonts.
- Both XLSX and genuine BIFF8/CFB XLS passed the actual `workbook-worker.js`. Their parsed rows matched exactly, with one visible sheet, no blocked cells and no truncation. Actual `mapSpreadsheetRow` checks verified A2:E2 source-cell references and the unknown-PHA behavior.
- The deterministic label helper was used only as a test assertion for TXT/CSV/PDF source labels, not as an AI response or product fallback. Review gating rejected unconfirmed fields; after explicit test confirmations, a status-summary draft retained the unknown-PHA placeholder and proposed-rent warning.
- XLSX was authored with the installed Artifact Tool. The legacy XLS was a format-only conversion through the already-installed SheetJS dependency; formatted values were compared before and after conversion. The XLSX sheet was rendered and visually checked. Native desktop Excel rendering was not tested.
- A real local HTTP server returned all five downloads with exact on-disk bytes, expected MIME types, attachment filenames and `nosniff`. Unknown, query-modified, directory, traversal, server-source and test-fixture paths returned 404. Authenticated sample PDF/XLSX/XLS uploads passed the actual HTTP parser routes, with unconfirmed workbook mappings checked again.
- `npm run check` and the then-current `npm test` suite passed: 132 tests, no failures or skips. These results apply to the checked local snapshot; rerun after integration changes.
- No live provider request, real case, government submission, agency acceptance, production readiness or customer-pilot result is established by these checks. Browser and deployed-release checks are separate release evidence.

### File integrity

| File extension | SHA-256 |
| --- | --- |
| TXT | `af662f005a6a05d4155612c464c3d48d1adab44c3ee3db1ed011e11c225c9f35` |
| CSV | `830db1853880e3e3ac74e8dec99f18b250af2f238e0b65dd9059a508d23d2615` |
| PDF | `1354cfb277b55bc69d8b6dd5de459a972e09de3326e83131fc7292c809f1d3e7` |
| XLSX | `a4842c0af9a8418415ca77ff189c49e7aef7d6722f6822f8db134fa2e5af9e43` |
| XLS | `6676c87954898e46e357e80e2c3ce02df82af56f75d49e36096db5c262bf2725` |
