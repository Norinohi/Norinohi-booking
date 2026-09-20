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
  conflict found, grouped by locale.
- **Adding a language.** Fill in a column for it as you go, and add any term you had to decide
  rather than look up.
- **Adding a term.** Add it here in the same change, not afterwards.

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

| Source | What it holds |
| --- | --- |
| `apps/web/messages/<locale>/<Namespace>.json` | all UI copy, customer and admin |
| `packages/db/src/boat-types.json` | boat-type cards on the home page |
| `packages/db/src/translations/facet-labels.json` | facets no provider translates |
| `packages/db/src/translations/{uk,da}.json` | generated facet labels for the two locales no provider names |
| `packages/db/src/translations/extra-labels.json` | priced extras, keyed by the vendor's English |
| `packages/db/src/{catalogue-routes,popular-routes,site-faq}.json` | editorial route and FAQ copy |

Notation used below: **[!]** marks a conflict inside one locale, **[EN]** marks a term left in
English.

---

## 1. bareboat

The charter type where the customer sails the yacht themselves, no professional aboard. A crew
option, not a price or a hull type.

| Locale | Term |
| --- | --- |
| es | Sin patrón **[!]** (also "Sin tripulación") |
| uk | Без екіпажу |
| de | Bareboat **[!] [EN]** (also "Ohne Crew") |
| fr | Sans équipage **[!]** (also "Sans skipper") |
| pl | Bez załogi |
| it | Senza skipper |
| nl | Bareboat **[EN]** |
| sv | Utan besättning |
| no | Uten mannskap |
| da | Uden besætning |

Source: `Common|crewTypes.bareboat`, `Common|boatCard.charterTypes.bareboat`,
`Home|Hero.options.bareboat`, `Layout|Footer.links.bareboat`.

Conflicts: es renders it "Sin tripulación" on `Common|crewTypes.bareboat` but "Sin patrón" on the
other three. de renders it "Bareboat" in `Common` and "Ohne Crew" in `Home` and `Layout`. fr
renders it "Sans équipage" in `Common|crewTypes` and `Home` but "Sans skipper" in
`Common|boatCard.charterTypes`. nl leaves it in English everywhere.

Recommendation, awaiting a native reviewer: es "Sin patrón" (three of four occurrences, and it
matches the es rendering of skipper as "patrón"); de "Ohne Crew" (German for the customer-facing
hero and footer, and de already uses "Crew" for crew); fr "Sans skipper" is the pairing that mirrors
"Avec skipper", so the whole fr set stays symmetric.

## 2. skippered / with skipper

The charter type where a professional skipper sails the yacht and the customer is a guest. Paired
with bareboat on the same control.

| Locale | Term |
| --- | --- |
| es | Con patrón incluido |
| uk | З капітаном **[!]** (see below) |
| de | Mit Skipper |
| fr | Avec skipper |
| pl | Ze skipperem |
| it | Con skipper |
| nl | Met schipper |
| sv | Med skeppare |
| no | Med skipper |
| da | Med skipper |

Source: `Home|Hero.options.skippered`, `Layout|Footer.links.skippered`.

Conflict: uk says "З капітаном" (captain) here, but `Common|crewTypes.skipper` says "Зі шкіпером"
and `Home|BudgetFinder.labels.skipper` says "Шкіпер". Two different words for the same person on
two screens.

Recommendation, awaiting a native reviewer: uk "Зі шкіпером", to agree with the standalone term.

## 3. skipper

The licensed professional who sails the yacht. Also a role on the crew list.

| Locale | Term |
| --- | --- |
| es | Patrón **[!]** ("Con patrón" where the value labels the crew option) |
| uk | Шкіпер **[!]** (see entry 2) |
| de | Skipper |
| fr | Skipper |
| pl | Skipper **[!]** ("Ze skipperem" on `Common|crewTypes.skipper`) |
| it | Skipper |
| nl | Schipper **[!]** vs "Skipper" in the extras |
| sv | Skeppare **[!]** vs "Skipper" in the extras |
| no | Skipper |
| da | Skipper |

Source: `Common|crewTypes.skipper`, `Home|BudgetFinder.labels.skipper`,
`PlanMyTrip|result.labels.skipper`; extras: `packages/db/src/translations/extra-labels.json` key
`"Skipper"`.

Conflicts: nl says "Schipper" throughout the UI but "Skipper" on the priced extra of the same name.
sv says "Skeppare" in the UI and "Skipper" in the extras. A customer reading a yacht page then a
price breakdown sees both words.

Recommendation, awaiting a native reviewer: nl "Schipper" and sv "Skeppare" in both places; the UI
form is the one the customer meets first and more often.

## 4. crew

The people aboard other than the guests, and the name of the filter that chooses between bareboat,
skippered and full crew.

| Locale | Term |
| --- | --- |
| es | Tripulación |
| uk | Екіпаж |
| de | Crew **[EN]** |
| fr | Équipage |
| pl | Załoga |
| it | Equipaggio |
| nl | Bemanning |
| sv | Besättning |
| no | Mannskap |
| da | Besætning |

Source: `Filters|labels.crew`, `Booking|review.crew`, `YachtDetail|sidebar.crew`,
`Admin|Duplicates.detailFields.crewType` (all seven occurrences agree in every locale).

de uses the English "Crew" deliberately and consistently; German charter copy normally does. Left as
a note, not a conflict.

## 5. full crew

The charter type with skipper plus hostess or cook, the top of the three crew options.

| Locale | Term |
| --- | --- |
| es | Tripulación completa |
| uk | Повний екіпаж |
| de | Volle Crew |
| fr | Équipage complet |
| pl | Pełna załoga |
| it | Equipaggio completo |
| nl | Volledige bemanning |
| sv | Full besättning |
| no | Fullt mannskap |
| da | Fuld besætning |

Source: `Common|crewTypes.full-crew`, `Common|boatCard.crews.fullCrew`. No conflicts.

## 6. charter

The rental itself: one yacht, one date range, one customer. Not the company and not the booking
record.

| Locale | Term |
| --- | --- |
| es | Chárter |
| uk | Чартер |
| de | Charter **[EN]** |
| fr | Location |
| pl | Czarter |
| it | Noleggio |
| nl | Charter **[EN]** |
| sv | Charter **[EN]** |
| no | Charter **[EN]** |
| da | Charter **[EN]** |

Source: `Booking|detail.charterTitle`, `Admin|StaffBooking.fields.charter`,
`Admin|Payments.refunds.table.charter`. No conflicts.

Note for reviewers: fr "Location" and it "Noleggio" are the generic rental words, yet fr and it both
keep "charter" inside compounds ("base charter", "Sconto charter"). Worth a deliberate decision
rather than treating it as an error.

## 7. charter base / home base

The marina where the yacht is handed over and returned, and the operator's staff on site. It holds
the security deposit and takes the extras paid on arrival. "Home base" is the admin field for the
same thing.

| Locale | Term (charter base) | Term (home base, admin) |
| --- | --- | --- |
| es | Una base de chárter | Base de origen **[!]** (also plain "Base") |
| uk | Чартерної бази | Домашня база **[!]** (also "База") |
| de | Einer Charterbasis | Heimatbasis **[!]** (also "Heimathafen") |
| fr | Une base de location | Base |
| pl | Bazy czarterowej | Baza macierzysta **[!]** (also "Port macierzysty") |
| it | Una base charter | Base |
| nl | Een charterbasis | Thuishaven |
| sv | En charterbas | Hemmabas |
| no | En charterbase | Hjemmebase |
| da | En charterbase | Hjemmebase |

