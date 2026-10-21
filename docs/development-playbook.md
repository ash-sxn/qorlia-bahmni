# Development playbook: from a request to a reviewed change

[Project README](../README.md) · [Team handover](team-handover.md) · [Architecture](architecture.md) · [Documentation index](README.md)

Use this after [setup](setup-guide.md) and the [code-reading guide](reading-and-changing-code.md). The examples describe the development branch, not every deployed version. You do not need to build another application or install every hospital backend to contribute.

## 1. Explain the architecture back to the team

Use this short briefing with your editor open:

1. **Qorlia is the hospital interface and integration work in this repository.** The marketing website and Legal Assistant are separate projects. We retain upstream Bahmni code and notices.
2. **The shell starts the browser application.** [main.tsx](../distro/src/main.tsx) loads and validates hospital branding, initializes shared assets and mounts React. Its router supplies the `/bahmni-v2/` base. [app.tsx](../distro/src/app/app.tsx) chooses the module for the remaining URL.
3. **A module renders the task.** For example, `/appointments/list` loads [AppointmentListPage](../apps/appointments/src/pages/AppointmentListPage.tsx). Programmes, beds, inpatient, theatre and orders are within Clinical. Billing is within Home, not a new standalone app folder.
4. **Shared packages prevent duplication.** The design system supplies controls and tokens; widgets supply reusable hospital UI and contexts; services supply clinical API functions and domain types. See their [package guides](../README.md#module-and-package-guides).
5. **The server owns the saved truth.** Clinical requests go to OpenMRS/Bahmni. Billing requests use a separate ERP session and native Odoo addon. A label, cache entry or success notification is not a saved record.
6. **The proxy is the connection, not the database.** [Webpack](../distro/webpack.config.js) forwards development requests. The [protected review gateway](../scripts/review-host/server.cjs) has additional gates and named ERP endpoints. A clinical session must not become an ERP credential.
7. **Configuration and versions are part of the feature.** Concepts, forms, programmes, roles, locations and native modules can change behaviour. Record source SHA, frontend build, backend/module version and configuration separately.

End the briefing by tracing one actual permitted read and explaining what remains unverified. The [appointment exercise](first-contribution.md) provides a complete starting route. Do not give the team a guessed whole-product completion percentage.

### The tools and what each one is responsible for

These are existing technologies in the repository, not a shopping list. Start with the [root package manifest](../package.json), [shell entry](../distro/src/main.tsx) and [repository map](project-structure.md). A version written in a dependency range is not always the installed version; the committed lockfile controls resolved dependencies.

| Technology or service                     | Plain-language job                                                                         | What a newcomer should not assume                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| TypeScript and React                      | Describe typed data and the screen the user interacts with                                 | A TypeScript type does not validate an untrusted server response at runtime                           |
| React Router                              | Choose a screen from the URL                                                               | A route or visible menu does not authorize access to a record                                         |
| Carbon and Qorlia's design-system package | Supply consistent controls, tokens, typography and branding                                | A new module should not introduce its own colours or second UI framework                              |
| TanStack Query                            | Load server data, cache it and request a fresh read after a change                         | Cached data is not the database and can become stale                                                  |
| Zustand, React state and context          | Hold the existing module's draft and interaction state                                     | A draft in memory or browser storage is not an accepted hospital record                               |
| Nx, Yarn and Webpack                      | Coordinate workspace tasks, install locked dependencies and bundle the browser application | App folders are not separate servers to install individually                                          |
| Jest and Testing Library                  | Run repeatable logic and simulated interaction checks                                      | A mocked response does not prove the native server saved anything                                     |
| OpenMRS and Bahmni modules                | Authorize and store clinical workflows through native APIs                                 | The full clinical server source and database are not included in this frontend repo                   |
| Odoo and the Qorlia Billing addon         | Authorize ERP, stock and accounting operations through native models                       | Clinical sign-in does not create an ERP session, and confirming an order is not a payment or delivery |

REST and FHIR are API contracts used by the clinical services, not separate copies of the patient database. JSON-RPC is the request format used for the ERP integration. Use the existing [clinical service](../packages/bahmni-services/src/appointmentService/appointmentService.ts) or [Billing service](../apps/home/src/components/Billing/billingService.ts) instead of inventing a new generic client. A cookie is a browser-managed session credential, not something to paste into an issue or share with a colleague.

### Know where a requirement can be implemented

The browser, proxy, native module and installation configuration can all affect one workflow. Owning this repository does not mean every backend capability can be implemented by editing a React file.

- **Presentation change:** use the relevant page and shared controls, then check accessibility and adjacent screens.
- **Installed form or workflow rule:** inspect the actual configuration and server behaviour. Record its version and owner; do not hardcode one hospital's rule into a generic component.
- **Clinical API change:** first establish whether an installed Bahmni/OpenMRS module already provides it. If a server change is needed outside this repository, identify that separate source/release dependency before estimating the UI work.
- **ERP change:** compare native Odoo behaviour and the existing addon contract. Browser code must not become an alternative stock or accounting ledger.
- **A new separate product or national-health integration:** agree its API, permissions, sessions, data handling, dependencies and acceptance before assigning implementation. A navigation tile is not an integration.

For example, booking an appointment must not be described as creating a visit, issuing an invoice or reserving medicines unless those separate effects are actually implemented and verified. A developer records this boundary in the task; a domain reviewer decides the intended hospital behaviour.

## 2. Know which direction a dependency runs

```text
shell -> app screen -> shared widget/control
                  -> service -> proxy -> native backend -> database

shared service -> types/helpers/HTTP client
shared control -> its existing house dependencies
```

An arrow means “uses”, not a required new folder. Do not make a generic shared library import a feature page to solve one local problem. Search existing callers before changing exported types or behaviour.

An import such as `@bahmni/services` is a workspace package, not a network call. An API path such as `/openmrs/ws/rest/v1/appointment/all` is a network request. Renaming a package to Qorlia will not redesign the UI and can break imports, licences and builds.

During development, [Webpack aliases](../distro/webpack.config.js) resolve the main package imports to source. Package exports and style entry points can still use generated library output. During packaging, dependencies, CSS, translations and assets must all be built/copied correctly. If TypeScript passes but the browser shows old styles, check the loaded bundle and package/style entry point before editing unrelated components. Never patch `dist` by hand.

## 3. Classify a requirement before writing code

| Request                          | Investigate first                                                            | Expected deliverable                                      |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Different colours/logo           | [Branding format](HOSPITAL_BRANDING.md), shared tokens and existing controls | Validated configuration or a focused shared design change |
| Programme field rejects a value  | Actual attribute/configuration, field renderer and native validation         | Evidence of the rule's source and a compatible correction |
| Appointment action is missing    | Native transitions, privileges, installation config, page/service            | Native comparison plus a scoped regression/fix            |
| Invoice or stock result is wrong | Native Odoo action, units/company/accounting and adapter contract            | Native/API evidence, not a browser-only calculation       |
| “Add AI” or “make it compliant”  | Exact user task, data, external dependencies, evaluation and domain review   | An agreed specification before an implementation estimate |
| New separate-product screen      | Existing product API, session, licence and accepted workflows                | Integration plan, not a cosmetic link declared complete   |

Example: “Accept `ABC200007` in Programme ID Number” is not enough to justify replacing every numeric pattern. Determine which programme attribute it is, whether it is a patient identifier or a separate programme identifier, where the pattern originates, which other programmes use the renderer, and what the server permits. Prove the source using the assigned installation. Do not guess a configuration file or change all fields to accept everything.

For every request, first complete [the task brief](task-brief-template.md). If a change requires a backend module not in this repository, identify that dependency and its owner. Do not fake the missing API with browser storage and call it integrated.

## 4. Debug the first broken boundary

Start with one reproducible action on an approved synthetic record. Record the branch/SHA and exact local host. Do not run a mutation repeatedly merely to collect screenshots.

1. **Is the intended application running?** Check `/bahmni-v2/`, the listening process, source branch and loaded asset. A legacy URL or an old running build can explain why an edit is not visible.
2. **Did the handler run?** Inspect the control, form validity, required fields and permissions. “Please match the requested format” can prevent a browser submit before any API exists to inspect. Find the input's actual rule.
3. **Was a request sent?** In Developer Tools, select Network and filter by Fetch/XHR. Record the method, sanitized path, status and response shape. Clear the filter if a download or navigation is the action under test.
4. **Did it reach the correct service?** Compare the same-origin path with the configured proxy target. Check the separate clinical/ERP sessions. Do not switch databases or remove gates to make a request pass.
5. **Did the backend accept it?** Inspect the response body and native outcome. JSON-RPC can return an error inside HTTP 200. An HTTP success alone does not prove an accepted operation.
6. **Does a fresh read show the intended result?** Reload the authoritative record. If the browser lost the response, use the operation's reviewed recovery mechanism rather than a fresh write.
7. **Does the interface display that result correctly?** Check query invalidation, filters, identity changes and current permissions. A stale query does not justify another payment, enrolment or stock action.

| Observation                              | Likely area to investigate, not a diagnosis                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| No request                               | Browser validation, disabled control, handler or privilege loading           |
| 401                                      | Expired/missing session, incorrect host, gateway access                      |
| 403                                      | Permissions, record/company scope or an access policy                        |
| 400/422 or structured rejection          | Payload/configuration validation or a stale reviewed request                 |
| 404                                      | Wrong route, missing backend module or incompatible service version          |
| 5xx                                      | Native exception or proxy/upstream failure; obtain sanitized server evidence |
| Pending, disconnected or timed out write | Unknown outcome; preserve the original request and check status              |
| Saved correctly, old rows displayed      | Cache/refetch/filter/mapping or wrong selected identity                      |

Status conventions vary by native API. Read its contract instead of hardcoding the table as application logic. Do not publish full HAR exports, “Copy as cURL”, cookies or private responses. Use [the API mapping template](api-integration-guide.md#api-mapping-template-for-an-issuepr) and send a small sanitized reproduction.

## 5. Understand the normal Git workday

Git saves source history. GitHub hosts that history and the review discussion. Your editor's Save does not commit or publish a file. A commit is local until pushed, a push does not merge a PR, and merging does not automatically prove deployment.

From the repository root, these checks do not change source:

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git diff --stat
git diff
```

In short status, `??` means untracked; ` M` means modified but not staged; `M ` means staged. Both columns can be set. Staging selects the exact change intended for the next commit, not everything in your working folder. `git diff` shows unstaged changes; `git diff --cached` shows staged changes.

Follow [the branch/commit instructions](../CONTRIBUTING.md#branch-and-commit-workflow), substituting your agreed task and file paths. Before changing your base, check that your own work is committed or otherwise safely preserved. Ask the maintainer how to integrate a changed base; do not run destructive resets or blindly resolve a conflict with “accept all”. A conflict is overlapping history, not permission to discard another contributor's work.

When the same shared file is needed by two tasks, agree a contract/owner first. One contributor can make the shared change; the other can consume it after review. Coordinate through the issue and PR, not by exchanging copies of `node_modules`, secret environment files or an entire working folder.

## 6. Make a UI change that still belongs to Qorlia

Read [the design system](QORLIA_DESIGN_SYSTEM.md), then find an adjacent screen with the same interaction. Use the existing exported control before adding HTML or a new dependency. Keep labels translatable where the module supports it.

Review these together: normal, loading, empty, invalid, denied, expired, pending save, rejected save and unknown save. Keep the patient/location context visible. Show status with text, not colour alone. Confirm keyboard operation, focus after opening/closing, zoom and narrow layouts. Do not hide clinical values or actions just to fit a screenshot.

Hospital branding changes a constrained presentation contract. It must not change medication meanings, units, identifiers, native privileges or accounting rules. See [design QA](design-qa.md). Mascot animation is not a replacement for a saved-record indicator or clinical alert.

## 7. Review one feature as a team

The developer demonstrates the workflow and explains the request chain. The reviewer inspects the diff, contracts and test evidence. The tester independently follows written steps without relying on the developer's current browser state. Clinical/accounting decisions go to the appropriate domain reviewer.

For a beginner's first task, a useful review asks:

- What problem was reproduced, and which layer caused it?
- Which files/callers changed? Why was a new helper or dependency necessary, if any?
- Which test failed before the fix and passed afterward?
- Which backend/configuration was actually tested? Was this mocked, real HTTP, native runtime or browser evidence?
- What happens on denial, expiry, double click and a lost response?
- Which guide or contract changed, and what remains unverified?

Ask a beginner to explain, not merely paste an AI-generated patch. If they cannot explain a sensitive write, pair on the trace before assigning it. Testers increase coverage; they do not replace development or domain expertise.

Use [daily updates](team-workflow.md#daily-update-with-evidence), [the PR template](../.github/pull_request_template.md) and task evidence. Set checkpoint dates only after the owner confirms access, dependencies and availability. This playbook does not assign people, send messages or create delivery promises.

## 8. Keep the handbook useful

When behaviour changes, update the relevant module guide, API contract and parity/readiness evidence in the same PR. Link new contributor pages from both the root README and docs index. Module READMEs should point back to the shared setup/testing guides rather than grow conflicting command copies.

Run from repository root:

```bash
node scripts/check-contributor-docs.mjs
git diff --check
```

The checker verifies the selected handbook/module links, headings and copy convention. It does not log in, check remote URLs, validate a hospital deployment or prove every historical upstream document is current. Report those checks separately. Credentials, customer data and private deployment/runbooks stay outside the public repository.

## 9. Run the first team architecture briefing

This is a suggested 45-minute learning session, not a feature-delivery estimate. Ashutosh or the designated maintainer leads it. Aniket, Gautam and other new contributors should each leave with their own next checkpoint. Screen sharing is useful; sharing an account or a private environment pack in a public recording is not.

### Before the session

Open the [current README](../README.md), [architecture](architecture.md), [module map](module-guide.md) and the assigned issue. Each contributor records their own GitHub account, approved base branch, starting SHA, tool versions and setup result. A missing backend account is a prerequisite to resolve, not a reason to disable authentication.

Keep two things distinct:

- **Reading the handbook:** GitHub's default README links to the development handbook. Keep that browser tab open when reading newer guides.
- **Changing the code:** clone and branch from the base named in the task. That older base may not contain these newer guides. Do not merge the Billing branch, copy its whole folder or replace your code base just to obtain documentation. If the exercise references a file absent from the assigned base, ask the reviewer to select an equivalent trace or approve a new base.

### Walk through the system together

| Time             | Open or demonstrate                                                                                                                                                                                                                                                                                         | Ask the contributor to explain                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0 to 10 minutes  | [Root routes](../distro/src/app/app.tsx), [module map](module-guide.md)                                                                                                                                                                                                                                     | Which app owns this URL? Why are Billing and programmes not separate top-level app folders?                |
| 10 to 20 minutes | [Appointment list](../apps/appointments/src/pages/AppointmentListPage.tsx), [service](../packages/bahmni-services/src/appointmentService/appointmentService.ts), [constants](../packages/bahmni-services/src/appointmentService/constants.ts), [HTTP client](../packages/bahmni-services/src/api/client.ts) | Which code renders the screen, which sends the request, and which server owns the saved record?            |
| 20 to 30 minutes | One approved synthetic read in Developer Tools, then [an existing test](../apps/appointments/src/pages/__tests__/CalendarActions.test.tsx)                                                                                                                                                                  | What did the real request prove? What does the mocked test prove instead?                                  |
| 30 to 40 minutes | [Change boundaries](architecture.md#choose-the-correct-change-boundary), [task template](task-brief-template.md)                                                                                                                                                                                            | Is the next issue configuration, presentation, service mapping or a native backend change? Who reviews it? |
| 40 to 45 minutes | Each person's setup/trace note and proposed next checkpoint                                                                                                                                                                                                                                                 | What can you independently demonstrate now, and what prerequisite or explanation is still missing?         |

If backend access is unavailable, trace the source and read the test, but explicitly leave the real-request checkpoint unverified. Do not improvise a server, credentials or successful result for the meeting.

### Check understanding without expecting memorization

Ask each person to answer in their own words, with the relevant source open:

1. Does editing a React field save a hospital record? Show where this workflow actually sends a request.
2. Where does this route enter the app, and which shared control/service does it reuse?
3. Which identity is required: patient display ID, clinical UUID, appointment UUID or ERP numeric ID?
4. Why can a visible button or a passing TypeScript check not grant server permission?
5. What happens if a save times out after the server commits? Where is this workflow's recovery contract?
6. Which source commit, backend/configuration and environment were actually tested?
7. Which files could affect another developer, and who owns that shared boundary?
8. What is the difference between ready for review, accepted and released?

If an answer is unclear, pair on that boundary before assigning a sensitive write. These questions identify the next learning exercise, not a numerical employee-performance score. A newcomer can contribute useful reproduction steps, tests and documentation while learning implementation.

### Leave with one concrete record per contributor

Use an issue comment or the agreed internal tracker, not another duplicate status spreadsheet:

```text
Contributor / GitHub account:
Task link / reviewer / independent tester:
Approved base / starting SHA:
Setup result and missing prerequisite:
Workflow traced:
Route -> page -> service -> endpoint -> native owner:
One test run, and what it does not prove:
Proposed next deliverable and files involved:
Checkpoint date agreed with owner:
Question needing a named decision owner:
```

Management can then allocate work from evidence rather than “tools installed”. Keep the first implementation small enough for the contributor to explain and the reviewer to inspect. Do not allocate concurrent changes to authentication, encounter recovery, the Billing gateway or stock-write contracts without an agreed shared owner. Use [team workflow](team-workflow.md) for ongoing coordination.
