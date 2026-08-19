import type {
  LocationRequirement,
  LocationCandidate,
} from "@oh-writers/domain";
import { toCsv } from "@oh-writers/utils";

export interface LocationCsvRow {
  readonly sceneNumbers: string;
  readonly requirementName: string;
  readonly status: string;
  readonly candidateName: string;
  readonly address: string;
  readonly notes: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Da scouting",
  scouting: "In scouting",
  confirmed: "Confermata",
  locked: "Bloccata",
};

const confirmedCandidate = (
  req: LocationRequirement,
): LocationCandidate | null =>
  req.candidates.find((c) => c.id === req.confirmedCandidateId) ?? null;

export const buildLocationCsvRows = (
  requirements: LocationRequirement[],
  sceneNumbersByRequirementId: Record<string, number[]>,
): LocationCsvRow[] =>
  requirements.map((req) => {
    const scenes = sceneNumbersByRequirementId[req.id] ?? [];
    const sceneNumbers =
      scenes.length > 0 ? scenes.sort((a, b) => a - b).join(", ") : "";
    const candidate = confirmedCandidate(req);

    return {
      sceneNumbers,
      requirementName: req.name,
      status: STATUS_LABELS[req.status] ?? req.status,
      candidateName: candidate?.name ?? "",
      address: candidate?.address ?? "",
      notes: candidate?.notes ?? req.description ?? "",
    };
  });

export const locationsToCsv = (
  requirements: LocationRequirement[],
  sceneNumbersByRequirementId: Record<string, number[]>,
): string => {
  const header = [
    "Scene",
    "Location",
    "Status",
    "Candidata",
    "Indirizzo",
    "Note",
  ];

  const rows = buildLocationCsvRows(
    requirements,
    sceneNumbersByRequirementId,
  ).map((r) => [
    r.sceneNumbers,
    r.requirementName,
    r.status,
    r.candidateName,
    r.address,
    r.notes,
  ]);

  return toCsv(header, rows);
};
