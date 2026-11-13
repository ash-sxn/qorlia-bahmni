# Reading and changing Qorlia code: a beginner's guide

[README](../README.md) · [Orientation](developer-start-here.md) · [First contribution exercise](first-contribution.md) · [Documentation index](README.md)

Read this alongside your editor. It explains concepts using code already in this repository, not a new example application. You are not expected to memorize every folder. You should be able to explain the small workflow you change and show evidence that it still works.

## 1. Understand the hospital task before the code

Ask who is doing the work, what they need to accomplish and what the saved result should mean. A receptionist finding an appointment and a clinician signing a consultation have different permissions and consequences.

| Concept                  | Meaning for development                                    | Mistake to avoid                                                    |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Patient                  | A person with a clinical record and identifiers            | Using a displayed identifier where an internal UUID is required     |
| Visit                    | A period of care associated with a patient                 | Treating every appointment or encounter as the same visit           |
| Encounter                | A particular clinical interaction/documentation context    | Attaching a save to another provider's encounter                    |
| Appointment              | A scheduled service/time, with its own identity and status | Assuming booking automatically creates a visit or consultation      |
| Clinical order           | A request such as a test or medication                     | Assuming its presence proves an invoice or physical delivery exists |
| ERP sales order          | A commercial record in Odoo                                | Treating its numeric ID as an OpenMRS patient UUID                  |
| Invoice/payment          | Separate accounting records with native rules              | Treating a paid-looking label as proof of a posted payment          |
| Stock transfer/operation | Planned movement and its detailed preparation              | Treating reservation/preparation as completed delivery              |

These are orientation terms, not a substitute for a clinician/accountant's review. Use the native installation and assigned domain reviewer to resolve ambiguous behaviour.

## 2. Recognize the files you will see

| File or syntax                         | What it does here                                             |
| -------------------------------------- | ------------------------------------------------------------- |
| `.ts`                                  | TypeScript: services, helpers, types and configuration        |
| `.tsx`                                 | TypeScript with JSX markup for React screens/components       |
| `.module.scss`                         | Styles imported as a component's named classes                |
| `.json`                                | Structured data such as translations or installation settings |
| `.py` under `runtime/billing/`         | Native Odoo addon code, not browser code                      |
| `__tests__/*.test.tsx`                 | Tests beside a component or helper                            |
| `import` / `export`                    | How a file consumes or exposes code                           |
| `@bahmni/services` and similar imports | Shared workspace packages, not a request to a public website  |
| `package.json` / `yarn.lock`           | Declared tools/dependencies and locked resolutions            |

Keep `@bahmni/*` package names and existing licence headers. Rebranding the screen is not a reason to rename every internal package. Avoid editing generated `dist` files or `node_modules`.

## 3. Read a component in a useful order

Open [AppointmentListPage](../apps/appointments/src/pages/AppointmentListPage.tsx). Read these parts in order:

1. **Imports:** which shared controls, services and hooks it already reuses.
2. **Component function:** `AppointmentListPage` describes what React should render.
3. **Permissions:** `canView` and `canManage` determine available UI actions. They do not replace server authorization.
4. **Local state:** `useState` stores values such as selected date and patient search text. A setter asks React to render with a new value; it does not save a hospital record.
5. **Queries:** `useQuery` loads server data. `queryKey` identifies the cached result; `queryFn` performs the read; `enabled` controls whether that read should run.
6. **Derived values:** `filterAppointments` and sorting turn loaded records into displayed rows. Do not add a second copy of rows in state without a concrete need.
7. **Event handlers:** functions react to a click or form submit. A handler may only change local state or may call an API. Find which before changing it.
8. **Returned JSX:** the layout, labels, fields, table and conditional error/loading states the user sees.

`props` are inputs passed from a parent component. A hook is a React function that manages state or reusable behaviour. `useEffect` synchronizes with something outside rendering, for example moving keyboard focus after opening a form. Do not add effects merely to copy a computed value into more state.

`useRef` can keep a reference to an input or a value across renders. It does not trigger a render when changed. In this page it helps focus the check-in field. Follow an existing pattern rather than introducing a new state library.

## 4. Follow a read across the boundaries

The [first contribution exercise](first-contribution.md) traces this exact selected-day appointment read:

```text
Browser URL
  -> shell routes -> module routes -> AppointmentListPage
  -> getAppointmentsForDate -> shared HTTP client
  -> local/review proxy -> native clinical service -> clinical database
  -> response -> query cache -> filtered rows -> screen
```

The full OpenMRS server/database is not in this frontend repository. A service function here asks it to do work. Changing a displayed field does not change the backend's schema or configuration.

Use editor search or the following from the repository root:

```bash
rg -n 'getAppointmentsForDate' apps packages
rg -n 'dayAppointments|filterAppointments|canManage' apps/appointments/src/pages/AppointmentListPage.tsx
```

The first search finds consumers and tests too. Read them before changing the shared function. A shared function's callers are the places that can break when its input or output changes.

