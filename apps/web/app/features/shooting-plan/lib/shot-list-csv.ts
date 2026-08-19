import { toCsv } from "@oh-writers/utils";

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

const formatMinutes = (m: number | null): string =>
  m === null ? "" : String(m);

/**
 * Converts scene + shot data into a CSV string following industry-standard
 * shot-list column layout compatible with Shot Lister, SetHero, and Excel.
 */
export const shotListToCsv = (scenes: ShotListCsvScene[]): string => {
  const header = [
    "Scena",
    "Intestazione",
    "Inquadratura #",
    "Camera",
    "Campo",
    "Movimento",
    "Min. stim.",
    "Note",
  ];

  const lines: string[][] = [];
  for (const scene of scenes) {
    if (scene.shots.length === 0) {
      lines.push([
        String(scene.sceneNumber),
        scene.heading,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      for (const shot of scene.shots) {
        lines.push([
          String(scene.sceneNumber),
          scene.heading,
          String(shot.position + 1),
          shot.camera,
          shot.size,
          shot.movement,
          formatMinutes(shot.estimatedMinutes),
          shot.notes ?? "",
        ]);
      }
    }
  }

  return toCsv(header, lines);
};
