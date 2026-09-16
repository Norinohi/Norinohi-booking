"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";

import { LeadEnquiryForm } from "@/components/shared/form/lead-enquiry-form";

import { useBooking } from "./booking-provider";

/*
 * "Request Quote" from the yacht sidebar. The price is already on screen, so this is an enquiry, not
 * a pricing call: it records a `quote_request` lead and staff follow up. `context` carries what the
 * visitor was looking at — the priced dates, guests and crew — so the enquiry is actionable on its own.
 *
 * As a `booking_request` it stands in for Pay Now on a yacht whose operator confirms each booking by
 * hand: the same form, worded as a request for the quoted charter, with its total for the manager.
 */
interface QuoteRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: "quote_request" | "booking_request";
}

export default function QuoteRequestDialog({
  open,
  onOpenChange,
  kind = "quote_request",
}: QuoteRequestDialogProps) {
  const t = useTranslations(
    kind === "booking_request" ? "YachtDetail.bookingRequestDialog" : "YachtDetail.quoteDialog",
  );
  const { listing, quote, guests, crewType } = useBooking();

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <LeadEnquiryForm
          kind={kind}
          askCountry
          listingId={listing.id}
          context={{
            checkIn: quote?.checkIn,
            checkOut: quote?.checkOut,
            guests,
            crewType,
            quoteId: quote?.quoteId,
            total: quote?.total,
          }}
          submitLabel={t("submit")}
          successMessage={t("success")}
          submitClassName="w-full"
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