In browser Developer Tools, use **Network** to inspect method, path, query keys, status and response shape on approved synthetic data. Use **Console** for browser errors. A browser error is evidence to investigate, not permission to remove validation. Never publish cookies, full HAR files, authorization headers or private records.

For Billing, follow [billingService](../apps/home/src/components/Billing/billingService.ts) and the [native addon](../runtime/billing/README.md) instead. Its ERP session, gateway and native accounting database are separate from clinical services.

## 5. Understand asynchronous work and types

An API call finishes later. A `Promise` represents that pending result. `await` waits inside an asynchronous function; `try/catch` handles a rejection. While it runs, show an appropriate pending state and prevent duplicate actions where required.

TypeScript checks declared shapes during development. It does not inspect the real server response for you. A type assertion such as `as Appointment` tells the compiler what to assume; it is not runtime validation or proof that a payload is correct. Follow [API integration](api-integration-guide.md) for boundary checks.

Use these questions when reading a response:

- Is this a clinical UUID, display identifier, native numeric ID or relation?
- Are a date/time and quantity expressed in the native time zone and unit?
- Can the field legitimately be missing, `null` or `false`?
- Has the response been validated before displaying a successful result?
- Could the account, patient or selected record have changed while the request ran?

For a write, `useMutation` runs an action. Invalidating a query marks its cached data stale so it can be reloaded; it does not undo a save. A timeout may happen after a commit. Keep accepted, rejected and unknown outcomes distinct. Do not invent automatic retries or mark a timed-out payment/clinical save as failed without checking its contract.

## 6. Make one small, reviewable change

Follow [CONTRIBUTING](../CONTRIBUTING.md) for branch commands. Before editing, write expected and actual behaviour, the affected files/callers and one test that would catch the issue. Confirm your approved base branch with the task owner. The latest documentation branch is not automatically your implementation base.

For a label/validation problem, first check whether it comes from translation/configuration or frontend code. A programme attribute can be constrained by native configuration. Changing a generic input to accept anything may break every other programme. Fix the rule at its real source and check adjacent consumers.

For styling, use [Qorlia's design system](QORLIA_DESIGN_SYSTEM.md), [shared controls](../packages/bahmni-design-system/src/) and the surrounding module's SCSS patterns. Keep keyboard focus, text labels and loading/empty/error states. A differently coloured button is not a reason to add a UI dependency.

Before submitting:

1. Reproduce the issue and make the focused test fail for the correct reason.
2. Fix the smallest relevant code/configuration without changing the intended native behaviour.
3. Run the focused and adjacent tests, source/test-source types, lint, formatting and build as appropriate. See [testing commands](testing-guide.md).
4. Replay the approved synthetic workflow and reload its native result if a save changed.
5. Inspect `git diff` and the staged diff for accidental files or private data.
6. Open a PR with the issue, starting SHA, actual evidence and remaining limitations. Request review; do not deploy or self-approve a risky change.

If you cannot reproduce a defect, submit your trace and observations. Do not invent an implementation to make the update look larger.

## 7. Learn what a test actually proves

Read [CalendarActions.test.tsx](../apps/appointments/src/pages/__tests__/CalendarActions.test.tsx). It supplies synthetic appointment data, mocks hooks, renders the calendar, clicks controls and checks the requested mutation.

- **Arrange:** set up the role, configuration, records and mocked dependencies.
- **Act:** render the screen and perform the interaction.
- **Assert:** compare observed behaviour with the expected result using `expect`.

`jest.fn()` records calls rather than sending a real API request. `jest.mock()` substitutes a dependency for the test. A passing mocked test can prove an unavailable action stays hidden or a handler sends the expected arguments. It cannot prove the native backend accepted or stored the request. Browser/API/native acceptance is separate.

Do not weaken an assertion just to make it green. Explain the failing requirement, inspect the call chain, then fix the cause. A failed setup dependency is not automatically an application defect.

## 8. Common newcomer questions

**Do I need to install every hospital service?** No. Start with the frontend and an operator-approved synthetic environment pack. Backend work is separately scoped. Do not deploy the whole stack or request owner credentials as an onboarding step.

**Can I start from `main`?** Only if your task explicitly names it. Current redesign work has not all landed on `main`. Read the README's branch guidance and your issue, and record the starting SHA. Never merge another developer's unfinished branch merely because it looks newer.

**Can I work on the same module as someone else?** Agree non-overlapping files and an API contract first. One task needs one accountable owner. Put shared-file changes through the maintainer instead of overwriting each other's work.

**Can I add a new library or ask AI to rewrite the module?** Prefer existing components, services and dependencies. A broad rewrite needs an agreed reason and scope. Review and understand AI-generated changes yourself; do not send private data or secrets to a model.

**What if I am blocked?** Send the task link, branch/SHA, exact sanitized error, expected/actual result, checks attempted and the prerequisite you need. Do not repeatedly report “setup pending” without those details. Use the [team update template](team-workflow.md#daily-update-with-evidence).

**When is my task complete?** A PR is ready for review when its scoped change and evidence are present. Acceptance requires the designated review/tester checks. Release is a separate owner/operator decision. A screenshot, successful build or merged PR does not prove the entire hospital product is finished.
