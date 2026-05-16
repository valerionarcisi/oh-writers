import { z } from "zod";

export const PrimitiveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wall"), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  z.object({
    type: z.literal("furniture"),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string(),
    propRef: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("opening"),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    kind: z.enum(["door", "window"]),
  }),
]);

export type Primitive = z.infer<typeof PrimitiveSchema>;
export type PrimitiveType = Primitive["type"];

export const ArrowSchema = z.object({ toX: z.number(), toY: z.number() });
export type Arrow = z.infer<typeof ArrowSchema>;

export const ActorPositionSchema = z.object({
  castId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  arrow: ArrowSchema.nullable().default(null),
});
export type ActorPosition = z.infer<typeof ActorPositionSchema>;

export const CameraPinSchema = z.object({
  shotId: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  coneAngle: z.number().default(45),
  coneDirection: z.number().default(180),
  movement: ArrowSchema.nullable().default(null),
});
export type CameraPin = z.infer<typeof CameraPinSchema>;

export const PrimitivesArraySchema = z.array(PrimitiveSchema);
export const ActorPositionsArraySchema = z.array(ActorPositionSchema);
export const CameraPinsArraySchema = z.array(CameraPinSchema);
