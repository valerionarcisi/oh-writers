import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ActiveScene {
  sceneId: string;
  sceneNumber: number;
}

interface ActiveSceneContextValue {
  activeScene: ActiveScene | null;
  setActiveScene: (scene: ActiveScene | null) => void;
  activeRequirementId: string | null;
  setActiveRequirementId: (id: string | null) => void;
}

const ActiveSceneContext = createContext<ActiveSceneContextValue>({
  activeScene: null,
  setActiveScene: () => undefined,
  activeRequirementId: null,
  setActiveRequirementId: () => undefined,
});

export function ActiveSceneProvider({ children }: { children: ReactNode }) {
  const [activeScene, setActiveSceneState] = useState<ActiveScene | null>(null);
  const [activeRequirementId, setActiveRequirementIdState] = useState<
    string | null
  >(null);

  const setActiveScene = useCallback((scene: ActiveScene | null) => {
    setActiveSceneState(scene);
  }, []);

  const setActiveRequirementId = useCallback((id: string | null) => {
    setActiveRequirementIdState(id);
  }, []);

  return (
    <ActiveSceneContext.Provider
      value={{
        activeScene,
        setActiveScene,
        activeRequirementId,
        setActiveRequirementId,
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
