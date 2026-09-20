import { auditAdminRouter } from "./audit";
import { bookingAdminRouter, invoiceAdminRouter, paymentAdminRouter } from "./booking";
import { commissionAdminRouter } from "./commission";
import { discountAdminRouter } from "./discount";
import { faqAdminRouter } from "./faq";
import { enquiryAdminRouter, leadAdminRouter } from "./inbox";
import { listingAdminRouter, listingPriceAdminRouter } from "./listing";
import { maintenanceAdminRouter } from "./maintenance";
import { matchAdminRouter } from "./match";
import { popularFacetsAdminRouter } from "./popular-facets";
import { popularYachtsAdminRouter } from "./popular-yachts";
import { providerAdminRouter } from "./provider";
import { geographyAdminRouter, routeAdminRouter } from "./route";
import { settingsAdminRouter } from "./settings";
import { userAdminRouter } from "./user";

export const adminRouter = {
  settings: settingsAdminRouter,
  /* The suggested-route library and the geography picker it targets. */
  route: routeAdminRouter,
  geography: geographyAdminRouter,
  /* The FAQ editor. It speaks in translation groups rather than rows, and none of that shape is
     shared with anything else in here. */
  faq: faqAdminRouter,
  /* The curated order of the facet values: two procedures over one pair of rank columns,
     sharing nothing with the screens above. */
  popularFacets: popularFacetsAdminRouter,
  /* The home page's popular-yachts slider, beside the other website content rather than in
     settings: it is editorial curation, and it writes one column of the settings row only. */
  popularYachts: popularYachtsAdminRouter,
  user: userAdminRouter,
  provider: providerAdminRouter,
  match: matchAdminRouter,
  audit: auditAdminRouter,
  booking: bookingAdminRouter,
  invoice: invoiceAdminRouter,
  payment: paymentAdminRouter,
  maintenance: maintenanceAdminRouter,
  lead: leadAdminRouter,
  enquiry: enquiryAdminRouter,
  commission: commissionAdminRouter,
  discount: discountAdminRouter,
  listing: listingAdminRouter,
  listingPrice: listingPriceAdminRouter,
};
