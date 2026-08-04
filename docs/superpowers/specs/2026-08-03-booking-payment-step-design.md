# Booking Payment Step — Design Spec

Date: 2026-08-03
Scope: `apps/web` — the 4th (final) step of the booking flow.
Figma: nodes `865:45158` (Pay by card), `865:45842` (Request invoice), `865:46562` (Ask a question) — file `AciWIIsWqv1wcwFoBrJqs9`.

## Goal

Build the "Payment" step body of the booking flow — a single step with a 3-way
segmented switcher ("Choose how you'd like to proceed"). Each tab swaps the body
fields, the info banner, and the terminal CTA. **UI-only mock**, consistent with
the rest of the booking flow (frontend ahead of backend). No real Stripe / no
server wiring — that is milestone M5 and does not exist yet (no `@stripe/*` deps,
no publishable key, no payment procedure in `packages/api`).

## The three tabs

| Tab                 | Body fields                                                           | Info banner (icon)                                                                                  | CTA                            |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Pay by card**     | Card Number (leading card icon), Expiry Date + CV (row), Name on Card | "Secure your booking instantly with an online payment." (Shield)                                    | `Pay €5,000`                   |
| **Request invoice** | Billing Email, Company Name _(opt)_ + VAT Number _(opt)_ (row)        | "Prefer to pay offline? We'll send you an invoice to complete the payment by bank transfer." (Info) | `Request invoice (for €5,000)` |
| **Ask a question**  | "Your Question or Request" (multiline, ~173px tall)                   | —                                                                                                   | `Send request`                 |

## Component mapping — reuse only, no new UI primitives

Everything maps to existing `packages/ui` components (all built from the same
design system, so tokens match the Figma exactly):

- **Segmented switcher** → `Tabs` with `variant="segmented"`
  (`@yacht-charter/ui/components/navigation/tabs`). This is the Figma "Tabs"
  component (`993:79200`) 1:1. Each `TabsTab` gets `className="flex-1"` for equal
  width (Figma tabs are `flex-[1_0_0]`).
- **Text inputs** → `TextField` (`@yacht-charter/ui/components/form/text-field`).
  Card Number uses `startIcon={<CreditCard />}` (TextField has a 24px start-icon
  slot). Figma placeholder text becomes the `placeholder`.
- **Question textarea** → `TextField` with `multiline` (same component; the
  multiline variant is `min-h-[173px]`). Do **not** use the standalone
  `form/textarea.tsx` — it is a mis-styled leftover (12px text, square corners).
- **Info banners** → `Notification` `variant="info"`
  (`@yacht-charter/ui/components/feedback/notification`). Exact recipe already:
  `border-brand bg-brand-50 p-[14px] text-base`. Pass `icon={<Shield />}` (card)
  / default `Info` (invoice).
- **CTA** → `Button variant="brand"` (as in `BookingSteps`).
- **Icons** → lucide only: `CreditCard`, `Shield`, `Info`. The Figma-exported SVG
  assets are ignored (project rule: lucide only).

## Architecture — the payment step owns its footer

The Figma nodes render the whole step card, but `BookingSteps`
(`features/booking/components/booking-steps.tsx`) already renders the header,
the outer card, and the top separator. The payment step differs from the other
steps in one way: **its CTA label and action are per-tab and terminal**
(Pay / Request invoice / Send request), not a generic "Continue" that advances.

Decision: the payment step owns its own footer. Implementation:

- `BookingSteps` `STEPS` entry for `payment` gets a flag `ownsFooter: true`.
- In the render loop, when `ownsFooter` is set, `BookingSteps` renders only
  `<top-separator /> <Content />` — it does **not** render its bottom separator
  or the generic Continue button for that step.
- `PaymentStep` (the `Content`) renders its own bottom separator + the per-tab
  CTA, matching the Figma footer (`p-5`, full-width brand button).
- All other steps keep their current behavior unchanged.

`advance()` is irrelevant for payment (it is the last step and the CTA is
terminal), so no change to the advance logic.

## State & data

- **Active tab** → `payment.method` in the booking form (not local `useState`),
  read via `useWatch` and set via `setValue`. Keeping it in the form lets a single
  `trigger("payment")` validate only the active method's fields.
