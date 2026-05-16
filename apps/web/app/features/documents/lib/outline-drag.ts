/**
 * Pure drag-and-drop helpers for the Outline editor.
 *
 * All functions are side-effect-free: they receive an OutlineContent and
 * return a new one. UI components call these and pass the result to onChange.
 * Isolated here so a future switch to a different DnD library only touches
 * this file.
 */

import type { OutlineContent } from "../documents.schema";

// ─── Scene within the same sequence ──────────────────────────────────────────

export const moveSceneWithinSequence = (
  outline: OutlineContent,
  actId: string,
  seqId: string,
  fromIndex: number,
  toIndex: number,
): OutlineContent => {
  if (fromIndex === toIndex) return outline;
  return {
    acts: outline.acts.map((act) => {
      if (act.id !== actId) return act;
      return {
        ...act,
        sequences: act.sequences.map((seq) => {
          if (seq.id !== seqId) return seq;
          const scenes = [...seq.scenes];
          const [moved] = scenes.splice(fromIndex, 1);
          if (!moved) return seq;
          scenes.splice(toIndex, 0, moved);
          return { ...seq, scenes };
        }),
      };
    }),
  };
};

// ─── Scene across sequences (any act) ────────────────────────────────────────

export const moveSceneBetweenSequences = (
  outline: OutlineContent,
  sourceActId: string,
  sourceSeqId: string,
  sceneId: string,
  targetActId: string,
  targetSeqId: string,
  targetIndex: number,
): OutlineContent => {
  // Extract the scene from source
  let movedScene: OutlineContent["acts"][number]["sequences"][number]["scenes"][number] | undefined;
  const afterRemove: OutlineContent = {
    acts: outline.acts.map((act) => {
      if (act.id !== sourceActId) return act;
      return {
        ...act,
        sequences: act.sequences.map((seq) => {
          if (seq.id !== sourceSeqId) return seq;
          const scenes = seq.scenes.filter((s) => {
            if (s.id === sceneId) {
              movedScene = s;
              return false;
            }
            return true;
          });
          return { ...seq, scenes };
        }),
      };
    }),
  };

  if (!movedScene) return outline;
  const scene = movedScene;

  // Insert into target
  return {
    acts: afterRemove.acts.map((act) => {
      if (act.id !== targetActId) return act;
      return {
        ...act,
        sequences: act.sequences.map((seq) => {
          if (seq.id !== targetSeqId) return seq;
          const scenes = [...seq.scenes];
          scenes.splice(targetIndex, 0, scene);
          return { ...seq, scenes };
        }),
      };
    }),
  };
};

// ─── Sequence within the same act ────────────────────────────────────────────

export const moveSequenceWithinAct = (
  outline: OutlineContent,
  actId: string,
  fromIndex: number,
  toIndex: number,
): OutlineContent => {
  if (fromIndex === toIndex) return outline;
  return {
    acts: outline.acts.map((act) => {
      if (act.id !== actId) return act;
      const sequences = [...act.sequences];
      const [moved] = sequences.splice(fromIndex, 1);
      if (!moved) return act;
      sequences.splice(toIndex, 0, moved);
      return { ...act, sequences };
    }),
  };
};

// ─── Sequence across acts ─────────────────────────────────────────────────────

export const moveSequenceBetweenActs = (
  outline: OutlineContent,
  sourceActId: string,
  seqId: string,
  targetActId: string,
  targetIndex: number,
): OutlineContent => {
  let movedSeq: OutlineContent["acts"][number]["sequences"][number] | undefined;

  const afterRemove: OutlineContent = {
    acts: outline.acts.map((act) => {
      if (act.id !== sourceActId) return act;
      return {
        ...act,
        sequences: act.sequences.filter((s) => {
          if (s.id === seqId) {
            movedSeq = s;
            return false;
          }
          return true;
        }),
      };
    }),
  };

  if (!movedSeq) return outline;
  const seq = movedSeq;

  return {
    acts: afterRemove.acts.map((act) => {
      if (act.id !== targetActId) return act;
      const sequences = [...act.sequences];
      sequences.splice(targetIndex, 0, seq);
      return { ...act, sequences };
    }),
  };
};

// ─── Acts ─────────────────────────────────────────────────────────────────────

export const moveAct = (
  outline: OutlineContent,
  fromIndex: number,
  toIndex: number,
): OutlineContent => {
  if (fromIndex === toIndex) return outline;
  const acts = [...outline.acts];
  const [moved] = acts.splice(fromIndex, 1);
  if (!moved) return outline;
  acts.splice(toIndex, 0, moved);
  return { acts };
};
