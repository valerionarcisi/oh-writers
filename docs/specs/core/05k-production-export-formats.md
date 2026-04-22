# Spec 05k — Production export formats

> **Status:** to do
> **Depends on:** Spec 05 (Screenplay editor), Spec 07c (Title page in fountain)
> **Date:** 2026-04-22

## Goal

Trasformare l'attuale singolo Export PDF in un **menu Export** con quattro formati industry-standard, perché ogni reparto della produzione lavora su un PDF diverso dello stesso copione:

| Formato                | Quando si usa                                                      | Chi lo usa                     |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------ |
| **Sides**              | Sul set, ogni mattina: solo le scene del giorno, dialoghi pronti   | Attori, AD, regista            |
| **AD copy**            | Pre-produzione: ampio margine destro per appunti di spoglio a mano | Aiuto regista, production team |
| **Reading copy**       | Distribuzione del copione a lettori esterni: doppia interlinea     | Studio readers, agenti, attori |
| **One scene per page** | Riscritture, planning produttivo: ogni scena su una pagina nuova   | Sceneggiatore, produttore      |

Sono trasformazioni **dello stesso fountain** — non quattro formati nativi separati. La pipeline esistente (`buildScreenplayPdf` con afterwriting CLI) resta intatta; aggiungiamo un layer di pre-processing che riscrive il fountain prima del rendering.

## Non-goals (Spec 05k)

- Niente "shooting script" con scene numbers locked + revision colors — è già coperto da Spec 20 (shooting script import) + Spec 07b.
- Niente DOOD per generare gli Sides automaticamente da un day-of-shoot — sarà nello Spec 12 (Schedule).
- Niente Spagnolo/Francese/Tedesco — i 4 formati partono dall'industria americana ma sono universali.
- Niente watermark, niente "draft / final" stamp — coperti da Spec 07b.
- Niente export DOCX o Final Draft `.fdx` — restano outside scope finché un utente reale lo chiede.

## I 4 formati nel dettaglio

### 1. Sides

Solo un sottoinsieme di scene, formato pronto-da-portare-sul-set.

