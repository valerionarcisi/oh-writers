// One-off generator for tests/fixtures/documents/soggetto-sample.docx.
// Run from apps/web (so Node resolves the `docx` package):
//   cd apps/web && node ../../tests/fixtures/documents/generate-docx-fixture.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun } from "docx";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          children: [
            new TextRun(
              "Una restauratrice d'arte scopre un dipinto falso appeso al posto dell'originale in un museo che dirige da vent'anni.",
            ),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun(
              "Denunciarlo significa ammettere di non essersene accorta per mesi. Tacere significa proteggere chi ha commesso il furto.",
            ),
          ],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(path.join(HERE, "soggetto-sample.docx"), buffer);
console.log("Wrote soggetto-sample.docx");
