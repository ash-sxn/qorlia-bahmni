# New-team handover: Qorlia engineering

[Project README](../README.md) · [Learning path](developer-start-here.md) · [Architecture](architecture.md) · [Team workflow](team-workflow.md)

This is the entry brief for Aniket, Gautam and future contributors. It assumes no prior hospital-software or professional development experience. Read the linked guides progressively, not all source files at once. Updated 15 October 2026. Task owners must confirm current versions and access before implementation.

For the team's architecture discussion, use [the development playbook](development-playbook.md#1-explain-the-architecture-back-to-the-team). Have each contributor explain one request chain back to the reviewer. Its debugging and Git sections support the next step from reading the code to contributing a tested change.

For an actual first meeting, follow [the 45-minute briefing agenda and understanding checks](development-playbook.md#9-run-the-first-team-architecture-briefing). It ends with one setup/trace record and a proposed next checkpoint per person. It also explains how to read the current handbook without accidentally switching an assigned task onto unfinished integration code.

## 1. The project in plain language

Qorlia is building one consistent hospital workspace using Bahmni and its native services. A patient can be registered, treated, booked for appointments and associated with orders and documents. Billing and inventory are handled by a separate native ERP service. We change and connect the interface without inventing a second clinical record or accounting ledger.

This public repository is the hospital product. The private Qorlia marketing website and the Legal Assistant application are separate projects. A feature request for one must not silently become work in another.

The existing redesign includes React login/navigation, module screens, shared design tokens, clinical service integrations, native report/document adapters and a substantial Billing integration. This does not mean all workflows are finished. In particular, stock confirmation is not completed delivery, separate labs/radiology interfaces are not finished by adding a menu link, and clinical-to-ERP synchronization is not enabled in the current isolated tester setup.

Use the [parity ledger](FEATURE_PARITY.md) and [backend readiness](BACKEND_READINESS.md) for scoped evidence. Features described in a proposal, AI roadmap or management presentation are not automatically implemented capabilities.

## 2. Which version should I open?

| Purpose                                         | Where to look                                                                                                   | Important distinction                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| First entry from GitHub                         | [Default README](https://github.com/ash-sxn/qorlia-bahmni)                                                      | Its Qorlia introduction links to the current development handbook   |
| Current handbook and Billing integration source | `codex/billing-delivery-parity`                                                                                 | Reading this branch does not make it your task's approved code base |
| Proposed first Appointments task                | [Issue 3](https://github.com/ash-sxn/qorlia-bahmni/issues/3), currently based on `codex/qorlia-fork-foundation` | Confirm the base in the task before creating your branch            |
| Unfinished Billing integration                  | [Draft PR 4](https://github.com/ash-sxn/qorlia-bahmni/pull/4)                                                   | Not a completed-product release or permission to merge              |
| Running review environment                      | Operator's private environment pack                                                                             | Record source, build, backend and configuration versions separately |

At this checkpoint, protected Billing review remains on adapter 43. Later adapter 45 confirmation source has separate isolated native HTTP/local-browser evidence. Native delivery validation has adapter 47 service/gateway and actual isolated HTTP checks, including exact receipt recovery. Its React wizard and shared recovery controls have component/storage tests, not actual browser save/reload or publication acceptance yet. Do not upgrade the tester, copy unfinished code or disable gates to make versions match. See the [confirmation contract](../runtime/billing/STOCK_CONFIRMATION.md) and [delivery-validation contract](../runtime/billing/STOCK_VALIDATION.md).

The subsequent adapter 48 [step contract](../runtime/billing/STOCK_VALIDATION.md#native-intermediate-persistence-audit-and-adapter-48-step-contract) corrects native intermediate-commit semantics. Its native/service/gateway checks and isolated HTTP/read-back pass; React/storage migration is still pending. Do not treat a terminal-only wizard as complete native close/cancel parity or replay a decision after it has committed.

## 3. Resources needed to begin

- Your own GitHub account, Git, Node.js 22, Yarn Classic 1.22, an editor and a browser. Follow [setup](setup-guide.md), including its Windows instructions.
- A task with an approved base branch, one accountable owner, a reviewer and written acceptance conditions.
- An operator-provided synthetic environment pack when testing APIs. Credentials and private infrastructure instructions stay outside GitHub.
- A bounded first task and time to read existing code. Installing all hospital services, buying a server or obtaining the owner's AI account is not an onboarding prerequisite.

Python/Odoo runtime access is needed only for assigned Billing backend work. Docker/Java or specialist tools are task-specific, not compulsory requests for every newcomer. Test libraries are already project dependencies. Do not install a second framework or replace the lockfile to get started.

### First-session checklist

Do this in order. If a prerequisite is missing, report it rather than spending the session guessing configuration.

- [ ] Read this handover, [orientation](developer-start-here.md) and [architecture](architecture.md). Explain in your own words which system owns clinical data and which owns Billing.
- [ ] Send your own GitHub username and available working hours privately to Ashutosh. Confirm the assigned issue, reviewer and base branch before coding.
- [ ] Follow [setup](setup-guide.md). Record Git, Node and Yarn versions, your branch, starting SHA and dependency-install result.
- [ ] Obtain the approved synthetic environment pack privately. Never paste it into a public issue, screenshot or PR.
- [ ] Open the exact local `/bahmni-v2/login` route. If it fails, report the sanitized error and the boundary that failed, not just “not working”.
- [ ] Complete [the appointment read exercise](first-contribution.md). Identify the route, component, service, endpoint and response. Start with a read, not a clinical or accounting write.
- [ ] Run the relevant [focused checks](testing-guide.md). Record both failures and successes. A setup failure should name the prerequisite needed.
- [ ] Send a short setup/read-trace note using [the daily update](team-workflow.md#daily-update-with-evidence). Ask the reviewer to agree the next bounded task.

Do not commit an unchanged setup note just to produce a PR. A useful first checkpoint can be a sanitized issue comment with the trace and evidence. If a real defect is reproduced, agree its scope before fixing it.

## 4. First checkpoints, based on evidence

These are a learning sequence, not promised deadlines or confirmed employee assignments.

| Checkpoint            | Deliverable                                                                     | Reviewer should be able to verify                                  |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A. Orientation        | Read this brief and the architecture, explain the product and separate backends | Contributor distinguishes clinical records, ERP records and UI     |
| B. Setup              | Own clean clone/branch, starting SHA, tool versions, install/test results       | Commands can be repeated and any missing prerequisite is named     |
| C. Read trace         | Complete [the appointment exercise](first-contribution.md)                      | Route, component, query, service, endpoint and response are linked |
| D. Native comparison  | Expected/actual table for one workflow                                          | Difference is reproduced, not inferred from appearance             |
| E. First PR           | One tested correction, or the audit if no defect is found                       | Scope is small, evidence is honest, shared files were coordinated  |
| F. Independent replay | Tester follows written steps on approved synthetic data                         | Result survives reload and permissions/error cases are checked     |

Before progressing to writes, the contributor should explain back: which record is being changed, which server authorizes it, what a timeout means, how a duplicate is prevented and which test proves which part. A beginner should ask for review when these answers are uncertain, not improvise clinical or financial rules.

## 5. Suggested starting split

Ashutosh confirms priorities, individual assignments, approved bases, access and reviewers. The following is a proposal for that decision, not an assignment sent to employees.

- **Aniket:** the existing issue 3 setup/Appointments audit, followed by one reproduced correction. Confirm availability and understanding first.
- **Gautam:** independently trace the read and reproduce native behaviour, then take a separate non-overlapping issue selected from that audit. His GitHub account/access must be confirmed separately; do not share Aniket's account.
- **Ashutosh with AI assistance:** shared architecture/API review and the current Billing integration. Do not allocate a second developer to the same gateway, encounter-matching or stock-recovery files without agreeing the change boundary.
- **Up to three designated testers, if available:** one reception/clinical/appointments lane, one Billing/inventory lane, and one permissions/recovery/integration lane. Name actual people in each task. They need independent instructions and scoped accounts, not production credentials.

Everyone works through their own task branch and PR. Start with audit/test/documentation tasks if coding skills are still developing. Do not assume three testers provide three additional development lanes. Clinical/accounting decisions require the appropriate domain reviewer.

## 6. How a new feature reaches the application

1. Capture the user, problem and example. Ask whether native Bahmni/Odoo already provides it. Distinguish a configuration change from a code change.
2. Use the [task brief](task-brief-template.md) to define scope, data, permissions, dependencies, estimate assumptions and acceptance. Unknowns need a named decision owner.
3. Trace the [architecture boundaries](architecture.md#choose-the-correct-change-boundary) and read all callers of the service you will change. Agree shared files before editing.
4. Add a regression, then change the smallest appropriate layer using the existing design system and services. Do not create a new database or public API just because a screen needs another field.
5. Check loading, empty, denied, expired, rejected and uncertain-save outcomes. Run [tests](testing-guide.md) and perform permitted native save/read-back if the change writes data.
6. Open a PR with evidence and updated guides. Maintainer review, tester acceptance and release approval are distinct steps.

No installation, tutorial, AI-generated patch, passing mock test or screenshot alone is a finished feature. See [Contribution rules](../CONTRIBUTING.md).

## 7. Management and monitoring

Use [team workflow](team-workflow.md) for phase/status definitions and the daily update. Use GitHub issues/PRs as code evidence; link them from the agreed internal board. This handbook does not create a board or assign dates automatically.

Monitor concrete outputs: traced workflow, reproduced issue, PR, tests, independent replay, blocker and next checkpoint. Do not judge progress by lines of code, number of screenshots or a guessed percentage. Re-estimate after an audit exposes unknown native behaviour. Clarify what “EL” means with management before treating it as an allocation field.

### What management should receive

For each project and phase, request one named owner, a concrete deliverable, its dependencies, a target checkpoint and evidence links. The next checkpoint might be “Appointments read audit reviewed”, not an unqualified promise to complete a module. The [task template](task-brief-template.md) captures these fields.

At a short review, each contributor should be able to demonstrate their result and explain one request from screen to server. The reviewer checks the diff and tests; a tester independently repeats the acceptance steps. If a blocker changes the estimate, report the changed assumption and decision needed. Installation, implementation, acceptance and release are separate milestones.

For vendors, add source handover, dependency/licence inventory, reproducible checks and the agreed acceptance reviewer. Commercial terms and payments remain private owner decisions. This workflow is deliverable monitoring, not permission to monitor personal devices or unrelated activity.

The owner can share this short introduction with the team:

> Start from Qorlia's README and follow the new-team handover, setup and appointment exercise. Before coding, send your GitHub username, availability, tool versions, approved branch/SHA and a short explanation of one API read. We will agree one small task with an owner, reviewer, tester and acceptance checklist. Work on your own branch and submit a PR. Do not change production, share accounts or include credentials/patient data in GitHub. Report progress using task links, test evidence, blockers and your next deliverable.

This is a draft for Ashutosh to share. It has not been sent on Mattermost or WhatsApp by adding this document.

## 8. Safety and source ownership

Retain upstream licences and attribution. Use [the licence links and boundaries](../CONTRIBUTING.md#licensing-and-private-information); publishing code does not remove upstream obligations. Keep public technical/contribution documentation here, but private runbooks, access secrets, customer contracts and identifiable hospital data outside the repo. New AI or national digital-health work needs explicit scope and evaluation, not a blanket compliance claim.

Continue with [beginner orientation](developer-start-here.md), then [local setup](setup-guide.md). Keep the [code-reading guide](reading-and-changing-code.md) beside your editor.
