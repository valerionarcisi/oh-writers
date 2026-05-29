// packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx
/**
 * Cesare Drawer — Notion-class chrome for the Cesare assistant.
 *
 * This component owns nothing about chat content. It is a pure CHROME
 * component: header (agent + sessions + window controls), body (consumer
 * children), footer (composer + scope chips). Consumers — WP-B today —
 * pass:
 *
 *   - `state` (`closed | peek | expanded | expanded-split | full`) plus
 *     `onStateChange`, both from `useDrawerState`.
 *   - The conversation body as `children` (messages, Step Blocks, etc.).
 *   - Session metadata + handlers (`sessions`, `activeSessionId`, etc.).
 *   - Composer props (`value`, `onChange`, `onSubmit`, `isThinking`).
 *   - Scope chips (`scopes`) describing the auto-attached context.
 *
 * Implementation notes:
 *   - The drag-resize handles are mounted only when their corresponding
 *     state is active. Sizes are read from / persisted to localStorage via
 *     `DRAWER_SIZE_STORAGE_KEYS`.
 *   - Window-control buttons (`bell / avatar / gear`) are surfaced ONLY when
 *     state !== "closed" (they migrate from the BottomDock per spec 44).
 *   - The drawer never re-mounts when transitioning; the DOM stays stable
 *     and CSS animates the `[data-state]` flip.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { useButton } from "react-aria";
import styles from "./CesareDrawer.module.css";
import type { CesareDrawerState } from "./use-drawer-state";
import {
  useDrawerResize,
  readPersistedSize,
  DRAWER_SIZE_STORAGE_KEYS,
} from "./use-drawer-resize";

// ─── Public types ───────────────────────────────────────────────────────────

export interface CesareDrawerSession {
  id: string;
  title: string;
  lastAt: string;
  isActive?: boolean;
}

export interface CesareDrawerScope {
  id: string;
  /** Short icon/glyph rendered before the label (e.g. "📎" or a single letter). */
  icon?: string;
  label: string;
  /** Pass to mark the scope as dismissible. Omit for sticky scope (page). */
  onRemove?: () => void;
}

export interface CesareDrawerContextTag {
  id: string;
  label: string;
  onRemove?: () => void;
}

export interface CesareDrawerDockIcons {
  onBell?: () => void;
  onAvatar?: () => void;
  onGear?: () => void;
  /** When true, render a small notification dot on the bell. */
  hasUnreadNotifications?: boolean;
  /** Avatar initial / mark. */
  avatarLabel?: string;
}

export interface CesareDrawerComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** When true: input disabled, send button replaced by stop. */
  isThinking?: boolean;
  onStop?: () => void;
  /** Voice button (↓). Optional. */
  onVoice?: () => void;
  /** Magic prompt enhancer (✦). Optional. */
  onEnhancePrompt?: () => void;
  placeholder?: string;
}

export interface CesareDrawerProps {
  /** Current state (controlled). */
  state: CesareDrawerState;
  /** State change callback — exposes the new state to the controller. */
  onStateChange: (next: CesareDrawerState) => void;
  /** Dispatcher methods. The consumer typically forwards from useDrawerState. */
  onCycle: () => void;
  onStepBack: () => void;
  onPeek: () => void;
  onClose: () => void;

  /** Sessions metadata for the dropdown trigger in the header. */
  sessions?: ReadonlyArray<CesareDrawerSession>;
  activeSessionId?: string;
  onSessionSelectorClick?: () => void;

  /** Page-scope tag (BREAKDOWN, SOGGETTO, etc.) + dismissible pins. */
  contextTags?: ReadonlyArray<CesareDrawerContextTag>;

  /** Bell / avatar / gear — migrated from the BottomDock when open. */
  dockIcons?: CesareDrawerDockIcons;

  /** Scope chips rendered above the composer input. */
  scopes?: ReadonlyArray<CesareDrawerScope>;
  onAddScope?: () => void;

  /** Composer props. The drawer renders an empty composer when omitted. */
  composer?: CesareDrawerComposerProps;

  /** Conversation body (messages, Step Blocks, recap cards, etc.). */
  children: ReactNode;

  /** Optional peek-row content override (defaults to "Cesare · activity"). */
  peekSubtitle?: string;

  /** Class hook for caller-side styling (test selectors). */
  className?: string;

  /** Accessible label for the drawer landmark. */
  ariaLabel?: string;
}

// ─── Internal building blocks ───────────────────────────────────────────────

function HeaderButton({
  onPress,
  label,
  icon,
  isDanger,
}: {
  onPress: () => void;
  label: string;
  icon: ReactNode;
  isDanger?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, "aria-label": label }, ref);
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={[styles.iconBtn, isDanger ? styles.iconBtnDanger : ""]
        .filter(Boolean)
        .join(" ")}
      title={label}
    >
      {icon}
    </button>
  );
}

