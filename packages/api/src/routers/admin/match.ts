import {
  duplicateConfirmInputSchema,
  duplicateDeferInputSchema,
  duplicateDetailInputSchema,
  duplicateDetailSchema,
  duplicateMetricsInputSchema,
  duplicateMetricsSchema,
  duplicateQueueInputSchema,
  duplicateQueueSchema,
  duplicateRejectInputSchema,
  duplicateReopenInputSchema,
  duplicateResolutionSchema,
  duplicateSplitInputSchema,
  duplicateSplitSchema,
} from "../../contracts/admin";
import { adminProcedure } from "../../index";
import {
  confirmDuplicateCandidate,
  deferDuplicateCandidate,
  duplicateMatchMetrics,
  getDuplicateCandidateDetail,
  listDuplicateCandidates,
  rejectDuplicateCandidate,
  reopenDuplicateCandidate,
  splitListingOffer,
} from "../../services/match";
import { withJsonBodyExample } from "../openapi-examples";

export const matchAdminRouter = {
  queue: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/queue",
      operationId: "listDuplicateCandidates",
      summary: "List duplicate candidates awaiting review",
      description:
        "Cross-provider look-alikes proposed by the catalogue sync, highest confidence first. Each row hydrates both sides — provider, operator, model, year, length, cabins, berths, base and every photo — so the pair can be judged without opening two tabs. Nothing merges automatically; until a candidate is resolved the same yacht appears twice in search. Pass decision to read the confirmed or rejected history instead, confidence to take one band of the queue at a time, and matchedOn to take the pairs one matcher rule proposed. The summary carries the counts the queue is judged by: how many pairs sit under each decision, how many distinct yachts the filtered pairs touch, and the facets behind both filters.",
      tags: ["Admin"],
      successDescription: "A page of duplicate candidates, with the queue's counts and facets.",
      spec: withJsonBodyExample({
        decision: "pending",
        confidence: "all",
        matchedOn: "model+yearBuilt",
        page: 1,
        pageSize: 20,
      }),
    })
    .input(duplicateQueueInputSchema)
    .output(duplicateQueueSchema)
    .handler(({ context, input }) => listDuplicateCandidates(context.db, input)),
  detail: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/detail",
      operationId: "getDuplicateCandidateDetail",
      summary: "Read both sides of a duplicate pair in full",
      description:
        "The specs the queue row leaves out, fetched only when a reviewer opens a pair: beam, draft, heads, showers, engine, tank capacities, rig, category, builder, deposit, amenities and the provider description. Photos ride on the queue row instead, because the card carries them before anything is opened.",
      tags: ["Admin"],
      successDescription: "Both sides' photos and full specification.",
      spec: withJsonBodyExample({ candidateId: "ldup_example" }),
    })
    .input(duplicateDetailInputSchema)
    .output(duplicateDetailSchema)
    .handler(({ context, input }) => getDuplicateCandidateDetail(context.db, input)),
  confirm: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/confirm",
      operationId: "confirmDuplicateCandidate",
      summary: "Merge a duplicate pair onto one listing",
      description:
        "Merges the pair onto keepListingId: every listing_source of the other listing is repointed at the survivor, both sources are stamped confirmed so the next sync will not undo the verdict, and the losing listing is hidden rather than deleted because bookings still reference it. Any other pending pair the repoint left with one listing on both sides closes with it, so a boat that sat in several look-alike pairs does not come back with cards that have nothing to decide. Rejects a candidate that has already been reviewed with CONFLICT, so a double-click cannot merge twice. Rebuilds the search document afterwards and writes an audit log entry carrying both listing ids.",
      tags: ["Admin"],
      successDescription: "Which listing survived and what moved.",
      spec: withJsonBodyExample({
        candidateId: "ldup_example",
        keepListingId: "ylst_yacht-sunreef-60-celeste",
      }),
    })
    .input(duplicateConfirmInputSchema)
    .output(duplicateResolutionSchema)
    .handler(({ context, input }) =>
      confirmDuplicateCandidate(context.db, context.session.user.id, input),
    ),
  reject: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/reject",
      operationId: "rejectDuplicateCandidate",
      summary: "Record that a duplicate pair is two different yachts",
      description:
        "Closes the candidate and leaves each listing exactly where it is. The verdict stops at the pair: the candidate row is what stops the sync re-proposing it, so the two sources keep their own match status and a boat is not labelled rejected in the other pairs nobody has reviewed yet. Rejects an already-reviewed candidate with CONFLICT. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The rejected candidate.",
      spec: withJsonBodyExample({ candidateId: "ldup_example" }),
    })
    .input(duplicateRejectInputSchema)
    .output(duplicateResolutionSchema)
    .handler(({ context, input }) =>
      rejectDuplicateCandidate(context.db, context.session.user.id, input),
    ),
  defer: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/defer",
      operationId: "deferDuplicateCandidate",
      summary: "Set a duplicate pair aside without judging it",
      description:
        "Closes the candidate as undecidable and leaves both listings exactly where they are. Neither a merge nor a rejection on purpose: the precision figure that would justify auto-approval is confirmed over confirmed-plus-rejected, so filing a pair nobody could call as a rejection would sink the number the decision rests on. Takes an optional note. Rejects an already-reviewed candidate with CONFLICT. Writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "The deferred candidate.",
      spec: withJsonBodyExample({
        candidateId: "ldup_example",
        note: "Same base, but the hull numbers differ",
      }),
    })
    .input(duplicateDeferInputSchema)
    .output(duplicateResolutionSchema)
    .handler(({ context, input }) =>
      deferDuplicateCandidate(context.db, context.session.user.id, input),
    ),
  reopen: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/reopen",
      operationId: "reopenDuplicateCandidate",
      summary: "Put a reviewed duplicate pair back in the queue",
      description:
        "Undoes a verdict: the candidate returns to pending and loses its reviewer, note and timestamp, so the pair is judged again from the proposal the matcher made. This is the only way back — nothing re-proposes a candidate, because the row is unique per pair, so without it a rejection or a set-aside was permanent. Refuses with CONFLICT on a pair that is already pending, and on a confirmation whose merge is still standing: split the offer back out first, then reopen. Writes an audit log entry carrying the verdict it took back.",
      tags: ["Admin"],
      successDescription: "The candidate, back to pending.",
      spec: withJsonBodyExample({ candidateId: "ldup_example" }),
    })
    .input(duplicateReopenInputSchema)
    .output(duplicateResolutionSchema)
    .handler(({ context, input }) =>
      reopenDuplicateCandidate(context.db, context.session.user.id, input),
    ),
  metrics: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/metrics",
      operationId: "duplicateMatchMetrics",
      summary: "How often each matcher rule is right",
      description:
        "Precision per rule and confidence band, which is the number auto-approval turns on and the one the queue's own counts cannot answer: those say how much work is left, not how often the proposal was correct. Precision is confirmed over confirmed-plus-rejected, with merges a split later undid counted against the rule rather than for it. Deferred pairs are outside the denominator on purpose — they are the cases nobody could call, and counting them as failures would understate a rule that is doing fine on the ones it does settle. A band with nothing decided in it reports null rather than a rate invented from an empty sample.",
      tags: ["Admin"],
      successDescription: "One row per rule and band, with the sample they rest on.",
      spec: withJsonBodyExample({}),
    })
    .input(duplicateMetricsInputSchema)
    .output(duplicateMetricsSchema)
    .handler(({ context }) => duplicateMatchMetrics(context.db)),
  split: adminProcedure
    .route({
      method: "POST",
      path: "/admin/match/split",
      operationId: "splitListingOffer",
      summary: "Take one provider's offer back out of a merged listing",
      description:
        "Undoes a merge, one offer at a time. The offer returns to the listing it was merged out of when that listing is still standing and still empty — bringing back its slug, its URL and its reviews — and gets a new listing otherwise. Its calendar, rates, extras and booking terms move with it, and so do any bookings, because the vendor holding a reservation is holding this boat and a booking left pointing at the other listing would describe a charter of something else. The source is stamped rejected so the sync does not re-propose the pair; the candidate keeps its confirmed verdict, because the merge did happen. Refuses with CONFLICT when the listing has only one offer. Rebuilds both search documents and writes an audit log entry.",
      tags: ["Admin"],
      successDescription: "Where the offer went, and what followed it.",
      spec: withJsonBodyExample({ listingOfferId: "loff_example" }),
    })
    .input(duplicateSplitInputSchema)
    .output(duplicateSplitSchema)
    .handler(({ context, input }) => splitListingOffer(context.db, context.session.user.id, input)),
};
