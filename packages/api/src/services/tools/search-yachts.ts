import { listingSearchInputSchema, searchResultSchema } from "../../contracts/catalog";
import { searchCharterResults } from "../charter-search";
import { defineTool } from "./tool";

export const searchYachts = defineTool({
  name: "searchYachts",
  description:
    "Search the yacht charter catalogue. Filter by country, sailing area, marina, dates (checkIn/checkOut, or startDate with duration in nights), guests, cabins, boat type, crew (bareboat, skipper, full-crew) and price in minor units. Returns one card per yacht with its cheapest known price and the charter period that price covers; prices are indicative until quoted.",
  input: listingSearchInputSchema,
  output: searchResultSchema,
  run: (ctx, input) => searchCharterResults(ctx.db, input),
});
