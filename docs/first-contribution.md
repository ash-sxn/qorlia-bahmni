# First contribution: follow one appointment read

[README](../README.md) · [Architecture](architecture.md) · [Task brief](task-brief-template.md) · [Testing](testing-guide.md)

This exercise teaches how to navigate the actual project before changing it. It is a read-only audit, not permission to book, cancel or alter appointments. Use the approved synthetic backend and your own account. Source examples describe `codex/billing-delivery-parity`; compare them with your task's approved base rather than copying the whole integration branch.

## 1. Write down the user's goal

For example: “Reception needs to see appointments for a selected day and find a patient.” Write down the route, role and expected result. Record the source SHA with `git rev-parse HEAD`.

Follow [setup](setup-guide.md) first. Opening a design preview or a logged-out page is not completing this exercise. If access is unavailable, read the source and record that limitation rather than inventing a successful browser result.

## 2. Find the route and the screen

Open [Appointments routes](../apps/appointments/src/routes/index.tsx). The `/list` route loads `AppointmentListPage`; the application shell places it under `/bahmni-v2/appointments/list`.

Open [AppointmentListPage](../apps/appointments/src/pages/AppointmentListPage.tsx). Search for `dayAppointments`, `getAppointmentsForDate`, `canView` and `filterAppointments`.

```bash
rg -n 'dayAppointments|getAppointmentsForDate|canView|filterAppointments' apps/appointments/src/pages/AppointmentListPage.tsx
rg -n 'getAppointmentsForDate' apps packages
```

Use editor search if `rg` is unavailable. The second command shows callers and tests, not just the implementation. Do this before changing a shared function.

## 3. Follow the request into the service

The page calls `useQuery` with a key containing the selected date. That key identifies a cached read. Its `queryFn` calls `getAppointmentsForDate`. `enabled` controls when the request is permitted to run in the UI; native permissions still apply on the server.

The [appointment service](../packages/bahmni-services/src/appointmentService/appointmentService.ts) calls the existing `get` helper. The [endpoint constants](../packages/bahmni-services/src/appointmentService/constants.ts) build `/openmrs/ws/rest/v1/appointment/all`; the `forDate` query parameter is an ISO timestamp made from local midnight for the selected date. That conversion matters. Do not change it to an arbitrary UTC date without checking native time-zone behaviour.

The [HTTP client](../packages/bahmni-services/src/api/client.ts) handles shared response/error conventions and expired authentication. The [local proxy](../distro/webpack.config.js) forwards the same-origin request to the configured clinical backend. This repository does not contain the full OpenMRS server implementation.

```text
Selected day
  -> AppointmentListPage / queryFn
  -> getAppointmentsForDate
  -> shared HTTP client
  -> same-origin proxy
  -> native Bahmni/OpenMRS
  -> response / query cache
  -> filtered and ordered rows
```

A filter can change the displayed rows without issuing a new request. On this page, service/provider/location/status/patient filtering is performed over loaded rows. Do not assume every filter is a server search. `/awaiting` follows a different waitlist query, so investigate it separately.

## 4. Observe one permitted request

In the browser, open Developer Tools, select Network, then open the appointment list and select a day. Locate the request and record method, path, query keys, status and the shape of its response. A successful request with no rows can be a valid empty day.

Do not paste “Copy as cURL”, a full HAR or request headers into GitHub: those can contain sessions and private data. Record sanitized evidence using approved synthetic identifiers only. If a request is denied or fails, record that result and the exact prerequisite to investigate.

Compare the selected day and visible records with the native synthetic installation. Check at least an empty day, a day with several appointments, a patient filter and a permitted versus denied role. Do not remove access checks when a denied role produces no rows.

## 5. Understand a write without executing it

In the page, `useMutation` handles status changes. The service calls the native status endpoint. On success, several appointment query keys are invalidated, meaning their cached results become stale and can be fetched again. That is different from editing a displayed label and assuming the server saved it.

Read [appointmentActions](../apps/appointments/src/pages/appointmentActions.ts) and [calendar action tests](../apps/appointments/src/pages/__tests__/CalendarActions.test.tsx). The configured actions and native privileges determine availability. A patient's display identifier is not the appointment UUID sent to a status endpoint.

Booking/rescheduling, conflicts, capacity and uncertain-write recovery are separate audit items. A frontend test that mocks `mutate` cannot prove a booking was stored. Any write exercise requires explicit synthetic permission and the [API integration rules](api-integration-guide.md).

## 6. Run an existing test and explain it

From repository root:

```bash
TS_NODE_SKIP_PROJECT=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' yarn jest --config apps/appointments/jest.config.ts --runInBand --runTestsByPath apps/appointments/src/pages/__tests__/CalendarActions.test.tsx
```

Read the test before running it. It checks manager-only configured calendar actions, check-in time and cancellation confirmation with mocked hooks. It does not exercise a real server. Full checks and PowerShell notes are in [testing](testing-guide.md) and [setup](setup-guide.md).

If you reproduce a defect, write a failing test that describes its exact expected behaviour, then apply a small fix. Do not change assertions to agree with incorrect behaviour. If no defect is found, deliver your trace and observations; there is no obligation to invent a change.

## 7. Deliver a useful first checkpoint

Your setup/audit note should answer:

- Which branch/SHA and synthetic environment did you use?
- Where does the route enter the page, and which service/endpoint reads the data?
- Which filters are local and which send a request?
- Which identity, time-zone, configuration and permission rules matter?
- What did you observe in the native installation versus Qorlia?
- Which test ran, what does it prove, and what remains unverified?
- What bounded next task do you recommend, and who needs to review it?

Use the [task brief](task-brief-template.md) and [contribution workflow](../CONTRIBUTING.md) for the next step. Do not submit credentials, a database dump or a copied private deployment folder as your handover.
