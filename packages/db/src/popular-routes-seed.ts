import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "./schema/index";
import { base, country, location, region } from "./schema/geography";
import { suggestedRoute, suggestedRouteStop, suggestedRouteTranslation } from "./schema/route";

type Database = NodePgDatabase<typeof schema>;
type Locale = "en" | "uk" | "de" | "es";
const LOCALES: Locale[] = ["en", "uk", "de", "es"];
type Copy = { title: string; description: string };

/*
 * Where a route is anchored. A region is preferred because the home page card then links with the
 * sailing-area filter; a base only where the catalogue has no region at that grain (Göcek sits in
 * "Aegean", Lofoten in "Northern Europe"). Looked up by name rather than id, because ids are minted
 * per environment by the sync and the names are the vendors' own on every one of them.
 */
type Target =
  | { kind: "region"; country: string; names: string[] }
  | { kind: "base"; country: string; names: string[] };

type SeedRoute = {
  id: string;
  target: Target;
  nights: number;
  difficulty: "easy" | "moderate" | "advanced";
  imageUrl: string | null;
  copy: Record<Locale, Copy>;
  stops: { name: string; lat: number; lng: number }[];
};

/**
 * The client's popular sailing routes, in their order: the first six fill the home page slider,
 * all of them the "View All Popular" grid.
 *
 * Harbour positions are public marina and anchorage coordinates. The copy is a first draft for the
 * client to edit on /routes, which is why a re-run never overwrites a route that already exists.
 */
