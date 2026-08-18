"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import CountryCombobox from "@/components/shared/form/country-combobox";

import {
  type BookingDetail,
  bookingTravellersQueryOptions,
  type SaveTravellersInput,
  saveTravellersMutationOptions,
} from "../api/queries";

/** `travellerSaveInputSchema` caps the list; the form stops at the same number. */
const MAX_TRAVELLERS = 50;

/**
 * A booking that is off, or was never on. `saveTravellers` refuses these server-side —
 * collecting identity documents for a charter nobody is taking is data we should not hold —
 * so the panel does not offer the form either.
 */
const CLOSED_STATUSES = new Set([
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "PROVIDER_REJECTED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
]);

const EMPTY_MEMBER = {
  fullName: "",
  role: "",
  dateOfBirth: "",
  documentNumber: "",
  nationality: "",
};

/**
 * Mirrors `travellerInputSchema` on the server, with the optional fields modelled as
 * empty strings because that is what an untouched input holds. `toInput` below is what
 * turns a blank back into an absent field, so a half-filled row saves rather than failing.
 */
function useCrewSchema() {
  const t = useTranslations("Booking.detail.crewList");

  return useMemo(
    () =>
      z.object({
        travellers: z
          .array(
            z.object({
              fullName: z.string().trim().min(2, t("errors.fullName")).max(200),
              role: z.string().trim().max(64),
              /* Blank is allowed; a date that is typed has to be a real one. */
              dateOfBirth: z.union([z.literal(""), z.iso.date(t("errors.dateOfBirth"))]),
              documentNumber: z.string().trim().max(64),
              nationality: z.string(),
            }),
          )
          .max(MAX_TRAVELLERS),
      }),
    [t],
  );
}

type CrewValues = z.infer<ReturnType<typeof useCrewSchema>>;
type TravellerInput = SaveTravellersInput["travellers"][number];

/** Empty strings mean "not given", which the contract expresses by omitting the field. */
function toInput(member: CrewValues["travellers"][number]) {
  const input: TravellerInput = { fullName: member.fullName.trim() };

  const role = member.role.trim();
  const documentNumber = member.documentNumber.trim();

  if (role) input.role = role;
  if (member.dateOfBirth) input.dateOfBirth = member.dateOfBirth;
  if (documentNumber) input.documentNumber = documentNumber;
  if (member.nationality) input.nationality = member.nationality;

  return input;
}

/**
 * The crew list, on the booking a customer comes back to.
 *
 * The charter company has to hand this to the authorities before the boat leaves — it is the
 * same obligation as a hotel check-in register, and NauSYS confirmed (Aug 2026) that the base
 * will collect whatever is missing at the desk on arrival. So the panel is a convenience, not
 * a gate: nothing here blocks the booking, and a customer who ignores it loses time at the
 * base rather than the charter.
 *
 * It is the only screen in the app that collects identity documents. The values are encrypted
 * before they are stored and are never returned by any other procedure, so this component
 * fetches them from `booking.travellers.list` rather than reading them off the booking it
 * sits inside.
 */
export default function CrewListPanel({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("Booking.detail.crewList");
  const queryClient = useQueryClient();
  const schema = useCrewSchema();

  const closed = CLOSED_STATUSES.has(booking.status);
  const listOptions = bookingTravellersQueryOptions(booking.id);

  const { data, isLoading } = useQuery({ ...listOptions, enabled: !closed });

  const form = useForm<CrewValues>({
    defaultValues: { travellers: [] },
    resolver: zodResolver(schema),
    mode: "onTouched",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "travellers" });

  /*
   * Reset rather than merge: the stored list is the whole truth, and `save` replaces it
   * wholesale. Keyed on the fetched rows so a save's own response re-seeds the form with what
   * the server actually kept — including the trimming it did.
   */
  useEffect(() => {
    if (!data) return;
    form.reset({
      travellers: data.travellers.map((member) => ({
        fullName: member.fullName,
        role: member.role ?? "",
        dateOfBirth: member.dateOfBirth ?? "",
        documentNumber: member.documentNumber ?? "",
        nationality: member.nationality ?? "",
      })),
    });
  }, [data, form]);

  const save = useMutation({
    ...saveTravellersMutationOptions(),
    onSuccess: (result) => {
      queryClient.setQueryData(listOptions.queryKey, result);
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("saveFailed")),
  });

  if (closed) return null;

  const submit = form.handleSubmit((values) => {
    save.mutate({ bookingId: booking.id, travellers: values.travellers.map(toInput) });
  });

  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h2>
      </div>

      <Notification>{t("notice")}</Notification>

      {isLoading ? (
        <p className="text-sm text-natural-500">{t("loading")}</p>
      ) : (
        <Form {...form}>
          <form onSubmit={submit} className="flex w-full flex-col gap-4">
            {fields.length === 0 ? (
              <p className="text-base leading-[1.4] text-natural-500">
                {t("empty", { guests: booking.guests })}
              </p>
            ) : null}

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-4 rounded-xl bg-natural-50 p-4 md:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base leading-[1.4] font-bold text-foreground">
                    {t("member", { number: index + 1 })}
                  </h3>
                  <IconButton
                    type="button"
                    variant="neutral"
                    size="sm"
                    aria-label={t("remove", { number: index + 1 })}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name={`travellers.${index}.fullName`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{t("fullName")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("fullNamePlaceholder")} {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.role`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{t("role")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("rolePlaceholder")} {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.dateOfBirth`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{t("dateOfBirth")}</FormLabel>
                        <FormControl>
                          <TextField type="date" {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.documentNumber`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{t("documentNumber")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("documentNumberPlaceholder")} {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.nationality`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{t("nationality")}</FormLabel>
                        <FormControl>
                          <CountryCombobox
                            value={input.value}
                            onValueChange={input.onChange}
                            onBlur={input.onBlur}
                            placeholder={t("nationalityPlaceholder")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                variant="neutral"
                className="h-13 sm:min-w-56"
                disabled={fields.length >= MAX_TRAVELLERS}
                onClick={() => append(EMPTY_MEMBER)}
              >
                <Plus />
                {t("add")}
              </Button>

              {/* Shown even with no rows: clearing the list is a save too, and an empty
                  form with no way to commit it reads as broken. */}
              <Button
                type="submit"
                variant="brand"
                className="h-13 sm:min-w-56"
                loading={save.isPending}
                disabled={save.isPending || !form.formState.isDirty}
              >
                {t("save")}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </section>
  );
}