Source: `Admin|Routes.target.levelBase`, `Booking|review.depositRefundable`;
`Admin|Duplicates.fields.base` and `Admin|Listings.sources.fields.home_base` for the admin field.

Conflicts: es, uk, de and pl each render "Home base" two ways across those two admin keys. de is the
sharpest: "Heimathafen" (home port, a place) against "Heimatbasis" (home base, the operation). es
also renders the customer-facing base as "la base náutica" in `Booking|review.depositRefundable`,
a third form.

Recommendation, awaiting a native reviewer: pick the base form, not the port form, since the field
identifies the operator's site and not the harbour: de "Heimatbasis", pl "Baza macierzysta",
uk "Домашня база", es "Base de origen".

## 8. marina

The harbour itself, as a search facet and as a field on a booking.

| Locale | Term |
| --- | --- |
| es | Marina **[!]** (also "Puerto") |
| uk | Марина |
| de | Marina |
| fr | Marina |
| pl | Marina |
| it | Marina |
| nl | Jachthaven |
| sv | Marina |
| no | Marina |
| da | Marina |

Source: `Filters|labels.marina`, `Yachts|searchBar.kinds.base`, `Booking|detail.marina`.

Conflict: es says "Marina" in the filter and the search bar but "Puerto" on the booking detail.

Recommendation, awaiting a native reviewer: es "Marina" on all three; "Puerto" is the generic port
and would also have to serve for "home port".

## 9. berth

A sleeping place aboard, counted separately from cabins.

| Locale | Term |
| --- | --- |
| es | Literas |
| uk | Спальні місця |
| de | Kojen |
| fr | Couchettes |
| pl | Koje |
| it | Posti letto |
| nl | Slaapplaatsen |
| sv | Kojplatser |
| no | Køyeplasser |
| da | Køjepladser |

Source: `Admin|Duplicates.fields.berths`, `Admin|Duplicates.signalFields.berths`. No conflicts.

## 10. cabin

A sleeping compartment. A headline spec on every yacht card and the detail page.

| Locale | Term |
| --- | --- |
| es | Camarotes |
| uk | Каюти **[!]** ("Кают" on the boat card) |
| de | Kabinen |
| fr | Cabines |
| pl | Kabiny |
| it | Cabine |
| nl | Hutten |
| sv | Hytter |
| no | Lugarer |
| da | Kahytter |

Source: `Filters|labels.cabins`, `YachtDetail|overview.cabins`, `Common|boatCard.specs.cabins`.

Conflict: uk uses the nominative plural "Каюти" on four keys and the genitive "Кают" on
`Common|boatCard.specs.cabins`.

Recommendation, awaiting a native reviewer: the boat card renders "3 кают", so the genitive may be
correct in that one position. A reviewer should confirm whether the card needs a count-dependent
form rather than a flat label.

## 11. guests

The people the charter is booked for. Distinct from crew, and distinct from berths.

| Locale | Term |
| --- | --- |
| es | Huéspedes **[!]** (also "Personas") |
| uk | Гості |
| de | Gäste |
| fr | Passagers |
| pl | Goście |
| it | Ospiti |
| nl | Gasten |
| sv | Gäster |
| no | Gjester |
| da | Gæster |

Source: `Booking|invoice.summary.guests`, `Booking|detail.guestsLabel`.

Conflicts: es says "Huéspedes" on the invoice and "Personas" on the booking detail. fr translates it
as "Passagers" (passengers), which is a defensible choice for a yacht but is the only locale that
shifts the concept.

Recommendation, awaiting a native reviewer: es "Huéspedes" on both, since it is the word on the
document the customer keeps.

"Passengers" as an English source term does not occur anywhere in the repository. Do not introduce
it as a second word for the same thing.

## 12. check-in

Arrival at the base, boarding and handover day. It is a moment in time, and several prices are
attached to it ("pay at check-in").

| Locale | Term |
| --- | --- |
| es | En la llegada **[!]** (also "al llegar") |
| uk | При заселенні **[!]** (also "при заїзді") |
| de | Beim Check-in **[EN in part]** |
| fr | À l'embarquement |
| pl | Przy zaokrętowaniu |
| it | Al check-in **[EN in part]** |
| nl | Bij het inchecken |
| sv | Vid incheckning |
| no | Ved innsjekk |
| da | Ved check-in **[EN in part]** |

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

| Locale | Term |
| --- | --- |
| es | Zona de navegación |
| uk | Регіон плавання **[!]** ("Регіон" in the search bar) |
| de | Segelrevier |
| fr | Zone de navigation |
| pl | Akwen |
| it | Area di navigazione |
| nl | Vaargebied |
| sv | Seglingsområde |
| no | Seilområde |
| da | Sejlområde |

Source: `Filters|labels.sailingArea`, `Yachts|searchBar.kinds.region`.

Conflict: uk shortens it to "Регіон" in the search bar. That may be a deliberate fit for a narrow
control rather than an error.

Recommendation, awaiting a native reviewer: keep "Регіон плавання" where space allows and note the
short form as an accepted abbreviation rather than a second term.

## 14. listing

One yacht as published on this marketplace: the operator's boat plus our pricing, photos and status.
Not the boat and not the booking.

| Locale | Term |
| --- | --- |
| es | Anuncio |
| uk | Оголошення |
| de | Inserat |
| fr | Annonce |
| pl | Oferta |
| it | Annuncio |
| nl | Advertentie |
| sv | Annons |
| no | Annonse |
| da | Annonce |

Source: `Admin|Audit.entity.listing`, `Admin|Listings.table.listing`; plural forms at
`Admin|Listings.title`, `Layout|Sidebar.listings`, `Seo|Listings.title`. Singular and plural agree
in every locale. No conflicts.

## 15. operator

The business that owns and runs the yacht. The party we hold a commission agreement with.

| Locale | Term |
| --- | --- |
| es | Operador |
| uk | Оператор |
| de | Betreiber **[!]** (also "Vercharterer", also "Anbieter") |
| fr | Opérateur |
| pl | Operator **[!]** (also "Armator") |
| it | Operatore |
| nl | Operator **[EN]** |
| sv | Operatör |
| no | Operatør |
| da | Udbyder |

Source: `Admin|Listings.table.operator`, `Admin|Commissions.table.operator`,
`Admin|Listings.filters.operator`, `Admin|Duplicates.fields.operator` (twelve occurrences in all).

Conflicts: **de renders it three ways** across the admin: "Vercharterer" in Commissions, "Betreiber"
in Duplicates and Listings tables, "Anbieter" in the Listings filter. "Anbieter" is also de's word
for **provider**, so the German admin uses one word for two different entities. pl splits evenly
between "Operator" and "Armator" (shipowner). da uses "Udbyder", which is da's natural word for
provider, creating the same collision as de.

Recommendation, awaiting a native reviewer: de "Vercharterer" (it is the charter-specific word and
leaves "Anbieter" free for provider); pl "Armator" or "Operator" consistently, reviewer's choice,
but not both; da needs a word that is not "Udbyder" so that operator and provider stay apart.

## 16. charter company

The customer-facing name for the operator, shown on the yacht page and as a filter. Same entity as
"operator", different audience.

