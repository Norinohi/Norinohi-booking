/**
 * Curated facet labels for vocabulary no provider translates, in every locale the site serves.
 *
 * The catalogue sync fills `facet_media_translation` from what a provider publishes, and two
 * gaps fall outside that: Booking Manager ships no translations at all, so its regions,
 * countries and equipment arrive with none; and `sail_type` has no reference list behind it in
 * either provider, so it reaches the search document as a bare string.
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
    Bimini: { de: "Bimini-Verdeck", es: "Toldo bimini", uk: "Біміні-тент" },
    "Coffee maker": { de: "Kaffeemaschine", es: "Cafetera", uk: "Кавоварка" },
  },
  sail_type: {
    "classic/standard": {
      de: "Klassisch / Standard",
      es: "Clásica / estándar",
      uk: "Класичний / стандартний",
    },
    "full batten": { de: "Durchgelattet", es: "Sables pasantes", uk: "На повних латах" },
    "furling/roll": { de: "Rollgroß", es: "Enrollable", uk: "Закруточний" },
    "self tacking jib": {
      de: "Selbstwendefock",
      es: "Foque autovirante",
      uk: "Самотакелажний стаксель",
    },
  },
} as const;
