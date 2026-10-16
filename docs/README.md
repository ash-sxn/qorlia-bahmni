# Documentation index

[Project README](../README.md)

## Learn and contribute

- [New-team handover and proposed first checkpoints](team-handover.md)
- [Beginner orientation](developer-start-here.md)
- [Reading and changing code, with beginner explanations](reading-and-changing-code.md)
- [Development playbook: architecture briefing, debugging, Git and review](development-playbook.md)
- [First team architecture session: agenda, understanding checks and handover record](development-playbook.md#9-run-the-first-team-architecture-briefing)
- [Local setup and troubleshooting](setup-guide.md)
- [Architecture and data/session boundaries](architecture.md)
- [Repository map](project-structure.md)
- [Module learning guide](module-guide.md)
- [API integration and safe saves](api-integration-guide.md)
- [Contribution workflow](../CONTRIBUTING.md)
- [Testing and acceptance](testing-guide.md)
- [Team allocation and monitoring](team-workflow.md)
- [First contribution: trace an appointment read](first-contribution.md)
- [Copyable task and feature brief](task-brief-template.md)

## Current evidence and runtime

- [Feature parity ledger](FEATURE_PARITY.md)
- [Backend readiness](BACKEND_READINESS.md)
- [Billing adapter](../runtime/billing/README.md)
- [Native delivery validation and wizard contract](../runtime/billing/STOCK_VALIDATION.md)
- [Native stock return workflow and development contract](../runtime/billing/STOCK_RETURNS.md)
- [Large-transfer confirmation backend candidate](../runtime/billing/STOCK_CONFIRMATION_PAGING.md)
- [Complete inventory scope for paged reservation and scoped native evidence](../runtime/billing/STOCK_INVENTORY_SCOPE.md)
- [Reports adapter](../runtime/reports/README.md)

These ledgers contain historical checkpoints. Read the newest relevant entry and distinguish source, private API, protected tester and production acceptance. A past successful test is not current whole-product proof.

## Shared design and component guides

For module responsibilities, routes, services and tests, use the [module and package READMEs](../README.md#module-and-package-guides).

- [Qorlia design system](QORLIA_DESIGN_SYSTEM.md)
- [Hospital branding](HOSPITAL_BRANDING.md)
- [Design QA](design-qa.md)
- [Colour tokens](bahmni-colour-token-system.md)
- [Icons](bahmni-icon-guide.md)
- [Header and side navigation](header-with-side-nav-guide.md)
- [Data table](data-table-guide.md)
- [Sortable data table](sortable-data-table-guide.md)
- [Notifications](global-notification-guide.md)
- [Command palette](command-palette-guide.md)
- [Print button](document-print-button-guide.md)
- [Translations](i18n-guide.md)

## Clinical implementation references

- [Consultation events](consultation-event-system.md)
- [CDSS implementation guide](CDSS-Implementation-guide.md)
- [CDSS architecture decision](adr/CDSS-ADR.md)

Older/upstream references describe their own scope, not automatically the current Qorlia feature status. Check source and configuration before following an outdated assumption. CDSS-related code is not evidence of autonomous AI or production clinical validation.

## Source and licence notices

- [Root licence](../LICENSE)
- [Notices](../NOTICE)
- [Contribution/licensing boundaries](../CONTRIBUTING.md#licensing-and-private-information)

Developer architecture and contribution guides are public by the owner's request. Credentials, identifiable hospital/customer records and internal deployment/operations packs are not documentation to publish here.