| Locale | Term |
| --- | --- |
| es | Empresa de chárter |
| uk | Чартерна компанія |
| de | Charterunternehmen |
| fr | Loueur |
| pl | Firma czarterowa |
| it | Società di charter |
| nl | Charterbedrijf |
| sv | Charterbolag |
| no | Charterselskap |
| da | Charterfirma |

Source: `Filters|labels.charterCompany`, `YachtDetail|importantInfo.charterCompany`. No conflicts.

## 17. provider

The inventory system we sync from, NauSYS or Booking Manager. Admin-only. Never the operator.

| Locale | Term |
| --- | --- |
| es | Proveedor |
| uk | Постачальник |
| de | Anbieter **[!]** (collides with operator, see entry 15) |
| fr | Fournisseur |
| pl | Dostawca |
| it | Fornitore |
| nl | Provider **[EN]** |
| sv | Leverantör |
| no | Leverandør |
| da | Leverandør **[!]** (collides with "Udbyder" for operator, see entry 15) |

Source: `Admin|Sync.table.provider`, `Admin|Commissions.table.provider`,
`Admin|Audit.entity.provider` (twelve occurrences, internally consistent in every locale).

The conflict is between terms, not within one: de and da both use near-synonyms for operator and
provider, so a German or Danish admin cannot tell the two columns apart. Flagged for the reviewer of
each language.

## 18. booking

The confirmed reservation with money against it, the record a customer opens under "My bookings".

| Locale | Term |
| --- | --- |
| es | Reserva |
| uk | Бронювання |
| de | Buchung |
| fr | Réservation |
| pl | Rezerwacja |
| it | Prenotazione |
| nl | Boeking **[!]** ("Boeken" on the FAQ category) |
| sv | Bokning |
| no | Booking **[EN]** |
| da | Booking **[EN]** |

Source: `Booking|detail.panels.main`, `Admin|Audit.entity.booking`,
`Admin|Faq.categories.booking`, `YachtDetail|faqCategories.booking`.

Conflict: nl uses the noun "Boeking" everywhere except the two FAQ-category keys, which say "Boeken"
(the verb, "to book"). es pluralises to "Reservas" on `YachtDetail|faqCategories.booking` while the
admin FAQ category stays singular.

Recommendation, awaiting a native reviewer: nl "Boeking" on the FAQ category too, so the category
name matches the entity; es make the two FAQ-category keys agree with each other.

## 19. hold / option

A temporary reservation of a yacht with the operator before any money moves, which expires by
itself. Not a discount hold and not a payment hold.

| Locale | Term |
| --- | --- |
| es | Opción |
| uk | Опція |
| de | Option |
| fr | Option |
| pl | Blokada |
| it | Opzione |
| nl | Optie |
| sv | Reservation |
| no | Reservasjon |
| da | Reservation |

Source: `Admin|Sync.unreleasedOptions.hold`.

No conflict, but note the split in approach: seven locales use the trade term "option", pl uses
"Blokada" (block), and sv, no and da use "Reservation", which in those languages is also a plausible
word for **booking**. Reviewers of sv, no and da should confirm that "Reservation" and the booking
term (sv "Bokning", no and da "Booking") stay clearly distinct on the admin sync screen.

## 20. quote

A priced offer for specific dates, valid for a window, before it becomes a booking. Both a customer
action ("request a quote") and a booking status ("Quoted").

| Locale | Request a quote | Status: Quoted |
| --- | --- | --- |
| es | Solicitar presupuesto **[!]** (also "Solicita un presupuesto") | Presupuestada |
| uk | Запросити пропозицію | Розраховано |
| de | Angebot anfordern | Angebot erstellt |
| fr | Demander un devis | Devis établi |
| pl | Poproś o wycenę | Wyceniona |
| it | Richiedi preventivo **[!]** (also "Richiedi un preventivo") | Preventivata |
| nl | Offerte aanvragen | Offerte |
| sv | Begär offert **[!]** (also "Begär en offert") | Offererad |
| no | Be om tilbud | Tilbud gitt |
| da | Bed om et tilbud | Tilbud givet |

Source: `YachtDetail|sidebar.requestQuote`, `YachtDetail|quoteDialog.title`;
`Admin|Bookings.status.QUOTED`, `Booking|detail.status.QUOTED`.

Conflicts in es, it and sv are only the article (button label versus dialog heading) and are
probably intentional. The noun is stable in every locale; that is what matters for the glossary.

## 21. security deposit

The refundable sum the charter base holds against damage, taken at the base and not by us.

| Locale | Term |
| --- | --- |
| es | Fianza |
| uk | Застава |
| de | Kaution |
| fr | Caution |
| pl | Kaucja |
| it | Cauzione |
| nl | Borg |
| sv | Deposition |
| no | Depositum |
| da | Depositum |

Source: `Admin|Duplicates.detailFields.deposit`, `Booking|detail.kind.security_deposit`; the same
terms appear in `packages/db/src/translations/extra-labels.json` under `"Security Deposit"` for de,
es and uk. No conflicts.

## 22. prepayment

The share of the charter price the customer pays us now to confirm the booking. The rest is paid
later. Never the security deposit.

| Locale | Term |
| --- | --- |
| es | Anticipo |
| uk | Передоплата |
| de | Anzahlung |
| fr | Acompte |
| pl | Przedpłata |
| it | Acconto |
| nl | Aanbetaling |
| sv | Förskottsbetalning |
| no | Forskudd |
| da | Forudbetaling |

Source: `YachtDetail|sidebar.payNow` ("Booking Prepayment (Pay Now)"),
`Common|boatCard.prepayment`, `Common|extras.dueWithPrepayment`. No conflicts.

Worth keeping an eye on: de "Anzahlung" and the security deposit "Kaution" are easy to confuse in
running text; the two must never swap.

## 23. deposit insurance

An optional product that replaces most of the security deposit with a premium. Sometimes sold by the
base as a "damage waiver".

| Locale | Term |
| --- | --- |
| es | Seguro de fianza |
| uk | Страхування застави |
| de | Kautionsversicherung |
| fr | Assurance caution |
| pl | Ubezpieczenie kaucji |
| it | Assicurazione cauzione |
| nl | Borgverzekering |
| sv | Depositionsförsäkring |
| no | Depositumsforsikring |
| da | Depositumforsikring |

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

| Locale | Term |
| --- | --- |
| es | Extras |
| uk | Додатково |
| de | Extras |
| fr | Suppléments |
| pl | Dodatki |
| it | Extra |
| nl | Extra's |
| sv | Tillval |
| no | Ekstrautstyr |
| da | Tillæg |

Source: `Booking|review.extras`, `Booking|steps.extras`. No conflicts on the bare term.

no "Ekstrautstyr" literally means extra equipment, which is narrower than what the list holds
(cleaning, transfers, a skipper). Flagged for the Norwegian reviewer.

## 25. mandatory extras

Extras the base charges whether or not the customer wants them. Included in the quoted total.

| Locale | Term |
| --- | --- |
| es | Extras obligatorios |
| uk | Обов'язкові доплати |
| de | Obligatorische Extras |
| fr | Suppléments obligatoires |
| pl | Obowiązkowe dodatki |
| it | Extra obbligatori |
| nl | Verplichte extra's |
| sv | Obligatoriska tillval |
| no | Obligatorisk ekstrautstyr |
| da | Obligatoriske tillæg |

Source: `YachtDetail|sections.mandatoryExtras`, `YachtDetail|tabs.mandatory-extras`,
`YachtDetail|sidebar.groups.mandatory`. No conflicts.

