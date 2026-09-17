import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";

import { formatInstant } from "./instant";

/* The request config's zone, so the test fails if the helper ever falls back to it silently. */
const format = createFormatter({ locale: "uk", timeZone: "UTC" });

/* 01:14 on 17 September in Kyiv, the audit entry from the QA run. */
const AT = "2026-09-16T22:14:30.237Z";

describe("formatInstant", () => {
  it("formats in the viewer's zone, crossing midnight", () => {
    expect(
      formatInstant(format, AT, { dateStyle: "short", timeStyle: "short" }, "Europe/Kyiv"),
    ).toBe("17.09.26, 01:14");
  });

  it("moves a date-only rendering to the viewer's day", () => {
    expect(formatInstant(format, AT, { dateStyle: "short" }, "Europe/Kyiv")).toBe("17.09.26");
  });

  it("labels the time UTC before the viewer's zone is known", () => {
    expect(formatInstant(format, AT, { dateStyle: "short", timeStyle: "short" }, null)).toBe(
      "16.09.26, 22:14 UTC",
    );
  });

  it("leaves a bare date unlabelled before the zone is known", () => {
    expect(formatInstant(format, AT, { dateStyle: "short" }, null)).toBe("16.09.26");
  });

  it("reads an instant with an explicit offset as the same moment", () => {
    expect(
      formatInstant(
        format,
        "2026-09-17T01:14:30+03:00",
        { dateStyle: "short", timeStyle: "short" },
        "Europe/Kyiv",
      ),
    ).toBe("17.09.26, 01:14");
  });
});