- **Validation (invoice + question only)** → the real forms are wired into
  react-hook-form exactly like `guest-details` (`FormField` + `FormControl` +
  `TextField` + `FormMessage`). The `payment` schema branch validates
  conditionally via `superRefine`: `invoice.email` must be a valid email,
  `question.message` must be non-empty; `company`/`vat` are optional. The
  **card** tab stays presentational / unregistered — Stripe Elements own its
  validation at M5, so validating those fields now would be throwaway.
- **Submit** → the per-tab CTA mirrors `advance()`: `card` is a no-op (M5); for
  `invoice`/`question` it runs `trigger("payment")` and, on failure, touches the
  active method's fields so `mode: "onTouched"` errors go live.
- **Price** → `€5,000` hardcoded inline as a mock constant, matching Figma and
  the rest of the flow. Passed to the CTA labels via message interpolation
  (`{amount}`) so the string carries no hardcoded currency.

## i18n

Add a `payment` sub-object to the `Booking` namespace in all three message
files (`apps/web/messages/{en,uk,es}.json`):

```jsonc
"payment": {
  "heading": "Choose how you'd like to proceed",
  "tabs": { "card": "Pay by card", "invoice": "Request invoice", "question": "Ask a question" },
  "card": {
    "number": "Card Number", "numberPlaceholder": "1234-3233-2332-0021",
    "expiry": "Expiry Date", "expiryPlaceholder": "01/29",
    "cvc": "CV", "cvcPlaceholder": "123",
    "name": "Name on Card", "namePlaceholder": "John Doe",
    "notice": "Secure your booking instantly with an online payment.",
    "cta": "Pay {amount}"
  },
  "invoice": {
    "email": "Billing Email", "emailPlaceholder": "billing@gmail.com",
    "company": "Company Name (Optional)", "companyPlaceholder": "Yachts Adventures",
    "vat": "VAT Number (Optional)", "vatPlaceholder": "GB12312321321312123",
    "notice": "Prefer to pay offline? We'll send you an invoice to complete the payment by bank transfer.",
    "cta": "Request invoice (for {amount})"
  },
  "question": {
    "label": "Your Question or Request",
    "placeholder": "Send a request before booking (e.g. license check, special requirements)",
    "cta": "Send request"
  }
}
```

`uk` and `es` get equivalent translations (uk reviewed by the user, who is a
Ukrainian speaker).

## File structure (split into blocks)

Under `features/booking/components/steps/payment/`:

- `index.tsx` — `PaymentStep` composer: active-tab `useState`, the segmented
  `Tabs`, renders the active block, the bottom separator, and the per-tab CTA.
  `"use client"`. Default export, so `booking-steps.tsx`'s existing
  `import PaymentStep from "./steps/payment"` resolves unchanged.
- `pay-by-card.tsx` — card fields + Shield `Notification`.
- `request-invoice.tsx` — invoice fields + Info `Notification`.
- `ask-question.tsx` — the multiline `TextField`.

The old single-file `steps/payment.tsx` (current placeholder) is removed.

## Responsive

Figma is desktop (Expiry+CV and Company+VAT sit in a row). Stack to one column
on mobile with `grid-cols-1 md:grid-cols-2` (or `flex-col md:flex-row`),
consistent with the other steps.

## Files touched

- **Add:** `steps/payment/{index,pay-by-card,request-invoice,ask-question}.tsx`
- **Remove:** `steps/payment.tsx`
- **Edit:** `booking-steps.tsx` (add `ownsFooter` handling), `lib/booking-form.ts`
  (`payment` schema branch + defaults + `superRefine`), `messages/{en,uk,es}.json`
  (add `payment` copy, drop dead `stepPlaceholder`, add `errors.paymentMessage`).
- **Not touched:** other step files.

## Out of scope (later, M5)

Real Stripe Elements, PaymentIntent / client secret, publishable key env,
webhooks, the booking state machine, and any server procedure. When M5 lands,
the "Pay by card" block is swapped for Appearance-themed Stripe Elements behind
the same tab; nothing else in this step changes.
