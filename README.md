# Qorlia hospital application

Qorlia is building a consistent hospital workspace on top of [Bahmni Apps Frontend](https://github.com/Bahmni/bahmni-apps-frontend). We redesign the interface and integrate native workflows, rather than replace the clinical database or accounting engine. Bahmni and its contributors built the upstream software. Their history, copyright and required notices remain.

This public repository contains the React hospital application, shared UI/service libraries and selected backend adapters. It is not the separate private Qorlia marketing website. This is development work, not a production-ready release. A branch in this repository is not automatically the build running on a demo or tester site.

## New to the project? Start here

Joining with Aniket, Gautam or another team? Begin with the [new-team handover](docs/team-handover.md): current versions, resources, first checkpoints, proposed work split and the path from a requirement to a reviewed feature. It includes a short message Ashutosh can share with the team.

For a practical starting checklist, use [your first session](docs/team-handover.md#first-session-checklist). Managers can use [the deliverable-review guidance](docs/team-handover.md#what-management-should-receive) together with the task template. These are onboarding instructions, not automatic task assignments or release approval.

### Pick your starting point

| Your role                        | Start with                                                                                                                              | First useful output                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| New developer                    | [Orientation](docs/developer-start-here.md), [setup](docs/setup-guide.md), then [the appointment exercise](docs/first-contribution.md)  | Explain one real read from screen to server before taking a write task       |
| Architecture mentor or team lead | [First team briefing](docs/development-playbook.md#9-run-the-first-team-architecture-briefing) and [architecture](docs/architecture.md) | Agree boundaries, prerequisites and a bounded first task per contributor     |
| Tester                           | [Testing guide](docs/testing-guide.md) and [module guide](docs/module-guide.md)                                                         | Repeat one workflow independently, with expected/actual results and versions |
| Manager or vendor coordinator    | [Team workflow](docs/team-workflow.md) and [task brief](docs/task-brief-template.md)                                                    | Named owner, reviewer, tester, checkpoint, dependencies and evidence         |

The handbook is a map, not a requirement to read every page before asking a question. Follow one workflow end to end, then expand into adjacent features.

**For the first team discussion:** open the [architecture briefing](docs/development-playbook.md#9-run-the-first-team-architecture-briefing), use the [technology and responsibility map](docs/development-playbook.md#the-tools-and-what-each-one-is-responsible-for), then complete one appointment read together. Contributors can use the [resource request](docs/team-handover.md#request-only-the-resources-your-task-needs) instead of asking for unspecified software access. The coordinator can use the [review routine](docs/team-workflow.md#a-lightweight-review-routine) to track deliverables without duplicating reports.

Read these in order. Each guide links back here and to the next step.

| Step | Guide                                                | What you will learn                                                          |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1    | [Beginner orientation](docs/developer-start-here.md) | What Qorlia does, basic terms and a first-week learning path                 |
| 2    | [Local setup](docs/setup-guide.md)                   | Your own account, tools, the correct branch, backend prerequisites and login |
| 3    | [Architecture](docs/architecture.md)                 | Browser, application modules, APIs, native services and databases            |
| 4    | [Repository map](docs/project-structure.md)          | Where to look and which files to change                                      |
| 5    | [Module learning guide](docs/module-guide.md)        | Routes, source entry points and workflow questions                           |
| 6    | [API integration](docs/api-integration-guide.md)     | Trace reads/writes, preserve permissions and recover uncertain saves         |
| 7    | [Contribution workflow](CONTRIBUTING.md)             | Issues, branches, a small first PR, review and safety rules                  |
| 8    | [Testing guide](docs/testing-guide.md)               | Runnable checks, synthetic evidence and what complete means                  |
| 9    | [Team workflow](docs/team-workflow.md)               | Phases, ownership, task allocation, daily updates and vendor evidence        |

Then follow the [first contribution walkthrough](docs/first-contribution.md) and use the [task brief template](docs/task-brief-template.md) before beginning implementation. These turn the architecture into a concrete exercise and a reviewable assignment.

New to React or TypeScript? Keep the [beginner code-reading guide](docs/reading-and-changing-code.md) open beside your editor. It explains components, state, queries, mutations, tests and hospital data identities using this repository's actual appointment screen.

For a team architecture briefing, practical debugging steps, Git basics and a feature review walkthrough, use the [development playbook](docs/development-playbook.md). Start with its short architecture explanation, then complete the appointment exercise before taking a write workflow.

These updated guides are on `codex/billing-delivery-parity`. If GitHub opens the older default `main` README, select that development branch to read the current guides. A documentation branch and a task's approved code base are different: do not start from unfinished Billing code merely to obtain these guides.

No production credentials, paid AI account or new server is required to start learning the source. Real workflow testing requires approved synthetic backend access. Do not disable authentication to bypass that prerequisite.

## Current development status

The goal is full native workflow/API parity in a consistent Qorlia interface. Billing is the current integration priority. The React login, shared home and module routes exist, but a rendered screen is not proof that every feature is accepted.

Newest source: [global inventory transfer details](runtime/billing/STOCK_INVENTORY_WORKSPACE.md#candidate-67-global-details-19-october-2026)
opens unlinked transfers with a complete pinned move/operation scope and shared
Qorlia tables, without Sales line access or fake order IDs. Header/section/cursor
coherence, hidden-record denial and focus restoration are checked. Home passes
1,553 cases/102 suites; 50 native cases preserve 132 tables with 106 matching
Python hashes; actual-client replay accepts 72 responses with transport mocked.
Global reviewed write/recovery, remaining native views/fields and runtime/browser/
scale/release gates remain. No build/server, review reopening or deployment.

Earlier source: [global inventory transfer workspace](runtime/billing/STOCK_INVENTORY_WORKSPACE.md)
adds a signed-in Inventory transfers tab, named read-only API and matching native
reader for receipts/deliveries/internal transfers without fake order links.
Native access, company filtering, native ordering, Waiting semantics, paging and
account-timezone dates remain. Home passes 1,527 cases/100 suites; nine native
cases preserve 132 tables with 106 matching Python files; client replay accepts
15 native responses with transport mocked. Global detail/write workflows,
remaining native views, actual transport/browser and release gates stay open.
The earlier candidate-64 full regression completed 928 cases with independent
132-table preservation; it does not verify later candidates 65/66. No build,
server, review reopening, installed upgrade or deployment is included.

Newest cancellation source: [candidate-65 private analytic reference and mixed-state coverage](runtime/billing/STOCK_CANCELLATION.md#candidate-65-private-analytic-reference-and-mixed-state-coverage)
preserves a legitimate native cancellation of an unreadable analytic entry,
without exposing its identity or relaxing native permissions. Exact hidden
relationships remain server-signed. Home passes 1,505 cases/98 suites; source/test
types and scoped lint/format pass. Forty native cases preserve 132 tables with
104 matching Python hashes; actual-client replay accepts 213 responses with
transport mocked. Native results and remaining runtime, browser,
global-inventory and release gates are recorded in that guide. Review stays closed.

Earlier UI source: [complete transfer cancellation](runtime/billing/STOCK_CANCELLATION.md#react-complete-cancellation-consumer-source-19-october-2026)
connects ordered native review, explicit cancellation, schema-8 durable recovery,
exact retry/status/stop, all saved references and original-transfer resume from
signed-in Billing. It reuses the shared Qorlia dialog, preserves all older stock
protocols and distinguishes cancelling goods from stopping a pending request.
Home passes 1,490 cases/98 suites. Real runtime/browser/storage/concurrency and
release gates remain separate; review access stays closed and nothing is deployed.

Candidate-64 source: [native transfer cancellation](runtime/billing/STOCK_CANCELLATION.md#candidate-64-native-api-and-client-source)
adds complete effect review, native save, exact status/reference/stop recovery,
typed clients and six fixed gateway routes. The matching consumer is described
above. At that API checkpoint, client checks passed 51 cases and Home passed 1,423 cases/96
suites. Thirty native cases preserve 132 tables with 103 matching Python hashes;
actual-client replay accepts 166 native response frames with transport mocked.
Independent committed-table SQL agrees. Remaining runtime gates are separate.

New source: [saved-stock recovery on the signed-in Billing landing page](runtime/billing/STOCK_RECOVERY.md#signed-in-billing-recovery-entry-19-october-2026)
opens the original transfer workspace without requiring an order search or
automatically replaying/clearing a request. The [native return lifecycle coverage](runtime/billing/RETURN_PAGED_WRITE.md#native-return-to-receipt-lifecycle-coverage-19-october-2026)
joins creation to separate physical receipt; its frozen candidate-63 regression
passes 898 cases with 132-table preservation and 100 matching Python files.
Matching client replay accepts 371 native response frames with transport mocked.
The recovery-entry checkpoint passed 1,372 Home cases/95 suites, types and scoped lint.
These changes do not reopen review access or deploy the product.

Current backend/client source: [complete return creation and recovery](runtime/billing/RETURN_PAGED_WRITE.md)
connects the matching full-review writer, compact exact accepted/stopped/unknown
status, all saved reference pages and stop without reversing accepted creation.
Older return protocols retain their limits. The matching schema-7 durable store
keeps the exact request and checks all accepted references or explicit stop before
retirement. The matching [React return workflow](runtime/billing/RETURN_PAGED_WRITE.md#react-complete-return-consumer-source-19-october-2026)
now connects complete item/effect review, exact save/retry/stop, all references and
opening the created transfer for separate receipt. Runtime and release acceptance
remain separate. The return-consumer checkpoint passed 1,354 cases/94 suites, including 35
return component and three actual-SDK wire cases with transport/storage doubles.
The scoped native run passes 88
cases with 132-table preservation and 99 matching source files; actual-client
replay accepts 155 native responses with mocked transport.

Earlier candidate-62 backend/client source: [complete return form and review](runtime/billing/RETURN_PAGED.md)
adds compact native load, original-line paging, pinned location search and ordered
rollback review beyond the legacy graph cap. The matching writer, recovery store
and React return workflow remain unfinished; readiness stays false. Native
return creation is distinct from physical receipt and financial refund. This is
not a deployment or permission to reopen review access.
Home passes 1,240 cases/91 suites; 56 scoped native cases pass with 132-table
preservation and 97 matching Python hashes. Client replay accepts 45 native
responses with mocked transport. Runtime and remaining write/UI gates are separate.

Latest UI source: [complete native validation workflow](runtime/billing/VALIDATION_PAGED_WRITE.md#react-complete-validation-consumer-source-19-october-2026)
connects all seven APIs, complete prompt/effect/reference paging, strict history
storage, exact retry/stop and explicit accepted-legacy handoff. New validation and
schema-6 resume routes use the new dialog without the former UI size threshold.
Older unresolved requests keep their original protocols. Native permissions and
safeguards remain; runtime/browser/performance acceptance is separate and review
access stays closed. This is not an installed or hosted update.
Home passes 1,184 cases in 90 suites; types and scoped lint pass.

Latest storage source: [complete validation history](runtime/billing/STOCK_RECOVERY.md#complete-validation-history-source-19-october-2026)
keeps the exact eight-key request and prior native actions together in the existing
account slot. Fresh native acknowledgements gate continuation, terminal clear
and stopped-child restoration; aborted commits retain the history. At that
storage-only checkpoint the React route was not connected; the later consumer
above now uses it. Older unrelated dialogs still reject this schema. The storage
checkpoint passed 1,155 cases/89 suites, including 47 recovery-storage cases.

Current backend/client source: [complete native validation write/recovery](runtime/billing/VALIDATION_PAGED_WRITE.md)
adds exact full-review save, accepted/stopped status, saved prompt/reference pages
and a native stop that retains prior accepted preparation. That backend checkpoint
passed 1,135 cases/89 suites. The corrected scoped native run passes 50 cases, preserves 130
guarded tables and matches 95 Python files. Actual-client replay accepts 238
native responses with mocked transport. The newer storage/UI source is above;
real runtime, browser, concurrency and scale acceptance remain. Nothing is deployed.

Earlier candidate 60: [complete native validation review](runtime/billing/VALIDATION_PAGED.md)
removes the legacy full-graph dependency from review, with one ordered proof chain
covering all saved input-prompt rows and native effects. At that checkpoint the
matching writer was absent and both APIs returned `write_ready: false`. Home passed 1,109 cases/88 suites. The scoped native
run passes 36 cases with 130-table preservation and 93 matched Python hashes;
the actual client accepts 69 native JSON responses with mocked replay transport.
Runtime and remaining write/UI gates are separate in that guide.

An earlier UI checkpoint connected [saved-validation recovery](runtime/billing/VALIDATION_RECOVERY_PAGING.md#react-saved-step-reader-source-19-october-2026)
to the transfer resume path. It reads complete saved prompts and references in
pinned pages without the capped editable graph, rechecks terminal receipts before
durable clear, and explicitly hands small continuations to the original writer.
At that checkpoint large writes remained unfinished; later complete-write source
is above. Live/browser acceptance remains unfinished. Review
access stays closed. Home passes 1,073 cases in 87 suites; types and scoped lint
pass. This is source-only, not an installed or hosted update.

The backend/client checkpoint is [candidate-59 saved-validation recovery](runtime/billing/VALIDATION_RECOVERY_PAGING.md).
It adds compact exact-receipt status and paged saved-prompt/reference readers,
preserving the original validation-step payload. Home passes 1,049 cases/86 suites.
That backend checkpoint was not a larger validation writer, a React consumer or a runtime
release. The scoped native run passes 23 cases with 130-table preservation and
91 matching Python hashes; the client accepts 27 captured native responses with
mocked replay transport. Remaining consumer/write/runtime gates are tracked in
that guide. Review access remains closed.

The latest [19 October operation consumer source](runtime/billing/STOCK_OPERATION_PAGING.md#react-operation-consumer-source-19-october-2026)
connects create/edit/removal through native forms, complete choice/effect pages,
durable exact-request recovery and stop. Older pending operations keep their
original protocol. Home passes 1,012 cases/85 suites. This is source/component
evidence, not a built or deployed tester update. Large validation/returns and
actual browser/gateway/IndexedDB acceptance remain. The review gate stays closed.

The earlier [19 October preparation consumer source](runtime/billing/STOCK_RESERVATION_PAGING.md#react-preparation-consumer-source-19-october-2026)
connects all four native preparation actions to complete paged review, durable
exact-request recovery and explicit stop. Confirmation shares the same dialog
core; older pending requests keep their original protocols. Home passes 970
cases/83 suites. This is source/component evidence, not a built or deployed
tester update. At that checkpoint, operation editing, large validation/returns and actual
browser/gateway/IndexedDB acceptance remain. The Billing review gate stays closed.

Latest API-consumer source connects [paged transfer summaries and details](runtime/billing/STOCK_TRANSFER_DETAILS.md#react-api-consumer-checkpoint-16-october-2026), with component checks for 101 transfers, 501 moves and 2,001 operations. Large signed-write dialogs and gateway/browser acceptance remain unfinished. This does not update the hosted tester or reopen local review access.

New confirmation requests now use [complete paged confirmation review](runtime/billing/STOCK_CONFIRMATION_PAGING.md#react-confirmation-consumer-source-16-october-2026)
in source. Older pending confirmations retain their original dialog. Home passes
920 tests at that checkpoint. A later [exact-request stop candidate](runtime/billing/STOCK_REQUEST_STOP.md)
adds native/client/dialog recovery without reversing accepted actions. Its later
[six real HTTP races](runtime/billing/STOCK_REQUEST_STOP.md#native-http-race-and-recovery-checkpoint-18-october-2026)
pass both orderings with independent receipt/source/stock checks. Matching-worker
rollout, broader configuration/scale, browser/gateway/IndexedDB and other
stock-action consumer gates remain. This is not a built or published UI update.
The separate source-58 native regression passes 830 cases with 117-table
preservation and all 89 Python hashes matched to its committed source, not an
installed upgrade or actual concurrent HTTP/browser acceptance.

- [Feature parity ledger](docs/FEATURE_PARITY.md): dated evidence, accepted increments and remaining work.
- [Backend readiness](docs/BACKEND_READINESS.md): backend compatibility, tested environments and integration gaps.
- [Billing adapter](runtime/billing/README.md): native Odoo integration and limits.
- [Native stock operation forms](runtime/billing/STOCK_OPERATION_FORMS.md): compact single-form backend, complete snapshot checks and remaining save limits.
- [Paged operation review](runtime/billing/STOCK_OPERATION_PAGING.md): native create/edit/delete effects, terminal proof and compact recovery protocol.
- [Paged reservation actions](runtime/billing/STOCK_RESERVATION_PAGING.md): complete effects and compact recovery for native availability, unreserve and quantity preparation.
- [Stock recovery storage](runtime/billing/STOCK_RECOVERY.md): exact completed-request persistence, older-envelope compatibility and remaining browser integration gates.
- [Stop pending stock requests](runtime/billing/STOCK_REQUEST_STOP.md): exact author-bound native stop, confirmation UI recovery and separate concurrency/rollout release gates.
- [Native transfer cancellation](runtime/billing/STOCK_CANCELLATION.md): native audit, complete API/UI source, exact recovery, private-reference/mixed-state contracts and remaining runtime/release gates.
- [Complete reservation inventory scope](runtime/billing/STOCK_INVENTORY_SCOPE.md): checked stock paging and legacy compatibility, with scoped native evidence and remaining UI gates.
- [Large-transfer confirmation candidate](runtime/billing/STOCK_CONFIRMATION_PAGING.md): native paged review/save contract, distinct from released UI and tester capabilities.
- [Large confirmation HTTP verification](runtime/billing/STOCK_CONFIRMATION_PAGING.md#large-native-http-and-recovery-checkpoint-16-october-2026): complete 501-move/2,001-operation saves and generated-reference recovery, with explicit remaining gateway/UI/scale limits.
- [Full native candidate-57 regression](runtime/billing/STOCK_OPERATION_PAGING.md#full-native-candidate-57-regression-16-october-2026): 814 addon cases passing with mandatory analytics, 117-table preservation and exact committed Python source hashes. This is not installed-upgrade or later client/browser acceptance.
- [Stock returns in development](runtime/billing/STOCK_RETURNS.md): native return form, signed creation/status contracts and remaining browser recovery/UI/release gates.
- [Reports adapter](runtime/reports/README.md): native report generation, export and branding limits.

Clinical-to-ERP synchronization is not enabled in the current isolated tester setup. Do not assume a clinical order produces an invoice there. Full stock fulfillment, remaining clinical parity and separate laboratory/radiology/analytics/outreach interfaces still need work. Clinical AI and national digital-health integrations must not be described as released simply because they are on a roadmap.

Branch selection matters. The current starter-task base is `codex/qorlia-fork-foundation`, not an assumed up-to-date `main`; see [starter issue 3](https://github.com/ash-sxn/qorlia-bahmni/issues/3). Billing increments are in [draft PR 4](https://github.com/ash-sxn/qorlia-bahmni/pull/4), based on [draft PR 2](https://github.com/ash-sxn/qorlia-bahmni/pull/2). Confirm the base in your task before starting. Do not merge these branches yourself or copy unfinished changes into another task.

## Quick setup overview

Use Node.js 22, Yarn Classic 1.22 and the committed lockfile. Full instructions and Windows notes are in [Local setup](docs/setup-guide.md).

```bash
git clone https://github.com/ash-sxn/qorlia-bahmni.git
cd qorlia-bahmni
git fetch origin
git switch --create codex/your-task origin/codex/qorlia-fork-foundation
yarn install --frozen-lockfile
```

After receiving the approved backend configuration:

```bash
NX_DAEMON=false yarn nx serve @bahmni/distro --skipSync
```

Open `http://127.0.0.1:3000/bahmni-v2/login` and sign in locally with an approved synthetic account. Public-site sessions do not carry over. The development-only `/bahmni-v2/design-preview` route contains samples, not a connected clinical workflow.

## Design references

Use the existing tokens, Carbon-based controls and accessible layouts. Do not introduce a second design system for a module.

- [Qorlia design system](docs/QORLIA_DESIGN_SYSTEM.md)
- [Hospital branding format and restrictions](docs/HOSPITAL_BRANDING.md)
- [Design QA](docs/design-qa.md)
- [All documentation and component guides](docs/README.md)

## Module and package guides

These local READMEs explain each area's responsibility and link to routes, services and tests. Read the shared setup first; do not install or launch each module as a separate product.

| Area                                                          | Guide                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Home and signed-in Billing                                    | [Home](apps/home/README.md)                                      |
| Consultation, programmes, orders, beds, inpatient and theatre | [Clinical](apps/clinical/README.md)                              |
| Patient search and registration                               | [Registration](apps/registration/README.md)                      |
| Appointment list, calendar and service settings               | [Appointments](apps/appointments/README.md)                      |
| Patient files and references                                  | [Patient Documents](apps/patient-documents/README.md)            |
| CSV, audit and order sets                                     | [Administration](apps/admin/README.md)                           |
| Report jobs and downloads                                     | [Reports](apps/reports/README.md)                                |
| Shared command interface                                      | [Command palette](apps/command-palette/README.md)                |
| Controls, tokens and branding                                 | [Design-system package](packages/bahmni-design-system/README.md) |
| Clinical API contracts and helpers                            | [Services package](packages/bahmni-services/README.md)           |
| Shared hospital UI and contexts                               | [Widgets package](packages/bahmni-widgets/README.md)             |

## Licensing and source credit

Read [LICENSE](LICENSE), [NOTICE](NOTICE) and the applicable component licence before changing or distributing code. Covered frontend files retain Mozilla Public License 2.0 with Healthcare Disclaimer. The original Billing adapter declares [LGPL-3.0-or-later](runtime/billing/LICENSE); the Reports adapter has its own [AGPL licence](runtime/reports/LICENSE). These are not one interchangeable licence for the whole stack.

Keep attribution and source notices. Branding does not grant upstream trademark rights. Never add unlicensed assets, proprietary upstream modules, credentials, private hospital data or internal operations documents. See [Contribution rules](CONTRIBUTING.md#licensing-and-private-information).
