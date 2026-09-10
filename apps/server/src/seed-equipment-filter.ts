/**
 * Applies the equipment filter allowlist, run by hand from the deployed container.
 *
 * Separate from seed-facets.ts because that one is a bootstrap: it writes the seed's curated
 * ranks over whatever staff have arranged on /popular since the environment came up. This writes
 * one column that nothing has curated yet, so it is the entry point for an environment that is
 * already live.
 */
import { insertEquipmentFilterAllowlist } from "@yacht-charter/db/seed";

const marked = await insertEquipmentFilterAllowlist();

console.log(`Equipment filter now offers ${marked} amenities`);
