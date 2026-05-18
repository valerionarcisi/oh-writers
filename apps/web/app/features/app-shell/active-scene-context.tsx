import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { DocumentType } from "@oh-writers/domain";

interface ActiveScene {
  sceneId: string;
  sceneNumber: number;
}

export interface ActiveDocument {
  id: string;
  type: DocumentType;
}

export interface ActiveShootingDay {
  dayId: string;
  dayNumber: number;
}

interface ActiveSceneContextValue {
  activeScene: ActiveScene | null;
  setActiveScene: (scene: ActiveScene | null) => void;
  activeRequirementId: string | null;
  setActiveRequirementId: (id: string | null) => void;
  activeDocument: ActiveDocument | null;
  setActiveDocument: (doc: ActiveDocument | null) => void;
  activeShootingDay: ActiveShootingDay | null;
  setActiveShootingDay: (day: ActiveShootingDay | null) => void;
}

const ActiveSceneContext = createContext<ActiveSceneContextValue>({
  activeScene: null,
  setActiveScene: () => undefined,
  activeRequirementId: null,
  setActiveRequirementId: () => undefined,
  activeDocument: null,
  setActiveDocument: () => undefined,
  activeShootingDay: null,
  setActiveShootingDay: () => undefined,
});

export function ActiveSceneProvider({ children }: { children: ReactNode }) {
  const [activeScene, setActiveSceneState] = useState<ActiveScene | null>(null);
  const [activeRequirementId, setActiveRequirementIdState] = useState<
    string | null
  >(null);
  const [activeDocument, setActiveDocumentState] =
    useState<ActiveDocument | null>(null);
  const [activeShootingDay, setActiveShootingDayState] =
    useState<ActiveShootingDay | null>(null);

  const setActiveScene = useCallback((scene: ActiveScene | null) => {
    setActiveSceneState(scene);
  }, []);

  const setActiveRequirementId = useCallback((id: string | null) => {
    setActiveRequirementIdState(id);
  }, []);

  const setActiveDocument = useCallback((doc: ActiveDocument | null) => {
    setActiveDocumentState(doc);
  }, []);

  const setActiveShootingDay = useCallback(
    (day: ActiveShootingDay | null) => {
      setActiveShootingDayState(day);
    },
    [],
  );

  return (
    <ActiveSceneContext.Provider
      value={{
        activeScene,
        setActiveScene,
        activeRequirementId,
        setActiveRequirementId,
        activeDocument,
        setActiveDocument,
        activeShootingDay,
        setActiveShootingDay,
      }}
    >
      {children}
    </ActiveSceneContext.Provider>
  );
}

export function useActiveScene(): ActiveScene | null {
  return useContext(ActiveSceneContext).activeScene;
}

export function useSetActiveScene(): (scene: ActiveScene | null) => void {
  return useContext(ActiveSceneContext).setActiveScene;
}

export function useActiveRequirementId(): string | null {
  return useContext(ActiveSceneContext).activeRequirementId;
}

export function useSetActiveRequirementId(): (id: string | null) => void {
  return useContext(ActiveSceneContext).setActiveRequirementId;
}

export function useActiveDocument(): ActiveDocument | null {
  return useContext(ActiveSceneContext).activeDocument;
}

export function useSetActiveDocument(): (doc: ActiveDocument | null) => void {
  return useContext(ActiveSceneContext).setActiveDocument;
}

export function useActiveShootingDay(): ActiveShootingDay | null {
  return useContext(ActiveSceneContext).activeShootingDay;
}

export function useSetActiveShootingDay(): (
  day: ActiveShootingDay | null,
) => void {
  return useContext(ActiveSceneContext).setActiveShootingDay;
}
