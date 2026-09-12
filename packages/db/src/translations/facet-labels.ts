/**
 * Curated facet labels for vocabulary no provider translates, in every locale the site serves.
 *
 * The catalogue sync fills `facet_media_translation` from what a provider publishes, and two
 * gaps fall outside that: Booking Manager ships no translations at all, so its regions,
 * countries and equipment arrive with none; and `sail_type` has no reference list behind it in
 * either provider, so it reaches the search document as a bare string.
 *
 * The equipment set below is that first gap where it shows. `equipmentFilterAllowlist` in
 * seed.ts and the canonical side of `AMENITY_GROUPS` are written in Booking Manager's
 * vocabulary, so every value there that NauSYS does not also publish reached a translated page
 * in English — in the filter, and on the cards, where the curated ranks put the same words.
 *
 * Small on purpose. This is the exception list for what the sync cannot reach, not a second
 * catalogue — a value that a provider does translate belongs to the sync, which refreshes it
 * when the vendor renames it.
 *
 * Written as `source = 'generated'`, so a real vendor translation arriving later takes over and
 * the hand-written editorial copy in `seed.ts` is never touched.
 */
export const facetLabels = {
  country: {
    "Bonaire, Sint Eustatius and Saba": {
      de: "Bonaire, Sint Eustatius und Saba",
      es: "Bonaire, San Eustaquio y Saba",
      uk: "Бонайре, Сінт-Естатіус і Саба",
    },
    "United Kingdom": { de: "Vereinigtes Königreich", es: "Reino Unido", uk: "Велика Британія" },
  },
  region: {
    "Northern America": { de: "Nordamerika", es: "América del Norte", uk: "Північна Америка" },
    "Northern Europe": { de: "Nordeuropa", es: "Europa del Norte", uk: "Північна Європа" },
    "Southern Europe": { de: "Südeuropa", es: "Europa del Sur", uk: "Південна Європа" },
    "Western Europe": { de: "Westeuropa", es: "Europa Occidental", uk: "Західна Європа" },
  },
  equipment: {
    "Air condition": { de: "Klimaanlage", es: "Aire acondicionado", uk: "Кондиціонер" },
    "Barbecue grill in cockpit": {
      de: "Grill im Cockpit",
      es: "Barbacoa en la bañera",
      uk: "Гриль у кокпіті",
    },
    Bimini: { de: "Bimini-Verdeck", es: "Toldo bimini", uk: "Біміні-тент" },
    "Chart plotter": { de: "Kartenplotter", es: "Plóter de cartas", uk: "Картплоттер" },
    "Chart plotter in cockpit": {
      de: "Kartenplotter im Cockpit",
      es: "Plóter de cartas en la bañera",
      uk: "Картплоттер у кокпіті",
    },
    "Cockpit speakers": {
      de: "Cockpit-Lautsprecher",
      es: "Altavoces en la bañera",
      uk: "Динаміки в кокпіті",
    },
    "Coffee maker": { de: "Kaffeemaschine", es: "Cafetera", uk: "Кавоварка" },
    "Electric winches": {
      de: "Elektrische Winschen",
      es: "Winches eléctricos",
      uk: "Електричні лебідки",
    },
    "Game console": { de: "Spielkonsole", es: "Consola de videojuegos", uk: "Ігрова консоль" },
    "Holding tank": { de: "Fäkalientank", es: "Tanque de aguas negras", uk: "Фекальний бак" },
    "Lazy jack": { de: "Lazy Jacks", es: "Lazy jacks", uk: "Лейзі-джек" },
    "Outside Steering Position": {
      de: "Außensteuerstand",
      es: "Puesto de gobierno exterior",
      uk: "Зовнішній пост керування",
    },
    "Railing net": { de: "Relingnetz", es: "Red de seguridad", uk: "Захисна сітка на леєрах" },
    "Rudder blades": { de: "Ruderblätter", es: "Palas de timón", uk: "Пера керма" },
    "Stand up paddle": { de: "Stand-up-Paddle", es: "Tabla de paddle surf", uk: "SUP-дошка" },
    "Swimming platform": {
      de: "Badeplattform",
      es: "Plataforma de baño",
      uk: "Купальна платформа",
    },
    "Swimming pool": { de: "Swimmingpool", es: "Piscina", uk: "Басейн" },
    "Tender garage": { de: "Tendergarage", es: "Garaje para el auxiliar", uk: "Гараж для тендера" },
    "Tenderlift platform": {
      de: "Tenderlift-Plattform",
      es: "Plataforma elevadora para el auxiliar",
      uk: "Підйомна платформа для тендера",
    },
    "Water maker": { de: "Entsalzungsanlage", es: "Potabilizadora", uk: "Опріснювач" },
    "Wi-Fi & Internet": {
      de: "WLAN und Internet",
      es: "Wi-Fi e Internet",
      uk: "Wi-Fi та інтернет",
    },
  },
  sail_type: {
    "classic/standard": {
      de: "Klassisch / Standard",
      es: "Clásica / estándar",
      uk: "Класичний / стандартний",
    },
    "full batten": { de: "Durchgelattet", es: "Sables pasantes", uk: "На повних латах" },
    "half batten": { de: "Halbgelattet", es: "Sables cortos", uk: "На коротких латах" },
    "furling/roll": { de: "Rollgroß", es: "Enrollable", uk: "Закруточний" },
    "self tacking jib": {
      de: "Selbstwendefock",
      es: "Foque autovirante",
      uk: "Самотакелажний стаксель",
    },
  },
} as const;
