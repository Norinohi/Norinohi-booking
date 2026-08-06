import { z } from "zod";

import {
  referralClaimInputSchema,
  referralClaimResultSchema,
  referralCodeSchema,
} from "../contracts/referral";
import { protectedProcedure } from "../index";
import {
  claimReferralCode,
  getOrCreateReferralCode,
  rotateReferralCode,
} from "../services/referral";
import { withJsonBodyExample } from "./openapi-examples";

export const referralRouter = {
  myCode: protectedProcedure
    .route({
      method: "POST",
      path: "/referral/myCode",
      operationId: "getReferralCode",
      summary: "Get the current user's referral code",
      description:
        "Returns the authenticated user's active referral code and share path, minting one on first call.",
      tags: ["Referral"],
      successDescription: "Referral code and share path for the authenticated user.",
      spec: withJsonBodyExample({}),
    })
    .input(z.object({}).default({}))
    .output(referralCodeSchema)
    .handler(({ context }) => getOrCreateReferralCode(context.db, context.session.user.id)),
  rotateCode: protectedProcedure
    .route({
      method: "POST",
      path: "/referral/rotateCode",
      operationId: "rotateReferralCode",
      summary: "Issue a new referral code",
      description:
        "Replaces the authenticated user's referral code with a freshly generated one. Previously shared links stop resolving, and pending redemptions already recorded against the old code keep their link.",
      tags: ["Referral"],
      successDescription: "The newly issued referral code and share path.",
      spec: withJsonBodyExample({}),
    })
    .input(z.object({}).default({}))
    .output(referralCodeSchema)
    .handler(({ context }) => rotateReferralCode(context.db, context.session.user.id)),
  claim: protectedProcedure
    .route({
      method: "POST",
      path: "/referral/claim",
      operationId: "claimReferralCode",
      summary: "Claim a referral code",
      description:
        "Links the authenticated user to the owner of a referral code. Called once immediately after signup with the code from the `?ref=` query parameter. Returns accepted=false with a reason for an unknown code, the caller's own code, or a user who was already referred. The referrer is credited later, when the referred user's first booking completes.",
      tags: ["Referral"],
      successDescription: "Whether the referral was recorded, and why not if it was refused.",
      spec: withJsonBodyExample({ code: "NORI-K7QP2M4X" }),
    })
    .input(referralClaimInputSchema)
    .output(referralClaimResultSchema)
    .handler(({ context, input }) =>
      claimReferralCode(context.db, context.session.user.id, input.code),
    ),
};
