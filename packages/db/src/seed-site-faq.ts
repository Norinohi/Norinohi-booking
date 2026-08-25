/**
 * The site-wide FAQ: twenty questions in six categories, as the client wrote them, answered
 * in the four locales the site serves.
 *
 * Site-wide entries are `faq` rows with a null `listing_id`, so nothing here references a
 * listing and this seeds a provider-synced database as readily as the mock fixtures.
 * `pnpm --filter @yacht-charter/db seed --faq-only` is that path.
 *
 * The answers are written against what this repository and the synced catalogue actually do -
 * the booking state machine, the sync schedules, the payment policy in `resolvePaymentPolicy`,
 * the Stripe path, the crew and licence derivation, and the extras the vendors really charge.
 * Where a term is the operator's to set rather than ours - cancellation, rescheduling, what a
 * charter pack contains - the answer says so instead of naming a figure. That hedge is the
 * accurate statement, and the same one `cancellationPaymentPolicies: varies_by_selection`
 * already makes on the listing page; do not sharpen it into a number in any locale.
 *
 * Ukrainian is the client's own wording. The other three are translations of it, because the
 * detail read matches locale exactly with no fallback - an entry missing in a locale is simply
 * absent from that page rather than served in Ukrainian.
 */
import { sql } from "drizzle-orm";

import { db } from "./index";
import { faq, faqCategory } from "./schema/content";

type FaqCategoryValue = (typeof faqCategory.enumValues)[number];

/** The site's four locales; `en` is the default. */
const LOCALES = ["en", "de", "es", "uk"] as const;

type Locale = (typeof LOCALES)[number];

/** Every locale is required: a question present in three of four is a hole in one page. */
type Localized = Record<Locale, string>;

type SiteFaqEntry = {
  category: FaqCategoryValue;
  question: Localized;
  answer: Localized;
};

