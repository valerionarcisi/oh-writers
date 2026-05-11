import { TARGET_PAGES_PER_DAY } from "./page-count.js";

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
}

export interface GeneratedStrip {
  sceneId: string;
  dayIndex: number | null; // null = unscheduled
  position: number;
  bannerColor: BannerColor;
  pageCount: number;
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
  let dayPages = 0;
  let positionInDay = 0;

  for (const scene of sorted) {
    const pages = scenePageCount(scene);

    // Start a new day when current day is full (but always fit at least one scene per day)
    if (dayPages > 0 && dayPages + pages > TARGET_PAGES_PER_DAY) {
      dayIndex++;
      dayPages = 0;
      positionInDay = 0;
    }

    result.push({
      sceneId: scene.id,
      dayIndex,
      position: positionInDay,
      bannerColor: bannerColor(scene),
      pageCount: pages,
    });

    dayPages += pages;
    positionInDay++;
  }

  return result;
};
