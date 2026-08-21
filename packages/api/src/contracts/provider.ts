import { providerCapabilitiesSchema } from "@yacht-charter/providers";

import { providerKeyOutputSchema } from "./admin";

/**
 * The adapter quoting and checkout run through, with the capabilities it reports.
 *
 * `provider` is not the sync dropdown's selection: `PROVIDER_MODE` decides who we sell
 * through, and importing from a vendor is a separate question. It is named so the screen can
 * say which connector its capability chips describe instead of showing them unattributed.
 *
 * Its own file rather than `contracts/admin.ts`: importing the providers barrel loads the
 * registry, which reads the server env at module scope, and `services/match.ts` pulls the
 * admin contracts into a unit test that has none.
 */
export const activeConnectorSchema = providerCapabilitiesSchema.extend({
  provider: providerKeyOutputSchema,
});