const entries: SiteFaqEntry[] = [
  {
    category: "booking",
    question: {
      en: "How do I book a yacht?",
      de: "Wie buche ich eine Yacht?",
      es: "¿Cómo reservo un yate?",
      uk: "Як забронювати яхту?",
    },
    answer: {
      en: "Pick your dates and the crew option on the yacht's page, check the price breakdown, leave your details and pay. We send a confirmation request to the charter company, and once it answers, the booking is confirmed. The confirmation and the documents arrive by email.",
      de: "Wählen Sie auf der Seite der Yacht Zeitraum und Crew-Variante, prüfen Sie die Preisaufstellung, geben Sie Ihre Daten an und bezahlen Sie. Wir senden eine Bestätigungsanfrage an das Charterunternehmen; sobald es antwortet, ist die Buchung bestätigt. Bestätigung und Unterlagen erhalten Sie per E-Mail.",
      es: "Elige las fechas y el tipo de tripulación en la página del yate, revisa el desglose del precio, deja tus datos y paga. Enviamos una solicitud de confirmación a la empresa de chárter y, en cuanto responde, la reserva queda confirmada. La confirmación y los documentos llegan por correo electrónico.",
      uk: "Оберіть дати й тип екіпажу на сторінці яхти, перевірте розрахунок вартості, залиште свої дані та оплатіть. Ми надсилаємо запит на підтвердження чартерній компанії, і після її відповіді бронювання стає підтвердженим. Підтвердження й документи приходять на пошту.",
    },
  },
  {
    category: "booking",
    question: {
      en: "Is availability shown in real time?",
      de: "Wird die Verfügbarkeit in Echtzeit angezeigt?",
      es: "¿La disponibilidad se muestra en tiempo real?",
      uk: "Чи доступна яхта в реальному часі?",
    },
    answer: {
      en: "Availability is refreshed every hour from the charter companies' systems, and the catalogue once a day. The final availability and price are re-checked with the operator at the moment of booking, so what you see on the payment page has already been verified with them.",
      de: "Die Verfügbarkeit wird stündlich aus den Systemen der Charterunternehmen aktualisiert, der Katalog einmal täglich. Endgültige Verfügbarkeit und Preis fragen wir im Moment der Buchung erneut beim Anbieter ab; was Sie auf der Zahlungsseite sehen, ist also bereits mit ihm abgeglichen.",
      es: "La disponibilidad se actualiza cada hora desde los sistemas de las empresas de chárter, y el catálogo una vez al día. La disponibilidad y el precio definitivos los volvemos a consultar con el operador en el momento de reservar, así que lo que ves en la página de pago ya está contrastado con él.",
      uk: "Доступність оновлюється щогодини з систем чартерних компаній, а каталог раз на добу. Остаточну наявність і ціну ми перезапитуємо в оператора безпосередньо в момент бронювання, тому те, що ви бачите на сторінці оплати, уже звірене з ним.",
    },
  },
  {
    category: "booking",
    question: {
      en: "When is a booking considered confirmed?",
      de: "Wann gilt eine Buchung als bestätigt?",
      es: "¿Cuándo se considera confirmada una reserva?",
      uk: "Коли бронювання вважається підтвердженим?",
    },
    answer: {
      en: "Once the charter company has confirmed it in its own system. Until then the booking is being processed and your card is only held, not charged. If the operator declines, the hold is released and you pay nothing.",
      de: "Sobald das Charterunternehmen sie in seinem eigenen System bestätigt hat. Bis dahin wird die Buchung bearbeitet und Ihre Karte nur reserviert, nicht belastet. Lehnt der Anbieter ab, wird die Reservierung freigegeben und Sie zahlen nichts.",
      es: "Cuando la empresa de chárter la confirma en su propio sistema. Hasta entonces la reserva está en trámite y tu tarjeta solo está retenida, no cobrada. Si el operador la rechaza, se libera la retención y no pagas nada.",
      uk: "Після того як чартерна компанія підтвердить його у своїй системі. До того бронювання перебуває в обробці, а кошти на картці лише заблоковані, не списані. Якщо оператор відмовить, блокування знімається і ви нічого не платите.",
    },
  },
  {
    category: "booking",
    question: {
      en: "Can a yacht be put on option?",
      de: "Kann eine Yacht auf Option gelegt werden?",
      es: "¿Se puede poner un yate en opción?",
      uk: "Чи можна поставити яхту на опцію?",
    },
    answer: {
      en: "Yes, if the operator allows it: the yacht is held without payment for a limited time that the charter company itself sets. If the option runs out unpaid, the yacht is released and the booking goes back to the quote stage.",
      de: "Ja, sofern der Anbieter es zulässt: Die Yacht wird ohne Zahlung für eine begrenzte Zeit reserviert, die das Charterunternehmen selbst festlegt. Läuft die Option ohne Zahlung ab, wird die Yacht wieder freigegeben und die Buchung kehrt zur Preisberechnung zurück.",
      es: "Sí, si el operador lo permite: el yate queda retenido sin pago durante un tiempo limitado que fija la propia empresa de chárter. Si la opción vence sin pago, el yate se libera y la reserva vuelve a la fase de presupuesto.",
      uk: "Так, якщо оператор це дозволяє: яхта резервується без оплати на обмежений час, який визначає сама чартерна компанія. Якщо опція спливає без оплати, яхта звільняється, а бронювання повертається до етапу розрахунку.",
    },
  },
  {
    category: "payment",
    question: {
      en: "Which payment methods are available?",
      de: "Welche Zahlungsmethoden sind verfügbar?",
      es: "¿Qué métodos de pago están disponibles?",
      uk: "Які способи оплати доступні?",
    },
    answer: {
      en: "Online we accept card payment through Stripe. Some charges are collected by the charter base in person at check-in: the tourist tax, the refundable security deposit, fuel. Those are paid directly at the base.",
      de: "Online akzeptieren wir Kartenzahlung über Stripe. Einen Teil der Beträge erhebt die Charterbasis vor Ort beim Check-in: Kurtaxe, rückzahlbare Kaution, Treibstoff. Diese werden direkt an der Basis bezahlt.",
      es: "En línea aceptamos el pago con tarjeta a través de Stripe. Una parte de los importes los cobra la base de chárter en persona al check-in: la tasa turística, la fianza reembolsable y el combustible. Esos se abonan directamente en la base.",
      uk: "Онлайн ми приймаємо оплату карткою через Stripe. Частину платежів чартерна база збирає на місці при заїзді: туристичний збір, поворотну заставу, паливо. Їх оплачують безпосередньо на базі.",
    },
  },
  {
    category: "payment",
    question: {
      en: "Do I have to pay 100% up front?",
      de: "Muss ich 100 % im Voraus bezahlen?",
      es: "¿Hay que pagar el 100 % por adelantado?",
      uk: "Чи потрібно оплачувати 100% одразу?",
    },
    answer: {
      en: "If the charter starts more than two months from now, a 50% prepayment is usually enough, with the rest due before the start. If it starts within two months, the full amount is due at once. The exact terms for a particular yacht are shown in the price breakdown before you pay.",
      de: "Liegt der Charterbeginn mehr als zwei Monate in der Zukunft, genügt in der Regel eine Anzahlung von 50 %, der Rest ist vor dem Törnbeginn fällig. Beginnt der Törn in weniger als zwei Monaten, ist der volle Betrag sofort fällig. Die genauen Bedingungen für die jeweilige Yacht stehen vor der Zahlung in der Preisaufstellung.",
      es: "Si faltan más de dos meses para el inicio del chárter, normalmente basta con un anticipo del 50 % y el resto antes de la salida. Si faltan menos de dos meses, se paga el importe completo de una vez. Las condiciones exactas de cada yate aparecen en el desglose del precio antes de pagar.",
      uk: "Якщо до початку чартеру більше двох місяців, зазвичай достатньо передоплати 50%, решта до старту. Якщо до початку менше двох місяців, оплата повна одразу. Точні умови для конкретної яхти видно в розрахунку перед оплатою.",
    },
  },
  {
    category: "payment",
    question: {
      en: "Can I pay by card?",
      de: "Kann ich mit Karte bezahlen?",
      es: "¿Puedo pagar con tarjeta?",
      uk: "Чи можна оплатити карткою?",
    },
    answer: {
      en: "Yes. The payment happens in Stripe's form, and we neither receive nor store your card number.",
      de: "Ja. Die Zahlung erfolgt im Stripe-Formular; Ihre Kartennummer erhalten und speichern wir nicht.",
      es: "Sí. El pago se realiza en el formulario de Stripe, y nosotros no recibimos ni guardamos el número de tu tarjeta.",
      uk: "Так. Оплата відбувається у формі Stripe, і номер вашої картки ми не отримуємо й не зберігаємо.",
    },
  },
  {
    category: "payment",
    question: {
      en: "Is paying through Stripe safe?",
      de: "Ist die Zahlung über Stripe sicher?",
      es: "¿Es seguro pagar a través de Stripe?",
      uk: "Чи безпечна оплата через Stripe?",
    },
    answer: {
      en: "Card details are entered in Stripe's secure form and never reach our servers. All we keep is the payment identifier, which we use to check its status.",
      de: "Die Kartendaten werden im gesicherten Stripe-Formular eingegeben und gelangen nicht auf unsere Server. Wir speichern nur die Zahlungskennung, mit der wir den Status der Zahlung abgleichen.",
      es: "Los datos de la tarjeta se introducen en el formulario seguro de Stripe y no llegan a nuestros servidores. Solo guardamos el identificador del pago, con el que comprobamos su estado.",
      uk: "Дані картки вводяться у захищеній формі Stripe і на наші сервери не потрапляють. Ми зберігаємо лише ідентифікатор платежу, за яким звіряємо його статус.",
    },
  },
  {
    category: "prices",
    question: {
      en: "What is included in the rental price?",
      de: "Was ist im Mietpreis enthalten?",
      es: "¿Qué incluye el precio del alquiler?",
      uk: "Що входить у вартість оренди?",
    },
    answer: {
      en: "The rental price is the yacht itself for the chosen period, with its standard equipment. The operator's obligatory charges and the optional extras are listed separately in the price breakdown, so the final total is visible before you pay.",
      de: "Der Mietpreis umfasst die Yacht selbst für den gewählten Zeitraum mit ihrer Standardausrüstung. Die obligatorischen Zuschläge des Anbieters und die optionalen Extras stehen als eigene Liste in der Preisaufstellung, sodass der Endbetrag vor der Zahlung sichtbar ist.",
      es: "El precio del alquiler es el yate en sí para el periodo elegido, con su equipamiento de serie. Los suplementos obligatorios del operador y los extras opcionales aparecen en una lista aparte dentro del desglose, así que el total final se ve antes de pagar.",
      uk: "Вартість оренди це сама яхта на обраний період зі штатним обладнанням. Обов'язкові доплати оператора й додаткові опції показані окремим списком у розрахунку, тому підсумкову суму видно до оплати.",
    },
  },
  {
    category: "prices",
    question: {
      en: "What is a Charter Pack?",
      de: "Was ist ein Charter Pack?",
      es: "¿Qué es el Charter Pack?",
      uk: "Що таке Charter Pack?",
    },
    answer: {
      en: "It is the charter base's standard package. It usually covers a gas cylinder, full fresh-water tanks, electricity at the base and a berth in the home marina for the whole charter. Operators put it together and name it differently, so check its contents and price in the extras list of the particular yacht.",
      de: "Das ist das Standardpaket der Charterbasis. Es umfasst meist eine Gasflasche, volle Frischwassertanks, Strom an der Basis und einen Liegeplatz in der Heimatmarina für die gesamte Charterdauer. Die Anbieter stellen es unterschiedlich zusammen und benennen es unterschiedlich; Inhalt und Preis finden Sie daher in der Zuschlagsliste der jeweiligen Yacht.",
      es: "Es el paquete estándar de la base de chárter. Suele incluir una bombona de gas, los depósitos de agua dulce llenos, electricidad en la base y amarre en la marina base durante todo el chárter. Cada operador lo compone y lo llama de forma distinta, así que consulta su contenido y su precio en la lista de suplementos de cada yate.",
      uk: "Це стандартний пакет чартерної бази. Зазвичай він включає газовий балон, повні баки прісної води, електрику на базі та стоянку в домашній марині протягом усього чартеру. Оператори комплектують і називають його по-різному, тому склад і ціну дивіться в списку доплат конкретної яхти.",
    },
  },
  {
    category: "prices",
    question: {
      en: "What extra costs can come up?",
      de: "Welche zusätzlichen Kosten können anfallen?",
      es: "¿Qué gastos adicionales pueden surgir?",
      uk: "Які додаткові витрати можуть виникнути?",
    },
    answer: {
      en: "Most often the final cleaning, the tourist tax, fuel, berths in marinas other than the home one, a skipper or a hostess, water toys. We show the obligatory charges in the price breakdown; the rest depends on your route.",
      de: "Meist die Endreinigung, die Kurtaxe, Treibstoff, Liegeplätze in fremden Marinas, Skipper oder Hostess sowie Wassersportgeräte. Die obligatorischen Zuschläge zeigen wir in der Preisaufstellung, alles Weitere hängt von Ihrer Route ab.",
      es: "Lo más habitual: la limpieza final, la tasa turística, el combustible, los amarres en marinas distintas de la base, un patrón o una azafata y los juguetes acuáticos. Los suplementos obligatorios los mostramos en el desglose; el resto depende de tu ruta.",
      uk: "Найчастіше це фінальне прибирання, туристичний збір, паливо, стоянки в чужих маринах, шкіпер або хостес, водні розваги. Обов'язкові доплати ми показуємо в розрахунку, решта залежить від вашого маршруту.",
    },
  },
  {
    category: "prices",
    question: {
      en: "Is fuel included?",
      de: "Ist der Treibstoff inbegriffen?",
      es: "¿El combustible está incluido?",
      uk: "Чи входить паливо?",
    },
    answer: {
      en: "No. Fuel is paid separately, usually by actual consumption when the yacht is returned to the base.",
      de: "Nein. Der Treibstoff wird gesondert bezahlt, in der Regel nach tatsächlichem Verbrauch bei der Rückgabe der Yacht an der Basis.",
      es: "No. El combustible se paga aparte, normalmente según el consumo real al devolver el yate a la base.",
      uk: "Ні. Паливо оплачується окремо, зазвичай за фактом витрати при поверненні яхти на базу.",
    },
  },
  {
    category: "licences",
    question: {
      en: "Do I need a skipper's licence?",
      de: "Brauche ich einen Segelschein?",
      es: "¿Necesito titulación náutica?",
      uk: "Чи потрібна ліцензія шкіпера?",
    },
    answer: {
      en: "For a bareboat yacht you need a licence recognised in the country of the charter, and in most destinations a radio certificate as well. If you take the yacht with a skipper or with a crew, no licence is needed.",
      de: "Für eine Yacht ohne Crew brauchen Sie einen im Charterland anerkannten Schein, in den meisten Revieren zusätzlich ein Funkzeugnis. Wenn Sie die Yacht mit Skipper oder mit Crew nehmen, ist kein Schein erforderlich.",
      es: "Para un yate sin tripulación necesitas una titulación reconocida en el país del chárter y, en la mayoría de los destinos, también un certificado de radio. Si tomas el yate con patrón o con tripulación, no hace falta titulación.",
      uk: "Для яхти без екіпажу потрібні права, визнані в країні чартеру, а на більшості напрямків додатково радіосертифікат. Якщо ви берете яхту зі шкіпером або з екіпажем, ліцензія не потрібна.",
    },
  },
  {
    category: "licences",
    question: {
      en: "Can I charter a yacht with a skipper?",
      de: "Kann ich eine Yacht mit Skipper chartern?",
      es: "¿Puedo alquilar un yate con patrón?",
      uk: "Чи можна орендувати яхту зі шкіпером?",
    },
    answer: {
      en: "Yes, if the operator offers that option. The crew choice is on the yacht's page, and the skipper's cost is added to the price breakdown.",
      de: "Ja, sofern der Anbieter diese Option anbietet. Die Crew-Auswahl finden Sie auf der Seite der Yacht, und die Kosten für den Skipper kommen in der Preisaufstellung hinzu.",
      es: "Sí, si el operador ofrece esa opción. La elección de tripulación está en la página del yate, y el coste del patrón se añade al desglose del precio.",
      uk: "Так, якщо оператор пропонує таку опцію. Вибір екіпажу є на сторінці яхти, а вартість шкіпера додається до розрахунку.",
    },
  },
  {
    category: "travel",
    question: {
      en: "What should I bring with me?",
      de: "Was sollte ich mitnehmen?",
      es: "¿Qué debo llevar?",
      uk: "Що потрібно взяти із собою?",
    },
    answer: {
      en: "Identity documents for everyone on board, and the skipper's licence if you are sailing bareboat. A soft bag rather than a suitcase, because there is nowhere to stow hard cases. Shoes with light, non-slip soles, sun protection, personal medication. Bed linen and towels are usually provided by the base.",
      de: "Ausweisdokumente für alle an Bord und den Segelschein, wenn Sie ohne Crew fahren. Eine weiche Tasche statt eines Koffers, denn Hartschalenkoffer lassen sich an Bord nicht verstauen. Schuhe mit heller, rutschfester Sohle, Sonnenschutz, persönliche Medikamente. Bettwäsche und Handtücher stellt in der Regel die Basis.",
      es: "La documentación de todos los que van a bordo y la titulación del patrón si navegas sin tripulación. Una bolsa blanda en lugar de maleta, porque las maletas rígidas no se pueden guardar a bordo. Calzado de suela clara y antideslizante, protección solar y tu medicación personal. La ropa de cama y las toallas suele proporcionarlas la base.",
      uk: "Документи на всіх, хто на борту, і права шкіпера, якщо ви йдете без екіпажу. М'яку сумку замість валізи, бо тверді валізи ніде зберігати. Взуття зі світлою нековзкою підошвою, сонцезахист, особисті ліки. Постіль і рушники зазвичай видає база.",
    },
  },
  {
    category: "travel",
    question: {
      en: "What are the check-in / check-out times?",
      de: "Wann sind Check-in und Check-out?",
      es: "¿A qué hora son el check-in y el check-out?",
      uk: "Який час check-in / check-out?",
    },
    answer: {
      en: "Check-in and check-out times are set by the charter base and are stated on each yacht's page. Most often check-in is in the afternoon and check-out in the morning.",
      de: "Die Check-in- und Check-out-Zeiten legt die Charterbasis fest; sie stehen auf der Seite jeder Yacht. Meist ist der Check-in am Nachmittag und der Check-out am Vormittag.",
      es: "Los horarios de check-in y check-out los fija la base de chárter y aparecen en la página de cada yate. Lo más habitual es entrar por la tarde y salir por la mañana.",
      uk: "Час заїзду й виїзду встановлює чартерна база, і він указаний на сторінці кожної яхти. Найчастіше заїзд у другій половині дня, а виїзд уранці.",
    },
  },
  {
    category: "travel",
    question: {
      en: "Can the route be changed?",
      de: "Kann die Route geändert werden?",
      es: "¿Se puede cambiar la ruta?",
      uk: "Чи можна змінити маршрут?",
    },
    answer: {
      en: "Yes, you choose the route yourself within the permitted sailing area. Individual restrictions do exist, for example crossing into another country or sailing out to remote islands, and those are agreed with the base in advance.",
      de: "Ja, die Route wählen Sie selbst innerhalb des zugelassenen Fahrtgebiets. Einzelne Einschränkungen gibt es dennoch, etwa das Überqueren einer Landesgrenze oder Törns zu abgelegenen Inseln; sie werden vorab mit der Basis abgestimmt.",
      es: "Sí, la ruta la eliges tú dentro de la zona de navegación permitida. Hay algunas restricciones, por ejemplo salir a otro país o navegar hasta islas remotas, y esas se acuerdan con la base por adelantado.",
      uk: "Так, маршрут ви обираєте самі в межах дозволеної акваторії. Окремі обмеження бувають, наприклад вихід в іншу країну чи перехід до віддалених островів, і їх узгоджують з базою заздалегідь.",
    },
  },
  {
    category: "travel",
    question: {
      en: "What should I do in bad weather?",
      de: "Was tun bei schlechtem Wetter?",
      es: "¿Qué hacer si hace mal tiempo?",
      uk: "Що робити при поганій погоді?",
    },
    answer: {
      en: "Go by the forecast and by the base's advice. In dangerous conditions the base can restrict going out to sea. It is a question of safety, and deciding to sit the weather out in the marina is a normal part of sailing.",
      de: "Richten Sie sich nach der Wettervorhersage und den Empfehlungen der Basis. Bei gefährlichen Bedingungen kann die Basis das Auslaufen einschränken. Das ist eine Frage der Sicherheit, und die Entscheidung, das Wetter in der Marina abzuwarten, gehört ganz normal zum Segeln.",
      es: "Guíate por la previsión meteorológica y por las recomendaciones de la base. En condiciones peligrosas la base puede restringir la salida a mar abierto. Es una cuestión de seguridad, y decidir esperar en la marina a que pase el mal tiempo forma parte normal de la navegación.",
      uk: "Орієнтуйтесь на прогноз і рекомендації бази. За небезпечних умов база може обмежити вихід у море. Це питання безпеки, і рішення перечекати негоду в марині є нормальною частиною плавання.",
    },
  },
  {
    category: "cancellation",
    question: {
      en: "What are the cancellation terms?",
      de: "Wie lauten die Stornierungsbedingungen?",
      es: "¿Cuáles son las condiciones de cancelación?",
      uk: "Які умови скасування?",
    },
    answer: {
      en: "Cancellation terms are set by the charter company and differ between operators and rates. The terms for the yacht you chose are shown in the price breakdown before you pay.",
      de: "Die Stornierungsbedingungen legt das Charterunternehmen fest; sie unterscheiden sich je nach Anbieter und Tarif. Die Bedingungen für die gewählte Yacht stehen vor der Zahlung in der Preisaufstellung.",
      es: "Las condiciones de cancelación las fija la empresa de chárter y varían según el operador y la tarifa. Las condiciones del yate elegido se muestran en el desglose del precio antes de pagar.",
      uk: "Умови скасування встановлює чартерна компанія, і вони відрізняються між операторами й тарифами. Умови для обраної яхти показуються в розрахунку перед оплатою.",
    },
  },
  {
    category: "cancellation",
    question: {
      en: "Can a booking be rescheduled?",
      de: "Kann eine Buchung verschoben werden?",
      es: "¿Se puede cambiar la reserva a otras fechas?",
      uk: "Чи можна перенести бронювання?",
    },
    answer: {
      en: "Rescheduling depends on the charter company and on whether other dates are free. Write to us and we will put the request to the operator.",
      de: "Eine Verschiebung hängt vom Charterunternehmen und von freien Terminen ab. Schreiben Sie uns, und wir stellen die Anfrage beim Anbieter.",
      es: "El cambio de fechas depende de la empresa de chárter y de que haya fechas libres. Escríbenos y trasladaremos la solicitud al operador.",
      uk: "Перенесення залежить від чартерної компанії та наявності вільних дат. Напишіть нам, і ми зробимо запит оператору.",
    },
  },
];

