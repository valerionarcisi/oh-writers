import { useRef, useState, useCallback, useId } from "react";
import type { KeyboardEvent, DragEvent } from "react";
import type {
  OutlineContent,
  OutlineAct,
  OutlineSequence,
  OutlineScene,
} from "../documents.schema";
import {
  moveSceneWithinSequence,
  moveSceneBetweenSequences,
  moveSequenceWithinAct,
  moveSequenceBetweenActs,
  moveAct,
} from "../lib/outline-drag";
import styles from "./OutlineEditor.module.css";

interface OutlineEditorProps {
  value: OutlineContent;
  onChange: (value: OutlineContent) => void;
  readOnly?: boolean;
}

// ─── Pure state transformers ──────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

const newScene = (): OutlineScene => ({
  id: newId(),
  heading: "",
  description: "",
  characters: [],
  pageEstimate: null,
  notes: null,
});

const addAct = (outline: OutlineContent): OutlineContent => ({
  acts: [
    ...outline.acts,
    { id: newId(), title: `Atto ${outline.acts.length + 1}`, sequences: [] },
  ],
});

const deleteActMergeUp = (outline: OutlineContent, actId: string): OutlineContent => {
  const idx = outline.acts.findIndex((a) => a.id === actId);
  if (idx === -1) return outline;
  const target = outline.acts[idx]!;
  const allScenes = target.sequences.flatMap((s) => s.scenes);

  if (idx === 0) {
    // First act: merge into next act if it exists
    const next = outline.acts[1];
    if (!next) return { acts: [] };
    const mergedSeq = {
      id: newId(),
      title: "Sequenza fusa",
      scenes: allScenes,
    };
    return {
      acts: [
        { ...next, sequences: [mergedSeq, ...next.sequences] },
        ...outline.acts.slice(2),
      ],
    };
  }

  // Not first: merge scenes into last sequence of previous act
  const prev = outline.acts[idx - 1]!;
  const prevSeqs = [...prev.sequences];
  if (prevSeqs.length === 0) {
    prevSeqs.push({ id: newId(), title: "Sequenza fusa", scenes: allScenes });
  } else {
    const last = prevSeqs[prevSeqs.length - 1]!;
    prevSeqs[prevSeqs.length - 1] = {
      ...last,
      scenes: [...last.scenes, ...allScenes],
    };
  }

  return {
    acts: [
      ...outline.acts.slice(0, idx - 1),
      { ...prev, sequences: prevSeqs },
      ...outline.acts.slice(idx + 1),
    ],
  };
};

const updateActTitle = (
  outline: OutlineContent,
  actId: string,
  title: string,
): OutlineContent => ({
  acts: outline.acts.map((a) => (a.id === actId ? { ...a, title } : a)),
});

const addSequence = (outline: OutlineContent, actId: string): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: [
            ...a.sequences,
            { id: newId(), title: `Sequenza ${a.sequences.length + 1}`, scenes: [] },
          ],
        },
  ),
});

const deleteSequence = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : { ...a, sequences: a.sequences.filter((s) => s.id !== seqId) },
  ),
});

const updateSequenceTitle = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  title: string,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: a.sequences.map((s) =>
            s.id === seqId ? { ...s, title } : s,
          ),
        },
  ),
});

const addScene = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: a.sequences.map((s) =>
            s.id !== seqId
              ? s
              : { ...s, scenes: [...s.scenes, newScene()] },
          ),
        },
  ),
});

const deleteScene = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  sceneId: string,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: a.sequences.map((s) =>
            s.id !== seqId
              ? s
              : { ...s, scenes: s.scenes.filter((sc) => sc.id !== sceneId) },
          ),
        },
  ),
});

const updateScene = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  sceneId: string,
  patch: Partial<Pick<OutlineScene, "heading" | "description" | "characters" | "pageEstimate" | "notes">>,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: a.sequences.map((s) =>
            s.id !== seqId
              ? s
              : {
                  ...s,
                  scenes: s.scenes.map((sc) =>
                    sc.id !== sceneId ? sc : { ...sc, ...patch },
                  ),
                },
          ),
        },
  ),
});

// ─── Summary helpers ──────────────────────────────────────────────────────────

const countScenes = (act: OutlineAct) =>
  act.sequences.reduce((acc, s) => acc + s.scenes.length, 0);

const sumPages = (act: OutlineAct): number =>
  act.sequences
    .flatMap((s) => s.scenes)
    .reduce((acc, sc) => acc + (sc.pageEstimate ?? 0), 0);

const collectAllCharacters = (outline: OutlineContent): string[] => {
  const set = new Set<string>();
  for (const act of outline.acts) {
    for (const seq of act.sequences) {
      for (const scene of seq.scenes) {
        for (const c of scene.characters) {
          if (c.trim()) set.add(c.trim().toUpperCase());
        }
      }
    }
  }
  return [...set].sort();
};

