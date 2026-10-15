# @bahmni/widgets

[Project README](../../README.md) · [Architecture](../../docs/architecture.md) · [Design system](../../docs/QORLIA_DESIGN_SYSTEM.md)

## Responsibility

Reusable hospital widgets, configuration/application context, shared hooks and notification UI. Unlike a generic button, a widget can understand hospital data such as a patient's details, observations or programme information. It is not a second source of truth for a clinical record.

Read [exports](src/index.ts), [patient details](src/patientDetails/), [programme details](src/programDetails/), [observation rendering](src/observationsRenderer/) and [search registry](src/search/registry/) as relevant. Follow their service imports into [shared services](../bahmni-services/README.md); use [design-system controls](../bahmni-design-system/README.md) rather than duplicating them.

## Change and verify

Use [setup](../../docs/setup-guide.md) and [testing](../../docs/testing-guide.md) with `packages/bahmni-widgets/jest.config.ts` and `packages/bahmni-widgets/tsconfig.lib.json`. Search consumer apps before changing a prop, context value or exported hook. Run adjacent and affected consumer tests, preserving loading/empty/error states, native permissions, patient identity and keyboard/focus behaviour.

Shared context can affect every module. Coordinate broad changes and avoid importing a feature page into this package to solve a local problem. Current workflow acceptance belongs in [the parity ledger](../../docs/FEATURE_PARITY.md), not a generic claim that all widgets are complete.
