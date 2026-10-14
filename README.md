# Qorlia hospital application

Qorlia is building a consistent hospital workspace on top of [Bahmni Apps Frontend](https://github.com/Bahmni/bahmni-apps-frontend). We redesign the interface and integrate native workflows, rather than replace the clinical database or accounting engine. Bahmni and its contributors built the upstream software. Their history, copyright and required notices remain.

This public repository contains the React hospital application, shared UI/service libraries and selected backend adapters. It is not the separate private Qorlia marketing website. This is development work, not a production-ready release. A branch in this repository is not automatically the build running on a demo or tester site.

## New to the project? Start here

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

No production credentials, paid AI account or new server is required to start learning the source. Real workflow testing requires approved synthetic backend access. Do not disable authentication to bypass that prerequisite.

## Current development status

The goal is full native workflow/API parity in a consistent Qorlia interface. Billing is the current integration priority. The React login, shared home and module routes exist, but a rendered screen is not proof that every feature is accepted.

- [Feature parity ledger](docs/FEATURE_PARITY.md): dated evidence, accepted increments and remaining work.
- [Backend readiness](docs/BACKEND_READINESS.md): backend compatibility, tested environments and integration gaps.
- [Billing adapter](runtime/billing/README.md): native Odoo integration and limits.
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

## Licensing and source credit

Read [LICENSE](LICENSE), [NOTICE](NOTICE) and the applicable component licence before changing or distributing code. Covered frontend files retain Mozilla Public License 2.0 with Healthcare Disclaimer. The original Billing adapter declares [LGPL-3.0-or-later](runtime/billing/LICENSE); the Reports adapter has its own [AGPL licence](runtime/reports/LICENSE). These are not one interchangeable licence for the whole stack.

Keep attribution and source notices. Branding does not grant upstream trademark rights. Never add unlicensed assets, proprietary upstream modules, credentials, private hospital data or internal operations documents. See [Contribution rules](CONTRIBUTING.md#licensing-and-private-information).
