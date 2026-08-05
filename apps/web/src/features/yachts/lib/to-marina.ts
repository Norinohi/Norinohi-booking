import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import type { Marina } from "@/components/shared/overlay/marina-popover";

type Base = Awaited<ReturnType<AppRouterClient["listings"]["get"]>>["base"];

export function toMarina(base: Base): Marina {
  return {
    id: base.id,
    name: base.name,
    address: base.region,
    city: base.location,
    country: base.country,
    phone: base.phone ?? undefined,
    website: base.website ?? undefined,
    email: base.email ?? undefined,
    coordinates: { lat: base.lat, lng: base.lng },
  };
}