export const POPULAR_ROUTES: SeedRoute[] = [
  {
    id: "srt_popular_central_dalmatia",
    target: { kind: "region", country: "Croatia", names: ["Split region"] },
    nights: 7,
    difficulty: "moderate",
    imageUrl: "/assets/home/sailing-routes/dalmatian-coast.webp",
    copy: {
      en: {
        title: "Central Dalmatia",
        description:
          "A popular yachting region with dozens of islands, beautiful bays, and historic towns. A great choice for your first charter.",
      },
      uk: {
        title: "Центральна Далмація",
        description:
          "Популярний яхтовий регіон із десятками островів, красивими бухтами та історичними містами. Чудовий вибір для першого чартеру.",
      },
      de: {
        title: "Mitteldalmatien",
        description:
          "Eine beliebte Yachtregion mit Dutzenden Inseln, wunderschönen Buchten und historischen Städten. Eine hervorragende Wahl für den ersten Charter.",
      },
      es: {
        title: "Dalmacia Central",
        description:
          "Una popular región náutica con decenas de islas, hermosas bahías y ciudades históricas. Una excelente opción para tu primer chárter.",
      },
    },
    stops: [
      { name: "ACI Marina Split", lat: 43.5026, lng: 16.43 },
      { name: "Maslinica, Šolta", lat: 43.3961, lng: 16.2072 },
      { name: "Vis", lat: 43.0603, lng: 16.1836 },
      { name: "Hvar", lat: 43.1729, lng: 16.4414 },
      { name: "Palmižana, Pakleni Islands", lat: 43.1583, lng: 16.3833 },
      { name: "Bol, Brač", lat: 43.2622, lng: 16.6533 },
      { name: "Milna, Brač", lat: 43.3272, lng: 16.4497 },
      { name: "ACI Marina Split", lat: 43.5026, lng: 16.43 },
    ],
  },
  {
    id: "srt_popular_ionian",
    target: { kind: "region", country: "Greece", names: ["Ionian Islands", "Ionian"] },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "Ionian Islands",
        description:
          "Calm seas, picturesque islands, and short passages between anchorages. Ideal for a comfortable family getaway.",
      },
      uk: {
        title: "Іонічні острови",
        description:
          "Спокійне море, мальовничі острови та короткі переходи між стоянками. Ідеально для комфортного сімейного відпочинку.",
      },
      de: {
        title: "Ionische Inseln",
        description:
          "Ruhige Gewässer, malerische Inseln und kurze Überfahrten zwischen den Ankerplätzen. Ideal für einen entspannten Familienurlaub.",
      },
      es: {
        title: "Islas Jónicas",
        description:
          "Mar tranquilo, islas pintorescas y cortas travesías entre fondeaderos. Ideal para unas vacaciones familiares y relajadas.",
      },
    },
    stops: [
      { name: "Lefkas Marina", lat: 38.8339, lng: 20.7119 },
      { name: "Vathy, Meganisi", lat: 38.6664, lng: 20.7825 },
      { name: "Kioni, Ithaca", lat: 38.4478, lng: 20.6903 },
      { name: "Fiskardo, Kefalonia", lat: 38.4581, lng: 20.5761 },
      { name: "Sivota, Lefkada", lat: 38.6225, lng: 20.6853 },
      { name: "Kalamos", lat: 38.6247, lng: 20.9269 },
      { name: "Lefkas Marina", lat: 38.8339, lng: 20.7119 },
    ],
  },
  {
    id: "srt_popular_gocek_fethiye",
    target: {
      kind: "base",
      country: "Turkey",
      names: ["Göcek", "Municipality of Göcek Marina", "Setur Göcek Village Port", "Göcek/D-Marin"],
    },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "Göcek & Gulf of Fethiye",
        description:
          "Sheltered bays, crystal-clear waters, and lush green shores. An ideal region for leisurely sailing and relaxation.",
      },
      uk: {
        title: "Гьочек і затока Фетхіє",
        description:
          "Захищені бухти, прозора вода та зелені береги. Ідеальний регіон для неспішного плавання та відпочинку.",
      },
      de: {
        title: "Göcek & Golf von Fethiye",
        description:
          "Geschützte Buchten, kristallklares Wasser und üppig grüne Küsten. Eine ideale Region für entspanntes Segeln und Erholung.",
      },
      es: {
        title: "Göcek y Golfo de Fethiye",
        description:
          "Bahías protegidas, aguas cristalinas y costas verdes y exuberantes. Una región ideal para navegar sin prisas y relajarse.",
      },
    },
    stops: [
      { name: "Göcek", lat: 36.7536, lng: 28.9408 },
      { name: "Sarsala Bay", lat: 36.66, lng: 28.829 },
      { name: "Tersane Island", lat: 36.6825, lng: 28.915 },
      { name: "Fethiye", lat: 36.622, lng: 29.104 },
      { name: "Gemiler Island", lat: 36.554, lng: 29.065 },
      { name: "Göcek", lat: 36.7536, lng: 28.9408 },
    ],
  },
  {
    id: "srt_popular_sardinia",
    target: { kind: "region", country: "Italy", names: ["Sardinia"] },
    nights: 7,
    difficulty: "moderate",
    imageUrl: null,
    copy: {
      en: {
        title: "Sardinia",
        description:
          "Turquoise waters, picturesque islands, and beautiful beaches. A destination for an unforgettable Mediterranean getaway.",
      },
      uk: {
        title: "Сардинія",
        description:
          "Бірюзова вода, мальовничі острови та красиві пляжі. Напрямок для яскравого середземноморського відпочинку.",
      },
      de: {
        title: "Sardinien",
        description:
          "Türkisfarbenes Wasser, malerische Inseln und wunderschöne Strände. Ein ideales Reiseziel für einen unvergesslichen Mittelmeerurlaub.",
      },
      es: {
        title: "Cerdeña",
        description:
          "Aguas turquesas, islas pintorescas y hermosas playas. Un destino ideal para disfrutar de una inolvidable escapada mediterránea.",
      },
    },
    stops: [
      { name: "Portisco", lat: 41.0346, lng: 9.5185 },
      { name: "Porto Cervo", lat: 41.1353, lng: 9.5378 },
      { name: "Cala Coticcio, Caprera", lat: 41.2186, lng: 9.4744 },
      { name: "La Maddalena", lat: 41.214, lng: 9.407 },
      { name: "Santa Teresa Gallura", lat: 41.24, lng: 9.1893 },
      { name: "Porto Rotondo", lat: 41.0317, lng: 9.5408 },
      { name: "Portisco", lat: 41.0346, lng: 9.5185 },
    ],
  },
  {
    id: "srt_popular_ibiza_formentera",
    target: { kind: "region", country: "Spain", names: ["Balearic Islands"] },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "Ibiza & Formentera",
        description:
          "Famous beaches and Ibiza’s vibrant nightlife combined with the peaceful lagoons of Formentera. The perfect balance of relaxation and atmosphere.",
      },
      uk: {
        title: "Ібіца та Форментера",
        description:
          "Знамениті пляжі та яскраве життя Ібіци у поєднанні зі спокійними лагунами Форментери. Ідеальний баланс відпочинку та атмосфери.",
      },
      de: {
        title: "Ibiza & Formentera",
        description:
          "Berühmte Strände und das pulsierende Nachtleben Ibizas kombiniert mit den ruhigen Lagunen Formenteras. Die perfekte Balance aus Erholung und Atmosphäre.",
      },
      es: {
        title: "Ibiza y Formentera",
        description:
          "Playas famosas y la vibrante vida nocturna de Ibiza, combinadas con las tranquilas lagunas de Formentera. El equilibrio perfecto entre relax y ambiente.",
      },
    },
    stops: [
      { name: "Ibiza, Marina Botafoch", lat: 38.9136, lng: 1.445 },
      { name: "Espalmador", lat: 38.78, lng: 1.43 },
      { name: "La Savina, Formentera", lat: 38.7339, lng: 1.4167 },
      { name: "Cala d'Hort", lat: 38.89, lng: 1.223 },
      { name: "Sant Antoni de Portmany", lat: 38.9806, lng: 1.3036 },
      { name: "Portinatx", lat: 39.11, lng: 1.517 },
      { name: "Santa Eulària des Riu", lat: 38.9842, lng: 1.5347 },
      { name: "Ibiza, Marina Botafoch", lat: 38.9136, lng: 1.445 },
    ],
  },
  {
    id: "srt_popular_lofoten",
    target: { kind: "base", country: "Norway", names: ["Lofoten", "Svolvaer / Lofoten"] },
    nights: 7,
    difficulty: "advanced",
    imageUrl: null,
    copy: {
      en: {
        title: "Lofoten Islands",
        description:
          "Fjords, majestic mountains, and Arctic landscapes. A unique yachting experience for nature lovers.",
      },
      uk: {
        title: "Лофотенські острови",
        description:
          "Фіорди, величні гори та арктичні пейзажі. Унікальний формат яхтової подорожі для любителів природи.",
      },
      de: {
        title: "Lofoten",
        description:
          "Fjorde, majestätische Berge und arktische Landschaften. Ein einzigartiges Yacht-Erlebnis für Naturliebhaber.",
      },
      es: {
        title: "Islas Lofoten",
        description:
          "Fiordos, majestuosas montañas y paisajes árticos. Una experiencia náutica única para los amantes de la naturaleza.",
      },
    },
    stops: [
      { name: "Svolvær", lat: 68.2342, lng: 14.5683 },
      { name: "Henningsvær", lat: 68.1519, lng: 14.2025 },
      { name: "Stamsund", lat: 68.125, lng: 13.8436 },
      { name: "Nusfjord", lat: 68.035, lng: 13.35 },
      { name: "Reine", lat: 67.9328, lng: 13.0886 },
      { name: "Ballstad", lat: 68.0667, lng: 13.5333 },
      { name: "Svolvær", lat: 68.2342, lng: 14.5683 },
    ],
  },
  {
    id: "srt_popular_corsica_west",
    target: { kind: "region", country: "France", names: ["Corsica"] },
    nights: 7,
    difficulty: "advanced",
    imageUrl: null,
    copy: {
      en: {
        title: "Corsica / West Coast",
        description:
          "Rocky shores, turquoise bays, and picturesque coastal towns. A wonderful destination for a relaxed cruise.",
      },
      uk: {
        title: "Корсика / Західне узбережжя",
        description:
          "Скелясті береги, бірюзові бухти та мальовничі прибережні містечка. Чудовий напрямок для спокійного круїзу.",
      },
      de: {
        title: "Korsika / Westküste",
        description:
          "Felsige Küsten, türkisfarbene Buchten und malerische Küstenorte. Ein wunderbares Reiseziel für eine entspannte Kreuzfahrt.",
      },
      es: {
        title: "Córcega / Costa Oeste",
        description:
          "Costas rocosas, bahías turquesas y pintorescos pueblos costeros. Un destino perfecto para un crucero tranquilo.",
      },
    },
    stops: [
      { name: "Ajaccio", lat: 41.9192, lng: 8.7386 },
      { name: "Cargèse", lat: 42.135, lng: 8.597 },
      { name: "Girolata", lat: 42.348, lng: 8.613 },
      { name: "Calvi", lat: 42.5667, lng: 8.7575 },
      { name: "Porto, Gulf of Porto", lat: 42.265, lng: 8.693 },
      { name: "Ajaccio", lat: 41.9192, lng: 8.7386 },
    ],
  },
  {
    id: "srt_popular_bvi",
    target: {
      kind: "region",
      country: "British Virgin Islands",
      names: ["British Virgin Islands"],
    },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "British Virgin Islands",
        description:
          "Warm waters, tropical islands, and short passages between anchorages. One of the best regions for a catamaran charter.",
      },
      uk: {
        title: "Британські Віргінські острови",
        description:
          "Тепла вода, тропічні острови та короткі переходи між стоянками. Один із найкращих регіонів для чартеру на катамарані.",
      },
      de: {
        title: "Britische Jungferninseln",
        description:
          "Warmes Wasser, tropische Inseln und kurze Überfahrten zwischen den Ankerplätzen. Eine der besten Regionen für einen Katamaran-Charter.",
      },
      es: {
        title: "Islas Vírgenes Británicas",
        description:
          "Aguas cálidas, islas tropicales y cortas travesías entre fondeaderos. Una de las mejores regiones para alquilar un catamarán.",
      },
    },
    stops: [
      { name: "Road Town, Tortola", lat: 18.426, lng: -64.619 },
      { name: "The Bight, Norman Island", lat: 18.317, lng: -64.618 },
      { name: "Cooper Island", lat: 18.387, lng: -64.513 },
      { name: "The Baths, Virgin Gorda", lat: 18.429, lng: -64.443 },
      { name: "Anegada", lat: 18.727, lng: -64.333 },
      { name: "Great Harbour, Jost Van Dyke", lat: 18.443, lng: -64.753 },
      { name: "Cane Garden Bay, Tortola", lat: 18.428, lng: -64.659 },
      { name: "Road Town, Tortola", lat: 18.426, lng: -64.619 },
    ],
  },
  {
    id: "srt_popular_inner_seychelles",
    target: { kind: "region", country: "Seychelles", names: ["Mahé", "Praslin"] },
    nights: 7,
    difficulty: "moderate",
    imageUrl: null,
    copy: {
      en: {
        title: "Inner Seychelles",
        description:
          "Tropical beaches, granite islands, and crystal-clear waters. The perfect combination of yachting, snorkeling, and relaxation.",
      },
      uk: {
        title: "Внутрішні Сейшельські острови",
        description:
          "Тропічні пляжі, гранітні острови та прозора вода. Ідеальне поєднання яхтингу, снорклінгу та відпочинку.",
      },
      de: {
        title: "Innere Seychellen",
        description:
          "Tropische Strände, Granitinseln und kristallklares Wasser. Die perfekte Kombination aus Yachting, Schnorcheln und Erholung.",
      },
      es: {
        title: "Islas Interiores de Seychelles",
        description:
          "Playas tropicales, islas de granito y aguas cristalinas. La combinación perfecta de navegación, snorkel y relax.",
      },
    },
    stops: [
      { name: "Eden Island Marina, Mahé", lat: -4.64, lng: 55.47 },
      { name: "Baie Sainte Anne, Praslin", lat: -4.345, lng: 55.763 },
      { name: "Anse Lazio, Praslin", lat: -4.296, lng: 55.7 },
      { name: "Curieuse", lat: -4.283, lng: 55.728 },
      { name: "La Passe, La Digue", lat: -4.358, lng: 55.826 },
      { name: "Cousin", lat: -4.331, lng: 55.662 },
      { name: "Eden Island Marina, Mahé", lat: -4.64, lng: 55.47 },
    ],
  },
  {
    id: "srt_popular_phuket_andaman",
    target: { kind: "region", country: "Thailand", names: ["Phuket"] },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "Phuket / Andaman Sea",
        description:
          "Exotic islands, limestone cliffs, and hidden lagoons. A vibrant tropical yachting experience.",
      },
      uk: {
        title: "Пхукет / Андаманське море",
        description:
          "Екзотичні острови, вапнякові скелі та приховані лагуни. Яскравий яхтовий досвід у тропічному форматі.",
      },
      de: {
        title: "Phuket / Andamanensee",
        description:
          "Exotische Inseln, Kalksteinfelsen und versteckte Lagunen. Ein faszinierendes Yacht-Erlebnis in tropischem Ambiente.",
      },
      es: {
        title: "Phuket / Mar de Andamán",
        description:
          "Islas exóticas, acantilados de piedra caliza y lagunas escondidas. Una experiencia náutica vibrante en un entorno tropical.",
      },
    },
    stops: [
      { name: "Ao Po Grand Marina", lat: 8.068, lng: 98.437 },
      { name: "Phang Nga Bay", lat: 8.275, lng: 98.501 },
      { name: "Ko Yao Noi", lat: 8.118, lng: 98.608 },
      { name: "Railay", lat: 8.011, lng: 98.839 },
      { name: "Ko Phi Phi Don", lat: 7.74, lng: 98.77 },
      { name: "Ko Racha Yai", lat: 7.604, lng: 98.365 },
      { name: "Chalong Bay", lat: 7.82, lng: 98.35 },
      { name: "Ao Po Grand Marina", lat: 8.068, lng: 98.437 },
    ],
  },
  {
    id: "srt_popular_kotor_adriatic",
    target: { kind: "region", country: "Montenegro", names: ["Montenegro"] },
    nights: 7,
    difficulty: "easy",
    imageUrl: null,
    copy: {
      en: {
        title: "Bay of Kotor & Adriatic Coast",
        description:
          "Mountains, historic towns, and picturesque bays of the Bay of Kotor. A blend of nature, history, and the Adriatic.",
      },
      uk: {
        title: "Бока-Которська затока та Адріатичне узбережжя",
        description:
          "Гори, старовинні міста та мальовничі бухти Боки-Которської. Поєднання природи, історії та Адріатики.",
      },
      de: {
        title: "Bucht von Kotor & Adriaküste",
        description:
          "Berge, historische Städte und malerische Buchten der Bucht von Kotor. Eine einzigartige Verbindung aus Natur, Geschichte und Adria.",
      },
      es: {
        title: "Bahía de Kotor y Costa Adriática",
        description:
          "Montañas, ciudades históricas y pintorescas bahías de la bahía de Kotor. Una combinación de naturaleza, historia y el Adriático.",
      },
    },
    stops: [
      { name: "Porto Montenegro, Tivat", lat: 42.433, lng: 18.693 },
      { name: "Perast", lat: 42.486, lng: 18.698 },
      { name: "Kotor", lat: 42.4247, lng: 18.7712 },
      { name: "Rose, Luštica", lat: 42.426, lng: 18.567 },
      { name: "Herceg Novi", lat: 42.4531, lng: 18.5375 },
      { name: "Budva", lat: 42.278, lng: 18.837 },
      { name: "Sveti Stefan", lat: 42.256, lng: 18.892 },
      { name: "Porto Montenegro, Tivat", lat: 42.433, lng: 18.693 },
    ],
  },
  {
    id: "srt_popular_society_leeward",
    /* A base, not a region: the two vendors split this country into "French Polynesia" and
       "Polynesia", so either region would link to one vendor's boats only. */
    target: {
      kind: "base",
      country: "French Polynesia",
      names: ["Raiatea / Apooiti Marina", "Apooiti Marina", "Polynesia, Raiatea"],
    },
    nights: 7,
    difficulty: "moderate",
    imageUrl: null,
    copy: {
      en: {
        title: "Society Islands / Leeward Islands",
        description:
          "Volcanic islands, coral reefs, and turquoise lagoons. An exotic destination for an unforgettable yachting journey.",
      },
      uk: {
        title: "Острови Товариства / Підвітряні острови",
        description:
          "Вулканічні острови, коралові рифи та бірюзові лагуни. Екзотичний напрямок для незабутньої яхтової подорожі.",
      },
      de: {
        title: "Gesellschaftsinseln / Inseln unter dem Winde",
        description:
          "Vulkanische Inseln, Korallenriffe und türkisfarbene Lagunen. Ein exotisches Reiseziel für eine unvergessliche Yacht-Reise.",
      },
      es: {
        title: "Islas de la Sociedad / Islas de Sotavento",
        description:
          "Islas volcánicas, arrecifes de coral y lagunas turquesas. Un destino exótico para una experiencia náutica inolvidable.",
      },
    },
    stops: [
      { name: "Apooiti Marina, Raiatea", lat: -16.752, lng: -151.47 },
      { name: "Haamene Bay, Taha'a", lat: -16.628, lng: -151.488 },
      { name: "Coral Garden, Taha'a", lat: -16.58, lng: -151.56 },
      { name: "Vaitape, Bora Bora", lat: -16.501, lng: -151.742 },
      { name: "Fare, Huahine", lat: -16.716, lng: -151.034 },
      { name: "Faaroa Bay, Raiatea", lat: -16.82, lng: -151.4 },
      { name: "Apooiti Marina, Raiatea", lat: -16.752, lng: -151.47 },
    ],
  },
];

