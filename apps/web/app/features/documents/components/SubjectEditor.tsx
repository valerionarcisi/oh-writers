import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { match, P } from "ts-pattern";
import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import {
  analyzeSubjectLength,
  SOGGETTO_INITIAL_TEMPLATE,
  type SubjectSection,
} from "@oh-writers/domain";
import { InlineGenerateButton, SubjectFooter } from "@oh-writers/ui";
import type { SubjectFooterLabels } from "@oh-writers/ui";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { createCartellaMarkerPlugin } from "../lib/cartella-marker-plugin";
import { insertSectionBody } from "../lib/subject-insert";
import { findSubjectHeadings } from "../lib/subject-headings";
import { useGenerateSubjectSection } from "../hooks/useGenerateSubjectSection";
import styles from "./SubjectEditor.module.css";

export interface SubjectEditorLabels {
  readonly generate: string;
  readonly generating: string;
  readonly cartelle: string;
  readonly pageOf: (n: number, total: number) => string;
  readonly words: string;
  readonly softWarning: string;
  readonly dismissWarning: string;
  readonly confirmReplace: string;
}

// IT is the default runtime language (Spec 04f). Callers can still pass
// English labels explicitly via the `labels` prop for a future i18n switch.
const defaultLabels: SubjectEditorLabels = {
  generate: "Genera",
  generating: "Generazione…",
  cartelle: "cartelle",
  pageOf: (n, total) => `pagina ${n} di ${total}`,
  words: "parole",
  softWarning: "Stai entrando nel territorio del trattamento.",
  dismissWarning: "Nascondi avviso",
  confirmReplace: "Sostituire il contenuto esistente della sezione?",
};

export interface SubjectEditorProps {
  readonly projectId: string;
  readonly content: string;
  readonly onChange: (next: string) => void;
  readonly labels?: Partial<SubjectEditorLabels>;
  readonly canEdit: boolean;
  readonly testId?: string;
}

interface Overlay {
  readonly top: number;
  readonly section: SubjectSection;
  readonly key: string;
}

export function SubjectEditor({
  projectId,
  content,
  onChange,
  labels,
  canEdit,
  testId,
}: SubjectEditorProps) {
  const l: SubjectEditorLabels = { ...defaultLabels, ...labels };
  const footerLabels: Partial<SubjectFooterLabels> = {
    cartelle: l.cartelle,
    pageOf: l.pageOf,
    words: l.words,
    softWarning: l.softWarning,
    dismissWarning: l.dismissWarning,
  };

  const [isWarningDismissed, setWarningDismissed] = useState(false);
  const [overlays, setOverlays] = useState<ReadonlyArray<Overlay>>([]);
  const [pendingSection, setPendingSection] = useState<SubjectSection | null>(
    null,
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const seededRef = useRef(false);

  const extraPlugins = useMemo<ReadonlyArray<Plugin>>(
    () => [createCartellaMarkerPlugin()],
    [],
  );

  useEffect(() => {
    if (seededRef.current) return;
    if (content === "") {
      seededRef.current = true;
      onChange(SOGGETTO_INITIAL_TEMPLATE);
    } else {
      seededRef.current = true;
    }
  }, [content, onChange]);

  const recomputeOverlays = useCallback(() => {
    const view = viewRef.current;
    const frame = frameRef.current;
    if (!view || !frame || !canEdit) {
      setOverlays([]);
      return;
    }
    const frameRect = frame.getBoundingClientRect();
    const positions = findSubjectHeadings(view.state.doc);
    const next: Overlay[] = [];
    for (const h of positions) {
      const coords = view.coordsAtPos(h.pos);
      next.push({
        top: coords.top - frameRect.top,
        section: h.section,
        key: `${h.section}-${h.pos}`,
      });
    }
    setOverlays(next);
  }, [canEdit]);

  useLayoutEffect(() => {
    recomputeOverlays();
  }, [content, recomputeOverlays]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => recomputeOverlays());
    ro.observe(frame);
    const scrollTarget: HTMLElement | Window =
      findScrollParent(frame) ?? window;
    const onScroll = () => recomputeOverlays();
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      ro.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [recomputeOverlays]);

  const generate = useGenerateSubjectSection();

  const onGenerate = useCallback(
    async (section: SubjectSection) => {
      const existingBody = extractSectionBody(content, section);
      if (existingBody.length > 0) {
        const confirmed = window.confirm(l.confirmReplace);
        if (!confirmed) return;
      }
      setPendingSection(section);
      const result = await generate
        .mutateAsync({ projectId, section })
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));
      setPendingSection(null);

      match(result)
        .with({ ok: true }, ({ value }) => {
          const next = insertSectionBody(content, section, value.text);
          onChange(next);
        })
        .with({ ok: false, error: { _tag: "SubjectRateLimitedError" } }, () => {
          // TODO: surface via shared toast
          window.alert("Troppe richieste — riprova tra un istante.");
        })
        .with({ ok: false, error: P.any }, () => {
          // TODO: surface via shared toast
          window.alert("Generazione fallita. Riprova.");
        })
        .exhaustive();
    },
    [content, generate, l.confirmReplace, onChange, projectId],
  );

  const lengthInfo = analyzeSubjectLength(content);

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.editorFrame} ref={frameRef}>
        <NarrativeProseMirrorView
          value={content}
          onChange={onChange}
          enableHeadings={true}
          readOnly={!canEdit}
          extraPlugins={extraPlugins}
          onReady={(view) => {
            viewRef.current = view;
            const original = view.props.dispatchTransaction;
            view.setProps({
              dispatchTransaction: (tr) => {
                original?.call(view, tr);
                recomputeOverlays();
              },
            });
            recomputeOverlays();
          }}
        />
        {canEdit && overlays.length > 0 && (
          <div className={styles.overlay} aria-hidden={false}>
            {overlays.map((o) => (
              <div
                key={o.key}
                className={styles.buttonSlot}
                style={{ top: `${o.top}px` }}
              >
                <InlineGenerateButton
                  label={
                    pendingSection === o.section ? l.generating : l.generate
                  }
                  isLoading={pendingSection === o.section}
                  onClick={() => void onGenerate(o.section)}
                  testId={`subject-generate-${o.section}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <SubjectFooter
        length={lengthInfo}
        labels={footerLabels}
        isWarningDismissed={isWarningDismissed}
        onDismissWarning={() => setWarningDismissed(true)}
        testId="subject-footer"
      />
    </div>
  );
}

const findScrollParent = (el: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
};

const EN_LABELS: Record<SubjectSection, string> = {
  premise: "Premise",
  protagonist: "Protagonist & antagonist",
  arc: "Narrative arc",
  world: "World",
  ending: "Ending",
};

const IT_LABELS: Record<SubjectSection, string> = {
  premise: "Premessa",
  protagonist: "Protagonista & antagonista",
  arc: "Arco narrativo",
  world: "Mondo",
  ending: "Finale",
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractSectionBody = (
  content: string,
  section: SubjectSection,
): string => {
  const it = escapeRegex(IT_LABELS[section]);
  const en = escapeRegex(EN_LABELS[section]);
  const re = new RegExp(`^## (?:${it}|${en})\\s*$`, "im");
  const m = re.exec(content);
  if (!m) return "";
  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const nextRel = rest.search(/\n## /m);
  const body = nextRel === -1 ? rest : rest.slice(0, nextRel);
  return body.trim();
};
