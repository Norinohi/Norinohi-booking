import { describe, expect, it } from "vitest";

import { labelOf } from "./options";

describe("labelOf", () => {
  it("uses the option's own label when there is one", () => {
    expect(labelOf([{ value: "croatia", label: "Хорватія" }], "croatia")).toBe("Хорватія");
  });

  it("reads a value with no option as a proper name", () => {
    expect(labelOf([], "fountaine-pajot")).toBe("Fountaine Pajot");
    expect(labelOf([], "kastela")).toBe("Kastela");
  });
});
