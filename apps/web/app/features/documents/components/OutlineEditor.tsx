import { useRef } from "react";
import type {
  OutlineContent,
  OutlineAct,
  OutlineSequence,
  OutlineScene,
} from "../documents.schema";
import styles from "./OutlineEditor.module.css";

interface OutlineEditorProps {
  value: OutlineContent;
  onChange: (value: OutlineContent) => void;
  readOnly?: boolean;
}

// ─── Pure state transformers ──────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

const addAct = (outline: OutlineContent): OutlineContent => ({
  acts: [
    ...outline.acts,
    { id: newId(), title: `Act ${outline.acts.length + 1}`, sequences: [] },
  ],
});

const deleteAct = (outline: OutlineContent, actId: string): OutlineContent => ({
  acts: outline.acts.filter((a) => a.id !== actId),
});

const updateActTitle = (
  outline: OutlineContent,
  actId: string,
  title: string,
): OutlineContent => ({
  acts: outline.acts.map((a) => (a.id === actId ? { ...a, title } : a)),
});

const addSequence = (
  outline: OutlineContent,
  actId: string,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: [
            ...a.sequences,
            {
              id: newId(),
              title: `Sequence ${a.sequences.length + 1}`,
              scenes: [],
            },
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
              : {
                  ...s,
                  scenes: [
                    ...s.scenes,
                    { id: newId(), description: "", characters: [], notes: "" },
                  ],
                },
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

const updateSceneDescription = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  sceneId: string,
  description: string,
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
                    sc.id !== sceneId ? sc : { ...sc, description },
                  ),
                },
          ),
        },
  ),
});

const reorderScenes = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  fromIndex: number,
  toIndex: number,
): OutlineContent => ({
  acts: outline.acts.map((a) =>
    a.id !== actId
      ? a
      : {
          ...a,
          sequences: a.sequences.map((s) => {
            if (s.id !== seqId) return s;
            const scenes = [...s.scenes];
            const [moved] = scenes.splice(fromIndex, 1);
            if (moved) scenes.splice(toIndex, 0, moved);
            return { ...s, scenes };
          }),
        },
  ),
});

// ─── Components ───────────────────────────────────────────────────────────────

interface SceneRowProps {
  scene: OutlineScene;
  index: number;
  actId: string;
  seqId: string;
  onUpdate: (description: string) => void;
  onDelete: () => void;
  onDragStart: (index: number) => void;
  onDrop: (toIndex: number) => void;
}

