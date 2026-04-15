# Screenplay text fixtures

Each `.txt` file is **raw extracted text** simulating what `pdf-parse` emits
from a screenplay PDF. These fixtures feed the `fountainFromPdf` unit tests.

They are deliberately messy (trailing spaces, mixed dashes, revision marks,
page headers) so the parser is exercised on realistic PDF artefacts — not on
clean fountain. Keep them that way.

## Files

| File                          | Covers                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `01-minimal.txt`              | smoke test — one scene, one character, one dialogue                                             |
| `02-first-draft-clean.txt`    | Final Draft / Fade In spec-script export, no revisions, no scene numbers                        |
| `03-shooting-script.txt`      | scene numbers both sides, OMITTED scenes, INSERT PHOTO, revision asterisks, Buff Revised header |
| `04-italian-short.txt`        | Italian conventions (INT./EST.), accented characters                                            |
| `05-character-extensions.txt` | `NAME`, `NAME (V.O.)`, `NAME (V.O.) (CONT'D)`, `CLIENT #1 (O.S.)`                               |
| `06-wolf-page-1.txt`          | regression — real Wolf of Wall Street page 1 text                                               |
| `07-transitions.txt`          | `CUT TO:`, `FADE IN:`, `DISSOLVE TO:`, `SMASH CUT TO:`, `FADE OUT.`                             |
| `08-continueds.txt`           | page-break artefacts: `(MORE)` at bottom, `(CONT'D)` at top                                     |

## How to add a new fixture

1. Copy the raw text (from a real PDF or hand-written) into a new `.txt`
2. Use the naming `NN-short-description.txt`
3. Add a row to the table above
4. Add the matching assertions in `fountain-from-pdf.test.ts`
