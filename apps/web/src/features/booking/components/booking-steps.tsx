"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { type Path, useFormContext } from "react-hook-form";
import { toast } from "sonner";

import { createHoldMutationOptions } from "../api/queries";
import type { BookingValues } from "../lib/booking-form";
import { rememberGuestAccess } from "../lib/guest-access";
import { useBooking } from "./booking-provider";
import ExtrasStep from "./steps/extras";
import GuestDetailsStep from "./steps/guest-details";
import PaymentStep from "./steps/payment";
import ReviewAndBookStep from "./steps/review-and-book";

const STEPS = [
  { id: "guestDetails", Content: GuestDetailsStep, cta: "continue", ownsFooter: false },
  { id: "extras", Content: ExtrasStep, cta: "continue", ownsFooter: false },
  { id: "reviewAndBook", Content: ReviewAndBookStep, cta: "confirmBooking", ownsFooter: false },
  { id: "payment", Content: PaymentStep, cta: "continue", ownsFooter: true },
] as const;

type Step = (typeof STEPS)[number]["id"];
type Cta = (typeof STEPS)[number]["cta"] | "saveAndContinue";

const REVIEW_INDEX = STEPS.findIndex(({ id }) => id === "reviewAndBook");

/*
 * BookingSteps — the four-step accordion of the booking flow (Figma 859:33153 /
 * 969:74447 / 969:74929). The `STEPS` list above is the whole flow: order, titles and
 * body component and CTA label. A step renders its body only — the card, the numbered badge,
 * the chevron toggle, the separators around the body and the CTA all belong here.
 * The body owns its own padding, because a step may be one padded block (Guest Details) or
 * several separated by a full-bleed rule (Extras).
 * Continue runs `trigger(step)`, which validates that branch of the schema and nothing
 * else, and advances only when it passes; the step never touches submission — except
 * Review, whose Confirm creates the held booking (see `confirmBooking`).
 * Earlier headers stay clickable, so a step can be revisited. Payment is the exception: it
 * is locked until Confirm has produced a booking, because everything in it needs one. Left
 * open, it mounts a full card form that cannot be submitted, and a wallet button that opens
 * Google Pay only to fail — the customer authorises a payment and is told no, for a reason
 * that has nothing to do with their card.
 * `multiple={false}` also means the open step cannot be toggled shut — one is always
 * expanded, except after the last Continue.
 */
