# Start here: your first Qorlia contribution

[README](../README.md) · [Next: local setup](setup-guide.md) · [Documentation index](README.md)

This guide assumes you may be new to software development. You do not need to understand the whole hospital stack before making a useful contribution. You do need to understand the workflow you are changing, its data and its safety rules.

## What we are building

Hospitals have connected work: registration, consultation, tests, prescriptions, admissions, billing and reporting. Qorlia aims to present that work through a consistent interface and supported implementation. We build on Bahmni and its native services. We are not claiming that we wrote the upstream hospital platform.

Your first task is to extend existing code, not create a second patient database or rewrite the application. The separate Qorlia website and Legal Assistant project are not part of this repository. A request for a new feature needs a defined workflow and acceptance conditions before implementation.

## Vocabulary

| Term              | Plain meaning                                             | In this project                                   |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Repository        | Versioned source folder shared through Git                | `qorlia-bahmni`                                   |
| Branch            | A separate line of changes                                | Your task branch, reviewed before integration     |
| Commit / SHA      | A saved change / its unique identifier                    | Record the starting and tested version            |
| Pull request (PR) | Request for someone to review your branch                 | Not proof of release or completion                |
| Frontend          | Code people interact with in a browser                    | React screens and shared controls                 |
| Backend           | Server code that validates and stores work                | OpenMRS/Bahmni, Odoo and other native services    |
| Database          | Persistent records                                        | Clinical and ERP data are separate                |
| API               | Contract for requesting server work                       | An endpoint, method, payload and response         |
| Endpoint          | Address for a particular API operation                    | A native appointment search/save route            |
| Payload           | Data sent with a request                                  | Patient/service/time identifiers for a booking    |
| Schema / type     | Rules describing data shape                               | TypeScript definitions plus runtime validation    |
| Authentication    | Proving who you are                                       | A server-created session                          |
| Authorization     | Deciding what you may do                                  | Native privileges, ACLs, record and field rules   |
| Synthetic data    | Clearly invented test records                             | Approved `QorliaQA` fixtures, never real patients |
| Parity            | Same native workflow and outcome                          | New design, without losing an old function        |
| Regression        | Previously working behaviour breaks                       | A test should catch it next time                  |
| Staging           | Isolated environment for acceptance                       | Not production, still access-controlled           |
| Idempotent retry  | Repeating the same request without duplicating its effect | Exact receipt-based recovery where implemented    |

React builds screens from components. TypeScript checks assumptions about values before running. SCSS styles those components. Python implements the Odoo addon. Configuration also changes behaviour, so a screen is not defined by code alone.

If those terms are new, read [Reading and changing code](reading-and-changing-code.md) with your editor open. It explains the appointment screen line of responsibility by line of responsibility, the difference between patient/visit/encounter identities, and what mocked tests can and cannot prove.

## A learning path, not a deadline

### First session: understand and run

Read this page, [setup](setup-guide.md), [architecture](architecture.md) and [repository map](project-structure.md). Accept access using your own account. Clone the approved branch, record its SHA and run the frontend. Ask for synthetic backend access privately. Do not begin with a production server.

Deliverable: a setup note listing commands, versions, route opened and any specific unanswered prerequisite. “Installation in progress” is not enough information for someone to help.

### Next session: trace one workflow

Open your assigned module. Write the user's goal in one sentence. Compare it with native Bahmni/Odoo. Use browser Developer Tools → Network to inspect a permitted read request. Find the page, service function, endpoint constant and test.

For Appointments, start with [list](../apps/appointments/src/pages/AppointmentListPage.tsx), [calendar](../apps/appointments/src/pages/CalendarPage.tsx), [service](../packages/bahmni-services/src/appointmentService/appointmentService.ts) and [transitions](../apps/appointments/src/pages/appointmentActions.ts). Do not edit shared services without coordination.

Deliverable: a small expected/actual workflow table with source links and sanitized evidence.

Use the [step-by-step first contribution walkthrough](first-contribution.md) if you are unsure how to follow that call chain. It begins with a read, not a patient or accounting write.

### Then: reproduce and test

Choose one real discrepancy. Reproduce it consistently. Add a test that fails for the right reason. Change the smallest relevant code. Make the test pass, run adjacent checks and replay the approved synthetic workflow through save and reload.

Deliverable: one focused draft PR. If no defect is reproduced, submit the audit/tests, not an invented redesign. A first setup/audit checkpoint is not a promise to finish the whole module.

### After review: expand gradually

Have a maintainer review the code and a tester replay the acceptance steps. Record what is accepted and what remains. Agree the next task before editing another module. Clinical/accounting outcomes also need the appropriate domain review.

## How to ask a useful question

Include the issue/PR link, branch/SHA, exact route, expected result, actual result, reproduction steps and sanitized error. Say what you checked and what help you need. Never attach cookies, passwords, production records or private database dumps.

If using AI assistance, review every change yourself. Ask it to use existing APIs/components and write tests. A confident explanation is not evidence. Do not paste private records or access secrets into an AI prompt. You remain responsible for understanding and explaining your PR.

## Beginner-safe first tasks

Examples include a reproduced label/validation defect, a missing empty/error state, a keyboard-access issue, or a documentation correction. Avoid independent changes to invoice posting, permissions, encounter matching, medication semantics or database migration as your first task.

Before implementation read [Contribution workflow](../CONTRIBUTING.md), [API integration](api-integration-guide.md) and [Testing](testing-guide.md).
