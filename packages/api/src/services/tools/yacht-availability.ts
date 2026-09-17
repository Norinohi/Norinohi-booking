import { z } from "zod";

import {
  availabilityCalendarInputSchema,
  availabilityConstraintsSchema,
} from "../../contracts/catalog";
import { nightsBetween } from "../../lib/availability-rules";
import { combinedFirstBookablePeriod } from "../../lib/offer-availability";
import { loadListingOffers } from "./listing-offers";
import { defineTool } from "./tool";

/** Wider than a season plus the booking horizon, narrow enough that one call stays one cheap read. */
export const MAX_AVAILABILITY_WINDOW_DAYS = 550;

export const yachtAvailabilityInputSchema = availabilityCalendarInputSchema.refine(
  (input) => nightsBetween(input.from, input.to) <= MAX_AVAILABILITY_WINDOW_DAYS,
  { message: `The window may span at most ${MAX_AVAILABILITY_WINDOW_DAYS} days`, path: ["to"] },
);

export const yachtAvailabilityOutputSchema = z.object({
  constraints: availabilityConstraintsSchema,
  /** The earliest charter any offer sells from `from`, inside the window. */
  firstBookablePeriod: z
    .object({ checkIn: z.string(), checkOut: z.string(), offerId: z.string() })
    .nullable(),
});

export const yachtAvailability = defineTool({
  name: "yachtAvailability",
  description:
    "What one yacht will sell between two dates: per selling offer, the allowed check-in and check-out weekdays and night counts, the periods already taken or refused, the periods carrying a published rate, and one-way rules. Also names the earliest bookable charter from the start of the window. Use before quoting a period.",
  input: yachtAvailabilityInputSchema,
  output: yachtAvailabilityOutputSchema,
  run: async (ctx, input) => {
    const { constraints, offers } = await loadListingOffers(ctx.db, input);
    const first = combinedFirstBookablePeriod(input.from, offers);

    return {
      constraints,
      // Nothing past `to` was read, so a period ending there would be judged on missing data.
      firstBookablePeriod:
        first && first.endDate <= input.to
          ? { checkIn: first.startDate, checkOut: first.endDate, offerId: first.offerId }
          : null,
    };
  },
});