uk uses "доплати" (surcharges) here but "Додатково" for bare extras, so the uk pair is not built
from one root. Flagged for the Ukrainian reviewer.

## 26. optional extras

Extras the customer chooses. Some are paid now, some at the base.

| Locale | Term |
| --- | --- |
| es | Extras opcionales |
| uk | Додаткові опції |
| de | Optionale Extras |
| fr | Options **[!]** (also "Suppléments facultatifs") |
| pl | Opcjonalne dodatki **[!]** (also "Dodatki opcjonalne") |
| it | Extra facoltativi |
| nl | Optionele extra's |
| sv | Valfria tillval |
| no | Valgfritt ekstrautstyr |
| da | Valgfrie tillæg |

Source: `Booking|extras.optional`, `YachtDetail|tabs.optional-extras`,
`YachtDetail|sections.optionalExtras`.

Conflicts: fr says "Suppléments facultatifs" in the booking flow and the bare "Options" on the yacht
page. That is the worse of the two, because fr also uses "Option" for a **hold** (entry 19). pl
merely reorders the words.

Recommendation, awaiting a native reviewer: fr "Suppléments facultatifs" everywhere, to keep
"Option" reserved for the hold; pl settle on "Dodatki opcjonalne" to match "Obowiązkowe dodatki"
word order.

## 27. final cleaning

The end-of-charter cleaning fee. Nearly always a mandatory extra. The vendors write it either
"Final cleaning" or "End cleaning" and both map to the same term here.

| Locale | Term |
| --- | --- |
| es | Limpieza final |
| uk | Фінальне прибирання |
| de | Endreinigung |
| fr | Nettoyage final |
| pl | Sprzątanie końcowe |
| it | Pulizia finale |
| nl | Eindschoonmaak |
| sv | Slutstädning |
| no | Sluttvask |
| da | Slutrengøring |

Source: `packages/db/src/translations/extra-labels.json`, keys `"Final cleaning"` and
`"End cleaning"`, which carry identical values in all ten locales. No conflicts.

## 28. transit log

The Croatian port-authority document and fee, bought at the base and usually bundled with cleaning
and gas. A proper noun of the trade, not a log book.

| Locale | Term |
| --- | --- |
| es | Transit log **[EN]** |
| uk | Транзитний журнал |
| de | Transitlog |
| fr | Transit log **[EN]** |
| pl | Transit log **[EN]** |
| it | Transit log **[EN]** |
| nl | Transit log **[EN]** |
| sv | Transit log **[EN]** |
| no | Transit log **[EN]** |
| da | Transit log **[EN]** |

Source: `packages/db/src/translations/extra-labels.json`, key `"Transit log"`.

Keeping the English is the right call for a document customers meet under that name at the base. uk
is the one locale that translates it, and the uk reviewer should decide whether "Транзитний журнал"
or the Latin form serves a Ukrainian customer better. Note that longer vendor strings such as
`"Transit log / Full comfort pack - obligatory < 13 m, except catamarans"` keep the Latin form in uk
as well, so uk is inconsistent with itself across the extras file.

## 29. tourist tax

The per-person, per-night levy collected at the base.

| Locale | Term |
| --- | --- |
| es | Tasa turística |
| uk | Туристичний збір |
| de | Kurtaxe |
| fr | Taxe de séjour |
| pl | Opłata klimatyczna |
| it | Tassa di soggiorno |
| nl | Toeristenbelasting |
| sv | Turistskatt |
| no | Turistskatt |
| da | Turistskat |

Source: `packages/db/src/translations/extra-labels.json`, key `"Tourist tax"`. No conflicts.

## 30. wishlist

The customer's saved yachts. One list, no folders.

| Locale | Noun | In the add/remove buttons |
| --- | --- | --- |
| es | Tus favoritos | favoritos |
| uk | Ваше обране | обране |
| de | Ihre Merkliste **[!]** | Wunschliste |
| fr | Vos favoris / Votre liste d'envies **[!]** | favoris |
| pl | Twoje ulubione | ulubionych |
| it | I tuoi preferiti | preferiti |
| nl | Jouw verlanglijst | verlanglijst |
| sv | Din önskelista | önskelistan |
| no | Ønskelisten din | ønskelisten |
| da | Din ønskeliste | ønskelisten |

Source: `Wishlist|title`, `Seo|Wishlist.title`, `YachtDetail|addToWishlist`,
`YachtDetail|removeFromWishlist`, `Common|boatCard.save`.

Conflicts: **de calls the same list "Merkliste" on the page and "Wunschliste" on the button.** fr
uses "favoris" on the SEO title and the buttons but "liste d'envies" as the page heading, so the
page title does not match its own tab title.

Recommendation, awaiting a native reviewer: de settle on one, most likely "Merkliste", which is the
established German word for a saved-items list on a booking site; fr settle on "favoris", which is
already three of the four occurrences.

## 31. referral

The scheme where an existing customer invites a friend and both get credit.

| Locale | Term |
| --- | --- |
| es | Referidos |
| uk | Реферали |
| de | Empfehlungen |
| fr | Parrainages |
| pl | Polecenia |
| it | Inviti |
| nl | Doorverwijzingen |
| sv | Värvningar |
| no | Vervinger |
| da | Henvisninger |

Source: `Layout|Sidebar.referrals`, `Layout|UserMenu.referrals`; possessive forms at
`Referrals|title` and `Seo|Referrals.title` ("Your Referrals"). The possessive forms differ only by
the pronoun in every locale, which is expected, not a conflict.

## 32. referral credit

The balance earned by referring someone, spendable against a charter.

| Locale | Term |
| --- | --- |
| es | Crédito por recomendación **[!]** (also "Crédito de referidos") |
| uk | Бонус за рекомендацією **[!]** (also "Реферальний кредит") |
| de | Empfehlungsguthaben |
| fr | Crédit de parrainage |
| pl | Środki z poleceń **[!]** (also "Środki z polecenia") |
| it | Credito da invito |
| nl | Verwijstegoed |
| sv | Värvningstillgodohavande |
| no | Vervebonus |
| da | Tilgodehavende fra henvisning |

Source: `Common|quoteLines.referral-credit`, `Booking|detail.priceLineLabels.referralCredit`,
`Admin|StaffBooking.priceLines.labels.referralCredit`, `YachtDetail|sidebar.credit.label`.

Conflicts: **es and uk each use a different term on the yacht page from the one on the price
breakdown and the booking detail.** In uk the two are not even built from the same root
("рекомендація" versus "реферальний"). pl differs only in number.

Recommendation, awaiting a native reviewer: es "Crédito por recomendación" and uk
"Бонус за рекомендацією", each being three of the four occurrences, including the price line the
customer actually reads at checkout.

Note that es, uk and it use a different root here ("recomendación", "рекомендація", "invito") from
the one they use for the referral scheme itself in entry 31 ("Referidos", "Реферали", "Inviti"). it
is the only one of the three that is internally consistent.

## 33. credits and balance

The wallet screen: credit earned and the money available to spend.

| Locale | Term |
| --- | --- |
| es | Créditos y saldo |
| uk | Кредити та баланс |
| de | Guthaben & Saldo |
| fr | Crédits et solde |
| pl | Środki i saldo |
| it | Crediti e saldo |
| nl | Tegoed & saldo |
| sv | Tillgodohavande och saldo |
| no | Bonus og saldo |
| da | Tilgodehavende og saldo |

Source: `Credits|title`, `Layout|Sidebar.credits`, `Layout|UserMenu.credits`, `Seo|Credits.title`.
All four agree in every locale. No conflicts.