export type PopularRoutesPlan = {
  created: { id: string; title: string; target: string }[];
  existing: { id: string; title: string }[];
  /** Existing routes whose title and description are rewritten from the seed, under `refreshCopy`. */
  refreshed: { id: string; title: string }[];
  unresolved: { id: string; title: string; target: string }[];
  /** Routes featured today that the new order leaves out, so a hand-curated one is not lost silently. */
  unfeatured: { id: string; title: string }[];
};

async function resolveTarget(db: Database, target: Target) {
  for (const name of target.names) {
    if (target.kind === "region") {
      const [row] = await db
        .select({ id: region.id })
        .from(region)
        .innerJoin(country, eq(country.id, region.countryId))
        .where(and(eq(country.name, target.country), eq(region.name, name)))
        .limit(1);
      if (row) return { baseId: null, regionId: row.id, label: `region ${name}` };
    } else {
      const [row] = await db
        .select({ id: base.id })
        .from(base)
        .innerJoin(location, eq(location.id, base.locationId))
        .innerJoin(region, eq(region.id, location.regionId))
        .innerJoin(country, eq(country.id, region.countryId))
        .where(and(eq(country.name, target.country), eq(base.name, name)))
        .limit(1);
      if (row) return { baseId: row.id, regionId: null, label: `base ${name}` };
    }
  }
  return null;
}

