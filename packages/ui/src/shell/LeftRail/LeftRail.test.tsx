// packages/ui/src/shell/LeftRail/LeftRail.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { LeftRail } from "./LeftRail";
import type { RailSection, CesareSessionItem } from "./LeftRail";

afterEach(cleanup);

const SECTIONS: ReadonlyArray<RailSection> = [
  {
    label: "Sviluppo",
    items: [
      { id: "soggetto", label: "Soggetto", icon: "file-text", href: "/s" },
      {
        id: "screenplay",
        label: "Sceneggiatura",
        icon: "file-text",
        href: "/sp",
        isActive: true,
      },
    ],
  },
  {
    label: "Produzione",
    items: [
      { id: "breakdown", label: "Breakdown", icon: "clipboard", href: "/bd" },
    ],
  },
];

const SESSIONS: ReadonlyArray<CesareSessionItem> = [
  { id: "s1", title: "Breakdown Sc.2", lastAt: "ora", active: true },
  { id: "s2", title: "Riscrivi Atto II", lastAt: "2h" },
];

describe("LeftRail", () => {
  it("renders brand and project header", () => {
    const { getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        project={{ title: "Non fa ridere" }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Oh Writers")).toBeTruthy();
    expect(getByText("Non fa ridere")).toBeTruthy();
  });

  it("renders every section item and marks the active one", () => {
    const { getByText, getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Soggetto")).toBeTruthy();
    expect(getByText("Sceneggiatura")).toBeTruthy();
    expect(getByText("Breakdown")).toBeTruthy();
    expect(getByRole("button", { name: "Sceneggiatura" })).toHaveProperty(
      "ariaCurrent",
      "page",
    );
  });

  it("invokes onNavigate when a nav item is activated", () => {
    const onNavigate = vi.fn();
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Breakdown" }));
    expect(onNavigate).toHaveBeenCalledWith("/bd");
  });

  it("renders Cesare sessions when provided", () => {
    const { getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Sessioni Cesare")).toBeTruthy();
    expect(getByText("Breakdown Sc.2")).toBeTruthy();
  });

  it("fires onSessionSelect when a session row is clicked", () => {
    const onSessionSelect = vi.fn();
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={onSessionSelect}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Riscrivi Atto II/ }));
    expect(onSessionSelect).toHaveBeenCalledWith("s2");
  });

  it("renders tool buttons and fires their handlers", () => {
    const onSearch = vi.fn();
    const { getByTitle } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        tools={[
          { id: "search", label: "Cerca", icon: "search", onPress: onSearch },
        ]}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTitle("Cerca"));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not render the sessions section when sessions is empty", () => {
    const { queryByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={[]}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByText("Sessioni Cesare")).toBeNull();
  });

  it("renders the + Nuova affordance only when onSessionNew is supplied", () => {
    const { queryByLabelText, rerender } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByLabelText("Nuova sessione Cesare")).toBeNull();
    rerender(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionNew={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByLabelText("Nuova sessione Cesare")).toBeTruthy();
  });

  it("invokes onSessionNew when the + Nuova affordance is clicked", () => {
    const onSessionNew = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionNew={onSessionNew}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText("Nuova sessione Cesare"));
    expect(onSessionNew).toHaveBeenCalledTimes(1);
  });

  it("renders the dedicated Cesare entry when onSessionsOpen is supplied", () => {
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionsOpen={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByTestId("rail-cesare-entry")).toBeTruthy();
  });

  it("invokes onSessionsOpen when the Cesare entry is clicked", () => {
    const onSessionsOpen = vi.fn();
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionsOpen={onSessionsOpen}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId("rail-cesare-entry"));
    expect(onSessionsOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the sessions section reachable via the Cesare entry even with no sessions", () => {
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={[]}
        onSessionSelect={vi.fn()}
        onSessionsOpen={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByTestId("rail-cesare-entry")).toBeTruthy();
  });

  it("marks the active session with aria-current=page", () => {
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      getByRole("button", { name: /Sessione Cesare: Breakdown Sc.2/ }),
    ).toHaveProperty("ariaCurrent", "page");
  });

  it("invokes brand.onPress when the brand button is clicked", () => {
    const onBrand = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: onBrand }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText("Oh Writers"));
    expect(onBrand).toHaveBeenCalledTimes(1);
  });

  it("invokes project.onPress when supplied", () => {
    const onProject = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        project={{ title: "Non fa ridere", onPress: onProject }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText(/Progetto: Non fa ridere/));
    expect(onProject).toHaveBeenCalledTimes(1);
  });

  it("opens a project menu and fires the chosen item (N-24)", () => {
    const onSettings = vi.fn();
    const { getByTestId, getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        project={{
          title: "Non fa ridere",
          onPress: vi.fn(),
          menuItems: [
            {
              label: "Impostazioni progetto",
              onClick: onSettings,
              testId: "project-menu-settings",
            },
          ],
        }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    // The header is now a menu trigger (chevron-down promises a menu).
    fireEvent.click(getByTestId("rail-project-menu-trigger"));
    fireEvent.click(getByText("Impostazioni progetto"));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("uses the ariaLabel override on the rail landmark", () => {
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        ariaLabel="Nav Custom"
      />,
    );
    expect(getByLabelText("Nav Custom")).toBeTruthy();
  });

  // [OHW-047-A3] Account row (bell / avatar / gear) lives in the rail footer.
  it("renders the account footer row when account is supplied", () => {
    const { getByTestId, getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        account={{
          onBell: vi.fn(),
          onAvatar: vi.fn(),
          onGear: vi.fn(),
          avatarLabel: "VN",
        }}
      />,
    );
    expect(getByTestId("rail-account")).toBeTruthy();
    expect(getByLabelText("Notifiche")).toBeTruthy();
    expect(getByLabelText("Profilo")).toBeTruthy();
    expect(getByLabelText("Impostazioni")).toBeTruthy();
  });

  it("does NOT render the account row when account is omitted", () => {
    const { queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByTestId("rail-account")).toBeNull();
  });

  it("fires the account handlers and announces unseen notifications", () => {
    const onBell = vi.fn();
    const onAvatar = vi.fn();
    const onGear = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        account={{
          onBell,
          onAvatar,
          onGear,
          avatarLabel: "VN",
          hasUnreadNotifications: true,
        }}
      />,
    );
    fireEvent.click(getByLabelText("Notifiche — nuove"));
    fireEvent.click(getByLabelText("Profilo"));
    fireEvent.click(getByLabelText("Impostazioni"));
    expect(onBell).toHaveBeenCalledTimes(1);
    expect(onAvatar).toHaveBeenCalledTimes(1);
    expect(onGear).toHaveBeenCalledTimes(1);
  });

  it("renders the rail with a data-testid hook", () => {
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByTestId("left-rail")).toBeTruthy();
  });

  it("does NOT render the overlay controls when overlay prop is omitted", () => {
    const { queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByTestId("rail-close")).toBeNull();
    expect(queryByTestId("rail-lock-open")).toBeNull();
  });

  // The standalone «/» close button was removed in 27d1c6f (Spec 44 Notion
  // sidebar): in overlay mode dismissal is keyboard/outside-click via
  // react-aria's useOverlay, not a dedicated button. Assert ESC fires onDismiss.
  it("dismisses the overlay on Escape when overlay prop is supplied", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss }}
      />,
    );
    fireEvent.keyDown(getByTestId("left-rail"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the lock-open button only when onLockOpen is supplied", () => {
    const onLockOpen = vi.fn();
    const { getByTestId, queryByTestId, rerender } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss: vi.fn() }}
      />,
    );
    expect(queryByTestId("rail-lock-open")).toBeNull();
    rerender(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss: vi.fn(), onLockOpen }}
      />,
    );
    fireEvent.click(getByTestId("rail-lock-open"));
    expect(onLockOpen).toHaveBeenCalledTimes(1);
  });

  // ── Pinning + the 5-row cap ──────────────────────────────────────────────

  const manySessions = (n: number, pinnedCount = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      title: `Sessione ${i}`,
      lastAt: `${i}h`,
      pinned: i < pinnedCount,
    }));

  it("shows a pin glyph on pinned session rows", () => {
    const sessions = [
      { id: "s1", title: "Fissata", lastAt: "ora", pinned: true },
      { id: "s2", title: "Non fissata", lastAt: "1h" },
    ];
    render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    const row = document.querySelector('[data-session-id="s1"]');
    expect(row?.getAttribute("data-session-pinned")).toBe("true");
    const unpinnedRow = document.querySelector('[data-session-id="s2"]');
    expect(unpinnedRow?.getAttribute("data-session-pinned")).toBeNull();
  });

  it("renders a pin/unpin action in the row menu and fires onSessionPin", () => {
    const onSessionPin = vi.fn();
    const sessions = [{ id: "s1", title: "Sessione", lastAt: "ora" }];
    const { getByTestId, getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionPin={onSessionPin}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId("session-actions-btn"));
    expect(getByText("Fissa in alto")).toBeTruthy();
    fireEvent.click(getByText("Fissa in alto"));
    expect(onSessionPin).toHaveBeenCalledWith("s1", true);
  });

  it("shows 'Rimuovi dai fissati' for an already-pinned session", () => {
    const onSessionPin = vi.fn();
    const sessions = [
      { id: "s1", title: "Sessione", lastAt: "ora", pinned: true },
    ];
    const { getByTestId, getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionPin={onSessionPin}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId("session-actions-btn"));
    fireEvent.click(getByText("Rimuovi dai fissati"));
    expect(onSessionPin).toHaveBeenCalledWith("s1", false);
  });

  it("does not render a pin action when onSessionPin is omitted", () => {
    const sessions = [{ id: "s1", title: "Sessione", lastAt: "ora" }];
    const { queryByText, queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    // No rename/delete either, so the whole …-menu never renders.
    expect(queryByTestId("session-actions-btn")).toBeNull();
    expect(queryByText("Fissa in alto")).toBeNull();
  });

  it("renders all rows and no 'Vedi tutte' link when total sessions <= 5", () => {
    const sessions = manySessions(5, 2);
    const { getByText, queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionsOpen={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    for (const s of sessions) expect(getByText(s.title)).toBeTruthy();
    expect(queryByTestId("rail-sessions-see-all")).toBeNull();
  });

  it("caps the rail at 3 pinned + up to 5 total rows, with a 'Vedi tutte (N)' link", () => {
    // 3 pinned + 5 unpinned = 8 total. Rail shows 3 pinned + 2 unpinned = 5 rows.
    const sessions = manySessions(8, 3);
    const { getByText, queryByText, getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionsOpen={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    // All 3 pinned rows are visible.
    expect(getByText("Sessione 0")).toBeTruthy();
    expect(getByText("Sessione 1")).toBeTruthy();
    expect(getByText("Sessione 2")).toBeTruthy();
    // Only the 2 most-recent unpinned rows (indices 3, 4) are visible.
    expect(getByText("Sessione 3")).toBeTruthy();
    expect(getByText("Sessione 4")).toBeTruthy();
    expect(queryByText("Sessione 5")).toBeNull();
    expect(queryByText("Sessione 6")).toBeNull();
    expect(queryByText("Sessione 7")).toBeNull();
    // "Vedi tutte (8)" link is present and reflects the full count.
    const link = getByTestId("rail-sessions-see-all");
    expect(link.textContent).toBe("Vedi tutte (8)");
  });

  it("invokes onSessionsOpen when 'Vedi tutte' is clicked", () => {
    const onSessionsOpen = vi.fn();
    const sessions = manySessions(6);
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionsOpen={onSessionsOpen}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTestId("rail-sessions-see-all"));
    expect(onSessionsOpen).toHaveBeenCalledTimes(1);
  });

  it("does not render 'Vedi tutte' when onSessionsOpen is omitted, even past the cap", () => {
    const sessions = manySessions(6);
    const { queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByTestId("rail-sessions-see-all")).toBeNull();
  });

  it("caps unpinned-only lists at 5 rows (no pinned sessions)", () => {
    const sessions = manySessions(7, 0);
    const { getByText, queryByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={sessions}
        onSessionSelect={vi.fn()}
        onSessionsOpen={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    for (let i = 0; i < 5; i++) expect(getByText(`Sessione ${i}`)).toBeTruthy();
    expect(queryByText("Sessione 5")).toBeNull();
    expect(queryByText("Sessione 6")).toBeNull();
  });

  it("renders the home row and navigates on click", () => {
    const onNavigate = vi.fn();
    const { getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        home={{ id: "home", label: "Home", icon: "home", href: "/dashboard" }}
        sections={[]}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(getByText("Home"));
    expect(onNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("omits the home row when not provided", () => {
    const { queryByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={[]}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByText("Home")).toBeNull();
  });
});