Note for the German and Norwegian reviewers: de "Guthaben & Saldo" and no "Bonus og saldo" both use
a word for the first half that the same locale uses elsewhere for the credit itself
(de "Empfehlungsguthaben"), so the screen title reads close to "balance and balance".

## 34. remaining balance

What is still owed after the prepayment. Distinct from the wallet balance in entry 33.

| Locale | Term |
| --- | --- |
| es | Saldo pendiente |
| uk | Залишок до сплати |
| de | Restbetrag |
| fr | Solde restant |
| pl | Pozostało do zapłaty |
| it | Saldo residuo |
| nl | Resterend bedrag |
| sv | Återstående belopp |
| no | Restbeløp |
| da | Resterende beløb |

Source: `Booking|invoice.totals.balance`. Compare `Credits|balance.label` ("Available balance") for
the wallet sense. No conflicts.

## 35. discount

A reduction applied to a price, managed by staff and identified by a code.

| Locale | Term |
| --- | --- |
| es | Descuentos |
| uk | Знижки |
| de | Rabatte |
| fr | Remises |
| pl | Rabaty |
| it | Sconti |
| nl | Kortingen |
| sv | Rabatter |
| no | Rabatter |
| da | Rabatter |

Source: `Discounts|tabs.discounts`; singular at `Discounts|table.name` ("Discount Name"). No
conflicts.

## 36. charter discount

The operator's own price reduction, arriving from the provider on a quote line. Not one of ours.

| Locale | Term |
| --- | --- |
| es | Descuento del chárter |
| uk | Знижка на чартер |
| de | Charter-Rabatt |
| fr | Remise sur la location |
| pl | Rabat na czarter **[!]** (also "Rabat czarterowy") |
| it | Sconto charter |
| nl | Charterkorting |
| sv | Charterrabatt |
| no | Charterrabatt |
| da | Charterrabat |

Source: `Common|quoteLines.provider-discount`, `Booking|detail.priceLineLabels.charterDiscount`,
`Admin|StaffBooking.priceLines.labels.charterDiscount`.

Conflict: pl says "Rabat na czarter" on two keys and "Rabat czarterowy" on
`Common|quoteLines.provider-discount`, which is the line the customer sees in the price breakdown.

Recommendation, awaiting a native reviewer: pl one form on all three; "Rabat czarterowy" is the
adjectival form and reads better in a table, but the majority is currently "Rabat na czarter".

## 37. builder

The yard that built the hull: Beneteau, Lagoon, Bavaria. A spec field and a search facet.

| Locale | Term |
| --- | --- |
| es | Astillero |
| uk | Верф |
| de | Werft |
| fr | Chantier |
| pl | Stocznia |
| it | Cantiere |
| nl | Werf |
| sv | Varv |
| no | Verft |
| da | Værft |

Source: `Admin|Duplicates.detailFields.builder`, `Admin|Duplicates.signalFields.builder`,
`Filters|chips.builder`. No conflicts.

## 38. boat type

The category a yacht falls in: catamaran, sailing yacht, motor yacht and so on. A top-level filter
and a home page section.

| Locale | Term |
| --- | --- |
| es | Tipo de barco |
| uk | Тип човна |
| de | Bootstyp |
| fr | Type de bateau |
| pl | Typ łodzi **[!]** (also "Typ jachtu") |
| it | Tipo di barca |
| nl | Boottype |
| sv | Båttyp |
| no | Båttype |
| da | Bådtype |

Source: `Filters|labels.boatType`, `YachtDetail|overview.boatType`, `Layout|Nav.boatTypes`.

Conflict: pl says "Typ łodzi" (boat) in the filter and "Typ jachtu" (yacht) on the yacht page.

Recommendation, awaiting a native reviewer: pl "Typ jachtu", because the facet values are yachts and
pl already uses "Jacht" for the yacht itself (entry 53).

## 39. mainsail type

How the mainsail is rigged: full batten, furling and so on. A spec and a filter.

| Locale | Term |
| --- | --- |
| es | Tipo de mayor |
| uk | Тип грота |
| de | Großsegeltyp |
| fr | Type de grand-voile |
| pl | Typ grota |
| it | Tipo di randa |
| nl | Type grootzeil |
| sv | Storsegelstyp **[!]** (also "Typ av storsegel") |
| no | Type storseil |
| da | Storsejlstype |

Source: `Filters|labels.mainsailType`, `Common|boatCard.specs.mainsail`,
`YachtDetail|overview.mainsail`. The values themselves are in
`packages/db/src/translations/facet-labels.json` under `sail_type`.

Conflict: sv uses the compound "Storsegelstyp" twice and the phrase "Typ av storsegel" on the yacht
page. Cosmetic, but the yacht page is where a customer compares boats.

Recommendation, awaiting a native reviewer: sv "Storsegelstyp", matching the compound style of
"Båttyp".

## 40. catamaran

Two hulls. The most-booked type on the site.

| Locale | Term |
| --- | --- |
| es | Catamarán |
| uk | Катамаран |
| de | Katamaran |
| fr | Catamaran |
| pl | Katamaran |
| it | Catamarano |
| nl | Catamaran |
| sv | Katamaran |
| no | Katamaran |
| da | Katamaran |

Source: `Home|Hero.options.catamaran`, `Common|boatCard.charterTypes.catamaran`,
`PlanMyTrip|result.yachtType.catamaran`; database copy in `packages/db/src/boat-types.json` under
`"Catamaran"`. UI and database agree in all ten locales. No conflicts.

## 41. sailing yacht

A monohull under sail. The default hull type.

| Locale | UI | boat-types.json |
| --- | --- | --- |
| es | Velero | Velero |
| uk | Вітрильна яхта | Вітрильна яхта |
| de | Segelyacht | Segelyacht |
| fr | Voilier | Voilier |
| pl | Jacht żaglowy | Jacht żaglowy |
| it | Yacht a vela **[!]** | Barca a vela |
| nl | Zeiljacht | Zeiljacht |
| sv | Segelyacht **[!]** | Segelbåt |
| no | Seilyacht **[!]** | Seilbåt |
| da | Sejlyacht **[!]** | Sejlbåd |

Source: `Home|Hero.options.sailingYacht`, `Layout|Footer.links.sailingYacht`,
`PlanMyTrip|result.yachtType.sailing`; `packages/db/src/boat-types.json`, entry `"Sailing yacht"`.

Conflicts: **it, sv, no and da each call it one thing in the UI and another on the home page's
boat-type card**, which sit on the same screen. sv, no and da say "yacht" in the UI and "boat" in
the card; it says "yacht" in the UI and "barca" in the card.

Recommendation, awaiting a native reviewer: sv "Segelbåt", no "Seilbåt", da "Sejlbåd" and it
"Barca a vela" in both places. In all four languages the boat word is what a native customer
searches for, and the card copy was written as prose rather than as a machine-translated label.

## 42. motor yacht

A powered yacht, as opposed to a motor boat, which is the smaller category.

| Locale | Term |
| --- | --- |
| es | Yate a motor |
| uk | Моторна яхта |
| de | Motoryacht |
| fr | Yacht à moteur |
| pl | Jacht motorowy |
| it | Yacht a motore |
| nl | Motorjacht |
| sv | Motoryacht |
| no | Motoryacht |
| da | Motoryacht |