function ScopeChip({ scope }: { scope: CesareDrawerScope }) {
  return (
    <span className={styles.scopeChip}>
      {scope.icon && <span className={styles.scopeChipIcon}>{scope.icon}</span>}
      <span>{scope.label}</span>
      {scope.onRemove && (
        <button
          type="button"
          className={styles.scopeChipRemove}
          onClick={scope.onRemove}
          aria-label={`Rimuovi contesto: ${scope.label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

function PeekRow({
  subtitle,
  onCycle,
  onClose,
}: {
  subtitle: string;
  onCycle: () => void;
  onClose: () => void;
}) {
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { buttonProps: expandProps } = useButton(
    { onPress: onCycle, "aria-label": "Espandi Cesare" },
    expandRef,
  );
  const { buttonProps: closeProps } = useButton(
    { onPress: onClose, "aria-label": "Chiudi Cesare" },
    closeRef,
  );
  return (
    <button
      ref={expandRef}
      {...expandProps}
      type="button"
      className={styles.peekRow}
    >
      <span className={styles.peekGlow} aria-hidden="true" />
      <span className={styles.peekLabel}>Cesare</span>
      <span className={styles.peekSub}>· {subtitle}</span>
      <button
        ref={closeRef}
        {...closeProps}
        type="button"
        className={styles.peekClose}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function CesareDrawer({
  state,
  onStateChange: _onStateChange,
  onCycle,
  onStepBack,
  onPeek,
  onClose,
  sessions,
  activeSessionId,
  onSessionSelectorClick,
  contextTags,
  dockIcons,
  scopes,
  onAddScope,
  composer,
  children,
  peekSubtitle = "in attesa",
  className,
  ariaLabel = "Cesare assistant",
}: CesareDrawerProps) {
  // ─── Resize state ────────────────────────────────────────────────────────
  const isExpanded = state === "expanded";
  const isSplit = state === "expanded-split";

  const initialExpandedSize = useMemo(
    () => readPersistedSize(DRAWER_SIZE_STORAGE_KEYS.expanded, 480),
    [],
  );
  const initialSplitSize = useMemo(
    () => readPersistedSize(DRAWER_SIZE_STORAGE_KEYS.split, 480),
    [],
  );

  const persistExpanded = useCallback((px: number) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        DRAWER_SIZE_STORAGE_KEYS.expanded,
        String(px),
      );
    } catch {
      // localStorage may be unavailable (private mode); silently ignore.
    }
  }, []);
  const persistSplit = useCallback((px: number) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAWER_SIZE_STORAGE_KEYS.split, String(px));
    } catch {
      // see above
    }
  }, []);

  const expandedResize = useDrawerResize({
    axis: "block",
    initialSize: initialExpandedSize,
    min: 320,
    max: "76vh",
    onSizeChange: persistExpanded,
    isDisabled: !isExpanded,
  });
  const splitResize = useDrawerResize({
    axis: "inline",
    initialSize: initialSplitSize,
    min: 360,
    max: "60vw",
    onSizeChange: persistSplit,
    isDisabled: !isSplit,
  });

  // ─── Inline custom properties driving the drawer size ───────────────────
  const rootStyle = useMemo<React.CSSProperties>(() => {
    const style: Record<string, string> = {};
    if (isExpanded) {
      style["--drawer-block-size"] = `${expandedResize.size}px`;
      style["--drawer-inline-size"] = `min(480px, 40vw)`;
    } else if (isSplit) {
      style["--drawer-inline-size"] = `${splitResize.size}px`;
    }
    return style as React.CSSProperties;
  }, [isExpanded, isSplit, expandedResize.size, splitResize.size]);

  // ─── Scroll anchor ───────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isAnchorReleased, setIsAnchorReleased] = useState(false);
  const lastScrollTopRef = useRef<number>(0);

  // Re-pin to the bottom when state changes from closed/peek to expanded.
  useEffect(() => {
    if (state === "closed" || state === "peek") return;
    const el = bodyRef.current;
    if (!el) return;
    // Defer to next frame so layout has settled before measuring.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setIsAnchorReleased(false);
    });
    return () => cancelAnimationFrame(id);
  }, [state]);

  const handleBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Anchor is "released" when user is more than 80px above the bottom.
    const released = distanceFromBottom > 80;
    setIsAnchorReleased(released);
    lastScrollTopRef.current = el.scrollTop;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsAnchorReleased(false);
  }, []);

  // ─── Composer handlers ──────────────────────────────────────────────────
  const handleComposerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!composer) return;
      // cmd+enter or ctrl+enter submits.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        composer.onSubmit();
      }
    },
    [composer],
  );

  const handleComposerChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      composer?.onChange(e.target.value);
    },
    [composer],
  );

  // ─── Render ─────────────────────────────────────────────────────────────
  const showDockIcons = state !== "closed" && state !== "peek";
  const isResizing = expandedResize.isResizing || splitResize.isResizing;

  return (
    <aside
      className={[
        styles.root,
        isResizing ? styles.isResizing : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-state={state}
      data-testid="cesare-drawer"
      style={rootStyle}
      aria-label={ariaLabel}
      role="complementary"
    >
      {/* Peek state shows a single inline row and nothing else. */}
      {state === "peek" && (
        <PeekRow subtitle={peekSubtitle} onCycle={onCycle} onClose={onClose} />
      )}

      {/* Drag handles — paint themselves invisible until the matching state
          is active (CSS handles the display logic). */}
      <div className={styles.handleTop} {...expandedResize.handleProps} />
      <div className={styles.handleLeft} {...splitResize.handleProps} />

      {/* Main frame — header / body / footer. Hidden in peek by CSS. */}
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.agentBadge}>Cesare</span>

            {sessions && (
              <button
                type="button"
                className={styles.sessionSelector}
                onClick={onSessionSelectorClick}
                aria-label="Seleziona sessione Cesare"
                aria-haspopup="listbox"
              >
                {sessions.find((s) => s.id === activeSessionId)?.title ??
                  "Sessione"}
                <span className={styles.sessionSelectorChev} aria-hidden="true">
                  ▾
                </span>
              </button>
            )}

            {contextTags?.map((tag) => (
              <span
                key={tag.id}
                className={styles.contextChip}
                data-testid="cesare-context-chip"
              >
                {tag.label}
                {tag.onRemove && (
                  <button
                    type="button"
                    className={styles.contextChipDismiss}
                    onClick={tag.onRemove}
                    aria-label={`Rimuovi tag: ${tag.label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className={styles.headerRight}>
            {showDockIcons && dockIcons && (
              <>
                {dockIcons.onBell && (
                  <HeaderButton
                    onPress={dockIcons.onBell}
                    label="Notifiche"
                    icon={<span aria-hidden="true">🔔</span>}
                  />
                )}
                {dockIcons.onAvatar && (
                  <HeaderButton
                    onPress={dockIcons.onAvatar}
                    label="Profilo"
                    icon={
                      <span aria-hidden="true">
                        {dockIcons.avatarLabel ?? "V"}
                      </span>
                    }
                  />
                )}
                {dockIcons.onGear && (
                  <HeaderButton
                    onPress={dockIcons.onGear}
                    label="Impostazioni"
                    icon={<span aria-hidden="true">⚙</span>}
                  />
                )}
                <span className={styles.headerDivider} aria-hidden="true" />
              </>
            )}

            <HeaderButton
              onPress={onCycle}
              label="Espandi"
              icon={<span aria-hidden="true">↗</span>}
            />
            {state === "full" && (
              <HeaderButton
                onPress={onStepBack}
                label="Riduci"
                icon={<span aria-hidden="true">↙</span>}
              />
            )}
            <HeaderButton
              onPress={onPeek}
              label="Minimizza"
              icon={<span aria-hidden="true">−</span>}
            />
            <HeaderButton
              onPress={onClose}
              label="Chiudi"
              icon={<span aria-hidden="true">×</span>}
              isDanger
            />
          </div>
        </header>

        <div
          ref={bodyRef}
          className={styles.body}
          onScroll={handleBodyScroll}
          data-testid="cesare-drawer-body"
        >
          {children}
          <button
            type="button"
            className={[
              styles.scrollNudge,
              isAnchorReleased ? styles.scrollNudgeVisible : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={scrollToBottom}
            aria-label="Vai alle nuove risposte"
          >
            ↓ Vai alle nuove risposte
          </button>
        </div>

        <footer className={styles.footer}>
          {scopes && scopes.length > 0 && (
            <div className={styles.scopeChips}>
              {scopes.map((scope) => (
                <ScopeChip key={scope.id} scope={scope} />
              ))}
              {onAddScope && (
                <button
                  type="button"
                  className={styles.scopeChipAdd}
                  onClick={onAddScope}
                  aria-label="Aggiungi contesto"
                >
                  + Aggiungi
                </button>
              )}
            </div>
          )}

          {composer && (
            <div className={styles.composer}>
              <textarea
                className={styles.composerInput}
                value={composer.value}
                onChange={handleComposerChange}
                onKeyDown={handleComposerKeyDown}
                placeholder={composer.placeholder ?? "Chiedi a Cesare…"}
                disabled={composer.isThinking}
                rows={1}
                aria-label="Composer Cesare"
              />
              <div className={styles.composerActions}>
                {composer.onVoice && (
                  <button
                    type="button"
                    className={styles.composerBtn}
                    onClick={composer.onVoice}
                    aria-label="Detta a Cesare"
                  >
                    ↓
                  </button>
                )}
                {composer.onEnhancePrompt && (
                  <button
                    type="button"
                    className={styles.composerBtn}
                    onClick={composer.onEnhancePrompt}
                    aria-label="Migliora il prompt"
                  >
                    ✦
                  </button>
                )}
                {composer.isThinking ? (
                  <button
                    type="button"
                    className={styles.composerSend}
                    onClick={composer.onStop}
                    aria-label="Interrompi risposta"
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.composerSend}
                    onClick={composer.onSubmit}
                    disabled={composer.value.trim().length === 0}
                    aria-label="Invia messaggio"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          )}
        </footer>
      </div>
    </aside>
  );
}
