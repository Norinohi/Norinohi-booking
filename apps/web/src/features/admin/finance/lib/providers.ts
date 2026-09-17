import { DEFAULT_TRANSACTING_PREFERENCE, providerMeta } from "@yacht-charter/env/providers";

/* The mock fixture is not a vendor anybody negotiates a rate with, as on the settings screen. */
export const COMMISSION_PROVIDERS = DEFAULT_TRANSACTING_PREFERENCE.filter(
  (key) => !providerMeta(key).fixture,
);
