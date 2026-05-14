import { createFileRoute } from "@tanstack/react-router";
import { Icon, ICON_NAMES } from "@oh-writers/ui";

export const Route = createFileRoute("/dev/tokens")({
  component: TokensPlayground,
});

const RAW_LINEN = [
  "--ds-linen-50",
  "--ds-linen-100",
  "--ds-linen-200",
  "--ds-linen-300",
  "--ds-linen-400",
  "--ds-linen-500",
  "--ds-linen-600",
  "--ds-linen-700",
  "--ds-linen-800",
];
const RAW_BRAND = [
  "--ds-white",
  "--ds-clay-50",
  "--ds-clay-500",
  "--ds-clay-600",
  "--ds-leaf-50",
  "--ds-leaf-500",
];
const RAW_CAT = [
  "--ds-cat-cast",
  "--ds-cat-crew",
  "--ds-cat-locations",
  "--ds-cat-vehicles",
  "--ds-cat-scenografia",
  "--ds-cat-costumi",
  "--ds-cat-fotografia",
  "--ds-cat-suono",
  "--ds-cat-vfx",
  "--ds-cat-comparse",
];
const SEMANTIC = [
  "--ds-bg",
  "--ds-surface",
  "--ds-surface-alt",
  "--ds-surface-deep",
  "--ds-text",
  "--ds-text-2",
  "--ds-text-3",
  "--ds-text-mute",
  "--ds-text-faint",
  "--ds-line",
  "--ds-line-soft",
  "--ds-action",
  "--ds-action-hover",
  "--ds-action-soft",
  "--ds-agent",
  "--ds-agent-soft",
];

function Swatch({ token }: { token: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 8,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          background: `var(${token})`,
          border: "1px solid var(--ds-line)",
        }}
      />
      <code
        style={{
          fontFamily: "var(--ds-font-mono)",
          fontSize: 11,
          color: "var(--ds-text-2)",
        }}
      >
        {token}
      </code>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2
      style={{
        fontFamily: "var(--ds-font-mono)",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--ds-text-3)",
        margin: "32px 0 12px",
      }}
    >
      {children}
    </h2>
  );
}

function TokensPlayground() {
  return (
    <div
      style={{
        background: "var(--ds-bg)",
        color: "var(--ds-text)",
        fontFamily: "var(--ds-font-sans)",
        minHeight: "100vh",
        padding: "48px 64px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--ds-font-display)",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 48,
          margin: "0 0 8px",
          letterSpacing: "-0.02em",
        }}
      >
        DS-v2 token inspector
      </h1>
      <p
        style={{
          fontFamily: "var(--ds-font-mono)",
          fontSize: 11,
          color: "var(--ds-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 48,
        }}
      >
        Tema attivo: linen (default) &middot;{" "}
        <button
          onClick={() => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === "dark" ? "" : "dark";
          }}
          style={{
            background: "var(--ds-action)",
            color: "var(--ds-text-on-dark)",
            border: 0,
            padding: "4px 10px",
            borderRadius: 4,
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Switch theme
        </button>
      </p>

      <SectionLabel>Layer 1 · Linen scale</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
        }}
      >
        {RAW_LINEN.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <SectionLabel>Layer 1 · Brand</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
        }}
      >
        {RAW_BRAND.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <SectionLabel>Layer 1 · Categorie</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
        }}
      >
        {RAW_CAT.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <SectionLabel>Layer 2 · Semantic</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
        }}
      >
        {SEMANTIC.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <SectionLabel>Typography</SectionLabel>
      <div
        style={{
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-line)",
          borderRadius: 8,
          padding: 32,
        }}
      >
        <div
          style={{
            fontFamily: "var(--ds-font-display)",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 48,
            marginBottom: 16,
          }}
        >
          Fraunces italic · display
        </div>
        <div
          style={{ fontFamily: "var(--ds-font-sans)", fontSize: 14, marginBottom: 8 }}
        >
          Inter · UI body text — qui vive il 90% del testo dell&apos;app.
        </div>
        <div
          style={{
            fontFamily: "var(--ds-font-mono)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ds-text-3)",
            marginBottom: 8,
          }}
        >
          IBM Plex Mono · LABEL &amp; NUMERI
        </div>
        <div
          style={{
            fontFamily: "var(--ds-font-script)",
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          SC. 3 INT. PIZZERIA SOTTOSCALA — Sera
        </div>
      </div>

      <SectionLabel>Icons</SectionLabel>
      <div
        style={{
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-line)",
          borderRadius: 8,
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 16,
        }}
      >
        {ICON_NAMES.map((name) => (
          <div
            key={name}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              color: "var(--ds-text-2)",
            }}
          >
            <Icon name={name} size={20} />
            <code
              style={{
                fontFamily: "var(--ds-font-mono)",
                fontSize: 9,
                color: "var(--ds-text-mute)",
              }}
            >
              {name}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
