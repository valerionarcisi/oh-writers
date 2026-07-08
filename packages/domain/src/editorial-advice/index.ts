export {
  EditorialAdviceAreaSchema,
  EditorialAdviceSchema,
  EditorialAdviceListSchema,
  EditorialAdviceTypeSchema,
  EditorialAdviceSeveritySchema,
  EditorialAdviceStatusSchema,
  EDITORIAL_ADVICE_SEVERITY_RANK,
  EDITORIAL_ADVICE_TYPE_RANK,
  adviceFingerprint,
  dedupeEditorialAdvice,
  sortEditorialAdvice,
  createEditorialApprovalAdvice,
} from "./schema.js";
export type {
  EditorialAdvice,
  EditorialAdviceSeverity,
  EditorialAdviceStatus,
  EditorialAdviceType,
} from "./schema.js";
