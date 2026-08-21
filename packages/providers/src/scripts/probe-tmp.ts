/* Throwaway: what scoping do the yacht's products/extras carry? */
import { BookingManagerClient } from "../booking-manager/client";
import { resolveBookingManagerConfig } from "../booking-manager/config";
import { bookingManagerEndpoints as ep } from "../booking-manager/endpoints";
import { z } from "zod";

const client = new BookingManagerClient({ config: resolveBookingManagerConfig() });
const y = await client.get(ep.yacht("6463214670000102746"), z.unknown());
const parsed = z
  .object({ products: z.array(z.record(z.string(), z.unknown())).optional() })
  .safeParse(y);

for (const p of parsed.data?.products ?? []) {
  const { extras, ...rest } = p;
  console.log("PRODUCT", JSON.stringify(rest));
  const list = z.array(z.record(z.string(), z.unknown())).safeParse(extras);
  for (const e of list.data ?? []) {
    if (String(e.obligatory) === "true") console.log("   obligatory:", JSON.stringify(e));
  }
}
