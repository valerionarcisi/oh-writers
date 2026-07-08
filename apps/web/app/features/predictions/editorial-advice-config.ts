import type {
  EditorialAdvice,
  EditorialAdviceSeverity,
  EditorialAdviceStatus,
  EditorialAdviceType,
  TranslationKey,
} from "@oh-writers/domain";

const typeLabelKeys: Record<EditorialAdviceType, TranslationKey> = {
  real_problem: "cesare.editorial.type.real_problem",
  risk: "cesare.editorial.type.risk",
  authorial_choice: "cesare.editorial.type.authorial_choice",
  optional: "cesare.editorial.type.optional",
  already_resolved: "cesare.editorial.type.already_resolved",
  approved: "cesare.editorial.type.approved",
};

const severityLabelKeys: Record<EditorialAdviceSeverity, TranslationKey> = {
  high: "cesare.editorial.severity.high",
  medium: "cesare.editorial.severity.medium",
  low: "cesare.editorial.severity.low",
  optional: "cesare.editorial.severity.optional",
};

const statusLabelKeys: Record<EditorialAdviceStatus, TranslationKey> = {
  open: "cesare.editorial.status.open",
  ignored: "cesare.editorial.status.ignored",
  authorial_choice: "cesare.editorial.status.authorial_choice",
  resolved: "cesare.editorial.status.resolved",
  approved: "cesare.editorial.status.approved",
};

const areaLabelKeys: Readonly<Record<string, TranslationKey>> = {
  structure: "cesare.editorial.area.structure",
  clarity: "cesare.editorial.area.clarity",
  tone: "cesare.editorial.area.tone",
  rhythm: "cesare.editorial.area.rhythm",
  character: "cesare.editorial.area.character",
  theme: "cesare.editorial.area.theme",
  ending: "cesare.editorial.area.ending",
  format: "cesare.editorial.area.format",
  logline: "cesare.editorial.area.logline",
  synopsis: "cesare.editorial.area.synopsis",
  subject: "cesare.editorial.area.subject",
  outline: "cesare.editorial.area.outline",
  treatment: "cesare.editorial.area.treatment",
  screenplay: "cesare.editorial.area.screenplay",
  dialogue: "cesare.editorial.area.dialogue",
  action: "cesare.editorial.area.action",
  pacing: "cesare.editorial.area.pacing",
  style: "cesare.editorial.area.style",
  scene: "cesare.editorial.area.scene",
};

export const getAdviceTypeMeta = (
  type: EditorialAdviceType,
  t: (key: TranslationKey) => string,
): { label: string; sigil: string } => ({
  label: t(typeLabelKeys[type]),
  sigil:
    type === "real_problem"
      ? "!"
      : type === "risk"
        ? "?"
        : type === "authorial_choice"
          ? "≈"
          : type === "optional"
            ? "+"
            : type === "already_resolved"
              ? "·"
              : "✓",
});

export const getAdviceSeverityMeta = (
  severity: EditorialAdviceSeverity,
  t: (key: TranslationKey) => string,
): { label: string } => ({
  label: t(severityLabelKeys[severity]),
});

export const getAdviceStatusMeta = (
  status: EditorialAdviceStatus,
  t: (key: TranslationKey) => string,
): { label: string } => ({
  label: t(statusLabelKeys[status]),
});

export const getAdviceAreaLabel = (
  area: EditorialAdvice["area"],
  t: (key: TranslationKey) => string,
): string => {
  const key = areaLabelKeys[area];
  return key ? t(key) : area;
};
