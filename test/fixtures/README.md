# Synthetic PDF fixtures

All documents contain synthetic demonstration text only. The encrypted fixture uses a public test-only password (`synthetic-test-password`), never a real credential.

- `text.pdf`: six English source lines; expected nonblank extraction lines are in `expected.txt`
- `blank.pdf`: a vector rectangle, no selectable text; exercises the no-OCR failure path
- `encrypted.pdf`: AES-256 password-protected copy of the text fixture
- `large-text.pdf`: forty pages of synthetic text, exceeding the 50,000-character extraction limit
- `generate.py`: reproducible generator using ReportLab and pypdf; writes into `/tmp/nestlet-pdf-fixtures`

The HTTP tests invoke the real installed `pdftotext` executable. When it is unavailable, they explicitly report skipped PDF extraction coverage after verifying the API reports `PDF_UNAVAILABLE`; they do not replace the parser with a fake. No provider request is involved in PDF tests.

## Actual Excel fixtures

- `case.xlsx` and `case.xls`: real OOXML and Excel 97-2003 binaries containing a two-row `Case` sheet. Five expected data cells are asserted as fixed literals in the HTTP tests
- `blocked.xlsx`: ordinary row, formula with a cached value, hyperlink, merged cells, hidden row, and hidden worksheet
- `blocked.xls`: legacy binary counterpart. The writer does not preserve the formula or hidden-row metadata, so tests do not claim those legacy cases are covered. Hyperlinks, merges, and hidden worksheet status are verified

Excel fixtures were generated as actual files during parser development. Acceptance sends their bytes to the real local server and reads actual parser output; no workbook-read function or HTTP response is replaced.

- `limits.xlsx`: actual 202-row, 52-column workbook with column B hidden; preview truncation and hidden-column handling
- `many-sheets.xlsx`: actual 13-sheet workbook; excessive-sheet rejection
- `encrypted.xlsx`: public encrypted test fixture from msoffcrypto-tool, https://raw.githubusercontent.com/nolze/msoffcrypto-tool/master/tests/inputs/example_password.xlsx ; SHA-256 `3f792e3902a615bf0e91771f3f3016b80d59098b8e492efcdc0752748e15b997`. Distributed under the accompanying MIT license `encrypted-workbook-LICENSE.txt`. No decryption or private user information is used
- `encrypted.xls`: public encrypted legacy Excel fixture from https://raw.githubusercontent.com/nolze/msoffcrypto-tool/master/tests/inputs/rc4cryptoapi_password.xls ; SHA-256 `b804cba40c27ea88f2ea994b6b7d75145661532f9356e7246d2499f63d58abfe`, covered by the same accompanying MIT license
