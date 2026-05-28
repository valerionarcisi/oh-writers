# Loading states

Never render a plain-text loader (`<p>Caricamento…</p>`). Every loading state ships a skeleton shimmer that mimics the layout of the content that will replace it.

Use `<Skeleton>` and `<SkeletonCard>` from `@oh-writers/ui`. The primitive handles `aria-busy`, role, animation, and `prefers-reduced-motion` automatically — never re-implement it locally.

```tsx
import { Skeleton, SkeletonCard } from "@oh-writers/ui";

// Inline multi-line — give widths that mirror the real content shape
<Skeleton
  lines={4}
  widths={["80%", "100%", "100%", "65%"]}
  ariaLabel="Caricamento soggetto"
/>;

// Grid of cards (dashboards, lists)
<div className={styles.grid}>
  {Array.from({ length: 6 }).map((_, i) => (
    <SkeletonCard key={i} ariaLabel="Caricamento progetto" />
  ))}
</div>;

// Cesare / agent-related loaders
<Skeleton lines={3} tone="agent" ariaLabel="Caricamento suggerimenti" />;
```

Rules:

- `<Skeleton lines={N} widths={[...]}>` for inline placeholders — widths cycle if shorter than `lines`
- `<SkeletonCard>` for grids that show item cards
- `tone="agent"` when the skeleton stands in for Cesare output
- `ariaLabel` in Italian, matching the UI copy ("Caricamento progetti", "Caricamento scene"…)
- Suspense fallbacks: always render a real skeleton, never `fallback={null}` and never `<p>Caricamento…</p>`
- Mutation pending states on buttons ("Salvataggio…", "Esportazione…") are NOT loaders — leave them as text

The few feature-local skeletons under `CesareSheet.module.css`, `NarrativeCesarePanel.module.css`, and `ScreenplayCesarePanel.module.css` are intentional — they shape the agent reply bubble exactly. Don't replace them with the primitive.
