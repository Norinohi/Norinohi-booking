# Translation glossary

The recurring vocabulary of this product, as the repository currently renders it in each language.
Every entry was read out of the translation files; nothing here was invented for the glossary.

## What this file is for

A yacht charter has a small set of words that carry the whole product: bareboat, skipper, base,
hold, prepayment, deposit. Each of them has two or three defensible renderings in every target
language, and a translator working one file at a time picks a different one each time. The result
is a site where the search filter, the yacht page and the booking summary each call the same thing
something else, which nobody notices until a native reader sees two screens side by side.

## How to use it

- **Translating.** Before you write a new value for one of these terms, look it up here and use the
  form recorded for your locale. If the entry says the locale is inconsistent, use the recommended
  form and leave the other occurrence for the reviewer.
- **Reviewing.** Work through "Inconsistencies to resolve" at the end. It is the worklist: every
  conflict still open, grouped by locale, each with the reason it was left. Conflicts that have been
  settled move to "Resolved" below it, which records what was chosen.
- **Adding a language.** Fill in a column for it as you go, and add any term you had to decide
  rather than look up.
- **Adding a term.** Add it here in the same change, not afterwards.

The mechanical checks live in `.claude/skills/translate-locale/scripts/check-icu.mjs`: placeholders,
plural categories, key coverage, JSON shape. They cannot see that two files say the same thing two
ways, which is what this glossary is for. Run the script for the mechanical pass; the glossary is
what the review pass reads.

Each entry gives a file and key for at least one occurrence so a reviewer can jump straight to it.
Keys are written `Namespace|path` for UI messages, which means
`apps/web/messages/<locale>/<Namespace>.json` at that path. Database copy cites its JSON file
directly.

## Status of each locale

- **en** is the source.
- **es, uk, de** are the established locales; they also prerender the catalog in full.
- **fr, pl, it, nl, sv, no, da are machine translations awaiting native review.** Their wording is a
  draft. A reviewer's term beats the one recorded here; when that happens, change this file too.

## Where the strings live

