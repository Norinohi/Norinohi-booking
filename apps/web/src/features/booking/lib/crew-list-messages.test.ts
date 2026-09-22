import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../../messages/en";
import pl from "../../../../messages/pl";
import uk from "../../../../messages/uk";

/* An operator's cap is often one or two people; "1 осіб" is what the plain {count} printed. */
describe("the crew list's cap on passengers", () => {
  const cap = (locale: "en" | "pl" | "uk", messages: typeof en) => {
    const t = createTranslator({ locale, messages, namespace: "Booking.detail.crewList" });
    return (count: number) => t("errors.maxPassengers", { count });
  };

  it("agrees with the number in Ukrainian", () => {
    const t = cap("uk", uk);
    expect([1, 4, 12, 22].map(t)).toEqual([
      "Список цієї чартерної компанії вміщує не більше 1 особу",
      "Список цієї чартерної компанії вміщує не більше 4 особи",
      "Список цієї чартерної компанії вміщує не більше 12 осіб",
      "Список цієї чартерної компанії вміщує не більше 22 особи",
    ]);
  });

  it("agrees with the number in Polish and English", () => {
    expect([1, 3, 5].map(cap("pl", pl))).toEqual([
      "Lista tej firmy czarterowej mieści najwyżej 1 osobę",
      "Lista tej firmy czarterowej mieści najwyżej 3 osoby",
      "Lista tej firmy czarterowej mieści najwyżej 5 osób",
    ]);
    expect(cap("en", en)(1)).toBe("This charter company's list holds at most 1 person");
  });
});
