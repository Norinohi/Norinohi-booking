import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "./schema/index";
import { facetMedia, facetMediaTranslation } from "./schema/facet-media";
import { normalizedKey, normalizedKeySql } from "./search/normalize";

type Database = NodePgDatabase<typeof schema>;
/*
 * English has no translation row: its label is the catalogue's own value, and a row here would
 * override it and mix "Motor Boat" in among "Sailing yacht" in the filters.
 */
type Locale = "uk" | "de" | "es";
const LOCALES: Locale[] = ["uk", "de", "es"];
type Copy = { label: string; description: string };

type SeedBoatType = {
  /** The facet value as the catalogue spells it, matched on its normalized form. */
  value: string;
  description: string;
  copy: Record<Locale, Copy>;
};

/**
 * The boat-type cards' copy in every locale: the client's texts for Gulet, Motor boat, House boat
 * and Motor catamaran, and the copy the first four types already carried in `seed.ts`.
 *
 * The German for those first four was never written alongside the rest, so it is a draft here.
 */
export const BOAT_TYPES: SeedBoatType[] = [
  {
    value: "Catamaran",
    description: "Stable, wide, and shallow-draft. The family and group default.",
    copy: {
      uk: {
        label: "Катамаран",
        description: "Стійкий, просторий, з малою осадкою. Типовий вибір для сімʼї та компанії.",
      },
      de: {
        label: "Katamaran",
        description:
          "Stabil, geräumig und mit wenig Tiefgang. Die erste Wahl für Familien und Gruppen.",
      },
      es: {
        label: "Catamarán",
        description: "Estable, amplio y de poco calado. La opción habitual para familias y grupos.",
      },
    },
  },
  {
    value: "Sailing yacht",
    description: "The classic monohull charter. Best value per cabin under sail.",
    copy: {
      uk: {
        label: "Вітрильна яхта",
        description: "Класичний однокорпусник. Найкраща ціна за каюту під вітрилами.",
      },
      de: {
        label: "Segelyacht",
        description:
          "Der klassische Einrumpf-Charter. Das beste Preis-Leistungs-Verhältnis pro Kabine unter Segeln.",
      },
      es: {
        label: "Velero",
        description: "El monocasco clásico de alquiler. La mejor relación precio por camarote.",
      },
    },
  },
  {
    value: "Motor boat",
    description:
      "A fast and agile option for coastal trips and day excursions. A great choice for those who value freedom and flexibility.",
    copy: {
      uk: {
        label: "Моторний човен",
        description:
          "Маневрений і швидкий варіант для подорожей узбережжям та одноденних поїздок. Чудовий вибір для тих, хто цінує свободу та динаміку.",
      },
      de: {
        label: "Motorboot",
        description:
          "Eine schnelle und wendige Option für Küstentouren und Tagesausflüge. Ideal für alle, die Freiheit und Flexibilität schätzen.",
      },
      es: {
        label: "Lancha a motor",
        description:
          "Una opción rápida y ágil para recorrer la costa y realizar excursiones de un día. Ideal para quienes valoran la libertad y la flexibilidad.",
      },
    },
  },
  {
    value: "Motor yacht",
    description: "Cover more coast per day, with no sailing experience required.",
    copy: {
      uk: {
        label: "Моторна яхта",
        description: "Більше узбережжя за день, досвід керування вітрилами не потрібен.",
      },
      de: {
        label: "Motoryacht",
        description: "Mehr Küste pro Tag, ganz ohne Segelerfahrung.",
      },
      es: {
        label: "Yate a motor",
        description: "Más costa por día y sin necesidad de experiencia a vela.",
      },
    },
  },
  {
    value: "House boat",
    description:
      "A floating home with a cozy living space and all the essentials for a comfortable stay. Ideal for slow-paced journeys on inland waters.",
    copy: {
      uk: {
        label: "Хаусбот",
        description:
          "Плавучий будинок із затишним житловим простором та усіма зручностями для комфортного відпочинку. Ідеальний для повільних подорожей внутрішніми водами.",
      },
      de: {
        label: "Hausboot",
        description:
          "Ein schwimmendes Zuhause mit gemütlichem Wohnbereich und allem, was man für einen komfortablen Aufenthalt braucht. Ideal für entspannte Reisen auf Binnengewässern.",
      },
      es: {
        label: "Casa flotante",
        description:
          "Una casa flotante con un acogedor espacio habitable y todo lo necesario para una estancia confortable. Ideal para disfrutar de viajes tranquilos por aguas interiores.",
      },
    },
  },
  {
    value: "Gulet",
    description:
      "A traditional wooden yacht with a spacious deck and comfortable areas for relaxing. An ideal choice for leisurely coastal journeys.",
    copy: {
      uk: {
        label: "Гулет",
        description:
          "Традиційна дерев’яна яхта з просторою палубою та комфортними зонами для відпочинку. Ідеальний вибір для неспішних подорожей узбережжям.",
      },
      de: {
        label: "Gulet",
        description:
          "Eine traditionelle Holzyacht mit großzügigem Deck und komfortablen Bereichen zum Entspannen. Ideal für entspannte Reisen entlang der Küste.",
      },
      es: {
        label: "Goleta",
        description:
          "Un yate tradicional de madera con una amplia cubierta y cómodas zonas de descanso. Una opción ideal para recorrer la costa sin prisas.",
      },
    },
  },
  {
    value: "Motor catamaran",
    description:
      "A spacious and stable yacht with comfortable areas for relaxing. A great choice for longer journeys and group getaways.",
    copy: {
      uk: {
        label: "Моторний катамаран",
        description:
          "Просторий і стабільний формат яхти з комфортними зонами для відпочинку. Чудовий вибір для тривалих подорожей та відпочинку компанією.",
      },
      de: {
        label: "Motorkatamaran",
        description:
          "Eine geräumige und stabile Yacht mit komfortablen Bereichen zum Entspannen. Eine hervorragende Wahl für längere Reisen und Urlaub mit Freunden oder Familie.",
      },
      es: {
        label: "Catamarán a motor",
        description:
          "Un yate espacioso y estable con cómodas zonas de descanso. Una excelente opción para viajes largos y escapadas en grupo.",
      },
    },
  },
  {
    value: "Luxury yacht",
    description: "Crewed, fully catered, and specified to hotel standard.",
    copy: {
      uk: {
        label: "Люкс-яхта",
        description: "З екіпажем, повним харчуванням і рівнем оснащення готелю.",
      },
      de: {
        label: "Luxusyacht",
        description: "Mit Crew, voller Verpflegung und ausgestattet auf Hotelniveau.",
      },
      es: {
        label: "Yate de lujo",
        description: "Con tripulación, pensión completa y equipamiento de nivel hotelero.",
      },
    },
  },
];

