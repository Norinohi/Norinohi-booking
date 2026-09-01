"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Textarea } from "@yacht-charter/ui/components/form/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import CountryCombobox from "@/components/shared/form/country-combobox";

import CrewPlaceField from "./crew-place-field";

import {
  type BookingDetail,
  bookingCrewRequirementsQueryOptions,
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

/**
 * The operator's field names for the questions this form asks, so a requirement can be marked
 * on the field that answers it. `name` and `surname` are one requirement each; the charter
 * dates answer `embarkmentDate`/`disembarkmentDate` without anyone typing them.
 *
 * Two names for one document, because operators file it under both: a live pass over the
 * account's own reservations (Sep 2026) found companies asking for `documentNumber` and
 * companies asking for `identificationDocumentNumber`, meaning the same passport.
 */
const FIELD_NAMES = {
  firstName: ["name"],
  lastName: ["surname"],
  dateOfBirth: ["birthDate"],
  birthPlace: ["birthPlace"],
  birthCountry: ["birthCountry"],
  nationality: ["nationality"],
  documentType: ["documentType", "identificationDocumentType"],
  documentNumber: ["documentNumber", "identificationDocumentNumber"],
  gender: ["gender"],
  livingPlace: ["livingPlace"],
  livingCountry: ["livingCountry"],
  skipperLicence: ["skipperLicence"],
  vhfLicence: ["vhfLicence"],
} as const;

/**
 * What an operator can ask for that this form does not collect. Named in the customer's own
 * language rather than printed as `shoeSize`, and left as a sentence rather than a field: the
 * base asks for these at the desk, and a crewed yacht wanting shoe sizes is not a manifest.
 */
const UNCOLLECTED_FIELDS = ["shoeSize", "disabledPerson"] as const;

/**
 * The one country whose crew list will not take a place typed freehand: NauSYS publishes the
 * 6,851 Croatian place names it accepts and validates none of them on the way in, so a near
 * miss is taken by the API and questioned at the desk instead.
 */
const PLACE_LIST_COUNTRY = "HR";

const EMPTY_MEMBER = {
  firstName: "",
  lastName: "",
  role: "",
  isSkipper: false,
  dateOfBirth: "",
  documentType: "",
  documentNumber: "",
  nationality: "",
  gender: "",
  birthPlace: "",
  birthCountry: "",
  livingPlace: "",
  livingCountry: "",
  skipperLicence: "",
  vhfLicence: "",
  skipperEmail: "",
  skipperMobile: "",
};

/**
 * Mirrors `travellerInputSchema` on the server, with every optional field modelled as an empty
 * string because that is what an untouched input holds. `toInput` below is what turns a blank
 * back into an absent field, so a half-filled list saves rather than failing — which is the
 * point: an incomplete list still saves the customer time at the desk.
 */
function useCrewSchema() {
  const t = useTranslations("Booking.detail.crewList");

  return useMemo(
    () =>
      z.object({
        travellers: z
          .array(
            z.object({
              firstName: z.string().trim().min(2, t("errors.firstName")).max(100),
              lastName: z.string().trim().min(2, t("errors.lastName")).max(100),
              role: z.string().trim().max(64),
              isSkipper: z.boolean(),
              /* Blank is allowed; a date that is typed has to be a real one. */
              dateOfBirth: z.union([z.literal(""), z.iso.date(t("errors.dateOfBirth"))]),
              documentType: z.string(),
              documentNumber: z.string().trim().max(64),
              nationality: z.string(),
              gender: z.string(),
              birthPlace: z.string().trim().max(120),
              birthCountry: z.string(),
              livingPlace: z.string().trim().max(120),
              livingCountry: z.string(),
              skipperLicence: z.string().trim().max(64),
              vhfLicence: z.string().trim().max(64),
              skipperEmail: z.union([z.literal(""), z.email(t("errors.skipperEmail"))]),
              skipperMobile: z.string().trim().max(32),
            }),
          )
          .max(MAX_TRAVELLERS)
          /* The operator's list has one skipper slot, and the server refuses a second. */
          .refine((travellers) => travellers.filter((member) => member.isSkipper).length <= 1, {
            message: t("errors.oneSkipper"),
          }),
        note: z.string().trim().max(500),
      }),
    [t],
  );
}

type CrewValues = z.infer<ReturnType<typeof useCrewSchema>>;
type CrewMember = CrewValues["travellers"][number];
type TravellerInput = SaveTravellersInput["travellers"][number];

/** Empty strings mean "not given", which the contract expresses by omitting the field. */
function toInput(member: CrewMember): TravellerInput {
  const input: TravellerInput = {
    firstName: member.firstName.trim(),
    lastName: member.lastName.trim(),
    isSkipper: member.isSkipper,
  };

  const role = member.role.trim();
  if (role) input.role = role;
  if (member.dateOfBirth) input.dateOfBirth = member.dateOfBirth;
  if (isDocumentType(member.documentType)) input.documentType = member.documentType;
  if (member.documentNumber.trim()) input.documentNumber = member.documentNumber.trim();
  if (member.nationality) input.nationality = member.nationality;
  if (isGender(member.gender)) input.gender = member.gender;
  if (member.birthPlace.trim()) input.birthPlace = member.birthPlace.trim();
  if (member.birthCountry) input.birthCountry = member.birthCountry;
  if (member.livingPlace.trim()) input.livingPlace = member.livingPlace.trim();
  if (member.livingCountry) input.livingCountry = member.livingCountry;

  /* The licence fields belong to whoever is sailing the boat, and only to them. */
  if (member.isSkipper) {
    if (member.skipperLicence.trim()) input.skipperLicence = member.skipperLicence.trim();
    if (member.vhfLicence.trim()) input.vhfLicence = member.vhfLicence.trim();
    if (member.skipperEmail) input.skipperEmail = member.skipperEmail;
    if (member.skipperMobile.trim()) input.skipperMobile = member.skipperMobile.trim();
  }

  return input;
}

/* The select holds a string; the contract holds an enum. These are the two crossings. */
function isDocumentType(value: string): value is NonNullable<TravellerInput["documentType"]> {
  return value === "PASSPORT" || value === "IDCARD" || value === "OTHER";
}

function isGender(value: string): value is NonNullable<TravellerInput["gender"]> {
  return value === "MALE" || value === "FEMALE";
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
 * Saving files the list with the operator, and the answer comes back with the save: accepted,
 * refused with the reason, or unreachable. That last one is why the panel says what happened
 * rather than only "saved" — an unsent list means the base asks for all of it on arrival.
 *
 * It is the only screen in the app that collects identity documents. The values are encrypted
 * before they are stored and are never returned by any other procedure, so this component
 * fetches them from `booking.travellers.list` rather than reading them off the booking it
 * sits inside.
 */
export default function CrewListPanel({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("Booking.detail.crewList");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const schema = useCrewSchema();

  const closed = CLOSED_STATUSES.has(booking.status);
  const listOptions = bookingTravellersQueryOptions(booking.id);

  const { data, isLoading } = useQuery({ ...listOptions, enabled: !closed });
  const { data: requirements } = useQuery({
    ...bookingCrewRequirementsQueryOptions(booking.id),
    enabled: !closed,
  });

  const required = useMemo(() => new Set(requirements?.fields ?? []), [requirements]);
  /* What this operator wants that we never ask for; the base collects it on arrival. */
  const alsoAsked = UNCOLLECTED_FIELDS.filter((field) => required.has(field)).map((field) =>
    t(`requires.${field}`),
  );

  const form = useForm<CrewValues>({
    defaultValues: { travellers: [], note: "" },
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
      note: "",
      travellers: data.travellers.map((member) => ({
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role ?? "",
        isSkipper: member.isSkipper,
        dateOfBirth: member.dateOfBirth ?? "",
        documentType: member.documentType ?? "",
        documentNumber: member.documentNumber ?? "",
        nationality: member.nationality ?? "",
        gender: member.gender ?? "",
        birthPlace: member.birthPlace ?? "",
        birthCountry: member.birthCountry ?? "",
        livingPlace: member.livingPlace ?? "",
        livingCountry: member.livingCountry ?? "",
        skipperLicence: member.skipperLicence ?? "",
        vhfLicence: member.vhfLicence ?? "",
        skipperEmail: member.skipperEmail ?? "",
        skipperMobile: member.skipperMobile ?? "",
      })),
    });
  }, [data, form]);

  const save = useMutation({
    ...saveTravellersMutationOptions(),
    onSuccess: (result) => {
      queryClient.setQueryData(listOptions.queryKey, result);
      /* Saved is not sent. The customer is owed the difference. */
      if (!result.submission || result.submission.accepted) toast.success(t("saved"));
      else toast.warning(t("savedNotSent"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("saveFailed")),
  });

  if (closed) return null;

  const submit = form.handleSubmit((values) => {
    const note = values.note.trim();
    save.mutate({
      bookingId: booking.id,
      travellers: values.travellers.map(toInput),
      ...(note ? { note } : null),
    });
  });

  const documentTypes = [
    { value: "PASSPORT", label: t("documents.passport") },
    { value: "IDCARD", label: t("documents.idCard") },
    { value: "OTHER", label: t("documents.other") },
  ];
  const genders = [
    { value: "MALE", label: t("genders.male") },
    { value: "FEMALE", label: t("genders.female") },
  ];

  /** A label the operator insists on carries the mark the legend explains. */
  const label = (field: keyof typeof FIELD_NAMES): ReactNode =>
    FIELD_NAMES[field].some((name) => required.has(name)) ? `${t(field)} *` : t(field);

  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h2>
      </div>

      <Notification>{t("notice")}</Notification>

      {/* What this particular charter company wants, which the generic notice cannot say.
          Advisory throughout: nothing here gates the save, because the base collects whatever
          is missing on arrival either way. */}
      {required.size > 0 ? <p className="text-sm text-natural-500">{t("legend")}</p> : null}
      {alsoAsked.length > 0 ? (
        <p className="text-sm text-natural-500">
          {t("alsoAsked", { fields: alsoAsked.join(", ") })}
        </p>
      ) : null}
      {requirements?.maxPassengers ? (
        <p className="text-sm text-natural-500">
          {t("maxPassengers", { count: requirements.maxPassengers })}
        </p>
      ) : null}

      {data?.submission ? (
        <p className="text-sm text-natural-500">
          {data.submission.accepted
            ? t("sent", { when: format.dateTime(data.submission.submittedAt, "day") })
            : t("notSent", { reason: data.submission.message ?? t("notSentUnknown") })}
        </p>
      ) : null}

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
                    name={`travellers.${index}.firstName`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("firstName")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("firstNamePlaceholder")} {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.lastName`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("lastName")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("lastNamePlaceholder")} {...input} />
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
                        <FormLabel>{label("dateOfBirth")}</FormLabel>
                        <FormControl>
                          <TextField type="date" {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.gender`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("gender")}</FormLabel>
                        <FormControl>
                          <Select
                            options={genders}
                            value={input.value}
                            onValueChange={input.onChange}
                            placeholder={t("genderPlaceholder")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.birthPlace`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("birthPlace")}</FormLabel>
                        <FormControl>
                          {form.watch(`travellers.${index}.birthCountry`) === PLACE_LIST_COUNTRY ? (
                            <CrewPlaceField
                              bookingId={booking.id}
                              value={input.value}
                              onValueChange={input.onChange}
                              onBlur={input.onBlur}
                              placeholder={t("placePlaceholder")}
                            />
                          ) : (
                            <TextField placeholder={t("placePlaceholder")} {...input} />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.birthCountry`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("birthCountry")}</FormLabel>
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

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.nationality`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("nationality")}</FormLabel>
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

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.documentType`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("documentType")}</FormLabel>
                        <FormControl>
                          <Select
                            options={documentTypes}
                            value={input.value}
                            onValueChange={input.onChange}
                            placeholder={t("documentTypePlaceholder")}
                          />
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
                        <FormLabel>{label("documentNumber")}</FormLabel>
                        <FormControl>
                          <TextField placeholder={t("documentNumberPlaceholder")} {...input} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.livingPlace`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("livingPlace")}</FormLabel>
                        <FormControl>
                          {form.watch(`travellers.${index}.livingCountry`) ===
                          PLACE_LIST_COUNTRY ? (
                            <CrewPlaceField
                              bookingId={booking.id}
                              value={input.value}
                              onValueChange={input.onChange}
                              onBlur={input.onBlur}
                              placeholder={t("placePlaceholder")}
                            />
                          ) : (
                            <TextField placeholder={t("placePlaceholder")} {...input} />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`travellers.${index}.livingCountry`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormLabel>{label("livingCountry")}</FormLabel>
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
                </div>

                {/* The skipper is a role the operator files separately, with credentials
                    attached: an operator that requires a licence refuses the boat without
                    it, which is why they are collected here rather than left to the desk. */}
                <FormField
                  control={form.control}
                  name={`travellers.${index}.isSkipper`}
                  render={({ field: input }) => (
                    <FormItem className="flex flex-row items-center gap-3">
                      <FormControl>
                        <Checkbox checked={input.value} onCheckedChange={input.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">{t("isSkipper")}</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch(`travellers.${index}.isSkipper`) ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`travellers.${index}.skipperLicence`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormLabel>{label("skipperLicence")}</FormLabel>
                          <FormControl>
                            <TextField placeholder={t("skipperLicencePlaceholder")} {...input} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`travellers.${index}.vhfLicence`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormLabel>{label("vhfLicence")}</FormLabel>
                          <FormControl>
                            <TextField {...input} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`travellers.${index}.skipperEmail`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormLabel>{t("skipperEmail")}</FormLabel>
                          <FormControl>
                            <TextField type="email" {...input} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`travellers.${index}.skipperMobile`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormLabel>{t("skipperMobile")}</FormLabel>
                          <FormControl>
                            <TextField type="tel" {...input} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : null}
              </div>
            ))}

            {/* Goes to the base with the list: an arrival time, a late flight, a wheelchair. */}
            <FormField
              control={form.control}
              name="note"
              render={({ field: input }) => (
                <FormItem>
                  <FormLabel>{t("note")}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("notePlaceholder")} {...input} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
