-- Correct the seeded FAQ promise, preserving any independently edited answers.
UPDATE "faq"
SET "answer" = 'Cancellation terms are set by the charter company and differ between operators and rates. Before booking, contact us to request the cancellation terms for your chosen yacht and dates.'
WHERE "id" = 'faq_site_en_cancellation_1'
  AND "listing_id" IS NULL
  AND "locale" = 'en'
  AND "answer" = 'Cancellation terms are set by the charter company and differ between operators and rates. The terms for the yacht you chose are shown in the price breakdown before you pay.';
--> statement-breakpoint
UPDATE "faq"
SET "answer" = 'Die Stornierungsbedingungen legt das Charterunternehmen fest; sie unterscheiden sich je nach Anbieter und Tarif. Kontaktieren Sie uns vor der Buchung, um die Bedingungen für Ihre gewählte Yacht und den gewünschten Zeitraum anzufordern.'
WHERE "id" = 'faq_site_de_cancellation_1'
  AND "listing_id" IS NULL
  AND "locale" = 'de'
  AND "answer" = 'Die Stornierungsbedingungen legt das Charterunternehmen fest; sie unterscheiden sich je nach Anbieter und Tarif. Die Bedingungen für die gewählte Yacht stehen vor der Zahlung in der Preisaufstellung.';
--> statement-breakpoint
UPDATE "faq"
SET "answer" = 'Las condiciones de cancelación las fija la empresa de chárter y varían según el operador y la tarifa. Antes de reservar, contacta con nosotros para solicitar las condiciones del yate y las fechas elegidas.'
WHERE "id" = 'faq_site_es_cancellation_1'
  AND "listing_id" IS NULL
  AND "locale" = 'es'
  AND "answer" = 'Las condiciones de cancelación las fija la empresa de chárter y varían según el operador y la tarifa. Las condiciones del yate elegido se muestran en el desglose del precio antes de pagar.';
--> statement-breakpoint
UPDATE "faq"
SET "answer" = 'Умови скасування встановлює чартерна компанія, і вони відрізняються між операторами й тарифами. Перед бронюванням зверніться до нас, щоб отримати умови скасування для обраної яхти та дат.'
WHERE "id" = 'faq_site_uk_cancellation_1'
  AND "listing_id" IS NULL
  AND "locale" = 'uk'
  AND "answer" = 'Умови скасування встановлює чартерна компанія, і вони відрізняються між операторами й тарифами. Умови для обраної яхти показуються в розрахунку перед оплатою.';