Source: `Home|Hero.options.motorYacht`, `PlanMyTrip|result.yachtType.motor`;
`packages/db/src/boat-types.json`, entry `"Motor yacht"`. UI and database agree everywhere. No
conflicts.

## 43. gulet

A traditional wooden Turkish motorsailer, chartered with a full crew.

| Locale | UI | boat-types.json |
| --- | --- | --- |
| es | Gulet **[!]** | Goleta |
| uk | Гулет | Гулет |
| de | Gulet | Gulet |
| fr | Goélette **[!]** | Goélette turque (Gulet) |
| pl | Gulet | Gulet |
| it | Caicco **[!]** | Caicco (Gulet) |
| nl | Gulet | Gulet |
| sv | Gulet | Gulet |
| no | Gulet | Gulet |
| da | Gulet | Gulet |

Source: `Home|Hero.options.gulet`, `PlanMyTrip|result.yachtType.gulet`, `Discounts|applies.allGullets`;
`packages/db/src/boat-types.json`, entry `"Gulet"`; facet values in
`packages/db/src/translations/{uk,da}.json` under `facets.category.Gulet`.

Conflicts: **es translates it as "Goleta" (schooner) in the database and keeps "Gulet" in the UI.**
A schooner is not a gulet, so this is a meaning change, not a style choice. fr and it keep the
loanword in parentheses in the database card but drop it in the UI.

Recommendation, awaiting a native reviewer: es "Gulet" in both, with any explanation kept to the
card's description text; fr and it keep the parenthesised form on the card, since it is the card
that has room to teach the word, and use the bare loanword in controls.

## 44. house boat

A floating home rented at a mooring or on inland water. Barely sailed.

| Locale | boat-types.json | facet label |
| --- | --- | --- |
| es | Casa flotante | not found |
| uk | Хаусбот | Хаусбот |
| de | Hausboot | not found |
| fr | House-boat **[EN]** | not found |
| pl | Houseboat **[EN]** | not found |
| it | Houseboat **[EN]** | not found |
| nl | Woonboot | not found |
| sv | Husbåt | not found |
| no | Husbåt | not found |
| da | Husbåd | Husbåd |

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

| Locale | Term |
| --- | --- |
| es | Calado |
| uk | Осадка |
| de | Tiefgang |
| fr | Tirant d'eau |
| pl | Zanurzenie |
| it | Pescaggio |
| nl | Diepgang |
| sv | Djupgående |
| no | Dypgang |
| da | Dybgang |

**Draft status**, an unpublished listing, route or booking:

| Locale | Term |
| --- | --- |
| es | Borrador |
| uk | Чернетка |
| de | Entwurf |
| fr | Brouillon |
| pl | Wersja robocza **[!]** (also "Szkic") |
| it | Bozza |
| nl | Concept |
| sv | Utkast |
| no | Utkast |
| da | Kladde |

Source: `Admin|Duplicates.detailFields.draft` for the nautical sense;
`Admin|Listings.status.draft`, `Admin|Routes.status.draft`, `Admin|Bookings.status.DRAFT`,
`Booking|detail.status.DRAFT` for the status.

Conflict: pl is the only locale with two words for the status, "Szkic" on
`Admin|Bookings.status.DRAFT`, `Booking|detail.status.DRAFT` and
`Admin|Duplicates.listingStatus.draft`, and "Wersja robocza" on `Admin|Listings.status.draft` and
`Admin|Routes.status.draft`.

Recommendation, awaiting a native reviewer: pl "Wersja robocza" throughout; it is the standard term
for an unpublished record and "Szkic" reads as a sketch.

## 46. length

The hull length, a headline spec and a filter. Note the collision below.

| Locale | Term |
| --- | --- |
| es | Eslora **[!]** |
| uk | Довжина **[!]** |
| de | Länge **[!]** |
| fr | Longueur **[!]** |
| pl | Długość |
| it | Lunghezza **[!]** |
| nl | Lengte **[!]** |
| sv | Längd |
| no | Lengde |
| da | Længde |

Source: `Filters|labels.length`, `YachtDetail|overview.length`, `Common|boatCard.specs.length`,
`Admin|Duplicates.fields.length`.

Conflict: `RoutesMap|length` uses the same English word for a **route's duration**, and es, uk, de,
fr, it and nl correctly translate it as duration there ("Duración", "Тривалість", "Dauer", "Durée",
"Durata", "Duur"). **pl, sv, no and da instead reuse the physical-length word on the routes map**,
so a Polish, Swedish, Norwegian or Danish reader sees a route labelled with a hull measurement.

Recommendation, awaiting a native reviewer: pl, sv, no and da change `RoutesMap|length` to their
word for duration. The English key should probably be renamed too, but that is a source change and
out of scope for this file.

## 47. beam

The hull's width at its widest.

| Locale | Term |
| --- | --- |
| es | Manga |
| uk | Ширина |
| de | Breite |
| fr | Largeur |
| pl | Szerokość |
| it | Larghezza |
| nl | Breedte |
| sv | Bredd |
| no | Bredde |
| da | Bredde |

Source: `Admin|Duplicates.detailFields.beam`, `YachtDetail|overview.beam`. No conflicts.

es is the only locale using the nautical term ("Manga") rather than the plain word for width. That
is correct Spanish for a boat spec and matches "Eslora" for length.

## 48. review

A customer's written rating of a charter. Not "to review" and not the admin's duplicate review
queue.

| Locale | Term |
| --- | --- |
| es | Opiniones |
| uk | Відгуки |
| de | Bewertungen |
| fr | Avis |
| pl | Opinie |
| it | Recensioni |
| nl | Reviews **[EN]** |
| sv | Omdömen |
| no | Anmeldelser |
| da | Anmeldelser |

Source: `YachtDetail|tabs.review`, `YachtDetail|sections.review`, `YachtDetail|review.empty`.

Careful: `Admin|Duplicates.title` ("Duplicate Review") and `Admin|Duplicates.detailFields.reviews`
("Provider reviews") are the admin's moderation sense and must not be aligned with this entry.

## 49. availability

Whether a yacht is free for a date range. Also the name of one of the sync jobs.

| Locale | Term |
| --- | --- |
| es | Disponibilidad |
| uk | Доступність |
| de | Verfügbarkeit |
| fr | Disponibilités |
| pl | Dostępność |
| it | Disponibilità |
| nl | Beschikbaarheid |
| sv | Tillgänglighet |
| no | Ledighet |
| da | Ledighed |

Source: `Admin|Sync.kind.availability`; the customer-facing call to action is
`Booking|balance.notPayable.action` ("Check availability"). No conflicts.

## 50. cancellation

Ending a confirmed booking, and the policy that governs it.

| Locale | Cancellation | Cancellation Policy |
| --- | --- | --- |
| es | Cancelación | Política de cancelación |
| uk | Скасування | Політика скасування |
| de | Stornierung | Stornierungsbedingungen |
| fr | Annulation | Conditions d'annulation **[!]** (also "Politique d'annulation") |
| pl | Anulowanie | Zasady anulowania |
| it | Cancellazione | Condizioni di cancellazione |
| nl | Annulering | Annuleringsbeleid |
| sv | Avbokning | Avbokningsvillkor |
| no | Avbestilling | Avbestillingsvilkår |
| da | Afbestilling | Afbestillingsbetingelser |

Source: `Admin|Faq.categories.cancellation`, `YachtDetail|faqCategories.cancellation`;
`Layout|Legal.cancellation`, `Seo|Legal.cancellation.title`.

