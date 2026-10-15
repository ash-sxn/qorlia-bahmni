# @bahmni/clinical-app

[Project README](../../README.md) · [Architecture](../../docs/architecture.md) · [Module routes](src/routes/index.tsx)

## Responsibility and entry points

Clinical contains several workflows, not only the consultation screen. All routes use the `/bahmni-v2/clinical/` base.

| Workflow                               | Start reading                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Patient list and consultation          | [Pages](src/pages/), [consultation pad](src/components/consultationPad/)                                               |
| Programmes, orders, beds and inpatient | [Module route/workflow map](../../docs/module-guide.md)                                                                |
| Theatre and surgical blocks            | [OperationTheatrePage](src/pages/OperationTheatrePage.tsx), [SurgicalBlockEditor](src/pages/SurgicalBlockEditor.tsx)   |
| Encounter submission                   | [Encounter bundle service](src/services/encounterBundleService.ts), [patient visit hook](src/hooks/usePatientVisit.ts) |
| Shared encounter identity/recovery     | [Encounter session service](../../packages/bahmni-services/src/encounterSessionService/)                               |

## Change and verify

Follow [setup](../../docs/setup-guide.md), [API integration](../../docs/api-integration-guide.md) and [testing](../../docs/testing-guide.md), using `apps/clinical` for the focused Jest/TypeScript configuration. Tests live beside their components/hooks/services.

A patient, visit, encounter and practitioner are different identities. Coordinate encounter/session/draft changes with their owner. Do not attach documentation to another provider's encounter, equate a programme ID with a patient UUID, or replace native clinical rules with a UI assumption. Programme field rules may come from installation configuration rather than this page.

Preserve native orders, medication units, time semantics, privileges, configured theatre week/grouping and separate block/surgery actions. Synthetic writes and domain review require the assigned scope. The [parity ledger](../../docs/FEATURE_PARITY.md), not this source map, records acceptance and remaining work.