function SceneRow({
  scene,
  index,
  onUpdate,
  onDelete,
  onDragStart,
  onDrop,
}: SceneRowProps) {
  return (
    <div
      className={styles.scene}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
    >
      <span className={styles.dragHandle} aria-hidden="true">
        ⠿
      </span>
      <span className={styles.sceneNumber}>{index + 1}.</span>
      <input
        className={styles.sceneInput}
        value={scene.description}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Scene description…"
      />
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        aria-label="Delete scene"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

interface SequenceBlockProps {
  sequence: OutlineSequence;
  actId: string;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onAddScene: () => void;
  onUpdateScene: (sceneId: string, description: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onReorderScenes: (fromIndex: number, toIndex: number) => void;
}

function SequenceBlock({
  sequence,
  actId: _actId,
  onTitleChange,
  onDelete,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onReorderScenes,
}: SequenceBlockProps) {
  const dragIndex = useRef<number | null>(null);

  return (
    <div className={styles.sequence}>
      <div className={styles.sequenceHeader}>
        <input
          className={styles.sequenceTitleInput}
          value={sequence.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Sequence title…"
        />
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
          aria-label="Delete sequence"
          type="button"
        >
          ×
        </button>
      </div>
      <div className={styles.scenes}>
        {sequence.scenes.map((scene, i) => (
          <SceneRow
            key={scene.id}
            scene={scene}
            index={i}
            actId={_actId}
            seqId={sequence.id}
            onUpdate={(description) => onUpdateScene(scene.id, description)}
            onDelete={() => onDeleteScene(scene.id)}
            onDragStart={(idx) => {
              dragIndex.current = idx;
            }}
            onDrop={(toIndex) => {
              if (dragIndex.current !== null && dragIndex.current !== toIndex) {
                onReorderScenes(dragIndex.current, toIndex);
              }
              dragIndex.current = null;
            }}
          />
        ))}
        <button className={styles.addBtn} onClick={onAddScene} type="button">
          + Add scene
        </button>
      </div>
    </div>
  );
}

interface ActBlockProps {
  act: OutlineAct;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onAddSequence: () => void;
  onDeleteSequence: (seqId: string) => void;
  onSequenceTitleChange: (seqId: string, title: string) => void;
  onAddScene: (seqId: string) => void;
  onUpdateScene: (seqId: string, sceneId: string, description: string) => void;
  onDeleteScene: (seqId: string, sceneId: string) => void;
  onReorderScenes: (seqId: string, fromIndex: number, toIndex: number) => void;
}

function ActBlock({
  act,
  onTitleChange,
  onDelete,
  onAddSequence,
  onDeleteSequence,
  onSequenceTitleChange,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onReorderScenes,
}: ActBlockProps) {
  return (
    <div className={styles.act}>
      <div className={styles.actHeader}>
        <input
          className={styles.actTitleInput}
          value={act.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Act title…"
        />
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
          aria-label="Delete act"
          type="button"
        >
          ×
        </button>
      </div>
      <div className={styles.sequences}>
        {act.sequences.map((seq) => (
          <SequenceBlock
            key={seq.id}
            sequence={seq}
            actId={act.id}
            onTitleChange={(title) => onSequenceTitleChange(seq.id, title)}
            onDelete={() => onDeleteSequence(seq.id)}
            onAddScene={() => onAddScene(seq.id)}
            onUpdateScene={(sceneId, desc) =>
              onUpdateScene(seq.id, sceneId, desc)
            }
            onDeleteScene={(sceneId) => onDeleteScene(seq.id, sceneId)}
            onReorderScenes={(from, to) => onReorderScenes(seq.id, from, to)}
          />
        ))}
        <button className={styles.addBtn} onClick={onAddSequence} type="button">
          + Add sequence
        </button>
      </div>
    </div>
  );
}

// ─── Outline editor root ──────────────────────────────────────────────────────

export function OutlineEditor({
  value,
  onChange,
  readOnly = false,
}: OutlineEditorProps) {
  // In read-only mode we wrap in a <fieldset disabled> — this natively
  // disables every form control and button inside without rewiring each
  // handler. Visual state stays intact; interaction is blocked by the
  // browser.
  const body = (
    <>
      {value.acts.map((act) => (
        <ActBlock
          key={act.id}
          act={act}
          onTitleChange={(title) =>
            onChange(updateActTitle(value, act.id, title))
          }
          onDelete={() => onChange(deleteAct(value, act.id))}
          onAddSequence={() => onChange(addSequence(value, act.id))}
          onDeleteSequence={(seqId) =>
            onChange(deleteSequence(value, act.id, seqId))
          }
          onSequenceTitleChange={(seqId, title) =>
            onChange(updateSequenceTitle(value, act.id, seqId, title))
          }
          onAddScene={(seqId) => onChange(addScene(value, act.id, seqId))}
          onUpdateScene={(seqId, sceneId, description) =>
            onChange(
              updateSceneDescription(
                value,
                act.id,
                seqId,
                sceneId,
                description,
              ),
            )
          }
          onDeleteScene={(seqId, sceneId) =>
            onChange(deleteScene(value, act.id, seqId, sceneId))
          }
          onReorderScenes={(seqId, fromIndex, toIndex) =>
            onChange(reorderScenes(value, act.id, seqId, fromIndex, toIndex))
          }
        />
      ))}
      {!readOnly && (
        <button
          className={`${styles.addBtn} ${styles.addActBtn}`}
          onClick={() => onChange(addAct(value))}
          type="button"
        >
          + Add act
        </button>
      )}
    </>
  );

  if (readOnly) {
    return (
      <fieldset className={styles.editor} disabled>
        {body}
      </fieldset>
    );
  }

  return <div className={styles.editor}>{body}</div>;
}
