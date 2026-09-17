import { z } from "zod";

import type { AuditRow } from "../types";

/*
 * What `recordErrorInAudit` writes into `metadata` on an `error` row. The contract types the
 * column as unknown because every other action stores its own notes there, so the screen parses
 * it here. Lenient: a row written by an older build that lacks a field still renders.
 */
const errorMetadataSchema = z.object({
  source: z.string().optional(),
  operation: z.string().optional(),
  errorName: z.string().optional(),
  kind: z.string().nullish(),
  code: z.string().nullish(),
  status: z.number().optional(),
  message: z.string().optional(),
  causes: z.array(z.string()).optional(),
  provider: z
    .object({
      errorType: z.string(),
      providerCode: z.string().nullish(),
      endpoint: z.string().nullish(),
      retryable: z.boolean(),
    })
    .optional(),
  context: z.json().nullish(),
});

export type ErrorMetadata = z.infer<typeof errorMetadataSchema>;

/** Null for a row that is not an error, or whose metadata is not the error record. */
export function errorMetadataOf(row: AuditRow): ErrorMetadata | null {
  if (row.action !== "error") return null;
  return errorMetadataSchema.safeParse(row.metadata).data ?? null;
}
