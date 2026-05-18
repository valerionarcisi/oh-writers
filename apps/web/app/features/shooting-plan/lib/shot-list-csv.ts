export interface ShotListCsvScene {
  sceneNumber: number;
  heading: string;
  shots: ShotListCsvShot[];
}

export interface ShotListCsvShot {
  position: number;
  size: string;
  movement: string;
  camera: string;
  notes: string | null;
  estimatedMinutes: number | null;
}

const escapeCsv = (s: string): string =>
  /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

const formatMinutes = (m: number | null): string =>
  m === null ? "" : String(m);

/**
 * Converts scene + shot data into a CSV string following industry-standard
 * shot-list column layout compatible with Shot Lister, SetHero, and Excel.
 */
export const shotListToCsv = (scenes: ShotListCsvScene[]): string => {
  const header = [
    "Scene",
    "Heading",
    "Shot #",
    "Camera",
    "Size",
    "Movement",
    "Est. Min",
    "Notes",
  ].join(",");

  const lines: string[] = [];
  for (const scene of scenes) {
    if (scene.shots.length === 0) {
      lines.push(
        [
          escapeCsv(String(scene.sceneNumber)),
          escapeCsv(scene.heading),
          "",
          "",
          "",
          "",
          "",
          "",
        ].join(","),
      );
    } else {
      for (const shot of scene.shots) {
        lines.push(
          [
            escapeCsv(String(scene.sceneNumber)),
            escapeCsv(scene.heading),
            escapeCsv(String(shot.position + 1)),
            escapeCsv(shot.camera),
            escapeCsv(shot.size),
            escapeCsv(shot.movement),
            formatMinutes(shot.estimatedMinutes),
            escapeCsv(shot.notes ?? ""),
          ].join(","),
        );
      }
    }
  }

  return [header, ...lines].join("\n");
};
