/**
 * Curated labels for priced extras named the same way by more than one provider.
 *
 * Booking Manager publishes no translations at all, in any locale, and keys its extras per
 * base pair and boat class rather than against a dictionary — 19,482 service ids for 12,827
 * names, "Moorings Fee" alone being 5,628 of them. There is no id to translate against, so
 * these are matched on the name instead, and one entry serves every id that carries it.
 *
 * Scope is deliberate. What is here are generic charter fees and equipment: the words a
 * customer reads on a line item and has to understand before agreeing to pay. What is not here
 * is the long tail those 12,827 names mostly consist of — insurance terms with deductibles,
 * package contents, a boat's own name — because an approximate translation of contractual
 * wording is worse than the vendor's own English.
 *
 * `apply-translations.ts` writes these; `extra_label_translation` in the schema explains where
 * they sit relative to the provider's own wording, which always wins.
 *
 * Keys are the English name as the vendor writes it. Case and punctuation are folded by the
 * read join, so "Boat Cleaning" also covers "boat cleaning"; a plural is not folded, so
 * "Beach towel" and "Beach towels" are both listed.
 */
export const extraLabels = {
  "Automatic life jackets (per unit, per week)": {
    de: "Automatische Rettungswesten (pro Stück, pro Woche)",
    es: "Chalecos salvavidas automáticos (por unidad y semana)",
    uk: "Автоматичні рятувальні жилети (за штуку, на тиждень)",
  },
  "BBQ ( Portable, 1 x gas bottle included,  per week)": {
    de: "Grill (tragbar, inkl. 1 Gasflasche, pro Woche)",
    es: "Barbacoa (portátil, 1 bombona incluida, por semana)",
    uk: "Барбекю (переносне, 1 газовий балон, на тиждень)",
  },
  "Barbecue - Week or more 2027": {
    de: "Grill – eine Woche oder länger, 2027",
    es: "Barbacoa – una semana o más, 2027",
    uk: "Барбекю — тиждень і більше, 2027",
  },
  "Barbecue - short stay 2027": {
    de: "Grill – Kurzaufenthalt, 2027",
    es: "Barbacoa – estancia corta, 2027",
    uk: "Барбекю — коротка оренда, 2027",
  },
  "Bicycle (adult) - 10 days": {
    de: "Fahrrad (Erwachsene) – 10 Tage",
    es: "Bicicleta (adulto) – 10 días",
    uk: "Велосипед (дорослий) — 10 днів",
  },
  "Bicycle (adult) - 11 days": {
    de: "Fahrrad (Erwachsene) – 11 Tage",
    es: "Bicicleta (adulto) – 11 días",
    uk: "Велосипед (дорослий) — 11 днів",
  },
  "Bicycle (adult) - Short stay": {
    de: "Fahrrad (Erwachsene) – Kurzaufenthalt",
    es: "Bicicleta (adulto) – estancia corta",
    uk: "Велосипед (дорослий) — коротка оренда",
  },
  "Bicycle (adult) - one week": {
    de: "Fahrrad (Erwachsene) – eine Woche",
    es: "Bicicleta (adulto) – una semana",
    uk: "Велосипед (дорослий) — тиждень",
  },
  "Bicycle (adult) - two weeks": {
    de: "Fahrrad (Erwachsene) – zwei Wochen",
    es: "Bicicleta (adulto) – dos semanas",
    uk: "Велосипед (дорослий) — два тижні",
  },
  "Damage waiver Gold option": {
    de: "Kautionsversicherung Gold",
    es: "Reducción de franquicia, opción Gold",
    uk: "Зменшення депозиту, опція Gold",
  },
  "Damage waiver Silver option": {
    de: "Kautionsversicherung Silber",
    es: "Reducción de franquicia, opción Silver",
    uk: "Зменшення депозиту, опція Silver",
  },
  "Fishing equipment (fishing rod & steel)": {
    de: "Angelausrüstung (Rute und Vorfach)",
    es: "Equipo de pesca (caña y bajo de acero)",
    uk: "Риболовне спорядження (вудка і поводок)",
  },
  "Mooring on first and last day in our marina": {
    de: "Liegeplatz am ersten und letzten Tag in unserer Marina",
    es: "Amarre el primer y el último día en nuestro puerto",
    uk: "Стоянка в нашій марині в перший і останній день",
  },
  "Pet on board (up to 7kg, per charter )": {
    de: "Haustier an Bord (bis 7 kg, pro Charter)",
    es: "Mascota a bordo (hasta 7 kg, por chárter)",
    uk: "Тварина на борту (до 7 кг, за чартер)",
  },
  "Pets allowed (up to 7 kg)": {
    de: "Haustiere erlaubt (bis 7 kg)",
    es: "Mascotas permitidas (hasta 7 kg)",
    uk: "Тварини дозволені (до 7 кг)",
  },
  "SC - Provisioning for the Cook (mandatory)": {
    de: "Verpflegung für den Koch (obligatorisch)",
    es: "Aprovisionamiento para el cocinero (obligatorio)",
    uk: "Харчування для кухаря (обовʼязково)",
  },
  "Snorkeling Equipment Set (mask + flippers)": {
    de: "Schnorchelset (Maske und Flossen)",
    es: "Set de snorkel (máscara y aletas)",
    uk: "Набір для снорклінгу (маска і ласти)",
  },
  "WiFi spot (10 GB)": {
    de: "WLAN-Hotspot (10 GB)",
    es: "Punto Wi-Fi (10 GB)",
    uk: "Wi-Fi точка (10 ГБ)",
  },
  "Wifi Unlimited long duration": {
    de: "WLAN unbegrenzt, lange Mietdauer",
    es: "Wi-Fi ilimitado, larga duración",
    uk: "Безлімітний Wi-Fi, довга оренда",
  },
  "Wifi Unlimited long stay": {
    de: "WLAN unbegrenzt, langer Aufenthalt",
    es: "Wi-Fi ilimitado, estancia larga",
    uk: "Безлімітний Wi-Fi, довга оренда",
  },
  "Wifi Unlimited short stay": {
    de: "WLAN unbegrenzt, kurzer Aufenthalt",
    es: "Wi-Fi ilimitado, estancia corta",
    uk: "Безлімітний Wi-Fi, коротка оренда",
  },
  "BVI Cruising Tax": {
    de: "BVI-Cruising-Steuer",
    es: "Tasa de navegación de las BVI",
    uk: "Круїзний збір Британських Віргінських Островів",
  },
  "BVI Visar contribution": {
    de: "BVI-VISAR-Beitrag",
    es: "Contribución BVI VISAR",
    uk: "Внесок BVI VISAR (пошук і порятунок)",
  },
  "Bed linen and towels": {
    de: "Bettwäsche und Handtücher",
    es: "Ropa de cama y toallas",
    uk: "Постільна білизна та рушники",
  },
  "Damage waiver for any extra week over 2 weeks": {
    de: "Kautionsversicherung für jede weitere Woche über zwei Wochen",
    es: "Reducción de franquicia por cada semana adicional a partir de dos",
    uk: "Зменшення депозиту за кожен тиждень понад два",
  },
  "End cleaning 5 cabins and catamarans": {
    de: "Endreinigung, 5 Kabinen und Katamarane",
    es: "Limpieza final, 5 camarotes y catamaranes",
    uk: "Фінальне прибирання, 5 кают і катамарани",
  },
  "End cleaning included in Starter pack": {
    de: "Endreinigung im Starterpaket enthalten",
    es: "Limpieza final incluida en el pack inicial",
    uk: "Фінальне прибирання входить у стартовий пакет",
  },
  "Fuel (payable at base,according to consumption)": {
    de: "Treibstoff (an der Basis nach Verbrauch zu zahlen)",
    es: "Combustible (se paga en la base según el consumo)",
    uk: "Пальне (оплата на базі за фактичним використанням)",
  },
  "Gas consumption": { de: "Gasverbrauch", es: "Consumo de gas", uk: "Витрата газу" },
  "Outboard/bed linen/bath towels": {
    de: "Außenborder / Bettwäsche / Badetücher",
    es: "Fueraborda / ropa de cama / toallas de baño",
    uk: "Підвісний мотор / постільна білизна / рушники",
  },
  "Port services per person": {
    de: "Hafendienste pro Person",
    es: "Servicios portuarios por persona",
    uk: "Портові послуги на особу",
  },
  "Service Pack": { de: "Servicepaket", es: "Pack de servicios", uk: "Сервісний пакет" },
  "Tourist tax (9,31 EUR per person per week)": {
    de: "Kurtaxe (9,31 EUR pro Person und Woche)",
    es: "Tasa turística (9,31 EUR por persona y semana)",
    uk: "Туристичний збір (9,31 EUR з особи на тиждень)",
  },
  "Tourist tax per person": {
    de: "Kurtaxe pro Person",
    es: "Tasa turística por persona",
    uk: "Туристичний збір з особи",
  },
  "Tourist tax/per person (total sum calculated upon check-in)": {
    de: "Kurtaxe pro Person (Gesamtbetrag wird beim Check-in berechnet)",
    es: "Tasa turística por persona (importe total calculado en el check-in)",
    uk: "Туристичний збір з особи (загальна сума рахується при заїзді)",
  },
  "Transit log per person": {
    de: "Transitlog pro Person",
    es: "Transit log por persona",
    uk: "Транзитний журнал з особи",
  },
  APA: { de: "APA (Bordkasse)", es: "APA (fondo de a bordo)", uk: "APA (бортовий рахунок)" },
  "Automatic life vest": {
    de: "Automatische Rettungsweste",
    es: "Chaleco salvavidas automático",
    uk: "Автоматичний рятувальний жилет",
  },
  BBQ: { de: "Grill", es: "Barbacoa", uk: "Барбекю" },
  Barbecue: { de: "Grill", es: "Barbacoa", uk: "Барбекю" },
  "Beach towel": { de: "Strandtuch", es: "Toalla de playa", uk: "Пляжний рушник" },
  "Beach towels": { de: "Strandtücher", es: "Toallas de playa", uk: "Пляжні рушники" },
  "Bed linen": { de: "Bettwäsche", es: "Ropa de cama", uk: "Постільна білизна" },
  Bicycle: { de: "Fahrrad", es: "Bicicleta", uk: "Велосипед" },
  "Boat Cleaning": { de: "Bootsreinigung", es: "Limpieza del barco", uk: "Прибирання судна" },
  "Cancellation insurance": {
    de: "Reiserücktrittsversicherung",
    es: "Seguro de cancelación",
    uk: "Страхування скасування",
  },
  Chef: { de: "Koch", es: "Chef", uk: "Кухар" },
  "Cleaning fee": { de: "Reinigungsgebühr", es: "Tasa de limpieza", uk: "Плата за прибирання" },
  "Converter 12/220V": {
    de: "Spannungswandler 12/220 V",
    es: "Convertidor 12/220 V",
    uk: "Перетворювач 12/220 В",
  },
  Cook: { de: "Koch", es: "Cocinero", uk: "Кухар" },
  "Cook (+ food provisioning)": {
    de: "Koch (inkl. Verpflegung)",
    es: "Cocinero (con aprovisionamiento)",
    uk: "Кухар (з харчуванням)",
  },
  "Crew change": { de: "Crewwechsel", es: "Cambio de tripulación", uk: "Зміна екіпажу" },
  "Crew change during the charter": {
    de: "Crewwechsel während des Charters",
    es: "Cambio de tripulación durante el chárter",
    uk: "Зміна екіпажу під час чартеру",
  },
  "Deck Hand/Hostess": {
    de: "Decksmann / Hostess",
    es: "Marinero / azafata",
    uk: "Матрос / хостес",
  },
  "Deck Matress": { de: "Decksmatratze", es: "Colchoneta de cubierta", uk: "Матрац на палубу" },
  Dinghy: { de: "Beiboot", es: "Auxiliar", uk: "Тендер" },
  "Dog on board": { de: "Hund an Bord", es: "Perro a bordo", uk: "Собака на борту" },
  "Early embarkation": {
    de: "Früher Check-in",
    es: "Embarque anticipado",
    uk: "Ранній заїзд",
  },
  "End cleaning": { de: "Endreinigung", es: "Limpieza final", uk: "Фінальне прибирання" },
  "Extra bed linen": {
    de: "Zusätzliche Bettwäsche",
    es: "Ropa de cama adicional",
    uk: "Додаткова постільна білизна",
  },
  "Extra linen (set)": {
    de: "Zusätzliche Wäsche (Satz)",
    es: "Juego de ropa de cama adicional",
    uk: "Додатковий комплект білизни",
  },
  "Extra towel": { de: "Zusätzliches Handtuch", es: "Toalla adicional", uk: "Додатковий рушник" },
  "Final cleaning": { de: "Endreinigung", es: "Limpieza final", uk: "Фінальне прибирання" },
  "Fishing rod": { de: "Angelrute", es: "Caña de pescar", uk: "Вудка" },
  Gennaker: { de: "Gennaker", es: "Génnaker", uk: "Ґенакер" },
  Hammock: { de: "Hängematte", es: "Hamaca", uk: "Гамак" },
  Hostess: { de: "Hostess", es: "Azafata", uk: "Хостес" },
  "Hostess (+ food provisioning)": {
    de: "Hostess (inkl. Verpflegung)",
    es: "Azafata (con aprovisionamiento)",
    uk: "Хостес (з харчуванням)",
  },
  "Internet pack unlimited": {
    de: "Internetpaket unbegrenzt",
    es: "Paquete de internet ilimitado",
    uk: "Безлімітний інтернет-пакет",
  },
  Kayak: { de: "Kajak", es: "Kayak", uk: "Каяк" },
  "Moorings Fee": { de: "Liegegebühr", es: "Tasa de amarre", uk: "Плата за стоянку" },
  "Navigation instruction": {
    de: "Einweisung in die Navigation",
    es: "Instrucción de navegación",
    uk: "Навчання навігації",
  },
  "One Way Fee": { de: "Einweggebühr", es: "Tasa de trayecto único", uk: "Плата за перегін" },
  Outboard: { de: "Außenborder", es: "Motor fueraborda", uk: "Підвісний мотор" },
  "Outboard engine": { de: "Außenbordmotor", es: "Motor fueraborda", uk: "Підвісний мотор" },
  "Outboard engine / Dinghy": {
    de: "Außenbordmotor / Beiboot",
    es: "Motor fueraborda / auxiliar",
    uk: "Підвісний мотор / тендер",
  },
  "Park Fee": { de: "Parkgebühr", es: "Tasa de aparcamiento", uk: "Плата за паркування" },
  Parking: { de: "Parkplatz", es: "Aparcamiento", uk: "Паркування" },
  "Pet fee (per pet)": {
    de: "Haustiergebühr (pro Tier)",
    es: "Tasa por mascota (por animal)",
    uk: "Плата за тварину (за одну)",
  },
  "Pet on board": { de: "Haustier an Bord", es: "Mascota a bordo", uk: "Тварина на борту" },
  "Pets on board": { de: "Haustiere an Bord", es: "Mascotas a bordo", uk: "Тварини на борту" },
  Provisioning: { de: "Verpflegung", es: "Aprovisionamiento", uk: "Продуктовий набір" },
  "Provisioning service": {
    de: "Verpflegungsservice",
    es: "Servicio de aprovisionamiento",
    uk: "Послуга закупівлі продуктів",
  },
  "Railing net": { de: "Relingnetz", es: "Red de seguridad", uk: "Захисна сітка на леєрах" },
  SUP: { de: "SUP", es: "Paddle surf", uk: "Сапборд" },
  "SUP (Stand Up Paddle)": {
    de: "SUP (Stand-up-Paddle)",
    es: "Paddle surf (SUP)",
    uk: "Сапборд (SUP)",
  },
  "Safety net": { de: "Sicherheitsnetz", es: "Red de seguridad", uk: "Захисна сітка" },
  "Safety net (installed)": {
    de: "Sicherheitsnetz (montiert)",
    es: "Red de seguridad (instalada)",
    uk: "Захисна сітка (встановлена)",
  },
  "Sea Scooter": { de: "Unterwasserscooter", es: "Scooter submarino", uk: "Підводний скутер" },
  Seabob: { de: "Seabob", es: "Seabob", uk: "Сібоб" },
  "Second gas bottle": {
    de: "Zweite Gasflasche",
    es: "Segunda bombona de gas",
    uk: "Другий газовий балон",
  },
  Skipper: { de: "Skipper", es: "Patrón", uk: "Шкіпер" },
  "Skipper + food": {
    de: "Skipper inkl. Verpflegung",
    es: "Patrón con comidas",
    uk: "Шкіпер із харчуванням",
  },
  "Skipper (food not included)": {
    de: "Skipper (ohne Verpflegung)",
    es: "Patrón (comidas no incluidas)",
    uk: "Шкіпер (без харчування)",
  },
  "Snorkeling equipment": {
    de: "Schnorchelausrüstung",
    es: "Equipo de snorkel",
    uk: "Спорядження для снорклінгу",
  },
  "Stand Up Paddle": { de: "Stand-up-Paddle", es: "Paddle surf", uk: "Сапборд" },
  "Standard charter pack": {
    de: "Standard-Charterpaket",
    es: "Paquete de chárter estándar",
    uk: "Стандартний чартерний пакет",
  },
  "Tourist tax": { de: "Kurtaxe", es: "Tasa turística", uk: "Туристичний збір" },
  Towels: { de: "Handtücher", es: "Toallas", uk: "Рушники" },
  "Transit log": { de: "Transitlog", es: "Transit log", uk: "Транзитний журнал" },
  "Welcome pack": { de: "Willkommenspaket", es: "Pack de bienvenida", uk: "Вітальний набір" },
  "Wi-Fi": { de: "WLAN", es: "Wi-Fi", uk: "Wi-Fi" },
  "Wifi Unlimited": { de: "WLAN unbegrenzt", es: "Wi-Fi ilimitado", uk: "Безлімітний Wi-Fi" },
} as const;
