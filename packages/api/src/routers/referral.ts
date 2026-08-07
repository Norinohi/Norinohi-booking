import { emptyInputSchema } from "../contracts/primitives";

import {
  creditBalanceSchema,
  creditLedgerInputSchema,
  creditLedgerSchema,
  referralClaimInputSchema,
  referralClaimResultSchema,
  referralCodeSchema,
  referralHistoryInputSchema,
  referralHistorySchema,
  referralSummarySchema,
} from "../contracts/referral";
import { protectedProcedure } from "../index";
import {
  creditBalance,
  creditLedgerEntries,
  referralHistory,
  referralSummary,
} from "../services/referral-summary";
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
    .input(emptyInputSchema)
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
    .input(emptyInputSchema)
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
  summary: protectedProcedure
    .route({
      method: "POST",
      path: "/referral/summary",
      operationId: "getReferralSummary",
      summary: "Referral stats and loyalty progress",
      description:
        "Everything the Referrals screen shows above the history table in one call: the share code, the four stat tiles (invited, completed, total earned, available balance), and the whole Your Level card — current tier, next tier, how many bookings remain, and every perk in the programme with whether it is unlocked. Tiers are seeded reference data; an unseeded database returns a null tier rather than failing.",
      tags: ["Referral"],
      successDescription: "Referral stats and loyalty progress for the current user.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(referralSummarySchema)
    .handler(({ context }) => referralSummary(context.db, context.session.user.id)),
  history: protectedProcedure
    .route({
      method: "POST",
      path: "/referral/history",
      operationId: "listReferralHistory",
      summary: "List people who used the referral code",
      description:
        "Paginated referral history, newest first: who accepted the code, whether the reward has been paid, and how much. A pending referral reports the reward it would pay at the referrer's current tier; only a voided referral reports a null amount.",
      tags: ["Referral"],
      successDescription: "A page of referrals.",
      spec: withJsonBodyExample({ page: 1, pageSize: 10 }),
    })
    .input(referralHistoryInputSchema)
    .output(referralHistorySchema)
    .handler(({ context, input }) => referralHistory(context.db, context.session.user.id, input)),
};

export const creditRouter = {
  balance: protectedProcedure
    .route({
      method: "POST",
      path: "/credit/balance",
      operationId: "getCreditBalance",
      summary: "Get the current credit balance",
      description:
        "Spendable credit, summed from the ledger rather than stored, plus how much of it expires within the next 30 days. Backs the Credits & Balance item in the account menu.",
      tags: ["Credit"],
      successDescription: "Credit balance for the current user.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(creditBalanceSchema)
    .handler(({ context }) => creditBalance(context.db, context.session.user.id)),
  ledger: protectedProcedure
    .route({
      method: "POST",
      path: "/credit/ledger",
      operationId: "listCreditLedger",
      summary: "List credit ledger entries",
      description:
        "Every credit entry for the current user, newest first — what was earned, spent, expired or adjusted, and when each expires. The ledger is append-only, so this is the full explanation of the balance.",
      tags: ["Credit"],
      successDescription: "A page of ledger entries.",
      spec: withJsonBodyExample({ page: 1, pageSize: 20 }),
    })
    .input(creditLedgerInputSchema)
    .output(creditLedgerSchema)
    .handler(({ context, input }) =>
      creditLedgerEntries(context.db, context.session.user.id, input),
    ),
};