export type BoatTypesPlan = {
  /** Values with no facet_media row yet, which the seed inserts. */
  created: string[];
  updated: string[];
  unchanged: string[];
};

async function findRow(db: Database, value: string) {
  const [row] = await db
    .select({ id: facetMedia.id, description: facetMedia.description })
    .from(facetMedia)
    .where(
      and(
        eq(facetMedia.kind, "category"),
        sql`${normalizedKeySql(sql`${facetMedia.value}`)} = ${normalizedKey(value)}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Writes the boat types' label and description in every locale, and nothing else: image, ranks and
 * filter visibility stay as the admin screen left them.
 *
 * Rows are found by normalized value rather than by id, because the ids were minted per environment
 * by the translations pipeline. The copy lands as `editorial`, which is what keeps the pipeline and
 * the catalogue sync from writing over it.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedBoatTypes(
  db: Database,
  { apply }: { apply: boolean },
): Promise<BoatTypesPlan> {
  const plan: BoatTypesPlan = { created: [], updated: [], unchanged: [] };
  const rows = new Map<string, { id: string } | null>();

  for (const boatType of BOAT_TYPES) {
    const row = await findRow(db, boatType.value);
    rows.set(boatType.value, row);
    if (!row) {
      plan.created.push(boatType.value);
      continue;
    }

    const translations = await db
      .select({
        locale: facetMediaTranslation.locale,
        label: facetMediaTranslation.label,
        description: facetMediaTranslation.description,
      })
      .from(facetMediaTranslation)
      .where(eq(facetMediaTranslation.facetMediaId, row.id));
    const same =
      row.description === boatType.description &&
      LOCALES.every((locale) =>
        translations.some(
          (translation) =>
            translation.locale === locale &&
            translation.label === boatType.copy[locale].label &&
            translation.description === boatType.copy[locale].description,
        ),
      );
    (same ? plan.unchanged : plan.updated).push(boatType.value);
  }

  if (!apply) return plan;

  await db.transaction(async (tx) => {
    for (const boatType of BOAT_TYPES) {
      const found = rows.get(boatType.value);
      let facetMediaId: string;
      if (found) {
        facetMediaId = found.id;
        await tx
          .update(facetMedia)
          .set({ description: boatType.description })
          .where(eq(facetMedia.id, facetMediaId));
      } else {
        const [inserted] = await tx
          .insert(facetMedia)
          .values({
            kind: "category",
            value: boatType.value,
            description: boatType.description,
          })
          .returning({ id: facetMedia.id });
        if (!inserted) throw new Error(`facet_media insert returned nothing for ${boatType.value}`);
        facetMediaId = inserted.id;
      }

      await tx
        .insert(facetMediaTranslation)
        .values(
          LOCALES.map((locale) => ({
            facetMediaId,
            locale,
            label: boatType.copy[locale].label,
            description: boatType.copy[locale].description,
            source: "editorial" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [facetMediaTranslation.facetMediaId, facetMediaTranslation.locale],
          set: {
            label: sql`excluded.label`,
            description: sql`excluded.description`,
            source: sql`excluded.source`,
          },
        });
    }
  });

  return plan;
}