Conflict: fr names the same legal page "Conditions d'annulation" in the footer and
"Politique d'annulation" in its own page title and metadata.

Recommendation, awaiting a native reviewer: fr "Conditions d'annulation" in both, since French
consumer contracts are conventionally "conditions" and the footer link is what a customer clicks.

## 51. invoice

The document a business customer requests instead of paying by card, and the page that renders it.

| Locale | Term |
| --- | --- |
| es | Factura |
| uk | Рахунок |
| de | Rechnung |
| fr | Facture |
| pl | Faktura |
| it | Fattura |
| nl | Factuur |
| sv | Faktura |
| no | Faktura |
| da | Faktura |

Source: `Booking|invoice.title`, `Seo|Invoice.title`, `Admin|Payments.invoices.table.invoice`,
`Admin|Audit.entity.invoice_request`. All four agree in every locale. No conflicts.

## 52. VAT

Value added tax. Appears as an optional field on the invoice request and as a line on the invoice
itself.

| Locale | Number field | On the invoice |
| --- | --- | --- |
| es | Número de IVA | NIF/IVA **[!]** |
| uk | Номер ПДВ | ПДВ |
| de | USt-IdNr. | USt-IdNr. |
| fr | Numéro de TVA | TVA |
| pl | Numer VAT | VAT |
| it | Partita IVA | P. IVA **[!]** |
| nl | Btw-nummer | Btw |
| sv | Momsregistreringsnummer | Momsnr **[!]** |
| no | MVA-nummer | MVA |
| da | Momsnummer | Momsnr. **[!]** |

Source: `Booking|payment.invoice.vat` ("VAT Number (Optional)"), `Booking|invoice.vat`
("VAT {value}").

The two keys are different sentences, so most of the variation is expected. Worth a reviewer's eye
anyway: es introduces "NIF" on the invoice, a Spanish tax-ID abbreviation that does not appear in
the field the customer filled in; it abbreviates to "P. IVA"; sv and da abbreviate to "Momsnr" with
and without a full stop respectively, a detail that should be settled once.

## 53. yacht

The boat itself, as a record and as a label on booking documents. The product name for the thing
being chartered.

| Locale | Term |
| --- | --- |
| es | Yate |
| uk | Яхта |
| de | Yacht |
| fr | Yacht |
| pl | Jacht |
| it | Yacht |
| nl | Jacht |
| sv | Båt |
| no | Yacht |
| da | Båd |

Source: `Booking|review.yacht`, `Booking|invoice.summary.yacht`,
`Booking|confirmation.summary.yacht`, `Admin|Bookings.table.charter`,
`Admin|Sync.unreleasedOptions.yacht` (eight occurrences, internally consistent in every locale).

Note: sv and da render it as "boat" rather than "yacht", which is idiomatic in both languages but
makes them the two locales where the word for yacht and the word for boat are the same. See entry 41,
where the same choice causes a real conflict.

---

# Inconsistencies to resolve

Grouped by locale. Every item is a place where one locale renders the same English term two
different ways, or leaves it in English where the locale otherwise translates. Each carries a
recommendation from the entry above, which is a suggestion for a native reviewer and not a decision.

## es (established locale)

1. **bareboat** renders as "Sin tripulación" on `Common|crewTypes.bareboat` and "Sin patrón" on
   `Common|boatCard.charterTypes.bareboat`, `Home|Hero.options.bareboat`,
   `Layout|Footer.links.bareboat`. Recommend "Sin patrón".
2. **guests** renders as "Huéspedes" on `Booking|invoice.summary.guests` and "Personas" on
   `Booking|detail.guestsLabel`. Recommend "Huéspedes".
3. **marina** renders as "Marina" on `Filters|labels.marina` and "Puerto" on `Booking|detail.marina`.
   Recommend "Marina".
4. **referral credit** renders as "Crédito por recomendación" on three keys and
   "Crédito de referidos" on `YachtDetail|sidebar.credit.label`. Recommend
   "Crédito por recomendación".
5. **gulet** renders as "Gulet" in the UI and "Goleta" (schooner) in
   `packages/db/src/boat-types.json`. This one is a meaning change, not a wording choice. Recommend
   "Gulet".
6. **home base** renders as "Base" on `Admin|Duplicates.fields.base` and "Base de origen" on
   `Admin|Listings.sources.fields.home_base`; the customer-facing form in
   `Booking|review.depositRefundable` is a third, "la base náutica".
7. **booking** as an FAQ category is singular in the admin (`Admin|Faq.categories.booking`) and
   plural on the yacht page (`YachtDetail|faqCategories.booking`).
8. **VAT** introduces "NIF" on `Booking|invoice.vat` that does not appear on
   `Booking|payment.invoice.vat`.

## uk (established locale)

1. **skipper** renders as "капітан" in `Home|Hero.options.skippered` and "шкіпер" in
   `Common|crewTypes.skipper` and `Home|BudgetFinder.labels.skipper`. Recommend "шкіпер".
2. **referral credit** renders as "Бонус за рекомендацією" on three keys and
   "Реферальний кредит" on `YachtDetail|sidebar.credit.label`, from two unrelated roots. Recommend
   "Бонус за рекомендацією".
3. **check-in** renders as "заселення" on `Booking|invoice.payWhen.at_check_in` and "заїзд" on
   `Common|extras.payAtCheckIn`.
4. **cabin** renders as "Каюти" on four keys and "Кают" on `Common|boatCard.specs.cabins`. May be a
   correct count form; needs confirming.
5. **sailing area** renders as "Регіон плавання" on `Filters|labels.sailingArea` and the bare
   "Регіон" on `Yachts|searchBar.kinds.region`.
6. **home base** renders as "База" on `Admin|Duplicates.fields.base` and "Домашня база" on
   `Admin|Listings.sources.fields.home_base`.
7. **transit log** is translated as "Транзитний журнал" on the standalone extra but kept as the Latin
   "Transit log" inside longer vendor strings in the same file.
8. **extras** uses "Додатково" for the bare term and "доплати" in "Обов'язкові доплати", so the pair
   is not built from one root.

## de (established locale)

1. **operator** renders three ways: "Vercharterer" (`Admin|Commissions.table.operator`), "Betreiber"
   (`Admin|Duplicates.fields.operator`, `Admin|Listings.table.operator`) and "Anbieter"
   (`Admin|Listings.filters.operator`). **"Anbieter" is also de's word for provider**, so two
   different entities share a label. Recommend "Vercharterer".
2. **wishlist** is "Merkliste" on `Wishlist|title` and `Seo|Wishlist.title` but "Wunschliste" on
   `YachtDetail|addToWishlist` and `YachtDetail|removeFromWishlist`. Recommend "Merkliste".
3. **bareboat** is "Bareboat" on the two `Common` keys and "Ohne Crew" on `Home|Hero.options.bareboat`
   and `Layout|Footer.links.bareboat`. Recommend "Ohne Crew".
4. **home base** is "Heimathafen" on `Admin|Duplicates.fields.base` and "Heimatbasis" on
   `Admin|Listings.sources.fields.home_base`. Recommend "Heimatbasis".
5. **credits and balance**: `Credits|title` reads "Guthaben & Saldo", and "Guthaben" is also the word
   inside "Empfehlungsguthaben", so the screen title reads close to "balance and balance".
6. **English left in place** on purpose but worth confirming: "Crew" (`Filters|labels.crew` and six
   others), "Charter" (`Booking|detail.charterTitle`), "Bareboat".

