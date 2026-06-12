# BUG-N63 PDF export proof

Generated through `serializeScreenplayExport` and `buildScreenplayPdf` with
afterwriting 1.17.3.

- `title-page.png`: author and contact fields render from `titlePageDoc`.
- `screenplay-page.png`: dialogue is preserved and scene headings/numbers are bold.
- `n63-export-proof.pdf`: two-page source PDF used for visual inspection.
- `n63-export-proof.fountain`: serialized Fountain passed to the PDF renderer.

Visual inspection completed on 2026-06-12. `pdftotext -layout` also confirmed both
dialogue blocks and all title-page fields are present.
