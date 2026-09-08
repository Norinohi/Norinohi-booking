/*
 * The rate form's rules, parsed rather than reasoned about.
 *
 * Two of the three checks are also enforced by Postgres -- `provider_commission_rate_range` is
 * the same 0-100 bound -- and a check violation arrives from the driver as an unlabelled error
 * that no field can be blamed for. Stating them here is what puts the message on the input the
 * editor is looking at, and this file is what keeps the two statements of the same rule
 * agreeing.
 */
import { describe, expect, it } from "vitest";

import { commissionCreateInputSchema, commissionUpdateInputSchema } from "./admin";

const valid = { provider: "nausys" as const, ratePct: 15 };

describe("commissionCreateInputSchema", () => {
  it("accepts a vendor-wide rate with no window", () => {
    expect(commissionCreateInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a rate scoped to one operator", () => {
    const parsed = commissionCreateInputSchema.safeParse({ ...valid, operatorId: "op_istion" });
    expect(parsed.success).toBe(true);
  });

  it("refuses a window that ends before it starts", () => {
    const parsed = commissionCreateInputSchema.safeParse({
      ...valid,
      startsAt: "2026-06-01",
      endsAt: "2026-05-01",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["endsAt"]);
  });

  it("accepts a window that starts and ends on the same day", () => {
    const parsed = commissionCreateInputSchema.safeParse({
      ...valid,
      startsAt: "2026-06-01",
      endsAt: "2026-06-01",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a rate outside nought to a hundred, matching the check constraint", () => {
    expect(commissionCreateInputSchema.safeParse({ ...valid, ratePct: -1 }).success).toBe(false);
    expect(commissionCreateInputSchema.safeParse({ ...valid, ratePct: 101 }).success).toBe(false);
    expect(commissionCreateInputSchema.safeParse({ ...valid, ratePct: 0 }).success).toBe(true);
    expect(commissionCreateInputSchema.safeParse({ ...valid, ratePct: 100 }).success).toBe(true);
  });

  it("refuses a connector this build does not ship", () => {
    const parsed = commissionCreateInputSchema.safeParse({ ...valid, provider: "sunsail" });
    expect(parsed.success).toBe(false);
  });

  it("requires a provider and a rate", () => {
    expect(commissionCreateInputSchema.safeParse({ ratePct: 15 }).success).toBe(false);
    expect(commissionCreateInputSchema.safeParse({ provider: "nausys" }).success).toBe(false);
  });
});

describe("commissionUpdateInputSchema", () => {
  it("takes an id and nothing else, since an edit may touch one field", () => {
    expect(commissionUpdateInputSchema.safeParse({ id: "pcm_a" }).success).toBe(true);
  });

  it("still refuses a backwards window on a partial edit", () => {
    const parsed = commissionUpdateInputSchema.safeParse({
      id: "pcm_a",
      startsAt: "2026-06-01",
      endsAt: "2026-05-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("clears an operator scope with an explicit null", () => {
    const parsed = commissionUpdateInputSchema.safeParse({ id: "pcm_a", operatorId: null });
    expect(parsed.success).toBe(true);
  });
});
