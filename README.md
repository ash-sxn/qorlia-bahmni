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

Latest API-consumer source connects [paged transfer summaries and details](runtime/billing/STOCK_TRANSFER_DETAILS.md#react-api-consumer-checkpoint-16-october-2026), with component checks for 101 transfers, 501 moves and 2,001 operations. Large signed-write dialogs and gateway/browser acceptance remain unfinished. This does not update the hosted tester or reopen local review access.

- [Feature parity ledger](docs/FEATURE_PARITY.md): dated evidence, accepted increments and remaining work.
- [Backend readiness](docs/BACKEND_READINESS.md): backend compatibility, tested environments and integration gaps.
- [Billing adapter](runtime/billing/README.md): native Odoo integration and limits.
- [Native stock operation forms](runtime/billing/STOCK_OPERATION_FORMS.md): compact single-form backend, complete snapshot checks and remaining save limits.
- [Large-transfer confirmation candidate](runtime/billing/STOCK_CONFIRMATION_PAGING.md): native paged review/save contract, distinct from released UI and tester capabilities.
- [Large confirmation HTTP verification](runtime/billing/STOCK_CONFIRMATION_PAGING.md#large-native-http-and-recovery-checkpoint-16-october-2026): complete 501-move/2,001-operation saves and generated-reference recovery, with explicit remaining gateway/UI/scale limits.
- [Full native regression](runtime/billing/STOCK_CONFIRMATION_PAGING.md#full-addon-mandatory-analytics-regression-16-october-2026): 765 addon cases passing with mandatory analytics enabled, retained failed-run history and unchanged production validation.
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
