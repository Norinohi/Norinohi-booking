"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@yacht-charter/ui/components/overlay/sheet";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useId, useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
  ACCOUNT_NAV_HREFS,
  type AccountNavItem,
  type AdminGroupKey,
  canSeeNavSection,
  NAV_SECTIONS,
  type NavSection,
} from "./account-nav";

/*
 * Sidebar, Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Inbox", "Payments",
 * "Yachts", "Content", "Discount Manager" and "Audit Log", the middle two expanding into
 * their own rows. Rows with a route render as links and read their active state from the
 * pathname; rows whose page doesn't exist yet stay as inert buttons highlighted only by
 * `defaultActive`.
 *
 * Staff see two labelled groups rather than one long list, because the two halves answer to
 * different people: "My Bookings" is the reader's own charter, "Payments" is everyone's money.
 * The rows themselves stay identical - tinting the admin half would collide with the active
 * and hover states, which are the only colours in here that mean anything. A non-staff
 * session gets no headings at all: one group needs no name to be told apart from nothing.
 *
 * Below lg the page stacks, and a staff menu stacked above the content pushed every screen's
 * title more than a full phone screen down. There the menu is a compact row naming the current
 * page, opening the same menu in a sheet.
 */

interface SidebarProps {
  name?: string;
  variant?: "user" | "admin";
  defaultActive?: AccountNavItem;
  onLogout?: () => void;
  className?: string;
}

export default function Sidebar({
  name = "John Doe",
  variant = "user",
  defaultActive = "profile",
  onLogout,
  className,
}: SidebarProps) {
  const t = useTranslations("Layout.Sidebar");
  const pathname = usePathname();

  /* Staff/admin sessions see the admin rows on every profile page, not only where a screen
   * passes variant="admin". */
  const { data: session } = authClient.useSession();
  /* Role-driven rows only after hydration: the session atom is empty during SSR but may
   * already be filled on the first client render, and that difference is a hydration
   * mismatch. variant="admin" comes from the server, so it needs no gate. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const reader = hydrated ? session?.user : null;

  /* Only the groups the reader has touched are recorded; the rest fall back to "open iff the
   * current page is inside it", so arriving on /listings shows where you are without a click
   * and collapsing it afterwards still sticks. */
  const [toggled, setToggled] = useState<Partial<Record<AdminGroupKey, boolean>>>({});

  const [sheetOpen, setSheetOpen] = useState(false);

  const groups = NAV_SECTIONS.filter(
    (section) =>
      (variant === "admin" && section.key === "admin") || canSeeNavSection(section, reader),
  );

  /* Longest match wins so /profile/bookings activates "bookings", not its /profile prefix. */
  const activeFromPath = [...ACCOUNT_NAV_HREFS]
    .filter(([, href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([, a], [, b]) => b.length - a.length)[0]?.[0];
  const active = activeFromPath ?? defaultActive;

  const menu = (
    <SidebarMenu
      name={name}
      groups={groups}
      active={active}
      toggled={toggled}
      onToggle={(key, open) => setToggled((prev) => ({ ...prev, [key]: open }))}
      onLogout={onLogout}
      onNavigate={() => setSheetOpen(false)}
    />
  );

  return (
    <>
      <Sheet side="left" open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left outline-none transition-colors hover:bg-natural-50 focus-visible:bg-natural-50 lg:hidden",
            className,
          )}
        >
          <Menu aria-hidden className="size-5 shrink-0 text-natural-500" />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs leading-[1.4] font-semibold tracking-wide text-natural-500 uppercase">
              {t("trigger")}
            </span>
            <span className="truncate text-base leading-[1.4] font-semibold text-foreground">
              {t(active)}
            </span>
          </span>
        </SheetTrigger>
        <SheetContent showClose className="gap-0 p-0">
          <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
          <nav aria-label={t("menu")} className="w-full bg-card">
            {menu}
          </nav>
        </SheetContent>
      </Sheet>

      <nav
        aria-label={t("menu")}
        className={cn(
          /* Sticky from lg (where it sits beside the content): pinned 96px below the top,
             the 72px sticky navbar plus the page's 24px block padding (80px navbar at 2xl).
             Capped to what is left of the viewport and scrolling inside that, because a staff
             menu is ~976px tall: taller than the pin leaves, so without the cap `sticky` has
             nothing to pin and the menu rides the page down. Someone reading the bottom of a
             long table would have to scroll all the way back up to change screen.
             `overflow-hidden` still governs the x axis, which is what keeps the header art
             inside the rounded corners. */
          "hidden w-full max-w-83.5 overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto lg:scrollbar-thin 2xl:top-26 2xl:max-h-[calc(100dvh-8rem)]",
          className,
        )}
      >
        {menu}
      </nav>
    </>
  );
}

interface SidebarMenuProps {
  name: string;
  groups: readonly NavSection[];
  active: AccountNavItem;
  toggled: Partial<Record<AdminGroupKey, boolean>>;
  onToggle: (group: AdminGroupKey, open: boolean) => void;
  onLogout?: () => void;
  onNavigate: () => void;
}