// ─── Drag context ─────────────────────────────────────────────────────────────

type DragPayload =
  | { kind: "scene"; actId: string; seqId: string; sceneId: string; index: number }
  | { kind: "sequence"; actId: string; seqId: string; index: number }
  | { kind: "act"; actId: string; index: number };

// We store the drag payload in a module-level ref rather than dataTransfer
// to keep type safety (dataTransfer only handles strings).
let activeDrag: DragPayload | null = null;

// ─── CharacterPicker ──────────────────────────────────────────────────────────

interface CharacterPickerProps {
  selected: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}

function CharacterPicker({ selected, suggestions, onChange, readOnly }: CharacterPickerProps) {
  const [input, setInput] = useState("");
  const inputId = useId();

  const filtered = input.trim()
    ? suggestions
        .filter(
          (s) =>
            s.toLowerCase().startsWith(input.toLowerCase()) &&
            !selected.includes(s),
        )
        .slice(0, 6)
    : [];

  const add = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized || selected.includes(normalized)) return;
    onChange([...selected, normalized]);
    setInput("");
  };

  const remove = (char: string) => onChange(selected.filter((c) => c !== char));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (filtered[0]) {
        add(filtered[0]);
      } else {
        add(input);
      }
    }
    if (e.key === "Backspace" && !input && selected.length > 0) {
      remove(selected[selected.length - 1]!);
    }
    if (e.key === "Escape") setInput("");
  };

  return (
    <div className={styles.characterPicker}>
      <div className={styles.characterTags}>
        {selected.map((char) => (
          <span key={char} className={styles.characterTag}>
            {char}
            {!readOnly && (
              <button
                type="button"
                className={styles.characterTagRemove}
                onClick={() => remove(char)}
                aria-label={`Rimuovi ${char}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          <div className={styles.characterInputWrapper}>
            <input
              id={inputId}
              className={styles.characterInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selected.length === 0 ? "Personaggi…" : ""}
              aria-label="Aggiungi personaggio"
            />
            {filtered.length > 0 && (
              <ul className={styles.characterSuggestions} role="listbox">
                {filtered.map((s) => (
                  <li
                    key={s}
                    role="option"
                    aria-selected="false"
                    className={styles.characterSuggestionItem}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(s);
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SceneCard ────────────────────────────────────────────────────────────────

interface SceneCardProps {
  scene: OutlineScene;
  index: number;
  actId: string;
  seqId: string;
  characterSuggestions: string[];
  onUpdate: (patch: Partial<Pick<OutlineScene, "heading" | "description" | "characters" | "pageEstimate" | "notes">>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  readOnly?: boolean;
}

function SceneCard({
  scene,
  index,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  characterSuggestions,
  readOnly,
}: SceneCardProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`${styles.sceneCard} ${isDragOver ? styles.sceneCardDragOver : ""}`}
      draggable={!readOnly}
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
        onDragOver(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        onDrop(e);
      }}
      onDragEnd={() => setIsDragOver(false)}
    >
      {!readOnly && (
        <span className={styles.dragHandle} aria-hidden="true" title="Trascina per riordinare">
          ⠿
        </span>
      )}
      <span className={styles.sceneNumber}>{index + 1}.</span>
      <div className={styles.sceneFields}>
        <input
          className={styles.sceneHeadingInput}
          value={scene.heading}
          onChange={(e) => onUpdate({ heading: e.target.value.toUpperCase() })}
          placeholder="INT. LUOGO - GIORNO"
          readOnly={readOnly}
          aria-label="Intestazione scena"
        />
        <input
          className={styles.sceneDescriptionInput}
          value={scene.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Descrizione della scena…"
          readOnly={readOnly}
          aria-label="Descrizione scena"
        />
        <div className={styles.sceneFooter}>
          <CharacterPicker
            selected={scene.characters}
            suggestions={characterSuggestions}
            onChange={(characters) => onUpdate({ characters })}
            readOnly={readOnly}
          />
          <div className={styles.pageEstimateWrapper}>
            <label className={styles.pageEstimateLabel}>pp.</label>
            <input
              type="number"
              className={styles.pageEstimateInput}
              value={scene.pageEstimate ?? ""}
              min={0}
              max={20}
              step={0.25}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onUpdate({ pageEstimate: isNaN(v) ? null : Math.min(20, Math.max(0, v)) });
              }}
              readOnly={readOnly}
              aria-label="Pagine stimate"
              placeholder="—"
            />
          </div>
        </div>
      </div>
      {!readOnly && (
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
          aria-label="Elimina scena"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── SequenceBlock ────────────────────────────────────────────────────────────

interface SequenceBlockProps {
  sequence: OutlineSequence;
  actId: string;
  sequenceIndex: number;
  characterSuggestions: string[];
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onAddScene: () => void;
  onUpdateScene: (sceneId: string, patch: Partial<Pick<OutlineScene, "heading" | "description" | "characters" | "pageEstimate" | "notes">>) => void;
  onDeleteScene: (sceneId: string) => void;
  onOutlineChange: (outline: OutlineContent) => void;
  outline: OutlineContent;
  readOnly?: boolean;
}

function SequenceBlock({
  sequence,
  actId,
  sequenceIndex,
  characterSuggestions,
  onTitleChange,
  onDelete,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onOutlineChange,
  outline,
  readOnly,
}: SequenceBlockProps) {
  const [isSeqDragOver, setIsSeqDragOver] = useState(false);

  const handleSceneDragStart = useCallback(
    (sceneId: string, sceneIndex: number) => {
      activeDrag = { kind: "scene", actId, seqId: sequence.id, sceneId, index: sceneIndex };
    },
    [actId, sequence.id],
  );

  const handleSceneDrop = useCallback(
    (targetIndex: number) => {
      if (!activeDrag) return;
      if (activeDrag.kind === "scene") {
        const { actId: srcAct, seqId: srcSeq, sceneId, index: srcIdx } = activeDrag;
        if (srcAct === actId && srcSeq === sequence.id) {
          onOutlineChange(moveSceneWithinSequence(outline, actId, sequence.id, srcIdx, targetIndex));
        } else {
          onOutlineChange(
            moveSceneBetweenSequences(outline, srcAct, srcSeq, sceneId, actId, sequence.id, targetIndex),
          );
        }
      }
      activeDrag = null;
    },
    [actId, sequence.id, outline, onOutlineChange],
  );

  const handleSeqDragStart = (e: DragEvent) => {
    e.stopPropagation();
    activeDrag = { kind: "sequence", actId, seqId: sequence.id, index: sequenceIndex };
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSeqDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSeqDragOver(false);
    if (!activeDrag) return;
    if (activeDrag.kind === "scene") {
      // Drop scene into this sequence (at end)
      const { actId: srcAct, seqId: srcSeq, sceneId } = activeDrag;
      onOutlineChange(
        moveSceneBetweenSequences(outline, srcAct, srcSeq, sceneId, actId, sequence.id, sequence.scenes.length),
      );
    } else if (activeDrag.kind === "sequence") {
      const { actId: srcAct, seqId: srcSeqId, index: srcIdx } = activeDrag;
      if (srcAct === actId) {
        onOutlineChange(moveSequenceWithinAct(outline, actId, srcIdx, sequenceIndex));
      } else {
        onOutlineChange(moveSequenceBetweenActs(outline, srcAct, srcSeqId, actId, sequenceIndex));
      }
    }
    activeDrag = null;
  };

  return (
    <div
      className={`${styles.sequence} ${isSeqDragOver ? styles.sequenceDragOver : ""}`}
      draggable={!readOnly}
      onDragStart={!readOnly ? handleSeqDragStart : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsSeqDragOver(true);
      }}
      onDragLeave={() => setIsSeqDragOver(false)}
      onDrop={!readOnly ? handleSeqDrop : undefined}
      onDragEnd={() => setIsSeqDragOver(false)}
    >
      <div className={styles.sequenceHeader}>
        {!readOnly && (
          <span className={styles.dragHandle} aria-hidden="true" title="Trascina sequenza">
            ⠿
          </span>
        )}
        <input
          className={styles.sequenceTitleInput}
          value={sequence.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titolo sequenza…"
          readOnly={readOnly}
        />
        {!readOnly && (
          <button
            className={styles.deleteBtn}
            onClick={onDelete}
            aria-label="Elimina sequenza"
            type="button"
          >
            ×
          </button>
        )}
      </div>
      <div className={styles.scenes}>
        {sequence.scenes.map((scene, i) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            index={i}
            actId={actId}
            seqId={sequence.id}
            characterSuggestions={characterSuggestions}
            onUpdate={(patch) => onUpdateScene(scene.id, patch)}
            onDelete={() => onDeleteScene(scene.id)}
            onDragStart={() => handleSceneDragStart(scene.id, i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleSceneDrop(i)}
            readOnly={readOnly}
          />
        ))}
        {!readOnly && (
          <button className={styles.addBtn} onClick={onAddScene} type="button">
            + Aggiungi scena
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ActBlock ─────────────────────────────────────────────────────────────────

interface ActBlockProps {
  act: OutlineAct;
  actIndex: number;
  characterSuggestions: string[];
  onDelete: () => void;
  onAddSequence: () => void;
  onOutlineChange: (outline: OutlineContent) => void;
  outline: OutlineContent;
  readOnly?: boolean;
}

function ActBlock({
  act,
  actIndex,
  characterSuggestions,
  onDelete,
  onAddSequence,
  onOutlineChange,
  outline,
  readOnly,
}: ActBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const sceneCount = countScenes(act);
  const totalPages = sumPages(act);

  const handleActDragStart = (e: DragEvent) => {
    e.stopPropagation();
    activeDrag = { kind: "act", actId: act.id, index: actIndex };
    e.dataTransfer.effectAllowed = "move";
  };

  const handleActDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeDrag) return;
    if (activeDrag.kind === "act") {
      onOutlineChange(moveAct(outline, activeDrag.index, actIndex));
    }
    activeDrag = null;
  };

  const collapsedSummary = `${act.sequences.length} sequenze · ${sceneCount} scene${totalPages > 0 ? ` · ~${totalPages}pp` : ""}`;

  return (
    <div
      className={`${styles.act} ${isDragOver ? styles.actDragOver : ""}`}
      draggable={!readOnly}
      onDragStart={!readOnly ? handleActDragStart : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={!readOnly ? handleActDrop : undefined}
      onDragEnd={() => setIsDragOver(false)}
    >
      <div className={styles.actHeader}>
        {!readOnly && (
          <span className={styles.dragHandle} aria-hidden="true" title="Trascina atto">
            ⠿
          </span>
        )}
        <button
          className={styles.chevronBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Espandi atto" : "Collassa atto"}
          type="button"
        >
          <span className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ""}`}>▾</span>
        </button>
        {renaming ? (
          <input
            className={styles.actTitleInput}
            defaultValue={act.title}
            autoFocus
            onBlur={(e) => {
              onOutlineChange(updateActTitle(outline, act.id, e.target.value || act.title));
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                if (e.key === "Enter") {
                  onOutlineChange(updateActTitle(outline, act.id, e.currentTarget.value || act.title));
                }
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className={styles.actTitle}
            onDoubleClick={() => !readOnly && setRenaming(true)}
            title={readOnly ? undefined : "Doppio click per rinominare"}
          >
            {act.title}
            {collapsed && (
              <span className={styles.actSummary}> — {collapsedSummary}</span>
            )}
          </span>
        )}
        {!readOnly && (
          <button
            className={styles.deleteBtn}
            onClick={onDelete}
            aria-label="Elimina atto"
            type="button"
          >
            ×
          </button>
        )}
      </div>
      {!collapsed && (
        <div className={styles.sequences}>
          {act.sequences.map((seq, seqIdx) => (
            <SequenceBlock
              key={seq.id}
              sequence={seq}
              actId={act.id}
              sequenceIndex={seqIdx}
              characterSuggestions={characterSuggestions}
              onTitleChange={(title) =>
                onOutlineChange(updateSequenceTitle(outline, act.id, seq.id, title))
              }
              onDelete={() =>
                onOutlineChange(deleteSequence(outline, act.id, seq.id))
              }
              onAddScene={() =>
                onOutlineChange(addScene(outline, act.id, seq.id))
              }
              onUpdateScene={(sceneId, patch) =>
                onOutlineChange(updateScene(outline, act.id, seq.id, sceneId, patch))
              }
              onDeleteScene={(sceneId) =>
                onOutlineChange(deleteScene(outline, act.id, seq.id, sceneId))
              }
              onOutlineChange={onOutlineChange}
              outline={outline}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <button className={styles.addBtn} onClick={onAddSequence} type="button">
              + Aggiungi sequenza
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── OutlineEditor root ───────────────────────────────────────────────────────

export function OutlineEditor({
  value,
  onChange,
  readOnly = false,
}: OutlineEditorProps) {
  const characterSuggestions = collectAllCharacters(value);

  const body = (
    <>
      {value.acts.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateText}>Nessun atto. Aggiungi il primo atto per iniziare la scaletta.</p>
        </div>
      )}
      {value.acts.map((act, actIdx) => (
        <ActBlock
          key={act.id}
          act={act}
          actIndex={actIdx}
          characterSuggestions={characterSuggestions}
          onDelete={() => onChange(deleteActMergeUp(value, act.id))}
          onAddSequence={() => onChange(addSequence(value, act.id))}
          onOutlineChange={onChange}
          outline={value}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <button
          className={`${styles.addBtn} ${styles.addActBtn}`}
          onClick={() => onChange(addAct(value))}
          type="button"
        >
          + Aggiungi atto
        </button>
      )}
    </>
  );

  return <div className={styles.editor}>{body}</div>;
}
