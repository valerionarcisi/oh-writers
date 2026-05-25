import { z } from "zod";
import { LOCATION_TYPES, LOCATION_TYPE_SOURCES } from "./location-types.js";

export const LocationTypeSchema = z.enum(LOCATION_TYPES);
export const LocationTypeSourceSchema = z.enum(LOCATION_TYPE_SOURCES);

export const LocationRequirementStatusSchema = z.enum([
  "pending",
  "scouting",
  "confirmed",
  "locked",
]);
export type LocationRequirementStatus = z.infer<
  typeof LocationRequirementStatusSchema
>;

export const LocationCandidateStatusSchema = z.enum([
  "candidate",
  "visited",
  "rejected",
  "confirmed",
]);
export type LocationCandidateStatus = z.infer<
  typeof LocationCandidateStatusSchema
>;

export const LocationIntExtSchema = z.enum(["INT", "EXT", "INT/EXT"]);

export const LocationPhotoSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  url: z.string().url(),
  caption: z.string().nullable(),
  uploadedAt: z.string().datetime(),
});
export type LocationPhoto = z.infer<typeof LocationPhotoSchema>;

export const LocationCandidateSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  name: z.string().min(1).max(300),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  estimatedDailyFee: z.number().nullable(),
  permitRequired: z.boolean().nullable(),
  permitNotes: z.string().nullable(),
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  notes: z.string().nullable(),
  status: LocationCandidateStatusSchema,
  aiSuggested: z.boolean(),
  aiReasoning: z.string().nullable(),
  photos: z.array(LocationPhotoSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LocationCandidate = z.infer<typeof LocationCandidateSchema>;

export const LocationRequirementSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  breakdownElementId: z.string().uuid().nullable(),
  name: z.string().min(1).max(300),
  description: z.string().nullable(),
  intExt: LocationIntExtSchema.nullable(),
  timeOfDay: z.array(z.string()),
  locationType: LocationTypeSchema.nullable(),
  locationTypeSource: LocationTypeSourceSchema.nullable(),
  confirmedCandidateId: z.string().uuid().nullable(),
  status: LocationRequirementStatusSchema,
  sceneCount: z.number().int(),
  candidates: z.array(LocationCandidateSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LocationRequirement = z.infer<typeof LocationRequirementSchema>;

export const NewLocationCandidateSchema = LocationCandidateSchema.omit({
  id: true,
  requirementId: true,
  photos: true,
  createdAt: true,
  updatedAt: true,
});
export type NewLocationCandidate = z.infer<typeof NewLocationCandidateSchema>;

export const PatchLocationCandidateSchema =
  NewLocationCandidateSchema.partial();
export type PatchLocationCandidate = z.infer<
  typeof PatchLocationCandidateSchema
>;
