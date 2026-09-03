// packages/ui/src/brand/BrandAssets.tsx
//
// The cursor-based brand system (#134):the "O" ink-circle monogram is retired.
// - BrandWordmark: `oh-` (Fraunces 600) + clay cursor bar + `writers`
//   (Fraunces italic 400), ink-on-transparent — for light surfaces (rail,
//   auth pages, splash). Matches `oh-writers-wordmark-ink.svg`.
// - BrandBadge: 56x56 ink rounded square with `oh` (Fraunces italic 600) +
//   clay cursor bar — the compact mark (collapsed rail, avatar). Matches
//   `oh-writers-badge.svg`.
// Both rely on Fraunces (loaded app-wide), falling back to Georgia/serif —
// the same fallback the exported SVGs prescribe. Pure inline SVG: no external
// asset requests, so they render offline and stay trivially testable.

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 380 70"
      focusable="false"
      data-testid="brand-wordmark"
    >
      <text
        x="0"
        y="52"
        fontFamily="Fraunces, Georgia, serif"
        fontWeight="600"
        fontSize="48"
        fill="#1c1a17"
      >
        oh-
      </text>
      <rect x="96" y="14" width="6" height="42" fill="#8b3a1a" />
      <text
        x="118"
        y="52"
        fontFamily="Fraunces, Georgia, serif"
        fontStyle="italic"
        fontWeight="400"
        fontSize="48"
        fill="#1c1a17"
      >
        writers
      </text>
    </svg>
  );
}

export function BrandBadge({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 56"
      focusable="false"
      data-testid="brand-badge"
    >
      <rect width="56" height="56" rx="14" fill="#1c1a17" />
      <text
        x="12"
        y="36"
        fontFamily="Fraunces, Georgia, serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="22"
        fill="#f5f3ee"
      >
        oh
      </text>
      <rect x="40" y="17" width="4" height="22" fill="#8b3a1a" />
    </svg>
  );
}
