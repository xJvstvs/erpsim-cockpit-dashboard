import { z } from "zod";
export const kindSchema = z.enum(["marketing", "prices", "purchase"]);
const id = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
export const gameSchema = id;
export const budgetChanges = z.record(
  z.string().regex(/^[A-Za-z0-9-]+:(NO|SO|WE)$/),
  z.number().finite().min(0).max(1e8),
);
export const priceChanges = z.record(
  z.string().regex(/^[A-Za-z0-9-]+:[A-Za-z0-9]+$/),
  z.number().finite().positive().max(1e6),
);
export const orderLines = z
  .array(
    z
      .object({
        material: id,
        vendor: id,
        quantity: z.number().finite().positive().max(1e9),
        unit: id,
        location: id,
      })
      .strict(),
  )
  .min(1)
  .max(100);
export const draftSchema = z
  .object({
    game: gameSchema,
    version: z.number().int().min(0),
    baseVersion: z.string().min(1).max(100),
    payload: z.unknown(),
  })
  .strict();
export function validateDraft(kind: string, value: unknown) {
  if (kind === "purchase")
    return z
      .array(
        z
          .object({
            material: z.string().max(100),
            vendor: z.string().max(100),
            quantity: z.number().finite().min(0).max(1e9),
            unit: z.string().max(100),
            location: z.string().max(100),
          })
          .strict(),
      )
      .max(100)
      .parse(value);
  return z
    .record(z.string().max(150), z.string().max(30))
    .refine((v) => Object.keys(v).length <= 500, "Zu viele Änderungen")
    .parse(value);
}
export function validateAction(kind: string, value: unknown) {
  const parsed =
    kind === "marketing"
      ? budgetChanges.parse(value)
      : kind === "prices"
        ? priceChanges.parse(value)
        : orderLines.parse(value);
  if (!Array.isArray(parsed) && Object.keys(parsed).length === 0)
    throw new Error("Keine Änderungen angegeben.");
  return parsed;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
