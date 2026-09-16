import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "./schema/index";
import { base, country, region } from "./schema/geography";
import { listing } from "./schema/listing";
import {
  suggestedRoute,
  suggestedRouteStop,
  suggestedRouteStopTranslation,
  suggestedRouteTranslation,
} from "./schema/route";

type Database = NodePgDatabase<typeof schema>;
type Locale = "en" | "uk" | "de" | "es";
const LOCALES: Locale[] = ["en", "uk", "de", "es"];
type Copy = { title: string; description: string };

/** How far from a route's first stop a charter base may sit and still be its starting marina. */
const BASE_RADIUS_KM = 60;

type SeedStop = {
  name: string;
  lat: number;
  lng: number;
  /** The line a card prints under "Day 3 - Vis", in every language the site has. */
  note: Record<Locale, string>;
};

type SeedRoute = {
  id: string;
  difficulty: "easy" | "moderate" | "advanced";
  /*
   * Where to anchor a route whose start has no base within `BASE_RADIUS_KM`. Only three have one;
   * the rest resolve to a marina, which is the better link because it filters to boats that
   * actually start there.
   */
  fallbackRegion?: { country: string; names: string[] };
  copy: Record<Locale, Copy>;
  stops: SeedStop[];
};

/**
 * The client's 60-route list (CharterNavi_Popular_Routes.txt), minus the twelve that already exist
 * as the home page's featured routes -- those keep their copy and their target and only have their
 * stops refreshed, through `STOP_REFRESH` below.
 *
 * Stop positions are marina and anchorage coordinates from that file. The copy is a first draft for
 * the client to edit on /routes, which is why a re-run never touches a route that already exists.
 */
/** The last day of a round trip returns to the marina the first one checked in at. */
export const RETURN_NOTE = {
  en: "Back at the base: the boat is handed over in the morning.",
  uk: "Повернення на базу: яхту здають уранці.",
  de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
  es: "De vuelta en la base: el barco se entrega por la mañana.",
} satisfies Record<Locale, string>;

