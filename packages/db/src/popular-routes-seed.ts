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
          "A week among the islands off Split: Šolta's quiet coves, remote Vis, lively Hvar with the Pakleni Islands, and the beaches of Brač.",
      },
      uk: {
        title: "Центральна Далмація",
        description:
          "Тиждень серед островів біля Спліта: тихі бухти Шолти, віддалений Віс, жвавий Хвар із Пакленими островами та пляжі Брача.",
      },
      de: {
        title: "Mitteldalmatien",
        description:
          "Eine Woche zwischen den Inseln vor Split: stille Buchten auf Šolta, das abgelegene Vis, das lebhafte Hvar mit den Pakleni-Inseln und die Strände von Brač.",
      },
      es: {
        title: "Dalmacia central",
        description:
          "Una semana entre las islas frente a Split: las calas tranquilas de Šolta, la remota Vis, la animada Hvar con las islas Pakleni y las playas de Brač.",
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
        title: "Ionian",
        description:
          "Short, sheltered hops from Lefkada to Meganisi, Ithaca and Kefalonia, with steady afternoon winds and turquoise anchorages. A gentle first week in Greece.",
      },
      uk: {
        title: "Іонічне море",
        description:
          "Короткі переходи в захищених водах від Лефкади до Меганісі, Ітаки й Кефалонії, зі стабільним денним вітром і бірюзовими якірними стоянками. Спокійний перший тиждень у Греції.",
      },
      de: {
        title: "Ionisches Meer",
        description:
          "Kurze, geschützte Schläge von Lefkada nach Meganisi, Ithaka und Kefalonia, mit verlässlichem Nachmittagswind und türkisfarbenen Ankerbuchten. Ein entspannter erster Törn in Griechenland.",
      },
      es: {
        title: "Mar Jónico",
        description:
          "Travesías cortas y resguardadas de Lefkada a Meganisi, Ítaca y Cefalonia, con viento constante por la tarde y fondeaderos turquesa. Una primera semana tranquila en Grecia.",
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
          "Pine-fringed bays with restaurant jetties, the Twelve Islands of Göcek, and Lycian ruins on Gemiler Island, all within a short sail of each other.",
      },
      uk: {
        title: "Гьочек і затока Фетхіє",
        description:
          "Бухти в соснах із ресторанними причалами, Дванадцять островів Гьочека та лікійські руїни на острові Гемілер, усе на відстані короткого переходу.",
      },
      de: {
        title: "Göcek und Golf von Fethiye",
        description:
          "Von Kiefern gesäumte Buchten mit Restaurantstegen, die Zwölf Inseln von Göcek und lykische Ruinen auf Gemiler, alles nur kurze Schläge voneinander entfernt.",
      },
      es: {
        title: "Göcek y golfo de Fethiye",
        description:
          "Bahías rodeadas de pinos con pantalanes de restaurantes, las Doce Islas de Göcek y las ruinas licias de la isla Gemiler, todo a poca distancia.",
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
          "The Costa Smeralda and the La Maddalena archipelago: granite islands, clear water and Porto Cervo's marina, with the Strait of Bonifacio on the horizon.",
      },
      uk: {
        title: "Сардинія",
        description:
          "Смарагдове узбережжя та архіпелаг Ла-Маддалена: гранітні острови, прозора вода й марина Порто-Черво, а на обрії протока Боніфачо.",
      },
      de: {
        title: "Sardinien",
        description:
          "Die Costa Smeralda und das Maddalena-Archipel: Granitinseln, klares Wasser und die Marina von Porto Cervo, mit der Straße von Bonifacio am Horizont.",
      },
      es: {
        title: "Cerdeña",
        description:
          "La Costa Esmeralda y el archipiélago de La Maddalena: islas de granito, aguas cristalinas y el puerto de Porto Cervo, con el estrecho de Bonifacio en el horizonte.",
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
          "Caribbean-coloured water off Formentera and Espalmador, sunsets at Cala d'Hort facing Es Vedrà, and quieter coves on Ibiza's north coast.",
      },
      uk: {
        title: "Ібіца і Форментера",
        description:
          "Вода карибського кольору біля Форментери та Еспальмадора, захід сонця в Кала-д'Орт навпроти Ес-Ведра і тихіші бухти на півночі Ібіци.",
      },
      de: {
        title: "Ibiza und Formentera",
        description:
          "Karibisch blaues Wasser vor Formentera und Espalmador, Sonnenuntergang in der Cala d'Hort mit Blick auf Es Vedrà und ruhigere Buchten an Ibizas Nordküste.",
      },
      es: {
        title: "Ibiza y Formentera",
        description:
          "Aguas de color caribeño en Formentera y Espalmador, puestas de sol en Cala d'Hort frente a Es Vedrà y calas más tranquilas en el norte de Ibiza.",
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
          "Arctic sailing between granite peaks and red fishing cabins, from Svolvær to Reine, under the midnight sun in summer. For crews at home in cool, changeable weather.",
      },
      uk: {
        title: "Лофотенські острови",
        description:
          "Арктичне плавання між гранітними вершинами й червоними рибальськими будиночками, від Свольвера до Рейне, влітку під полярним сонцем. Для екіпажів із досвідом у прохолодну мінливу погоду.",
      },
      de: {
        title: "Lofoten",
        description:
          "Arktisches Segeln zwischen Granitgipfeln und roten Fischerhütten, von Svolvær bis Reine, im Sommer unter der Mitternachtssonne. Für Crews mit Erfahrung bei kühlem, wechselhaftem Wetter.",
      },
      es: {
        title: "Islas Lofoten",
        description:
          "Navegación ártica entre picos de granito y cabañas de pescadores rojas, de Svolvær a Reine, bajo el sol de medianoche en verano. Para tripulaciones con experiencia en tiempo fresco y cambiante.",
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
          "Red cliffs of the Scandola reserve, the tiny village of Girolata reachable only by sea, and the citadel of Calvi. Open-water passages with a mistral to respect.",
      },
      uk: {
        title: "Корсика / західне узбережжя",
        description:
          "Червоні скелі заповідника Скандола, крихітне село Жиролата, куди можна дістатися лише морем, і цитадель Кальві. Переходи відкритим морем, де слід зважати на містраль.",
      },
      de: {
        title: "Korsika / Westküste",
        description:
          "Die roten Klippen des Scandola-Reservats, das nur vom Meer aus erreichbare Dorf Girolata und die Zitadelle von Calvi. Schläge über offenes Wasser, bei denen der Mistral Respekt verlangt.",
      },
      es: {
        title: "Córcega / costa oeste",
        description:
          "Los acantilados rojos de la reserva de Scandola, el pequeño pueblo de Girolata, accesible solo por mar, y la ciudadela de Calvi. Travesías en mar abierto donde hay que respetar el mistral.",
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
          "Steady trade winds and line-of-sight sailing between islands: The Baths on Virgin Gorda, the Bight at Norman Island, Anegada's reefs and the beach bars of Jost Van Dyke.",
      },
      uk: {
        title: "Британські Віргінські острови",
        description:
          "Стабільні пасати й плавання від острова до острова в межах видимості: The Baths на Вірджин-Горді, бухта Байт на Норман-Айленді, рифи Анегади та пляжні бари Джост-Ван-Дайка.",
      },
      de: {
        title: "Britische Jungferninseln",
        description:
          "Beständige Passatwinde und Segeln auf Sicht von Insel zu Insel: The Baths auf Virgin Gorda, die Bight vor Norman Island, die Riffe von Anegada und die Strandbars von Jost Van Dyke.",
      },
      es: {
        title: "Islas Vírgenes Británicas",
        description:
          "Alisios constantes y navegación a la vista entre islas: The Baths en Virgin Gorda, la bahía Bight de Norman Island, los arrecifes de Anegada y los chiringuitos de Jost Van Dyke.",
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
          "From Mahé across to Praslin and La Digue: granite boulders on white beaches, giant tortoises on Curieuse and the bird reserve of Cousin.",
      },
      uk: {
        title: "Внутрішні Сейшели",
        description:
          "Від Мае до Праслена й Ла-Діга: гранітні валуни на білих пляжах, гігантські черепахи на Кюр'єзі та пташиний заповідник на острові Кузен.",
      },
      de: {
        title: "Innere Seychellen",
        description:
          "Von Mahé hinüber nach Praslin und La Digue: Granitfelsen an weißen Stränden, Riesenschildkröten auf Curieuse und das Vogelschutzgebiet auf Cousin.",
      },
      es: {
        title: "Seychelles interiores",
        description:
          "De Mahé a Praslin y La Digue: rocas de granito en playas blancas, tortugas gigantes en Curieuse y la reserva de aves de Cousin.",
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
          "Limestone karsts of Phang Nga Bay, Railay's cliffs and the Phi Phi islands, with calm seas and warm water in the dry season from November to April.",
      },
      uk: {
        title: "Пхукет / Андаманське море",
        description:
          "Вапнякові скелі затоки Пханг-Нга, клифи Райлі та острови Пхі-Пхі, зі спокійним морем і теплою водою в сухий сезон з листопада по квітень.",
      },
      de: {
        title: "Phuket / Andamanensee",
        description:
          "Die Kalksteinfelsen der Phang-Nga-Bucht, die Klippen von Railay und die Phi-Phi-Inseln, mit ruhiger See und warmem Wasser in der Trockenzeit von November bis April.",
      },
      es: {
        title: "Phuket / mar de Andamán",
        description:
          "Los farallones de caliza de la bahía de Phang Nga, los acantilados de Railay y las islas Phi Phi, con mar en calma y agua cálida en la estación seca, de noviembre a abril.",
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
          "Mountains dropping straight into the fjord-like Bay of Kotor, the island churches off Perast, then out to the open Adriatic past Budva and Sveti Stefan.",
      },
      uk: {
        title: "Которська затока й Адріатичне узбережжя",
        description:
          "Гори, що спускаються просто в схожу на фіорд Которську затоку, острівні церкви біля Пераста, а далі вихід у відкриту Адріатику повз Будву та Светі-Стефан.",
      },
      de: {
        title: "Bucht von Kotor und Adriaküste",
        description:
          "Berge, die direkt in die fjordartige Bucht von Kotor abfallen, die Inselkirchen vor Perast und dann hinaus auf die offene Adria vorbei an Budva und Sveti Stefan.",
      },
      es: {
        title: "Bahía de Kotor y costa adriática",
        description:
          "Montañas que caen directamente sobre la bahía de Kotor, parecida a un fiordo, las iglesias en islotes frente a Perast y después el Adriático abierto pasando por Budva y Sveti Stefan.",
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
          "From Raiatea across a shared lagoon to vanilla-scented Taha'a, on to Bora Bora's peaks and quiet Huahine, with warm trade winds and snorkelling in every anchorage.",
      },
      uk: {
        title: "Острови Товариства / Підвітряні острови",
        description:
          "Від Раїатеа через спільну лагуну до ванільної Таха'а, далі до вершин Бора-Бора й тихого Хуахіне, з теплими пасатами й снорклінгом на кожній стоянці.",
      },
      de: {
        title: "Gesellschaftsinseln / Inseln unter dem Winde",
        description:
          "Von Raiatea durch die gemeinsame Lagune zum nach Vanille duftenden Taha'a, weiter zu den Gipfeln von Bora Bora und ins ruhige Huahine, mit warmem Passat und Schnorcheln an jedem Ankerplatz.",
      },
      es: {
        title: "Islas de la Sociedad / Islas de Sotavento",
        description:
          "De Raiatea, a través de una laguna compartida, a Taha'a y su aroma a vainilla, y después a los picos de Bora Bora y la tranquila Huahine, con alisios cálidos y buceo con tubo en cada fondeadero.",
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
 * Nothing is written unless `apply` is set.
 */
export async function seedPopularRoutes(
  db: Database,
  { apply }: { apply: boolean },
): Promise<PopularRoutesPlan> {
  const plan: PopularRoutesPlan = { created: [], existing: [], unresolved: [], unfeatured: [] };

  const ids = POPULAR_ROUTES.map((route) => route.id);
  const existingRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  const existing = new Set(existingRows.map((row) => row.id));

  const toCreate: { route: SeedRoute; baseId: string | null; regionId: string | null }[] = [];
  for (const route of POPULAR_ROUTES) {
    if (existing.has(route.id)) {
      plan.existing.push({ id: route.id, title: route.copy.en.title });
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
