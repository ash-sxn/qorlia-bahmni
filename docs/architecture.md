# Qorlia architecture

[README](../README.md) · [Previous: setup](setup-guide.md) · [Next: repository map](project-structure.md)

## Central idea

We change how people interact with the hospital system while retaining native clinical and accounting behaviour. One consistent interface does not mean one database, one backend or automatic single sign-on.

```text
Browser: /bahmni-v2/
  |
  +-- distro: startup, branding, login and top-level routes
  |     +-- apps: Home/Billing, Clinical, Registration, Appointments,
  |     |        Patient Documents, Admin, Reports
  |     +-- shared design-system, widgets and services
  |
  +-- same-origin development or protected-review gateway
        +-- /openmrs/ws/rest/v1/... -> native OpenMRS/Bahmni REST
        +-- /openmrs/ws/fhir2/R4/... -> FHIR resources/bundles
        +-- /bahmni_config/... -> installation configuration
        +-- /openmrs/qorlia-billing-api/... -> scoped Odoo JSON-RPC
        |      +-- Qorlia addon -> native models -> ERP database
        +-- configured Reports/documents routes -> native adapters

Separate OpenELIS/PACS/analytics/outreach need their own integration.
```

This is a responsibility diagram, not an exact deployment topology. Clinical and ERP databases remain separate. Synchronization needs explicit implementation and acceptance; a shared navbar does not establish it.

## Choose the correct change boundary

Before implementation, identify the layer responsible for the behaviour. A browser is a client of the native system, not an alternative authority for hospital records.

| Concern                                                       | Responsible layer                                        | Example and change rule                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Screen layout, focus, loading/error state                     | App component plus shared design controls                | Change the page and adjacent tests; use existing tokens, not a second UI kit                             |
| Label, concept, programme field, location or available action | Translation/installation configuration and its consumers | Check the installed rule before loosening a generic input for every programme                            |
| Request/response mapping                                      | Existing app or shared service                           | Preserve native identifiers, units, dates and error semantics; inspect all callers                       |
| Clinical record and privileges                                | Native OpenMRS/Bahmni service                            | This repo does not contain its complete backend; a required server change is a separate coordinated task |
| Inventory/accounting action                                   | Native Odoo models and the scoped Qorlia addon           | Use native methods, ACLs, company rules and transactions; do not simulate posting in React               |
| Gateway access and session isolation                          | Development proxy or protected review gateway            | Named endpoints and separate sessions, never a generic arbitrary-model proxy                             |
| Cross-system synchronization                                  | Explicit integration with both native systems            | Define mapping, retries, duplicate prevention and failure reconciliation before enabling it              |

A displayed patient identifier, an OpenMRS UUID and a numeric ERP customer ID are not interchangeable. A test order in one service does not prove that the other service received it. Document the integration's actual source of truth and matching rules.

For a change, write one short sequence: user action, page handler, service function, gateway/native endpoint, authorized native method, saved records, response and reload. For a write also describe rejection, unknown outcome and recovery. Use the [task brief](task-brief-template.md) to keep that sequence reviewable before coding. The [first contribution exercise](first-contribution.md) demonstrates a real read; the Billing example below demonstrates a more demanding write contract.

## Application shell

[distro/src/main.tsx](../distro/src/main.tsx) loads validated branding, initializes shared assets and mounts React. [Root app](../distro/src/app/app.tsx) provides top-level routes, shared application context, lazy module loading and a loading boundary.

Each app owns its module routes and UI. Visible workflows do not correspond one-to-one with folders: programmes, beds, inpatient, theatre and orders live inside Clinical; Billing lives inside Home. The development-only design preview uses sample data, not native workflows.

## UI and state

- [Design system](../packages/bahmni-design-system/src/): Carbon-based controls, tokens, typography and branding.
- [Widgets](../packages/bahmni-widgets/src/): healthcare widgets, application/configuration context and hooks.
- [Services](../packages/bahmni-services/src/): clinical APIs, types, authentication, privileges and domain helpers.
- [Apps](../apps/): screens, module-specific services, routes, styles, state and adjacent tests.

React state handles local interaction. TanStack Query handles fetched data/cache. Some clinical drafts and encounter decisions use Zustand stores. Context shares application/configuration information. Follow the existing surrounding pattern; do not replace the entire state architecture for one feature.

Cached data is not current permission or financial authority. Recheck sensitive writes on the server and reload authoritative data afterward.

## Clinical flow

An Appointments page calls [appointmentService](../packages/bahmni-services/src/appointmentService/appointmentService.ts). [Endpoint constants](../packages/bahmni-services/src/appointmentService/constants.ts) distinguish native REST saves/searches/status changes from FHIR reads. Those payloads are not interchangeable.

The [HTTP client](../packages/bahmni-services/src/api/client.ts) handles response/error conventions. Native OpenMRS/Bahmni validates access and data. The page displays results and reloads saved state.