export const CATALOGUE_ROUTES: SeedRoute[] = [
  {
    id: "srt_route_hr_brac_hvar_and_korcula_loop",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Brač, Hvar and Korčula Loop",
        description:
          "Split's three big islands in one week: the beaches of Brač, the town walls of Korčula and a night at anchor off Šćedro on the way back.",
      },
      uk: {
        title: "Коло Брач, Хвар, Корчула",
        description:
          "Три великі острови біля Спліта за тиждень: пляжі Брача, міські мури Корчули й ніч на якорі біля Щедро дорогою назад.",
      },
      de: {
        title: "Brač, Hvar und Korčula",
        description:
          "Die drei großen Inseln vor Split in einer Woche: die Strände von Brač, die Stadtmauern von Korčula und eine Ankernacht vor Šćedro auf dem Rückweg.",
      },
      es: {
        title: "Circuito Brač, Hvar y Korčula",
        description:
          "Las tres grandes islas frente a Split en una semana: las playas de Brač, las murallas de Korčula y una noche fondeados en Šćedro a la vuelta.",
      },
    },
    stops: [
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Check-in at the charter base, with Diocletian's Palace an evening's walk away.",
          uk: "Реєстрація на чартерній базі, а до палацу Діоклетіана - вечірня прогулянка.",
          de: "Check-in an der Charterbasis, der Diokletianpalast ist einen Abendspaziergang entfernt.",
          es: "Check-in en la base de chárter, con el palacio de Diocleciano a un paseo.",
        },
      },
      {
        name: "Brač",
        lat: 43.3272,
        lng: 16.4497,
        note: {
          en: "The Zlatni Rat beach shifts with the current; the island's white stone built Split.",
          uk: "Пляж Златні Рат змінює форму за течією, а з місцевого білого каменю збудований Спліт.",
          de: "Der Strand Zlatni Rat verschiebt sich mit der Strömung; aus dem weißen Stein wurde Split gebaut.",
          es: "La playa de Zlatni Rat cambia con la corriente; con su piedra blanca se construyó Split.",
        },
      },
      {
        name: "Hvar",
        lat: 43.1729,
        lng: 16.4414,
        note: {
          en: "Lavender fields, a Venetian old town and the busiest nightlife in Dalmatia.",
          uk: "Лавандові поля, венеційське старе місто й найжвавіше нічне життя Далмації.",
          de: "Lavendelfelder, eine venezianische Altstadt und das lebhafteste Nachtleben Dalmatiens.",
          es: "Campos de lavanda, un casco antiguo veneciano y la noche más animada de Dalmacia.",
        },
      },
      {
        name: "Korčula",
        lat: 42.96,
        lng: 17.135,
        note: {
          en: "A walled town on a headland, laid out like a fishbone against the wind.",
          uk: "Обнесене мурами місто на мисі, сплановане, як риб'ячий скелет, проти вітру.",
          de: "Eine ummauerte Stadt auf einer Landzunge, fischgrätenförmig gegen den Wind angelegt.",
          es: "Una ciudad amurallada sobre un cabo, trazada como una espina de pez contra el viento.",
        },
      },
      {
        name: "Šćedro",
        lat: 43.0833,
        lng: 16.7,
        note: {
          en: "An uninhabited island south of Hvar with two deep, well-sheltered bays.",
          uk: "Безлюдний острів на південь від Хвара з двома глибокими й добре захищеними бухтами.",
          de: "Eine unbewohnte Insel südlich von Hvar mit zwei tiefen, gut geschützten Buchten.",
          es: "Una isla deshabitada al sur de Hvar con dos bahías profundas y bien resguardadas.",
        },
      },
      {
        name: "Šolta",
        lat: 43.3961,
        lng: 16.2072,
        note: {
          en: "The nearest island to Split: quiet coves, olive groves and a working fishing harbour.",
          uk: "Найближчий до Спліта острів: тихі бухти, оливкові гаї та діюча рибальська гавань.",
          de: "Die nächste Insel vor Split: stille Buchten, Olivenhaine und ein aktiver Fischerhafen.",
          es: "La isla más cercana a Split: calas tranquilas, olivares y un puerto pesquero en activo.",
        },
      },
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_hr_zadar_and_kornati_nature_route",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Zadar and Kornati Nature Route",
        description:
          "The emptiest sailing in Croatia: Dugi Otok's cliffs, the salt lake at Telašćica and the bare stone islands of the Kornati national park.",
      },
      uk: {
        title: "Задар і Корнати",
        description:
          "Найбезлюдніше плавання в Хорватії: скелі Дугого острова, солоне озеро Телашчиця та голі кам'яні острови національного парку Корнати.",
      },
      de: {
        title: "Zadar und die Kornaten",
        description:
          "Das einsamste Segeln Kroatiens: die Steilküste von Dugi Otok, der Salzsee von Telašćica und die kahlen Felsinseln des Nationalparks Kornati.",
      },
      es: {
        title: "Zadar y Kornati",
        description:
          "La navegación más solitaria de Croacia: los acantilados de Dugi Otok, el lago salado de Telašćica y las islas de piedra desnuda del parque nacional Kornati.",
      },
    },
    stops: [
      {
        name: "Zadar",
        lat: 44.117,
        lng: 15.228,
        note: {
          en: "Check-in, then the sea organ on the promenade at sunset.",
          uk: "Реєстрація, а на заході сонця - морський орган на набережній.",
          de: "Check-in, dann die Meeresorgel an der Uferpromenade bei Sonnenuntergang.",
          es: "Check-in y, al atardecer, el órgano de mar del paseo marítimo.",
        },
      },
      {
        name: "Dugi Otok",
        lat: 43.94,
        lng: 15.16,
        note: {
          en: "The long island shielding the coast, with cliffs on its seaward side.",
          uk: "Довгий острів, що прикриває узбережжя, з обривами на мористому боці.",
          de: "Die lange Insel, die die Küste abschirmt, mit Steilklippen zur Seeseite.",
          es: "La isla larga que protege la costa, con acantilados en su cara al mar.",
        },
      },
      {
        name: "Telašćica",
        lat: 43.8867,
        lng: 15.17,
        note: {
          en: "A nature park bay with a salt lake a few steps from the anchorage.",
          uk: "Затока природного парку з солоним озером за кілька кроків від стоянки.",
          de: "Eine Naturparkbucht mit einem Salzsee wenige Schritte vom Ankerplatz entfernt.",
          es: "Una bahía de parque natural con un lago salado a unos pasos del fondeadero.",
        },
      },
      {
        name: "Kornati",
        lat: 43.8,
        lng: 15.3167,
        note: {
          en: "Eighty-nine bare stone islands, a national park with almost nothing built on it.",
          uk: "Вісімдесят дев'ять голих кам'яних островів, національний парк майже без забудови.",
          de: "Neunundachtzig kahle Felsinseln, ein Nationalpark fast ohne Bebauung.",
          es: "Ochenta y nueve islas de piedra desnuda, un parque nacional casi sin edificar.",
        },
      },
      {
        name: "Žut",
        lat: 43.7889,
        lng: 15.2833,
        note: {
          en: "A quiet island on the edge of the Kornati, with a marina and little else.",
          uk: "Тихий острів на межі Корнатів, де є марина й майже нічого більше.",
          de: "Eine stille Insel am Rand der Kornaten, mit einer Marina und sonst kaum etwas.",
          es: "Una isla tranquila al borde de las Kornati, con una marina y poco más.",
        },
      },
      {
        name: "Murter",
        lat: 43.8225,
        lng: 15.5883,
        note: {
          en: "The gateway town to the Kornati, joined to the mainland by a small bridge.",
          uk: "Містечко-брама до Корнатів, з'єднане з материком невеликим мостом.",
          de: "Das Tor zu den Kornaten, über eine kleine Brücke mit dem Festland verbunden.",
          es: "El pueblo de entrada a las Kornati, unido a tierra firme por un pequeño puente.",
        },
      },
      {
        name: "Zadar",
        lat: 44.117,
        lng: 15.228,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_hr_southern_dalmatia_premium_loop",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Southern Dalmatia Premium Loop",
        description:
          "From Dubrovnik out to the Elaphiti islands, the green lakes of Mljet and Korčula's old town, with Lastovo far enough offshore to feel remote.",
      },
      uk: {
        title: "Південна Далмація",
        description:
          "Від Дубровника до Елафітських островів, зелених озер Млєта та старого міста Корчули, а далі — до віддаленого Ластово.",
      },
      de: {
        title: "Süddalmatien",
        description:
          "Von Dubrovnik zu den Elafiti-Inseln, den grünen Seen von Mljet und der Altstadt von Korčula, mit dem weit draußen liegenden Lastovo.",
      },
      es: {
        title: "Dalmacia del Sur",
        description:
          "De Dubrovnik a las islas Elafiti, los lagos verdes de Mljet y el casco antiguo de Korčula, con Lastovo lo bastante lejos para sentirse remoto.",
      },
    },
    stops: [
      {
        name: "Dubrovnik",
        lat: 42.67,
        lng: 18.13,
        note: {
          en: "Check-in at Komolac up the river, with the walled city a short ride away.",
          uk: "Реєстрація в Комолаці вище по річці, а до міста в мурах - коротка дорога.",
          de: "Check-in in Komolac flussaufwärts, die ummauerte Stadt ist kurz entfernt.",
          es: "Check-in en Komolac, río arriba, con la ciudad amurallada a un corto trayecto.",
        },
      },
      {
        name: "Elaphiti Islands",
        lat: 42.7333,
        lng: 17.8667,
        note: {
          en: "Three car-free islands an hour from Dubrovnik: Šipan, Lopud and Koločep.",
          uk: "Три безавтомобільні острови за годину від Дубровника: Шипан, Лопуд і Колочеп.",
          de: "Drei autofreie Inseln eine Stunde vor Dubrovnik: Šipan, Lopud und Koločep.",
          es: "Tres islas sin coches a una hora de Dubrovnik: Šipan, Lopud y Koločep.",
        },
      },
      {
        name: "Mljet",
        lat: 42.79,
        lng: 17.38,
        note: {
          en: "Two connected salt lakes inside a national park, with a monastery on an islet.",
          uk: "Два з'єднані солоні озера в національному парку й монастир на острівці.",
          de: "Zwei verbundene Salzseen in einem Nationalpark, mit einem Kloster auf einer Insel.",
          es: "Dos lagos salados conectados dentro de un parque nacional, con un monasterio en un islote.",
        },
      },
      {
        name: "Korčula",
        lat: 42.96,
        lng: 17.135,
        note: {
          en: "A walled town on a headland, laid out like a fishbone against the wind.",
          uk: "Обнесене мурами місто на мисі, сплановане, як риб'ячий скелет, проти вітру.",
          de: "Eine ummauerte Stadt auf einer Landzunge, fischgrätenförmig gegen den Wind angelegt.",
          es: "Una ciudad amurallada sobre un cabo, trazada como una espina de pez contra el viento.",
        },
      },
      {
        name: "Lastovo",
        lat: 42.7472,
        lng: 16.8306,
        note: {
          en: "The furthest island from the coast, a nature park with dark skies at night.",
          uk: "Найвіддаленіший від берега острів, природний парк із темним нічним небом.",
          de: "Die küstenfernste Insel, ein Naturpark mit dunklem Nachthimmel.",
          es: "La isla más alejada de la costa, un parque natural con cielos oscuros de noche.",
        },
      },
      {
        name: "Dubrovnik",
        lat: 42.67,
        lng: 18.13,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_hr_vis_and_bisevo_adventure",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Vis and Biševo Adventure",
        description:
          "The outer islands: Vis, the last to open to visitors, and the Blue Cave on Biševo, with Brač and Hvar on the way out and back.",
      },
      uk: {
        title: "Віс і Бішево",
        description:
          "Зовнішні острови: Віс, який відкрили для гостей останнім, і Блакитна печера на Бішеві, а Брач і Хвар лишаються по дорозі туди й назад.",
      },
      de: {
        title: "Vis und Biševo",
        description:
          "Die äußeren Inseln: Vis, das zuletzt für Gäste geöffnet wurde, und die Blaue Grotte auf Biševo, mit Brač und Hvar auf Hin- und Rückweg.",
      },
      es: {
        title: "Vis y Biševo",
        description:
          "Las islas exteriores: Vis, la última en abrirse a los visitantes, y la Cueva Azul de Biševo, con Brač y Hvar de ida y vuelta.",
      },
    },
    stops: [
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Check-in at the charter base, with Diocletian's Palace an evening's walk away.",
          uk: "Реєстрація на чартерній базі, а до палацу Діоклетіана - вечірня прогулянка.",
          de: "Check-in an der Charterbasis, der Diokletianpalast ist einen Abendspaziergang entfernt.",
          es: "Check-in en la base de chárter, con el palacio de Diocleciano a un paseo.",
        },
      },
      {
        name: "Brač",
        lat: 43.3272,
        lng: 16.4497,
        note: {
          en: "The Zlatni Rat beach shifts with the current; the island's white stone built Split.",
          uk: "Пляж Златні Рат змінює форму за течією, а з місцевого білого каменю збудований Спліт.",
          de: "Der Strand Zlatni Rat verschiebt sich mit der Strömung; aus dem weißen Stein wurde Split gebaut.",
          es: "La playa de Zlatni Rat cambia con la corriente; con su piedra blanca se construyó Split.",
        },
      },
      {
        name: "Hvar",
        lat: 43.1729,
        lng: 16.4414,
        note: {
          en: "Lavender fields, a Venetian old town and the busiest nightlife in Dalmatia.",
          uk: "Лавандові поля, венеційське старе місто й найжвавіше нічне життя Далмації.",
          de: "Lavendelfelder, eine venezianische Altstadt und das lebhafteste Nachtleben Dalmatiens.",
          es: "Campos de lavanda, un casco antiguo veneciano y la noche más animada de Dalmacia.",
        },
      },
      {
        name: "Vis",
        lat: 43.0603,
        lng: 16.1836,
        note: {
          en: "Closed to visitors until 1989, and still the least built-up of the big islands.",
          uk: "До 1989 року був закритий для гостей і досі найменш забудований серед великих островів.",
          de: "Bis 1989 für Besucher gesperrt und noch immer die am wenigsten bebaute der großen Inseln.",
          es: "Cerrada a los visitantes hasta 1989 y aún la menos urbanizada de las islas grandes.",
        },
      },
      {
        name: "Biševo",
        lat: 42.9736,
        lng: 16.0125,
        note: {
          en: "The Blue Cave lights up around midday, when the sun reaches the underwater opening.",
          uk: "Блакитна печера світиться близько полудня, коли сонце дістає підводного отвору.",
          de: "Die Blaue Grotte leuchtet gegen Mittag, wenn die Sonne die Unterwasseröffnung erreicht.",
          es: "La Cueva Azul se ilumina hacia el mediodía, cuando el sol alcanza la abertura sumergida.",
        },
      },
      {
        name: "Šolta",
        lat: 43.3961,
        lng: 16.2072,
        note: {
          en: "The nearest island to Split: quiet coves, olive groves and a working fishing harbour.",
          uk: "Найближчий до Спліта острів: тихі бухти, оливкові гаї та діюча рибальська гавань.",
          de: "Die nächste Insel vor Split: stille Buchten, Olivenhaine und ein aktiver Fischerhafen.",
          es: "La isla más cercana a Split: calas tranquilas, olivares y un puerto pesquero en activo.",
        },
      },
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_gr_saronic_gulf_classic",
    difficulty: "easy",
    copy: {
      en: {
        title: "Saronic Gulf Classic",
        description:
          "Short hops from Athens to Aegina, Poros and car-free Hydra, with Ermioni on the mainland shore. Sheltered water and a harbour every few hours.",
      },
      uk: {
        title: "Саронічна затока",
        description:
          "Короткі переходи від Афін до Егіни, Пороса й безавтомобільної Гідри, з Ермьоні на материковому березі. Захищена вода й гавань кожні кілька годин.",
      },
      de: {
        title: "Saronischer Golf",
        description:
          "Kurze Schläge von Athen nach Ägina, Poros und ins autofreie Hydra, mit Ermioni am Festland. Geschütztes Wasser und alle paar Stunden ein Hafen.",
      },
      es: {
        title: "Golfo Sarónico",
        description:
          "Travesías cortas de Atenas a Egina, Poros y la peatonal Hidra, con Ermioni en la costa continental. Aguas resguardadas y un puerto cada pocas horas.",
      },
    },
    stops: [
      {
        name: "Alimos",
        lat: 37.9111,
        lng: 23.7,
        note: {
          en: "Athens' charter marina, twenty minutes from the Acropolis.",
          uk: "Чартерна марина Афін, за двадцять хвилин від Акрополя.",
          de: "Athens Chartermarina, zwanzig Minuten von der Akropolis entfernt.",
          es: "La marina chárter de Atenas, a veinte minutos de la Acrópolis.",
        },
      },
      {
        name: "Aegina",
        lat: 37.747,
        lng: 23.427,
        note: {
          en: "Pistachio orchards and the temple of Aphaia above the pine woods.",
          uk: "Фісташкові сади та храм Афайї над сосновим лісом.",
          de: "Pistazienhaine und der Aphaia-Tempel über den Pinienwäldern.",
          es: "Huertos de pistachos y el templo de Afaya sobre los pinares.",
        },
      },
      {
        name: "Poros",
        lat: 37.4986,
        lng: 23.4525,
        note: {
          en: "A narrow channel separates the town from the mainland lemon groves.",
          uk: "Вузька протока відділяє місто від лимонних гаїв на материку.",
          de: "Ein schmaler Kanal trennt die Stadt von den Zitronenhainen des Festlands.",
          es: "Un canal estrecho separa el pueblo de los limonares del continente.",
        },
      },
      {
        name: "Hydra",
        lat: 37.35,
        lng: 23.4667,
        note: {
          en: "No cars on the island: goods move by mule from the harbour.",
          uk: "На острові немає автомобілів: вантажі возять мулами від гавані.",
          de: "Keine Autos auf der Insel: Waren werden vom Hafen per Maultier transportiert.",
          es: "Sin coches en la isla: la carga se mueve en mula desde el puerto.",
        },
      },
      {
        name: "Ermioni",
        lat: 37.3875,
        lng: 23.2483,
        note: {
          en: "A mainland town on a pine-covered spit, with a quay on either side.",
          uk: "Материкове містечко на вкритій соснами косі, з причалом з обох боків.",
          de: "Eine Festlandstadt auf einer kiefernbewachsenen Landzunge, mit Kai auf beiden Seiten.",
          es: "Un pueblo continental en una lengua de pinos, con muelle a ambos lados.",
        },
      },
      {
        name: "Agistri",
        lat: 37.6975,
        lng: 23.3494,
        note: {
          en: "The smallest of the Saronic islands, ringed by clear shallow water.",
          uk: "Найменший із Саронічних островів, оточений прозорою мілкою водою.",
          de: "Die kleinste der Saronischen Inseln, umgeben von klarem, flachem Wasser.",
          es: "La más pequeña de las islas Sarónicas, rodeada de aguas claras y poco profundas.",
        },
      },
      {
        name: "Alimos",
        lat: 37.9111,
        lng: 23.7,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_gr_cyclades_from_lavrion",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Cyclades from Lavrion",
        description:
          "Kea, Syros and Mykonos with the meltemi behind you and long open passages between islands. A week for crews who want real sailing.",
      },
      uk: {
        title: "Кіклади зі старту в Лавріоні",
        description:
          "Кея, Сірос і Міконос із мельтемі в корму й довгими переходами відкритим морем. Тиждень для екіпажів, які хочуть справжнього вітрила.",
      },
      de: {
        title: "Kykladen ab Lavrion",
        description:
          "Kea, Syros und Mykonos mit dem Meltemi im Rücken und langen Schlägen über offenes Wasser. Eine Woche für Crews, die richtig segeln wollen.",
      },
      es: {
        title: "Cícladas desde Lavrion",
        description:
          "Kea, Siros y Mikonos con el meltemi de popa y largas travesías en mar abierto. Una semana para tripulaciones que quieren navegar de verdad.",
      },
    },
    stops: [
      {
        name: "Lavrion",
        lat: 37.7133,
        lng: 24.06,
        note: {
          en: "The Cyclades base, chosen so the first crossing is short.",
          uk: "База для Кіклад, обрана так, щоб перший перехід був коротким.",
          de: "Die Basis für die Kykladen, gewählt für einen kurzen ersten Schlag.",
          es: "La base para las Cícladas, elegida para que la primera travesía sea corta.",
        },
      },
      {
        name: "Kea",
        lat: 37.6667,
        lng: 24.32,
        note: {
          en: "The closest Cyclade to Athens, and the quietest of them.",
          uk: "Найближчий до Афін острів Кіклад і водночас найтихіший.",
          de: "Die Athen nächstgelegene Kykladeninsel und die ruhigste von ihnen.",
          es: "La Cíclada más cercana a Atenas y la más tranquila de todas.",
        },
      },
      {
        name: "Syros",
        lat: 37.445,
        lng: 24.9411,
        note: {
          en: "The islands' administrative capital, with a neoclassical town above the port.",
          uk: "Адміністративна столиця островів із неокласичним містом над портом.",
          de: "Die Verwaltungshauptstadt der Inseln, mit klassizistischer Stadt über dem Hafen.",
          es: "La capital administrativa de las islas, con una ciudad neoclásica sobre el puerto.",
        },
      },
      {
        name: "Mykonos",
        lat: 37.4547,
        lng: 25.3253,
        note: {
          en: "Windmills, whitewashed lanes and the most crowded harbour in the Cyclades.",
          uk: "Вітряки, білені вулички й найлюдніша гавань Кіклад.",
          de: "Windmühlen, weiß gekalkte Gassen und der vollste Hafen der Kykladen.",
          es: "Molinos, callejuelas encaladas y el puerto más concurrido de las Cícladas.",
        },
      },
      {
        name: "Kythnos",
        lat: 37.3894,
        lng: 24.3919,
        note: {
          en: "The sandbar at Kolona joins two beaches back to back.",
          uk: "Піщана коса Колона з'єднує два пляжі спинами один до одного.",
          de: "Die Sandbank von Kolona verbindet zwei Strände Rücken an Rücken.",
          es: "La barra de arena de Kolona une dos playas espalda con espalda.",
        },
      },
      {
        name: "Lavrion",
        lat: 37.7133,
        lng: 24.06,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_gr_dodecanese_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Dodecanese Classic",
        description:
          "Kos, the fjord-like harbour of Leros, tiny Lipsi and the monastery above Patmos, close to the Turkish coast the whole way.",
      },
      uk: {
        title: "Додеканес",
        description:
          "Кос, схожа на фіорд гавань Лероса, крихітний Ліпсі та монастир над Патмосом, і весь час поряд турецький берег.",
      },
      de: {
        title: "Dodekanes",
        description:
          "Kos, der fjordartige Hafen von Leros, das winzige Lipsi und das Kloster über Patmos, die ganze Zeit dicht an der türkischen Küste.",
      },
      es: {
        title: "Dodecaneso",
        description:
          "Kos, el puerto de Leros parecido a un fiordo, la diminuta Lipsi y el monasterio sobre Patmos, con la costa turca cerca todo el tiempo.",
      },
    },
    stops: [
      {
        name: "Kos",
        lat: 36.8931,
        lng: 27.2947,
        note: {
          en: "Check-in beside the castle, with the Turkish coast in sight across the strait.",
          uk: "Реєстрація біля фортеці, а через протоку видно турецький берег.",
          de: "Check-in neben der Burg, die türkische Küste liegt gegenüber in Sicht.",
          es: "Check-in junto al castillo, con la costa turca a la vista al otro lado.",
        },
      },
      {
        name: "Kalymnos",
        lat: 36.9483,
        lng: 26.9797,
        note: {
          en: "A sponge-diving island, now better known to climbers for its limestone.",
          uk: "Острів ловців губок, тепер відоміший скелелазам своїм вапняком.",
          de: "Eine Schwammtaucherinsel, heute bei Kletterern für ihren Kalkstein bekannt.",
          es: "Isla de pescadores de esponjas, hoy más conocida por los escaladores y su caliza.",
        },
      },
      {
        name: "Leros",
        lat: 37.1283,
        lng: 26.85,
        note: {
          en: "Lakki's wide Italian-built waterfront, and a fjord-like bay behind it.",
          uk: "Широка набережна Лаккі, збудована італійцями, і схожа на фіорд затока за нею.",
          de: "Die breite, italienisch gebaute Uferfront von Lakki und dahinter eine fjordartige Bucht.",
          es: "El ancho frente marítimo italiano de Lakki y, tras él, una bahía como un fiordo.",
        },
      },
      {
        name: "Lipsi",
        lat: 37.2967,
        lng: 26.765,
        note: {
          en: "A single village, a handful of beaches and no through traffic.",
          uk: "Одне село, кілька пляжів і жодного транзитного руху.",
          de: "Ein einziges Dorf, eine Handvoll Strände und kein Durchgangsverkehr.",
          es: "Un solo pueblo, un puñado de playas y nada de tránsito.",
        },
      },
      {
        name: "Patmos",
        lat: 37.3167,
        lng: 26.545,
        note: {
          en: "The monastery of Saint John stands over the harbour from the hilltop.",
          uk: "Монастир святого Івана стоїть над гаванню на вершині пагорба.",
          de: "Das Johanneskloster thront vom Hügel aus über dem Hafen.",
          es: "El monasterio de San Juan domina el puerto desde lo alto del cerro.",
        },
      },
      {
        name: "Kos",
        lat: 36.8931,
        lng: 27.2947,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_gr_sporades_classic",
    difficulty: "easy",
    copy: {
      en: {
        title: "Sporades Classic",
        description:
          "Pine-covered Skopelos and Alonissos, and the marine park around Peristera where monk seals are protected. Green islands rather than bare ones.",
      },
      uk: {
        title: "Споради",
        description:
          "Вкриті соснами Скопелос і Алоніссос та морський парк навколо Перістери, де охороняють тюленів-монахів. Зелені острови замість голих.",
      },
      de: {
        title: "Sporaden",
        description:
          "Das kieferbewachsene Skopelos und Alonissos sowie der Meerespark um Peristera, in dem Mönchsrobben geschützt sind. Grüne statt kahler Inseln.",
      },
      es: {
        title: "Espóradas",
        description:
          "Skópelos y Alonisos, cubiertas de pinos, y el parque marino de Peristera, donde se protege a la foca monje. Islas verdes en vez de peladas.",
      },
    },
    stops: [
      {
        name: "Skiathos",
        lat: 39.1622,
        lng: 23.4906,
        note: {
          en: "The Sporades base, with the island's south coast beaches a short hop away.",
          uk: "База для Спорад, а пляжі південного берега - за короткий перехід.",
          de: "Die Basis für die Sporaden, die Südstrände der Insel sind kurz entfernt.",
          es: "La base de las Espóradas, con las playas del sur de la isla a un salto.",
        },
      },
      {
        name: "Skopelos",
        lat: 39.1225,
        lng: 23.7275,
        note: {
          en: "Pine forest down to the water, and a harbour town built up a slope.",
          uk: "Сосновий ліс до самої води й портове містечко, що піднімається схилом.",
          de: "Kiefernwald bis ans Wasser und eine Hafenstadt, die den Hang hinaufgebaut ist.",
          es: "Pinares hasta el agua y un pueblo portuario que trepa por la ladera.",
        },
      },
      {
        name: "Alonissos",
        lat: 39.1447,
        lng: 23.8664,
        note: {
          en: "Inside a marine park set up for the Mediterranean monk seal.",
          uk: "У межах морського парку, створеного заради середземноморського тюленя-монаха.",
          de: "Innerhalb eines Meeresparks, eingerichtet für die Mönchsrobbe.",
          es: "Dentro de un parque marino creado para la foca monje del Mediterráneo.",
        },
      },
      {
        name: "Peristera",
        lat: 39.1767,
        lng: 23.95,
        note: {
          en: "An uninhabited island with an ancient shipwreck open to divers.",
          uk: "Безлюдний острів, біля якого дайверам відкрито античний затонулий корабель.",
          de: "Eine unbewohnte Insel mit einem antiken Wrack, das Tauchern offensteht.",
          es: "Una isla deshabitada con un pecio antiguo abierto a los buceadores.",
        },
      },
      {
        name: "Skopelos",
        lat: 39.1225,
        lng: 23.7275,
        note: {
          en: "Pine forest down to the water, and a harbour town built up a slope.",
          uk: "Сосновий ліс до самої води й портове містечко, що піднімається схилом.",
          de: "Kiefernwald bis ans Wasser und eine Hafenstadt, die den Hang hinaufgebaut ist.",
          es: "Pinares hasta el agua y un pueblo portuario que trepa por la ladera.",
        },
      },
      {
        name: "Skiathos",
        lat: 39.1622,
        lng: 23.4906,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_tr_gokova_classic",
    difficulty: "easy",
    copy: {
      en: {
        title: "Gökova Classic",
        description:
          "The gulf east of Bodrum: Çökertme, the Seven Islands, English Harbour and the mosaic beach of Cleopatra Island, with flat water most mornings.",
      },
      uk: {
        title: "Затока Гьокова",
        description:
          "Затока на схід від Бодрума: Чьокертме, Сім островів, Англійська гавань і мозаїчний пляж острова Клеопатри, з рівною водою більшість ранків.",
      },
      de: {
        title: "Golf von Gökova",
        description:
          "Der Golf östlich von Bodrum: Çökertme, die Sieben Inseln, English Harbour und der Mosaikstrand der Kleopatra-Insel, morgens meist glattes Wasser.",
      },
      es: {
        title: "Golfo de Gökova",
        description:
          "El golfo al este de Bodrum: Çökertme, las Siete Islas, English Harbour y la playa de mosaico de la isla de Cleopatra, con mar plano casi cada mañana.",
      },
    },
    stops: [
      {
        name: "Bodrum",
        lat: 37.032,
        lng: 27.429,
        note: {
          en: "Check-in under the crusader castle, in the town the gulets are built in.",
          uk: "Реєстрація під замком хрестоносців, у місті, де будують гулети.",
          de: "Check-in unter der Kreuzritterburg, in der Stadt, in der Guleten gebaut werden.",
          es: "Check-in bajo el castillo de los cruzados, en la ciudad donde se construyen las goletas.",
        },
      },
      {
        name: "Orak Island",
        lat: 36.9917,
        lng: 27.6167,
        note: {
          en: "A bare island with water clear enough to see the anchor down.",
          uk: "Голий острів із водою настільки прозорою, що видно якір на дні.",
          de: "Eine kahle Insel mit Wasser, klar genug, um den Anker liegen zu sehen.",
          es: "Una isla pelada con agua tan clara que se ve el ancla en el fondo.",
        },
      },
      {
        name: "Çökertme",
        lat: 37.0219,
        lng: 27.8267,
        note: {
          en: "A fishing hamlet with restaurant jetties and a well-known folk song.",
          uk: "Рибальське селище з ресторанними причалами й відомою народною піснею.",
          de: "Ein Fischerweiler mit Restaurantstegen und einem bekannten Volkslied.",
          es: "Una aldea de pescadores con pantalanes de restaurante y una canción popular conocida.",
        },
      },
      {
        name: "Seven Islands",
        lat: 37.0417,
        lng: 28.115,
        note: {
          en: "A shallow archipelago you thread between, sheltered from every direction.",
          uk: "Мілкий архіпелаг, між островами якого проходять, і захист з усіх боків.",
          de: "Ein flaches Archipel, durch das man fädelt, aus jeder Richtung geschützt.",
          es: "Un archipiélago poco profundo por el que se navega, resguardado de todos los vientos.",
        },
      },
      {
        name: "English Harbour",
        lat: 37.0167,
        lng: 28.2,
        note: {
          en: "Named for a warship hidden here in 1941, under the pines of Değirmen Bükü.",
          uk: "Названа за військовим кораблем, схованим тут 1941 року, під соснами Дейірмен-Бюкю.",
          de: "Benannt nach einem 1941 hier versteckten Kriegsschiff, unter den Pinien von Değirmen Bükü.",
          es: "Bautizada por un buque escondido aquí en 1941, bajo los pinos de Değirmen Bükü.",
        },
      },
      {
        name: "Cleopatra Island",
        lat: 37.0322,
        lng: 28.1358,
        note: {
          en: "The beach sand is coarse and round, and taking any of it away is forbidden.",
          uk: "Пісок на пляжі грубий і круглий, і забирати його звідси заборонено.",
          de: "Der Strandsand ist grob und rund; ihn mitzunehmen ist verboten.",
          es: "La arena de la playa es gruesa y redonda, y está prohibido llevársela.",
        },
      },
      {
        name: "Bodrum",
        lat: 37.032,
        lng: 27.429,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_tr_hisaronu_and_bozburun",
    difficulty: "easy",
    copy: {
      en: {
        title: "Hisarönü and Bozburun",
        description:
          "Quiet bays a short sail from Marmaris: the ruins at Bozukkale, the gulet yards of Bozburun, and dinner on the water at Selimiye and Orhaniye.",
      },
      uk: {
        title: "Хісарьоню і Бозбурун",
        description:
          "Тихі бухти неподалік Мармариса: руїни Бозуккале, верфі гулетів у Бозбуруні та вечеря на воді в Селіміє й Орханіє.",
      },
      de: {
        title: "Hisarönü und Bozburun",
        description:
          "Ruhige Buchten nahe Marmaris: die Ruinen von Bozukkale, die Gulet-Werften von Bozburun und Abendessen am Wasser in Selimiye und Orhaniye.",
      },
      es: {
        title: "Hisarönü y Bozburun",
        description:
          "Bahías tranquilas cerca de Marmaris: las ruinas de Bozukkale, los astilleros de goletas de Bozburun y cenas junto al agua en Selimiye y Orhaniye.",
      },
    },
    stops: [
      {
        name: "Marmaris",
        lat: 36.85,
        lng: 28.27,
        note: {
          en: "Check-in in a deep, almost enclosed bay ringed by pine hills.",
          uk: "Реєстрація в глибокій, майже замкненій затоці серед соснових пагорбів.",
          de: "Check-in in einer tiefen, fast geschlossenen Bucht zwischen Pinienhügeln.",
          es: "Check-in en una bahía profunda y casi cerrada, rodeada de colinas de pinos.",
        },
      },
      {
        name: "Bozukkale",
        lat: 36.6167,
        lng: 28.0167,
        note: {
          en: "The wall of ancient Loryma runs along the ridge above the anchorage.",
          uk: "Мур античної Лоріми тягнеться хребтом над якірною стоянкою.",
          de: "Die Mauer des antiken Loryma zieht sich über den Grat oberhalb des Ankerplatzes.",
          es: "La muralla de la antigua Loryma recorre la cresta sobre el fondeadero.",
        },
      },
      {
        name: "Bozburun",
        lat: 36.6903,
        lng: 28.0444,
        note: {
          en: "Wooden gulets are still built on the shore here, in the open.",
          uk: "Дерев'яні гулети тут досі будують просто неба на березі.",
          de: "Hölzerne Guleten werden hier noch immer unter freiem Himmel am Ufer gebaut.",
          es: "Aquí todavía se construyen goletas de madera al aire libre, en la orilla.",
        },
      },
      {
        name: "Selimiye",
        lat: 36.7069,
        lng: 28.0947,
        note: {
          en: "A single row of restaurants along the water under a ruined fort.",
          uk: "Один ряд ресторанів уздовж води під зруйнованою фортецею.",
          de: "Eine einzige Reihe Restaurants am Wasser unter einer Festungsruine.",
          es: "Una sola hilera de restaurantes junto al agua bajo un fuerte en ruinas.",
        },
      },
      {
        name: "Orhaniye",
        lat: 36.7594,
        lng: 28.1361,
        note: {
          en: "A sandbar runs out into the bay: you can walk half a kilometre offshore.",
          uk: "У затоку виходить піщана коса: можна пройти пів кілометра від берега.",
          de: "Eine Sandbank zieht in die Bucht hinaus: Man kann einen halben Kilometer hinauslaufen.",
          es: "Una barra de arena se adentra en la bahía: se puede caminar medio kilómetro mar adentro.",
        },
      },
      {
        name: "Bencik",
        lat: 36.7833,
        lng: 28.1167,
        note: {
          en: "A narrow inlet that all but cuts the peninsula in two.",
          uk: "Вузька бухта, що майже перерізає півострів надвоє.",
          de: "Eine schmale Bucht, die die Halbinsel beinahe zweiteilt.",
          es: "Una ensenada estrecha que casi corta la península en dos.",
        },
      },
      {
        name: "Marmaris",
        lat: 36.85,
        lng: 28.27,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_tr_lycian_coast_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Lycian Coast Classic",
        description:
          "East from Fethiye past Gemiler to Kalkan and Kaş, ending over the sunken city at Kekova. The archaeology is the reason to come.",
      },
      uk: {
        title: "Лікійське узбережжя",
        description:
          "На схід від Фетхіє повз Гемілер до Калкана й Каша, а завершення над затопленим містом Кекова. Сюди їдуть заради археології.",
      },
      de: {
        title: "Lykische Küste",
        description:
          "Von Fethiye ostwärts über Gemiler nach Kalkan und Kaş, zum Abschluss über der versunkenen Stadt von Kekova. Die Archäologie ist der Grund für diesen Törn.",
      },
      es: {
        title: "Costa Licia",
        description:
          "Al este de Fethiye pasando por Gemiler hasta Kalkan y Kaş, y final sobre la ciudad sumergida de Kekova. Se viene por la arqueología.",
      },
    },
    stops: [
      {
        name: "Fethiye",
        lat: 36.622,
        lng: 29.104,
        note: {
          en: "Rock tombs cut into the cliff above the town and its market.",
          uk: "Скельні гробниці, вирубані в кручі над містом і його ринком.",
          de: "In die Felswand über Stadt und Markt gehauene Felsengräber.",
          es: "Tumbas excavadas en el acantilado sobre el pueblo y su mercado.",
        },
      },
      {
        name: "Gemiler",
        lat: 36.554,
        lng: 29.065,
        note: {
          en: "A hillside of Byzantine church ruins, best seen in the evening light.",
          uk: "Схил із руїнами візантійських церков, найкраще видимими у вечірньому світлі.",
          de: "Ein Hang voller byzantinischer Kirchenruinen, am schönsten im Abendlicht.",
          es: "Una ladera con ruinas de iglesias bizantinas, mejor con la luz del atardecer.",
        },
      },
      {
        name: "Kalkan",
        lat: 36.265,
        lng: 29.4144,
        note: {
          en: "A hillside of white houses above a small harbour, with rooftop restaurants.",
          uk: "Схил із білих будинків над невеликою гаванню й ресторани на дахах.",
          de: "Ein Hang weißer Häuser über einem kleinen Hafen, mit Dachrestaurants.",
          es: "Una ladera de casas blancas sobre un puerto pequeño, con restaurantes en las azoteas.",
        },
      },
      {
        name: "Kaş",
        lat: 36.1983,
        lng: 29.6392,
        note: {
          en: "A Lycian sarcophagus stands in the middle of the main street.",
          uk: "Посеред головної вулиці стоїть лікійський саркофаг.",
          de: "Mitten in der Hauptstraße steht ein lykischer Sarkophag.",
          es: "Un sarcófago licio se alza en mitad de la calle principal.",
        },
      },
      {
        name: "Kekova",
        lat: 36.1833,
        lng: 29.8667,
        note: {
          en: "An earthquake dropped the town into the sea; the walls are still under the water.",
          uk: "Землетрус опустив місто в море, і мури досі лежать під водою.",
          de: "Ein Erdbeben ließ die Stadt ins Meer sinken; die Mauern liegen noch unter Wasser.",
          es: "Un terremoto hundió la ciudad en el mar; los muros siguen bajo el agua.",
        },
      },
      {
        name: "Fethiye",
        lat: 36.622,
        lng: 29.104,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_tr_marmaris_to_fethiye_loop",
    difficulty: "easy",
    copy: {
      en: {
        title: "Marmaris to Fethiye Loop",
        description:
          "Ekincik and the river trip up to the rock tombs of Kaunos, then Fethiye and the Göcek islands on the way back.",
      },
      uk: {
        title: "Мармарис - Фетхіє",
        description:
          "Екінджик і поїздка річкою до скельних гробниць Кауноса, далі Фетхіє та острови Гьочека дорогою назад.",
      },
      de: {
        title: "Marmaris nach Fethiye",
        description:
          "Ekincik und die Bootsfahrt flussauf zu den Felsgräbern von Kaunos, danach Fethiye und die Göcek-Inseln auf dem Rückweg.",
      },
      es: {
        title: "Marmaris a Fethiye",
        description:
          "Ekincik y la subida por el río hasta las tumbas excavadas de Kaunos, después Fethiye y las islas de Göcek al regreso.",
      },
    },
    stops: [
      {
        name: "Marmaris",
        lat: 36.85,
        lng: 28.27,
        note: {
          en: "Check-in in a deep, almost enclosed bay ringed by pine hills.",
          uk: "Реєстрація в глибокій, майже замкненій затоці серед соснових пагорбів.",
          de: "Check-in in einer tiefen, fast geschlossenen Bucht zwischen Pinienhügeln.",
          es: "Check-in en una bahía profunda y casi cerrada, rodeada de colinas de pinos.",
        },
      },
      {
        name: "Ekincik",
        lat: 36.825,
        lng: 28.55,
        note: {
          en: "The anchorage for the river trip, tucked behind a headland.",
          uk: "Стоянка для поїздки річкою, схована за мисом.",
          de: "Der Ankerplatz für die Flussfahrt, hinter einer Landzunge geschützt.",
          es: "El fondeadero para la excursión fluvial, resguardado tras un cabo.",
        },
      },
      {
        name: "Dalyan/Kaunos",
        lat: 36.83,
        lng: 28.63,
        note: {
          en: "A river boat runs up the reed channels to the rock tombs of Kaunos.",
          uk: "Річковий човен піднімається очеретяними протоками до скельних гробниць Кауноса.",
          de: "Ein Flussboot fährt durch die Schilfkanäle hinauf zu den Felsengräbern von Kaunos.",
          es: "Una barca remonta los canales de cañaverales hasta las tumbas de Kaunos.",
        },
      },
      {
        name: "Fethiye",
        lat: 36.622,
        lng: 29.104,
        note: {
          en: "Rock tombs cut into the cliff above the town and its market.",
          uk: "Скельні гробниці, вирубані в кручі над містом і його ринком.",
          de: "In die Felswand über Stadt und Markt gehauene Felsengräber.",
          es: "Tumbas excavadas en el acantilado sobre el pueblo y su mercado.",
        },
      },
      {
        name: "Göcek Islands",
        lat: 36.7167,
        lng: 28.9333,
        note: {
          en: "The islands off the town, close enough to pick one by the forecast.",
          uk: "Острови навпроти міста, достатньо близькі, щоб обирати їх за прогнозом.",
          de: "Die Inseln vor der Stadt, nah genug, um sie nach dem Wetterbericht zu wählen.",
          es: "Las islas frente al pueblo, tan cerca que se elige una según el parte.",
        },
      },
      {
        name: "Marmaris",
        lat: 36.85,
        lng: 28.27,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_it_aeolian_islands_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Aeolian Islands Classic",
        description:
          "Seven volcanic islands north of Sicily, finishing under Stromboli after dark, when its frequent bursts of incandescent material are easiest to see.",
      },
      uk: {
        title: "Еолійські острови",
        description:
          "Сім вулканічних островів на північ від Сицилії, а фінал — під Стромболі в темряві, коли найкраще видно його регулярну вибухову активність.",
      },
      de: {
        title: "Äolische Inseln",
        description:
          "Sieben Vulkaninseln nördlich Siziliens, zum Abschluss nach Einbruch der Dunkelheit unter dem Stromboli, wenn seine häufigen glühenden Auswürfe am besten zu sehen sind.",
      },
      es: {
        title: "Islas Eolias",
        description:
          "Siete islas volcánicas al norte de Sicilia, con final al anochecer bajo el Stromboli, cuando se aprecia mejor su frecuente actividad explosiva.",
      },
    },
    stops: [
      {
        name: "Portorosa",
        lat: 38.1358,
        lng: 15.0983,
        note: {
          en: "Check-in on the Sicilian coast, with the Aeolians on the horizon.",
          uk: "Реєстрація на сицилійському березі, а на обрії - Еолійські острови.",
          de: "Check-in an der sizilianischen Küste, die Äolischen Inseln am Horizont.",
          es: "Check-in en la costa siciliana, con las Eolias en el horizonte.",
        },
      },
      {
        name: "Vulcano",
        lat: 38.4114,
        lng: 14.9617,
        note: {
          en: "Sulphur mud baths beside the anchorage, and you smell the island before you see it.",
          uk: "Сірчані грязьові ванни біля стоянки, і острів чути раніше, ніж видно.",
          de: "Schwefel-Schlammbäder neben dem Ankerplatz; man riecht die Insel, bevor man sie sieht.",
          es: "Baños de lodo sulfuroso junto al fondeadero: la isla se huele antes de verse.",
        },
      },
      {
        name: "Lipari",
        lat: 38.4675,
        lng: 14.9536,
        note: {
          en: "The largest Aeolian, with a citadel above the harbour and white pumice quarries.",
          uk: "Найбільший з Еолійських островів: цитадель над гаванню й білі пемзові кар'єри.",
          de: "Die größte Äolische Insel, mit Zitadelle über dem Hafen und weißen Bimssteinbrüchen.",
          es: "La mayor de las Eolias, con ciudadela sobre el puerto y canteras blancas de piedra pómez.",
        },
      },
      {
        name: "Salina",
        lat: 38.5581,
        lng: 14.8725,
        note: {
          en: "Two extinct cones, vineyards between them and capers on every terrace.",
          uk: "Два згаслі вулканічні конуси, виноградники між ними й каперси на кожній терасі.",
          de: "Zwei erloschene Kegel, Weinberge dazwischen und Kapern auf jeder Terrasse.",
          es: "Dos conos apagados, viñedos entre ellos y alcaparras en cada terraza.",
        },
      },
      {
        name: "Panarea",
        lat: 38.6367,
        lng: 15.07,
        note: {
          en: "The smallest and smartest of the islands, with gas bubbles rising off its islets.",
          uk: "Найменший і найфешенебельніший з островів, а біля острівців з дна йдуть бульбашки газу.",
          de: "Die kleinste und mondänste der Inseln, an deren Eilanden Gasblasen aufsteigen.",
          es: "La más pequeña y elegante de las islas, con burbujas de gas frente a sus islotes.",
        },
      },
      {
        name: "Stromboli",
        lat: 38.7947,
        lng: 15.2306,
        note: {
          en: "Frequent bursts of incandescent material are easiest to see after dark.",
          uk: "Часті вибухи й викиди розжареного матеріалу найкраще видно після настання темряви.",
          de: "Häufige Auswürfe glühenden Materials sind nach Einbruch der Dunkelheit am besten zu sehen.",
          es: "Las frecuentes explosiones de material incandescente se aprecian mejor de noche.",
        },
      },
      {
        name: "Portorosa",
        lat: 38.1358,
        lng: 15.0983,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_it_amalfi_and_gulf_of_naples",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Amalfi and Gulf of Naples",
        description:
          "The Amalfi cliffs from the water, then Capri, Ischia and Procida. Busy in August and worth timing for June or September.",
      },
      uk: {
        title: "Амальфі й Неаполітанська затока",
        description:
          "Скелі Амальфі з води, далі Капрі, Іск'я та Прочіда. У серпні людно, тож краще планувати на червень або вересень.",
      },
      de: {
        title: "Amalfi und Golf von Neapel",
        description:
          "Die Felsen von Amalfi vom Wasser aus, dann Capri, Ischia und Procida. Im August voll, im Juni oder September am schönsten.",
      },
      es: {
        title: "Amalfi y golfo de Nápoles",
        description:
          "Los acantilados de Amalfi desde el agua y después Capri, Ischia y Prócida. En agosto hay mucha gente: mejor junio o septiembre.",
      },
    },
    stops: [
      {
        name: "Salerno",
        lat: 40.6767,
        lng: 14.755,
        note: {
          en: "Check-in at the eastern end of the Amalfi coast, away from the crowds.",
          uk: "Реєстрація на східному краю Амальфітанського узбережжя, подалі від натовпу.",
          de: "Check-in am Ostende der Amalfiküste, abseits des Trubels.",
          es: "Check-in en el extremo este de la costa amalfitana, lejos de las multitudes.",
        },
      },
      {
        name: "Amalfi",
        lat: 40.634,
        lng: 14.6027,
        note: {
          en: "A cathedral staircase rising straight from the square behind the quay.",
          uk: "Сходи до собору, що піднімаються просто з площі за причалом.",
          de: "Eine Domtreppe, die direkt vom Platz hinter dem Kai aufsteigt.",
          es: "La escalinata de la catedral se alza justo desde la plaza tras el muelle.",
        },
      },
      {
        name: "Positano",
        lat: 40.6281,
        lng: 14.485,
        note: {
          en: "Houses stacked up the cliff; there is no harbour, so boats lie off the beach.",
          uk: "Будинки, складені по кручі; гавані немає, тож яхти стоять на рейді біля пляжу.",
          de: "Häuser den Fels hinaufgestapelt; es gibt keinen Hafen, Boote liegen vor dem Strand.",
          es: "Casas apiladas en el acantilado; no hay puerto, así que se fondea frente a la playa.",
        },
      },
      {
        name: "Capri",
        lat: 40.5583,
        lng: 14.245,
        note: {
          en: "Go early for the Blue Grotto, and stay aboard once the day boats leave.",
          uk: "До Блакитного грота варто йти зранку, а ввечері, коли підуть екскурсійні катери, лишатися на борту.",
          de: "Früh zur Blauen Grotte, und an Bord bleiben, sobald die Ausflugsboote weg sind.",
          es: "Ir temprano a la Gruta Azul y quedarse a bordo cuando se van los barcos de excursión.",
        },
      },
      {
        name: "Ischia",
        lat: 40.7464,
        lng: 13.945,
        note: {
          en: "A volcanic island with thermal springs and a castle on its own rock.",
          uk: "Вулканічний острів із термальними джерелами й замком на власній скелі.",
          de: "Eine Vulkaninsel mit Thermalquellen und einer Burg auf eigenem Felsen.",
          es: "Una isla volcánica con aguas termales y un castillo sobre su propia roca.",
        },
      },
      {
        name: "Procida",
        lat: 40.76,
        lng: 14.04,
        note: {
          en: "Fishermen's houses painted in every colour, and far quieter than its neighbours.",
          uk: "Рибальські будинки, пофарбовані в усі кольори, і значно тихіше, ніж у сусідів.",
          de: "Fischerhäuser in allen Farben, und weit ruhiger als die Nachbarinseln.",
          es: "Casas de pescadores de todos los colores y mucho más tranquila que sus vecinas.",
        },
      },
      {
        name: "Salerno",
        lat: 40.6767,
        lng: 14.755,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_it_tuscan_archipelago_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Tuscan Archipelago Classic",
        description:
          "Elba's coves, the bird cliffs of Capraia and a crossing to Bastia in Corsica. Quieter than the Italian mainland coast in season.",
      },
      uk: {
        title: "Тосканський архіпелаг",
        description:
          "Бухти Ельби, пташині скелі Капрайї та перехід до Бастії на Корсиці. У сезон тут спокійніше, ніж біля материкового берега.",
      },
      de: {
        title: "Toskanischer Archipel",
        description:
          "Die Buchten Elbas, die Vogelfelsen von Capraia und ein Schlag nach Bastia auf Korsika. In der Saison ruhiger als die italienische Festlandküste.",
      },
      es: {
        title: "Archipiélago toscano",
        description:
          "Las calas de Elba, los acantilados de aves de Capraia y una travesía a Bastia, en Córcega. En temporada, más tranquilo que la costa continental.",
      },
    },
    stops: [
      {
        name: "Punta Ala",
        lat: 42.81,
        lng: 10.7383,
        note: {
          en: "Check-in on the Tuscan coast, with Elba across the channel.",
          uk: "Реєстрація на тосканському березі, а через протоку - Ельба.",
          de: "Check-in an der toskanischen Küste, Elba liegt jenseits des Kanals.",
          es: "Check-in en la costa toscana, con Elba al otro lado del canal.",
        },
      },
      {
        name: "Elba",
        lat: 42.8125,
        lng: 10.3167,
        note: {
          en: "Napoleon's year of exile, and a coastline of small coves to anchor in.",
          uk: "Рік Наполеонового заслання й берегова лінія з дрібних бухт для стоянки.",
          de: "Napoleons Exiljahr, und eine Küste voller kleiner Ankerbuchten.",
          es: "El año de exilio de Napoleón y una costa de pequeñas calas para fondear.",
        },
      },
      {
        name: "Capraia",
        lat: 43.05,
        lng: 9.8417,
        note: {
          en: "A volcanic island inside a whale sanctuary, with one small harbour.",
          uk: "Вулканічний острів у заповіднику китів, з однією невеликою гаванню.",
          de: "Eine Vulkaninsel in einem Walschutzgebiet, mit einem kleinen Hafen.",
          es: "Una isla volcánica dentro de un santuario de ballenas, con un solo puerto pequeño.",
        },
      },
      {
        name: "Corsica/Bastia",
        lat: 42.7,
        lng: 9.45,
        note: {
          en: "A French port an easy crossing from Tuscany; clear in on arrival.",
          uk: "Французький порт за нескладний перехід від Тоскани, після приходу - оформлення.",
          de: "Ein französischer Hafen, ein leichter Schlag von der Toskana; bei Ankunft einklarieren.",
          es: "Un puerto francés a una travesía fácil desde Toscana; despacho a la llegada.",
        },
      },
      {
        name: "Elba",
        lat: 42.8125,
        lng: 10.3167,
        note: {
          en: "Napoleon's year of exile, and a coastline of small coves to anchor in.",
          uk: "Рік Наполеонового заслання й берегова лінія з дрібних бухт для стоянки.",
          de: "Napoleons Exiljahr, und eine Küste voller kleiner Ankerbuchten.",
          es: "El año de exilio de Napoleón y una costa de pequeñas calas para fondear.",
        },
      },
      {
        name: "Punta Ala",
        lat: 42.81,
        lng: 10.7383,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_it_western_aeolians",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Western Aeolians",
        description:
          "From Palermo along the Sicilian coast to Cefalù, then out to Alicudi and Filicudi, the smallest and least visited of the Aeolians.",
      },
      uk: {
        title: "Західні Еолійські острови",
        description:
          "Від Палермо вздовж сицилійського берега до Чефалу, а далі до Алікуді й Філікуді, найменших і найменш відвідуваних Еолійських островів.",
      },
      de: {
        title: "Westliche Äolische Inseln",
        description:
          "Von Palermo entlang der sizilianischen Küste nach Cefalù und weiter nach Alicudi und Filicudi, den kleinsten und am wenigsten besuchten der Gruppe.",
      },
      es: {
        title: "Eolias occidentales",
        description:
          "De Palermo por la costa siciliana hasta Cefalù y después a Alicudi y Filicudi, las más pequeñas y menos visitadas de las Eolias.",
      },
    },
    stops: [
      {
        name: "Palermo",
        lat: 38.13,
        lng: 13.3667,
        note: {
          en: "Check-in in a working city: markets, baroque churches and street food.",
          uk: "Реєстрація в живому місті: ринки, барокові церкви та вулична їжа.",
          de: "Check-in in einer lebendigen Stadt: Märkte, Barockkirchen und Street Food.",
          es: "Check-in en una ciudad viva: mercados, iglesias barrocas y comida callejera.",
        },
      },
      {
        name: "Cefalù",
        lat: 38.04,
        lng: 14.023,
        note: {
          en: "A Norman cathedral under a headland, with the old town at its foot.",
          uk: "Норманський собор під скелястим мисом, а біля підніжжя - старе місто.",
          de: "Eine normannische Kathedrale unter einem Felsvorsprung, die Altstadt zu ihren Füßen.",
          es: "Una catedral normanda bajo un promontorio, con el casco antiguo a sus pies.",
        },
      },
      {
        name: "Alicudi",
        lat: 38.5333,
        lng: 14.3667,
        note: {
          en: "No cars and no roads: goods still go up the steps by mule.",
          uk: "Ні автомобілів, ні доріг: вантажі досі підіймають сходами на мулах.",
          de: "Keine Autos, keine Straßen: Waren gehen noch per Maultier die Treppen hinauf.",
          es: "Sin coches ni carreteras: la carga aún sube las escaleras a lomos de mula.",
        },
      },
      {
        name: "Filicudi",
        lat: 38.5667,
        lng: 14.5667,
        note: {
          en: "A bronze-age village on the headland and a sea cave below it.",
          uk: "Поселення бронзової доби на мисі й морська печера під ним.",
          de: "Ein bronzezeitliches Dorf auf der Landzunge und darunter eine Meeresgrotte.",
          es: "Un poblado de la Edad del Bronce en el cabo y una cueva marina debajo.",
        },
      },
      {
        name: "Salina",
        lat: 38.5581,
        lng: 14.8725,
        note: {
          en: "Two extinct cones, vineyards between them and capers on every terrace.",
          uk: "Два згаслі вулканічні конуси, виноградники між ними й каперси на кожній терасі.",
          de: "Zwei erloschene Kegel, Weinberge dazwischen und Kapern auf jeder Terrasse.",
          es: "Dos conos apagados, viñedos entre ellos y alcaparras en cada terraza.",
        },
      },
      {
        name: "Lipari",
        lat: 38.4675,
        lng: 14.9536,
        note: {
          en: "The largest Aeolian, with a citadel above the harbour and white pumice quarries.",
          uk: "Найбільший з Еолійських островів: цитадель над гаванню й білі пемзові кар'єри.",
          de: "Die größte Äolische Insel, mit Zitadelle über dem Hafen und weißen Bimssteinbrüchen.",
          es: "La mayor de las Eolias, con ciudadela sobre el puerto y canteras blancas de piedra pómez.",
        },
      },
      {
        name: "Palermo",
        lat: 38.13,
        lng: 13.3667,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_es_mallorca_circuit",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Mallorca Circuit",
        description:
          "Around the island: Port d'Andratx, the Tramuntana mountains above Sóller, Pollença in the north and the national park at Cabrera in the south.",
      },
      uk: {
        title: "Коло Мальоркою",
        description:
          "Навколо острова: Порт-д'Андрач, гори Трамунтана над Сольєром, Польєнса на півночі та національний парк Кабрера на півдні.",
      },
      de: {
        title: "Mallorca-Rundtörn",
        description:
          "Rund um die Insel: Port d'Andratx, das Tramuntana-Gebirge über Sóller, Pollença im Norden und der Nationalpark Cabrera im Süden.",
      },
      es: {
        title: "Vuelta a Mallorca",
        description:
          "La vuelta a la isla: Port d'Andratx, la Tramuntana sobre Sóller, Pollença al norte y el parque nacional de Cabrera al sur.",
      },
    },
    stops: [
      {
        name: "Palma",
        lat: 39.56,
        lng: 2.63,
        note: {
          en: "Check-in under the cathedral, in the biggest sailing city in the Mediterranean.",
          uk: "Реєстрація під собором, у найбільшому вітрильному місті Середземномор'я.",
          de: "Check-in unter der Kathedrale, in der größten Segelstadt des Mittelmeers.",
          es: "Check-in bajo la catedral, en la mayor ciudad velera del Mediterráneo.",
        },
      },
      {
        name: "Andratx",
        lat: 39.545,
        lng: 2.3869,
        note: {
          en: "A working port at the island's south-west corner, where the mountains meet the sea.",
          uk: "Робочий порт на південно-західному куті острова, де гори сходять до моря.",
          de: "Ein Arbeitshafen an der Südwestecke der Insel, wo die Berge ans Meer treten.",
          es: "Un puerto de trabajo en el extremo suroeste de la isla, donde la montaña llega al mar.",
        },
      },
      {
        name: "Sóller",
        lat: 39.7958,
        lng: 2.6931,
        note: {
          en: "A round bay under the Tramuntana, with a wooden tram to the town.",
          uk: "Кругла затока під Трамунтаною, а до містечка ходить дерев'яний трамвай.",
          de: "Eine runde Bucht unter der Tramuntana, mit einer Holzstraßenbahn in den Ort.",
          es: "Una bahía redonda bajo la Tramuntana, con un tranvía de madera hasta el pueblo.",
        },
      },
      {
        name: "Pollença",
        lat: 39.9067,
        lng: 3.0819,
        note: {
          en: "The north-east bay, sheltered and shallow, with the Formentor cape beyond.",
          uk: "Північно-східна затока, захищена й мілка, а за нею - мис Форментор.",
          de: "Die Nordostbucht, geschützt und flach, dahinter das Kap Formentor.",
          es: "La bahía del noreste, resguardada y poco profunda, con el cabo Formentor más allá.",
        },
      },
      {
        name: "Cala Ratjada",
        lat: 39.7106,
        lng: 3.4633,
        note: {
          en: "A fishing port on the eastern tip, the jumping-off point for Menorca.",
          uk: "Рибальський порт на східному краю, звідки стартують на Менорку.",
          de: "Ein Fischerhafen an der Ostspitze, Absprungpunkt nach Menorca.",
          es: "Un puerto pesquero en la punta este, el punto de salida hacia Menorca.",
        },
      },
      {
        name: "Cabrera",
        lat: 39.15,
        lng: 2.9333,
        note: {
          en: "A national park: the number of boats allowed in each night is capped.",
          uk: "Національний парк: кількість яхт, які пускають на ніч, обмежена.",
          de: "Ein Nationalpark: Die Zahl der Boote pro Nacht ist begrenzt.",
          es: "Un parque nacional: el número de barcos admitidos cada noche está limitado.",
        },
      },
      {
        name: "Palma",
        lat: 39.56,
        lng: 2.63,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_es_mallorca_ibiza_and_formentera",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Mallorca, Ibiza and Formentera",
        description:
          "A Balearic crossing from Mallorca via Cabrera to Ibiza and Formentera, with a longer overnight passage. Plan it around the forecast rather than the calendar.",
      },
      uk: {
        title: "Мальорка, Ібіца і Форментера",
        description:
          "Балеарський перехід від Мальорки через Кабреру до Ібіци й Форментери, із довшим нічним переходом. Планувати варто за прогнозом, а не за календарем.",
      },
      de: {
        title: "Mallorca, Ibiza und Formentera",
        description:
          "Ein Balearen-Törn von Mallorca über Cabrera nach Ibiza und Formentera, mit einer längeren Nachtpassage. Planung nach dem Wetterbericht, nicht nach dem Kalender.",
      },
      es: {
        title: "Mallorca, Ibiza y Formentera",
        description:
          "Una travesía balear desde Mallorca, vía Cabrera, hasta Ibiza y Formentera, con un tramo nocturno más largo. Se planifica con el parte meteorológico, no con el calendario.",
      },
    },
    stops: [
      {
        name: "Palma",
        lat: 39.56,
        lng: 2.63,
        note: {
          en: "Check-in under the cathedral, in the biggest sailing city in the Mediterranean.",
          uk: "Реєстрація під собором, у найбільшому вітрильному місті Середземномор'я.",
          de: "Check-in unter der Kathedrale, in der größten Segelstadt des Mittelmeers.",
          es: "Check-in bajo la catedral, en la mayor ciudad velera del Mediterráneo.",
        },
      },
      {
        name: "Cabrera",
        lat: 39.15,
        lng: 2.9333,
        note: {
          en: "A national park: the number of boats allowed in each night is capped.",
          uk: "Національний парк: кількість яхт, які пускають на ніч, обмежена.",
          de: "Ein Nationalpark: Die Zahl der Boote pro Nacht ist begrenzt.",
          es: "Un parque nacional: el número de barcos admitidos cada noche está limitado.",
        },
      },
      {
        name: "Ibiza",
        lat: 38.9136,
        lng: 1.445,
        note: {
          en: "Check-in below the walls of Dalt Vila, the old town on the hill.",
          uk: "Реєстрація під мурами Дальт-Віли, старого міста на пагорбі.",
          de: "Check-in unterhalb der Mauern von Dalt Vila, der Altstadt auf dem Hügel.",
          es: "Check-in bajo las murallas de Dalt Vila, el casco antiguo sobre la colina.",
        },
      },
      {
        name: "Formentera",
        lat: 38.7339,
        lng: 1.4167,
        note: {
          en: "Anchor over sand, not seagrass: the meadows here are protected and patrolled.",
          uk: "Якір кидають на пісок, а не на морську траву: тутешні луки під охороною й патрулюються.",
          de: "Auf Sand ankern, nicht auf Seegras: Die Wiesen hier sind geschützt und werden kontrolliert.",
          es: "Fondear en arena, no sobre posidonia: las praderas están protegidas y vigiladas.",
        },
      },
      {
        name: "Ibiza",
        lat: 38.9136,
        lng: 1.445,
        note: {
          en: "Check-in below the walls of Dalt Vila, the old town on the hill.",
          uk: "Реєстрація під мурами Дальт-Віли, старого міста на пагорбі.",
          de: "Check-in unterhalb der Mauern von Dalt Vila, der Altstadt auf dem Hügel.",
          es: "Check-in bajo las murallas de Dalt Vila, el casco antiguo sobre la colina.",
        },
      },
      {
        name: "Palma",
        lat: 39.56,
        lng: 2.63,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_es_menorca_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Menorca Classic",
        description:
          "The quietest Balearic: the harbour at Mahón, the red cliffs of Cala Morell and the bay at Fornells, with beaches you reach only by boat.",
      },
      uk: {
        title: "Менорка",
        description:
          "Найтихіший із Балеарських островів: гавань Маона, червоні скелі Кала-Морель і затока Форнельс, а також пляжі, куди можна дістатися лише човном.",
      },
      de: {
        title: "Menorca",
        description:
          "Die ruhigste Baleareninsel: der Hafen von Mahón, die roten Klippen der Cala Morell und die Bucht von Fornells, dazu nur per Boot erreichbare Strände.",
      },
      es: {
        title: "Menorca",
        description:
          "La más tranquila de Baleares: el puerto de Mahón, los acantilados rojos de Cala Morell y la bahía de Fornells, con calas a las que solo se llega en barco.",
      },
    },
    stops: [
      {
        name: "Mahón",
        lat: 39.8886,
        lng: 4.2669,
        note: {
          en: "One of the deepest natural harbours in the world, five kilometres long.",
          uk: "Одна з найглибших природних гаваней світу, завдовжки п'ять кілометрів.",
          de: "Einer der tiefsten Naturhäfen der Welt, fünf Kilometer lang.",
          es: "Uno de los puertos naturales más profundos del mundo, de cinco kilómetros.",
        },
      },
      {
        name: "Binibeca",
        lat: 39.8167,
        lng: 4.2333,
        note: {
          en: "A village of white lanes built in the 1970s to look centuries older.",
          uk: "Селище з білих вуличок, збудоване в 1970-х так, ніби йому кілька століть.",
          de: "Ein Dorf weißer Gassen, in den 1970ern gebaut, um Jahrhunderte älter zu wirken.",
          es: "Un pueblo de callejuelas blancas construido en los años setenta para parecer secular.",
        },
      },
      {
        name: "Ciutadella",
        lat: 40,
        lng: 3.83,
        note: {
          en: "The old capital, entered through a long narrow inlet with quays on both sides.",
          uk: "Стара столиця, до якої заходять довгою вузькою бухтою з причалами обабіч.",
          de: "Die alte Hauptstadt, erreicht durch eine lange schmale Bucht mit Kais auf beiden Seiten.",
          es: "La antigua capital, a la que se entra por una cala larga y estrecha con muelles a ambos lados.",
        },
      },
      {
        name: "Cala Morell",
        lat: 40.0522,
        lng: 3.885,
        note: {
          en: "Red cliffs with prehistoric burial caves cut into them.",
          uk: "Червоні скелі з висіченими в них доісторичними похованнями.",
          de: "Rote Klippen mit hineingehauenen prähistorischen Grabhöhlen.",
          es: "Acantilados rojos con cuevas funerarias prehistóricas excavadas.",
        },
      },
      {
        name: "Fornells",
        lat: 40.0553,
        lng: 4.1339,
        note: {
          en: "A long sheltered inlet on the north coast, known for lobster stew.",
          uk: "Довга захищена бухта на північному березі, відома рагу з лобстера.",
          de: "Eine lange geschützte Bucht an der Nordküste, bekannt für Langusteneintopf.",
          es: "Una cala larga y resguardada en la costa norte, famosa por la caldereta de langosta.",
        },
      },
      {
        name: "Mahón",
        lat: 39.8886,
        lng: 4.2669,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_es_canary_islands_adventure",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Canary Islands Adventure",
        description:
          "Atlantic sailing between Tenerife, La Gomera, La Palma and El Hierro, in trade winds that blow all year. For an experienced crew.",
      },
      uk: {
        title: "Канарські острови",
        description:
          "Атлантичне плавання між Тенерифе, Ла-Гомерою, Ла-Пальмою та Ель-Єрро, у пасатах, які дмуть цілий рік. Для досвідченого екіпажу.",
      },
      de: {
        title: "Kanarische Inseln",
        description:
          "Atlantiksegeln zwischen Teneriffa, La Gomera, La Palma und El Hierro, im ganzjährigen Passat. Für eine erfahrene Crew.",
      },
      es: {
        title: "Islas Canarias",
        description:
          "Navegación atlántica entre Tenerife, La Gomera, La Palma y El Hierro, con alisios todo el año. Para tripulaciones con experiencia.",
      },
    },
    stops: [
      {
        name: "Tenerife",
        lat: 28.0181,
        lng: -16.6178,
        note: {
          en: "Check-in in the south of the island, where the trade wind is steadiest.",
          uk: "Реєстрація на півдні острова, де пасат найстабільніший.",
          de: "Check-in im Süden der Insel, wo der Passat am beständigsten weht.",
          es: "Check-in en el sur de la isla, donde el alisio es más constante.",
        },
      },
      {
        name: "La Gomera",
        lat: 28.0917,
        lng: -17.1097,
        note: {
          en: "Columbus's last stop before the Atlantic, with laurel forest above the port.",
          uk: "Остання зупинка Колумба перед Атлантикою, а над портом - лавровий ліс.",
          de: "Kolumbus' letzter Halt vor dem Atlantik, über dem Hafen der Lorbeerwald.",
          es: "La última escala de Colón antes del Atlántico, con laurisilva sobre el puerto.",
        },
      },
      {
        name: "La Palma",
        lat: 28.6833,
        lng: -17.7642,
        note: {
          en: "The steepest island of the group, and one of the darkest night skies anywhere.",
          uk: "Найкрутіший острів архіпелагу й одне з найтемніших нічних небес у світі.",
          de: "Die steilste Insel der Gruppe und einer der dunkelsten Nachthimmel überhaupt.",
          es: "La isla más escarpada del grupo y uno de los cielos nocturnos más oscuros del mundo.",
        },
      },
      {
        name: "El Hierro",
        lat: 27.6403,
        lng: -17.9803,
        note: {
          en: "The westernmost island, a biosphere reserve with clear water and few boats.",
          uk: "Найзахідніший острів, біосферний заповідник із прозорою водою й небагатьма яхтами.",
          de: "Die westlichste Insel, ein Biosphärenreservat mit klarem Wasser und wenigen Booten.",
          es: "La isla más occidental, reserva de la biosfera con aguas claras y pocos barcos.",
        },
      },
      {
        name: "Tenerife",
        lat: 28.0181,
        lng: -16.6178,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_no_hardangerfjord_classic",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Hardangerfjord Classic",
        description:
          "Orchards, waterfalls and the fjord arm to Eidfjord, from Bergen. Cool water, long light in summer and a forecast to watch every morning.",
      },
      uk: {
        title: "Хардангер-фіорд",
        description:
          "Сади, водоспади й рукав фіорду до Ейдфіорда, зі стартом у Бергені. Прохолодна вода, довгі літні дні й прогноз погоди, який перевіряють щоранку.",
      },
      de: {
        title: "Hardangerfjord",
        description:
          "Obstgärten, Wasserfälle und der Fjordarm nach Eidfjord, ab Bergen. Kühles Wasser, langes Sommerlicht und täglich ein Blick auf den Wetterbericht.",
      },
      es: {
        title: "Hardangerfjord",
        description:
          "Huertos, cascadas y el brazo del fiordo hasta Eidfjord, desde Bergen. Agua fría, luz larga en verano y un parte meteorológico que se mira cada mañana.",
      },
    },
    stops: [
      {
        name: "Bergen",
        lat: 60.395,
        lng: 5.31,
        note: {
          en: "A base for reaching the western fjords, with Bergen's Hanseatic Bryggen wharf among the city's main sights.",
          uk: "База для виходу до західних фіордів, а ганзейська набережна Брюгген — одна з головних пам'яток Бергена.",
          de: "Eine Basis für Törns in die Westfjorde, mit der hanseatischen Bryggen-Kaifront als einer der wichtigsten Sehenswürdigkeiten Bergens.",
          es: "Una base para navegar hacia los fiordos occidentales, con el muelle hanseático de Bryggen entre los principales atractivos de Bergen.",
        },
      },
      {
        name: "Hardangerfjord",
        lat: 60.3,
        lng: 6.2,
        note: {
          en: "Orchards on both shores: the fruit trees flower here in May.",
          uk: "Сади на обох берегах: фруктові дерева тут цвітуть у травні.",
          de: "Obstgärten an beiden Ufern: Die Bäume blühen hier im Mai.",
          es: "Huertos en ambas orillas: los frutales florecen aquí en mayo.",
        },
      },
      {
        name: "Rosendal",
        lat: 59.9903,
        lng: 6.0064,
        note: {
          en: "A small manor with a walled garden, at the foot of a glacier valley.",
          uk: "Невеликий маєток із садом за муром, біля підніжжя льодовикової долини.",
          de: "Ein kleines Herrenhaus mit Mauergarten am Fuß eines Gletschertals.",
          es: "Una pequeña casa señorial con jardín amurallado, al pie de un valle glaciar.",
        },
      },
      {
        name: "Lofthus",
        lat: 60.3306,
        lng: 6.66,
        note: {
          en: "Cherry orchards climbing the slope, with a waterfall behind the village.",
          uk: "Вишневі сади, що піднімаються схилом, і водоспад за селом.",
          de: "Kirschgärten den Hang hinauf, hinter dem Dorf ein Wasserfall.",
          es: "Cerezos que trepan por la ladera, con una cascada tras el pueblo.",
        },
      },
      {
        name: "Eidfjord",
        lat: 60.4675,
        lng: 7.07,
        note: {
          en: "The head of the fjord, where the mountains close in on both sides.",
          uk: "Вершина фіорду, де гори стискають його з обох боків.",
          de: "Das Ende des Fjords, wo die Berge von beiden Seiten heranrücken.",
          es: "El fondo del fiordo, donde las montañas se cierran por ambos lados.",
        },
      },
      {
        name: "Bergen",
        lat: 60.395,
        lng: 5.31,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_no_sognefjord_and_n_r_yfjord",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Sognefjord and Nærøyfjord",
        description:
          "The longest fjord in Norway and its narrowest arm, a UNESCO site barely 250 metres wide with walls a thousand metres high.",
      },
      uk: {
        title: "Согне-фіорд і Нерой-фіорд",
        description:
          "Найдовший фіорд Норвегії та його найвужчий рукав, об'єкт ЮНЕСКО завширшки ледь 250 метрів зі стінами заввишки тисячу метрів.",
      },
      de: {
        title: "Sognefjord und Nærøyfjord",
        description:
          "Der längste Fjord Norwegens und sein schmalster Arm, UNESCO-Welterbe, kaum 250 Meter breit bei tausend Meter hohen Wänden.",
      },
      es: {
        title: "Sognefjord y Nærøyfjord",
        description:
          "El fiordo más largo de Noruega y su brazo más estrecho, patrimonio de la UNESCO, de apenas 250 metros de ancho y paredes de mil metros.",
      },
    },
    stops: [
      {
        name: "Bergen",
        lat: 60.395,
        lng: 5.31,
        note: {
          en: "A base for reaching the western fjords, with Bergen's Hanseatic Bryggen wharf among the city's main sights.",
          uk: "База для виходу до західних фіордів, а ганзейська набережна Брюгген — одна з головних пам'яток Бергена.",
          de: "Eine Basis für Törns in die Westfjorde, mit der hanseatischen Bryggen-Kaifront als einer der wichtigsten Sehenswürdigkeiten Bergens.",
          es: "Una base para navegar hacia los fiordos occidentales, con el muelle hanseático de Bryggen entre los principales atractivos de Bergen.",
        },
      },
      {
        name: "Sognefjord",
        lat: 61.1,
        lng: 6.5,
        note: {
          en: "The longest and deepest fjord in Norway, 200 kilometres inland.",
          uk: "Найдовший і найглибший фіорд Норвегії, що йде на 200 кілометрів углиб.",
          de: "Der längste und tiefste Fjord Norwegens, 200 Kilometer landeinwärts.",
          es: "El fiordo más largo y profundo de Noruega, 200 kilómetros tierra adentro.",
        },
      },
      {
        name: "Balestrand",
        lat: 61.21,
        lng: 6.5375,
        note: {
          en: "Wooden villas on the north shore, built when the fjord first drew travellers.",
          uk: "Дерев'яні вілли на північному березі, збудовані, коли фіорд уперше привабив мандрівників.",
          de: "Holzvillen am Nordufer, erbaut, als der Fjord erstmals Reisende anzog.",
          es: "Villas de madera en la orilla norte, construidas cuando el fiordo empezó a atraer viajeros.",
        },
      },
      {
        name: "Flåm",
        lat: 60.8625,
        lng: 7.1133,
        note: {
          en: "The end of the branch fjord, and the foot of the mountain railway.",
          uk: "Кінець бічного фіорду й початок гірської залізниці.",
          de: "Das Ende des Seitenfjords und der Fuß der Bergbahn.",
          es: "El final del brazo del fiordo y el pie del ferrocarril de montaña.",
        },
      },
      {
        name: "Nærøyfjord",
        lat: 60.8747,
        lng: 6.8397,
        note: {
          en: "250 metres wide with walls a kilometre high, and on the UNESCO list.",
          uk: "Завширшки 250 метрів зі стінами заввишки кілометр, у списку ЮНЕСКО.",
          de: "250 Meter breit bei kilometerhohen Wänden, auf der UNESCO-Liste.",
          es: "250 metros de ancho con paredes de un kilómetro, en la lista de la UNESCO.",
        },
      },
      {
        name: "Bergen",
        lat: 60.395,
        lng: 5.31,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_no_lysefjord_and_ryfylke",
    difficulty: "advanced",
    /* No charter base within reach of the start, so the card links by region instead. */
    fallbackRegion: { country: "Norway", names: ["Northern Europe"] },
    copy: {
      en: {
        title: "Lysefjord and Ryfylke",
        description:
          "Under the Preikestolen cliff and past the abandoned village of Flørli, from Stavanger. Deep water and few anchorages, so berths are planned ahead.",
      },
      uk: {
        title: "Люсе-фіорд і Рюфюльке",
        description:
          "Під скелею Прейкестолен і повз покинуте селище Флерлі, зі стартом у Ставангері. Глибока вода й мало стоянок, тож місця бронюють заздалегідь.",
      },
      de: {
        title: "Lysefjord und Ryfylke",
        description:
          "Unter dem Preikestolen hindurch und vorbei am verlassenen Dorf Flørli, ab Stavanger. Tiefes Wasser und wenige Ankerplätze, Liegeplätze plant man vor.",
      },
      es: {
        title: "Lysefjord y Ryfylke",
        description:
          "Bajo el acantilado del Preikestolen y pasando el pueblo abandonado de Flørli, desde Stavanger. Agua profunda y pocos fondeaderos: los amarres se reservan antes.",
      },
    },
    stops: [
      {
        name: "Stavanger",
        lat: 58.974,
        lng: 5.73,
        note: {
          en: "Check-in in the old town of white wooden houses, on the way to Lysefjord.",
          uk: "Реєстрація в старому місті з білих дерев'яних будинків, дорогою до Люсе-фіорду.",
          de: "Check-in in der Altstadt aus weißen Holzhäusern, auf dem Weg zum Lysefjord.",
          es: "Check-in en el casco antiguo de casas blancas de madera, camino del Lysefjord.",
        },
      },
      {
        name: "Lysefjord",
        lat: 59.0333,
        lng: 6.3,
        note: {
          en: "Forty kilometres of near-vertical rock, with water too deep to anchor in.",
          uk: "Сорок кілометрів майже прямовисної скелі, а вода тут надто глибока для якоря.",
          de: "Vierzig Kilometer nahezu senkrechter Fels, mit Wasser zu tief zum Ankern.",
          es: "Cuarenta kilómetros de roca casi vertical, con agua demasiado profunda para fondear.",
        },
      },
      {
        name: "Preikestolen",
        lat: 58.9864,
        lng: 6.19,
        note: {
          en: "The Pulpit Rock stands 600 metres above the water, flat as a table.",
          uk: "Скеля Прекестулен здіймається на 600 метрів над водою й рівна, як стіл.",
          de: "Der Preikestolen steht 600 Meter über dem Wasser, flach wie ein Tisch.",
          es: "El Púlpito se alza 600 metros sobre el agua, plano como una mesa.",
        },
      },
      {
        name: "Flørli",
        lat: 59,
        lng: 6.4167,
        note: {
          en: "A wooden staircase of 4,444 steps climbs beside the old power station.",
          uk: "Поруч зі старою електростанцією вгору веде дерев'яна драбина на 4444 сходинки.",
          de: "Eine Holztreppe mit 4.444 Stufen führt neben dem alten Kraftwerk hinauf.",
          es: "Una escalera de madera de 4.444 peldaños sube junto a la vieja central eléctrica.",
        },
      },
      {
        name: "Ryfylke",
        lat: 59.1,
        lng: 6.1,
        note: {
          en: "The sheltered island belt outside the fjord, with quiet guest harbours.",
          uk: "Захищений пояс островів за фіордом, із тихими гостьовими гаванями.",
          de: "Der geschützte Inselgürtel vor dem Fjord, mit ruhigen Gasthäfen.",
          es: "El cinturón de islas resguardadas fuera del fiordo, con puertos deportivos tranquilos.",
        },
      },
      {
        name: "Stavanger",
        lat: 58.974,
        lng: 5.73,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_no_geiranger_and_sunnm_re",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Geiranger and Sunnmøre",
        description:
          "From Ålesund into the Hjørundfjord under the Sunnmøre Alps and up the Geirangerfjord to the Seven Sisters waterfall.",
      },
      uk: {
        title: "Гейрангер і Суннмере",
        description:
          "Від Олесунна в Йорунн-фіорд під Суннмерськими Альпами й далі Гейрангер-фіордом до водоспаду Сім сестер.",
      },
      de: {
        title: "Geiranger und Sunnmøre",
        description:
          "Von Ålesund in den Hjørundfjord unter den Sunnmøre-Alpen und weiter den Geirangerfjord hinauf zum Wasserfall Sieben Schwestern.",
      },
      es: {
        title: "Geiranger y Sunnmøre",
        description:
          "De Ålesund al Hjørundfjord bajo los Alpes de Sunnmøre y después el Geirangerfjord hasta la cascada de las Siete Hermanas.",
      },
    },
    stops: [
      {
        name: "Ålesund",
        lat: 62.4722,
        lng: 6.155,
        note: {
          en: "Rebuilt in art nouveau after the 1904 fire, and it shows on every street.",
          uk: "Відбудоване в стилі модерн після пожежі 1904 року, і це видно на кожній вулиці.",
          de: "Nach dem Brand von 1904 im Jugendstil wiederaufgebaut, in jeder Straße sichtbar.",
          es: "Reconstruida en art nouveau tras el incendio de 1904, y se nota en cada calle.",
        },
      },
      {
        name: "Hjørundfjord",
        lat: 62.2333,
        lng: 6.4333,
        note: {
          en: "The Sunnmøre Alps come straight down to the water on both sides.",
          uk: "Суннмерські Альпи спускаються просто до води з обох боків.",
          de: "Die Sunnmøre-Alpen fallen beidseitig direkt ins Wasser ab.",
          es: "Los Alpes de Sunnmøre caen directamente al agua por ambos lados.",
        },
      },
      {
        name: "Geirangerfjord",
        lat: 62.1008,
        lng: 7.2056,
        note: {
          en: "The Seven Sisters waterfall drops 250 metres straight into the fjord.",
          uk: "Водоспад Сім сестер падає з 250 метрів просто у фіорд.",
          de: "Der Wasserfall Sieben Schwestern stürzt 250 Meter direkt in den Fjord.",
          es: "La cascada de las Siete Hermanas cae 250 metros directamente al fiordo.",
        },
      },
      {
        name: "Ålesund",
        lat: 62.4722,
        lng: 6.155,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_fr_french_riviera_classic",
    difficulty: "moderate",
    copy: {
      en: {
        title: "French Riviera Classic",
        description:
          "Antibes, Cannes and the monastery island of Saint-Honorat, then Saint-Tropez and the national park at Porquerolles.",
      },
      uk: {
        title: "Французька Рив'єра",
        description:
          "Антіб, Канни й монастирський острів Сент-Онора, далі Сен-Тропе та національний парк Поркероль.",
      },
      de: {
        title: "Côte d'Azur",
        description:
          "Antibes, Cannes und die Klosterinsel Saint-Honorat, danach Saint-Tropez und der Nationalpark von Porquerolles.",
      },
      es: {
        title: "Costa Azul",
        description:
          "Antibes, Cannes y la isla monástica de Saint-Honorat, después Saint-Tropez y el parque nacional de Porquerolles.",
      },
    },
    stops: [
      {
        name: "Antibes",
        lat: 43.585,
        lng: 7.1283,
        note: {
          en: "Check-in in Port Vauban, where the largest yachts on the coast lie.",
          uk: "Реєстрація в Пор-Вобані, де стоять найбільші яхти узбережжя.",
          de: "Check-in in Port Vauban, wo die größten Yachten der Küste liegen.",
          es: "Check-in en Port Vauban, donde amarran los mayores yates de la costa.",
        },
      },
      {
        name: "Cannes",
        lat: 43.55,
        lng: 7.02,
        note: {
          en: "The Croisette from the water, and an anchorage off the film festival quay.",
          uk: "Круазет із води й якірна стоянка навпроти причалу кінофестивалю.",
          de: "Die Croisette vom Wasser aus, und ein Ankerplatz vor dem Festivalkai.",
          es: "La Croisette desde el agua y un fondeadero frente al muelle del festival.",
        },
      },
      {
        name: "Îles de Lérins",
        lat: 43.5167,
        lng: 7.05,
        note: {
          en: "Two islands twenty minutes off Cannes: a monastery on one, a prison fort on the other.",
          uk: "Два острови за двадцять хвилин від Канн: на одному монастир, на іншому форт-в'язниця.",
          de: "Zwei Inseln zwanzig Minuten vor Cannes: auf der einen ein Kloster, auf der anderen ein Gefängnisfort.",
          es: "Dos islas a veinte minutos de Cannes: en una un monasterio, en otra un fuerte prisión.",
        },
      },
      {
        name: "Saint-Raphaël",
        lat: 43.423,
        lng: 6.77,
        note: {
          en: "The red rock of the Esterel massif runs down to the sea beside the port.",
          uk: "Червона скеля масиву Естерель спускається до моря поруч із портом.",
          de: "Der rote Fels des Esterel-Massivs reicht neben dem Hafen bis ans Meer.",
          es: "La roca roja del macizo del Esterel baja hasta el mar junto al puerto.",
        },
      },
      {
        name: "Saint-Tropez",
        lat: 43.2725,
        lng: 6.64,
        note: {
          en: "A fishing village that never quite stopped being one, behind the superyacht quay.",
          uk: "Рибальське село, яке так і не перестало ним бути, за причалом суперяхт.",
          de: "Ein Fischerdorf, das nie ganz aufhörte eines zu sein, hinter dem Superyacht-Kai.",
          es: "Un pueblo pesquero que nunca dejó de serlo del todo, tras el muelle de superyates.",
        },
      },
      {
        name: "Porquerolles",
        lat: 43,
        lng: 6.2033,
        note: {
          en: "A national park island: no cars, and a village square with plane trees.",
          uk: "Острів національного парку: без автомобілів, із сільською площею під платанами.",
          de: "Eine Nationalparkinsel: keine Autos, ein Dorfplatz mit Platanen.",
          es: "Una isla de parque nacional: sin coches y con una plaza de plátanos.",
        },
      },
      {
        name: "Antibes",
        lat: 43.585,
        lng: 7.1283,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_fr_south_corsica_and_lavezzi",
    difficulty: "moderate",
    copy: {
      en: {
        title: "South Corsica and Lavezzi",
        description:
          "The cliffs under Bonifacio, the granite islets of Lavezzi and the beaches around Porto-Vecchio, with the Strait of Bonifacio to time carefully.",
      },
      uk: {
        title: "Південна Корсика і Лавеці",
        description:
          "Скелі під Боніфачо, гранітні острівці Лавеці та пляжі навколо Порто-Веккіо; час проходження протоки Боніфачо варто ретельно планувати.",
      },
      de: {
        title: "Südkorsika und Lavezzi",
        description:
          "Die Klippen unter Bonifacio, die Granitinseln von Lavezzi und die Strände um Porto-Vecchio, wobei die Straße von Bonifacio gutes Timing verlangt.",
      },
      es: {
        title: "Córcega del Sur y Lavezzi",
        description:
          "Los acantilados bajo Bonifacio, los islotes de granito de Lavezzi y las playas de Porto-Vecchio, con un estrecho de Bonifacio que hay que cronometrar.",
      },
    },
    stops: [
      {
        name: "Ajaccio",
        lat: 41.9192,
        lng: 8.7386,
        note: {
          en: "Check-in in Napoleon's birthplace, at the head of a wide gulf.",
          uk: "Реєстрація на батьківщині Наполеона, у глибині широкої затоки.",
          de: "Check-in in Napoleons Geburtsstadt, am Ende eines weiten Golfs.",
          es: "Check-in en la ciudad natal de Napoleón, al fondo de un amplio golfo.",
        },
      },
      {
        name: "Campomoro",
        lat: 41.6433,
        lng: 8.8014,
        note: {
          en: "A wide sandy bay with a Genoese tower on the point.",
          uk: "Широка піщана затока з генуезькою вежею на мисі.",
          de: "Eine weite Sandbucht mit einem genuesischen Turm auf der Landspitze.",
          es: "Una amplia bahía de arena con una torre genovesa en la punta.",
        },
      },
      {
        name: "Bonifacio",
        lat: 41.3872,
        lng: 9.1592,
        note: {
          en: "The harbour hides in a cleft under limestone cliffs, almost invisible from the sea.",
          uk: "Гавань ховається в розколині під вапняковими скелями, з моря її майже не видно.",
          de: "Der Hafen versteckt sich in einer Spalte unter Kalksteinfelsen und ist von See kaum zu erkennen.",
          es: "El puerto se esconde en una grieta bajo acantilados de caliza y apenas se distingue desde el mar.",
        },
      },
      {
        name: "Lavezzi Islands",
        lat: 41.335,
        lng: 9.255,
        note: {
          en: "Granite boulders and sandy pools in a reserve; the strait needs settled weather.",
          uk: "Гранітні валуни й піщані затоки в заповіднику, а протока потребує спокійної погоди.",
          de: "Granitblöcke und sandige Becken in einem Reservat; die Meerenge verlangt ruhiges Wetter.",
          es: "Bloques de granito y pozas de arena en una reserva; el estrecho exige buen tiempo.",
        },
      },
      {
        name: "Porto-Vecchio",
        lat: 41.59,
        lng: 9.285,
        note: {
          en: "A walled town above a long inlet, with Palombaggia's beaches to the south.",
          uk: "Обнесене мурами місто над довгою бухтою, а на південь - пляжі Паломбаджа.",
          de: "Eine ummauerte Stadt über einer langen Bucht, südlich die Strände von Palombaggia.",
          es: "Una ciudad amurallada sobre una cala larga, con las playas de Palombaggia al sur.",
        },
      },
      {
        name: "Ajaccio",
        lat: 41.9192,
        lng: 8.7386,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_fr_iles_d_hyeres_classic",
    difficulty: "easy",
    copy: {
      en: {
        title: "Îles d'Hyères Classic",
        description:
          "Porquerolles, Port-Cros and the Île du Levant, three protected islands an hour or two apart, from Toulon.",
      },
      uk: {
        title: "Ієрські острови",
        description:
          "Поркероль, Пор-Крос та Іль-дю-Леван, три заповідні острови за годину-дві переходу один від одного, зі стартом у Тулоні.",
      },
      de: {
        title: "Îles d'Hyères",
        description:
          "Porquerolles, Port-Cros und die Île du Levant, drei geschützte Inseln ein bis zwei Stunden voneinander entfernt, ab Toulon.",
      },
      es: {
        title: "Islas de Hyères",
        description:
          "Porquerolles, Port-Cros y la Île du Levant, tres islas protegidas a una o dos horas entre sí, desde Tolón.",
      },
    },
    stops: [
      {
        name: "Toulon",
        lat: 43.12,
        lng: 5.93,
        note: {
          en: "Check-in in a naval city, with the Hyères islands an easy first leg.",
          uk: "Реєстрація у військово-морському місті, а Ієрські острови - легкий перший перехід.",
          de: "Check-in in einer Marinestadt, die Îles d'Hyères sind ein leichter erster Schlag.",
          es: "Check-in en una ciudad naval, con las islas de Hyères como primera etapa fácil.",
        },
      },
      {
        name: "Porquerolles",
        lat: 43,
        lng: 6.2033,
        note: {
          en: "A national park island: no cars, and a village square with plane trees.",
          uk: "Острів національного парку: без автомобілів, із сільською площею під платанами.",
          de: "Eine Nationalparkinsel: keine Autos, ein Dorfplatz mit Platanen.",
          es: "Una isla de parque nacional: sin coches y con una plaza de plátanos.",
        },
      },
      {
        name: "Port-Cros",
        lat: 43.0053,
        lng: 6.3903,
        note: {
          en: "France's oldest marine national park, with an underwater trail off the beach.",
          uk: "Найстаріший морський національний парк Франції з підводною стежкою біля пляжу.",
          de: "Frankreichs ältester Meeresnationalpark, mit einem Unterwasserpfad vor dem Strand.",
          es: "El parque nacional marino más antiguo de Francia, con un sendero submarino junto a la playa.",
        },
      },
      {
        name: "Île du Levant",
        lat: 43.0333,
        lng: 6.4667,
        note: {
          en: "Nine tenths of the island is military ground; the rest is a naturist village.",
          uk: "Дев'ять десятих острова - військова зона, решта - натуристське селище.",
          de: "Neun Zehntel der Insel sind Militärgelände; der Rest ist ein Naturistendorf.",
          es: "Nueve décimas partes de la isla son terreno militar; el resto, un pueblo naturista.",
        },
      },
      {
        name: "Bormes-les-Mimosas",
        lat: 43.1256,
        lng: 6.3639,
        note: {
          en: "A marina under a hill village that flowers yellow in February.",
          uk: "Марина під селом на пагорбі, яке в лютому жовтіє від мімози.",
          de: "Eine Marina unter einem Hügeldorf, das im Februar gelb blüht.",
          es: "Una marina bajo un pueblo en la colina que florece amarillo en febrero.",
        },
      },
      {
        name: "Toulon",
        lat: 43.12,
        lng: 5.93,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_fr_cap_corse_classic",
    difficulty: "advanced",
    /* No charter base within reach of the start, so the card links by region instead. */
    fallbackRegion: { country: "France", names: ["Corsica"] },
    copy: {
      en: {
        title: "Cap Corse Classic",
        description:
          "Round the northern cape from Bastia: the harbour at Macinaggio, the old tower at Centuri and the white sand of Saleccia in the Agriates desert.",
      },
      uk: {
        title: "Кап-Корс",
        description:
          "Навколо північного мису від Бастії: гавань Масінаджо, стара вежа Сантурі та білий пісок Салекки в пустелі Аґріат.",
      },
      de: {
        title: "Cap Corse",
        description:
          "Um das Nordkap ab Bastia: der Hafen von Macinaggio, der alte Turm von Centuri und der weiße Sand von Saleccia in der Agriate-Wüste.",
      },
      es: {
        title: "Cap Corse",
        description:
          "Rodeando el cabo norte desde Bastia: el puerto de Macinaggio, la torre de Centuri y la arena blanca de Saleccia, en el desierto de los Agriates.",
      },
    },
    stops: [
      {
        name: "Bastia",
        lat: 42.7,
        lng: 9.452,
        note: {
          en: "Check-in in the old port, with the Tuscan islands across the channel.",
          uk: "Реєстрація в старому порту, а через протоку - тосканські острови.",
          de: "Check-in im alten Hafen, jenseits des Kanals die toskanischen Inseln.",
          es: "Check-in en el puerto viejo, con las islas toscanas al otro lado del canal.",
        },
      },
      {
        name: "Macinaggio",
        lat: 42.9617,
        lng: 9.4525,
        note: {
          en: "The last harbour before the cape, and the start of the coastal path.",
          uk: "Остання гавань перед мисом і початок прибережної стежки.",
          de: "Der letzte Hafen vor dem Kap und der Beginn des Küstenwegs.",
          es: "El último puerto antes del cabo y el inicio del sendero costero.",
        },
      },
      {
        name: "Centuri",
        lat: 42.9667,
        lng: 9.36,
        note: {
          en: "A tiny stone harbour on the west side, known for its lobster.",
          uk: "Крихітна кам'яна гавань на західному боці, відома своїм лобстером.",
          de: "Ein winziger Steinhafen an der Westseite, bekannt für seinen Hummer.",
          es: "Un diminuto puerto de piedra en el lado oeste, famoso por su langosta.",
        },
      },
      {
        name: "Saint-Florent",
        lat: 42.6817,
        lng: 9.3033,
        note: {
          en: "A bay between the vineyards of Patrimonio and the Agriates desert.",
          uk: "Затока між виноградниками Патрімоніо й пустелею Аґріат.",
          de: "Eine Bucht zwischen den Weinbergen von Patrimonio und der Agriate-Wüste.",
          es: "Una bahía entre los viñedos de Patrimonio y el desierto de los Agriates.",
        },
      },
      {
        name: "Saleccia",
        lat: 42.7269,
        lng: 9.2072,
        note: {
          en: "White sand reachable only by boat or an hour's track across the scrub.",
          uk: "Білий пісок, до якого можна дістатися лише морем або годиною дороги через чагарі.",
          de: "Weißer Sand, erreichbar nur per Boot oder eine Stunde Piste durch die Macchia.",
          es: "Arena blanca a la que solo se llega en barco o por una hora de pista entre el matorral.",
        },
      },
      {
        name: "Bastia",
        lat: 42.7,
        lng: 9.452,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_car_grenadines_island_hopping",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Grenadines Island Hopping",
        description:
          "Bequia, Mustique and the reef anchorage at Tobago Cays, where the boats lie behind a horseshoe of coral with turtles in the shallows.",
      },
      uk: {
        title: "Гренадини",
        description:
          "Бекія, Мюстік і рифова стоянка Тобаго-Кейс, де яхти стоять за підковою коралів, а на мілині плавають черепахи.",
      },
      de: {
        title: "Grenadinen",
        description:
          "Bequia, Mustique und der Riffankerplatz der Tobago Cays, wo die Boote hinter einem Korallenhufeisen liegen und Schildkröten im Flachen schwimmen.",
      },
      es: {
        title: "Granadinas",
        description:
          "Bequia, Mustique y el fondeadero de arrecife de Tobago Cays, donde los barcos quedan tras una herradura de coral con tortugas en los bajos.",
      },
    },
    stops: [
      {
        name: "St Vincent",
        lat: 13.13,
        lng: -61.18,
        note: {
          en: "Check-in at Blue Lagoon, the base for the run south.",
          uk: "Реєстрація в Блу-Лагун, це база для переходу на південь.",
          de: "Check-in in Blue Lagoon, der Basis für den Weg nach Süden.",
          es: "Check-in en Blue Lagoon, la base para bajar hacia el sur.",
        },
      },
      {
        name: "Bequia",
        lat: 13.0072,
        lng: -61.2403,
        note: {
          en: "A boatbuilding island; the harbour walk runs from the town to Princess Margaret Beach.",
          uk: "Острів суднобудівників, а прогулянкова стежка веде від міста до пляжу Принцеси Маргарет.",
          de: "Eine Bootsbauinsel; der Hafenweg führt vom Ort zum Princess Margaret Beach.",
          es: "Una isla de constructores de barcos; el paseo del puerto lleva a Princess Margaret Beach.",
        },
      },
      {
        name: "Mustique",
        lat: 12.8833,
        lng: -61.1833,
        note: {
          en: "A private island with a fixed number of moorings and a famous beach bar.",
          uk: "Приватний острів із обмеженою кількістю бочок і відомим пляжним баром.",
          de: "Eine Privatinsel mit fester Zahl an Muringbojen und einer berühmten Strandbar.",
          es: "Una isla privada con un número fijo de amarres y un chiringuito famoso.",
        },
      },
      {
        name: "Canouan",
        lat: 12.705,
        lng: -61.335,
        note: {
          en: "A quiet island halfway down the chain, with a reef along its windward side.",
          uk: "Тихий острів посередині ланцюга, з рифом уздовж навітряного боку.",
          de: "Eine ruhige Insel auf halbem Weg, mit einem Riff an der Luvseite.",
          es: "Una isla tranquila a mitad de la cadena, con arrecife en su costa de barlovento.",
        },
      },
      {
        name: "Tobago Cays",
        lat: 12.6333,
        lng: -61.35,
        note: {
          en: "Five uninhabited islets behind a horseshoe reef, with turtles in the shallows.",
          uk: "П'ять безлюдних острівців за підковою рифу, а на мілині - черепахи.",
          de: "Fünf unbewohnte Eilande hinter einem Hufeisenriff, Schildkröten im Flachen.",
          es: "Cinco islotes deshabitados tras un arrecife en herradura, con tortugas en los bajos.",
        },
      },
      {
        name: "Union Island",
        lat: 12.5975,
        lng: -61.4125,
        note: {
          en: "Clifton's harbour is the clearance point for the southern Grenadines.",
          uk: "Гавань Кліфтона - місце прикордонного оформлення для південних Гренадин.",
          de: "Cliftons Hafen ist die Klarierungsstelle für die südlichen Grenadinen.",
          es: "El puerto de Clifton es el punto de despacho para las Granadinas del sur.",
        },
      },
      {
        name: "St Vincent",
        lat: 13.13,
        lng: -61.18,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_car_st_martin_anguilla_and_st_barth",
    difficulty: "moderate",
    copy: {
      en: {
        title: "St Martin, Anguilla and St Barth",
        description:
          "Three flags in a week: Dutch and French St Martin, the beaches of Anguilla and the harbour at Gustavia. Clearance at each border.",
      },
      uk: {
        title: "Сен-Мартен, Ангілья, Сен-Бартелемі",
        description:
          "Три прапори за тиждень: нідерландський і французький Сен-Мартен, пляжі Ангільї та гавань Гюставії. На кожному кордоні потрібне оформлення.",
      },
      de: {
        title: "St. Martin, Anguilla und St. Barth",
        description:
          "Drei Flaggen in einer Woche: der niederländische und der französische Teil von St. Martin, die Strände Anguillas und der Hafen von Gustavia. An jeder Grenze wird eingeklariert.",
      },
      es: {
        title: "San Martín, Anguila y San Bartolomé",
        description:
          "Tres banderas en una semana: San Martín neerlandés y francés, las playas de Anguila y el puerto de Gustavia. Hay despacho en cada frontera.",
      },
    },
    stops: [
      {
        name: "St Martin",
        lat: 18.0333,
        lng: -63.0833,
        note: {
          en: "Check-in in Simpson Bay, on an island split between France and the Netherlands.",
          uk: "Реєстрація в Сімпсон-Бей, на острові, поділеному між Францією та Нідерландами.",
          de: "Check-in in Simpson Bay, auf einer zwischen Frankreich und den Niederlanden geteilten Insel.",
          es: "Check-in en Simpson Bay, en una isla repartida entre Francia y los Países Bajos.",
        },
      },
      {
        name: "Anguilla",
        lat: 18.19,
        lng: -63.093,
        note: {
          en: "Low, dry and edged with white beaches; clearance is at Road Bay.",
          uk: "Низький, сухий, обрамлений білими пляжами, а оформлення - у Роуд-Бей.",
          de: "Flach, trocken und von weißen Stränden gesäumt; Klarierung in Road Bay.",
          es: "Baja, seca y bordeada de playas blancas; el despacho es en Road Bay.",
        },
      },
      {
        name: "Tintamarre",
        lat: 18.1181,
        lng: -62.9769,
        note: {
          en: "An uninhabited island off the French side, with a wide sandy bay.",
          uk: "Безлюдний острів біля французького боку, з широкою піщаною затокою.",
          de: "Eine unbewohnte Insel vor der französischen Seite, mit weiter Sandbucht.",
          es: "Una isla deshabitada frente al lado francés, con una amplia bahía de arena.",
        },
      },
      {
        name: "St Barth",
        lat: 17.8967,
        lng: -62.8503,
        note: {
          en: "Gustavia's small harbour, expensive and worth an evening ashore.",
          uk: "Невелика гавань Гюставії - дорога, але варта вечора на березі.",
          de: "Gustavias kleiner Hafen, teuer und einen Abend an Land wert.",
          es: "El pequeño puerto de Gustavia, caro y digno de una noche en tierra.",
        },
      },
      {
        name: "Île Fourchue",
        lat: 17.9814,
        lng: -62.9083,
        note: {
          en: "A bare volcanic island with goats, a bay and nothing else.",
          uk: "Голий вулканічний острів із козами, затокою й більше нічим.",
          de: "Eine kahle Vulkaninsel mit Ziegen, einer Bucht und sonst nichts.",
          es: "Una isla volcánica pelada con cabras, una bahía y nada más.",
        },
      },
      {
        name: "St Martin",
        lat: 18.0333,
        lng: -63.0833,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_car_antigua_and_barbuda",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Antigua and Barbuda",
        description:
          "From Nelson's Dockyard round to Green Island and Great Bird, then the crossing to Barbuda and its seventeen kilometres of empty pink sand.",
      },
      uk: {
        title: "Антигуа і Барбуда",
        description:
          "Від Нельсонової верфі до Грін-Айленда й Грейт-Берд, далі перехід на Барбуду з її сімнадцятьма кілометрами порожнього рожевого піску.",
      },
      de: {
        title: "Antigua und Barbuda",
        description:
          "Von Nelson's Dockyard nach Green Island und Great Bird, danach der Schlag nach Barbuda mit siebzehn Kilometern leerem rosa Sand.",
      },
      es: {
        title: "Antigua y Barbuda",
        description:
          "De Nelson's Dockyard a Green Island y Great Bird, y luego la travesía a Barbuda y sus diecisiete kilómetros de arena rosa vacía.",
      },
    },
    stops: [
      {
        name: "English Harbour",
        lat: 17.0056,
        lng: -61.7639,
        note: {
          en: "Nelson's Dockyard is a working Georgian naval yard, still in use.",
          uk: "Нельсонова верф - діюча георгіанська військово-морська верф, якою й досі користуються.",
          de: "Nelson's Dockyard ist eine georgianische Marinewerft, bis heute in Betrieb.",
          es: "Nelson's Dockyard es un astillero naval georgiano todavía en uso.",
        },
      },
      {
        name: "Green Island",
        lat: 17.0672,
        lng: -61.66,
        note: {
          en: "A reef-protected anchorage on the east coast, with no road to it.",
          uk: "Захищена рифом стоянка на східному березі, куди не веде дорога.",
          de: "Ein riffgeschützter Ankerplatz an der Ostküste, ohne Straßenzugang.",
          es: "Un fondeadero protegido por arrecife en la costa este, sin carretera.",
        },
      },
      {
        name: "Great Bird Island",
        lat: 17.1436,
        lng: -61.7264,
        note: {
          en: "A small nature reserve with frigate birds overhead and a short cliff walk.",
          uk: "Невеликий заповідник із фрегатами в небі й короткою стежкою по скелі.",
          de: "Ein kleines Naturreservat mit Fregattvögeln über einem kurzen Klippenweg.",
          es: "Una pequeña reserva natural con fragatas en el cielo y un corto paseo por el acantilado.",
        },
      },
      {
        name: "Barbuda",
        lat: 17.6333,
        lng: -61.8333,
        note: {
          en: "Seventeen kilometres of pink sand with almost nobody on it.",
          uk: "Сімнадцять кілометрів рожевого піску, на якому майже нікого.",
          de: "Siebzehn Kilometer rosa Sand, auf dem fast niemand ist.",
          es: "Diecisiete kilómetros de arena rosa en los que casi no hay nadie.",
        },
      },
      {
        name: "Jolly Harbour",
        lat: 17.0667,
        lng: -61.8869,
        note: {
          en: "A sheltered marina on the west coast, the last stop before check-out.",
          uk: "Захищена марина на західному березі, остання зупинка перед здачею яхти.",
          de: "Eine geschützte Marina an der Westküste, letzter Halt vor dem Check-out.",
          es: "Una marina resguardada en la costa oeste, última parada antes del check-out.",
        },
      },
      {
        name: "English Harbour",
        lat: 17.0056,
        lng: -61.7639,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_car_martinique_and_st_lucia",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Martinique and St Lucia",
        description:
          "South from Le Marin to Rodney Bay, the narrow inlet at Marigot and an anchorage under the Pitons. One border crossing each way.",
      },
      uk: {
        title: "Мартиніка і Сент-Люсія",
        description:
          "На південь від Ле-Марена до Родні-Бей, вузька бухта Маріго та стоянка під Пітонами. По одному перетину кордону в кожен бік.",
      },
      de: {
        title: "Martinique und St. Lucia",
        description:
          "Südwärts von Le Marin nach Rodney Bay, die enge Bucht von Marigot und ein Ankerplatz unter den Pitons. Je eine Grenze pro Richtung.",
      },
      es: {
        title: "Martinica y Santa Lucía",
        description:
          "Al sur de Le Marin hasta Rodney Bay, la angosta ensenada de Marigot y un fondeo bajo los Pitons. Una frontera en cada sentido.",
      },
    },
    stops: [
      {
        name: "Le Marin",
        lat: 14.469,
        lng: -60.869,
        note: {
          en: "Check-in in the largest charter harbour in the eastern Caribbean.",
          uk: "Реєстрація в найбільшій чартерній гавані східних Карибів.",
          de: "Check-in im größten Charterhafen der östlichen Karibik.",
          es: "Check-in en el mayor puerto chárter del Caribe oriental.",
        },
      },
      {
        name: "Sainte-Anne",
        lat: 14.4361,
        lng: -60.8811,
        note: {
          en: "A wide anchorage off a village beach, twenty minutes from the base.",
          uk: "Простора стоянка біля сільського пляжу, за двадцять хвилин від бази.",
          de: "Ein weiter Ankerplatz vor einem Dorfstrand, zwanzig Minuten von der Basis.",
          es: "Un amplio fondeadero frente a la playa del pueblo, a veinte minutos de la base.",
        },
      },
      {
        name: "Rodney Bay",
        lat: 14.0742,
        lng: -60.95,
        note: {
          en: "The clearance harbour for Saint Lucia, under Pigeon Island's old fort.",
          uk: "Гавань оформлення для Сент-Люсії, під старим фортом на Піджен-Айленді.",
          de: "Der Klarierungshafen von St. Lucia, unter dem alten Fort von Pigeon Island.",
          es: "El puerto de despacho de Santa Lucía, bajo el viejo fuerte de Pigeon Island.",
        },
      },
      {
        name: "Marigot Bay",
        lat: 13.9667,
        lng: -61.025,
        note: {
          en: "A hurricane hole so narrow the entrance is invisible until you are in it.",
          uk: "Укриття від ураганів настільки вузьке, що вхід видно лише зсередини.",
          de: "Ein Hurrikanloch, so eng, dass die Einfahrt erst drinnen sichtbar wird.",
          es: "Un refugio de huracanes tan estrecho que la entrada no se ve hasta estar dentro.",
        },
      },
      {
        name: "Soufrière/Pitons",
        lat: 13.857,
        lng: -61.06,
        note: {
          en: "Moorings between the two volcanic peaks, with the reef dropping away below.",
          uk: "Швартові бочки між двома вулканічними піками, а під ними риф іде в глибину.",
          de: "Muringbojen zwischen den beiden Vulkangipfeln, darunter fällt das Riff ab.",
          es: "Amarres entre los dos picos volcánicos, con el arrecife cayendo justo debajo.",
        },
      },
      {
        name: "Le Marin",
        lat: 14.469,
        lng: -60.869,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_sc_praslin_curieuse_cousin_and_la_digue",
    difficulty: "easy",
    copy: {
      en: {
        title: "Praslin, Curieuse, Cousin and La Digue",
        description:
          "The inner islands at an easy pace: giant tortoises on Curieuse, the bird reserve on Cousin and the granite boulders of Anse Source d'Argent.",
      },
      uk: {
        title: "Праслен, Кюр'єз, Кузен, Ла-Діг",
        description:
          "Внутрішні острови без поспіху: гігантські черепахи на Кюр'єзі, пташиний заповідник на Кузені та гранітні валуни Анс-Сурс-д'Аржан.",
      },
      de: {
        title: "Praslin, Curieuse, Cousin und La Digue",
        description:
          "Die inneren Inseln in Ruhe: Riesenschildkröten auf Curieuse, das Vogelreservat auf Cousin und die Granitfelsen von Anse Source d'Argent.",
      },
      es: {
        title: "Praslin, Curieuse, Cousin y La Digue",
        description:
          "Las islas interiores sin prisa: tortugas gigantes en Curieuse, la reserva de aves de Cousin y las rocas de granito de Anse Source d'Argent.",
      },
    },
    stops: [
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Check-in at Eden Island, the base for every inner-island route.",
          uk: "Реєстрація на Еден-Айленді, базі для всіх маршрутів внутрішніми островами.",
          de: "Check-in auf Eden Island, der Basis für alle Routen der inneren Inseln.",
          es: "Check-in en Eden Island, la base de todas las rutas por las islas interiores.",
        },
      },
      {
        name: "Sainte Anne",
        lat: -4.61,
        lng: 55.49,
        note: {
          en: "A marine park twenty minutes from the base, and the usual first night.",
          uk: "Морський парк за двадцять хвилин від бази і зазвичай перша ніч.",
          de: "Ein Meerespark zwanzig Minuten von der Basis, meist die erste Nacht.",
          es: "Un parque marino a veinte minutos de la base y, por costumbre, la primera noche.",
        },
      },
      {
        name: "Praslin",
        lat: -4.345,
        lng: 55.763,
        note: {
          en: "The Vallée de Mai grows the coco de mer, found nowhere else in the world.",
          uk: "У Валле-де-Ме росте коко-де-мер, якого більше немає ніде у світі.",
          de: "Im Vallée de Mai wächst die Coco de Mer, die es sonst nirgends gibt.",
          es: "En el Valle de Mai crece el coco de mar, que no existe en ningún otro lugar.",
        },
      },
      {
        name: "Curieuse",
        lat: -4.283,
        lng: 55.728,
        note: {
          en: "Giant tortoises walk free on the island, which was once a leper colony.",
          uk: "Островом вільно ходять гігантські черепахи, а колись тут була колонія прокажених.",
          de: "Riesenschildkröten laufen frei über die Insel, einst eine Leprakolonie.",
          es: "Las tortugas gigantes campan libres por la isla, antaño una colonia de leprosos.",
        },
      },
      {
        name: "Cousin",
        lat: -4.3311,
        lng: 55.6617,
        note: {
          en: "A bird reserve: landings are guided, and the island is closed at weekends.",
          uk: "Пташиний заповідник: висадка лише з гідом, а на вихідних острів зачинений.",
          de: "Ein Vogelreservat: Anlandung nur geführt, am Wochenende geschlossen.",
          es: "Una reserva de aves: los desembarcos son guiados y la isla cierra los fines de semana.",
        },
      },
      {
        name: "La Digue",
        lat: -4.358,
        lng: 55.826,
        note: {
          en: "Bicycles still outnumber motor vehicles, with the granite boulders of Anse Source d'Argent as the island's signature view.",
          uk: "Велосипеди тут досі домінують над моторним транспортом, а ще — гранітні валуни Анс-Сурс-д'Аржан.",
          de: "Fahrräder prägen die Insel noch immer stärker als Motorfahrzeuge, dazu die Granitfelsen von Anse Source d'Argent.",
          es: "Las bicicletas siguen dominando sobre los vehículos a motor, junto con los bloques de granito de Anse Source d'Argent.",
        },
      },
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_sc_praslin_and_la_digue",
    difficulty: "easy",
    copy: {
      en: {
        title: "Praslin and La Digue",
        description:
          "A relaxed week around Praslin, La Digue and their smaller neighbouring islands: Anse Lazio, the reserves at Cousin and Curieuse, and the sandbanks off Coco and Félicité.",
      },
      uk: {
        title: "Праслен і Ла-Діг",
        description:
          "Спокійний тиждень навколо Праслена, Ла-Діга та сусідніх менших островів: Анс-Лаціо, заповідники Кузен і Кюр'єз та піщані мілини біля Коко й Фелісіте.",
      },
      de: {
        title: "Praslin und La Digue",
        description:
          "Eine entspannte Woche rund um Praslin, La Digue und die kleineren Nachbarinseln: Anse Lazio, die Reservate Cousin und Curieuse und die Sandbänke vor Coco und Félicité.",
      },
      es: {
        title: "Praslin y La Digue",
        description:
          "Una semana tranquila entre Praslin, La Digue y sus islas vecinas más pequeñas: Anse Lazio, las reservas de Cousin y Curieuse y los bancos de arena de Coco y Félicité.",
      },
    },
    stops: [
      {
        name: "Praslin",
        lat: -4.345,
        lng: 55.763,
        note: {
          en: "The Vallée de Mai grows the coco de mer, found nowhere else in the world.",
          uk: "У Валле-де-Ме росте коко-де-мер, якого більше немає ніде у світі.",
          de: "Im Vallée de Mai wächst die Coco de Mer, die es sonst nirgends gibt.",
          es: "En el Valle de Mai crece el coco de mar, que no existe en ningún otro lugar.",
        },
      },
      {
        name: "Curieuse",
        lat: -4.283,
        lng: 55.728,
        note: {
          en: "Giant tortoises walk free on the island, which was once a leper colony.",
          uk: "Островом вільно ходять гігантські черепахи, а колись тут була колонія прокажених.",
          de: "Riesenschildkröten laufen frei über die Insel, einst eine Leprakolonie.",
          es: "Las tortugas gigantes campan libres por la isla, antaño una colonia de leprosos.",
        },
      },
      {
        name: "Cousin",
        lat: -4.3311,
        lng: 55.6617,
        note: {
          en: "A bird reserve: landings are guided, and the island is closed at weekends.",
          uk: "Пташиний заповідник: висадка лише з гідом, а на вихідних острів зачинений.",
          de: "Ein Vogelreservat: Anlandung nur geführt, am Wochenende geschlossen.",
          es: "Una reserva de aves: los desembarcos son guiados y la isla cierra los fines de semana.",
        },
      },
      {
        name: "La Digue",
        lat: -4.358,
        lng: 55.826,
        note: {
          en: "Bicycles still outnumber motor vehicles, with the granite boulders of Anse Source d'Argent as the island's signature view.",
          uk: "Велосипеди тут досі домінують над моторним транспортом, а ще — гранітні валуни Анс-Сурс-д'Аржан.",
          de: "Fahrräder prägen die Insel noch immer stärker als Motorfahrzeuge, dazu die Granitfelsen von Anse Source d'Argent.",
          es: "Las bicicletas siguen dominando sobre los vehículos a motor, junto con los bloques de granito de Anse Source d'Argent.",
        },
      },
      {
        name: "Félicité",
        lat: -4.3222,
        lng: 55.8683,
        note: {
          en: "Granite slabs and clear water, with the Sisters islands close by.",
          uk: "Гранітні плити й прозора вода, а поруч - острови Сестри.",
          de: "Granitplatten und klares Wasser, die Sisters-Inseln ganz in der Nähe.",
          es: "Losas de granito y agua clara, con las islas Sisters muy cerca.",
        },
      },
      {
        name: "Coco",
        lat: -4.3175,
        lng: 55.8433,
        note: {
          en: "A tiny marine park island, one of the best snorkelling stops in the group.",
          uk: "Крихітний острів морського парку, одна з найкращих зупинок для снорклінгу.",
          de: "Eine winzige Meeresparkinsel, einer der besten Schnorchelplätze der Gruppe.",
          es: "Una diminuta isla de parque marino, uno de los mejores puntos de snorkel del grupo.",
        },
      },
      {
        name: "Praslin",
        lat: -4.345,
        lng: 55.763,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_sc_silhouette_praslin_and_la_digue",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Silhouette, Praslin and La Digue",
        description:
          "Out to Silhouette, the least developed of the inner islands, before the usual run to Praslin and La Digue and back past Sainte Anne.",
      },
      uk: {
        title: "Сільєт, Праслен, Ла-Діг",
        description:
          "Вихід до Сільєта, найменш забудованого з внутрішніх островів, а далі звичний шлях на Праслен і Ла-Діг та назад повз Сент-Анн.",
      },
      de: {
        title: "Silhouette, Praslin und La Digue",
        description:
          "Hinaus nach Silhouette, der am wenigsten bebauten der inneren Inseln, dann der übliche Weg nach Praslin und La Digue und zurück an Sainte Anne vorbei.",
      },
      es: {
        title: "Silhouette, Praslin y La Digue",
        description:
          "Hasta Silhouette, la menos urbanizada de las islas interiores, y después la ruta habitual a Praslin y La Digue, de vuelta por Sainte Anne.",
      },
    },
    stops: [
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Check-in at Eden Island, the base for every inner-island route.",
          uk: "Реєстрація на Еден-Айленді, базі для всіх маршрутів внутрішніми островами.",
          de: "Check-in auf Eden Island, der Basis für alle Routen der inneren Inseln.",
          es: "Check-in en Eden Island, la base de todas las rutas por las islas interiores.",
        },
      },
      {
        name: "Beau Vallon",
        lat: -4.6167,
        lng: 55.4278,
        note: {
          en: "The long beach on the north of Mahé, with the day's last swim off the boat.",
          uk: "Довгий пляж на півночі Мае, де можна востаннє за день скупатися з борту.",
          de: "Der lange Strand im Norden von Mahé, für das letzte Bad des Tages vom Boot.",
          es: "La playa larga del norte de Mahé, para el último baño del día desde el barco.",
        },
      },
      {
        name: "Silhouette",
        lat: -4.4883,
        lng: 55.24,
        note: {
          en: "A national park island with no roads, and forest to the water's edge.",
          uk: "Острів національного парку без доріг, де ліс підходить до самої води.",
          de: "Eine Nationalparkinsel ohne Straßen, mit Wald bis ans Wasser.",
          es: "Una isla de parque nacional sin carreteras y con bosque hasta la orilla.",
        },
      },
      {
        name: "Praslin",
        lat: -4.345,
        lng: 55.763,
        note: {
          en: "The Vallée de Mai grows the coco de mer, found nowhere else in the world.",
          uk: "У Валле-де-Ме росте коко-де-мер, якого більше немає ніде у світі.",
          de: "Im Vallée de Mai wächst die Coco de Mer, die es sonst nirgends gibt.",
          es: "En el Valle de Mai crece el coco de mar, que no existe en ningún otro lugar.",
        },
      },
      {
        name: "La Digue",
        lat: -4.358,
        lng: 55.826,
        note: {
          en: "Bicycles still outnumber motor vehicles, with the granite boulders of Anse Source d'Argent as the island's signature view.",
          uk: "Велосипеди тут досі домінують над моторним транспортом, а ще — гранітні валуни Анс-Сурс-д'Аржан.",
          de: "Fahrräder prägen die Insel noch immer stärker als Motorfahrzeuge, dazu die Granitfelsen von Anse Source d'Argent.",
          es: "Las bicicletas siguen dominando sobre los vehículos a motor, junto con los bloques de granito de Anse Source d'Argent.",
        },
      },
      {
        name: "Sainte Anne",
        lat: -4.61,
        lng: 55.49,
        note: {
          en: "A marine park twenty minutes from the base, and the usual first night.",
          uk: "Морський парк за двадцять хвилин від бази і зазвичай перша ніч.",
          de: "Ein Meerespark zwanzig Minuten von der Basis, meist die erste Nacht.",
          es: "Un parque marino a veinte minutos de la base y, por costumbre, la primera noche.",
        },
      },
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_sc_mahe_coastal_and_inner_islands",
    difficulty: "easy",
    copy: {
      en: {
        title: "Mahé Coastal and Inner Islands",
        description:
          "The Mahé coast at close range: the marine park at Sainte Anne, Anse Royale, Baie Lazare and Beau Vallon, with Silhouette on the horizon.",
      },
      uk: {
        title: "Узбережжя Мае і внутрішні острови",
        description:
          "Берег Мае зблизька: морський парк Сент-Анн, Анс-Рояль, Бе-Лазар і Бо-Валлон, а на обрії Сільєт.",
      },
      de: {
        title: "Mahé-Küste und innere Inseln",
        description:
          "Die Küste von Mahé aus der Nähe: der Meerespark Sainte Anne, Anse Royale, Baie Lazare und Beau Vallon, mit Silhouette am Horizont.",
      },
      es: {
        title: "Costa de Mahé e islas interiores",
        description:
          "La costa de Mahé de cerca: el parque marino de Sainte Anne, Anse Royale, Baie Lazare y Beau Vallon, con Silhouette en el horizonte.",
      },
    },
    stops: [
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Check-in at Eden Island, the base for every inner-island route.",
          uk: "Реєстрація на Еден-Айленді, базі для всіх маршрутів внутрішніми островами.",
          de: "Check-in auf Eden Island, der Basis für alle Routen der inneren Inseln.",
          es: "Check-in en Eden Island, la base de todas las rutas por las islas interiores.",
        },
      },
      {
        name: "Sainte Anne",
        lat: -4.61,
        lng: 55.49,
        note: {
          en: "A marine park twenty minutes from the base, and the usual first night.",
          uk: "Морський парк за двадцять хвилин від бази і зазвичай перша ніч.",
          de: "Ein Meerespark zwanzig Minuten von der Basis, meist die erste Nacht.",
          es: "Un parque marino a veinte minutos de la base y, por costumbre, la primera noche.",
        },
      },
      {
        name: "Anse Royale",
        lat: -4.7433,
        lng: 55.5117,
        note: {
          en: "A reef-sheltered bay on the east coast of Mahé, calm in the south-east trades.",
          uk: "Захищена рифом затока на східному березі Мае, спокійна під південно-східними пасатами.",
          de: "Eine riffgeschützte Bucht an Mahés Ostküste, ruhig im Südostpassat.",
          es: "Una bahía protegida por arrecife en el este de Mahé, tranquila con los alisios del sureste.",
        },
      },
      {
        name: "Baie Lazare",
        lat: -4.7533,
        lng: 55.48,
        note: {
          en: "A wide bay on the south-west shore, with granite headlands at both ends.",
          uk: "Широка затока на південно-західному березі, з гранітними мисами обабіч.",
          de: "Eine weite Bucht an der Südwestküste, mit Granitköpfen an beiden Enden.",
          es: "Una bahía amplia en la costa suroeste, con cabos de granito en ambos extremos.",
        },
      },
      {
        name: "Beau Vallon",
        lat: -4.6167,
        lng: 55.4278,
        note: {
          en: "The long beach on the north of Mahé, with the day's last swim off the boat.",
          uk: "Довгий пляж на півночі Мае, де можна востаннє за день скупатися з борту.",
          de: "Der lange Strand im Norden von Mahé, für das letzte Bad des Tages vom Boot.",
          es: "La playa larga del norte de Mahé, para el último baño del día desde el barco.",
        },
      },
      {
        name: "Silhouette",
        lat: -4.4883,
        lng: 55.24,
        note: {
          en: "A national park island with no roads, and forest to the water's edge.",
          uk: "Острів національного парку без доріг, де ліс підходить до самої води.",
          de: "Eine Nationalparkinsel ohne Straßen, mit Wald bis ans Wasser.",
          es: "Una isla de parque nacional sin carreteras y con bosque hasta la orilla.",
        },
      },
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_th_phi_phi_koh_lanta_and_krabi",
    difficulty: "easy",
    copy: {
      en: {
        title: "Phi Phi, Koh Lanta and Krabi",
        description:
          "South from Phuket to the Phi Phi islands, quieter Koh Lanta and the clear water at Koh Rok, back by way of Krabi.",
      },
      uk: {
        title: "Пхі-Пхі, Ко-Ланта, Крабі",
        description:
          "На південь від Пхукета до островів Пхі-Пхі, тихішої Ко-Ланти та прозорої води Ко-Рок, а назад через Крабі.",
      },
      de: {
        title: "Phi Phi, Koh Lanta und Krabi",
        description:
          "Südwärts von Phuket zu den Phi-Phi-Inseln, zum ruhigeren Koh Lanta und ins klare Wasser von Koh Rok, zurück über Krabi.",
      },
      es: {
        title: "Phi Phi, Koh Lanta y Krabi",
        description:
          "Al sur de Phuket a las islas Phi Phi, la más tranquila Koh Lanta y las aguas claras de Koh Rok, de vuelta por Krabi.",
      },
    },
    stops: [
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Check-in on the north-east coast, an hour from the limestone bays.",
          uk: "Реєстрація на північно-східному березі, за годину від вапнякових бухт.",
          de: "Check-in an der Nordostküste, eine Stunde von den Kalksteinbuchten entfernt.",
          es: "Check-in en la costa noreste, a una hora de las bahías de caliza.",
        },
      },
      {
        name: "Phi Phi",
        lat: 7.74,
        lng: 98.77,
        note: {
          en: "Two islands around a shallow bay; anchor on the quieter east side.",
          uk: "Два острови навколо мілкої затоки, а якір краще кидати на тихішому східному боці.",
          de: "Zwei Inseln um eine flache Bucht; ankern auf der ruhigeren Ostseite.",
          es: "Dos islas en torno a una bahía somera; fondear en el lado este, más tranquilo.",
        },
      },
      {
        name: "Koh Lanta",
        lat: 7.6167,
        lng: 99.0333,
        note: {
          en: "A long island with an old town of stilt houses on its east coast.",
          uk: "Довгий острів зі старим містом на палях на східному березі.",
          de: "Eine lange Insel mit einer Altstadt aus Pfahlhäusern an der Ostküste.",
          es: "Una isla alargada con un casco antiguo de casas sobre pilotes en su costa este.",
        },
      },
      {
        name: "Koh Rok",
        lat: 7.2167,
        lng: 99.0667,
        note: {
          en: "Two islands in a marine park, with the clearest water on the route.",
          uk: "Два острови в морському парку з найпрозорішою водою на маршруті.",
          de: "Zwei Inseln in einem Meerespark, mit dem klarsten Wasser der Route.",
          es: "Dos islas en un parque marino, con el agua más clara de toda la ruta.",
        },
      },
      {
        name: "Krabi",
        lat: 8.065,
        lng: 98.92,
        note: {
          en: "The mainland town, with mangroves and a night market by the river.",
          uk: "Материкове місто з мангровими заростями й нічним ринком біля річки.",
          de: "Die Festlandstadt, mit Mangroven und einem Nachtmarkt am Fluss.",
          es: "La ciudad continental, con manglares y un mercado nocturno junto al río.",
        },
      },
      {
        name: "Koh Yao",
        lat: 8.118,
        lng: 98.608,
        note: {
          en: "Two farming islands in the middle of the bay, with almost no tourism.",
          uk: "Два фермерські острови посеред затоки, майже без туризму.",
          de: "Zwei landwirtschaftliche Inseln mitten in der Bucht, fast ohne Tourismus.",
          es: "Dos islas agrícolas en medio de la bahía, casi sin turismo.",
        },
      },
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_th_similan_islands",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Similan Islands",
        description:
          "Offshore to the Similans and Koh Bon, the best diving and snorkelling in Thailand. The marine park is open from mid-October to mid-May only.",
      },
      uk: {
        title: "Сімілан",
        description:
          "Вихід у море до Сіміланів і Ко-Бон, це найкращий дайвінг і снорклінг у Таїланді. Морський парк відкритий лише з середини жовтня до середини травня.",
      },
      de: {
        title: "Similan-Inseln",
        description:
          "Hinaus zu den Similans und Koh Bon, das beste Tauchen und Schnorcheln Thailands. Der Meerespark ist nur von Mitte Oktober bis Mitte Mai geöffnet.",
      },
      es: {
        title: "Islas Similan",
        description:
          "Mar adentro a las Similan y Koh Bon, el mejor buceo y snorkel de Tailandia. El parque marino solo abre de mediados de octubre a mediados de mayo.",
      },
    },
    stops: [
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Check-in on the north-east coast, an hour from the limestone bays.",
          uk: "Реєстрація на північно-східному березі, за годину від вапнякових бухт.",
          de: "Check-in an der Nordostküste, eine Stunde von den Kalksteinbuchten entfernt.",
          es: "Check-in en la costa noreste, a una hora de las bahías de caliza.",
        },
      },
      {
        name: "Similan Islands",
        lat: 8.6533,
        lng: 97.645,
        note: {
          en: "Granite boulders underwater and visibility of thirty metres in season.",
          uk: "Гранітні валуни під водою й видимість до тридцяти метрів у сезон.",
          de: "Granitblöcke unter Wasser und in der Saison dreißig Meter Sicht.",
          es: "Bloques de granito bajo el agua y treinta metros de visibilidad en temporada.",
        },
      },
      {
        name: "Koh Bon",
        lat: 9.1167,
        lng: 97.8667,
        note: {
          en: "A limestone ridge where manta rays pass through in the early season.",
          uk: "Вапняковий хребет, повз який на початку сезону проходять манти.",
          de: "Ein Kalksteinrücken, an dem früh in der Saison Mantarochen vorbeiziehen.",
          es: "Una cresta de caliza por donde pasan mantas al principio de la temporada.",
        },
      },
      {
        name: "Similan",
        lat: 8.6533,
        lng: 97.645,
        note: {
          en: "Back to the archipelago for a second day before the run home.",
          uk: "Повернення до архіпелагу на другий день перед переходом додому.",
          de: "Zurück ins Archipel für einen zweiten Tag vor dem Rückweg.",
          es: "Vuelta al archipiélago para un segundo día antes del regreso.",
        },
      },
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_th_phang_nga_and_koh_yao",
    difficulty: "easy",
    copy: {
      en: {
        title: "Phang Nga and Koh Yao",
        description:
          "The sheltered bay east of Phuket: limestone towers, the lagoon at Koh Hong and the two Koh Yao islands, with short passages throughout.",
      },
      uk: {
        title: "Пханг-Нга і Ко-Яо",
        description:
          "Захищена затока на схід від Пхукета: вапнякові скелі, лагуна Ко-Хонг і два острови Ко-Яо, з короткими переходами по всьому маршруту.",
      },
      de: {
        title: "Phang Nga und Koh Yao",
        description:
          "Die geschützte Bucht östlich von Phuket: Kalksteintürme, die Lagune von Koh Hong und die beiden Koh-Yao-Inseln, durchweg kurze Schläge.",
      },
      es: {
        title: "Phang Nga y Koh Yao",
        description:
          "La bahía resguardada al este de Phuket: farallones de caliza, la laguna de Koh Hong y las dos islas Koh Yao, siempre con travesías cortas.",
      },
    },
    stops: [
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Check-in on the north-east coast, an hour from the limestone bays.",
          uk: "Реєстрація на північно-східному березі, за годину від вапнякових бухт.",
          de: "Check-in an der Nordostküste, eine Stunde von den Kalksteinbuchten entfernt.",
          es: "Check-in en la costa noreste, a una hora de las bahías de caliza.",
        },
      },
      {
        name: "Koh Rang Yai",
        lat: 7.9833,
        lng: 98.4667,
        note: {
          en: "A small island close to the base, with a pearl farm and a beach.",
          uk: "Невеликий острів поруч із базою, з перловою фермою та пляжем.",
          de: "Eine kleine Insel nahe der Basis, mit Perlenfarm und Strand.",
          es: "Una pequeña isla cerca de la base, con una granja de perlas y una playa.",
        },
      },
      {
        name: "Phang Nga",
        lat: 8.45,
        lng: 98.53,
        note: {
          en: "Sea caves and mangrove channels you enter by kayak at the right tide.",
          uk: "Морські печери й мангрові протоки, куди заходять на каяку в потрібний приплив.",
          de: "Meereshöhlen und Mangrovenkanäle, per Kajak bei passender Tide befahrbar.",
          es: "Cuevas marinas y canales de manglar a los que se entra en kayak con la marea adecuada.",
        },
      },
      {
        name: "Koh Hong",
        lat: 8.2117,
        lng: 98.665,
        note: {
          en: "A hidden lagoon entered by dinghy through a gap in the rock at low tide.",
          uk: "Прихована лагуна, до якої на відпливі заходять тендером через щілину в скелі.",
          de: "Eine versteckte Lagune, per Dinghi durch einen Felsspalt bei Niedrigwasser.",
          es: "Una laguna escondida a la que se entra en auxiliar por una grieta con marea baja.",
        },
      },
      {
        name: "Koh Yao Noi",
        lat: 8.118,
        lng: 98.608,
        note: {
          en: "Rice fields, rubber trees and a view of the karsts from the east shore.",
          uk: "Рисові поля, каучукові дерева й вид на скелі зі східного берега.",
          de: "Reisfelder, Kautschukbäume und Blick auf die Karstfelsen von der Ostküste.",
          es: "Arrozales, árboles del caucho y vistas a los farallones desde la costa este.",
        },
      },
      {
        name: "Koh Yao Yai",
        lat: 8.0333,
        lng: 98.5833,
        note: {
          en: "The larger and quieter of the pair, with long empty beaches.",
          uk: "Більший і тихіший з двох островів, із довгими порожніми пляжами.",
          de: "Die größere und ruhigere der beiden, mit langen, leeren Stränden.",
          es: "La mayor y más tranquila de las dos, con playas largas y vacías.",
        },
      },
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_th_samui_phangan_and_tao",
    difficulty: "easy",
    copy: {
      en: {
        title: "Samui, Phangan and Tao",
        description:
          "The Gulf of Thailand side: Koh Phangan, the lagoon at Ang Thong marine park and the reefs off Koh Tao. A different season from Phuket.",
      },
      uk: {
        title: "Самуї, Пханган, Тао",
        description:
          "Бік Сіамської затоки: Ко-Пханган, лагуна морського парку Анг-Тонг і рифи біля Ко-Тао. Сезон тут інший, ніж на Пхукеті.",
      },
      de: {
        title: "Samui, Phangan und Tao",
        description:
          "Die Seite des Golfs von Thailand: Koh Phangan, die Lagune im Ang-Thong-Meerespark und die Riffe vor Koh Tao. Andere Saison als Phuket.",
      },
      es: {
        title: "Samui, Phangan y Tao",
        description:
          "El lado del golfo de Tailandia: Koh Phangan, la laguna del parque marino de Ang Thong y los arrecifes de Koh Tao. Temporada distinta a la de Phuket.",
      },
    },
    stops: [
      {
        name: "Koh Samui",
        lat: 9.5626,
        lng: 100.0562,
        note: {
          en: "Check-in on the gulf side, where the season runs opposite to Phuket's.",
          uk: "Реєстрація з боку затоки, де сезон протилежний до пхукетського.",
          de: "Check-in auf der Golfseite, wo die Saison entgegengesetzt zu Phuket läuft.",
          es: "Check-in en el lado del golfo, donde la temporada es la contraria a la de Phuket.",
        },
      },
      {
        name: "Koh Phangan",
        lat: 9.7096,
        lng: 100.01,
        note: {
          en: "Quiet bays on the north and west coasts, away from the full-moon beach.",
          uk: "Тихі бухти на північному й західному берегах, подалі від пляжу повного місяця.",
          de: "Ruhige Buchten an Nord- und Westküste, fern vom Full-Moon-Strand.",
          es: "Bahías tranquilas al norte y al oeste, lejos de la playa de la luna llena.",
        },
      },
      {
        name: "Ang Thong Marine Park",
        lat: 9.65,
        lng: 99.6667,
        note: {
          en: "Forty-two islands around a saltwater lake held inside one of them.",
          uk: "Сорок два острови навколо солоного озера, замкненого всередині одного з них.",
          de: "Zweiundvierzig Inseln um einen Salzwassersee, der in einer von ihnen liegt.",
          es: "Cuarenta y dos islas en torno a un lago salado encerrado en una de ellas.",
        },
      },
      {
        name: "Koh Tao",
        lat: 10.0967,
        lng: 99.84,
        note: {
          en: "The diving island: reefs on every side and whale sharks in season.",
          uk: "Дайверський острів: рифи з усіх боків, а в сезон - китові акули.",
          de: "Die Taucherinsel: Riffe auf allen Seiten und in der Saison Walhaie.",
          es: "La isla del buceo: arrecifes por todos lados y tiburones ballena en temporada.",
        },
      },
      {
        name: "Koh Phangan",
        lat: 9.7096,
        lng: 100.01,
        note: {
          en: "Quiet bays on the north and west coasts, away from the full-moon beach.",
          uk: "Тихі бухти на північному й західному берегах, подалі від пляжу повного місяця.",
          de: "Ruhige Buchten an Nord- und Westküste, fern vom Full-Moon-Strand.",
          es: "Bahías tranquilas al norte y al oeste, lejos de la playa de la luna llena.",
        },
      },
      {
        name: "Koh Samui",
        lat: 9.5626,
        lng: 100.0562,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_me_bay_of_kotor_and_lustica",
    difficulty: "easy",
    copy: {
      en: {
        title: "Bay of Kotor and Luštica",
        description:
          "The whole bay at a slow pace: Perast and its island churches, Risan's mosaics, and the fishing villages of Rose and the Luštica peninsula.",
      },
      uk: {
        title: "Которська затока і Луштиця",
        description:
          "Уся затока без поспіху: Пераст із острівними церквами, мозаїки Рісана та рибальські села Розе й півострова Луштиця.",
      },
      de: {
        title: "Bucht von Kotor und Luštica",
        description:
          "Die ganze Bucht in Ruhe: Perast mit seinen Inselkirchen, die Mosaike von Risan und die Fischerdörfer Rose und Luštica.",
      },
      es: {
        title: "Bahía de Kotor y Luštica",
        description:
          "Toda la bahía sin prisa: Perast y sus iglesias en islotes, los mosaicos de Risan y los pueblos pesqueros de Rose y la península de Luštica.",
      },
    },
    stops: [
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Check-in at Porto Montenegro, a superyacht marina on a former naval base.",
          uk: "Реєстрація в Порто-Монтенегро, марині суперяхт на місці колишньої військової бази.",
          de: "Check-in in Porto Montenegro, einer Superyacht-Marina auf einem ehemaligen Marinestützpunkt.",
          es: "Check-in en Porto Montenegro, una marina de superyates sobre una antigua base naval.",
        },
      },
      {
        name: "Perast",
        lat: 42.486,
        lng: 18.698,
        note: {
          en: "Two islets off the town: one natural, one built by sailors dropping stones for centuries.",
          uk: "Два острівці навпроти міста: один природний, другий моряки століттями насипали камінням.",
          de: "Zwei Eilande vor der Stadt: eines natürlich, eines von Seeleuten über Jahrhunderte aufgeschüttet.",
          es: "Dos islotes frente al pueblo: uno natural y otro levantado por marineros arrojando piedras durante siglos.",
        },
      },
      {
        name: "Kotor",
        lat: 42.4247,
        lng: 18.7712,
        note: {
          en: "A walled town at the head of the bay, with the fortress wall climbing the cliff behind it.",
          uk: "Обнесене мурами місто в глибині затоки, а фортечна стіна піднімається скелею позаду.",
          de: "Eine ummauerte Stadt am Ende der Bucht, dahinter klettert die Festungsmauer den Fels hinauf.",
          es: "Una ciudad amurallada al fondo de la bahía, con la muralla trepando por el acantilado.",
        },
      },
      {
        name: "Risan",
        lat: 42.514,
        lng: 18.694,
        note: {
          en: "Roman floor mosaics survive here, in the oldest settlement on the bay.",
          uk: "Тут збереглися римські підлогові мозаїки, це найдавніше поселення затоки.",
          de: "Römische Bodenmosaike haben hier überdauert, in der ältesten Siedlung der Bucht.",
          es: "Aquí se conservan mosaicos romanos, en el asentamiento más antiguo de la bahía.",
        },
      },
      {
        name: "Herceg Novi",
        lat: 42.4531,
        lng: 18.5375,
        note: {
          en: "Stepped streets above the water at the entrance to the bay.",
          uk: "Вулиці-сходи над водою біля входу в затоку.",
          de: "Treppengassen über dem Wasser an der Einfahrt zur Bucht.",
          es: "Calles escalonadas sobre el agua, en la entrada de la bahía.",
        },
      },
      {
        name: "Rose",
        lat: 42.4258,
        lng: 18.5672,
        note: {
          en: "A fishing village at the mouth of the bay, quiet once the ferries stop.",
          uk: "Рибальське село біля входу в затоку, тихе, щойно припиняються пороми.",
          de: "Ein Fischerdorf an der Buchtmündung, still, sobald die Fähren einstellen.",
          es: "Un pueblo pesquero en la bocana de la bahía, tranquilo cuando cesan los ferris.",
        },
      },
      {
        name: "Luštica",
        lat: 42.39,
        lng: 18.6167,
        note: {
          en: "A peninsula of olive groves and small bays, with few roads to any of them.",
          uk: "Півострів оливкових гаїв і невеликих бухт, куди майже не ведуть дороги.",
          de: "Eine Halbinsel aus Olivenhainen und kleinen Buchten, kaum durch Straßen erschlossen.",
          es: "Una península de olivares y pequeñas bahías, a las que apenas llegan carreteras.",
        },
      },
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_me_budva_sveti_stefan_and_petrovac",
    difficulty: "easy",
    copy: {
      en: {
        title: "Budva, Sveti Stefan and Petrovac",
        description:
          "Out of the bay and down the open coast: the old town of Budva, the island hotel at Sveti Stefan and the beaches at Petrovac.",
      },
      uk: {
        title: "Будва, Светі-Стефан, Петровац",
        description:
          "Вихід із затоки й рух відкритим узбережжям: старе місто Будви, острівний готель Светі-Стефан і пляжі Петроваца.",
      },
      de: {
        title: "Budva, Sveti Stefan und Petrovac",
        description:
          "Aus der Bucht hinaus die offene Küste hinunter: die Altstadt von Budva, das Inselhotel Sveti Stefan und die Strände von Petrovac.",
      },
      es: {
        title: "Budva, Sveti Stefan y Petrovac",
        description:
          "Fuera de la bahía y por la costa abierta: el casco antiguo de Budva, el hotel isla de Sveti Stefan y las playas de Petrovac.",
      },
    },
    stops: [
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Check-in at Porto Montenegro, a superyacht marina on a former naval base.",
          uk: "Реєстрація в Порто-Монтенегро, марині суперяхт на місці колишньої військової бази.",
          de: "Check-in in Porto Montenegro, einer Superyacht-Marina auf einem ehemaligen Marinestützpunkt.",
          es: "Check-in en Porto Montenegro, una marina de superyates sobre una antigua base naval.",
        },
      },
      {
        name: "Luštica",
        lat: 42.39,
        lng: 18.6167,
        note: {
          en: "A peninsula of olive groves and small bays, with few roads to any of them.",
          uk: "Півострів оливкових гаїв і невеликих бухт, куди майже не ведуть дороги.",
          de: "Eine Halbinsel aus Olivenhainen und kleinen Buchten, kaum durch Straßen erschlossen.",
          es: "Una península de olivares y pequeñas bahías, a las que apenas llegan carreteras.",
        },
      },
      {
        name: "Budva",
        lat: 42.278,
        lng: 18.837,
        note: {
          en: "A walled old town on a headland, with the coast's busiest beaches either side.",
          uk: "Старе місто в мурах на мисі, а обабіч - найлюдніші пляжі узбережжя.",
          de: "Eine ummauerte Altstadt auf einer Landzunge, beidseits die vollsten Strände der Küste.",
          es: "Un casco antiguo amurallado sobre un cabo, con las playas más concurridas a ambos lados.",
        },
      },
      {
        name: "Sveti Stefan",
        lat: 42.256,
        lng: 18.892,
        note: {
          en: "An island village turned hotel, joined to the shore by a sand causeway.",
          uk: "Острівне село, перетворене на готель, з'єднане з берегом піщаною косою.",
          de: "Ein zum Hotel gewordenes Inseldorf, über eine Sanddammstraße mit dem Ufer verbunden.",
          es: "Un pueblo isla convertido en hotel, unido a la costa por un istmo de arena.",
        },
      },
      {
        name: "Petrovac",
        lat: 42.2058,
        lng: 18.9439,
        note: {
          en: "A short sandy bay with a Venetian fort on the rocks at one end.",
          uk: "Коротка піщана затока з венеційським фортом на скелях з одного краю.",
          de: "Eine kurze Sandbucht mit einem venezianischen Fort auf den Felsen an einem Ende.",
          es: "Una bahía corta de arena con un fuerte veneciano sobre las rocas en un extremo.",
        },
      },
      {
        name: "Bigova",
        lat: 42.3383,
        lng: 18.7089,
        note: {
          en: "A fishing inlet between the bay and Budva, with a handful of konobas.",
          uk: "Рибальська бухта між затокою та Будвою, з кількома конобами.",
          de: "Eine Fischerbucht zwischen Bucht und Budva, mit einer Handvoll Konobas.",
          es: "Una ensenada pesquera entre la bahía y Budva, con un puñado de konobas.",
        },
      },
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_me_kotor_herceg_novi_and_budva",
    difficulty: "easy",
    copy: {
      en: {
        title: "Kotor, Herceg Novi and Budva",
        description:
          "From Kotor itself, under the mountain walls to Perast and Herceg Novi, then out past Žanjice and Bigova to Budva.",
      },
      uk: {
        title: "Котор, Герцег-Нови, Будва",
        description:
          "Від самого Котора під гірськими стінами до Пераста й Герцег-Нового, а потім повз Жаниці та Бігову до Будви.",
      },
      de: {
        title: "Kotor, Herceg Novi und Budva",
        description:
          "Von Kotor selbst unter den Bergwänden nach Perast und Herceg Novi, dann hinaus über Žanjice und Bigova nach Budva.",
      },
      es: {
        title: "Kotor, Herceg Novi y Budva",
        description:
          "Desde el propio Kotor, bajo las paredes de montaña hasta Perast y Herceg Novi, y luego pasando Žanjice y Bigova hacia Budva.",
      },
    },
    stops: [
      {
        name: "Kotor",
        lat: 42.4247,
        lng: 18.7712,
        note: {
          en: "A walled town at the head of the bay, with the fortress wall climbing the cliff behind it.",
          uk: "Обнесене мурами місто в глибині затоки, а фортечна стіна піднімається скелею позаду.",
          de: "Eine ummauerte Stadt am Ende der Bucht, dahinter klettert die Festungsmauer den Fels hinauf.",
          es: "Una ciudad amurallada al fondo de la bahía, con la muralla trepando por el acantilado.",
        },
      },
      {
        name: "Perast",
        lat: 42.486,
        lng: 18.698,
        note: {
          en: "Two islets off the town: one natural, one built by sailors dropping stones for centuries.",
          uk: "Два острівці навпроти міста: один природний, другий моряки століттями насипали камінням.",
          de: "Zwei Eilande vor der Stadt: eines natürlich, eines von Seeleuten über Jahrhunderte aufgeschüttet.",
          es: "Dos islotes frente al pueblo: uno natural y otro levantado por marineros arrojando piedras durante siglos.",
        },
      },
      {
        name: "Herceg Novi",
        lat: 42.4531,
        lng: 18.5375,
        note: {
          en: "Stepped streets above the water at the entrance to the bay.",
          uk: "Вулиці-сходи над водою біля входу в затоку.",
          de: "Treppengassen über dem Wasser an der Einfahrt zur Bucht.",
          es: "Calles escalonadas sobre el agua, en la entrada de la bahía.",
        },
      },
      {
        name: "Žanjice",
        lat: 42.4033,
        lng: 18.5675,
        note: {
          en: "A pebble beach opposite Mamula island, with the Blue Cave around the point.",
          uk: "Галечний пляж навпроти острова Мамула, а за мисом - Блакитна печера.",
          de: "Ein Kieselstrand gegenüber der Insel Mamula, hinter der Landspitze die Blaue Grotte.",
          es: "Una playa de guijarros frente a la isla de Mamula, con la Cueva Azul tras la punta.",
        },
      },
      {
        name: "Bigova",
        lat: 42.3383,
        lng: 18.7089,
        note: {
          en: "A fishing inlet between the bay and Budva, with a handful of konobas.",
          uk: "Рибальська бухта між затокою та Будвою, з кількома конобами.",
          de: "Eine Fischerbucht zwischen Bucht und Budva, mit einer Handvoll Konobas.",
          es: "Una ensenada pesquera entre la bahía y Budva, con un puñado de konobas.",
        },
      },
      {
        name: "Budva",
        lat: 42.278,
        lng: 18.837,
        note: {
          en: "A walled old town on a headland, with the coast's busiest beaches either side.",
          uk: "Старе місто в мурах на мисі, а обабіч - найлюдніші пляжі узбережжя.",
          de: "Eine ummauerte Altstadt auf einer Landzunge, beidseits die vollsten Strände der Küste.",
          es: "Un casco antiguo amurallado sobre un cabo, con las playas más concurridas a ambos lados.",
        },
      },
      {
        name: "Kotor",
        lat: 42.4247,
        lng: 18.7712,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_me_montenegro_coast_explorer",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Montenegro Coast Explorer",
        description:
          "The full coast from the bay to Bar, taking in Budva, Petrovac and the quiet inlet at Bigova. The longest of the Montenegrin weeks.",
      },
      uk: {
        title: "Узбережжя Чорногорії",
        description:
          "Усе узбережжя від затоки до Бара, з Будвою, Петровацем і тихою бухтою Бігова. Найдовший із чорногорських тижнів.",
      },
      de: {
        title: "Montenegros Küste",
        description:
          "Die ganze Küste von der Bucht bis Bar, mit Budva, Petrovac und der stillen Bucht von Bigova. Die längste der montenegrinischen Wochen.",
      },
      es: {
        title: "Costa de Montenegro",
        description:
          "Toda la costa desde la bahía hasta Bar, con Budva, Petrovac y la tranquila ensenada de Bigova. La más larga de las semanas montenegrinas.",
      },
    },
    stops: [
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Check-in at Porto Montenegro, a superyacht marina on a former naval base.",
          uk: "Реєстрація в Порто-Монтенегро, марині суперяхт на місці колишньої військової бази.",
          de: "Check-in in Porto Montenegro, einer Superyacht-Marina auf einem ehemaligen Marinestützpunkt.",
          es: "Check-in en Porto Montenegro, una marina de superyates sobre una antigua base naval.",
        },
      },
      {
        name: "Herceg Novi",
        lat: 42.4531,
        lng: 18.5375,
        note: {
          en: "Stepped streets above the water at the entrance to the bay.",
          uk: "Вулиці-сходи над водою біля входу в затоку.",
          de: "Treppengassen über dem Wasser an der Einfahrt zur Bucht.",
          es: "Calles escalonadas sobre el agua, en la entrada de la bahía.",
        },
      },
      {
        name: "Luštica",
        lat: 42.39,
        lng: 18.6167,
        note: {
          en: "A peninsula of olive groves and small bays, with few roads to any of them.",
          uk: "Півострів оливкових гаїв і невеликих бухт, куди майже не ведуть дороги.",
          de: "Eine Halbinsel aus Olivenhainen und kleinen Buchten, kaum durch Straßen erschlossen.",
          es: "Una península de olivares y pequeñas bahías, a las que apenas llegan carreteras.",
        },
      },
      {
        name: "Budva",
        lat: 42.278,
        lng: 18.837,
        note: {
          en: "A walled old town on a headland, with the coast's busiest beaches either side.",
          uk: "Старе місто в мурах на мисі, а обабіч - найлюдніші пляжі узбережжя.",
          de: "Eine ummauerte Altstadt auf einer Landzunge, beidseits die vollsten Strände der Küste.",
          es: "Un casco antiguo amurallado sobre un cabo, con las playas más concurridas a ambos lados.",
        },
      },
      {
        name: "Petrovac",
        lat: 42.2058,
        lng: 18.9439,
        note: {
          en: "A short sandy bay with a Venetian fort on the rocks at one end.",
          uk: "Коротка піщана затока з венеційським фортом на скелях з одного краю.",
          de: "Eine kurze Sandbucht mit einem venezianischen Fort auf den Felsen an einem Ende.",
          es: "Una bahía corta de arena con un fuerte veneciano sobre las rocas en un extremo.",
        },
      },
      {
        name: "Bar",
        lat: 42.093,
        lng: 19.087,
        note: {
          en: "The country's commercial port, with the ruined old town inland.",
          uk: "Торговельний порт країни, а старе місто в руїнах - углибині суходолу.",
          de: "Der Handelshafen des Landes, die Altstadtruine liegt landeinwärts.",
          es: "El puerto comercial del país, con el casco antiguo en ruinas tierra adentro.",
        },
      },
      {
        name: "Bigova",
        lat: 42.3383,
        lng: 18.7089,
        note: {
          en: "A fishing inlet between the bay and Budva, with a handful of konobas.",
          uk: "Рибальська бухта між затокою та Будвою, з кількома конобами.",
          de: "Eine Fischerbucht zwischen Bucht und Budva, mit einer Handvoll Konobas.",
          es: "Una ensenada pesquera entre la bahía y Budva, con un puñado de konobas.",
        },
      },
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_pf_huahine_taha_a_and_bora_bora",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Huahine, Taha'a and Bora Bora",
        description:
          "Huahine first, the quietest of the Leewards, then the vanilla plantations of Taha'a and the lagoon at Bora Bora.",
      },
      uk: {
        title: "Хуахіне, Таха'а, Бора-Бора",
        description:
          "Спершу Хуахіне, найтихіший із Підвітряних островів, далі ванільні плантації Таха'а й лагуна Бора-Бори.",
      },
      de: {
        title: "Huahine, Taha'a und Bora Bora",
        description:
          "Zuerst Huahine, die ruhigste der Inseln unter dem Winde, dann die Vanilleplantagen von Taha'a und die Lagune von Bora Bora.",
      },
      es: {
        title: "Huahine, Taha'a y Bora Bora",
        description:
          "Primero Huahine, la más tranquila de Sotavento, después las plantaciones de vainilla de Taha'a y la laguna de Bora Bora.",
      },
    },
    stops: [
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Check-in at Apooiti, the charter base for the Leeward Islands.",
          uk: "Реєстрація в Апооїті, чартерній базі Підвітряних островів.",
          de: "Check-in in Apooiti, der Charterbasis für die Inseln unter dem Winde.",
          es: "Check-in en Apooiti, la base chárter de las islas de Sotavento.",
        },
      },
      {
        name: "Huahine",
        lat: -16.716,
        lng: -151.034,
        note: {
          en: "The least developed of the group, with sacred sites along the lagoon shore.",
          uk: "Найменш забудований острів групи, зі священними місцями вздовж берега лагуни.",
          de: "Die am wenigsten erschlossene der Gruppe, mit heiligen Stätten am Lagunenufer.",
          es: "La menos desarrollada del grupo, con lugares sagrados junto a la laguna.",
        },
      },
      {
        name: "Taha'a",
        lat: -16.628,
        lng: -151.488,
        note: {
          en: "Vanilla plantations ashore and a coral garden you drift through on the current.",
          uk: "Ванільні плантації на березі й кораловий сад, крізь який несе течією.",
          de: "Vanilleplantagen an Land und ein Korallengarten, durch den die Strömung treibt.",
          es: "Plantaciones de vainilla en tierra y un jardín de coral por el que te lleva la corriente.",
        },
      },
      {
        name: "Bora Bora",
        lat: -16.501,
        lng: -151.742,
        note: {
          en: "Mount Otemanu rises above a turquoise lagoon, with the main pass on the western side.",
          uk: "Гора Отеману здіймається над бірюзовою лагуною, а головний прохід лежить із західного боку.",
          de: "Der Mount Otemanu erhebt sich über einer türkisfarbenen Lagune; der Hauptpass liegt im Westen.",
          es: "El monte Otemanu se alza sobre una laguna turquesa, con el paso principal en el lado oeste.",
        },
      },
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_pf_bora_bora_and_maupiti",
    difficulty: "advanced",
    copy: {
      en: {
        title: "Bora Bora and Maupiti",
        description:
          "As far west as charter boats go: Maupiti, whose single pass is closed by swell often enough to need a flexible plan.",
      },
      uk: {
        title: "Бора-Бора і Маупіті",
        description:
          "Найзахідніша точка, куди ходять чартерні яхти: Маупіті, єдиний прохід якого досить часто закриває хвиля, тож план має бути гнучким.",
      },
      de: {
        title: "Bora Bora und Maupiti",
        description:
          "So weit westlich, wie Charteryachten fahren: Maupiti, dessen einziger Pass oft genug von Schwell gesperrt wird, dass man flexibel planen muss.",
      },
      es: {
        title: "Bora Bora y Maupiti",
        description:
          "Lo más al oeste que llegan los chárteres: Maupiti, cuyo único paso se cierra con marejada lo bastante a menudo como para exigir un plan flexible.",
      },
    },
    stops: [
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Check-in at Apooiti, the charter base for the Leeward Islands.",
          uk: "Реєстрація в Апооїті, чартерній базі Підвітряних островів.",
          de: "Check-in in Apooiti, der Charterbasis für die Inseln unter dem Winde.",
          es: "Check-in en Apooiti, la base chárter de las islas de Sotavento.",
        },
      },
      {
        name: "Taha'a",
        lat: -16.628,
        lng: -151.488,
        note: {
          en: "Vanilla plantations ashore and a coral garden you drift through on the current.",
          uk: "Ванільні плантації на березі й кораловий сад, крізь який несе течією.",
          de: "Vanilleplantagen an Land und ein Korallengarten, durch den die Strömung treibt.",
          es: "Plantaciones de vainilla en tierra y un jardín de coral por el que te lleva la corriente.",
        },
      },
      {
        name: "Bora Bora",
        lat: -16.501,
        lng: -151.742,
        note: {
          en: "Mount Otemanu rises above a turquoise lagoon, with the main pass on the western side.",
          uk: "Гора Отеману здіймається над бірюзовою лагуною, а головний прохід лежить із західного боку.",
          de: "Der Mount Otemanu erhebt sich über einer türkisfarbenen Lagune; der Hauptpass liegt im Westen.",
          es: "El monte Otemanu se alza sobre una laguna turquesa, con el paso principal en el lado oeste.",
        },
      },
      {
        name: "Maupiti",
        lat: -16.45,
        lng: -152.25,
        note: {
          en: "One narrow pass, closed by swell often enough to keep the plan flexible.",
          uk: "Єдиний вузький прохід, який хвиля закриває досить часто, тож план має бути гнучким.",
          de: "Ein schmaler Pass, oft genug von Schwell gesperrt, um flexibel zu planen.",
          es: "Un único paso estrecho, cerrado por la marejada lo bastante a menudo como para no fijar el plan.",
        },
      },
      {
        name: "Bora Bora",
        lat: -16.501,
        lng: -151.742,
        note: {
          en: "Mount Otemanu rises above a turquoise lagoon, with the main pass on the western side.",
          uk: "Гора Отеману здіймається над бірюзовою лагуною, а головний прохід лежить із західного боку.",
          de: "Der Mount Otemanu erhebt sich über einer türkisfarbenen Lagune; der Hauptpass liegt im Westen.",
          es: "El monte Otemanu se alza sobre una laguna turquesa, con el paso principal en el lado oeste.",
        },
      },
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_pf_tahiti_and_moorea_round_trip",
    difficulty: "moderate",
    copy: {
      en: {
        title: "Tahiti and Moorea Round Trip",
        description:
          "Across to Moorea for Cook's Bay and Opunohu, then the atoll at Tetiaroa. From Papeete rather than Raiatea.",
      },
      uk: {
        title: "Таїті й Муреа",
        description:
          "Перехід на Муреа до бухт Кука й Опуноху, а далі атол Тетіароа. Старт із Папеете, а не з Раїатеа.",
      },
      de: {
        title: "Tahiti und Moorea",
        description:
          "Hinüber nach Moorea zur Cook's Bay und Opunohu, dann das Atoll Tetiaroa. Ab Papeete statt ab Raiatea.",
      },
      es: {
        title: "Tahití y Moorea",
        description:
          "Cruce a Moorea para ver la bahía de Cook y Opunohu, y después el atolón de Tetiaroa. Desde Papeete, no desde Raiatea.",
      },
    },
    stops: [
      {
        name: "Tahiti",
        lat: -17.535,
        lng: -149.57,
        note: {
          en: "Check-in at Papeete, with the market worth an hour before you leave.",
          uk: "Реєстрація в Папеете, а тамтешній ринок вартий години перед відходом.",
          de: "Check-in in Papeete; der Markt ist vor dem Ablegen eine Stunde wert.",
          es: "Check-in en Papeete, con un mercado que merece una hora antes de zarpar.",
        },
      },
      {
        name: "Moorea",
        lat: -17.5,
        lng: -149.7833,
        note: {
          en: "A ridge of volcanic spires two hours across the channel from Tahiti.",
          uk: "Гряда вулканічних шпилів за дві години протокою від Таїті.",
          de: "Ein Grat vulkanischer Zacken, zwei Stunden über den Kanal von Tahiti.",
          es: "Una cresta de agujas volcánicas a dos horas de Tahití cruzando el canal.",
        },
      },
      {
        name: "Cook's Bay",
        lat: -17.49,
        lng: -149.8236,
        note: {
          en: "A deep bay under Mount Rotui, named for the captain who anchored nearby.",
          uk: "Глибока затока під горою Ротуї, названа на честь капітана, який став на якір поруч.",
          de: "Eine tiefe Bucht unter dem Mount Rotui, benannt nach dem Kapitän, der nebenan ankerte.",
          es: "Una bahía profunda bajo el monte Rotui, nombrada por el capitán que fondeó cerca.",
        },
      },
      {
        name: "Opunohu Bay",
        lat: -17.4933,
        lng: -149.8542,
        note: {
          en: "The quieter of Moorea's two bays, with rays in the shallows at its mouth.",
          uk: "Тихіша з двох заток Муреа, а на мілині біля входу - скати.",
          de: "Die ruhigere der beiden Buchten Mooreas, mit Rochen im Flachen an ihrer Mündung.",
          es: "La más tranquila de las dos bahías de Moorea, con rayas en los bajos de su boca.",
        },
      },
      {
        name: "Tetiaroa",
        lat: -17.0167,
        lng: -149.5667,
        note: {
          en: "A ring of motus once owned by Marlon Brando, with no pass into the lagoon.",
          uk: "Кільце моту, яке колись належало Марлону Брандо, без проходу в лагуну.",
          de: "Ein Ring von Motus, einst Marlon Brando gehörend, ohne Pass in die Lagune.",
          es: "Un anillo de motus que perteneció a Marlon Brando, sin paso hacia la laguna.",
        },
      },
      {
        name: "Tahiti",
        lat: -17.535,
        lng: -149.57,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    id: "srt_route_pf_fakarava_atoll_round_trip",
    difficulty: "advanced",
    /* No charter base within reach of the start, so the card links by region instead. */
    fallbackRegion: { country: "French Polynesia", names: ["Polynesia", "French Polynesia"] },
    copy: {
      en: {
        title: "Fakarava Atoll Round Trip",
        description:
          "Inside one atoll in the Tuamotus, from Rotoava to the south pass at Tetamanu. Tidal passes, few services and a UNESCO biosphere reserve.",
      },
      uk: {
        title: "Атол Факарава",
        description:
          "Усередині одного атола в архіпелазі Туамоту, від Ротоави до південного проходу Тетаману. Припливні проходи, майже жодного сервісу й біосферний заповідник ЮНЕСКО.",
      },
      de: {
        title: "Atoll Fakarava",
        description:
          "Im Inneren eines Atolls der Tuamotus, von Rotoava bis zum Südpass Tetamanu. Tidenpässe, kaum Versorgung und ein UNESCO-Biosphärenreservat.",
      },
      es: {
        title: "Atolón de Fakarava",
        description:
          "Dentro de un atolón de las Tuamotu, de Rotoava al paso sur de Tetamanu. Pasos con corriente de marea, pocos servicios y reserva de biosfera de la UNESCO.",
      },
    },
    stops: [
      {
        name: "Fakarava North/Rotoava",
        lat: -16.0553,
        lng: -145.6191,
        note: {
          en: "The village and the north pass, a UNESCO biosphere reserve.",
          uk: "Село й північний прохід, біосферний заповідник ЮНЕСКО.",
          de: "Das Dorf und der Nordpass, ein UNESCO-Biosphärenreservat.",
          es: "El pueblo y el paso norte, reserva de la biosfera de la UNESCO.",
        },
      },
      {
        name: "Pakokota",
        lat: -16.205,
        lng: -145.585,
        note: {
          en: "A small anchorage on the lagoon's west side, halfway down the atoll.",
          uk: "Невелика стоянка на західному боці лагуни, на півдорозі вздовж атола.",
          de: "Ein kleiner Ankerplatz an der Westseite der Lagune, auf halber Atolllänge.",
          es: "Un pequeño fondeadero en el lado oeste de la laguna, a mitad del atolón.",
        },
      },
      {
        name: "Hirifa",
        lat: -16.5119,
        lng: -145.4519,
        note: {
          en: "Sand and palms in the south-east corner, sheltered from the trade wind.",
          uk: "Пісок і пальми в південно-східному куті, під захистом від пасату.",
          de: "Sand und Palmen in der Südostecke, geschützt vor dem Passat.",
          es: "Arena y palmeras en el rincón sureste, al abrigo del alisio.",
        },
      },
      {
        name: "Tetamanu",
        lat: -16.5117,
        lng: -145.4664,
        note: {
          en: "The south pass: drift-dive it on the incoming tide, among hundreds of sharks.",
          uk: "Південний прохід: дрейф-дайв на припливі, серед сотень акул.",
          de: "Der Südpass: Driftttauchgang mit einlaufender Tide, zwischen Hunderten Haien.",
          es: "El paso sur: inmersión en deriva con marea entrante, entre cientos de tiburones.",
        },
      },
      {
        name: "Fakarava North/Rotoava",
        lat: -16.0553,
        lng: -145.6191,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
];

/**
 * The twelve featured routes, whose itineraries the client's file restates. Their titles,
 * descriptions and targets are left alone: only the stops are replaced.
 */
export const STOP_REFRESH: { routeId: string; stops: SeedStop[] }[] = [
  {
    routeId: "srt_popular_central_dalmatia",
    stops: [
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Check-in at the charter base, with Diocletian's Palace an evening's walk away.",
          uk: "Реєстрація на чартерній базі, а до палацу Діоклетіана - вечірня прогулянка.",
          de: "Check-in an der Charterbasis, der Diokletianpalast ist einen Abendspaziergang entfernt.",
          es: "Check-in en la base de chárter, con el palacio de Diocleciano a un paseo.",
        },
      },
      {
        name: "Šolta",
        lat: 43.3961,
        lng: 16.2072,
        note: {
          en: "The nearest island to Split: quiet coves, olive groves and a working fishing harbour.",
          uk: "Найближчий до Спліта острів: тихі бухти, оливкові гаї та діюча рибальська гавань.",
          de: "Die nächste Insel vor Split: stille Buchten, Olivenhaine und ein aktiver Fischerhafen.",
          es: "La isla más cercana a Split: calas tranquilas, olivares y un puerto pesquero en activo.",
        },
      },
      {
        name: "Vis",
        lat: 43.0603,
        lng: 16.1836,
        note: {
          en: "Closed to visitors until 1989, and still the least built-up of the big islands.",
          uk: "До 1989 року був закритий для гостей і досі найменш забудований серед великих островів.",
          de: "Bis 1989 für Besucher gesperrt und noch immer die am wenigsten bebaute der großen Inseln.",
          es: "Cerrada a los visitantes hasta 1989 y aún la menos urbanizada de las islas grandes.",
        },
      },
      {
        name: "Hvar",
        lat: 43.1729,
        lng: 16.4414,
        note: {
          en: "Lavender fields, a Venetian old town and the busiest nightlife in Dalmatia.",
          uk: "Лавандові поля, венеційське старе місто й найжвавіше нічне життя Далмації.",
          de: "Lavendelfelder, eine venezianische Altstadt und das lebhafteste Nachtleben Dalmatiens.",
          es: "Campos de lavanda, un casco antiguo veneciano y la noche más animada de Dalmacia.",
        },
      },
      {
        name: "Pakleni Islands",
        lat: 43.1583,
        lng: 16.3833,
        note: {
          en: "A string of wooded islets off Hvar town, with Palmižana the anchorage to aim for.",
          uk: "Низка лісистих острівців навпроти міста Хвар, а найкраща стоянка - Палміжана.",
          de: "Eine Kette bewaldeter Inselchen vor Hvar-Stadt, Palmižana ist der Ankerplatz der Wahl.",
          es: "Una hilera de islotes boscosos frente a Hvar, con Palmižana como fondeadero de referencia.",
        },
      },
      {
        name: "Brač",
        lat: 43.3272,
        lng: 16.4497,
        note: {
          en: "The Zlatni Rat beach shifts with the current; the island's white stone built Split.",
          uk: "Пляж Златні Рат змінює форму за течією, а з місцевого білого каменю збудований Спліт.",
          de: "Der Strand Zlatni Rat verschiebt sich mit der Strömung; aus dem weißen Stein wurde Split gebaut.",
          es: "La playa de Zlatni Rat cambia con la corriente; con su piedra blanca se construyó Split.",
        },
      },
      {
        name: "Split/Trogir",
        lat: 43.5026,
        lng: 16.43,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_ionian",
    stops: [
      {
        name: "Lefkada",
        lat: 38.8339,
        lng: 20.7119,
        note: {
          en: "Check-in at the marina behind the canal, the base for the whole Ionian.",
          uk: "Реєстрація в марині за каналом, це база для всього Іонічного моря.",
          de: "Check-in in der Marina hinter dem Kanal, der Basis für das ganze Ionische Meer.",
          es: "Check-in en la marina tras el canal, la base de todo el Jónico.",
        },
      },
      {
        name: "Meganisi",
        lat: 38.6664,
        lng: 20.7825,
        note: {
          en: "Deep inlets on the south shore, with tavernas at the head of each one.",
          uk: "Глибокі бухти на південному березі, у глибині кожної - таверна.",
          de: "Tiefe Buchten an der Südküste, am Ende jeder eine Taverne.",
          es: "Ensenadas profundas en la costa sur, con una taberna al fondo de cada una.",
        },
      },
      {
        name: "Kefalonia/Fiskardo",
        lat: 38.4581,
        lng: 20.5761,
        note: {
          en: "One of the few settlements on Kefalonia to remain largely intact after the 1953 earthquake.",
          uk: "Одне з небагатьох поселень Кефалонії, що значною мірою вціліли після землетрусу 1953 року.",
          de: "Eine der wenigen Siedlungen auf Kefalonia, die das Erdbeben von 1953 weitgehend unbeschadet überstanden.",
          es: "Uno de los pocos asentamientos de Cefalonia que quedaron en gran parte intactos tras el terremoto de 1953.",
        },
      },
      {
        name: "Ithaca",
        lat: 38.4478,
        lng: 20.6903,
        note: {
          en: "Odysseus's island: steep green hills and the small harbour at Kioni.",
          uk: "Острів Одіссея: круті зелені пагорби й невелика гавань Кіоні.",
          de: "Die Insel des Odysseus: steile grüne Hügel und der kleine Hafen von Kioni.",
          es: "La isla de Odiseo: colinas verdes y escarpadas y el pequeño puerto de Kioni.",
        },
      },
      {
        name: "Kastos",
        lat: 38.5783,
        lng: 20.9078,
        note: {
          en: "One village, a few hundred metres of quay and almost no cars.",
          uk: "Одне село, кількасот метрів причалу й майже жодного автомобіля.",
          de: "Ein Dorf, ein paar hundert Meter Kai und fast keine Autos.",
          es: "Un pueblo, unos cientos de metros de muelle y casi ningún coche.",
        },
      },
      {
        name: "Kalamos",
        lat: 38.6247,
        lng: 20.9269,
        note: {
          en: "The harbour taverna takes lines from arriving boats, as it has for decades.",
          uk: "Таверна в гавані приймає швартови від яхт, що заходять, як і десятиліттями до того.",
          de: "Die Hafentaverne nimmt seit Jahrzehnten die Leinen ankommender Boote an.",
          es: "La taberna del puerto recoge las amarras de los barcos, como hace décadas.",
        },
      },
      {
        name: "Lefkada",
        lat: 38.8339,
        lng: 20.7119,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_gocek_fethiye",
    stops: [
      {
        name: "Göcek",
        lat: 36.7536,
        lng: 28.9408,
        note: {
          en: "A small town whose bays hold more anchorages than berths.",
          uk: "Невелике містечко, у бухтах якого більше якірних стоянок, ніж причалів.",
          de: "Ein kleiner Ort, dessen Buchten mehr Ankerplätze als Liegeplätze bieten.",
          es: "Un pueblo pequeño cuyas bahías tienen más fondeaderos que amarres.",
        },
      },
      {
        name: "Fethiye",
        lat: 36.622,
        lng: 29.104,
        note: {
          en: "Rock tombs cut into the cliff above the town and its market.",
          uk: "Скельні гробниці, вирубані в кручі над містом і його ринком.",
          de: "In die Felswand über Stadt und Markt gehauene Felsengräber.",
          es: "Tumbas excavadas en el acantilado sobre el pueblo y su mercado.",
        },
      },
      {
        name: "Gemiler",
        lat: 36.554,
        lng: 29.065,
        note: {
          en: "A hillside of Byzantine church ruins, best seen in the evening light.",
          uk: "Схил із руїнами візантійських церков, найкраще видимими у вечірньому світлі.",
          de: "Ein Hang voller byzantinischer Kirchenruinen, am schönsten im Abendlicht.",
          es: "Una ladera con ruinas de iglesias bizantinas, mejor con la luz del atardecer.",
        },
      },
      {
        name: "Ölüdeniz",
        lat: 36.5486,
        lng: 29.1156,
        note: {
          en: "The lagoon is a protected park; paragliders come down off the mountain all day.",
          uk: "Лагуна - заповідний парк, а параплани цілий день спускаються з гори.",
          de: "Die Lagune ist Schutzgebiet; den ganzen Tag schweben Gleitschirme vom Berg herab.",
          es: "La laguna es parque protegido; los parapentes bajan de la montaña todo el día.",
        },
      },
      {
        name: "Göcek Bays",
        lat: 36.66,
        lng: 28.829,
        note: {
          en: "Twelve islands and as many bays, most with a jetty and a kitchen.",
          uk: "Дванадцять островів і стільки ж бухт, у більшості - причал і кухня.",
          de: "Zwölf Inseln und ebenso viele Buchten, die meisten mit Steg und Küche.",
          es: "Doce islas y otras tantas bahías, casi todas con pantalán y cocina.",
        },
      },
      {
        name: "Tersane",
        lat: 36.6825,
        lng: 28.915,
        note: {
          en: "An abandoned Greek village around a boatyard bay.",
          uk: "Покинуте грецьке село навколо бухти зі старою верф'ю.",
          de: "Ein verlassenes griechisches Dorf rund um eine Werftbucht.",
          es: "Un pueblo griego abandonado en torno a una bahía con astillero.",
        },
      },
      {
        name: "Göcek",
        lat: 36.7536,
        lng: 28.9408,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_sardinia",
    stops: [
      {
        name: "Portisco",
        lat: 41.0346,
        lng: 9.5185,
        note: {
          en: "Check-in on the Costa Smeralda, with La Maddalena an afternoon away.",
          uk: "Реєстрація на Смарагдовому узбережжі, до Ла-Маддалени - півдня ходу.",
          de: "Check-in an der Costa Smeralda, La Maddalena ist einen Nachmittag entfernt.",
          es: "Check-in en la Costa Esmeralda, con La Maddalena a una tarde de navegación.",
        },
      },
      {
        name: "Porto Cervo",
        lat: 41.1353,
        lng: 9.5378,
        note: {
          en: "The most expensive marina in the Mediterranean, and worth one night for the view.",
          uk: "Найдорожча марина Середземномор'я, але одна ніч заради краєвиду того варта.",
          de: "Die teuerste Marina des Mittelmeers, eine Nacht für den Ausblick aber wert.",
          es: "La marina más cara del Mediterráneo, y merece una noche solo por las vistas.",
        },
      },
      {
        name: "La Maddalena",
        lat: 41.214,
        lng: 9.407,
        note: {
          en: "A national park of granite islands between Sardinia and Corsica.",
          uk: "Національний парк із гранітних островів між Сардинією та Корсикою.",
          de: "Ein Nationalpark aus Granitinseln zwischen Sardinien und Korsika.",
          es: "Un parque nacional de islas de granito entre Cerdeña y Córcega.",
        },
      },
      {
        name: "Caprera",
        lat: 41.2186,
        lng: 9.4744,
        note: {
          en: "Garibaldi's island, with Cala Coticcio on its eastern shore.",
          uk: "Острів Гарібальді, з бухтою Кала-Котіччо на східному березі.",
          de: "Garibaldis Insel, mit der Cala Coticcio an ihrer Ostküste.",
          es: "La isla de Garibaldi, con Cala Coticcio en su costa este.",
        },
      },
      {
        name: "Spargi",
        lat: 41.2417,
        lng: 9.3417,
        note: {
          en: "An uninhabited island; anchoring is by permit inside the park.",
          uk: "Безлюдний острів, і якірна стоянка в парку - за дозволом.",
          de: "Eine unbewohnte Insel; das Ankern im Park ist genehmigungspflichtig.",
          es: "Una isla deshabitada; fondear dentro del parque requiere permiso.",
        },
      },
      {
        name: "Bonifacio",
        lat: 41.3872,
        lng: 9.1592,
        note: {
          en: "The harbour hides in a cleft under limestone cliffs, almost invisible from the sea.",
          uk: "Гавань ховається в розколині під вапняковими скелями, з моря її майже не видно.",
          de: "Der Hafen versteckt sich in einer Spalte unter Kalksteinfelsen und ist von See kaum zu erkennen.",
          es: "El puerto se esconde en una grieta bajo acantilados de caliza y apenas se distingue desde el mar.",
        },
      },
      {
        name: "Portisco",
        lat: 41.0346,
        lng: 9.5185,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_ibiza_formentera",
    stops: [
      {
        name: "Ibiza",
        lat: 38.9136,
        lng: 1.445,
        note: {
          en: "Check-in below the walls of Dalt Vila, the old town on the hill.",
          uk: "Реєстрація під мурами Дальт-Віли, старого міста на пагорбі.",
          de: "Check-in unterhalb der Mauern von Dalt Vila, der Altstadt auf dem Hügel.",
          es: "Check-in bajo las murallas de Dalt Vila, el casco antiguo sobre la colina.",
        },
      },
      {
        name: "Formentera",
        lat: 38.7339,
        lng: 1.4167,
        note: {
          en: "Anchor over sand, not seagrass: the meadows here are protected and patrolled.",
          uk: "Якір кидають на пісок, а не на морську траву: тутешні луки під охороною й патрулюються.",
          de: "Auf Sand ankern, nicht auf Seegras: Die Wiesen hier sind geschützt und werden kontrolliert.",
          es: "Fondear en arena, no sobre posidonia: las praderas están protegidas y vigiladas.",
        },
      },
      {
        name: "Espalmador",
        lat: 38.7867,
        lng: 1.4308,
        note: {
          en: "A private island with a protected lagoon, dunes and undeveloped beaches.",
          uk: "Приватний острів із заповідною лагуною, дюнами й незабудованими пляжами.",
          de: "Eine Privatinsel mit geschützter Lagune, Dünen und unbebauten Stränden.",
          es: "Una isla privada con laguna protegida, dunas y playas sin urbanizar.",
        },
      },
      {
        name: "Es Vedrà",
        lat: 38.88,
        lng: 1.223,
        note: {
          en: "A rock rising 400 metres out of the sea, best at sunset from Cala d'Hort.",
          uk: "Скеля, що здіймається на 400 метрів із моря, найкраща на заході сонця з Кала-д'Орт.",
          de: "Ein 400 Meter aus dem Meer ragender Fels, am schönsten bei Sonnenuntergang von Cala d'Hort.",
          es: "Una roca que se alza 400 metros sobre el mar, mejor al atardecer desde Cala d'Hort.",
        },
      },
      {
        name: "Cala Comte",
        lat: 38.9589,
        lng: 1.2244,
        note: {
          en: "West-facing coves over white sand, the last light of the day on the water.",
          uk: "Бухти, звернені на захід, над білим піском, і останнє денне світло на воді.",
          de: "Nach Westen gerichtete Buchten über weißem Sand, das letzte Tageslicht auf dem Wasser.",
          es: "Calas orientadas al oeste sobre arena blanca, con la última luz del día en el agua.",
        },
      },
      {
        name: "Ibiza",
        lat: 38.9136,
        lng: 1.445,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_lofoten",
    stops: [
      {
        name: "Svolvær",
        lat: 68.2342,
        lng: 14.5683,
        note: {
          en: "Check-in in the Lofoten's main town, under the peaks that rise straight from the sea.",
          uk: "Реєстрація в головному місті Лофотенів, під вершинами, що здіймаються просто з моря.",
          de: "Check-in in der Hauptstadt der Lofoten, unter Gipfeln, die direkt aus dem Meer steigen.",
          es: "Check-in en la principal ciudad de Lofoten, bajo picos que surgen directos del mar.",
        },
      },
      {
        name: "Henningsvær",
        lat: 68.1519,
        lng: 14.2025,
        note: {
          en: "A fishing village spread over several islets, joined by bridges.",
          uk: "Рибальське селище, розкидане по кількох острівцях і з'єднане мостами.",
          de: "Ein Fischerdorf über mehrere Inselchen verteilt, durch Brücken verbunden.",
          es: "Un pueblo pesquero repartido por varios islotes, unidos por puentes.",
        },
      },
      {
        name: "Nusfjord",
        lat: 68.035,
        lng: 13.35,
        note: {
          en: "One of the oldest preserved fishing villages in Norway, in a narrow inlet.",
          uk: "Одне з найдавніших збережених рибальських селищ Норвегії, у вузькій бухті.",
          de: "Eines der ältesten erhaltenen Fischerdörfer Norwegens, in einer schmalen Bucht.",
          es: "Uno de los pueblos pesqueros mejor conservados de Noruega, en una cala estrecha.",
        },
      },
      {
        name: "Reine",
        lat: 67.9328,
        lng: 13.0886,
        note: {
          en: "Red cabins on stilts under the Reinebringen ridge, the postcard of the islands.",
          uk: "Червоні будиночки на палях під хребтом Райнебрінген - листівка цих островів.",
          de: "Rote Pfahlhütten unter dem Reinebringen-Grat, das Postkartenmotiv der Inseln.",
          es: "Cabañas rojas sobre pilotes bajo la cresta de Reinebringen, la postal de las islas.",
        },
      },
      {
        name: "Å",
        lat: 67.8811,
        lng: 12.9789,
        note: {
          en: "The road ends here, at the last village on the archipelago.",
          uk: "Тут закінчується дорога - це останнє село архіпелагу.",
          de: "Hier endet die Straße, im letzten Dorf des Archipels.",
          es: "Aquí se acaba la carretera, en el último pueblo del archipiélago.",
        },
      },
      {
        name: "Skrova",
        lat: 68.1544,
        lng: 14.6497,
        note: {
          en: "A small island community on the way back, with clear water and few visitors.",
          uk: "Невелика острівна громада дорогою назад, із прозорою водою й небагатьма гостями.",
          de: "Eine kleine Inselgemeinde auf dem Rückweg, mit klarem Wasser und wenigen Gästen.",
          es: "Una pequeña comunidad isleña de regreso, con aguas claras y pocos visitantes.",
        },
      },
      {
        name: "Svolvær",
        lat: 68.2342,
        lng: 14.5683,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_corsica_west",
    stops: [
      {
        name: "Ajaccio",
        lat: 41.9192,
        lng: 8.7386,
        note: {
          en: "Check-in in Napoleon's birthplace, at the head of a wide gulf.",
          uk: "Реєстрація на батьківщині Наполеона, у глибині широкої затоки.",
          de: "Check-in in Napoleons Geburtsstadt, am Ende eines weiten Golfs.",
          es: "Check-in en la ciudad natal de Napoleón, al fondo de un amplio golfo.",
        },
      },
      {
        name: "Îles Sanguinaires",
        lat: 41.8869,
        lng: 8.59,
        note: {
          en: "Four red islets at the mouth of the gulf, named for the evening light on them.",
          uk: "Чотири червоні острівці на вході в затоку, названі за вечірнім світлом на них.",
          de: "Vier rote Eilande an der Golfmündung, benannt nach dem Abendlicht auf ihnen.",
          es: "Cuatro islotes rojos en la bocana del golfo, llamados así por la luz del atardecer.",
        },
      },
      {
        name: "Cargèse",
        lat: 42.135,
        lng: 8.597,
        note: {
          en: "A village founded by Greek refugees, with a Greek and a Latin church facing each other.",
          uk: "Село, засноване грецькими біженцями, де грецька й латинська церкви стоять навпроти.",
          de: "Ein von griechischen Flüchtlingen gegründetes Dorf, mit griechischer und lateinischer Kirche gegenüber.",
          es: "Un pueblo fundado por refugiados griegos, con una iglesia griega y otra latina enfrentadas.",
        },
      },
      {
        name: "Girolata",
        lat: 42.3478,
        lng: 8.6153,
        note: {
          en: "No road reaches the village: everything arrives by boat or on foot.",
          uk: "До села не веде жодна дорога: усе прибуває морем або пішки.",
          de: "Keine Straße führt ins Dorf: Alles kommt per Boot oder zu Fuß.",
          es: "Ninguna carretera llega al pueblo: todo entra por barco o a pie.",
        },
      },
      {
        name: "Scandola",
        lat: 42.3667,
        lng: 8.5667,
        note: {
          en: "A UNESCO reserve of red porphyry cliffs; landing is not allowed.",
          uk: "Заповідник ЮНЕСКО з червоних порфірових скель, висаджуватися заборонено.",
          de: "Ein UNESCO-Reservat aus rotem Porphyr; Anlandung ist untersagt.",
          es: "Reserva de la UNESCO de acantilados de pórfido rojo; está prohibido desembarcar.",
        },
      },
      {
        name: "Calvi",
        lat: 42.5667,
        lng: 8.7575,
        note: {
          en: "A Genoese citadel above a bay with six kilometres of sand behind it.",
          uk: "Генуезька цитадель над затокою, за якою - шість кілометрів піску.",
          de: "Eine genuesische Zitadelle über einer Bucht mit sechs Kilometern Sand dahinter.",
          es: "Una ciudadela genovesa sobre una bahía con seis kilómetros de arena detrás.",
        },
      },
      {
        name: "Ajaccio",
        lat: 41.9192,
        lng: 8.7386,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_bvi",
    stops: [
      {
        name: "Tortola",
        lat: 18.426,
        lng: -64.619,
        note: {
          en: "Check-in at Road Town, the busiest charter base in the Caribbean.",
          uk: "Реєстрація в Роуд-Тауні, найзавантаженішій чартерній базі Карибів.",
          de: "Check-in in Road Town, der meistfrequentierten Charterbasis der Karibik.",
          es: "Check-in en Road Town, la base chárter más concurrida del Caribe.",
        },
      },
      {
        name: "Norman Island",
        lat: 18.317,
        lng: -64.618,
        note: {
          en: "The Bight, with caves at the western end said to have held pirate treasure.",
          uk: "Бухта Байт, а печери на західному краю, кажуть, ховали піратські скарби.",
          de: "Die Bight, mit Höhlen am Westende, in denen Piratenschätze gelegen haben sollen.",
          es: "La bahía de Bight, con cuevas al oeste donde se dice que hubo tesoro pirata.",
        },
      },
      {
        name: "Cooper Island",
        lat: 18.387,
        lng: -64.513,
        note: {
          en: "A single beach club on the shore and mooring balls off it.",
          uk: "Один пляжний клуб на березі й швартові бочки навпроти.",
          de: "Ein einziger Beach Club am Ufer und davor Festmachertonnen.",
          es: "Un único club de playa en la orilla y boyas de amarre enfrente.",
        },
      },
      {
        name: "Virgin Gorda",
        lat: 18.429,
        lng: -64.443,
        note: {
          en: "The Baths: house-sized granite boulders forming pools and tunnels on the beach.",
          uk: "The Baths: гранітні валуни завбільшки з будинок утворюють на пляжі купелі й тунелі.",
          de: "The Baths: hausgroße Granitblöcke bilden am Strand Becken und Tunnel.",
          es: "The Baths: bloques de granito del tamaño de una casa que forman pozas y túneles.",
        },
      },
      {
        name: "Anegada",
        lat: 18.727,
        lng: -64.333,
        note: {
          en: "The only coral island in the group, flat, ringed by reef and worth the crossing.",
          uk: "Єдиний кораловий острів групи: плаский, оточений рифом і вартий переходу.",
          de: "Die einzige Koralleninsel der Gruppe, flach, rifffumsäumt und den Schlag wert.",
          es: "La única isla coralina del grupo: plana, rodeada de arrecife y digna de la travesía.",
        },
      },
      {
        name: "Jost Van Dyke",
        lat: 18.443,
        lng: -64.753,
        note: {
          en: "Beach bars on the sand at Great Harbour and White Bay.",
          uk: "Пляжні бари просто на піску в Грейт-Гарбор і Вайт-Бей.",
          de: "Strandbars im Sand von Great Harbour und White Bay.",
          es: "Chiringuitos sobre la arena en Great Harbour y White Bay.",
        },
      },
      {
        name: "Tortola",
        lat: 18.426,
        lng: -64.619,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_inner_seychelles",
    stops: [
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Check-in at Eden Island, the base for every inner-island route.",
          uk: "Реєстрація на Еден-Айленді, базі для всіх маршрутів внутрішніми островами.",
          de: "Check-in auf Eden Island, der Basis für alle Routen der inneren Inseln.",
          es: "Check-in en Eden Island, la base de todas las rutas por las islas interiores.",
        },
      },
      {
        name: "Sainte Anne",
        lat: -4.61,
        lng: 55.49,
        note: {
          en: "A marine park twenty minutes from the base, and the usual first night.",
          uk: "Морський парк за двадцять хвилин від бази і зазвичай перша ніч.",
          de: "Ein Meerespark zwanzig Minuten von der Basis, meist die erste Nacht.",
          es: "Un parque marino a veinte minutos de la base y, por costumbre, la primera noche.",
        },
      },
      {
        name: "Praslin",
        lat: -4.345,
        lng: 55.763,
        note: {
          en: "The Vallée de Mai grows the coco de mer, found nowhere else in the world.",
          uk: "У Валле-де-Ме росте коко-де-мер, якого більше немає ніде у світі.",
          de: "Im Vallée de Mai wächst die Coco de Mer, die es sonst nirgends gibt.",
          es: "En el Valle de Mai crece el coco de mar, que no existe en ningún otro lugar.",
        },
      },
      {
        name: "Curieuse",
        lat: -4.283,
        lng: 55.728,
        note: {
          en: "Giant tortoises walk free on the island, which was once a leper colony.",
          uk: "Островом вільно ходять гігантські черепахи, а колись тут була колонія прокажених.",
          de: "Riesenschildkröten laufen frei über die Insel, einst eine Leprakolonie.",
          es: "Las tortugas gigantes campan libres por la isla, antaño una colonia de leprosos.",
        },
      },
      {
        name: "La Digue",
        lat: -4.358,
        lng: 55.826,
        note: {
          en: "Bicycles still outnumber motor vehicles, with the granite boulders of Anse Source d'Argent as the island's signature view.",
          uk: "Велосипеди тут досі домінують над моторним транспортом, а ще — гранітні валуни Анс-Сурс-д'Аржан.",
          de: "Fahrräder prägen die Insel noch immer stärker als Motorfahrzeuge, dazu die Granitfelsen von Anse Source d'Argent.",
          es: "Las bicicletas siguen dominando sobre los vehículos a motor, junto con los bloques de granito de Anse Source d'Argent.",
        },
      },
      {
        name: "Coco/Félicité",
        lat: -4.32,
        lng: 55.86,
        note: {
          en: "A snorkelling stop over coral, in the strait between the two islands.",
          uk: "Зупинка для снорклінгу над коралами, у протоці між двома островами.",
          de: "Ein Schnorchelstopp über Korallen, in der Passage zwischen beiden Inseln.",
          es: "Una parada de snorkel sobre coral, en el paso entre las dos islas.",
        },
      },
      {
        name: "Mahé",
        lat: -4.62,
        lng: 55.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_phuket_andaman",
    stops: [
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Check-in on the north-east coast, an hour from the limestone bays.",
          uk: "Реєстрація на північно-східному березі, за годину від вапнякових бухт.",
          de: "Check-in an der Nordostküste, eine Stunde von den Kalksteinbuchten entfernt.",
          es: "Check-in en la costa noreste, a una hora de las bahías de caliza.",
        },
      },
      {
        name: "Phang Nga Bay",
        lat: 8.275,
        lng: 98.501,
        note: {
          en: "Limestone towers straight out of shallow green water, hundreds of them.",
          uk: "Вапнякові стовпи просто з мілкої зеленої води, їх тут сотні.",
          de: "Kalksteintürme direkt aus flachem grünem Wasser, Hunderte davon.",
          es: "Torres de caliza que emergen de aguas verdes y someras, a cientos.",
        },
      },
      {
        name: "Koh Hong",
        lat: 8.2117,
        lng: 98.665,
        note: {
          en: "A hidden lagoon entered by dinghy through a gap in the rock at low tide.",
          uk: "Прихована лагуна, до якої на відпливі заходять тендером через щілину в скелі.",
          de: "Eine versteckte Lagune, per Dinghi durch einen Felsspalt bei Niedrigwasser.",
          es: "Una laguna escondida a la que se entra en auxiliar por una grieta con marea baja.",
        },
      },
      {
        name: "Krabi/Railay",
        lat: 8.011,
        lng: 98.839,
        note: {
          en: "Climbing cliffs above a beach with no road behind it.",
          uk: "Скелі для скелелазіння над пляжем, за яким немає дороги.",
          de: "Kletterfelsen über einem Strand, hinter dem keine Straße liegt.",
          es: "Acantilados de escalada sobre una playa sin carretera detrás.",
        },
      },
      {
        name: "Phi Phi",
        lat: 7.74,
        lng: 98.77,
        note: {
          en: "Two islands around a shallow bay; anchor on the quieter east side.",
          uk: "Два острови навколо мілкої затоки, а якір краще кидати на тихішому східному боці.",
          de: "Zwei Inseln um eine flache Bucht; ankern auf der ruhigeren Ostseite.",
          es: "Dos islas en torno a una bahía somera; fondear en el lado este, más tranquilo.",
        },
      },
      {
        name: "Koh Yao",
        lat: 8.118,
        lng: 98.608,
        note: {
          en: "Two farming islands in the middle of the bay, with almost no tourism.",
          uk: "Два фермерські острови посеред затоки, майже без туризму.",
          de: "Zwei landwirtschaftliche Inseln mitten in der Bucht, fast ohne Tourismus.",
          es: "Dos islas agrícolas en medio de la bahía, casi sin turismo.",
        },
      },
      {
        name: "Phuket",
        lat: 8.068,
        lng: 98.437,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_kotor_adriatic",
    stops: [
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Check-in at Porto Montenegro, a superyacht marina on a former naval base.",
          uk: "Реєстрація в Порто-Монтенегро, марині суперяхт на місці колишньої військової бази.",
          de: "Check-in in Porto Montenegro, einer Superyacht-Marina auf einem ehemaligen Marinestützpunkt.",
          es: "Check-in en Porto Montenegro, una marina de superyates sobre una antigua base naval.",
        },
      },
      {
        name: "Perast",
        lat: 42.486,
        lng: 18.698,
        note: {
          en: "Two islets off the town: one natural, one built by sailors dropping stones for centuries.",
          uk: "Два острівці навпроти міста: один природний, другий моряки століттями насипали камінням.",
          de: "Zwei Eilande vor der Stadt: eines natürlich, eines von Seeleuten über Jahrhunderte aufgeschüttet.",
          es: "Dos islotes frente al pueblo: uno natural y otro levantado por marineros arrojando piedras durante siglos.",
        },
      },
      {
        name: "Kotor",
        lat: 42.4247,
        lng: 18.7712,
        note: {
          en: "A walled town at the head of the bay, with the fortress wall climbing the cliff behind it.",
          uk: "Обнесене мурами місто в глибині затоки, а фортечна стіна піднімається скелею позаду.",
          de: "Eine ummauerte Stadt am Ende der Bucht, dahinter klettert die Festungsmauer den Fels hinauf.",
          es: "Una ciudad amurallada al fondo de la bahía, con la muralla trepando por el acantilado.",
        },
      },
      {
        name: "Herceg Novi",
        lat: 42.4531,
        lng: 18.5375,
        note: {
          en: "Stepped streets above the water at the entrance to the bay.",
          uk: "Вулиці-сходи над водою біля входу в затоку.",
          de: "Treppengassen über dem Wasser an der Einfahrt zur Bucht.",
          es: "Calles escalonadas sobre el agua, en la entrada de la bahía.",
        },
      },
      {
        name: "Luštica",
        lat: 42.39,
        lng: 18.6167,
        note: {
          en: "A peninsula of olive groves and small bays, with few roads to any of them.",
          uk: "Півострів оливкових гаїв і невеликих бухт, куди майже не ведуть дороги.",
          de: "Eine Halbinsel aus Olivenhainen und kleinen Buchten, kaum durch Straßen erschlossen.",
          es: "Una península de olivares y pequeñas bahías, a las que apenas llegan carreteras.",
        },
      },
      {
        name: "Budva",
        lat: 42.278,
        lng: 18.837,
        note: {
          en: "A walled old town on a headland, with the coast's busiest beaches either side.",
          uk: "Старе місто в мурах на мисі, а обабіч - найлюдніші пляжі узбережжя.",
          de: "Eine ummauerte Altstadt auf einer Landzunge, beidseits die vollsten Strände der Küste.",
          es: "Un casco antiguo amurallado sobre un cabo, con las playas más concurridas a ambos lados.",
        },
      },
      {
        name: "Sveti Stefan",
        lat: 42.256,
        lng: 18.892,
        note: {
          en: "An island village turned hotel, joined to the shore by a sand causeway.",
          uk: "Острівне село, перетворене на готель, з'єднане з берегом піщаною косою.",
          de: "Ein zum Hotel gewordenes Inseldorf, über eine Sanddammstraße mit dem Ufer verbunden.",
          es: "Un pueblo isla convertido en hotel, unido a la costa por un istmo de arena.",
        },
      },
      {
        name: "Tivat",
        lat: 42.433,
        lng: 18.693,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
  {
    routeId: "srt_popular_society_leeward",
    stops: [
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Check-in at Apooiti, the charter base for the Leeward Islands.",
          uk: "Реєстрація в Апооїті, чартерній базі Підвітряних островів.",
          de: "Check-in in Apooiti, der Charterbasis für die Inseln unter dem Winde.",
          es: "Check-in en Apooiti, la base chárter de las islas de Sotavento.",
        },
      },
      {
        name: "Taha'a",
        lat: -16.628,
        lng: -151.488,
        note: {
          en: "Vanilla plantations ashore and a coral garden you drift through on the current.",
          uk: "Ванільні плантації на березі й кораловий сад, крізь який несе течією.",
          de: "Vanilleplantagen an Land und ein Korallengarten, durch den die Strömung treibt.",
          es: "Plantaciones de vainilla en tierra y un jardín de coral por el que te lleva la corriente.",
        },
      },
      {
        name: "Bora Bora",
        lat: -16.501,
        lng: -151.742,
        note: {
          en: "Mount Otemanu rises above a turquoise lagoon, with the main pass on the western side.",
          uk: "Гора Отеману здіймається над бірюзовою лагуною, а головний прохід лежить із західного боку.",
          de: "Der Mount Otemanu erhebt sich über einer türkisfarbenen Lagune; der Hauptpass liegt im Westen.",
          es: "El monte Otemanu se alza sobre una laguna turquesa, con el paso principal en el lado oeste.",
        },
      },
      {
        name: "Taha'a",
        lat: -16.628,
        lng: -151.488,
        note: {
          en: "Vanilla plantations ashore and a coral garden you drift through on the current.",
          uk: "Ванільні плантації на березі й кораловий сад, крізь який несе течією.",
          de: "Vanilleplantagen an Land und ein Korallengarten, durch den die Strömung treibt.",
          es: "Plantaciones de vainilla en tierra y un jardín de coral por el que te lleva la corriente.",
        },
      },
      {
        name: "Raiatea",
        lat: -16.752,
        lng: -151.47,
        note: {
          en: "Back at the base: the boat is handed over in the morning.",
          uk: "Повернення на базу: яхту здають уранці.",
          de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
          es: "De vuelta en la base: el barco se entrega por la mañana.",
        },
      },
    ],
  },
];

/*
 * Every stop the seed has words for, by place name.
 *
 * A name that carries two places ("Kefalonia/Fiskardo") is filed under both, so a hand-written
 * stop that names only one of them still finds it. A place two routes describe differently is
 * dropped rather than guessed at -- the backfill wants one answer, not the first of several.
 */
function stopNoteLookup(): Map<string, Record<Locale, string> | null> {
  const lookup = new Map<string, Record<Locale, string> | null>();
  /* Without the last stop of each route: it carries the note about handing the boat back, which
     says nothing about the place and would collide with that same marina's arrival note. */
  const stops = [
    ...CATALOGUE_ROUTES.flatMap((route) => route.stops.slice(0, -1)),
    ...STOP_REFRESH.flatMap((entry) => entry.stops.slice(0, -1)),
  ];

  for (const stop of stops) {
    for (const alias of stop.name.split("/")) {
      const key = normalizeName(alias);
      if (!key) continue;
      const seen = lookup.get(key);
      if (seen === undefined) {
        lookup.set(key, stop.note);
        continue;
      }
      if (seen === null || seen.en !== stop.note.en) lookup.set(key, null);
    }
  }

  return lookup;
}

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Names a stop the seed does not own: one on a route staff wrote by hand.
 *
 * Matched on the place inside the name, because those routes are written the way a sailor says it
 * -- "ACI Marina Split", "Maslinica, Šolta" -- while this file names the island. A stop whose name
 * carries no place the seed knows, or several, is left alone and reported: a plausible wrong line
 * under a day is worse than a blank one.
 */
function matchNote(lookup: Map<string, Record<Locale, string> | null>, stopName: string) {
  const words = normalizeName(stopName);
  if (!words) return null;

  const direct = lookup.get(words);
  if (direct) return direct;

  const spoken = new Set(words.split(" "));
  const hits: Record<Locale, string>[] = [];
  for (const [key, note] of lookup) {
    if (!note) continue;
    /*
     * The place named inside the stop's own name: "ACI Marina Split" is Split, "Palmižana,
     * Pakleni" is the Pakleni islands. Words of three letters or fewer are ignored, because they
     * are the ones that collide ("Bol" is a town, "bay" and "isla" are not names at all).
     */
    if (key.split(" ").some((word) => word.length > 3 && spoken.has(word))) hits.push(note);
  }

  const [first] = hits;
  if (!first) return null;
  return hits.every((note) => note.en === first.en) ? first : null;
}

/**
 * Writes a route's stops and their per-locale notes.
 *
 * English lives on the stop row itself, which is what the read falls back to; the other three go in
 * `suggested_route_stop_translation`. The insert returns the ids rather than reading them back,
 * because a stop is identified by nothing but its route and position.
 */
async function writeStops(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  routeId: string,
  stops: SeedStop[],
) {
  if (stops.length === 0) return;

  const inserted = await tx
    .insert(suggestedRouteStop)
    .values(
      stops.map((stop, index) => ({
        routeId,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        sortOrder: index,
        note: stop.note.en,
      })),
    )
    .returning({ id: suggestedRouteStop.id, sortOrder: suggestedRouteStop.sortOrder });

  const rows = inserted.flatMap((row) => {
    const stop = stops[row.sortOrder];
    if (!stop) return [];
    return LOCALES.filter((locale) => locale !== "en").map((locale) => ({
      stopId: row.id,
      locale,
      note: stop.note[locale],
    }));
  });
  if (rows.length > 0) await tx.insert(suggestedRouteStopTranslation).values(rows);
}

export type CatalogueRoutesPlan = {
  /** Stops on routes this seed does not own that it could still name, and the ones it could not. */
  backfilled: { routeTitle: string; stop: string }[];
  unnamed: { routeTitle: string; stop: string }[];
  created: { id: string; title: string; target: string }[];
  existing: { id: string; title: string }[];
  unresolved: { id: string; title: string }[];
  stopsRefreshed: { routeId: string; stops: number }[];
  /** Routes in STOP_REFRESH that this database does not have, so nothing was refreshed for them. */
  missingRefreshTargets: string[];
};

/**
 * The charter base a route starts from: the nearest one to its first stop that still has published
 * listings, within `BASE_RADIUS_KM`.
 *
 * By position rather than by name because the two vendors spell the same marina differently
 * ("Göcek Mucev Marina", "Göcek/D-Marin") and mint their ids per environment, while the client's
 * file names the town. A base with no listings left is skipped: the card's link would find nothing.
 */
async function resolveBase(db: Database, stop: { lat: number; lng: number }) {
  /* Equirectangular distance in km, good enough at this scale and indexable-free. */
  const distanceKm = sql<number>`
    111.045 * sqrt(
      power(${base.lat} - ${stop.lat}, 2)
      + power((${base.lng} - ${stop.lng}) * cos(radians(${stop.lat})), 2)
    )`;
  const [row] = await db
    .select({ id: base.id, name: base.name, km: distanceKm })
    .from(base)
    .innerJoin(listing, and(eq(listing.homeBaseId, base.id), eq(listing.status, "published")))
    .where(
      sql`${base.lat} is not null and ${base.lng} is not null and ${distanceKm} <= ${BASE_RADIUS_KM}`,
    )
    .groupBy(base.id, base.name, base.lat, base.lng)
    .orderBy(distanceKm)
    .limit(1);
  return row ?? null;
}

async function resolveRegion(db: Database, target: { country: string; names: string[] }) {
  for (const name of target.names) {
    const [row] = await db
      .select({ id: region.id, name: region.name })
      .from(region)
      .innerJoin(country, eq(country.id, region.countryId))
      .where(and(eq(country.name, target.country), eq(region.name, name)))
      .limit(1);
    if (row) return row;
  }
  return null;
}

/**
 * Creates the client's routes that are missing and refreshes the featured twelve's stops.
 *
 * Every new route is published (`active`) but unfeatured: the home page keeps the twelve it has,
 * and staff pick from /routes what else belongs there. An existing route is left exactly as it is,
 * copy and target included -- after the first run the routes belong to the editors.
 *
 * A route whose start has no charter base within `BASE_RADIUS_KM` and no fallback region is
 * reported rather than anchored somewhere approximate: the schema requires exactly one of the two.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedCatalogueRoutes(
  db: Database,
  { apply }: { apply: boolean },
): Promise<CatalogueRoutesPlan> {
  const plan: CatalogueRoutesPlan = {
    backfilled: [],
    unnamed: [],
    created: [],
    existing: [],
    unresolved: [],
    stopsRefreshed: [],
    missingRefreshTargets: [],
  };

  const ids = CATALOGUE_ROUTES.map((route) => route.id);
  const existingRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  const existing = new Set(existingRows.map((row) => row.id));

  const toCreate: { route: SeedRoute; baseId: string | null; regionId: string | null }[] = [];
  for (const route of CATALOGUE_ROUTES) {
    if (existing.has(route.id)) {
      plan.existing.push({ id: route.id, title: route.copy.en.title });
      continue;
    }
    const first = route.stops[0];
    const nearest = first ? await resolveBase(db, first) : null;
    if (nearest) {
      plan.created.push({
        id: route.id,
        title: route.copy.en.title,
        target: `base ${nearest.name} (${Math.round(nearest.km)} km)`,
      });
      toCreate.push({ route, baseId: nearest.id, regionId: null });
      continue;
    }
    const fallback = route.fallbackRegion ? await resolveRegion(db, route.fallbackRegion) : null;
    if (!fallback) {
      plan.unresolved.push({ id: route.id, title: route.copy.en.title });
      continue;
    }
    plan.created.push({
      id: route.id,
      title: route.copy.en.title,
      target: `region ${fallback.name}`,
    });
    toCreate.push({ route, baseId: null, regionId: fallback.id });
  }

  const refreshIds = STOP_REFRESH.map((entry) => entry.routeId);
  const presentRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, refreshIds));
  const present = new Set(presentRows.map((row) => row.id));
  for (const entry of STOP_REFRESH) {
    if (present.has(entry.routeId)) {
      plan.stopsRefreshed.push({ routeId: entry.routeId, stops: entry.stops.length });
    } else {
      plan.missingRefreshTargets.push(entry.routeId);
    }
  }

  /*
   * Stops with no words under them, on routes this seed does not own. The client's list is only
   * part of what /routes holds: the rest was written by hand, and a card there prints a bare
   * "Day 3 - Vis" with nothing beneath it.
   */
  const ownIds = new Set([...ids, ...refreshIds]);
  const orphanStops = await db
    .select({
      id: suggestedRouteStop.id,
      routeId: suggestedRouteStop.routeId,
      name: suggestedRouteStop.name,
      sortOrder: suggestedRouteStop.sortOrder,
      routeTitle: suggestedRoute.title,
    })
    .from(suggestedRouteStop)
    .innerJoin(suggestedRoute, eq(suggestedRoute.id, suggestedRouteStop.routeId))
    .where(sql`coalesce(nullif(trim(${suggestedRouteStop.note}), ''), null) is null`);

  /* Which stop opens and which closes each of those routes, so a round trip's last day reads as
     the return rather than as a second check-in at the same marina. */
  const ends = new Map<string, { first: string; last: number }>();
  const orphanRouteIds = [...new Set(orphanStops.map((stop) => stop.routeId))].filter(
    (routeId) => !ownIds.has(routeId),
  );
  if (orphanRouteIds.length > 0) {
    const rows = await db
      .select({
        routeId: suggestedRouteStop.routeId,
        name: suggestedRouteStop.name,
        sortOrder: suggestedRouteStop.sortOrder,
      })
      .from(suggestedRouteStop)
      .where(inArray(suggestedRouteStop.routeId, orphanRouteIds));

    for (const row of rows) {
      const seen = ends.get(row.routeId);
      if (!seen) {
        ends.set(row.routeId, { first: row.name, last: row.sortOrder });
        continue;
      }
      if (row.sortOrder > seen.last) seen.last = row.sortOrder;
      if (row.sortOrder === 0) seen.first = row.name;
    }
  }

  const lookup = stopNoteLookup();
  const toName: { id: string; note: Record<Locale, string> }[] = [];
  for (const stop of orphanStops) {
    /* The seed rewrites its own routes' stops above, notes included. */
    if (ownIds.has(stop.routeId)) continue;

    const route = ends.get(stop.routeId);
    const returning =
      route !== undefined &&
      stop.sortOrder === route.last &&
      stop.sortOrder > 0 &&
      stop.name === route.first;
    const note = returning ? RETURN_NOTE : matchNote(lookup, stop.name);
    if (!note) {
      plan.unnamed.push({ routeTitle: stop.routeTitle, stop: stop.name });
      continue;
    }
    plan.backfilled.push({ routeTitle: stop.routeTitle, stop: stop.name });
    toName.push({ id: stop.id, note });
  }

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
        nights: 7,
        difficulty: route.difficulty,
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

      await writeStops(tx, route.id, route.stops);
    }

    for (const entry of STOP_REFRESH) {
      if (!present.has(entry.routeId)) continue;
      await tx.delete(suggestedRouteStop).where(eq(suggestedRouteStop.routeId, entry.routeId));
      await writeStops(tx, entry.routeId, entry.stops);
    }

    for (const { id, note } of toName) {
      await tx
        .update(suggestedRouteStop)
        .set({ note: note.en })
        .where(eq(suggestedRouteStop.id, id));

      await tx
        .insert(suggestedRouteStopTranslation)
        .values(
          LOCALES.filter((locale) => locale !== "en").map((locale) => ({
            stopId: id,
            locale,
            note: note[locale],
          })),
        )
        .onConflictDoUpdate({
          target: [suggestedRouteStopTranslation.stopId, suggestedRouteStopTranslation.locale],
          set: { note: sql`excluded.note`, updatedAt: new Date() },
        });
    }
  });

  return plan;
}
