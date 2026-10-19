# New-team handover: Qorlia engineering

Latest backend candidate: [complete validation review](../runtime/billing/VALIDATION_PAGED.md)
adds compact complete load and ordered native input-prompt/effect pages. Both
responses remain non-writable until the matching save/recovery contract exists.
Do not connect these versions/proofs to older writes or change tester branches.
Home passes 1,109 cases/88 suites; 36 scoped native cases pass with 130-table
preservation and 93 matching Python hashes. Client replay accepts 69 native JSON
responses with mocked transport. Runtime acceptance remains separate.

Latest consumer: [saved validation recovery reader](../runtime/billing/VALIDATION_RECOVERY_PAGING.md#react-saved-step-reader-source-19-october-2026)
connects the transfer resume route to compact native receipt status and complete
saved prompt/reference pages. It does not enable large validation writes or
reopen review access. Evidence and remaining gates are separate in that guide;
starter-task bases remain unchanged.

Latest backend/client candidate: [compact saved-validation recovery](../runtime/billing/VALIDATION_RECOVERY_PAGING.md)
adds three read-only receipt/prompt/reference APIs while preserving original
validation-step requests and all older write contracts. It is a prerequisite,
not a larger validation writer, migrated React consumer or tester update.
Home passes 1,049 cases/86 suites; native evidence and remaining gates are linked
separately. The review gate stays closed and starter-task bases are unchanged.

Newest API-consumer source, 19 October:
[complete operation editor](../runtime/billing/STOCK_OPERATION_PAGING.md#react-operation-consumer-source-19-october-2026)
connects create/edit/removal and all native form/choice/review/recovery APIs.
Legacy pending operations keep their original protocol. Native fields and
permissions remain; only operation editing's old UI size lock is removed. Home
passes 1,012 cases/85 suites with SDK/storage doubles. Large validation/returns
and actual browser/gateway/IndexedDB acceptance remain. No build/server, review
reopening or deployment. This does not change your assigned starter-task base.

Earlier API-consumer source, 19 October:
[complete preparation review](../runtime/billing/STOCK_RESERVATION_PAGING.md#react-preparation-consumer-source-19-october-2026)
connects all four native actions through the shared confirmation/preparation
dialog, exact recovery and stop, while preserving legacy pending routes. Home
passes 970 cases/83 suites with SDK/storage doubles. Paged operation editing,
large validation/returns and actual browser/gateway/IndexedDB acceptance remain.
This is not permission to build/publish the UI or open the expired review gate.

Latest recovery candidate: [stop an exact pending stock request](../runtime/billing/STOCK_REQUEST_STOP.md)
adds three fixed native/client methods and confirmation-screen handling. It does
not cancel transfers or undo accepted actions. Read the author-bound marker,
matching-writer deployment requirement and separate HTTP/browser release gates
before changing recovery. The expired review gate stays closed.
The later [six native HTTP races](../runtime/billing/STOCK_REQUEST_STOP.md#native-http-race-and-recovery-checkpoint-18-october-2026)
now pass with independent post-close checks. This does not deploy the feature or
complete browser acceptance. The later operation/preparation source migrations
are linked above.

Newest API-consumer source: [complete confirmation review](../runtime/billing/STOCK_CONFIRMATION_PAGING.md#react-confirmation-consumer-source-16-october-2026)
connects the five paged APIs with exact recovery, while preserving the older
pending-request dialog. Tests are source/JSDOM evidence, not permission to open
the expired gate, build/publish the UI or mark the whole module accepted.

Latest client integration source: [stock recovery storage](../runtime/billing/STOCK_RECOVERY.md)
accepts the three complete-review stock protocols without losing older pending
requests. This is not a migrated dialog or tester update. Read its exact storage
contract before changing a stock save/recovery consumer.

[Project README](../README.md) · [Learning path](developer-start-here.md) · [Architecture](architecture.md) · [Team workflow](team-workflow.md)

This is the entry brief for Aniket, Gautam and future contributors. It assumes no prior hospital-software or professional development experience. Read the linked guides progressively, not all source files at once. Updated 16 October 2026. Task owners must confirm current versions and access before implementation.

For the team's architecture discussion, use [the development playbook](development-playbook.md#1-explain-the-architecture-back-to-the-team). Have each contributor explain one request chain back to the reviewer. Its debugging and Git sections support the next step from reading the code to contributing a tested change.

For an actual first meeting, follow [the 45-minute briefing agenda and understanding checks](development-playbook.md#9-run-the-first-team-architecture-briefing). It ends with one setup/trace record and a proposed next checkpoint per person. It also explains how to read the current handbook without accidentally switching an assigned task onto unfinished integration code.

## 1. The project in plain language

Qorlia is building one consistent hospital workspace using Bahmni and its native services. A patient can be registered, treated, booked for appointments and associated with orders and documents. Billing and inventory are handled by a separate native ERP service. We change and connect the interface without inventing a second clinical record or accounting ledger.

This public repository is the hospital product. The private Qorlia marketing website and the Legal Assistant application are separate projects. A feature request for one must not silently become work in another.

The existing redesign includes React login/navigation, module screens, shared design tokens, clinical service integrations, native report/document adapters and a substantial Billing integration. This does not mean all workflows are finished. In particular, stock confirmation is not completed delivery, separate labs/radiology interfaces are not finished by adding a menu link, and clinical-to-ERP synchronization is not enabled in the current isolated tester setup.

Use the [parity ledger](FEATURE_PARITY.md) and [backend readiness](BACKEND_READINESS.md) for scoped evidence. Features described in a proposal, AI roadmap or management presentation are not automatically implemented capabilities.

For a small current backend example, read [the native operation-form walkthrough](../runtime/billing/STOCK_OPERATION_FORMS.md).
It traces a form through scope checks, native onchange and review boundaries,
and explains why a compact readable form does not make a large save complete.

The next layer is [complete paged operation review](../runtime/billing/STOCK_OPERATION_PAGING.md).
It explains why every effect page must be reviewed, why a failed connection must
reuse the original request, and which backend/client results still need real
HTTP and React/browser verification. Do not enable a legacy large-save button
just because the new native protocol exists in source.

The later [operation HTTP checkpoint](../runtime/billing/STOCK_OPERATION_PAGING.md#native-http-operation-and-recovery-checkpoint-16-october-2026)
now verifies scoped duplicate/lost-response/create/edit/delete recovery on large
synthetic transfers. It is not an available tester UI. Source 55 adds
[paged reservation actions](../runtime/billing/STOCK_RESERVATION_PAGING.md), with
typed clients and source gateway checks; its first native run has one preview
guard error. The corrected pending-audit baseline passes two focused tests;
the broader corrected run passes all 136 native cases, with 117-table preservation
and 88 matching Python source hashes. The actual client also accepts 152 native
JSON frames with mocked transport. A separate native HTTP run completes ten
logical actions over 24 effect pages with exact-request recovery and independent
post-close SQL checks. The contract documents retained observer failures and
before-image limits; this is not a running tester UI or browser acceptance.
A separate full candidate-55 regression passes all 798 native cases with
117-table preservation and 88 Python hashes matched to its source commit, not
the newer candidate-56 worktree.
The existing React dialogs and durable
recovery still need migration.
Candidate 56 adds an [internal complete inventory reader](../runtime/billing/STOCK_INVENTORY_SCOPE.md)
for the new reservation protocol. Its corrected scoped run passes all 38 native
reservation cases, including eight new cases, with 117-table preservation and
88 matching Python source hashes. It is not ready for tester use and does not
migrate the operation editor or expose a stock browser. Its separate actual
native HTTP check passes all four preparation actions on 2,001 quants with
independent post-close SQL, restored stock totals and exact-request recovery.
Actual gateway/browser and scale acceptance remain separate.
Candidate 57 [integrates the complete reader with the new operation form](../runtime/billing/STOCK_OPERATION_PAGING.md#candidate-57-complete-operation-inventory-16-october-2026)
and adds a matching native choice-search API/client. Home/source checks pass;
the corrected native run passes all 56 cases with 117-table preservation, zero
failures/errors/skips and all 88 Python hashes matched. The typed client accepts
285 native JSON frames with mocked transport. Separate actual native HTTP checks
pass four requests over seven effect pages on 2,001 quants, with native choices,
exact recovery and independent post-close SQL/hash verification. The diagnostic
is stopped. The separate full native regression passes all 814 cases, zero
failures/errors/skips, with 117-table preservation and all 88 Python hashes
matched to `71c04d26` on installed-49. It does not verify later client-only source.
The existing operation dialog and choice
component still use the legacy protocol, so this is not a tester UI update.
Do not reopen expired access or change your assigned task base to try these APIs.

## 2. Which version should I open?

| Purpose                                         | Where to look                                                                                                   | Important distinction                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| First entry from GitHub                         | [Default README](https://github.com/ash-sxn/qorlia-bahmni)                                                      | Its Qorlia introduction links to the current development handbook   |
| Current handbook and Billing integration source | `codex/billing-delivery-parity`                                                                                 | Reading this branch does not make it your task's approved code base |
| Proposed first Appointments task                | [Issue 3](https://github.com/ash-sxn/qorlia-bahmni/issues/3), currently based on `codex/qorlia-fork-foundation` | Confirm the base in the task before creating your branch            |
| Unfinished Billing integration                  | [Draft PR 4](https://github.com/ash-sxn/qorlia-bahmni/pull/4)                                                   | Not a completed-product release or permission to merge              |
| Running review environment                      | Operator's private environment pack                                                                             | Record source, build, backend and configuration versions separately |

### Current integration checkpoint, in plain language

For the newest integration, the source React panel now reads summary/detail pages
from one snapshot, with component coverage of 101 transfers, 501 moves and 2,001
operations. Read the [consumer checkpoint](../runtime/billing/STOCK_TRANSFER_DETAILS.md#react-api-consumer-checkpoint-16-october-2026)
for its source-only evidence and remaining gateway/browser acceptance. Large
write controls remain unavailable in that view; do not treat readable pages as
a completed review of a stock action.

Source 51 has complete transfer detail read pages and source 52 adds a separate
large-transfer confirmation protocol. Read
the [paged confirmation guide](../runtime/billing/STOCK_CONFIRMATION_PAGING.md)
before working on it. Typed clients/named source routes now exist, with scoped
private native HTTP review/save/recovery evidence, but no confirmation review/recovery UI
or opened review gate. The guide includes the API sequence, signing/recovery rules and
remaining acceptance boundaries. A native backend candidate is not an available
tester UI; it must not be wired into the old full-graph modal or used to reopen
the review gate. The historical browser evidence below concerns smaller workflows
on earlier isolated runtimes.

The [large native HTTP checkpoint](../runtime/billing/STOCK_CONFIRMATION_PAGING.md#large-native-http-and-recovery-checkpoint-16-october-2026)
now covers complete 501-move and 2,001-operation confirmations and three generated
references with exact recovery. It is API evidence on a private synthetic copy,
not an available tester screen. Other large actions, the confirmation UI, broader
configuration and performance acceptance remain separate work.

The [full native addon regression](../runtime/billing/STOCK_CONFIRMATION_PAGING.md#full-addon-mandatory-analytics-regression-16-october-2026)
now passes 765 cases with mandatory analytics enabled and 25-table preservation.
Older positive fixtures were corrected, not production validation relaxed. Follow
the [mandatory-analytics fixture guidance](testing-guide.md#mandatory-analytic-configuration-is-part-of-the-test)
when adding a test. This is not evidence that every screen or deployment is ready.

- **Hosted tester:** protected Billing review remains on adapter 43. An adapter is the backend code connecting Qorlia to native Odoo actions. Newer source in GitHub does not automatically update that server.
- **Newer development work:** adapter 48 uses individually reviewed native validation steps. Some native actions save preparation before asking the next question. The interface must preserve that saved result instead of replaying the whole conversation. Earlier adapter contracts remain documented for history and recovery of older pending requests, not as the recommended new implementation.
- **What has actual browser evidence:** on an isolated synthetic copy, receipt preparation survives reload/tab reopening; immediate preparation survives declining an expiry warning; and a genuinely lost accepted response can be recovered after full reload without another save. There is also a scoped narrow-screen/keyboard prompt check. Component tests, native tests, HTTP checks and browser checks are different evidence levels.
- **Additional completed-stock evidence:** subsequent isolated browser saves verify full/immediate five-unit deliveries and two-unit partial delivery with one three-unit backorder. Native read-back verifies stock/valuation and unchanged protected records. A stale delivered-quantity cache was fixed and verified on return to the order. See the [completed-stock checkpoint](../runtime/billing/STOCK_VALIDATION.md#browser-completed-delivery-and-order-refresh-checkpoint-15-october-2026).
- **Additional receipt-completion evidence:** a later isolated browser flow completes a five-unit incoming receipt, creates the reviewed batch and reloads Done. Independent reads verify batch prices/expiry, stock ten to fifteen and one standard-cost valuation, with no customer delivery or manual-valuation journal. Native step tests also cover balanced automatic journals and duplicate-safe replay, but that is not automatic-journal browser acceptance. See the [receipt checkpoint](../runtime/billing/STOCK_VALIDATION.md#browser-completed-receipt-and-native-automatic-valuation-regression-15-october-2026).
- **What is not accepted by those checks:** automatic-valuation journal browser coverage, session-expiry coverage, every configuration and a matching protected release. Saved preparation is not completed delivery, and a declined warning does not undo preparation already saved by the native system. The temporary local review gate has expired; do not renew or bypass it without approval.

For implementation details and dated evidence, read the [confirmation contract](../runtime/billing/STOCK_CONFIRMATION.md), [native step contract](../runtime/billing/STOCK_VALIDATION.md#native-intermediate-persistence-audit-and-adapter-48-step-contract), [receipt browser checkpoint](../runtime/billing/STOCK_VALIDATION.md#react-per-step-migration-and-receipt-browser-checkpoint-15-october-2026) and [expiry/response-loss checkpoint](../runtime/billing/STOCK_VALIDATION.md#browser-expiry-decline-and-lost-response-checkpoint-15-october-2026). Do not upgrade the tester, disable gates or copy unfinished integration code into your task to make versions match. Do not repeat a save just because its response was lost.

## 3. Resources needed to begin

- Your own GitHub account, Git, Node.js 22, Yarn Classic 1.22, an editor and a browser. Follow [setup](setup-guide.md), including its Windows instructions.
- A task with an approved base branch, one accountable owner, a reviewer and written acceptance conditions.
- An operator-provided synthetic environment pack when testing APIs. Credentials and private infrastructure instructions stay outside GitHub.
- A bounded first task and time to read existing code. Installing all hospital services, buying a server or obtaining the owner's AI account is not an onboarding prerequisite.

Python/Odoo runtime access is needed only for assigned Billing backend work. Docker/Java or specialist tools are task-specific, not compulsory requests for every newcomer. Test libraries are already project dependencies. Do not install a second framework or replace the lockfile to get started.

### Request only the resources your task needs

Send this privately to the task owner when something is missing. Do not include passwords, cookies or tokens. The owner/operator supplies approved access; colleagues do not pass around another person's credentials.

```text
Name / own GitHub username:
Project / task link / proposed workflow:
Approved base branch and starting SHA, if known:
Available working hours and operating system:
Installed Git / Node / Yarn versions:
Last command or screen successfully checked:
Exact sanitized error or missing prerequisite:
Specific resource needed and why this task needs it:
Access owner / reviewer to confirm:
Can continue with source reading or tests meanwhile:
```

For frontend learning, request source access and the documented toolchain first. For actual API acceptance, request an approved synthetic environment and scoped account. For a native backend assignment, request the matching runtime and module/configuration versions from the operator. A paid coding assistant, production database, owner's GitHub login or unrestricted server account is not a default prerequisite.

If you have never used Git, JavaScript or a terminal, say so at the first checkpoint. Read [the beginner guide](reading-and-changing-code.md) with a reviewer, then explain one small read before modifying a clinical or financial write. These guides are an onboarding path, not a claim that a first-time developer can safely own the whole stack immediately.

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
