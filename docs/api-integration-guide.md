# API integration and safe saves

[README](../README.md) · [Previous: modules](module-guide.md) · [Next: contributing](../CONTRIBUTING.md)

## Trace before editing

For every action, identify the page, event handler, service, endpoint/method, request fields, response fields, native configuration and permissions. Search all callers before changing a shared function. Compare against the installed native UI and model/controller, not only a mock or a similarly named endpoint.

Use existing services in [packages/bahmni-services](../packages/bahmni-services/src/) or the appropriate app service. A clinical API uses the shared HTTP conventions; Billing uses its [separate service](../apps/home/src/components/Billing/billingService.ts) and native addon. Do not introduce another HTTP framework for a single request.

## A read example: Appointments

1. Find the page in [appointments routes](../apps/appointments/src/routes/index.tsx).
2. Follow its call into [appointmentService](../packages/bahmni-services/src/appointmentService/appointmentService.ts).
3. Read [constants](../packages/bahmni-services/src/appointmentService/constants.ts): REST and FHIR routes coexist and have different purposes.
4. Inspect a real permitted response. Preserve patient, appointment, service and provider identities, native date/time semantics, paging and status.
5. Test loading, empty results, denied access, expiry and malformed/failed responses. A successful HTTP status can still contain an API error or invalid payload.

Do not copy patient-facing display IDs into every internal UUID field. A numeric Odoo ID, an OpenMRS UUID and a visible patient identifier are different things. Use the native contract.

## Runtime validation is necessary

TypeScript describes what code expects; it does not validate a server response automatically. Use the existing validation conventions. Check IDs, supported states, finite quantities, required fields, relation labels, company/record identity and bounds. Do not coerce malformed data into a successful-looking screen.

Native relations can be `false` instead of an object, or a labelled `[id, name]` pair. Distinguish that from zero, an empty string or an absent field. Preserve quantity units and currency. Never sum unlike currencies or compare dozens directly with units without native conversion.

## Saves have three possible outcomes

1. **Accepted:** authoritative response/receipt confirms the exact operation. Reload the saved record.
2. **Rejected:** server explicitly denies or rolls back the request. Show the reason and obtain a fresh review if needed.
3. **Unknown:** response was lost, timed out or the browser left. The server might still have committed. Do not create a new request automatically.

Where the existing backend supports receipt recovery, preserve the identical request and check status before a retry. Do not reuse this pattern blindly for an API without such support; define and review its recovery mechanism first. A timeout alone is not evidence of failure.

## Reviewed Billing action

The stock editor uses separate load/onchange/choice/preview/save/status APIs. Preview invokes native behaviour in a rollback scope. Save checks the reviewed version and effect again, then records a receipt bound to identity/company. The browser commits exact recovery data before sending the write.

Study [editor](../apps/home/src/components/Billing/StockOperationEditor.tsx), [service](../apps/home/src/components/Billing/billingService.ts), [recovery storage](../apps/home/src/components/Billing/stockReservationRecovery.ts), [native form](../runtime/billing/qorlia_billing_ui/models/stock_operation_form.py) and [native save](../runtime/billing/qorlia_billing_ui/models/stock_operation_edit.py). The reservation and operation paths share one per-account pending slot so one uncertain request cannot overwrite another.

Deleting a row does not delete its receipt. Recovery must work after the row is gone. Do not re-create it to check whether deletion succeeded. Unknown writes must survive unmount/reload, and a double click must not issue two fresh mutations.

## Permission and session rules

Keep native ACLs, record/field rules, company boundaries and installation privileges. UI visibility is not authorization. Do not send arbitrary Odoo model/method/context, use `sudo`, or forward clinical credentials to ERP. Keep the [gateway allowlist](../scripts/review-host/server.cjs) and its tests aligned with a new named API.

Hide stale/foreign results after identity changes. Reconnect on session expiry without clearing an uncertain request. A request for another account must not be resumed or displayed as the current user's work.

## API mapping template for an issue/PR

```text
Workflow and action:
Frontend page and handler:
Existing service and callers:
Native implementation/version:
Endpoint and method:
Request identities, fields and units:
Response validation:
Configuration and required privileges:
Accepted/rejected/unknown outcome handling:
Reload and duplicate prevention:
Synthetic evidence and regression tests:
Unverified cases:
```

Use sanitized payload keys and synthetic IDs. Never paste Authorization headers, cookies or private records. Shared contracts and backend changes need the relevant owner review before implementation and merge.