/**
 * Ids are derived from locale, category and position so a re-run edits the row it wrote last
 * time rather than adding a second copy of the question. Reordering a category therefore
 * rewrites the entries in it, which is the trade that keeps this file the single source. The
 * locale sits in the id because the same question is a separate row in each of the four.
 */
function rows(): (typeof faq.$inferInsert)[] {
  return LOCALES.flatMap((locale) => {
    const seen = new Map<FaqCategoryValue, number>();

    return entries.map((entry) => {
      const position = (seen.get(entry.category) ?? 0) + 1;
      seen.set(entry.category, position);

      return {
        id: `faq_site_${locale}_${entry.category}_${position}`,
        listingId: null,
        category: entry.category,
        locale,
        question: entry.question[locale],
        answer: entry.answer[locale],
        sortOrder: position,
      };
    });
  });
}

export async function seedSiteFaq(database = db): Promise<number> {
  const values = rows();

  await database
    .insert(faq)
    .values(values)
    .onConflictDoUpdate({
      target: faq.id,
      set: {
        category: sql.raw("excluded.category"),
        locale: sql.raw("excluded.locale"),
        question: sql.raw("excluded.question"),
        answer: sql.raw("excluded.answer"),
        sortOrder: sql.raw("excluded.sort_order"),
      },
    });

  return values.length;
}