| Source                                                            | What it holds                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/web/messages/<locale>/<Namespace>.json`                     | all UI copy, customer and admin                              |
| `packages/db/src/boat-types.json`                                 | boat-type cards on the home page                             |
| `packages/db/src/translations/facet-labels.json`                  | facets no provider translates                                |
| `packages/db/src/translations/{uk,da}.json`                       | generated facet labels for the two locales no provider names |
| `packages/db/src/translations/extra-labels.json`                  | priced extras, keyed by the vendor's English                 |
| `packages/db/src/{catalogue-routes,popular-routes,site-faq}.json` | editorial route and FAQ copy                                 |

Notation used below: **[!]** marks a conflict inside one locale, **[EN]** marks a term left in
English.

---

## 1. bareboat

The charter type where the customer sails the yacht themselves, no professional aboard. A crew
option, not a price or a hull type.

| Locale | Term                                     |
| ------ | ---------------------------------------- |
| es     | Sin patrón                               |
| uk     | Без екіпажу                              |
| de     | Bareboat **[!] [EN]** (also "Ohne Crew") |
| fr     | Sans skipper                             |
| pl     | Bez załogi                               |
| it     | Senza skipper                            |
| nl     | Bareboat **[EN]**                        |
| sv     | Utan besättning                          |
| no     | Uten mannskap                            |
| da     | Uden besætning                           |

Source: `Common|crewTypes.bareboat`, `Common|boatCard.charterTypes.bareboat`,
`Home|Hero.options.bareboat`, `Layout|Footer.links.bareboat`.

es and fr are settled: es "Sin patrón" and fr "Sans skipper" on all four keys.

Conflict: de renders it "Bareboat" in `Common` and "Ohne Crew" in `Home` and `Layout`, two keys each
way. Both are current German charter usage, so this is a reviewer's preference and not a defect; it
stays open deliberately. nl leaves it in English everywhere, which for a trade term may be right.

## 2. skippered / with skipper

The charter type where a professional skipper sails the yacht and the customer is a guest. Paired
with bareboat on the same control.

| Locale | Term                |
| ------ | ------------------- |
| es     | Con patrón incluido |
| uk     | Зі шкіпером         |
| de     | Mit Skipper         |
| fr     | Avec skipper        |
| pl     | Ze skipperem        |
| it     | Con skipper         |
| nl     | Met schipper        |
| sv     | Med skeppare        |
| no     | Med skipper         |
| da     | Med skipper         |

Source: `Home|Hero.options.skippered`, `Layout|Footer.links.skippered`.

Settled: uk said "З капітаном" (captain) here against "Зі шкіпером" elsewhere, and now says
"Зі шкіпером" on the hero option too. No conflicts.

## 3. skipper

The licensed professional who sails the yacht. Also a role on the crew list.

| Locale | Term                                                                 |
| ------ | -------------------------------------------------------------------- |
| es     | Patrón **[!]** ("Con patrón" where the value labels the crew option) |
| uk     | Шкіпер                                                               |
| de     | Skipper                                                              |
| fr     | Skipper                                                              |
| pl     | Skipper **[!]** ("Ze skipperem" on `Common                           | crewTypes.skipper`) |
| it     | Skipper                                                              |
| nl     | Schipper                                                             |
| sv     | Skeppare                                                             |
| no     | Skipper                                                              |
| da     | Skipper                                                              |

Source: `Common|crewTypes.skipper`, `Home|BudgetFinder.labels.skipper`,
`PlanMyTrip|result.labels.skipper`; extras: `packages/db/src/translations/extra-labels.json` key
`"Skipper"`.

Settled: the priced extra now reads "Schipper" in nl and "Skeppare" in sv, matching each locale's
UI. no and da keep "Skipper" in both places, which is consistent within each locale.

Conflict: pl uses the bare noun "Skipper" on `Home|BudgetFinder.labels.skipper` and
`PlanMyTrip|result.labels.skipper` but the prepositional "Ze skipperem" on `Common|crewTypes.skipper`,
where the other locales carry a bare noun.

## 4. crew

The people aboard other than the guests, and the name of the filter that chooses between bareboat,
skippered and full crew.

| Locale | Term          |
| ------ | ------------- |
| es     | Tripulación   |
| uk     | Екіпаж        |
| de     | Crew **[EN]** |
| fr     | Équipage      |
| pl     | Załoga        |
| it     | Equipaggio    |
| nl     | Bemanning     |
| sv     | Besättning    |
| no     | Mannskap      |
| da     | Besætning     |

Source: `Filters|labels.crew`, `Booking|review.crew`, `YachtDetail|sidebar.crew`,
`Admin|Duplicates.detailFields.crewType` (all seven occurrences agree in every locale).

de uses the English "Crew" deliberately and consistently; German charter copy normally does. Left as
a note, not a conflict.

## 5. full crew

The charter type with skipper plus hostess or cook, the top of the three crew options.

| Locale | Term                 |
| ------ | -------------------- |
| es     | Tripulación completa |
| uk     | Повний екіпаж        |
| de     | Volle Crew           |
| fr     | Équipage complet     |
| pl     | Pełna załoga         |
| it     | Equipaggio completo  |
| nl     | Volledige bemanning  |
| sv     | Full besättning      |
| no     | Fullt mannskap       |
| da     | Fuld besætning       |

Source: `Common|crewTypes.full-crew`, `Common|boatCard.crews.fullCrew`. No conflicts.

## 6. charter

The rental itself: one yacht, one date range, one customer. Not the company and not the booking
record.

| Locale | Term             |
| ------ | ---------------- |
| es     | Chárter          |
| uk     | Чартер           |
| de     | Charter **[EN]** |
| fr     | Location         |
| pl     | Czarter          |
| it     | Noleggio         |
| nl     | Charter **[EN]** |
| sv     | Charter **[EN]** |
| no     | Charter **[EN]** |
| da     | Charter **[EN]** |

Source: `Booking|detail.charterTitle`, `Admin|StaffBooking.fields.charter`,
`Admin|Payments.refunds.table.charter`. No conflicts.

Note for reviewers: fr "Location" and it "Noleggio" are the generic rental words, yet fr and it both
keep "charter" inside compounds ("base charter", "Sconto charter"). Worth a deliberate decision
rather than treating it as an error.

## 7. charter base / home base

The marina where the yacht is handed over and returned, and the operator's staff on site. It holds
the security deposit and takes the extras paid on arrival. "Home base" is the admin field for the
same thing.

| Locale | Term (charter base)  | Term (home base, admin)                    |
| ------ | -------------------- | ------------------------------------------ |
| es     | Una base de chárter  | Base de origen **[!]** (also plain "Base") |
| uk     | Чартерної бази       | Домашня база                               |
| de     | Einer Charterbasis   | Heimatbasis                                |
| fr     | Une base de location | Base                                       |
| pl     | Bazy czarterowej     | Baza macierzysta                           |
| it     | Una base charter     | Base                                       |
| nl     | Een charterbasis     | Thuishaven                                 |
| sv     | En charterbas        | Hemmabas                                   |
| no     | En charterbase       | Hjemmebase                                 |
| da     | En charterbase       | Hjemmebase                                 |

Source: `Admin|Routes.target.levelBase`, `Booking|review.depositRefundable`;
`Admin|Duplicates.fields.base` and `Admin|Listings.sources.fields.home_base` for the admin field.

Settled in uk, de and pl: `Admin|Duplicates.fields.base` now carries the base form and agrees with
`Admin|Listings.sources.fields.home_base` - uk "Домашня база", de "Heimatbasis", pl
"Baza macierzysta". The port form ("Heimathafen", "Port macierzysty") is gone.

Conflict: es still renders "Base" on `Admin|Duplicates.fields.base` against "Base de origen" on
`Admin|Listings.sources.fields.home_base`, and the customer-facing base is a third form,
"la base náutica" in `Booking|review.depositRefundable`.

Recommendation, awaiting a native reviewer: es "Base de origen" for the admin field, since it
identifies the operator's site and not the harbour.

## 8. marina

The harbour itself, as a search facet and as a field on a booking.

| Locale | Term       |
| ------ | ---------- |
| es     | Marina     |
| uk     | Марина     |
| de     | Marina     |
| fr     | Marina     |
| pl     | Marina     |
| it     | Marina     |
| nl     | Jachthaven |
| sv     | Marina     |
| no     | Marina     |
| da     | Marina     |

Source: `Filters|labels.marina`, `Yachts|searchBar.kinds.base`, `Booking|detail.marina`.

Settled: es said "Puerto" on `Booking|detail.marina` and now says "Marina" on all three. No
conflicts.

## 9. berth

A sleeping place aboard, counted separately from cabins.

| Locale | Term          |
| ------ | ------------- |
| es     | Literas       |
| uk     | Спальні місця |
| de     | Kojen         |
| fr     | Couchettes    |
| pl     | Koje          |
| it     | Posti letto   |
| nl     | Slaapplaatsen |
| sv     | Kojplatser    |
| no     | Køyeplasser   |
| da     | Køjepladser   |

Source: `Admin|Duplicates.fields.berths`, `Admin|Duplicates.signalFields.berths`. No conflicts.

## 10. cabin

A sleeping compartment. A headline spec on every yacht card and the detail page.

| Locale | Term                                    |
| ------ | --------------------------------------- |
| es     | Camarotes                               |
| uk     | Каюти **[!]** ("Кают" on the boat card) |
| de     | Kabinen                                 |
| fr     | Cabines                                 |
| pl     | Kabiny                                  |
| it     | Cabine                                  |
| nl     | Hutten                                  |
| sv     | Hytter                                  |
| no     | Lugarer                                 |
| da     | Kahytter                                |

Source: `Filters|labels.cabins`, `YachtDetail|overview.cabins`, `Common|boatCard.specs.cabins`.

Conflict: uk uses the nominative plural "Каюти" on four keys and the genitive "Кают" on
`Common|boatCard.specs.cabins`.

Recommendation, awaiting a native reviewer: the boat card renders "3 кают", so the genitive may be
correct in that one position. A reviewer should confirm whether the card needs a count-dependent
form rather than a flat label.

## 11. guests

The people the charter is booked for. Distinct from crew, and distinct from berths.

| Locale | Term      |
| ------ | --------- |
| es     | Huéspedes |
| uk     | Гості     |
| de     | Gäste     |
| fr     | Passagers |
| pl     | Goście    |
| it     | Ospiti    |
| nl     | Gasten    |
| sv     | Gäster    |
| no     | Gjester   |
| da     | Gæster    |

Source: `Booking|invoice.summary.guests`, `Booking|detail.guestsLabel`.

Settled: es said "Personas" on `Booking|detail.guestsLabel` and now says "Huéspedes" on both.

Open, but not a conflict: fr renders it "Passagers" (passengers), the only locale that shifts the
concept. It is defensible for a yacht and internally consistent, so it is a decision for the French
reviewer rather than something to correct.

"Passengers" as an English source term does not occur anywhere in the repository. Do not introduce
it as a second word for the same thing.

## 12. check-in

Arrival at the base, boarding and handover day. It is a moment in time, and several prices are
attached to it ("pay at check-in").

| Locale | Term                                      |
| ------ | ----------------------------------------- |
| es     | En la llegada **[!]** (also "al llegar")  |
| uk     | При заселенні **[!]** (also "при заїзді") |
| de     | Beim Check-in **[EN in part]**            |
| fr     | À l'embarquement                          |
| pl     | Przy zaokrętowaniu                        |
| it     | Al check-in **[EN in part]**              |
| nl     | Bij het inchecken                         |
| sv     | Vid incheckning                           |
| no     | Ved innsjekk                              |
| da     | Ved check-in **[EN in part]**             |

Source: `Booking|invoice.payWhen.at_check_in` ("At check-in"), `Common|extras.payAtCheckIn`
("Pay at check-in").

Conflict: uk uses "заселення" (checking in, hotel sense) on the invoice and "заїзд" (arrival) on the
extras line. es likewise alternates "En la llegada" and "al llegar", which is only a grammatical
difference but should be made deliberately.

Recommendation, awaiting a native reviewer: uk pick one noun and use it in both; "заселення" reads
as a hotel, "заїзд" as a drive-in, and neither is obviously right for boarding a yacht.

There is no standalone "check-out" string in the product. The return side is
`YachtDetail|importantInfo.dropOff` ("Yacht drop-off") and `YachtDetail|sidebar.dropOff`
("Drop-off marina"). "Handover" does not occur anywhere; do not introduce it.

## 13. sailing area

The cruising region a yacht is searched in, one level above the base.

| Locale | Term                                                 |
| ------ | ---------------------------------------------------- |
| es     | Zona de navegación                                   |
| uk     | Регіон плавання **[!]** ("Регіон" in the search bar) |
| de     | Segelrevier                                          |
| fr     | Zone de navigation                                   |
| pl     | Akwen                                                |
| it     | Area di navigazione                                  |
| nl     | Vaargebied                                           |
| sv     | Seglingsområde                                       |
| no     | Seilområde                                           |
| da     | Sejlområde                                           |

Source: `Filters|labels.sailingArea`, `Yachts|searchBar.kinds.region`.

Conflict: uk shortens it to "Регіон" in the search bar. That may be a deliberate fit for a narrow
control rather than an error.

Recommendation, awaiting a native reviewer: keep "Регіон плавання" where space allows and note the
short form as an accepted abbreviation rather than a second term.

## 14. listing

One yacht as published on this marketplace: the operator's boat plus our pricing, photos and status.
Not the boat and not the booking.

| Locale | Term        |
| ------ | ----------- |
| es     | Anuncio     |
| uk     | Оголошення  |
| de     | Inserat     |
| fr     | Annonce     |
| pl     | Oferta      |
| it     | Annuncio    |
| nl     | Advertentie |
| sv     | Annons      |
| no     | Annonse     |
| da     | Annonce     |

Source: `Admin|Audit.entity.listing`, `Admin|Listings.table.listing`; plural forms at
`Admin|Listings.title`, `Layout|Sidebar.listings`, `Seo|Listings.title`. Singular and plural agree
in every locale. No conflicts.

## 15. operator

The business that owns and runs the yacht. The party we hold a commission agreement with.

| Locale | Term              |
| ------ | ----------------- |
| es     | Operador          |
| uk     | Оператор          |
| de     | Vercharterer      |
| fr     | Opérateur         |
| pl     | Armator           |
| it     | Operatore         |
| nl     | Operator **[EN]** |
| sv     | Operatör          |
| no     | Operatør          |
| da     | Udlejer           |

Source: `Admin|Listings.table.operator`, `Admin|Commissions.table.operator`,
`Admin|Listings.filters.operator`, `Admin|Duplicates.fields.operator` (twelve occurrences in all).

Settled in all three: de renders all four keys "Vercharterer", which is the charter-specific word
and leaves "Anbieter" free to mean provider alone (entry 17); pl is "Armator" everywhere; da is
"Udlejer", which no longer collides with "Leverandør" for provider.

The three neighbouring admin keys that named the same party - `Admin|Duplicates.signalFields.operator`
and the two under `Admin|Listings.sources` - were swept into "Vercharterer" in the same pass, so
"Betreiber" no longer appears in the German messages at all.

## 16. charter company

The customer-facing name for the operator, shown on the yacht page and as a filter. Same entity as
"operator", different audience.

| Locale | Term               |
| ------ | ------------------ |
| es     | Empresa de chárter |
| uk     | Чартерна компанія  |
| de     | Charterunternehmen |
| fr     | Loueur             |
| pl     | Firma czarterowa   |
| it     | Società di charter |
| nl     | Charterbedrijf     |
| sv     | Charterbolag       |
| no     | Charterselskap     |
| da     | Charterfirma       |

Source: `Filters|labels.charterCompany`, `YachtDetail|importantInfo.charterCompany`. No conflicts.

## 17. provider

The inventory system we sync from, NauSYS or Booking Manager. Admin-only. Never the operator.

| Locale | Term              |
| ------ | ----------------- |
| es     | Proveedor         |
| uk     | Постачальник      |
| de     | Anbieter          |
| fr     | Fournisseur       |
| pl     | Dostawca          |
| it     | Fornitore         |
| nl     | Provider **[EN]** |
| sv     | Leverantör        |
| no     | Leverandør        |
| da     | Leverandør        |

Source: `Admin|Sync.table.provider`, `Admin|Commissions.table.provider`,
`Admin|Audit.entity.provider` (twelve occurrences, internally consistent in every locale).

This used to collide with operator in de and da. Both are settled: de now says "Vercharterer" for
operator, leaving "Anbieter" to mean provider alone, and da says "Udlejer" against "Leverandør". The
two admin columns are distinct in every locale.

## 18. booking

The confirmed reservation with money against it, the record a customer opens under "My bookings".

| Locale | Term             |
| ------ | ---------------- |
| es     | Reserva          |
| uk     | Бронювання       |
| de     | Buchung          |
| fr     | Réservation      |
| pl     | Rezerwacja       |
| it     | Prenotazione     |
| nl     | Boeking          |
| sv     | Bokning          |
| no     | Booking **[EN]** |
| da     | Booking **[EN]** |

Source: `Booking|detail.panels.main`, `Admin|Audit.entity.booking`,
`Admin|Faq.categories.booking`, `YachtDetail|faqCategories.booking`.

Settled: nl said "Boeken" (the verb) on the two FAQ-category keys and now says the noun "Boeking"
on both, matching the entity.

Conflict: es pluralises to "Reservas" on `YachtDetail|faqCategories.booking` while the admin FAQ
category stays singular "Reserva".

Recommendation, awaiting a native reviewer: es make the two FAQ-category keys agree with each other.

## 19. hold / option

A temporary reservation of a yacht with the operator before any money moves, which expires by
itself. Not a discount hold and not a payment hold.

| Locale | Term        |
| ------ | ----------- |
| es     | Opción      |
| uk     | Опція       |
| de     | Option      |
| fr     | Option      |
| pl     | Blokada     |
| it     | Opzione     |
| nl     | Optie       |
| sv     | Reservation |
| no     | Reservasjon |
| da     | Reservation |

Source: `Admin|Sync.unreleasedOptions.hold`.

No conflict, but note the split in approach: seven locales use the trade term "option", pl uses
"Blokada" (block), and sv, no and da use "Reservation", which in those languages is also a plausible
word for **booking**. Reviewers of sv, no and da should confirm that "Reservation" and the booking
term (sv "Bokning", no and da "Booking") stay clearly distinct on the admin sync screen.

## 20. quote

A priced offer for specific dates, valid for a window, before it becomes a booking. Both a customer
action ("request a quote") and a booking status ("Quoted").

| Locale | Request a quote                                                | Status: Quoted   |
| ------ | -------------------------------------------------------------- | ---------------- |
| es     | Solicitar presupuesto **[!]** (also "Solicita un presupuesto") | Presupuestada    |
| uk     | Запросити пропозицію                                           | Розраховано      |
| de     | Angebot anfordern                                              | Angebot erstellt |
| fr     | Demander un devis                                              | Devis établi     |
| pl     | Poproś o wycenę                                                | Wyceniona        |
| it     | Richiedi preventivo **[!]** (also "Richiedi un preventivo")    | Preventivata     |
| nl     | Offerte aanvragen                                              | Offerte          |
| sv     | Begär offert **[!]** (also "Begär en offert")                  | Offererad        |
| no     | Be om tilbud                                                   | Tilbud gitt      |
| da     | Bed om et tilbud                                               | Tilbud givet     |

Source: `YachtDetail|sidebar.requestQuote`, `YachtDetail|quoteDialog.title`;
`Admin|Bookings.status.QUOTED`, `Booking|detail.status.QUOTED`.

Conflicts in es, it and sv are only the article (button label versus dialog heading) and are
probably intentional. The noun is stable in every locale; that is what matters for the glossary.

## 21. security deposit

The refundable sum the charter base holds against damage, taken at the base and not by us.

| Locale | Term       |
| ------ | ---------- |
| es     | Fianza     |
| uk     | Застава    |
| de     | Kaution    |
| fr     | Caution    |
| pl     | Kaucja     |
| it     | Cauzione   |
| nl     | Borg       |
| sv     | Deposition |
| no     | Depositum  |
| da     | Depositum  |

Source: `Admin|Duplicates.detailFields.deposit`, `Booking|detail.kind.security_deposit`; the same
terms appear in `packages/db/src/translations/extra-labels.json` under `"Security Deposit"` for de,
es and uk. No conflicts.

## 22. prepayment

The share of the charter price the customer pays us now to confirm the booking. The rest is paid
later. Never the security deposit.

| Locale | Term               |
| ------ | ------------------ |
| es     | Anticipo           |
| uk     | Передоплата        |
| de     | Anzahlung          |
| fr     | Acompte            |
| pl     | Przedpłata         |
| it     | Acconto            |
| nl     | Aanbetaling        |
| sv     | Förskottsbetalning |
| no     | Forskudd           |
| da     | Forudbetaling      |

Source: `YachtDetail|sidebar.payNow` ("Booking Prepayment (Pay Now)"),
`Common|boatCard.prepayment`, `Common|extras.dueWithPrepayment`. No conflicts.

Worth keeping an eye on: de "Anzahlung" and the security deposit "Kaution" are easy to confuse in
running text; the two must never swap.

## 23. deposit insurance

An optional product that replaces most of the security deposit with a premium. Sometimes sold by the
base as a "damage waiver".

| Locale | Term                   |
| ------ | ---------------------- |
| es     | Seguro de fianza       |
| uk     | Страхування застави    |
| de     | Kautionsversicherung   |
| fr     | Assurance caution      |
| pl     | Ubezpieczenie kaucji   |
| it     | Assicurazione cauzione |
| nl     | Borgverzekering        |
| sv     | Depositionsförsäkring  |
| no     | Depositumsforsikring   |
| da     | Depositumforsikring    |

Source: `Admin|Duplicates.detailFields.depositInsurance`, `Filters|chips.depositInsurance`. No
conflicts.

"Damage waiver" appears once in the source, inside a sentence
(`YachtDetail|sidebar.depositWhenInsured`, "or {amount} with the damage waiver"), and as vendor text
inside extras names. It has no standalone entry of its own in any locale, so there is no agreed term
for it: treat it as a synonym of deposit insurance and translate it with the terms above rather than
inventing a second one.

## 24. extras

Priced items added to a charter: outboard, skipper, linen, transfers. Split into mandatory and
optional.

| Locale | Term         |
| ------ | ------------ |
| es     | Extras       |
| uk     | Додатково    |
| de     | Extras       |
| fr     | Suppléments  |
| pl     | Dodatki      |
| it     | Extra        |
| nl     | Extra's      |
| sv     | Tillval      |
| no     | Ekstrautstyr |
| da     | Tillæg       |

Source: `Booking|review.extras`, `Booking|steps.extras`. No conflicts on the bare term.

no "Ekstrautstyr" literally means extra equipment, which is narrower than what the list holds
(cleaning, transfers, a skipper). Flagged for the Norwegian reviewer.

## 25. mandatory extras

Extras the base charges whether or not the customer wants them. Included in the quoted total.

| Locale | Term                      |
| ------ | ------------------------- |
| es     | Extras obligatorios       |
| uk     | Обов'язкові доплати       |
| de     | Obligatorische Extras     |
| fr     | Suppléments obligatoires  |
| pl     | Obowiązkowe dodatki       |
| it     | Extra obbligatori         |
| nl     | Verplichte extra's        |
| sv     | Obligatoriska tillval     |
| no     | Obligatorisk ekstrautstyr |
| da     | Obligatoriske tillæg      |

Source: `YachtDetail|sections.mandatoryExtras`, `YachtDetail|tabs.mandatory-extras`,
`YachtDetail|sidebar.groups.mandatory`. No conflicts.

uk uses "доплати" (surcharges) here but "Додатково" for bare extras, so the uk pair is not built
from one root. Flagged for the Ukrainian reviewer.

## 26. optional extras

Extras the customer chooses. Some are paid now, some at the base.

| Locale | Term                    |
| ------ | ----------------------- |
| es     | Extras opcionales       |
| uk     | Додаткові опції         |
| de     | Optionale Extras        |
| fr     | Suppléments facultatifs |
| pl     | Dodatki opcjonalne      |
| it     | Extra facoltativi       |
| nl     | Optionele extra's       |
| sv     | Valfria tillval         |
| no     | Valgfritt ekstrautstyr  |
| da     | Valgfrie tillæg         |

Source: `Booking|extras.optional`, `YachtDetail|tabs.optional-extras`,
`YachtDetail|sections.optionalExtras`.

Settled in fr: the yacht page said the bare "Options", which collided with fr's word for a **hold**
(entry 19), and now says "Suppléments facultatifs" on the tab and the section, as the booking flow
already did.

Settled in pl: the tab said "Opcjonalne dodatki" against "Dodatki opcjonalne" on the other two keys,
a word order difference only, and now reads "Dodatki opcjonalne" everywhere.

## 27. final cleaning

The end-of-charter cleaning fee. Nearly always a mandatory extra. The vendors write it either
"Final cleaning" or "End cleaning" and both map to the same term here.

| Locale | Term                |
| ------ | ------------------- |
| es     | Limpieza final      |
| uk     | Фінальне прибирання |
| de     | Endreinigung        |
| fr     | Nettoyage final     |
| pl     | Sprzątanie końcowe  |
| it     | Pulizia finale      |
| nl     | Eindschoonmaak      |
| sv     | Slutstädning        |
| no     | Sluttvask           |
| da     | Slutrengøring       |

Source: `packages/db/src/translations/extra-labels.json`, keys `"Final cleaning"` and
`"End cleaning"`, which carry identical values in all ten locales. No conflicts.

## 28. transit log

The Croatian port-authority document and fee, bought at the base and usually bundled with cleaning
and gas. A proper noun of the trade, not a log book.

| Locale | Term                 |
| ------ | -------------------- |
| es     | Transit log **[EN]** |
| uk     | Транзитний журнал    |
| de     | Transitlog           |
| fr     | Transit log **[EN]** |
| pl     | Transit log **[EN]** |
| it     | Transit log **[EN]** |
| nl     | Transit log **[EN]** |
| sv     | Transit log **[EN]** |
| no     | Transit log **[EN]** |
| da     | Transit log **[EN]** |

Source: `packages/db/src/translations/extra-labels.json`, key `"Transit log"`.

Keeping the English is the right call for a document customers meet under that name at the base. uk
is the one locale that translates it, and the uk reviewer should decide whether "Транзитний журнал"
or the Latin form serves a Ukrainian customer better. Note that longer vendor strings such as
`"Transit log / Full comfort pack - obligatory < 13 m, except catamarans"` keep the Latin form in uk
as well, so uk is inconsistent with itself across the extras file.

## 29. tourist tax

The per-person, per-night levy collected at the base.

| Locale | Term               |
| ------ | ------------------ |
| es     | Tasa turística     |
| uk     | Туристичний збір   |
| de     | Kurtaxe            |
| fr     | Taxe de séjour     |
| pl     | Opłata klimatyczna |
| it     | Tassa di soggiorno |
| nl     | Toeristenbelasting |
| sv     | Turistskatt        |
| no     | Turistskatt        |
| da     | Turistskat         |

Source: `packages/db/src/translations/extra-labels.json`, key `"Tourist tax"`. No conflicts.

## 30. wishlist

The customer's saved yachts. One list, no folders.

| Locale | Noun              | In the add/remove buttons |
| ------ | ----------------- | ------------------------- |
| es     | Tus favoritos     | favoritos                 |
| uk     | Ваше обране       | обране                    |
| de     | Ihre Merkliste    | Zur Merkliste             |
| fr     | Vos favoris       | favoris                   |
| pl     | Twoje ulubione    | ulubionych                |
| it     | I tuoi preferiti  | preferiti                 |
| nl     | Jouw verlanglijst | verlanglijst              |
| sv     | Din önskelista    | önskelistan               |
| no     | Ønskelisten din   | ønskelisten               |
| da     | Din ønskeliste    | ønskelisten               |

Source: `Wishlist|title`, `Seo|Wishlist.title`, `YachtDetail|addToWishlist`,
`YachtDetail|removeFromWishlist`, `Common|boatCard.save`.

Settled in both: de called the same list "Wunschliste" on the add and remove buttons and now says
"Zur Merkliste" and "Von Merkliste entfernen", matching the page. fr used "liste d'envies" as the
page heading against "favoris" everywhere else, and `Wishlist|title` now reads "Vos favoris". No
conflicts.

## 31. referral

The scheme where an existing customer invites a friend and both get credit.

| Locale | Term             |
| ------ | ---------------- |
| es     | Referidos        |
| uk     | Реферали         |
| de     | Empfehlungen     |
| fr     | Parrainages      |
| pl     | Polecenia        |
| it     | Inviti           |
| nl     | Doorverwijzingen |
| sv     | Värvningar       |
| no     | Vervinger        |
| da     | Henvisninger     |

Source: `Layout|Sidebar.referrals`, `Layout|UserMenu.referrals`; possessive forms at
`Referrals|title` and `Seo|Referrals.title` ("Your Referrals"). The possessive forms differ only by
the pronoun in every locale, which is expected, not a conflict.

## 32. referral credit

The balance earned by referring someone, spendable against a charter.

| Locale | Term                                                 |
| ------ | ---------------------------------------------------- |
| es     | Crédito por recomendación                            |
| uk     | Бонус за рекомендацією                               |
| de     | Empfehlungsguthaben                                  |
| fr     | Crédit de parrainage                                 |
| pl     | Środki z poleceń **[!]** (also "Środki z polecenia") |
| it     | Credito da invito                                    |
| nl     | Verwijstegoed                                        |
| sv     | Värvningstillgodohavande                             |
| no     | Vervebonus                                           |
| da     | Tilgodehavende fra henvisning                        |

Source: `Common|quoteLines.referral-credit`, `Booking|detail.priceLineLabels.referralCredit`,
`Admin|StaffBooking.priceLines.labels.referralCredit`, `YachtDetail|sidebar.credit.label`.

Settled: es and uk each carried a different term on `YachtDetail|sidebar.credit.label` from the one
on the price breakdown, and in uk the two were not even built from the same root. Both now use the
price-line form on all four keys - es "Crédito por recomendación", uk "Бонус за рекомендацією".
pl still differs only in number ("Środki z poleceń" against "Środki z polecenia").

Note that es, uk and it use a different root here ("recomendación", "рекомендація", "invito") from
the one they use for the referral scheme itself in entry 31 ("Referidos", "Реферали", "Inviti"). it
is the only one of the three that is internally consistent.

## 33. credits and balance

The wallet screen: credit earned and the money available to spend.

| Locale | Term                      |
| ------ | ------------------------- |
| es     | Créditos y saldo          |
| uk     | Кредити та баланс         |
| de     | Guthaben & Saldo          |
| fr     | Crédits et solde          |
| pl     | Środki i saldo            |
| it     | Crediti e saldo           |
| nl     | Tegoed & saldo            |
| sv     | Tillgodohavande och saldo |
| no     | Bonus og saldo            |
| da     | Tilgodehavende og saldo   |

Source: `Credits|title`, `Layout|Sidebar.credits`, `Layout|UserMenu.credits`, `Seo|Credits.title`.
All four agree in every locale. No conflicts.

Note for the German and Norwegian reviewers: de "Guthaben & Saldo" and no "Bonus og saldo" both use
a word for the first half that the same locale uses elsewhere for the credit itself
(de "Empfehlungsguthaben"), so the screen title reads close to "balance and balance".

## 34. remaining balance

What is still owed after the prepayment. Distinct from the wallet balance in entry 33.

| Locale | Term                 |
| ------ | -------------------- |
| es     | Saldo pendiente      |
| uk     | Залишок до сплати    |
| de     | Restbetrag           |
| fr     | Solde restant        |
| pl     | Pozostało do zapłaty |
| it     | Saldo residuo        |
| nl     | Resterend bedrag     |
| sv     | Återstående belopp   |
| no     | Restbeløp            |
| da     | Resterende beløb     |

Source: `Booking|invoice.totals.balance`. Compare `Credits|balance.label` ("Available balance") for
the wallet sense. No conflicts.

## 35. discount

A reduction applied to a price, managed by staff and identified by a code.

| Locale | Term       |
| ------ | ---------- |
| es     | Descuentos |
| uk     | Знижки     |
| de     | Rabatte    |
| fr     | Remises    |
| pl     | Rabaty     |
| it     | Sconti     |
| nl     | Kortingen  |
| sv     | Rabatter   |
| no     | Rabatter   |
| da     | Rabatter   |

Source: `Discounts|tabs.discounts`; singular at `Discounts|table.name` ("Discount Name"). No
conflicts.

## 36. charter discount

The operator's own price reduction, arriving from the provider on a quote line. Not one of ours.

| Locale | Term                   |
| ------ | ---------------------- |
| es     | Descuento del chárter  |
| uk     | Знижка на чартер       |
| de     | Charter-Rabatt         |
| fr     | Remise sur la location |
| pl     | Rabat na czarter       |
| it     | Sconto charter         |
| nl     | Charterkorting         |
| sv     | Charterrabatt          |
| no     | Charterrabatt          |
| da     | Charterrabat           |

Source: `Common|quoteLines.provider-discount`, `Booking|detail.priceLineLabels.charterDiscount`,
`Admin|StaffBooking.priceLines.labels.charterDiscount`.

Settled: pl said "Rabat czarterowy" on `Common|quoteLines.provider-discount`, the line the customer
sees in the price breakdown, and now says "Rabat na czarter" on all three keys.

## 37. builder

The yard that built the hull: Beneteau, Lagoon, Bavaria. A spec field and a search facet.

| Locale | Term      |
| ------ | --------- |
| es     | Astillero |
| uk     | Верф      |
| de     | Werft     |
| fr     | Chantier  |
| pl     | Stocznia  |
| it     | Cantiere  |
| nl     | Werf      |
| sv     | Varv      |
| no     | Verft     |
| da     | Værft     |

Source: `Admin|Duplicates.detailFields.builder`, `Admin|Duplicates.signalFields.builder`,
`Filters|chips.builder`. No conflicts.

## 38. boat type

The category a yacht falls in: catamaran, sailing yacht, motor yacht and so on. A top-level filter
and a home page section.

| Locale | Term           |
| ------ | -------------- |
| es     | Tipo de barco  |
| uk     | Тип човна      |
| de     | Bootstyp       |
| fr     | Type de bateau |
| pl     | Typ jachtu     |
| it     | Tipo di barca  |
| nl     | Boottype       |
| sv     | Båttyp         |
| no     | Båttype        |
| da     | Bådtype        |

Source: `Filters|labels.boatType`, `YachtDetail|overview.boatType`, `Layout|Nav.boatTypes`.

Settled: pl said "Typ łodzi" (boat) in the filter against "Typ jachtu" (yacht) on the yacht page,
and now says "Typ jachtu" in both, which agrees with pl's "Jacht" for the yacht itself (entry 53).

## 39. mainsail type

How the mainsail is rigged: full batten, furling and so on. A spec and a filter.

| Locale | Term                |
| ------ | ------------------- |
| es     | Tipo de mayor       |
| uk     | Тип грота           |
| de     | Großsegeltyp        |
| fr     | Type de grand-voile |
| pl     | Typ grota           |
| it     | Tipo di randa       |
| nl     | Type grootzeil      |
| sv     | Storsegelstyp       |
| no     | Type storseil       |
| da     | Storsejlstype       |

Source: `Filters|labels.mainsailType`, `Common|boatCard.specs.mainsail`,
`YachtDetail|overview.mainsail`. The values themselves are in
`packages/db/src/translations/facet-labels.json` under `sail_type`.

Settled: sv used the phrase "Typ av storsegel" on `YachtDetail|overview.mainsail` against the
compound "Storsegelstyp" elsewhere, and now uses the compound in all three places, matching the
style of "Båttyp".

## 40. catamaran

Two hulls. The most-booked type on the site.

| Locale | Term       |
| ------ | ---------- |
| es     | Catamarán  |
| uk     | Катамаран  |
| de     | Katamaran  |
| fr     | Catamaran  |
| pl     | Katamaran  |
| it     | Catamarano |
| nl     | Catamaran  |
| sv     | Katamaran  |
| no     | Katamaran  |
| da     | Katamaran  |

Source: `Home|Hero.options.catamaran`, `Common|boatCard.charterTypes.catamaran`,
`PlanMyTrip|result.yachtType.catamaran`; database copy in `packages/db/src/boat-types.json` under
`"Catamaran"`. UI and database agree in all ten locales. No conflicts.

## 41. sailing yacht

A monohull under sail. The default hull type.

| Locale | UI                   | boat-types.json |
| ------ | -------------------- | --------------- |
| es     | Velero               | Velero          |
| uk     | Вітрильна яхта       | Вітрильна яхта  |
| de     | Segelyacht           | Segelyacht      |
| fr     | Voilier              | Voilier         |
| pl     | Jacht żaglowy        | Jacht żaglowy   |
| it     | Yacht a vela **[!]** | Barca a vela    |
| nl     | Zeiljacht            | Zeiljacht       |
| sv     | Segelyacht **[!]**   | Segelbåt        |
| no     | Seilyacht **[!]**    | Seilbåt         |
| da     | Sejlyacht **[!]**    | Sejlbåd         |

Source: `Home|Hero.options.sailingYacht`, `Layout|Footer.links.sailingYacht`,
`PlanMyTrip|result.yachtType.sailing`; `packages/db/src/boat-types.json`, entry `"Sailing yacht"`.

Conflicts: **it, sv, no and da each call it one thing in the UI and another on the home page's
boat-type card**, which sit on the same screen. sv, no and da say "yacht" in the UI and "boat" in
the card; it says "yacht" in the UI and "barca" in the card.

Recommendation, awaiting a native reviewer: sv "Segelbåt", no "Seilbåt", da "Sejlbåd" and it
"Barca a vela" in both places. In all four languages the boat word is what a native customer
searches for, and the card copy was written as prose rather than as a machine-translated label.

Still open, and left on purpose: the UI side of this pair is a facet label that arrives from the
provider through the catalogue sync, so matching it to the card means checking in an override in
`packages/db/src/translations/facet-labels.json` and overriding vendor data for four locales. That
is a decision about how far we override the provider, not a typo fix, so it waits for that decision
rather than being applied here.

## 42. motor yacht

A powered yacht, as opposed to a motor boat, which is the smaller category.

| Locale | Term           |
| ------ | -------------- |
| es     | Yate a motor   |
| uk     | Моторна яхта   |
| de     | Motoryacht     |
| fr     | Yacht à moteur |
| pl     | Jacht motorowy |
| it     | Yacht a motore |
| nl     | Motorjacht     |
| sv     | Motoryacht     |
| no     | Motoryacht     |
| da     | Motoryacht     |

Source: `Home|Hero.options.motorYacht`, `PlanMyTrip|result.yachtType.motor`;
`packages/db/src/boat-types.json`, entry `"Motor yacht"`. UI and database agree everywhere. No
conflicts.

## 43. gulet

A traditional wooden Turkish motorsailer, chartered with a full crew.

| Locale | UI               | boat-types.json         |
| ------ | ---------------- | ----------------------- |
| es     | Gulet            | Gulet                   |
| uk     | Гулет            | Гулет                   |
| de     | Gulet            | Gulet                   |
| fr     | Goélette **[!]** | Goélette turque (Gulet) |
| pl     | Gulet            | Gulet                   |
| it     | Caicco **[!]**   | Caicco (Gulet)          |
| nl     | Gulet            | Gulet                   |
| sv     | Gulet            | Gulet                   |
| no     | Gulet            | Gulet                   |
| da     | Gulet            | Gulet                   |

Source: `Home|Hero.options.gulet`, `PlanMyTrip|result.yachtType.gulet`, `Discounts|applies.allGullets`;
`packages/db/src/boat-types.json`, entry `"Gulet"`; facet values in
`packages/db/src/translations/{uk,da}.json` under `facets.category.Gulet`.

Settled: es rendered it "Goleta" (schooner) on the boat-type card, which was a meaning error and not
a style choice, and the card now says "Gulet" like the UI. Any explanation belongs in the card's
description text.

Open, but deliberate: fr and it keep the loanword in parentheses on the card
("Goélette turque (Gulet)", "Caicco (Gulet)") and drop it in the controls. The card has room to
teach the word and a control does not, so this is left for the French and Italian reviewers to
confirm rather than flatten.

## 44. house boat

A floating home rented at a mooring or on inland water. Barely sailed.

| Locale | boat-types.json     | facet label |
| ------ | ------------------- | ----------- |
| es     | Casa flotante       | not found   |
| uk     | Хаусбот             | Хаусбот     |
| de     | Hausboot            | not found   |
| fr     | House-boat **[EN]** | not found   |
| pl     | Houseboat **[EN]**  | not found   |
| it     | Houseboat **[EN]**  | not found   |
| nl     | Woonboot            | not found   |
| sv     | Husbåt              | not found   |
| no     | Husbåt              | not found   |
| da     | Husbåd              | Husbåd      |

Source: `packages/db/src/boat-types.json`, entry `"House boat"`;
`packages/db/src/translations/uk.json` and `packages/db/src/translations/da.json` under
`facets.category."House boat"`. The other eight locales take this facet from the provider sync, so
no checked-in value exists for them; "not found" above means exactly that, not that it is untranslated
on the site.

fr, pl and it keep the English loanword. No internal conflicts.

## 45. draft

Two unrelated senses share the English word, and the translations correctly diverge. Keep them
apart.

**Nautical draft**, how deep the hull sits:

| Locale | Term         |
| ------ | ------------ |
| es     | Calado       |
| uk     | Осадка       |
| de     | Tiefgang     |
| fr     | Tirant d'eau |
| pl     | Zanurzenie   |
| it     | Pescaggio    |
| nl     | Diepgang     |
| sv     | Djupgående   |
| no     | Dypgang      |
| da     | Dybgang      |

**Draft status**, an unpublished listing, route or booking:

| Locale | Term           |
| ------ | -------------- |
| es     | Borrador       |
| uk     | Чернетка       |
| de     | Entwurf        |
| fr     | Brouillon      |
| pl     | Wersja robocza |
| it     | Bozza          |
| nl     | Concept        |
| sv     | Utkast         |
| no     | Utkast         |
| da     | Kladde         |

Source: `Admin|Duplicates.detailFields.draft` for the nautical sense;
`Admin|Listings.status.draft`, `Admin|Routes.status.draft`, `Admin|Bookings.status.DRAFT`,
`Booking|detail.status.DRAFT` for the status.

Settled: pl carried two words for the status, "Szkic" on three keys and "Wersja robocza" on two, and
now says "Wersja robocza" on all five. It is the standard term for an unpublished record; "Szkic"
read as a sketch.

## 46. length

The hull length, a headline spec and a filter. Note the collision below.

| Locale | Term              |
| ------ | ----------------- |
| es     | Eslora **[!]**    |
| uk     | Довжина **[!]**   |
| de     | Länge **[!]**     |
| fr     | Longueur **[!]**  |
| pl     | Długość           |
| it     | Lunghezza **[!]** |
| nl     | Lengte **[!]**    |
| sv     | Längd             |
| no     | Lengde            |
| da     | Længde            |

Source: `Filters|labels.length`, `YachtDetail|overview.length`, `Common|boatCard.specs.length`,
`Admin|Duplicates.fields.length`.

Conflict: `RoutesMap|length` uses the same English word for a **route's duration**, and es, uk, de,
fr, it and nl correctly translate it as duration there ("Duración", "Тривалість", "Dauer", "Durée",
"Durata", "Duur"). **pl, sv, no and da instead reuse the physical-length word on the routes map**,
so a Polish, Swedish, Norwegian or Danish reader sees a route labelled with a hull measurement.

Recommendation, awaiting a native reviewer: pl, sv, no and da change `RoutesMap|length` to their
word for duration.

Still open, and left on purpose: the cause is the English key name. `RoutesMap|length` means a
route's duration, so a translator reading the key alone reaches for the hull word, and the six
locales that got it right did so by reading the screen. The real fix is renaming the key to
`duration` in the source and in all eleven locale files. That was not done in this pass because
another change was already in flight in those same `RoutesMap.json` files, and two edits to one file
from two directions is how a locale loses keys.

## 47. beam

The hull's width at its widest.

| Locale | Term      |
| ------ | --------- |
| es     | Manga     |
| uk     | Ширина    |
| de     | Breite    |
| fr     | Largeur   |
| pl     | Szerokość |
| it     | Larghezza |
| nl     | Breedte   |
| sv     | Bredd     |
| no     | Bredde    |
| da     | Bredde    |

Source: `Admin|Duplicates.detailFields.beam`, `YachtDetail|overview.beam`. No conflicts.

es is the only locale using the nautical term ("Manga") rather than the plain word for width. That
is correct Spanish for a boat spec and matches "Eslora" for length.

## 48. review

A customer's written rating of a charter. Not "to review" and not the admin's duplicate review
queue.

| Locale | Term             |
| ------ | ---------------- |
| es     | Opiniones        |
| uk     | Відгуки          |
| de     | Bewertungen      |
| fr     | Avis             |
| pl     | Opinie           |
| it     | Recensioni       |
| nl     | Reviews **[EN]** |
| sv     | Omdömen          |
| no     | Anmeldelser      |
| da     | Anmeldelser      |

Source: `YachtDetail|tabs.review`, `YachtDetail|sections.review`, `YachtDetail|review.empty`.

Careful: `Admin|Duplicates.title` ("Duplicate Review") and `Admin|Duplicates.detailFields.reviews`
("Provider reviews") are the admin's moderation sense and must not be aligned with this entry.

## 49. availability

Whether a yacht is free for a date range. Also the name of one of the sync jobs.

| Locale | Term            |
| ------ | --------------- |
| es     | Disponibilidad  |
| uk     | Доступність     |
| de     | Verfügbarkeit   |
| fr     | Disponibilités  |
| pl     | Dostępność      |
| it     | Disponibilità   |
| nl     | Beschikbaarheid |
| sv     | Tillgänglighet  |
| no     | Ledighet        |
| da     | Ledighed        |

Source: `Admin|Sync.kind.availability`; the customer-facing call to action is
`Booking|balance.notPayable.action` ("Check availability"). No conflicts.

## 50. cancellation

Ending a confirmed booking, and the policy that governs it.

| Locale | Cancellation  | Cancellation Policy         |
| ------ | ------------- | --------------------------- |
| es     | Cancelación   | Política de cancelación     |
| uk     | Скасування    | Політика скасування         |
| de     | Stornierung   | Stornierungsbedingungen     |
| fr     | Annulation    | Conditions d'annulation     |
| pl     | Anulowanie    | Zasady anulowania           |
| it     | Cancellazione | Condizioni di cancellazione |
| nl     | Annulering    | Annuleringsbeleid           |
| sv     | Avbokning     | Avbokningsvillkor           |
| no     | Avbestilling  | Avbestillingsvilkår         |
| da     | Afbestilling  | Afbestillingsbetingelser    |

Source: `Admin|Faq.categories.cancellation`, `YachtDetail|faqCategories.cancellation`;
`Layout|Legal.cancellation`, `Seo|Legal.cancellation.title`.

Settled: fr named the same legal page "Politique d'annulation" in its own title and metadata against
"Conditions d'annulation" in the footer, and `Seo|Legal.cancellation.title` now reads
"Conditions d'annulation" too. French consumer contracts are conventionally "conditions".

## 51. invoice

The document a business customer requests instead of paying by card, and the page that renders it.

| Locale | Term     |
| ------ | -------- |
| es     | Factura  |
| uk     | Рахунок  |
| de     | Rechnung |
| fr     | Facture  |
| pl     | Faktura  |
| it     | Fattura  |
| nl     | Factuur  |
| sv     | Faktura  |
| no     | Faktura  |
| da     | Faktura  |

Source: `Booking|invoice.title`, `Seo|Invoice.title`, `Admin|Payments.invoices.table.invoice`,
`Admin|Audit.entity.invoice_request`. All four agree in every locale. No conflicts.

## 52. VAT

Value added tax. Appears as an optional field on the invoice request and as a line on the invoice
itself.

| Locale | Number field            | On the invoice  |
| ------ | ----------------------- | --------------- |
| es     | Número de IVA           | NIF/IVA **[!]** |
| uk     | Номер ПДВ               | ПДВ             |
| de     | USt-IdNr.               | USt-IdNr.       |
| fr     | Numéro de TVA           | TVA             |
| pl     | Numer VAT               | VAT             |
| it     | Partita IVA             | P. IVA **[!]**  |
| nl     | Btw-nummer              | Btw             |
| sv     | Momsregistreringsnummer | Momsnr **[!]**  |
| no     | MVA-nummer              | MVA             |
| da     | Momsnummer              | Momsnr. **[!]** |

Source: `Booking|payment.invoice.vat` ("VAT Number (Optional)"), `Booking|invoice.vat`
("VAT {value}").

The two keys are different sentences, so most of the variation is expected. Worth a reviewer's eye
anyway: es introduces "NIF" on the invoice, a Spanish tax-ID abbreviation that does not appear in
the field the customer filled in; it abbreviates to "P. IVA"; sv and da abbreviate to "Momsnr" with
and without a full stop respectively, a detail that should be settled once.

## 53. yacht

The boat itself, as a record and as a label on booking documents. The product name for the thing
being chartered.

| Locale | Term  |
| ------ | ----- |
| es     | Yate  |
| uk     | Яхта  |
| de     | Yacht |
| fr     | Yacht |
| pl     | Jacht |
| it     | Yacht |
| nl     | Jacht |
| sv     | Båt   |
| no     | Yacht |
| da     | Båd   |

Source: `Booking|review.yacht`, `Booking|invoice.summary.yacht`,
`Booking|confirmation.summary.yacht`, `Admin|Bookings.table.charter`,
`Admin|Sync.unreleasedOptions.yacht` (eight occurrences, internally consistent in every locale).

Note: sv and da render it as "boat" rather than "yacht", which is idiomatic in both languages but
makes them the two locales where the word for yacht and the word for boat are the same. See entry 41,
where the same choice causes a real conflict.

---

# Inconsistencies to resolve

Grouped by locale. Every item is a place where one locale still renders the same English term two
different ways, or leaves it in English where the locale otherwise translates, with the reason it
was left rather than fixed. Each carries a recommendation from the entry above, which is a
suggestion for a native reviewer and not a decision. Items that have been settled are in "Resolved"
below.

## es (established locale)

1. **home base** renders as "Base" on `Admin|Duplicates.fields.base` and "Base de origen" on
   `Admin|Listings.sources.fields.home_base`; the customer-facing form in
   `Booking|review.depositRefundable` is a third, "la base náutica". Three surfaces, three registers;
   the reviewer has to decide whether the customer-facing sentence is allowed its own wording before
   the admin pair can be settled. Recommend "Base de origen" for the admin field.
2. **booking** as an FAQ category is singular in the admin (`Admin|Faq.categories.booking`,
   "Reserva") and plural on the yacht page (`YachtDetail|faqCategories.booking`, "Reservas"). Left
   because a category heading may legitimately be plural on the customer page; it needs a reviewer
   looking at both screens, not a find and replace.
3. **VAT** introduces "NIF" on `Booking|invoice.vat` ("NIF/IVA") that does not appear on
   `Booking|payment.invoice.vat` ("Número de IVA"). Left because the two are different sentences and
   Spanish invoices do commonly carry "NIF"; only a Spanish accountant's eye settles it.

## uk (established locale)

1. **check-in** renders as "заселення" on `Booking|invoice.payWhen.at_check_in` and "заїзд" on
   `Common|extras.payAtCheckIn`. Left open because neither is right: "заселення" reads as checking
   into a hotel and "заїзд" as driving in, and picking between two wrong words is a native
   reviewer's call, not an alignment.
2. **cabin** renders as "Каюти" on four keys and the genitive "Кают" on `Common|boatCard.specs.cabins`.
   Left because the card renders "3 кают" and the genitive may be the correct count form there; the
   fix, if any, is a plural-aware message rather than a flat label, which is a code change.
3. **transit log** is translated as "Транзитний журнал" on the standalone extra but kept as the Latin
   "Transit log" inside longer vendor strings in the same file. Left because the long strings are
   vendor text carried through verbatim, so making them agree means deciding how far we rewrite
   vendor copy.
4. **extras** uses "Додатково" for the bare term and "доплати" (surcharges) in "Обов'язкові доплати",
   so the pair is not built from one root. Left because both readings are good Ukrainian and the
   mandatory list really is surcharges; a reviewer picks the root for the whole family at once.
5. **sailing area** renders as "Регіон плавання" on `Filters|labels.sailingArea` and the bare
   "Регіон" on `Yachts|searchBar.kinds.region`. Left because the short form may be a deliberate fit
   for a narrow control.

## de (established locale)

1. **bareboat** is "Bareboat" on the two `Common` keys and "Ohne Crew" on `Home|Hero.options.bareboat`
   and `Layout|Footer.links.bareboat`, two keys each way. Left open because both are current German
   charter usage: "Bareboat" is what the trade writes and "Ohne Crew" is what a first-time customer
   reads. It is a reviewer's preference, so there is no majority to defer to.
2. **credits and balance**: `Credits|title` reads "Guthaben & Saldo", and "Guthaben" is also the word
   inside "Empfehlungsguthaben" (entry 32), so the screen title reads close to "balance and balance".
   Left because fixing it means renaming either the wallet title or the referral credit, and those
   are two different entries that have to move together.
3. **English left in place** on purpose but worth confirming: "Crew" (`Filters|labels.crew` and six
   others) and "Charter" (`Booking|detail.charterTitle`). Both are standard in German charter copy.

## fr (machine translation, awaiting native review)

1. **guests** is translated as "Passagers", the only locale that shifts guest to passenger. Left
   because it is internally consistent and defensible on a yacht; it is a conscious decision for the
   reviewer, not a defect. "Passengers" as an English source term does not occur anywhere.
2. **charter** is "Location" as a standalone term while compounds keep "charter"
   ("Une base de location" against charter inside the extras). Left because the standalone generic
   word and the compound trade word may both be right; changing it touches the whole charter family.

## pl (machine translation, awaiting native review)

1. **length** on `RoutesMap|length` reuses "Długość", the hull-length word, for a route's duration.
   Left because the English key name is the cause and the real fix is renaming the key to `duration`
   at source, which was not done in this pass with another change in flight in those files.
2. **skipper** is the bare "Skipper" on `Home|BudgetFinder.labels.skipper` and
   `PlanMyTrip|result.labels.skipper` but "Ze skipperem" on `Common|crewTypes.skipper`, where the
   other locales use a bare noun. Left because `crewTypes` is the crew _option_, which reads
   naturally as a prepositional phrase in Polish.
3. **referral credit** differs only in number, "Środki z poleceń" against "Środki z polecenia". Left
   as the smallest item on the list; a reviewer settles it in passing.

## it (machine translation, awaiting native review)

1. **sailing yacht** is "Yacht a vela" in the UI and "Barca a vela" in
   `packages/db/src/boat-types.json`, two labels for the same category on the same page. Left
   because the UI label comes from the provider through the catalogue sync, so aligning it means
   overriding vendor data in `packages/db/src/translations/facet-labels.json`. Recommend
   "Barca a vela" once that override is agreed.
2. **gulet** is "Caicco" in the UI and "Caicco (Gulet)" on the boat-type card. Left on purpose: the
   card has room to teach the loanword and a control does not.
3. **charter** is "Noleggio" as a standalone term but "charter" inside compounds
   ("Una base charter", "Sconto charter"). Same open question as fr.
4. **VAT** abbreviates to "P. IVA" on the invoice against "Partita IVA" on the field. Left because
   "P. IVA" is the conventional Italian abbreviation on an invoice line.

## nl (machine translation, awaiting native review)

1. **English left untranslated** where nl translates elsewhere: "Bareboat"
   (`Common|crewTypes.bareboat` and three more), "Operator"
   (`Admin|Commissions.table.operator` and seven more), "Provider"
   (`Admin|Sync.table.provider` and eleven more), "Charter" (`Booking|detail.charterTitle`),
   "Reviews" (`YachtDetail|tabs.review`). Left because Dutch charter and admin copy genuinely mixes
   English in, and replacing five terms at once changes the register of the whole locale. Bareboat
   and charter are trade terms and may be right; operator, provider and reviews have ordinary Dutch
   equivalents and are the three to ask about first.

## sv (machine translation, awaiting native review)

1. **sailing yacht** is "Segelyacht" in the UI and "Segelbåt" in
   `packages/db/src/boat-types.json`. Left for the same reason as it: the UI label is provider data
   and overriding it is a decision. Recommend "Segelbåt".
2. **length** on `RoutesMap|length` reuses "Längd", the hull-length word, for a route's duration.
   Same cause as pl: the English key name, whose rename is the real fix.
3. **hold** is "Reservation", which is close to sv's own reading of booking ("Bokning"); confirm the
   admin sync screen still distinguishes them. Left because both words are correct in isolation.
4. **VAT** abbreviates to "Momsnr" on the invoice against "Momsregistreringsnummer" on the field.
   The abbreviation is expected on an invoice line; only the full stop, which da writes and sv does
   not, should be settled once.

## no (machine translation, awaiting native review)

1. **sailing yacht** is "Seilyacht" in the UI and "Seilbåt" in
   `packages/db/src/boat-types.json`. Provider data on the UI side; recommend "Seilbåt".
2. **length** on `RoutesMap|length` reuses "Lengde", the hull-length word, for a route's duration.
   Same key-name cause as pl.
3. **extras** is "Ekstrautstyr" (extra equipment), which is narrower than the list's contents
   (cleaning, transfers, a skipper). Left because replacing it means finding a Norwegian word that
   covers services and equipment at once, which is a reviewer's job.
4. **credits and balance** is "Bonus og saldo", and "Vervebonus" uses the same "bonus" for the
   referral credit, so the wallet title reads close to "bonus and balance of bonus". Left for the
   same reason as the German pair: the title and the credit have to move together.
5. **hold** is "Reservasjon", close to no's "Booking"; confirm the two stay distinct.
6. **booking** is left as the English "Booking" while the locale translates elsewhere. Left because
   "Booking" is ordinary Norwegian usage, but it is the one term where the English makes the hold
   above harder to tell apart.

## da (machine translation, awaiting native review)

1. **sailing yacht** is "Sejlyacht" in the UI and "Sejlbåd" in
   `packages/db/src/boat-types.json`. Provider data on the UI side; recommend "Sejlbåd".
2. **length** on `RoutesMap|length` reuses "Længde", the hull-length word, for a route's duration.
   Same key-name cause as pl.
3. **hold** is "Reservation", close to da's "Booking"; confirm the two stay distinct.
4. **VAT** abbreviates to "Momsnr." on the invoice against "Momsnummer" on the field. Settle the
   full stop against sv's "Momsnr" once, for both locales.
5. **booking** is left as the English "Booking" while the locale translates elsewhere, with the same
   caveat as no.

## Cross-locale, worth one decision each

- **`RoutesMap|length`** reuses the hull-length word for a route's duration in **pl, sv, no and da**.
  The English key name is the root cause: it says "length" and means duration. Renaming it to
  `duration` in the source and in all eleven locale files is the real fix, and it was deliberately
  not done here because another change was already in flight in those `RoutesMap.json` files.
- **sailing yacht** disagrees between the UI facet label and `boat-types.json` in **it, sv, no and
  da**. The UI label comes from the provider through the catalogue sync, so aligning the two means
  checking in an override in `packages/db/src/translations/facet-labels.json`. That is a decision
  about overriding vendor data, not a typo fix.
- **charter inside compounds** in **fr and it**, where the standalone term is the generic rental
  word but compounds keep "charter".
- **VAT abbreviations on the invoice** in **it, sv and da**, all three shorter than the field label
  the customer filled in.

---

# Resolved

Conflicts that were open in an earlier pass of this file and have since been fixed in the message
and database files. Recorded so the same choice is not re-litigated, and so a reviewer who disagrees
knows what to change back.

**es**

- **bareboat** - "Sin patrón"; `Common|crewTypes.bareboat` joined the other three keys.
- **guests** - "Huéspedes"; `Booking|detail.guestsLabel` was "Personas".
- **marina** - "Marina"; `Booking|detail.marina` was "Puerto".
- **referral credit** - "Crédito por recomendación"; `YachtDetail|sidebar.credit.label` was
  "Crédito de referidos".
- **gulet** - "Gulet" on the boat-type card; `packages/db/src/boat-types.json` said "Goleta"
  (schooner), a meaning error rather than a style choice.

**de**

- **operator** - "Vercharterer" on all four admin keys, which also frees "Anbieter" to mean provider
  alone.
- **wishlist** - "Merkliste"; `YachtDetail|addToWishlist` is "Zur Merkliste" and `removeFromWishlist`
  is "Von Merkliste entfernen", where both said "Wunschliste".
- **home base** - "Heimatbasis"; `Admin|Duplicates.fields.base` said "Heimathafen".

**uk**

- **skipper** - "Зі шкіпером"; `Home|Hero.options.skippered` said "З капітаном".
- **referral credit** - "Бонус за рекомендацією"; `YachtDetail|sidebar.credit.label` said
  "Реферальний кредит".
- **home base** - "Домашня база"; `Admin|Duplicates.fields.base` said "База".

**fr**

- **optional extras** - "Suppléments facultatifs"; `YachtDetail|tabs.optional-extras` and
  `YachtDetail|sections.optionalExtras` said "Options", which collided with fr's word for a hold.
- **wishlist** - "Vos favoris"; `Wishlist|title` said "Votre liste d'envies".
- **cancellation policy** - "Conditions d'annulation"; `Seo|Legal.cancellation.title` said
  "Politique d'annulation".
- **bareboat** - "Sans skipper"; `Common|crewTypes.bareboat` and `Home|Hero.options.bareboat` said
  "Sans équipage".

**pl**

- **operator** - "Armator" everywhere; "Operator" is gone.
- **draft status** - "Wersja robocza" on all five status keys; "Szkic" is gone.
- **boat type** - "Typ jachtu"; `Filters|labels.boatType` said "Typ łodzi".
- **charter discount** - "Rabat na czarter"; `Common|quoteLines.provider-discount` said
  "Rabat czarterowy".
- **home base** - "Baza macierzysta"; `Admin|Duplicates.fields.base` said "Port macierzysty".
- **total** - "Suma"; `Admin|StaffBooking.fields.total` said "Razem".

**nl**

- **booking** - "Boeking"; `Admin|Faq.categories.booking` and `YachtDetail|faqCategories.booking`
  said "Boeken", the verb.
- **skipper** - "Schipper" on the "Skipper" priced extra in
  `packages/db/src/translations/extra-labels.json`.

**sv**

- **mainsail type** - "Storsegelstyp"; `YachtDetail|overview.mainsail` said "Typ av storsegel".
- **skipper** - "Skeppare" on the "Skipper" priced extra in
  `packages/db/src/translations/extra-labels.json`.

**da**

- **operator** - "Udlejer" on all four admin keys, so it no longer collides with "Leverandør" for
  provider.