export default function BookingSteps() {
  const t = useTranslations("Booking");
  const { trigger, getValues, setValue } = useFormContext<BookingValues>();
  const { listing, quote, extras, bookingId, setBookingId, setExtras } = useBooking();
  const createHold = useMutation(createHoldMutationOptions());
  const [open, setOpen] = useState<Step | null>(STEPS[0].id);
  const [completed, setCompleted] = useState<Set<Step>>(new Set());
  /* Extras has been shown once in answer to a Confirm that skipped it — see `confirmBooking`. */
  const [extrasPrompted, setExtrasPrompted] = useState(false);

  /* `onTouched` only goes live after a blur, and `trigger` does not touch anything — so a failed
   * step has to touch its own fields, or a corrected one stays red until the next attempt. */
  function touch(step: Step) {
    for (const field of Object.keys(getValues(step))) {
      // SAFETY: the field names are read back off the step's own values, so the joined path
      // always names a leaf of BookingValues.
      const path = `${step}.${field}` as Path<BookingValues>;
      setValue(path, getValues(path), { shouldTouch: true });
    }
  }

  /*
   * Whether the step has anything to choose. It drives both the CTA label — with add-ons on
   * screen the button commits a choice and says so, with only the included items "Save" would
   * be a promise about nothing — and whether skipping the step is worth interrupting a Confirm.
   *
   * Counts only the extras this booking can actually buy: one the provider cannot price at
   * all, and one the operator left off the offer for these dates, are both shown but not
   * offered, so a listing carrying nothing else must not promise a Save that commits anything.
   */
  const offeredCodes = quote?.offeredExtras && new Set(quote.offeredExtras.map((it) => it.code));
  const hasOptionalExtras =
    (listing?.optionalExtras.filter(
      (item) => item.selectable && (offeredCodes?.has(item.code) ?? true),
    ).length ?? 0) > 0;

  /*
   * The step reprices as it is edited now — `selectExtras` debounces, which is what the four
   * round trips this used to avoid actually needed — so by the time Continue runs the quote
   * usually already holds these picks and `setExtras` returns without a call. What remains is
   * the flush: a Continue pressed inside the debounce window must not leave the step on a
   * quote that never saw the last tick.
   *
   * Keyed on the selection itself rather than on whether the step was completed, because the
   * step can be reopened and changed after a Continue; comparing the sorted codes is what
   * stops both a silently dropped change and a pointless supersede when nothing moved.
   */
  const committedExtras = useRef<string | null>(null);

  /*
   * The wizard is entered with a `quoteId` and nothing else, so the form has no idea what was
   * ticked on the listing page: the sidebar listed three selected extras beside a step whose
   * boxes were all empty, and a Continue would have committed that emptiness back over them.
   * Seeded once, from the quote the provider read them off — after that the form owns them,
   * or the step would fight the user's own unticking.
   */
  const seededExtras = useRef(false);
  useEffect(() => {
    if (seededExtras.current || extras.length === 0) return;
    seededExtras.current = true;
    setValue("extras.optional", [...extras]);
  }, [extras, setValue]);

  async function commitExtras() {
    const picks = getValues("extras.optional");
    const key = [...picks].sort().join("|");
    if (committedExtras.current === key) return;
    committedExtras.current = key;
    await setExtras(picks);
  }

  async function advanceStep(step: Step, index: number) {
    if (!(await trigger(step))) {
      touch(step);
      return;
    }
    if (step === "extras") await commitExtras();
    setCompleted((prev) => new Set(prev).add(step));
    setOpen(STEPS[index + 1]?.id ?? null);
  }

  /*
   * Confirm holds the booking with the guest details and consents. It does not gate on sign-in:
   * an anonymous visitor gets an account provisioned from their email and a booking-scoped token
   * back, which is remembered here and carried by every later call in the flow. The `bookingId`
   * lands in the shared context for the payment step.
   * Headers are clickable, so Review can be reached without passing through the steps before it.
   * Confirm therefore validates the whole prefix, not just its own branch — otherwise an empty
   * guest block reaches `createHold` and comes back as a server validation error with no field
   * to point at.
   */
  async function confirmBooking() {
    /*
     * Already held. Confirm stays on screen because Review can be reopened to re-read what was
     * booked, but pressing it again must not mint a second booking — it only returns to payment.
     */
    if (bookingId) {
      setOpen("payment");
      return;
    }

    /*
     * Extras never blocks a booking — nothing in it is required — but the step headers let
     * someone jump straight to Review, and confirming then books past a page of paid add-ons
     * they never saw. So the first such Confirm opens Extras instead of holding; pressing
     * Confirm again goes through, and using the step's own Continue skips this entirely.
     */
    if (hasOptionalExtras && !completed.has("extras") && !extrasPrompted) {
      setExtrasPrompted(true);
      setOpen("extras");
      toast.info(t("extrasSkipped"));
      return;
    }

    /*
     * Reaching Confirm without pressing the Extras step's own Continue leaves the picks
     * uncommitted, so they are committed here. Awaited: the reprice supersedes the quote, and
     * holding against the previous one would book the charter without the extras.
     */
    await commitExtras();

    for (const { id } of STEPS.slice(0, REVIEW_INDEX + 1)) {
      if (!(await trigger(id))) {
        touch(id);
        setOpen(id);
        return;
      }
      /* Review is marked complete only once the hold exists, below. */
      if (id !== "reviewAndBook") setCompleted((prev) => new Set(prev).add(id));
    }
    if (!quote) return;

    const guest = getValues("guestDetails");
    try {
      const hold = await createHold.mutateAsync({
        quoteId: quote.quoteId,
        /*
         * One quote, one booking. Without a key the server mints a fresh UUID per call, so a
         * double submit that races the disabled state is two bookings and two provider options;
         * with it the retry returns the first one. A reprice yields a new quote, hence a new key.
         */
        idempotencyKey: quote.quoteId,
        guest: {
          fullName: guest.fullName,
          email: guest.email,
          phone: guest.phone,
          countryCode: guest.countryCode,
          specialRequests: guest.specialRequests || undefined,
        },
        consents: { terms: true, cancellationPolicy: true },
      });
      rememberGuestAccess(hold.bookingId, hold.accessToken);
      setBookingId(hold.bookingId);
      setCompleted((prev) => new Set(prev).add("reviewAndBook"));
      setOpen("payment");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.confirmFailed"));
    }
  }

  const ctaFor = (step: Step, cta: Cta): Cta =>
    step === "extras" && hasOptionalExtras ? "saveAndContinue" : cta;

  return (
    <div className="flex w-full flex-col gap-6">
      {STEPS.map(({ id: step, Content, cta, ownsFooter }, index) => (
        <Accordion
          key={step}
          multiple={false}
          value={open === step ? [step] : []}
          onValueChange={(value) => setOpen(value.length > 0 ? step : null)}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          {/* Unlocks the moment Confirm succeeds, which also opens this step. */}
          <AccordionItem value={step} disabled={step === "payment" && !bookingId}>
            <AccordionTrigger
              className="p-5"
              indicator={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-natural-50">
                  <ChevronDown className="size-4 transition-transform duration-200 group-data-panel-open:rotate-180" />
                </span>
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                {completed.has(step) ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check className="size-5" />
                  </span>
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px] leading-[1.3] font-semibold text-foreground">
                    {index + 1}
                  </span>
                )}
                <span className="truncate text-xl leading-[1.1] font-semibold text-foreground md:text-2xl md:leading-[1.3]">
                  {t(`steps.${step}`)}
                </span>
              </span>
            </AccordionTrigger>

            <AccordionContent>
              <span aria-hidden className="block h-px w-full bg-border" />
              <Content />
              {!ownsFooter && (
                <>
                  <span aria-hidden className="block h-px w-full bg-border" />
                  <div className="p-5">
                    <Button
                      variant="brand"
                      className="h-13 w-full"
                      loading={step === "reviewAndBook" && createHold.isPending}
                      /* The booking exists; this step is now a record of it, not an action. */
                      disabled={step === "reviewAndBook" && Boolean(bookingId)}
                      onClick={() =>
                        void (step === "reviewAndBook"
                          ? confirmBooking()
                          : advanceStep(step, index))
                      }
                    >
                      {step === "reviewAndBook" && bookingId ? t("booked") : t(ctaFor(step, cta))}
                    </Button>
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ))}
    </div>
  );
}
