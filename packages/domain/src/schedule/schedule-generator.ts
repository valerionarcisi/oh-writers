import { DAILY_CAPACITY_HOURS, resolveEffortHours } from "./effort.js";

export type BannerColor =
  | "white"
  | "yellow"
  | "blue"
  | "green"
  | "red"
  | "pink"
  | "grey";

export interface SceneInput {
  id: string;
  number: number;
  location: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  timeOfDay: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  hasSpecialEffect: boolean;
  estimatedHours: number | null;
}

export interface GeneratedStrip {
  sceneId: string;
  dayIndex: number | null;
  position: number;
  bannerColor: BannerColor;
  pageCount: number;
  estimatedHours: number | null;
}

const scenePageCount = (s: SceneInput): number => {
  if (s.pageStart != null && s.pageEnd != null && s.pageEnd >= s.pageStart) {
    return Math.max(1, s.pageEnd - s.pageStart);
  }
  return 1;
};

const bannerColor = (s: SceneInput): BannerColor => {
  if (s.hasSpecialEffect) return "red";
  const tod = (s.timeOfDay ?? "").toUpperCase();
  const isNight = tod.includes("NOTTE") || tod.includes("NIGHT");
  if (isNight) return "blue";
  if (s.intExt === "EXT") return "yellow";
  return "white";
};

// Sort key: group by location, then night scenes after day scenes within location
const sortKey = (s: SceneInput): string => {
  const tod = (s.timeOfDay ?? "").toUpperCase();
  const isNight = tod.includes("NOTTE") || tod.includes("NIGHT") ? "1" : "0";
  return `${s.location.toLowerCase()}|${isNight}|${String(s.number).padStart(6, "0")}`;
};

export const generateStrips = (scenes: SceneInput[]): GeneratedStrip[] => {
  const sorted = [...scenes].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );

  const result: GeneratedStrip[] = [];
  let dayIndex = 0;
  let dayHours = 0;
  let positionInDay = 0;

  for (const scene of sorted) {
    const pages = scenePageCount(scene);
    const hours = resolveEffortHours(pages, scene.estimatedHours);

    if (dayHours > 0 && dayHours + hours > DAILY_CAPACITY_HOURS) {
      dayIndex++;
      dayHours = 0;
      positionInDay = 0;
    }

    result.push({
      sceneId: scene.id,
      dayIndex,
      position: positionInDay,
      bannerColor: bannerColor(scene),
      pageCount: pages,
      estimatedHours: scene.estimatedHours,
    });

    dayHours += hours;
    positionInDay++;
  }

  return result;
};