/* Rendered once per place it can appear, so each copy mints its own heading and panel ids. */
function SidebarMenu({
  name,
  groups,
  active,
  toggled,
  onToggle,
  onLogout,
  onNavigate,
}: SidebarMenuProps) {
  const t = useTranslations("Layout.Sidebar");
  const headingId = useId();
  const showHeadings = groups.length > 1;

  return (
    <>
      {/* Header, the Figma Title frame (151px tall): greeting sits at y104 over the art, 16px sides/bottom.
          The nautical line art is the Figma Title group (845:206855) cropped to its visible
          660x151 band via viewBox; a wash fades it out under the greeting like the mock. */}
      <div className="relative px-4 pt-26 pb-4">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/assets/illustrations/sidebar-marine.svg)" }}
        />
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-transparent to-card" />
        <h2 className="relative text-2xl leading-[1.3] font-bold text-foreground">
          {t("greeting", { name })}
        </h2>
      </div>

      <div className="flex flex-col py-4">
        {groups.map((group, index) => (
          <div
            key={group.key}
            /* Separated by a rule rather than spacing: the rows are full-bleed, so a gap
               reads as a rendering gap while a line reads as a boundary. */
            className={index > 0 ? "mt-2 border-t border-natural-100 pt-2" : undefined}
          >
            {showHeadings ? (
              <h3
                id={`${headingId}-${group.key}`}
                className="px-4 pt-2 pb-1 text-xs leading-[1.4] font-semibold tracking-wide text-natural-500 uppercase"
              >
                {t(`sections.${group.key}`)}
              </h3>
            ) : null}
            <ul
              aria-labelledby={showHeadings ? `${headingId}-${group.key}` : undefined}
              className="flex flex-col"
            >
              {group.entries.map((entry) =>
                entry.kind === "group" ? (
                  <li key={entry.group}>
                    <ExpandableRow
                      label={t(`groups.${entry.group}`)}
                      panelId={`${headingId}-${entry.group}`}
                      isOpen={toggled[entry.group] ?? entry.items.includes(active)}
                      hasActiveChild={entry.items.includes(active)}
                      onToggle={(open) => onToggle(entry.group, open)}
                    >
                      {entry.items.map((item) => (
                        <li key={item}>
                          <Row
                            item={item}
                            isActive={active === item}
                            label={t(item)}
                            nested
                            onNavigate={onNavigate}
                          />
                        </li>
                      ))}
                    </ExpandableRow>
                  </li>
                ) : (
                  <li key={entry.item}>
                    <Row
                      item={entry.item}
                      isActive={active === entry.item}
                      label={t(entry.item)}
                      onNavigate={onNavigate}
                    />
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 w-full cursor-pointer border-t border-natural-100 px-4 py-4 pt-4 text-left text-base leading-[1.4] font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
        >
          {t("logout")}
        </button>
      </div>
    </>
  );
}

/* Menu Item is 54px in Figma: 16px paddings around 16/1.4 text. A row with no route yet
   stays an inert button rather than a dead link, so nothing announces itself as navigation
   it cannot perform. */
function Row({
  item,
  isActive,
  label,
  nested = false,
  onNavigate,
}: {
  item: AccountNavItem;
  isActive: boolean;
  label: string;
  nested?: boolean;
  onNavigate: () => void;
}) {
  const href = ACCOUNT_NAV_HREFS.get(item);
  const className = cn(
    "block w-full cursor-pointer px-4 py-4 text-left text-base leading-[1.4] outline-none transition-colors focus-visible:bg-natural-50",
    /* Children are indented rather than shrunk: at 14px they would read as secondary
       navigation, when they are the same kind of destination one level in. */
    nested && "pl-9",
    isActive
      ? "bg-brand-50 font-semibold text-brand"
      : "font-medium text-foreground hover:bg-natural-50",
  );

  if (!href) {
    return (
      <button type="button" aria-current={isActive ? "page" : undefined} className={className}>
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={className}
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}

/* A parent row goes nowhere, so it never takes the active highlight even while the page is
   inside it - that would put two highlights on screen and leave the reader guessing which one
   is the page. Collapsed with a child active it just stays semibold. */
function ExpandableRow({
  label,
  panelId,
  isOpen,
  hasActiveChild,
  onToggle,
  children,
}: {
  label: string;
  panelId: string;
  isOpen: boolean;
  hasActiveChild: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onToggle(!isOpen)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-4 text-left text-base leading-[1.4] text-foreground outline-none transition-colors hover:bg-natural-50 focus-visible:bg-natural-50",
          hasActiveChild ? "font-semibold" : "font-medium",
        )}
      >
        {label}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-natural-500 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <ul id={panelId} hidden={!isOpen} className="flex flex-col bg-natural-50/40">
        {children}
      </ul>
    </>
  );
}
