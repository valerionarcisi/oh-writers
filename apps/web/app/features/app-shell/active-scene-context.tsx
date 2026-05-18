import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ActiveScene {
  sceneId: string;
  sceneNumber: number;
}

interface ActiveSceneContextValue {
  activeScene: ActiveScene | null;
  setActiveScene: (scene: ActiveScene | null) => void;
}

const ActiveSceneContext = createContext<ActiveSceneContextValue>({
  activeScene: null,
  setActiveScene: () => undefined,
});

export function ActiveSceneProvider({ children }: { children: ReactNode }) {
  const [activeScene, setActiveSceneState] = useState<ActiveScene | null>(null);

  const setActiveScene = useCallback((scene: ActiveScene | null) => {
    setActiveSceneState(scene);
  }, []);

  return (
    <ActiveSceneContext.Provider value={{ activeScene, setActiveScene }}>
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