Consultation is more complex. [encounterBundleService](../apps/clinical/src/services/encounterBundleService.ts) assembles native resources. Patient, visit, encounter and practitioner are different identities. [Encounter session matching](../packages/bahmni-services/src/encounterSessionService/index.ts) must not attach a consultation to another user's encounter. Coordinate changes with its owner.

## Billing flow

[Billing service](../apps/home/src/components/Billing/billingService.ts) uses Odoo JSON-RPC through a separate same-origin gateway prefix. [The Python addon](../runtime/billing/qorlia_billing_ui/models/) extends native Odoo models, not a second accounting ledger.

A reviewed stock operation follows:

1. Load a saved order, transfer, move and optional operation.
2. Replay ordered field edits through native onchange logic.
3. Preview native effects in a rolled-back savepoint.
4. Show quantities in their own units and native batch/location/package/pricing metadata.
5. Commit the exact reviewed request to browser recovery storage before HTTP.
6. Recheck permissions, company, identities, version and effects while locking relevant native records.
7. Apply once and record a protected author/company-bound receipt.
8. Recover an uncertain response by checking status or retrying the identical request. Reload native state.

Read [editor](../apps/home/src/components/Billing/StockOperationEditor.tsx), [recovery storage](../apps/home/src/components/Billing/stockReservationRecovery.ts), [native form](../runtime/billing/qorlia_billing_ui/models/stock_operation_form.py) and [native action](../runtime/billing/qorlia_billing_ui/models/stock_operation_edit.py). Recording preparation is not validating delivery. Validation/wizards/backorders/returns remain separate unfinished workflows.

The next [delivery-validation contract](../runtime/billing/STOCK_VALIDATION.md) has native load, ordered wizard replay inside rollback preview, signed terminal review and atomic save/status recovery. It includes stock valuation/accounting/analytics effects. Immediate/backorder/expiry choices follow the native returned action. Financial record visibility is preserved, and external notification dispatch is blocked during review and save. Adapter 47's TypeScript service and gateway have separate-copy actual HTTP evidence. Its React wizard and shared recovery controls now have component tests, but actual browser save/reload, visual review and publication remain pending. This is not a released delivery control.

Invoices, payments, journals and banks have different contracts and native rules. Do not generalize stock logic into financial posting.

## Authentication and configuration

Clinical login establishes an OpenMRS session. Billing needs a separate ERP session. The [development proxy](../distro/webpack.config.js) and [review gateway](../scripts/review-host/server.cjs) isolate cookies and verify clinical access before forwarding allowed ERP requests.

For a non-default ERP database, the operator sets the same `BAHMNI_BILLING_DATABASE` in the frontend build and review gateway. The gateway permits only that exact login database, default `odoo`; it does not trust a client's database selection. Native database filters and permissions remain independent safeguards. See [setup](setup-guide.md).

Buttons are not security boundaries. Native ACLs (model permissions), record rules, company scope and field permissions still apply. Do not add arbitrary model/method forwarding, `sudo`, privilege bypasses or frontend credentials.

Installation configuration determines concepts, forms, programme attributes, locations, menus and appointment transitions. Backend modules determine endpoint availability. A mismatched frontend/config/backend can render while saving incorrectly.

[Hospital branding](HOSPITAL_BRANDING.md) changes a limited validated presentation format, not clinical semantics or scripts.

## Reports and separate products

[Reports](../runtime/reports/README.md) involves queues, schedules, downloads and templates. Correct MIME types, complete rows, filenames and native template semantics matter as much as styling.

[Patient Documents](../apps/patient-documents/src/App.tsx) uses [document write services](../packages/bahmni-services/src/documentReferenceService/documentWriteService.ts). Binary uploads and clinical references are not ordinary JSON forms.

OpenELIS, PACS, analytics and outreach are separate systems with their own sessions, licences and workflow acceptance. Reskinning a header does not complete them.

## Limits

This architecture does not establish production readiness, complete offline operation, automatic clinical/ERP synchronization, autonomous clinical AI or regulatory compliance. PWA-related source exists, but offline caching/synchronization and privacy require explicit acceptance. See [readiness](BACKEND_READINESS.md) and [parity](FEATURE_PARITY.md).

## How to read work in progress

Record four versions separately: your source commit, frontend build, backend adapter/modules and installation configuration. Also record the target environment. They do not advance together automatically.

At the 15 October 2026 checkpoint, the protected Billing tester remains on adapter 43. Adapter 45 source adds native confirmation save/status and frontend service contracts to adapter 44's load/rollback preview. Its React review/save/recovery path now has separate-copy native HTTP and local browser evidence, including full-reload recovery. It is not the hosted tester version or full fulfillment/production acceptance. Neither a local manifest nor this document is release evidence. See the [confirmation contract](../runtime/billing/STOCK_CONFIRMATION.md) for the dated evidence and remaining gates.

When learning a feature, ask: does it exist only as source, pass mocked tests, pass native model tests, pass actual HTTP checks, or pass independent browser acceptance? Report the level you observed. New team members should not deploy unaccepted source or change the running tester to make their local work match.
