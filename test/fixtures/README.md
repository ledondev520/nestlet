# Synthetic PDF fixtures

All documents contain synthetic demonstration text only. The encrypted fixture uses a public test-only password (`synthetic-test-password`), never a real credential.

- `text.pdf`: six English source lines; expected nonblank extraction lines are in `expected.txt`
- `blank.pdf`: a vector rectangle, no selectable text; exercises the no-OCR failure path
- `encrypted.pdf`: AES-256 password-protected copy of the text fixture
- `large-text.pdf`: forty pages of synthetic text, exceeding the 50,000-character extraction limit
- `generate.py`: reproducible generator using ReportLab and pypdf; writes into `/tmp/nestlet-pdf-fixtures`

The HTTP tests invoke the real installed `pdftotext` executable. When it is unavailable, they explicitly report skipped PDF extraction coverage after verifying the API reports `PDF_UNAVAILABLE`; they do not replace the parser with a fake. No provider request is involved in PDF tests.