/**
 * Creates the routes that are missing, then makes them the featured list in the client's order.
 *
 * An existing route is left exactly as it is, copy, stops and image included: after the first run
 * the routes belong to the editors on /routes, and a re-run is only ever for putting the order
 * back. A route whose region or base the environment does not have is skipped and reported rather
 * than anchored somewhere approximate.
 *
 * `refreshCopy` is the one exception: it overwrites the title and description of existing routes, in
 * every locale, with the seed's copy, for when the client sends a new text for the whole list. Stops,
 * image, target and order stay as the editors left them.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedPopularRoutes(
  db: Database,
  { apply, refreshCopy = false }: { apply: boolean; refreshCopy?: boolean },
): Promise<PopularRoutesPlan> {
  const plan: PopularRoutesPlan = {
    created: [],
    existing: [],
    refreshed: [],
    unresolved: [],
    unfeatured: [],
  };

  const ids = POPULAR_ROUTES.map((route) => route.id);
  const existingRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  const existing = new Set(existingRows.map((row) => row.id));

  const toCreate: { route: SeedRoute; baseId: string | null; regionId: string | null }[] = [];
  for (const route of POPULAR_ROUTES) {
    if (existing.has(route.id)) {
      const entry = { id: route.id, title: route.copy.en.title };
      (refreshCopy ? plan.refreshed : plan.existing).push(entry);
      continue;
    }
    const target = await resolveTarget(db, route.target);
    const wanted = `${route.target.kind} ${route.target.names.join(" | ")} (${route.target.country})`;
    if (!target) {
      plan.unresolved.push({ id: route.id, title: route.copy.en.title, target: wanted });
      continue;
    }
    plan.created.push({ id: route.id, title: route.copy.en.title, target: target.label });
    toCreate.push({ route, baseId: target.baseId, regionId: target.regionId });
  }

  const ordered = POPULAR_ROUTES.filter(
    (route) => existing.has(route.id) || toCreate.some((item) => item.route.id === route.id),
  ).map((route) => route.id);

  plan.unfeatured = await db
    .select({ id: suggestedRoute.id, title: suggestedRoute.title })
    .from(suggestedRoute)
    .where(
      and(
        isNotNull(suggestedRoute.featuredRank),
        ordered.length > 0 ? notInArray(suggestedRoute.id, ordered) : sql`true`,
      ),
    );

  if (!apply) return plan;

  await db.transaction(async (tx) => {
    for (const { route, baseId, regionId } of toCreate) {
      await tx.insert(suggestedRoute).values({
        id: route.id,
        baseId,
        regionId,
        title: route.copy.en.title,
        description: route.copy.en.description,
        kind: "seven_days",
        nights: route.nights,
        difficulty: route.difficulty,
        imageUrl: route.imageUrl,
        active: true,
      });

      await tx.insert(suggestedRouteTranslation).values(
        LOCALES.map((locale) => ({
          routeId: route.id,
          locale,
          title: route.copy[locale].title,
          description: route.copy[locale].description,
        })),
      );

      await tx.insert(suggestedRouteStop).values(
        route.stops.map((stop, index) => ({
          routeId: route.id,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          sortOrder: index,
        })),
      );
    }

    for (const { id } of plan.refreshed) {
      const route = POPULAR_ROUTES.find((candidate) => candidate.id === id);
      if (!route) continue;

      await tx
        .update(suggestedRoute)
        .set({ title: route.copy.en.title, description: route.copy.en.description })
        .where(eq(suggestedRoute.id, id));

      await tx
        .insert(suggestedRouteTranslation)
        .values(
          LOCALES.map((locale) => ({
            routeId: id,
            locale,
            title: route.copy[locale].title,
            description: route.copy[locale].description,
          })),
        )
        .onConflictDoUpdate({
          target: [suggestedRouteTranslation.routeId, suggestedRouteTranslation.locale],
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
          },
        });
    }

    await tx
      .update(suggestedRoute)
      .set({ featuredRank: null })
      .where(isNotNull(suggestedRoute.featuredRank));

    for (const [index, id] of ordered.entries()) {
      await tx
        .update(suggestedRoute)
        .set({ featuredRank: index + 1 })
        .where(eq(suggestedRoute.id, id));
    }
  });

  return plan;
}
