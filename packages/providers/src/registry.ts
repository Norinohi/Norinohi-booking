import { env } from "@yacht-charter/env/server";

import type { InventoryProvider } from "./provider";
import { MockInventoryProvider } from "./mock/provider";

export function createInventoryProvider(mode = env.PROVIDER_MODE): InventoryProvider {
  switch (mode) {
    case "mock":
      return new MockInventoryProvider();
    case "booking_manager":
    case "nausys":
      throw new Error(`Provider mode "${mode}" is not implemented yet`);
  }
}