- **Filtro scene**: l'utente sceglie quali scene includere via multi-select sui `scene number`. Default: nessuna selezione (l'utente DEVE scegliere).
- **Header pagina ridotto**: solo titolo progetto + data odierna (no scene-numbers in header).
- **Scene numbers visibili in margine** (dx + sx) — convenzione US.
- **Niente cover page** (mai).
- **Mini formato opzionale (US half-letter, 5.5×8.5")**: futuro, non v1.

Implementazione: `extractScenesFromFountain(fountain, sceneNumbers[])` ritaglia il fountain mantenendo solo le scene selezionate (heading + body + transitions interne). I `Title:` / `Credit:` etc del title page si scartano.

### 2. AD copy

Margine destro **molto ampio** per appunti a mano del primo aiuto regista.

- Margine destro 4cm (vs 2.5cm standard) → larghezza dialogo invariata (l'azione si stringe).
- Scene numbers visibili sx + dx (US convention).
- Header con titolo + revision marker.
- Numerazione pagine `1.`, `1A.`, `2.` come da spec 07b.

Implementazione: nuovo CSS theme passato ad afterwriting via flag `--config <path>` con `print_profile.right_margin = 4` (afterwriting supporta override via JSON config).

### 3. Reading copy

Doppia interlinea per facilitare la lettura veloce di un reader esterno.

- Line-height `2.0` (vs 1.0 standard).
- Pagine moltiplicano (~doppie del normale).
- Scene numbers nascosti (un reader non li usa).
- Cover page **sempre inclusa**.

Implementazione: afterwriting `print_profile.line_spacing = 2.0`.

### 4. One scene per page

Ogni scena inizia su una pagina nuova, anche se è di poche righe.

- Inserisce un Fountain `===` (page break) prima di ogni scene heading (escluso il primo).
- Scene numbers visibili.
- Margini standard.
- Cover page opzionale (default sì).

Implementazione: `insertPageBreaksBetweenScenes(fountain)` — operazione puramente testuale sul fountain.

## Architecture

### Domain (`packages/domain/src/screenplay/`)

Nuovo file `export-formats.ts`:

```ts
export const EXPORT_FORMATS = [
  "standard", // current behavior, kept as default
  "sides",
  "ad_copy",
  "reading_copy",
  "one_scene_per_page",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportFormatMeta {
  id: ExportFormat;
  labelIt: string;
  labelEn: string;
  description: string; // 1 line, used as menu item subtitle
  requiresSceneSelection: boolean; // true only for "sides"
}

export const EXPORT_FORMAT_META: Record<ExportFormat, ExportFormatMeta> = {
  standard: { ..., requiresSceneSelection: false },
  sides:    { ..., requiresSceneSelection: true  },
  ad_copy:  { ..., requiresSceneSelection: false },
  reading_copy: { ..., requiresSceneSelection: false },
  one_scene_per_page: { ..., requiresSceneSelection: false },
};
```

### Server (`features/screenplay-editor/server/screenplay-export.server.ts`)

Estendi `ExportScreenplayPdfInput`:

```ts
export const ExportScreenplayPdfInput = z.object({
  screenplayId: z.string().uuid(),
  includeCoverPage: z.boolean().default(false),
  format: ExportFormatSchema.default("standard"),
  sceneNumbers: z.array(z.string()).optional(), // required iff format = "sides"
});
```

Dopo aver caricato il fountain, applica una pipeline di trasformazione:

```ts
// features/screenplay-editor/lib/export-pipeline.ts
type Pipeline = (fountain: string, opts: PipelineOpts) => string;

const STANDARD: Pipeline = (f) => f;
const SIDES: Pipeline = (f, { sceneNumbers }) =>
  extractScenesFromFountain(f, sceneNumbers);
const AD_COPY: Pipeline = (f) => f; // theme handled by afterwriting config
const READING_COPY: Pipeline = (f) => f;
const ONE_SCENE_PER_PAGE: Pipeline = insertPageBreaksBetweenScenes;

const PIPELINES: Record<ExportFormat, Pipeline> = { ... };
```

`buildScreenplayPdf` accetta un secondo argomento `afterwritingConfig?: object` da scrivere in un file tmp e passare via `--config` alla CLI.

### UI

**`packages/ui/src/components/DropdownMenu.tsx`** — `[NEW DS]`

Atomo nuovo, perché `ContextMenu` è anchor-based (right-click). `DropdownMenu` ha un trigger button + items list + chiude su outside-click / ESC, posizionata `popover-anchor` sotto al trigger.

API minima:

```ts
interface DropdownMenuItem {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
}
interface DropdownMenuProps {
  trigger: ReactNode; // a button or arbitrary element
  items: DropdownMenuItem[];
  align?: "start" | "end";
  "data-testid"?: string;
}
```

**`features/screenplay-editor/components/ScreenplayToolbar.tsx`**

Sostituisci il single Export button con un `<DropdownMenu>`:

```tsx
<DropdownMenu
  trigger={<Button variant="ghost">Export ▾</Button>}
  items={EXPORT_FORMATS.map((f) => ({
    id: f,
    label: EXPORT_FORMAT_META[f].labelIt,
    description: EXPORT_FORMAT_META[f].description,
    onSelect: () => openExportModal(f),
  }))}
  data-testid="screenplay-export-menu"
/>
```

**`features/screenplay-editor/components/ExportScreenplayPdfModal.tsx`**

Adatta il modal esistente:

- Riceve `format: ExportFormat` come prop.
- Mostra titolo del modal `Export — {labelIt}`.
- Se `format === "sides"` → mostra una scene-multi-select (lista scene heading con checkbox) + il bottone Genera è disabilitato finché non c'è almeno 1 scena selezionata.
- Per gli altri format → toggle `includeCoverPage` (preset corretto per format) + bottone Genera.

## Tests

### Unit (Vitest)

- `lib/export-pipeline.test.ts`
  - `STANDARD` ritorna fountain invariato.
  - `SIDES`: dato un fountain con 5 scene, estrae solo le scene `[2, 4]` con heading e body integri; nessun residuo delle altre.
  - `ONE_SCENE_PER_PAGE`: inserisce esattamente N-1 page break per N scene; non duplica se già presente.
  - `AD_COPY`/`READING_COPY` no-op a livello fountain (verificato a livello config separatamente).
- `lib/extract-scenes-from-fountain.test.ts`
  - Heading riconosciuti (INT./EST./INT/EXT/I/E/INT-EST).
  - Page break tra scene preservato.
  - Title page rimosso.
- `domain/screenplay/export-formats.test.ts`
  - `EXPORT_FORMAT_META` ha entry per ogni formato.
  - `requiresSceneSelection` true solo per `sides`.

### Server (Vitest)

- `screenplay-export.server.test.ts`
  - `format: "sides"` senza `sceneNumbers` → ValidationError.
  - `format: "standard"` con `sceneNumbers` → ignorato (non causa errori).
  - Output Buffer non vuoto per ogni format con fountain di test.

### E2E (Playwright)

`tests/screenplay-editor/export-formats.spec.ts`:

- `[OHW-310]` Menu Export apre dropdown con 5 voci (incluso "Standard").
- `[OHW-311]` Click "Sides" → modal mostra lista scene con checkbox; bottone disabilitato finché 0 selezionate.
- `[OHW-312]` Sides con 2 scene selezionate → download PDF (`expect(download).toBeTruthy()`).
- `[OHW-313]` AD copy → download PDF; nome file contiene `ad-copy`.
- `[OHW-314]` Reading copy → download PDF; nome file contiene `reading`.
- `[OHW-315]` One scene per page → download PDF; nome file contiene `scene-per-page`.

Nessun visual diff (afterwriting è deterministic ma il PDF binario non è stable byte-per-byte). Test verificano: download arriva, nome file corretto, status 200, MIME `application/pdf`.

## File naming

```
{project-slug}-{screenplay-slug}-{format-slug}-{YYYY-MM-DD}.pdf
```

- `format-slug`: `standard` (omesso), `sides`, `ad-copy`, `reading`, `scene-per-page`.

## Migration & rollout

- Nessuna migrazione DB.
- Nessun breaking change all'API: `format` ha default `"standard"`, `sceneNumbers` opzionale → chiamate esistenti continuano a funzionare.
- Rollout single PR: domain → server → DS atom → toolbar → modal → tests.

## Out of scope

- DOOD-driven Sides (auto-pick delle scene del giorno X) → Spec 12.
- Watermark / "DRAFT" stamp → Spec 07b.
- Export DOCX / FDX → spec separato se richiesto.
- PWA-friendly download (al momento: download diretto via `<a>` con base64).

## Prerequisites

- `[NEW DS]` `DropdownMenu` atom in `packages/ui/src/components/`.
- `[EXISTING DS]` `Button`, `Dialog`, `FormField`, `Input` (per scene-multi-select via checkbox grid).
