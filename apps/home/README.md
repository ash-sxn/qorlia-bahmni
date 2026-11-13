# @bahmni/home-app

[Project README](../../README.md) · [Architecture](../../docs/architecture.md) · [Module map](../../docs/module-guide.md)

## Description

Owns the signed-in Qorlia home at `/bahmni-v2/home/` and Billing at `/bahmni-v2/home/billing`. Home combines configured navigation, location and user controls. Billing uses its own ERP session, service and native addon; it is not an anonymous link before clinical sign-in.

## Read in this order

- [Routes](src/routes/index.tsx) and [HomePage](src/components/HomePage/).
- [BillingPage](src/components/Billing/BillingPage.tsx) and adjacent components for customer/order/invoice/payment/stock workflows.
- [Billing service](src/components/Billing/billingService.ts), [durable stock recovery](src/components/Billing/stockReservationRecovery.ts) and [component tests](src/components/Billing/__tests__/).
- [Native addon](../../runtime/billing/README.md), [confirmation contract](../../runtime/billing/STOCK_CONFIRMATION.md) and [validation contract](../../runtime/billing/STOCK_VALIDATION.md).

## Change and verify

Use [shared setup](../../docs/setup-guide.md) and the Home paths in [testing](../../docs/testing-guide.md). Run commands from the repository root. Do not introduce another ERP client, arbitrary model gateway or browser-only accounting logic.

Preserve native units, currencies, company/record rules and exact reviewed requests. Confirmation/preparation is not completed delivery. Unknown writes must retain recovery across reload; another pending stock action must not overwrite them. Recheck native state before claiming a save succeeded.

Read [current parity](../../docs/FEATURE_PARITY.md) before describing a workflow as accepted. Component tests, isolated native/API evidence, browser acceptance and the protected tester are different checkpoints. Clinical-to-ERP synchronization is not enabled in the isolated tester merely because both modules are visible.

## Tech Stack

- React 19, React Router 7
- TanStack Query for data fetching
- i18n via `@bahmni/services`
- Design system via `@bahmni/design-system`

## Package Exports

| Export                       | Description                         |
| ---------------------------- | ----------------------------------- |
| `@bahmni/home-app`           | `HomeApp` component                 |
| `@bahmni/home-app/styles`    | Compiled CSS (widgets + app styles) |
| `@bahmni/home-app/locales/*` | i18n locale files                   |
