# @bahmni/appointments-app

[Project README](../../README.md) · [First contribution exercise](../../docs/first-contribution.md) · [Code-reading guide](../../docs/reading-and-changing-code.md)

## Responsibility and entry points

- [Routes](src/routes/index.tsx) under `/bahmni-v2/appointments/` select list, calendar and settings workflows.
- [Pages](src/pages/) own the screens, filters, booking/editing controls and status actions.
- [Action rules](src/pages/appointmentActions.ts) interpret configured transitions.
- [Shared appointment service](../../packages/bahmni-services/src/appointmentService/appointmentService.ts) and [endpoint constants](../../packages/bahmni-services/src/appointmentService/constants.ts) distinguish REST actions from FHIR reads.
- [Page tests](src/pages/__tests__/) exercise behaviour with synthetic/mocked inputs.

## Change and verify

Follow [setup](../../docs/setup-guide.md) and the Appointments commands in [testing](../../docs/testing-guide.md), from repository root. The [read-only first exercise](../../docs/first-contribution.md) is the preferred beginner task, before booking or cancelling records.

Preserve native date/time semantics, service/provider/location identities, conflict/capacity rules and configured transitions. A permitted read does not grant permission to manage appointments. A mocked mutation test cannot prove the server stored a booking. Use [the parity ledger](../../docs/FEATURE_PARITY.md) for scoped acceptance, not a claim that the whole module is finished.

## Tech Stack

- React 19, React Router 7
- TanStack Query for data fetching
- i18n via `@bahmni/services`
- Design system via `@bahmni/design-system`
