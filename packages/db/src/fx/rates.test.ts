import { describe, expect, it } from "vitest";

import { parseEcbEnvelope } from "./rates";

/* Trimmed to the three nested Cubes and two currencies; the live feed carries about thirty. */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time='2026-08-28'>
      <Cube currency='USD' rate='1.1643'/>
      <Cube currency='GBP' rate='0.8572'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbEnvelope", () => {
  it("reads the publication date and every quote", () => {
    expect(parseEcbEnvelope(FEED)).toEqual({
      asOf: "2026-08-28",
      quotes: [
        { currency: "USD", rate: 1.1643 },
        { currency: "GBP", rate: 0.8572 },
      ],
    });
  });

  it("reads double-quoted attributes, which the feed has used in the past", () => {
    const doubled = FEED.replaceAll("'", '"');

    expect(parseEcbEnvelope(doubled).quotes).toHaveLength(2);
  });

  /*
   * The failures worth pinning: a feed that answers with an error page, or one whose outer Cube
   * arrives without its dated child. Both used to leave a plausible-looking empty result, which
   * would have been written as "no rates" and quietly dropped every non-EUR listing out of the
   * catalogue's price comparisons.
   */
  it("rejects a document with no quotes", () => {
    expect(() => parseEcbEnvelope("<html><body>Service unavailable</body></html>")).toThrow();
  });

  it("rejects quotes with no publication date", () => {
    expect(() => parseEcbEnvelope(`<Cube><Cube currency='USD' rate='1.1'/></Cube>`)).toThrow();
  });

  it("rejects a rate that is not a number", () => {
    expect(() => parseEcbEnvelope(FEED.replace("rate='1.1643'", "rate='n/a'"))).toThrow();
  });
});
