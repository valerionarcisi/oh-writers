import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Icon,
  ICON_NAMES,
  DsButton,
  Pill,
  ToggleChip,
  SavePill,
  Presence,
  TopBar,
  FloatingDock,
  HeroKPI,
  MarginNote,
  Tooltip,
} from "@oh-writers/ui";

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

function ToggleChipDemo() {
  const [cast, setCast] = useState(true);
  const [locations, setLocations] = useState(false);
  const [props_, setProps] = useState(true);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      <ToggleChip
        isOn={cast}
        onToggle={() => setCast((v) => !v)}
        label="Cast"
        categoryColor="#6b3e7a"
        aria-label="Mostra sottolineature Cast"
      />
      <ToggleChip
        isOn={locations}
        onToggle={() => setLocations((v) => !v)}
        label="Locations"
        categoryColor="#9a5128"
        aria-label="Mostra sottolineature Locations"
      />
      <ToggleChip
        isOn={props_}
        onToggle={() => setProps((v) => !v)}
        label="Props"
        categoryColor="#2c6168"
        aria-label="Mostra sottolineature Props"
      />
    </div>
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
          style={{
            fontFamily: "var(--ds-font-sans)",
            fontSize: 14,
            marginBottom: 8,
          }}
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

      <SectionLabel>Shell</SectionLabel>
      <div
        style={{
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-line)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <TopBar
          projectName="Il Grande Lebowski"
          sectionName="Budget"
          saveState="saved"
          saveSecondsAgo={12}
          cesareNoteCount={3}
          userInitials="VN"
          presenceUsers={[
            { id: "1", name: "Valerio Narcisi", initials: "VN" },
            { id: "2", name: "Sofia Romani", initials: "SR" },
          ]}
          onSearch={() => {}}
          onBell={() => {}}
          onAskCesare={() => {}}
          onBrandClick={() => {}}
          onProjectClick={() => {}}
          onSectionClick={() => {}}
          onAvatarClick={() => {}}
        />
      </div>
      <p
        style={{
          fontFamily: "var(--ds-font-mono)",
          fontSize: 10,
          color: "var(--ds-text-mute)",
          marginBottom: 24,
        }}
      >
        TopBar · FloatingDock is fixed bottom-right on this page ↗
      </p>

      <SectionLabel>Composites</SectionLabel>
      <div
        style={{
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-line)",
          borderRadius: 8,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 16px",
            }}
          >
            HeroKPI
          </p>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <HeroKPI
              eyebrow="Totale preventivo"
              value="€ 1.247.000"
              delta="+4,2%"
              deltaDirection="negative"
              sub="Media mercato: € 1.190.000"
            />
            <HeroKPI
              eyebrow="Giorni di riprese"
              value="32"
              delta="-2"
              deltaDirection="positive"
              size="sm"
            />
          </div>
        </div>
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 16px",
            }}
          >
            MarginNote
          </p>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              maxWidth: 600,
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <MarginNote
                kind="dramaturg"
                text="Il personaggio perde coerenza qui — considera se questa scena sia necessaria o se si possa ellittere."
                onAccept={() => {}}
                onIgnore={() => {}}
              />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <MarginNote
                kind="producer"
                text="Reparto Trucco supera il budget del 15%. Verifica se si può ottimizzare nella scena 14."
                onAccept={() => {}}
                onIgnore={() => {}}
              />
            </div>
          </div>
        </div>
      </div>

      <SectionLabel>Primitives</SectionLabel>
      <div
        style={{
          background: "var(--ds-surface)",
          border: "1px solid var(--ds-line)",
          borderRadius: 8,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Button */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            Button
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <DsButton variant="primary">Rigenera</DsButton>
            <DsButton variant="primary" hotkey="⌘R">
              Rigenera
            </DsButton>
            <DsButton variant="ghost">Esporta</DsButton>
            <DsButton variant="ghost" hotkey="⌘E">
              Esporta
            </DsButton>
            <DsButton variant="danger">Elimina</DsButton>
            <DsButton variant="ghost" disabled>
              Disabilitato
            </DsButton>
          </div>
        </div>

        {/* Pill */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            Pill
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Pill tone="clay">CANDIDATO</Pill>
            <Pill tone="leaf">CONFERMATO</Pill>
            <Pill tone="neutral">BOZZA</Pill>
            <Pill tone="leaf" count={3}>
              Cesare
            </Pill>
            <Pill tone="clay" size="sm">
              SAVING
            </Pill>
          </div>
        </div>

        {/* ToggleChip */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            ToggleChip
          </p>
          <ToggleChipDemo />
        </div>

        {/* Tooltip */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            Tooltip
          </p>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <Tooltip content="Tooltip scuro in alto" placement="top">
              <button type="button" data-testid="tip-top">
                Hover/Focus top
              </button>
            </Tooltip>
            <Tooltip
              content="Tooltip info a destra"
              kind="info"
              placement="right"
            >
              <button type="button" data-testid="tip-info">
                Info right
              </button>
            </Tooltip>
            <Tooltip content="In basso" placement="bottom">
              <button type="button" data-testid="tip-bottom">
                Bottom
              </button>
            </Tooltip>
          </div>
        </div>

        {/* SavePill */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            SavePill
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <SavePill state="saved" secondsAgo={12} />
            <SavePill state="saving" />
            <SavePill state="offline" />
          </div>
        </div>

        {/* Presence */}
        <div>
          <p
            style={{
              fontFamily: "var(--ds-font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ds-text-mute)",
              margin: "0 0 12px",
            }}
          >
            Presence
          </p>
          <Presence
            users={[
              { id: "1", name: "Valerio Narcisi", initials: "VN" },
              { id: "2", name: "Sofia Romani", initials: "SR" },
              { id: "3", name: "Marco Bianchi", initials: "MB" },
              { id: "4", name: "Giulia Ferraro", initials: "GF" },
              { id: "5", name: "Luca Conti", initials: "LC" },
            ]}
            maxVisible={4}
          />
        </div>
      </div>

      {/* FloatingDock demo — fixed bottom-right on this page */}
      <FloatingDock
        label="DESIGN SYSTEM"
        primaryAction={{ label: "Rigenera", hotkey: "⌘R", onClick: () => {} }}
        secondaryActions={[
          { label: "Esporta", hotkey: "⌘E", onClick: () => {} },
          { label: "Salva", hotkey: "⌘S", onClick: () => {} },
        ]}
        cesareNoteCount={3}
        onCesareClick={() => {}}
      />
    </div>
  );
}
