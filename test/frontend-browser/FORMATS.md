# Real file-format acceptance slice

Prepared separately from the accepted homepage build `92dc3a8302520d87893dc425effa3b410b653eb4`. Existing homepage workflow, configuration, product source, package manifests, and lockfile are unchanged by this slice.

## Requirements and commands

The supported browser environment must have actual Poppler `pdftotext`, Node 24, the locked SheetJS and Playwright packages, and the matching official Chromium. The integrated browser workflow explicitly installs `poppler-utils` before running this PDF gate. Do not silently skip PDF checks or replace the parser.

```sh
npm run build
node test/frontend-browser/formats-fixture.check.mjs
NESTLET_BROWSER_ENTRY_PATH=/ npm run test:browser:frontend -- formats.spec.js
```

The HTTP check and test discovery do not execute Chromium. Only a successful actual browser run establishes browser acceptance.

## What is tested

- The existing public synthetic CSV, text PDF, modern XLSX, and legacy XLS are selected through the real materials UI and sent to the real backend
- CSV quoted-value handling and explicit-label organization preserve an unknown housing authority rather than inventing one
- Poppler-parsed PDF text is appended without replacing prior operator input
- Actual SheetJS worksheet/row previews precede human column mapping; duplicate columns are rejected without changing source text; mapped facts retain cell provenance and remain unconfirmed
- XLSX formula/hyperlink/merged cells and the hidden sheet are blocked; legacy XLS verifies the retained hyperlink/merge/hidden-sheet metadata. Its fixture writer drops formula metadata, so that cell is a literal and is not claimed as a legacy formula test
- All seven valid originals are browser-downloaded and compared by SHA-256 and exact bytes, including again after case save, full reload, and reopen
- A real PNG is decoded locally for chat preview through the file chooser and can be removed; corrupt PNG bytes produce an error while preserving unsent text
- A privately saved PNG honestly reports unavailable OCR/text and adds no invented source text
- Malformed CSV/PDF produce real server errors and no saved phantom original; prior page input remains
- Actual parser requests without document-consent headers are rejected. File selection alone does not privately upload. AI consent remains unchecked and no model requests occur
- No workbook hyperlinks are followed. Strict CSP and uncaught browser-error checks remain active

All inputs are public synthetic fixtures. The one additional ordinary account brings the existing full suite to its real five-registration budget; retries remain disabled. Screenshots use the same synthetic evidence labelling as the existing suite.

No API/parse/provider success is mocked. OS clipboard paste, drag/drop fidelity, OCR, model image understanding, live extraction, production records, and production deployment are not established here. The image check uses an actual file chooser rather than a fabricated clipboard event.