## fr (machine translation, awaiting native review)

1. **optional extras** is "Suppléments facultatifs" on `Booking|extras.optional` and "Options" on
   `YachtDetail|tabs.optional-extras` and `YachtDetail|sections.optionalExtras`. "Option" is also
   fr's word for a **hold**, so the two collide. Recommend "Suppléments facultatifs".
2. **wishlist** is "favoris" on `Seo|Wishlist.title` and the buttons but "liste d'envies" on
   `Wishlist|title`, so the page heading does not match its own tab title. Recommend "favoris".
3. **cancellation policy** is "Conditions d'annulation" on `Layout|Legal.cancellation` and
   "Politique d'annulation" on `Seo|Legal.cancellation.title`. Recommend "Conditions d'annulation".
4. **bareboat** is "Sans équipage" on `Common|crewTypes.bareboat` and `Home|Hero.options.bareboat`
   but "Sans skipper" on `Common|boatCard.charterTypes.bareboat`. Recommend "Sans skipper", to mirror
   "Avec skipper".
5. **guests** is translated as "Passagers", the only locale that shifts guest to passenger. Not a
   conflict, but a decision that should be conscious.
6. **charter** is "Location" as a standalone term while compounds keep "charter"
   ("Une base de location" but also fr's own use of charter elsewhere in extras). Confirm.

## pl (machine translation, awaiting native review)

1. **length** on `RoutesMap|length` reuses "Długość", the hull-length word, for a route's duration.
   Six other locales say duration there. Recommend pl's word for duration.
2. **operator** splits evenly between "Operator" (Commissions, Duplicates) and "Armator"
   (`Admin|Listings.filters.operator`, `Admin|Listings.table.operator` and two more). Recommend one.
3. **draft status** is "Szkic" on `Admin|Bookings.status.DRAFT`, `Booking|detail.status.DRAFT` and
   `Admin|Duplicates.listingStatus.draft`, but "Wersja robocza" on `Admin|Listings.status.draft` and
   `Admin|Routes.status.draft`. Recommend "Wersja robocza".
4. **boat type** is "Typ łodzi" on `Filters|labels.boatType` and "Typ jachtu" on
   `YachtDetail|overview.boatType`. Recommend "Typ jachtu".
5. **charter discount** is "Rabat na czarter" on two keys and "Rabat czarterowy" on
   `Common|quoteLines.provider-discount`, the line the customer reads.
6. **home base** is "Port macierzysty" on `Admin|Duplicates.fields.base` and "Baza macierzysta" on
   `Admin|Listings.sources.fields.home_base`. Recommend "Baza macierzysta".
7. **skipper** is "Skipper" on `Home|BudgetFinder.labels.skipper` and `PlanMyTrip|result.labels.skipper`
   but "Ze skipperem" on `Common|crewTypes.skipper`, where the other locales use a bare noun.
8. **optional extras** word order differs: "Dodatki opcjonalne" against "Opcjonalne dodatki".
9. **total** is "Suma" on `Admin|Bookings.table.total` and "Razem" on `Admin|StaffBooking.fields.total`.

## it (machine translation, awaiting native review)

1. **sailing yacht** is "Yacht a vela" in the UI and "Barca a vela" in
   `packages/db/src/boat-types.json`, two labels for the same category on the same page. Recommend
   "Barca a vela".
2. **gulet** is "Caicco" in the UI and "Caicco (Gulet)" on the boat-type card. Recommend keeping the
   parenthesised loanword on the card only.
3. **charter** is "Noleggio" as a standalone term but "charter" inside compounds
   ("Una base charter", "Sconto charter"). Confirm.
4. **VAT** abbreviates to "P. IVA" on the invoice against "Partita IVA" on the field.

## nl (machine translation, awaiting native review)

1. **skipper** is "Schipper" throughout the UI but "Skipper" on the priced extra of the same name in
   `packages/db/src/translations/extra-labels.json`. Recommend "Schipper" in both.
2. **booking** is "Boeking" everywhere except `Admin|Faq.categories.booking` and
   `YachtDetail|faqCategories.booking`, which say "Boeken" (the verb). Recommend "Boeking".
3. **English left untranslated** where nl translates elsewhere: "Bareboat"
   (`Common|crewTypes.bareboat` and three more), "Operator"
   (`Admin|Commissions.table.operator` and seven more), "Provider"
   (`Admin|Sync.table.provider` and eleven more), "Charter" (`Booking|detail.charterTitle`),
   "Reviews" (`YachtDetail|tabs.review`). Bareboat and charter are trade terms and may be right;
   operator, provider and reviews have ordinary Dutch equivalents.

## sv (machine translation, awaiting native review)

1. **sailing yacht** is "Segelyacht" in the UI and "Segelbåt" in
   `packages/db/src/boat-types.json`. Recommend "Segelbåt".
2. **skipper** is "Skeppare" in the UI and "Skipper" on the priced extra. Recommend "Skeppare".
3. **length** on `RoutesMap|length` reuses "Längd", the hull-length word, for a route's duration.
4. **mainsail type** is "Storsegelstyp" twice and "Typ av storsegel" on
   `YachtDetail|overview.mainsail`. Recommend "Storsegelstyp".
5. **hold** is "Reservation", which is close to sv's own reading of booking; confirm the admin sync
   screen still distinguishes them.
6. **VAT** abbreviates to "Momsnr" on the invoice against "Momsregistreringsnummer" on the field.

## no (machine translation, awaiting native review)

1. **sailing yacht** is "Seilyacht" in the UI and "Seilbåt" in
   `packages/db/src/boat-types.json`. Recommend "Seilbåt".
2. **length** on `RoutesMap|length` reuses "Lengde", the hull-length word, for a route's duration.
3. **extras** is "Ekstrautstyr" (extra equipment), which is narrower than the list's contents
   (cleaning, transfers, a skipper).
4. **credits and balance** is "Bonus og saldo", and "Vervebonus" uses the same "bonus" for the
   referral credit, so the wallet title reads close to "bonus and balance of bonus".
5. **hold** is "Reservasjon", close to no's "Booking"; confirm the two stay distinct.
6. **booking** is left as the English "Booking" while the locale translates elsewhere.

## da (machine translation, awaiting native review)

1. **operator** is "Udbyder" and **provider** is "Leverandør". "Udbyder" is Danish's natural word for
   provider, so the two admin columns are hard to tell apart. Needs a distinct word for one of them.
2. **sailing yacht** is "Sejlyacht" in the UI and "Sejlbåd" in
   `packages/db/src/boat-types.json`. Recommend "Sejlbåd".
3. **length** on `RoutesMap|length` reuses "Længde", the hull-length word, for a route's duration.
4. **hold** is "Reservation", close to da's "Booking"; confirm the two stay distinct.
5. **VAT** abbreviates to "Momsnr." on the invoice against "Momsnummer" on the field.
6. **booking** is left as the English "Booking" while the locale translates elsewhere.

## Cross-locale, worth one decision each

- **operator vs provider** collide in **de** ("Anbieter" for both) and in **da** ("Udbyder" and
  "Leverandør", near synonyms). These are the two entities the admin most needs to tell apart.
- **`RoutesMap|length`** reuses the hull-length word for a route's duration in **pl, sv, no and da**.
  The English key is the root cause and should probably be renamed at source.
- **sailing yacht** disagrees between the UI and `boat-types.json` in **it, sv, no and da**.
- **skipper** disagrees between the UI and `extra-labels.json` in **nl and sv**.
