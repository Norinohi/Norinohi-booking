"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { ArrowUpRight, CalendarX, CheckCircle2, LifeBuoy, Mail, Phone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { LeadEnquiryForm } from "@/components/shared/form/lead-enquiry-form";
import Loader from "@/components/shared/feedback/loader";
import { Link } from "@/i18n/navigation";

import {
  askQuestionMutationOptions,
  type BookingDetail,
  bookingDetailQueryOptions,
} from "../api/queries";
import { guestAccessFor } from "../lib/guest-access";
import { supportParsers } from "../lib/support-params";

const MESSAGE_MAX = 2000;

/**
 * /support — one page for "talk to a human", reached from the booking pages.
 *
 * Arriving with `?booking=<id>` the message is filed against that booking through
 * `checkout.askQuestion`, so staff open it already knowing which charter is being asked about
 * and the customer does not have to quote a reference. Arriving without one — or without the
 * rights to read that booking — it falls back to the same enquiry form the rest of the site
 * uses, which asks for a name and an email because nothing else identifies the sender.
 */
export default function SupportScreen() {
  const t = useTranslations("Booking.support");
  const [{ booking: bookingId, topic }] = useQueryStates(supportParsers);
  const cancelling = topic === "cancellation";

  /* localStorage does not exist during prerender, so the token resolves after mount and the
     booking read waits for it — `null` is "not looked yet", not "no token". */
  const [access, setAccess] = useState<{ token: string | undefined } | null>(null);
  useEffect(() => setAccess({ token: guestAccessFor(bookingId) }), [bookingId]);

  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId ?? "", access?.token),
    enabled: Boolean(bookingId) && access !== null,
    /* No rights to this booking is not an error here — the general enquiry form takes over. */
    meta: { silent: true },
  });

  const waiting = Boolean(bookingId) && (access === null || isLoading);

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-8 md:px-13.5 md:py-15">
      <div className="mx-auto flex w-full max-w-175 flex-col gap-6 rounded-3xl bg-card p-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:gap-8 md:p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand">
            {cancelling ? <CalendarX className="size-6" /> : <LifeBuoy className="size-6" />}
          </span>
          <h1 className="text-[28px] leading-[1.1] font-medium text-foreground md:text-[32px]">
            {cancelling ? t("cancellation.title") : t("title")}
          </h1>
          <p className="text-base leading-[1.4] text-natural-600">
            {cancelling ? t("cancellation.subtitle") : t("subtitle")}
          </p>
        </div>

        {waiting ? (
          <div className="flex justify-center py-8">
            <Loader />
          </div>
        ) : booking ? (
          <BookingQuestion booking={booking} token={access?.token} cancelling={cancelling} />
        ) : (
          <LeadEnquiryForm
            kind="charter_expert"
            context={bookingId ? { bookingId } : undefined}
            submitLabel={t("send")}
            submitClassName="w-full"
            successMessage={t("sent")}
          />
        )}
      </div>
    </div>
  );
}

/** The message form for a booking we could read: no name or email, the booking is the identity. */
function BookingQuestion({
  booking,
  token,
  cancelling,
}: {
  booking: BookingDetail;
  token: string | undefined;
  cancelling: boolean;
}) {
  const t = useTranslations("Booking.support");
  const format = useFormatter();
  const [sent, setSent] = useState(false);
  const askQuestion = useMutation(askQuestionMutationOptions());

  const schema = useMemo(
    () => z.object({ message: z.string().trim().min(1, t("required")).max(MESSAGE_MAX) }),
    [t],
  );

  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  /*
   * A cancellation opens with the request already written, so the customer only adds their
   * reason. Staff then read one enquiry that says what it is, rather than having to infer it.
   */
  const opening = cancelling
    ? t("cancellation.template", {
        reference: booking.reference,
        dates: `${day(booking.checkIn)} → ${day(booking.checkOut)}`,
      })
    : "";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { message: opening },
    mode: "onTouched",
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      await askQuestion.mutateAsync({
        bookingId: booking.id,
        accessToken: token,
        question: values.message,
      });
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  /* Back to the charter this message is about — the same trip is one tap away either way. */
  const summary = (
    <Link
      href={`/bookings/${booking.id}`}
      className="group flex flex-col gap-2 rounded-2xl bg-natural-50 p-4 transition-colors hover:bg-natural-100"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-foreground group-hover:underline">
          {booking.listing.title}
        </span>
        <Chip className="shrink-0">{booking.reference}</Chip>
        <ArrowUpRight className="size-4 shrink-0 text-natural-500" />
      </div>
      <span className="text-sm text-natural-600">
        {day(booking.checkIn)} → {day(booking.checkOut)} · {booking.base.name},{" "}
        {booking.base.countryName}
      </span>
    </Link>
  );

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        {summary}
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-10 text-positive-600" />
          <p className="text-xl leading-[1.3] font-bold text-foreground">
            {cancelling ? t("cancellation.sentTitle") : t("sentTitle")}
          </p>
          <p className="text-base leading-[1.4] text-natural-600">
            {cancelling ? t("cancellation.sentBody") : t("sentBody")}
          </p>
        </div>
        <Button
          variant="neutral"
          className="w-full"
          nativeButton={false}
          render={<Link href={`/bookings/${booking.id}`} />}
        >
          {t("backToBooking")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {summary}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-6">
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {cancelling ? t("cancellation.messageLabel") : t("messageLabel")}
                </FormLabel>
                <FormControl>
                  <TextField
                    className="h-full"
                    multiline
                    placeholder={
                      cancelling ? t("cancellation.messagePlaceholder") : t("messagePlaceholder")
                    }
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="brand"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {cancelling ? t("cancellation.send") : t("send")}
          </Button>
        </form>
      </Form>

      {booking.base.phone || booking.base.email ? (
        <div className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
          <span className="text-sm font-bold text-foreground">{t("marinaContact")}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-natural-600">
            {booking.base.phone ? (
              <a
                href={`tel:${booking.base.phone}`}
                className="flex items-center gap-2 transition-colors hover:text-brand"
              >
                <Phone className="size-4 shrink-0" />
                {booking.base.phone}
              </a>
            ) : null}
            {booking.base.email ? (
              <a
                href={`mailto:${booking.base.email}`}
                className="flex items-center gap-2 transition-colors hover:text-brand"
              >
                <Mail className="size-4 shrink-0" />
                {booking.base.email}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
