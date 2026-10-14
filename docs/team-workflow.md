# Team task allocation and monitoring

[README](../README.md) · [Previous: testing](testing-guide.md) · [Documentation index](README.md)

This is the working contribution process, not approval for new spending, infrastructure access or a production launch. Product scope, priorities, access and release decisions remain with the project owner.

## Phases and boundaries

| Phase                    | Deliverable                                                       | Exit evidence                                                      |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Onboarding               | Own account, clean branch, local setup and one traced read        | Reproducible setup note and approved synthetic access              |
| Native workflow audit    | Small feature/API/configuration gap matrix                        | Native expected behaviour and observed new UI result               |
| Implementation           | One bounded workflow with regressions                             | Source PR, tests/types/lint/build and safe error handling          |
| Acceptance               | Synthetic save/read-back, permissions, recovery and design review | Independent tester evidence and domain review where needed         |
| Protected review release | Approved source package and gated tester access                   | Matching source/runtime, rollback and hosted acceptance            |
| Production readiness     | Full release gates and operational support                        | Explicit owner/operator approval, not a developer's “done” message |

The overall product objective remains complete reskin and native API parity. Billing is the current priority; React modules and separate laboratory/radiology/analytics/outreach products retain their own remaining work. Split work into reviewable workflows, not “make the whole module” assignments without acceptance conditions.

## Required task fields

Each issue/board card needs project, phase, workflow, one accountable owner, reviewer, tester, approved base branch, dependencies, acceptance checklist, target checkpoint, PR/evidence links, risk and next step.

Suggested statuses: Backlog, Ready, In progress, Review, Testing, Accepted, Released and Blocked. Accepted means the scoped workflow is verified. Released means it is in the approved target build. Keep blocked reasons concrete and name who can resolve them. Do not use a status label to hide incomplete acceptance.

If a company abbreviation such as “EL” is not defined, obtain its full meaning, owner and deliverable before adding it to project allocation. Do not guess what management meant.

## Ownership and parallel work

Assign one developer to an initial bounded area. Shared authentication/gateway, clinical encounter recovery and native Billing/accounting need coordinated owners. A second developer can audit or test another workflow without simultaneously editing the same shared service.

Before new people receive work, confirm their skills, available hours, setup and access. Pair beginners on a small regression or read workflow. Do not count a person as an independent delivery lane simply because they were added to a chat.

The [Appointments starter issue](https://github.com/ash-sxn/qorlia-bahmni/issues/3) is a proposed first assignment, not a deadline for complete Appointments. Its initial setup/audit/small-PR checkpoint begins after access/configuration are ready. Estimate further work after the audit.

## Daily update, with evidence

```text
Task and PR link:
Owner / current phase:
Concrete change or verified result today:
Checks and evidence:
Blocker and person needed:
Next deliverable / checkpoint:
Scope or estimate change needing owner decision:
```

“Backend setup done” should identify tools/versions and a successfully tested route or command. “Feature complete” should link acceptance, not only a screenshot. Record hours/estimate updates for planning, not surveillance of private devices or unrelated employee activity.

## Testers and vendors

Use testers for independent reproduction and acceptance, not as substitutes for a qualified clinician/accountant reviewing domain semantics. Allocate separate attention to reception/clinical/appointments, Billing/inventory, and permissions/recovery/integration. Named assignments depend on availability and owner approval.

A vendor delivers source in the agreed repository, dependency/licence inventory, reproducible build/test instructions, scoped API evidence, risks and handover. Require PR review and independent acceptance before declaring a milestone delivered. Production access and payment approval are separate decisions.

Do not give employees or vendors access to the owner's AI session or personal credentials. Use individual accounts and scoped permissions. Keep private evidence and environment packs in the approved internal channel, with only sanitized task/PR material on public GitHub.

## Board setup and governance

GitHub issues/PRs hold code tasks and evidence. An internal project board can mirror phase/status/ownership and link to those records. This document does not create that board or configure GitHub branch protection automatically.

Agree the board tool, task owners, review cadence and release gates with the project owner. Avoid two conflicting “sources of truth”: a status change should link its evidence and be reflected on the agreed tracker. Employee requests are project input; priority changes need the owner's decision.
