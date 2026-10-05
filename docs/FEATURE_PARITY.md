# Bahmni workflow parity ledger

## 5 October session-duration boundary checkpoint

This closes invalid duration parsing and window-construction boundaries, not
the wider session-context/concurrency or clinical acceptance gates.

- The shared duration reader preserves Bahmni's documented policy: 60 minutes
  for an unset/invalid property and 30 minutes for a failed lookup. See the
  [official observation-form guide](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/5644877826/Edit%2BObservation%2BForms%2BIG).
  Missing successful responses are not confused with failed HTTP lookups.
  Booleans/arrays, non-finite values and values outside Date's representable
  range are invalid; positive numeric values and fractional minutes remain.
- Header and pad use one shared start-time boundary. Unusable explicit minute
  overrides reject before encounter searches rather than querying a future
  window or raising an unhandled Date conversion error. No new duration limit,
  setting, dependency or mirrored state was introduced.
- Eighteen new regressions failed before the correction. Three service suites
  now pass 165 tests and four clinical suites pass 105 tests with one snapshot
  in India and US Pacific time. Service/clinical type checks, changed-source
  lint and the service build pass. Existing duplicate-mock/CDSS test warnings
  remain; this is not a full application acceptance run or new clinical build.
- The actual-source native read-only verifier still passes and preserves full
  records. After reload the browser chart rendered with no captured console
  errors; its Qorlia link opened the branded home and React module routes.
  Invalid-property cases were tested at the transport boundary, not by changing
  the hospital's global property. No clinical write or production/shared-demo
  deployment occurred.

Remaining: hook refetch/context races, submitted-form failures, noncoded and
configured condition details, draft/permission transitions, concurrent writes,
the broader React workflows and separate-product redesign/acceptance.

## 5 October freshly validated saved-encounter handoff checkpoint

This closes the tested cached-ID eligibility and search-index-lag handoff paths,
not complete encounter-session or clinical workflow parity.

- The header no longer trusts a cached MATCHED object. Header and consultation
  pad pass only a saved-ID hint to the shared resolver, which re-reads the native
  FHIR encounter and verifies its ID, typed patient/visit/provider references,
  encounter type/tag, usable status and non-future last-update timestamp. A 404
  rejects the hint; other read failures propagate instead of starting a new
  encounter. An invalid hint cannot be revived by an older indexed copy.
- The normal session window, newest selection, location decision and episode
  membership restriction remain. Input arrays are not mutated. The pad reads
  the snapshot in its query callback without mirroring store state.
- Three service suites pass 131 tests and four clinical suites pass 105 tests
  and one snapshot in India and US Pacific time. Service/clinical type checks,
  changed-source lint and dependency-first builds pass, retaining existing
  duplicate-mock, effect-dependency, form-renderer eval and large-bundle warnings.
- The read-only native verifier loads the actual source services. It verifies
  expired saved-ID rejection and clock-controlled index-lag handoff, header/pad
  selection consistency, mismatched provider/type rejection, episode membership
  and read-failure propagation. Full native records are unchanged. The controlled
  clock case is not proof of a currently live browser encounter session.
- The browser pad displayed its error state with Done disabled during a targeted
  encounter-search fault. After blocking was removed, the same synthetic patient
  opened the normal configured editor, kept empty Done disabled and returned to
  the chart on Cancel. The recovery capture is complete and non-truncated: only
  GET requests, no failed response and no clinical write. Local browser routes
  return 200 with Accept: text/html; a generic curl request's 404 was not a server
  outage and no restart was required.

Remaining: duration-value boundaries, hook refetch/context races, submitted-form
failure states, noncoded/configured condition details, draft/permission
transitions, concurrent writes, wider React and separate-product acceptance.
No production/shared-demo deployment or staff privilege change occurred.

## 5 October paginated encounter selection and recovery checkpoint

This closes the tested search-page, newest-selection and lookup-failure paths,
not complete encounter-session or clinical workflow parity.

- The shared visit and encounter searches now read every next page, reject
  incomplete/cyclic results and exclude non-Encounter resources. Relative,
  absolute and history-versioned references are matched by their resource type.
  Encounter selection sorts a copy by start time rather than assuming response
  order. Actual read failures propagate instead of becoming NO_ACTIVE_ENCOUNTER.
- Four active-visit regressions failed before the correction. Real staging's
  HAPI next link targets the FHIR root with a search cursor, which the initial
  same-resource-path check rejected. Two cursor regressions failed before the
  compatible correction; another resource/root-without-cursor remains rejected.
  Absolute next links are requested through the local API, not their origin.
- A read-only verifier loads the actual source services and forces one-entry
  pages against isolated staging. Both encounter pages match native REST IDs;
  reversing their input still selects the newest encounter. The older fixture
  correctly reports SESSION_EXPIRED. Injected later-page failure propagates,
  and full native before/after records are unchanged. No save was replayed.
- The patient header disables the consultation action on lookup failure and
  offers an accessible, branded retry. Actual browser fault/recovery retained
  the same synthetic patient, showed Consultation unavailable, then restored
  Continue Consultation after Try again. The final complete, non-truncated
  capture has no clinical mutation, only the normal chart-view audit POST.
  An earlier capture was truncated and is not used for that assertion. Temporary
  request blocking was removed; the recovered page has no error overlay.
- Eight service suites pass 200 tests; five clinical suites pass 121 tests and
  one snapshot in India and US Pacific time. Service/clinical type checks and
  dependency-first builds pass; changed-source lint has zero errors/warnings.
  A parallel type check overlapped the service build's output replacement and
  could not resolve declarations; the sequential check passed without a source
  change. Existing duplicate-mock, form-renderer eval and large-bundle warnings
  remain. Shared controls/services are reused without a new dependency.

Remaining: snapshot patient/provider/type/age eligibility, session-duration
failure policy, submitted-form failure states, noncoded entry and configured
condition details, draft/permission transitions, concurrency, wider React and
separate-product acceptance. No production/shared-demo deployment, new clinical
record or existing staff privilege change occurred in this checkpoint.

## 5 October encounter-scoped diagnosis and submitted-form refresh checkpoint

This closes the tested consultation duplicate scope and missing-encounter refresh
paths, not full diagnosis, encounter-session or clinical workflow parity.

- Diagnosis duplicates now use the encounter that the consultation will save,
  rather than every earlier diagnosis for the patient. Saved and draft duplicates
  still block the same encounter; same-name drafts with different concept IDs are
  rejected. Missing, pending, failed or mismatched encounter context blocks input
  and submission instead of being interpreted as a known new encounter.
- The pinned FHIR server rejects the diagnosis encounter filter. The compatibility
  query retains the encounter-diagnosis category, reads all pages and filters by
  the typed encounter reference locally. A generic patient-only Condition search
  returned zero diagnoses for a fixture with two, so it is not used for this
  scoped fallback. Incomplete/cyclic pagination and actual read errors fail closed.
- Actual isolated React saving recorded the same confirmed coded diagnosis in a
  later encounter while retaining the earlier record. Reopening the current
  encounter rejected its duplicate, kept Done disabled and issued no clinical
  write in a complete, non-truncated network capture. Independent native reads
  retain exactly two diagnoses associated with the two distinct encounters.
- The submitted-form event callback now refetches only with a matching patient
  and valid matched encounter. The shared observation reader also rejects a
  missing/blank identifier before HTTP. Disabled-state regressions failed before
  the correction; the new-to-matched transition still automatically loads forms.
  One actual new-consultation save returned 201, and reopening queried the new
  encounter's observations with 200, without any `encounter=undefined` request.
  Full reload and independent native reads retain exactly one encounter and one
  confirmed diagnosis for that second synthetic fixture. No successful save was
  replayed, and no new console errors were captured after reload.
- Four service suites pass 100 tests and six clinical suites pass 289 tests and
  seven snapshots in India and US Pacific time. Service/widget/clinical type
  checks and dependency-first builds pass. Changed-source lint has zero errors
  and the existing consultation effect-dependency warning. Existing duplicate
  mocks, form-renderer eval, import and large-bundle warnings remain. The fixes
  reuse current queries, events, controls and services without a new dependency
  or mirrored state. No production/shared-demo deployment or staff-role change.

Remaining: encounter pagination/selection and reference variants, submitted-form
failure states, noncoded entry, condition details, permission/draft transitions,
concurrent writes and all wider React and separate-product release gates.

## 5 October confirmed diagnosis-to-condition checkpoint

This closes confirmed-only condition conversion and diagnosis retention in the
tested consultation, not complete diagnosis/condition workflow parity.

- The pinned legacy diagnosis controller adds a condition from a confirmed
  diagnosis without removing that diagnosis. The shared React store now follows
  both rules; the visible action and parent handler also reject unset, provisional
  or unsupported certainty. Existing permissions, history and duplicate-condition
  guards remain. Direct condition entry remains independent.
- Eleven added regressions cover rejected conversion and retained diagnosis
  state. Six focused suites pass 352 tests and nine snapshots in India and US
  Pacific time. Reviewed snapshot changes contain generated control IDs and the
  intended disabled action for unset certainty. Clinical type checking,
  changed-source lint and build pass, retaining upstream eval/bundle warnings.
- Actual isolated React testing disabled conversion for unset and provisional
  certainty, enabled it for confirmed certainty, and retained both drafts.
  Missing duration/unit produced field errors with no transaction request;
  independent native reads found zero clinical entries. One valid Done returned
  201 and full reload retained the confirmed type-2 diabetes diagnosis and its
  active matching condition with a two-day duration. Exact native REST/FHIR reads
  confirm distinct resource IDs, the same concept, correct patient/visit links and
  exactly one shared encounter. Repeat verification is read-only, not save replay.
- The change reuses the existing store and controls, with no new dependency or
  mirrored certainty state. No production/shared-demo deployment or existing
  staff privilege change occurred. Only isolated synthetic records were written.

Remaining: condition onset/status/notes, noncoded entry, current-encounter
diagnosis duplicate rules, retained drafts across permission changes, full
role/configuration variants, concurrent writes and all wider release gates.

## 5 October saved-diagnosis edit/removal checkpoint

This closes certainty/order editing and reasoned native voiding for the tested
saved diagnosis, not complete diagnosis/condition workflow parity.

- The chart now loads the selected native `patientdiagnoses` record before
  editing certainty or primary/secondary rank. FHIR does not retain the full
  writable native shape. The service re-reads immediately before submission and
  preserves patient, encounter, coded/noncoded values, condition link and form
  references. Missing, mismatched, removed or observed-stale records block writes.
  Ambiguous acknowledgements never trigger automatic replay. Native conditional
  writes are not verified, so a competing write after the re-read remains a gate.
- Removal uses native DELETE with a required bounded reason, without purge or
  encounter deletion. Isolated native permission checks establish Edit Diagnoses
  for update and void; Add-only, Delete-only and read-only roles were denied.
  The frontend requires that native permission plus each configured action's
  own restriction. An Edit-only configuration cannot expose Remove. Explicit
  empty/unknown action configurations add no actions. Permission loss disables
  an open confirmation; switching patients discards it permanently.
- The diagnosis reader now displays the official non-coded-condition FHIR
  extension when `code` is absent, and coding display when text is absent. This
  is display support for saved noncoded records, not new noncoded entry parity.
  Confirmed tags use sage/ink instead of error red. The table uses a named,
  keyboard-focusable viewport and automatic columns rather than compressed cells.
- Actual React editing returned 200 and full reload retained confirmed certainty
  and secondary rank. One reasoned removal returned 204; independent exact-ID
  native reads retain the original creation date, form fields, void reason,
  earlier coded history and the original active encounter. FHIR contains zero
  active diagnoses for that fixture. Repeat verification is read-only and does
  not replay successful saves. A separate existing coded fixture loaded confirmed
  primary values; unchanged Save was disabled and Cancel restored the launcher
  without a write. Desktop table width matched its 1136px viewport without page
  overflow. Other responsive layouts remain release gates.
- The asynchronous loading/editor transition passes the original launcher through
  the existing shared Carbon confirmation, preserving initial Cancel focus and
  focus restoration. Regression tests cover per-action restrictions, revoked
  removal permission and patient-switch round trips, alongside native request
  shape, stale records, cancellation and ambiguous failures. Focused suites pass
  70 service and 106 widget checks in India and US Pacific time. Type checking,
  changed-source lint and dependency-first builds pass, retaining the existing
  lifecycle-ref warning, duplicate mocks and upstream import/eval/bundle warnings.

Remaining: noncoded entry, configured notes/status, retained consultation drafts
across permission changes, full role/configuration variants, concurrency and the
other React/separate-product gates. No production/shared-demo deployment or
existing staff privilege change occurred. Only isolated synthetic records were
used for native writes.

## 5 October native chart and landing read-permission checkpoint

This closes the tested unrelated chart authorization/error panels for the
condition-only role, not every clinical role or complete workflow parity.

- Built-in widget registration now declares the verified native read prerequisites
  for allergies, FHIR appointments, diagnoses, orders/medications and immunizations.
  The existing shared filter requires those prerequisites in addition to the
  hospital's configured OR restriction. Empty configured restrictions cannot waive
  native reads; custom registry overrides use their own declared requirements.
  Unauthorized controls and now-empty navigation sections are removed together.
- Read-only checks against isolated staging returned 403 explicitly requiring
  Get Allergies, Get Appointments, Get Diagnoses, Get Orders or Get Immunizations
  for the matching FHIR resources, and 200 for the seed account. Observation reads
  returned 200 even without Get Observations in the restricted role, so no invented
  observation gate was added. Explicit hospital observation restrictions remain.
  Backend authorization remains authoritative; staff privileges were not expanded.
- The landing page's legacy appointment search requires View Appointments or
  Manage Appointments, not the FHIR widget's Get Appointments. Its existing query
  is disabled without that native permission and cached appointment names/counts
  disappear immediately on permission loss. Patient search remains available.
  Four new landing regressions failed before the correction and all seven landing
  checks pass afterward. Actual read failures remain errors, not an empty schedule.
- A full restricted-role browser reload retained the saved active Essential
  hypertension condition and two-day onset, with no unauthorized widget requests
  or failed reads in the non-truncated capture. A separate full landing reload
  issued no appointment search, rendered no appointment panel/summary, and searched
  QST910015 successfully into the same chart. No clinical entries were written.
  The temporary test user/provider were retired with native read-back and the
  ordinary seed session was restored for local review.
- Four focused clinical suites pass 93 tests and one unchanged snapshot in India
  and US Pacific time. The registry suite passes 36 tests. Clinical/widget type
  checking, changed-source lint and dependency-first library builds pass. Existing
  duplicate-mock, dynamic/static import, form-renderer eval and bundle warnings
  remain. The change reuses registry metadata, query enabled and render-derived
  permissions, without mirrored permission state, effects or a new dependency.

Remaining: retained drafts across permission changes, diagnosis editing/removal,
condition onset/status/notes/noncoded workflows, concurrency and the other React
and separate-product release gates. No production/shared-demo deployment occurred.

## 5 October condition-only input and restricted-browser checkpoint

This closes direct coded-condition creation for the tested condition-only role,
not all condition editing, role changes or clinical workflow parity.

- The shared conditions/diagnoses input now allows Edit Conditions independently
  of Add/Edit Diagnoses. A condition-only user searches and adds a condition
  directly, without creating a diagnosis draft or querying diagnosis history.
  Diagnosis-capable users retain the existing diagnosis/conversion flow.
- Existing condition history is still required before adding. Failed or missing
  history blocks entry; saved and draft coding duplicates are disabled. The store
  validates concepts and preserves unrelated drafts. English/Spanish labels
  distinguish condition search from diagnosis search. Explicit hospital input-
  control privilege configuration remains authoritative.
- An isolated temporary account had Edit Conditions and encounter writes, but no
  Get/Add/Edit Diagnoses. Native condition reads succeeded and diagnosis reads
  returned 403. Only isolated staging's input-control configuration temporarily
  included Edit Conditions; its exact previous file was restored after testing.
  Existing seed/staff roles and public/shared-demo settings were not changed.
- Actual React Done with missing duration/unit preserved the draft. Independent
  reads found zero clinical entries. A subsequent valid save created one active
  Essential hypertension condition with a two-day onset duration, zero diagnoses,
  and exactly one encounter with the correct patient, visit and provider. Full
  reload rendered the condition. Reopening search disabled the existing coded
  condition; Cancel and independent read-back retained the same record counts.
  The temporary account/provider were retired, not existing staff accounts.
- Seven focused suites pass 383 tests and nine snapshots in India and US Pacific
  time, with clinical type checking, changed-source lint and build. The native
  serializer/permission check also passes with four temporary accounts retired.
  These are focused checks, not a full application acceptance run. Existing
  upstream eval and large-bundle warnings remain. The implementation reuses the
  existing store, queries, Carbon controls and serializer without a new dependency
  or mirrored permission state.

Remaining: limited-role chart widgets still render unrelated authorization/error
states; retained drafts across permission changes, diagnosis editing/removal,
condition onset/status/notes/noncoded workflows and concurrency need further work.
Separate-product reskins and broader release gates remain open. No production or
shared-demo deployment occurred.

## 5 October diagnosis and condition input-boundary checkpoint

This closes the tested certainty/duration serialization gaps, not all diagnosis
editing, condition-only roles or clinical parity.

- Condition duration uses exact numeric parsing and safe-integer validation,
  rather than truncating fractional input. The form retains its existing 1 to 99
  range and now exposes native minimum, maximum and step attributes. Store
  validation also rejects invalid retained duration/unit and certainty values.
- Diagnosis serialization rejects unsupported certainty codes instead of silently
  assigning provisional, missing concept identifiers and invalid consultation
  dates. Condition serialization rejects negative, fractional, non-finite or
  unsafe durations, unsupported units and unrepresentable onset dates before
  resource construction. The existing shared serializer's zero-duration case
  remains supported; the form's positive-duration policy is not imposed on every
  native caller. Existing date helpers and translation keys are reused.
- An actual rebuilt browser draft rejected a fractional duration without creating
  a truncated value, accepted an integer, and retained that integer after an
  invalid fractional edit. Missing duration/unit blocked Done with field errors.
  Cancel discarded the temporary draft. Independent native verification retained
  the fixture's original one encounter, one confirmed diagnosis and one active
  condition. No valid consultation save was replayed.
- Seven focused suites pass 379 tests and nine snapshots in India and US Pacific
  time. Two reviewed snapshots changed only for the native numeric attributes.
  The Pacific run exposed an existing UTC-hour assumption in the calendar-month
  test; it now uses explicit local input/expected dates, preserving the existing
  local-calendar subtraction across offset changes. Application date behavior
  was not changed to satisfy the test.
- Clinical type checking, changed-source lint and build pass. The isolated native
  serializer/permission integration check passes without replaying successful
  creations; denied transactions remain unchanged and temporary accounts are
  retired. No new dependency, mirrored validation state or additional data fetch
  was added. Existing upstream eval and bundle-size warnings remain.

Remaining: condition-only roles, diagnosis edit/removal, concurrent saves and
the other clinical and separate-product release gates. No production/shared-demo
deployment or release acceptance occurred.

## 5 October diagnosis/condition creation and exact permission checkpoint

This supersedes the tested creation/seed-permission gaps below, not complete
diagnosis editing, all roles or the whole clinical module.

- Native isolated checks using the actual frontend serializers establish that
  the pinned diagnosis DAO accepts Add Diagnoses or Edit Diagnoses, while the
  condition DAO requires Edit Conditions. Add-only and edit-only diagnosis
  creation and condition creation retained the expected coding, certainty and
  patient/visit links. Denied diagnosis/condition transactions left no new
  encounter or changed records. Three temporary test accounts were retired;
  existing seed/staff permissions were not expanded.
- The component now follows that diagnosis OR gate and separately gates condition
  conversion on Edit Conditions, available history and duplicate checks. The
  submission handler repeats the conversion guard. Edit-only visibility,
  add-only conversion denial and revoked-condition-permission regressions failed
  before correction. The configured input-control privilege gate remains intact:
  a hospital's explicit Add Diagnoses restriction is not silently overridden.
- Only isolated staging's diagnosis input-control configuration was changed from
  Add Diagnoses to Add Diagnoses or Edit Diagnoses after a recoverable configuration
  backup. The ordinary seed already has the latter native permission. Its empty
  synthetic visit fixture was corrected to the configured parent visit location.
  No public config, existing user role or shared-demo setting changed.
- Actual React missing-certainty and missing-duration submissions retained the
  drafts; independent native reads found zero encounters/diagnoses/conditions.
  One subsequent valid browser save created a confirmed type-2 diabetes diagnosis
  and active hypertension condition with a two-day duration. Full reload rendered
  both. Exact FHIR resources, native REST condition and encounter reads retain the
  expected concept UUIDs, certainty, onset, patient/visit links and exactly one
  encounter shared by both records. Successful writes were not replayed for an
  observation delay or verifier-shape correction.
- Six focused clinical/configuration suites pass 232 tests and nine snapshots in
  India and US Pacific time. Clinical type checking and changed-source lint pass.
  The native isolated integration check passes again without replaying saved
  creations. Dependency builds retain the upstream form-renderer eval and existing
  import/large-bundle warnings; this is not a full application test run.

Remaining: condition-only roles without diagnosis access, diagnosis edit/removal,
duration/serializer boundary hardening, concurrent saves and other clinical and
separate-product workflows. No public deployment or release acceptance occurred.

## 5 October clinical patient-transition and confirmation checkpoint

This closes the tested placeholder-data and open-confirmation eligibility gaps,
not complete condition/diagnosis or clinical parity.

- Conditions, diagnoses and program summary queries retain prior pagination data
  only when its query belongs to the current patient. Pending requests for a new
  patient show loading rather than the previous patient's records. All three
  populated regressions failed before the fix. Existing pagination checks pass.
- Condition confirmation captures the selected patient's identity and derives
  eligibility from current permissions, disabled state, active condition and
  native resource ID. Both the native modal button and submission handler reject
  an ineligible selection. Permission-loss, disabled-action and changed-patient
  regressions failed before the fix; no write, save event or audit is emitted in
  those tests. This is client-side eligibility proof, not a replacement for
  backend authorization or proof against concurrent record edits.
- English/Spanish confirmation copy identifies the selected condition and gives
  an unavailable-action message when eligibility changes. Actual browser dialogs
  named each of two isolated synthetic conditions, initially focused No, and
  returned focus after No/Escape. Full reload and independent exact-ID native
  reads retained two active conditions with the original single encounter. No
  condition inactivation was submitted in these checks.
- The condition table replaces compressed equal-width cells with automatic column
  sizing and a 40rem minimum table width inside a named keyboard-focusable viewport.
  Carbon's inner scroll wrapper is overridden only here so the focusable region
  owns scrolling. The region accessibility regression failed before the fix.
  Browser inspection retained a 640px table inside a 425px viewport without page
  overflow; ArrowRight moved the focused region by 40px. At 1440px desktop width,
  its 1136px region had no horizontal overflow. This is the populated condition
  table check, not complete responsive acceptance for every widget.
- Eight focused widget suites passed 166 tests and one snapshot in Asia/Kolkata
  and America/Los_Angeles. Widget type checking, changed-source lint and library
  build pass. Four existing lint warnings, duplicate manual mocks, React act
  warnings and import/bundle warnings remain. The React review used derived
  eligibility and existing query/Carbon APIs, without a new dependency or mirrored
  eligibility effect. Other table layouts, complete clinical saves and
  the separate-product reskins remain open. No shared-demo or production deployment
  occurred.

## 5 October React condition inactivation and ordinary-confirmation focus

This adds populated browser proof for condition inactivation, not diagnosis
entry, condition creation or complete clinical/accessibility parity.

- On a separate isolated synthetic fixture, No and Escape preserved both active conditions and the original single encounter. The React dashboard then inactivated one condition; independent native REST/FHIR reads confirmed inactive status and one new encounter with the correct patient/visit links. The second browser inactivation reused that encounter. Exactly two encounters remain, both conditions reference the new encounter, and a full reload displays both under Inactive Conditions. Successful writes were not replayed for observation delays.
- The first browser confirmation exposed primary Yes focus. Carbon's existing Cancel default only applies to danger styling; previous shared focus tests covered only that variant. The shared confirmation component now uses Carbon's supported initial-focus selector to choose the secondary action for ordinary and danger dialogs alike, without changing colors or adding focus hooks. The expanded real-Carbon regression failed in eight ordinary-dialog cases before the fix and passes all 48 dismissal/reopening combinations afterward (button/link, conditional/persistent, StrictMode, danger/ordinary). Browser No focus and Escape focus restoration passed.
- Four focused widget/condition suites passed 95 tests in Asia/Kolkata. The 48 real-modal cases also passed in America/Los_Angeles. Widget type checking and build passed; lint has no errors and retains the existing lifecycle-ref warning. Duplicate manual-mock, React act and dynamic/static-import/large-bundle warnings remain. The React review retained native component behavior and added no dependency, request, effect or mirrored state.
- The narrow browser screenshot retains both inactive names/statuses but splits long condition words. That typography is not accepted as final responsive design. Broader layout, patient-specific confirmation copy, concurrency and permission-loss-during-dialog checks remain, alongside the create/diagnosis and other workflow gates.

Only local source and isolated synthetic records changed. No existing staff
permissions, production/shared-demo deployment or public service exposure changed.

## 5 October native condition transaction and permission checkpoint

This supersedes the native condition-inactivation persistence/rollback gap in
the candidate below, not populated browser lifecycle, diagnosis saves or all
clinical permissions.

- The private verifier imports the actual condition/encounter/bundle source services and replaces only browser transport/location context with real isolated HTTP and the synthetic login location. A new-encounter inactivation sent one POST Encounter plus PUT Condition transaction. A second condition reused that encounter in one PUT/PUT transaction. Independent FHIR and native REST reads retained inactive status, the same saved encounter, patient and visit associations. A rejected nonexistent-condition update rolled back its new encounter and preserved both native condition records.
- The initial verification incorrectly used the native REST condition collection, which defaults to active records. Both inactivations had already succeeded. Reading their exact saved IDs corrected the verifier without replaying successful writes. The repeat check resumes saved results and passed one native integration test, including the deliberately rejected transaction.
- A synthetic limited role contains encounter write privileges and the native read prerequisites, but neither Add Conditions nor Edit Conditions. Initial denials for Get Concept Sources, Get Users and Get Encounter Roles were prerequisite failures, not condition-write authorization proof. With those legitimate read prerequisites present, direct PUT returned 403 for Edit Conditions; EncounterBundle returned 400 identifying the Condition entry and the same missing privilege. Anonymous PUT returned 401. Independent native reads retained both complete condition records and exactly the original two encounters, proving rollback for this denied update path.
- All temporary permission-check accounts were retired with native read-back; audit history and the explicitly synthetic test roles remain. No existing user/role, shared demo, production service, public route or backend clinical metadata was changed. These fixture roles are not a proposed production staff role. The seed's absent Add Conditions/Add Diagnoses privileges were not aliased or expanded.

Remaining: populated React condition lifecycle and acknowledgement/error checks,
native condition-create/diagnosis privilege semantics, diagnosis create/edit,
other roles and concurrency. Service/API proof is not browser acceptance or a
claim that the whole clinical module is finished.

## 5 October atomic condition-inactivation candidate

The new-encounter path now sends POST Encounter and PUT Condition in one
EncounterBundle, using a bundle-local encounter reference instead of creating
an encounter in a separate request. The matched path retains its existing
PUT/PUT transaction. Saved encounter identity comes from the returned resource,
not a response-location header or an additional write. Unsaved conditions are
rejected before submission; incomplete acknowledgements do not trigger retries.

The contract was traced against the official additional FHIR extension's
[1.0.0 transaction service](https://github.com/Bahmni/bahmni-module-fhir2-addl-extension/blob/1.0.0/api/src/main/java/org/bahmni/module/fhir2addlextension/api/service/impl/EncounterBundleServiceImpl.java)
and Condition reference resolution in its entries helper. Service/bundle checks
passed 46 tests in Asia/Kolkata and America/Los_Angeles, including missing/wrong
saved resources, failure without standalone writes, context resolution and
matched-encounter reuse. Source/test lint, service TypeScript checking and the
service library build passed. The sibling condition-table suites passed 36 tests,
and the clinical library build passed. Existing duplicate-mock, React act and
upstream form-renderer eval/large-bundle warnings remain.

These are automated service checks, not populated native condition lifecycle or
browser save proof. Matching condition permissions, native persisted encounter
references and rejected-condition rollback still require isolated verification.
No privileges, backend metadata, clinical records or public deployment changed.

The earlier status report's local-home 404 was a non-HTML probe, not a broken
review route. HTML Accept requests return 200 for both login and home; all three
development proxy/routing checks pass. Actual signed-in browser navigation loaded
React home and its module links. No restart or routing change was needed.

## 5 October diagnosis-history failure checkpoint

This improves the existing diagnosis editor's failure behavior, not diagnosis
save parity or the isolated seed account's permissions.

- Conditions and diagnosis history failures now produce an unavailable search result before an empty-match result. Both histories must be available before selection; disabled results and lost add permission cannot add a draft.
- A retained diagnosis no longer crashes while condition history is undefined. Conversion to a condition is disabled while its history loads or fails, without falsely labelling the diagnosis as already added. Certainty editing and draft removal remain available. Conversion becomes available when valid history returns.
- The existing regression suites passed 71 tests and nine unchanged snapshots in Asia/Kolkata and America/Los_Angeles. Source/test lint, clinical TypeScript checking, the clinical library build and diff checks passed. Existing upstream form-renderer eval and large-bundle warnings remain.
- The React review retained derived eligibility rather than adding mirrored state/effects, new requests or dependencies. No backend privilege, existing user, clinical record or production deployment changed. Populated browser diagnosis create and condition lifecycle testing remain open.

## 5 October wide report layout checkpoint

This supersedes the wide Visit Report header/row-spacing gap below, not all
report layouts, definitions, Unicode fonts or complete Reports parity.

- The native converter derives title/value styles per column, including columns with explicit native styles. HTML/PDF use padded cells and a 9-point font for tables over twelve columns. Automatic static-title text columns are sized from heading-word metrics; explicit widths/character counts, dynamic expressions, patterns, alignment and value formatters remain unchanged. Native shared templates are not mutated. CSV is byte-identical to the native baseline; supplied XLS template sheets are retained.
- Printable detail/header bands default to PREVENT only when neither the report nor its template specifies a split policy. A first multi-page rendering exposed a row split that the original one-page assertions missed. A failing regression now requires all 65 full identifiers and birthdates across pages. The final three-page fixture was visually inspected on every page: intact rows, repeated headings/credit and correct page numbers, without clipping or overlap.
- Fresh native checks passed 46 controller assertions, 49 upload assertions and all six converter formats. Explicit report/template pagination and configured column styles/widths are covered. The checks compile into a disposable directory, not the running WAR.
- The existing React HTML Run now request completed in a late-arriving tab. Its native generation timestamp is 03:01:35 IST, with the expected Last 7 days range, synthetic visit and updated 9-pixel spans/3-pixel cell padding. Earlier observation had not yet seen that tab; no duplicate request or navigation rewrite was needed. HTML remains a fixed printable report, not a responsive application table.
- One queued PDF completed at 03:02:18 IST and downloaded through React. Independent storage and download SHA-256 match (`8ac22f32152b2596d09392141742786b81cefa16d48cc28a94f66bc41107e84e`); Poppler rendering retained complete heading words, synthetic values, date range and page number. Independent SQL confirms nine Completed rows and sixteen RUN_REPORT audit attempts, retaining the previous eight reports. No report was deleted and no clinical records changed.
- The layout candidate was applied only to private staging Reports after a recoverable Reports-only snapshot. No frontend source, public/shared-demo deployment, clinical service recreation, privilege change or published port was added.

Remaining: other definitions/crosstabs, paper sizes, long body values and Unicode
font embedding, real VBA/configured templates, confirmed React deletion,
concurrency/failure/restart recovery and legacy mutating GET/CSRF. The broader
React and separate-product scope remains open.

## 5 October native report design checkpoint

This adds native output branding, not completed report layout acceptance or all
report-definition parity. Earlier stored outputs remain unchanged.

- The existing AGPL converter derives per-report styles through DynamicReports' public API without copying or mutating the upstream LGPL-covered `Templates` class. Generated headers use the Qorlia primary and white text, alternating rows use sage, and HTML/PDF retain native titles/dates/page numbering with a readable product and Built on Bahmni header. Data queries, calculations, locale/currency and XLS template generation remain native.
- An optional operator-mounted copy of the frontend `branding.json` supplies name and primary only. The converter reads it once, validates string types, a non-empty 60-character name, control characters, six-digit hex and 4.5:1 white contrast. Missing, malformed or oversized files fall back atomically to Qorlia. No logo/network/asset fetching or arbitrary CSS is supported in Reports yet; the available SansSerif font is retained instead of claiming that web fonts are installed.
- Native checks passed again: 46 controller assertions, 49 upload assertions and all six formats. Two-row checks verify green headers and alternating sage/white rows, native spreadsheet visit value/type, byte-identical native CSV, retained hospital XLS sheet styling/formula/name/original bytes/OLE marker, alternate hospital tokens, invalid/missing fallback and literal HTML escaping. Bahmni starts its even-row highlight with the first data row; the initial test incorrectly assumed the second and was corrected after inspecting both actual colors. No runtime row behavior was changed to satisfy that assumption.
- After a recoverable Reports-only snapshot, only private staging Reports restarted. Startup native checks passed and the service retained no published ports. Actual React Run now produced a branded populated HTML Visit Report using the Last 7 days preset. Browser DOM confirmed primary `rgb(31,82,56)`, white heading text and sage data-row background, with the synthetic patient/visit and native date range retained. An initial automation date fill did not commit into React state and ran Today only; that observed request was not replayed blindly.
- One React PDF queue request completed and downloaded. Its SHA-256 matched native stored bytes (`24505f9458fe472698bc94b8080af852ea9e2594ae34dd4320ef8b54ef23b47e`). Poppler extraction/rendering retained the brand credit, synthetic visit, dates and page numbering. The wide native table still splits several header words and has tight body-cell spacing, so PDF typography/column layout is not accepted as finished. HTML is also still a fixed report page, not a responsive application table.
- Independent SQL retained the previous seven reports plus the new Completed PDF, with fourteen RUN_REPORT audits (two direct HTML requests and one queued PDF beyond the previous eleven). No report was deleted, no clinical records changed and no public/shared-demo deployment occurred. Shell syntax and repository diff checks passed; no React source changed in this checkpoint.

Next: refine actual wide-table PDF/HTML layout, additional definitions/crosstabs,
Unicode/font embedding and hospital-specific output assets. Confirmed React deletion,
real VBA/configured templates, concurrency/failure/restart recovery and the broader
React/separate-product scope remain open.

## 5 October compatible exporter and browser Custom Excel checkpoint

This supersedes the custom XLS generation and queued download MIME gaps below,
not complete Reports parity, real VBA preservation or output design acceptance.

- Private staging now uses checksum-pinned DynamicReports 6.12.1, JasperReports 6.21.5 and POI 5.4.1 with their matching dependency set. The public manifest contains 30 exact Maven Central paths and SHA-256 values, not JAR binaries. Operator-side downloads are validated before installation; startup does not fetch dependencies. Original libraries are retained in a recoverable directory. This is a Java 11 compatibility candidate, not a completed production dependency/security audit.
- The native converter keeps its existing workbook-template generation. Its custom XLS response now uses the real XLS MIME type. The queue remains explicitly JSON, and downloads carry their native content type through Spring's Resource response rather than allowing XML content negotiation. All six existing queued formats returned their correct MIME type and bytes, including valid 206 byte-range responses. Independent hashes matched native stored files. Anonymous, invalid-session, missing-ID and foreign-owner denial checks passed without submitting reports.
- Actual direct custom generation and scheduled custom generation retained the synthetic template sheet, formula and populated Visit Report data. Native converter checks also retained a named range, original input bytes and a non-executable OLE marker. That marker is not a real VBA project and does not establish macro compatibility. Ordinary HTML, CSV, PDF, XLSX and ODS converter checks passed with populated synthetic data.
- The React browser uploaded the synthetic XLS template and submitted one Custom Excel queue request. The completed row was downloaded from My Reports; its bytes matched the independent native storage SHA-256. Read-only POI inspection retained Sheet1's label/formula and the Report sheet's title, patient identifier and synthetic visit. Independent SQL showed the five original reports plus one API custom report and one browser custom report, with eleven RUN_REPORT audit events. No successful request was replayed after observation delays.
- Native checks passed again: 46 controller assertions, 49 upload assertions and all six converter formats. Only private Reports restarted after its rollback backup; clinical services were not recreated, and no public/shared-demo deployment or port was added.
- The existing confirmation modal now identifies the selected report's request time, format and stored filename. A regression distinguishes same-named reports. Browser checks retained initial focus on Cancel, returned focus to the opening Delete button and kept the dialog readable at narrow and desktop sizes. Cancel preserved all seven rows and eleven audit events; confirmed React deletion remains pending.
- The full Reports suite passed 56 tests in Asia/Kolkata and America/Los_Angeles, including explicit control-character upload/acknowledgement rejection. Translation/client checks passed 49 tests. An absent optional hospital translation override now uses bundled labels without logging an error; missing required files and HTTP 401/403/500 still log, and the API client's authentication behavior is unchanged. The actual Reports browser reload retained translated labels and all seven rows without captured console errors. Source lint, service/Reports type checks and dependency-first library builds passed; existing duplicate-mock and large-bundle warnings remain.

Remaining: React confirmed deletion, configured templates and real macro workbooks,
other report definitions, failure/concurrent/restart recovery, output branding and
layout, limited-role variants and the legacy mutating GET/CSRF review. The broader
React and separate-product scope remains open.

## 5 October native permission lifecycle and XLS upload checkpoint

This supersedes the missing native per-report restricted-definition and real
deletion proofs below, not React browser deletion, custom XLS generation or
complete Reports parity.

- A Reports-only synthetic user generated one named synthetic CSV. A temporary catalogue change required a privilege it did not possess: its queue hid that row and direct generation, scheduling, known-ID download and deletion returned 403. An invalid catalogue type made all five paths return 503. After restoring the valid definition/privilege, the same row and identical file bytes remained. Deletion returned 200; queue/read/repeated deletion then confirmed absence. All 27 native HTTP checks passed.
- Independent SQL and file checks confirmed deletion of the one synthetic report, retention of the five original reports and ten RUN_REPORT audit events, and retirement of the test account. The report catalogue was restored to its original SHA-256 `a8269122ac1e4fb3b1f9f705430d61c42843ff217728f80269d6f158d7dac0ff`. No existing user privileges were changed and no successful write was blindly replayed.
- The public AGPL-covered TemplateUploadController validates BIFF XLS content using installed POI, constrains filenames/storage writes, retains Unicode names and original bytes, and removes partial copies. An explicit UTF-8 response fixes a live Hindi upload acknowledgement that previously replaced characters with question marks. The native check passed 49 assertions in the pinned image; the existing 33 authorization checks still passed. Live uploads passed anonymous denial and wrong-extension/empty/HTML/truncated rejection, plus a valid Hindi-named XLS. The upstream multipart size limit remains authoritative.
- A Reports-only backup preceded restarting only private staging Reports. No production/shared-demo change, clinical service recreation or public route occurred. The native source changes leave SQL, report generation and workbook conversion unchanged.
- Frontend Reports regression checks passed (50) in Asia/Kolkata and America/Los_Angeles. Reports type checking, adapter/check shell syntax and diff checks passed. No frontend source or installed dependency was changed for this native correction.
- Custom XLS generation remains broken by the pinned runtime: JasperReports 6.0.0 refers to `HSSFColor$WHITE`, removed from POI 5.2.1. An actual direct custom export returned 500. No scheduled row was added. The upload success and ordinary Excel export do not establish Custom Excel parity.

Next: compatible native XLS exporter/runtime, actual template/formula and
macro preservation, configured templates, scheduled custom exports and React
browser upload/deletion. Other report definitions, concurrent/failure/restart
recovery, output branding/layout and legacy mutating GET/CSRF remain unfinished.

## 5 October native Reports authorization checkpoint

This supersedes the missing explicit controller ownership enforcement below,
not full Reports parity or live per-report restricted-definition verification.

- The AGPL-covered native controller derives the owner from OpenMRS's session API, rejects a foreign queue/schedule username, and returns 404 for foreign download/deletion IDs. It checks configured report privileges before schedule, direct generation, download and deletion. Verification failures deny access; direct denial cannot proceed into generation. Processing download/deletion is rejected. Queued download names no longer repeat their extension. Global authentication remains enabled.
- The pinned native runtime passed 33 controller checks, with actual Spring/servlet/Reports classes and a private synthetic identity HTTP stub. The source is compiled at startup into only isolated staging's Reports controller; all other native Java and report/template generation remain unchanged. No new dependencies were introduced. An over-restrictive ASCII filename guard was removed before deployment to preserve configured template paths and non-English names.
- After a recoverable Reports-only backup and container recreation, actual HTTP checks passed 16 assertions. The owner could read its five-row queue and populated CSV with a single extension. Anonymous/invalid sessions redirected to login, foreign usernames returned 403 and missing IDs returned 404. A newly created synthetic user with only app:reports could read its own empty queue but not the admin's queue, download/deletion IDs or scheduling identity. The check user was retired afterward; independent SQL retained five Completed rows and ten RUN_REPORT audits. No report was generated or deleted by these checks.
- Only Reports was recreated; the proxy was syntax-checked/reloaded to resolve its new internal address. The 1 GiB cap, internal-only network and no-published-port boundary remain. No production/shared-demo deployment, existing-user privilege change or clinical container recreation occurred.
- Frontend Reports checks passed (50 in both Asia/Kolkata and America/Los_Angeles), along with its type check, adapter/check shell syntax and diff checks. Direct Jest TypeScript-config loading failed on inherited compiler options; loading the same configuration through installed @swc-node/register passed without changing repository configuration. An Nx invocation lacked yarn on its shell path; no dependency rebuild or test-runner source change was made.

Remaining: actual restricted-report-definition checks with limited roles, real
deletion and file removal, custom XLS upload/generation, failure/concurrent
action/restart recovery, other populated definitions and output branding/layout.
Legacy mutating GET/CSRF behaviour needs a compatible server/client review.

## 5 October 2026 direct Reports checkpoint

This supersedes the missing direct Run now browser proof below for the populated Visit Report, not custom XLS, other report definitions or authorization parity.

- Actual React Run now requests opened populated HTML in a separate tab and downloaded CSV, PDF, Excel and OpenDocument while retaining the original catalogue. HTML visibly contains the configured date range and synthetic QST910001 visit. CSV contains the synthetic row; the other three downloaded files have their expected native file signatures. Their direct-path document contents/layout have not been independently re-imported or reviewed in this checkpoint. Direct filenames have one extension; the duplicate-extension defect is specific to queued downloads.
- Independent native SQL retained the original five scheduled records and showed exactly five additional RUN_REPORT audit events, with the configured report name/module and no patient ID. Direct execution does not add a scheduled record. The CSV observation initially timed out because the download belongs to the newly opened browsing context; the actual file and audit were checked without replaying the request.
- Local login/home return HTTP 200 with a browser HTML Accept header. A default command-line `*/*` request is intentionally not rewritten to React by the development history fallback, so its 404 was not an application outage. A native middleware regression covers HTML routes and non-HTML/JSON boundaries; no service was restarted.
- Read-only inspection of the exact pinned Reports runtime's compiled controller and registered interceptor confirms general reporting-session/privilege enforcement, but the controller has no explicit authenticated-owner check for queue usernames or download/deletion IDs, and no report-specific check on schedule. Its queue predicate returns true on an authorization exception. Direct report privilege denial also continues into generation instead of returning immediately. The corresponding current [upstream controller](https://github.com/Bahmni/bahmni-reports/blob/cf594793dd2b4369ff4580e6516f0305723e55dd/src/main/java/org/bahmni/reports/web/MainReportController.java) is reference material, not a substitute for this pinned-image inspection. These are code-level release concerns; cross-user/limited-role exploit behavior has not been exercised or claimed.

Next priority: server-side Reports authorization and fail-closed boundaries in isolated staging, then custom XLS, deletion/recovery and output styling. No production/shared-demo change, access expansion or public exposure occurred.

## 5 October 2026 native report format checkpoint

This supersedes the PDF/Excel/ODS generation gap below for the populated Visit Report only, not the other report types or full Reports parity.

- Actual React requests for 28 September through 5 October generated PDF, Excel and OpenDocument Visit Reports. The browser queue showed Processing and then Completed, withheld deletion while processing, and downloaded each completed file without navigating away. Independent SQL confirmed the three recorded IDs, formats and output filenames. Five total native RUN_REPORT events now match the HTML, CSV and three new requests, with the proper module/report name and no patient ID.
- Read-only extraction verified the configured title and synthetic patient's identifier/visit. Excel imported as a real workbook (one Visit Report sheet, eight used rows and 22 columns), not HTML with a spreadsheet extension. OpenDocument contains the proper spreadsheet MIME entry and populated content XML. PDF text extraction and rendered-page review verified the visit. Each browser download's SHA-256 matched the independently hashed stored file. The private verifier is repeatable and does not submit or modify records.
- The separate HTML tab now visibly contains the populated report while the original React queue remains available. Reports tests passed again (50) in India and US Pacific time; the Reports type check, adapter shell syntax and diff checks passed.
- Native outputs are not yet Qorlia-styled. PDF labels wrap awkwardly; the spreadsheet preview also needs template/layout review in the target office application. The native download names duplicate extensions. These are recorded defects, not successful design acceptance.

Remaining: direct Run now, custom XLS upload/generation, actual report deletion, limited-role/server-side ownership boundaries, failed jobs/concurrent actions/restart recovery, other populated report definitions and report output branding/layout. No production/shared-demo change, privilege change or public exposure occurred.

## 5 October 2026 native Reports checkpoint

This supersedes the missing native staging service and HTML/CSV generation gaps below, not full Reports or React parity.

- The pinned upstream Reports service now runs only on isolated staging's internal network with no published ports, a separate Reports schema and persistent output storage. A recoverable clinical SQL backup was taken before the bundled migrations; both clinical and Reports migrations completed. The startup adapter runs them without password-bearing shell tracing, writes private configuration and starts without the image's debugger. It has a 1 GiB container limit and 512 MiB heap; measured use during review was about 371 MiB. No existing application container was recreated.
- The staging proxy now issues an HttpOnly, Secure, same-site reporting session from the existing OpenMRS session and routes Reports privately. Actual browser queue reads work. Anonymous and invalid-reporting-session requests return a login redirect, not report data. This is not complete role or ownership enforcement proof.
- React browser scheduling generated populated Visit Reports in HTML and CSV for 28 September through 5 October. Independent SQL confirmed both Completed records with their configured name, dates and formats. The native HTML opened with the synthetic QA patient's visit. CSV downloaded without leaving the app; its 516 bytes matched the stored output SHA-256 `86fe20ad8beca06bd748e6901f69e760d35b233466965546af26c1b568b34906`. Native audit records contain both RUN_REPORT attempts, the proper module and report name, with no patient ID.
- HTML reports are inline pages, not browser downloads. Their queue action now says View report (new tab) and uses a safe new-tab link; other formats retain Download. The new control regression, full Reports suite (50 tests) in India/US Pacific, Reports type check and library build passed. The previous 49-test checkpoint is superseded only for this additional control.
- The populated removal dialog initially focused Cancel. Cancel closed it, restored focus to its opening Delete button and retained both records. Actual report deletion was not performed. The queue screenshot is saved privately as `reports-native-queue-20261005.jpg`.

Remaining: direct Run now, PDF/Excel/ODS/custom XLS templates, actual deletion, limited-role and server-side ownership boundaries, failures/concurrent actions/restart recovery, and branding of native report outputs. Separate OpenELIS and Odoo databases are unavailable here; their report types are not verified. The adapter and its source/license are public under `runtime/reports`; no production/shared-demo deployment or public exposure occurred.

## 5 October 2026 Reports controls and audit checkpoint

This supersedes the Reports control gaps in the older catalogue preview, not native report generation or full React parity.

- Report requests now use the configured report name rather than its JSON key. The Qorlia controls honor configured formats and date presets, omit dates for reports that require none, reject concatenated CSV, and accept configured or uploaded XLS macro templates. Upload uses multipart `file`, validates its acknowledgement, and never treats a login page or arbitrary path as a template filename.
- My Reports handles numeric and ISO timestamps, sorts newest first, groups by request date and displays start/end dates and format. Literal search does not interpret regular expressions. Processing entries have no delete action. Deletion re-reads the queue, rejects stale/processing entries, and uses the existing confirmation modal; Cancel sends no request. This frontend check does not establish server-side ownership enforcement.
- Direct run and scheduling requests use the shared `RUN_REPORT` audit event with `{ reportName }` and `MODULE_LABEL_REPORTS_KEY`, matching the pinned [legacy Reports controller](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/reports/controllers/reportsController.js). The event records the attempt, including rejected queue requests, not completion of report generation. Scheduling is not retried automatically. Audit logging is independent of submission: logging failure displays a separate warning, preserves accepted queue status and does not replay the report request. Queue rejection still shows failure, not success. Direct run opens synchronously before the asynchronous audit request to preserve browser popup behaviour.
- The full Reports suite passed (49 tests) in Asia/Kolkata and America/Los_Angeles. Shared audit-service checks passed (8). Reports/service type checks and dependency-first builds passed. The Reports App unit fixture now supplies its API reads instead of making accidental network requests. Existing shared-service duplicate mock warnings and large bundles remain.
- Browser review loaded the actual 13 configured reports under the isolated authenticated session. Previous month selected 1 September through 30 September. My Reports explicitly shows unavailable, not an invented empty or successful queue. No report generation, upload, scheduling, deletion or audit write was performed in this browser checkpoint.

Remaining: add and verify the native Reports service privately in isolated staging, including its server-issued reporting session bridge, generation, queue, downloads, real XLS upload, deletion, limited-role/ownership boundaries and failures. The inspected official image runs migrations against both the OpenMRS and Reports schemas; take a recoverable staging backup and review those changes before startup. No production or shared-demo deployment occurred.

## 5 October 2026 shared confirmation focus checkpoint

This supersedes the dialog focus-restoration gap below, not complete accessibility or workflow parity.

- The shared confirmation modal now restores focus to its opening button or link whether its caller closes it or unmounts it. It preserves Carbon's safe secondary-action initial focus and focus trap, including React StrictMode effect replay. The first attempted cleanup exposed a real StrictMode focus-wrap regression; the final lifecycle guard and regression tests cover it without replacing Carbon or adding a dependency.
- Populated Programs browser checks retained initial focus on Cancel and returned focus to the opening button after Cancel, Escape and Close, including keyboard reopening. Patient Documents' persistent unsaved-change dialog retained initial focus on Stay and returned focus to its opening navigation link after Stay, Escape and Close. Network observation recorded no write requests. Only a local pending synthetic file was selected and discarded; no document or program record was saved or removed.
- The actual shared/Carbon modal integration tests cover eight combinations of conditional/persistent mounting, StrictMode and button/link launchers. All 24 open/dismiss/reopen cases passed. Focused widget/conditions checks passed (57), Programs/result-editor checks passed (56), and document-section checks passed (30). Widget, clinical and document type checks and dependency-first library builds passed. Existing upstream eval, import/mock and large-bundle warnings remain.

Remaining: other accessibility controls and zoom/layout review, configured Programs datatypes/defaults/multiple workflows, concurrency and limited-role backend checks, plus the broader React and separate-product workflows below. No production/shared-demo deployment or access change occurred.

## 5 October 2026 Programs browser checkpoint

This supersedes the browser attribute/date/removal/completion/void gaps in the earlier Programs checkpoints, not complete Programs or React parity.

- Real browser editing saved concept and Boolean changes, saved a retrospective Treatment Date, and cleared only that date. Full reloads and independent native REST retained the four unrelated attribute UUIDs/values and both cleared-date values in voided history. Native date controls require committed input; incomplete date segments block submission rather than producing a partial write.
- A retrospective state change returned HTTP 200. Cancel sent no DELETE; Escape dismissed the existing in-page dialog; confirmed current-state removal returned 204. Reload and native REST showed the previous state reopened and the removed state retained as voided history.
- A separate synthetic browser enrollment returned 201. Completion with a configured outcome and retrospective date returned 200; full reload moved it to Past programs. Independent REST retained the enrollment date, outcome, closed state and all three original attribute IDs/values. A completion date before enrollment disabled submission and sent no write.
- Enrollment removal Cancel sent no DELETE. Confirmed removal returned 204; reload excluded it from normal lists. Direct native REST retained the completed enrollment, its dates/outcome, original attributes and state as voided history, with the removal reason. The synthetic patient remained active. The native search endpoint omits voided enrollments even with `includeAll`; the private read-back verifier uses the recorded UUID directly and did not replay successful writes.
- Enrollment defaults now follow `defaultProgram` and its first active workflow state, while preserving manual selections and explicit clearing during configuration refresh. This matches the pinned legacy controller. Automated configuration variants passed, but staging has no configured default, so that variant still needs a populated native fixture.
- Programs page/service checks passed (108) in Asia/Kolkata and America/Los_Angeles. Sibling Programs widget checks passed (60, two snapshots), three type checks passed, and service/widget/clinical dependency-first builds passed. Existing form-renderer eval, import/mock and large-bundle warnings remain.

Remaining: other configured datatypes, configured-default and multi-workflow behavior, concurrent-write/failure and limited-role backend checks, keyboard focus restoration after dialog dismissal, plus the broader React workflows below. Browser input works again. Tests used only isolated synthetic staging; no production/shared-demo deployment, public exposure or privilege change occurred.

## 4 October 2026 Programs attribute checkpoint

This supersedes the concept/scalar edit gaps below, not full Programs datatype or workflow parity.

- Enrollment editing now preserves concept selections returned as a UUID, display label, name label or object across the three supported concept datatypes. Missing answer metadata blocks editing instead of silently clearing a saved answer. Shared validation rejects unconfigured selections before writing. Serialization retains the [legacy formatter's](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/domain/mappers/attributeFormatter.js) display-plus-hydrated-UUID contract for `org.openmrs.Concept`, and UUID values for modern concept datatypes.
- Real staging returns Boolean enrollment attributes as primitive booleans. The model, edit prefill, page display and shared summary reader now retain true, false and numeric zero instead of treating them as concept objects. Unchanged scalars are not rewritten. Summaries exclude voided attributes.
- Actual shared-service staging edits changed a synthetic concept selection, Boolean and date, then cleared only the date. Independent native REST read-back preserved the other four attribute UUIDs/values and retained the cleared date in voided history. Bahmni's full response omits voided attributes; the native enrollment response with `includeAll=true` provides that history. The guarded private verifier re-read completed writes without replaying them. Invalid answers caused no POST.
- Programs page/service tests passed (100) in Asia/Kolkata and America/Los_Angeles. Sibling ProgramDetails/PatientProgramsTable tests passed (60, two snapshots). Clinical/service/widget type checks and dependency-first library builds passed. Existing form-renderer eval, dynamic/static import, duplicate-mock and large-bundle warnings remain.

Remaining: populated browser attribute/date/modal save proofs, other configured datatypes, multi-workflow behavior, concurrent-write/failure and limited-role backend checks. Browser focus commands still time out. The exact local session API authenticates the isolated seed account, and the review connection responds normally. No production/shared-demo changes occurred.

## 4 October 2026 retrospective Programs date checkpoint

This supersedes the missing state/completion date controls below, not full Programs parity.

- State changes and completion now use labelled native date controls with the latest non-voided state as the minimum and local today as the maximum. The shared service re-reads the enrollment and rejects impossible, future or too-early dates before writing. The sibling state action still defaults to today.
- The actual shared service saved a backdated state and completion on isolated synthetic staging. Independent REST read-back retained the enrollment date, both state boundaries, configured outcome and all three attribute UUIDs/values. Invalid earlier dates caused no POST. This is service/API evidence, not browser-save proof.
- Programs page tests (11) and shared service tests (53) passed in Asia/Kolkata and America/Los_Angeles. Clinical/service type checks and library builds passed. Existing form-renderer eval and bundle-size warnings remain.
- The private test initially used the legacy hydrated-object payload for a modern ConceptDatatype attribute. The backend rejected it without creating an enrollment. The corrected fixture sends the modern concept UUID value; no application serializer or backend metadata was changed for this test.

Remaining: populated browser date/removal/completion/void proofs, configured multi-workflow behavior, attribute datatype edit parity, concurrent-write/failure and limited-role backend checks. Browser controls remain unavailable because the review tab's focus operation times out. No production or shared-demo changes occurred.

## 4 October 2026 Programs lifecycle checkpoint

This supersedes the missing isolated-program state metadata and enrollment/state-save evidence below, not full Programs parity.

- Actual React browser enrollment in TB Program and a change from initial phase to Continued Treatment both returned HTTP 200. Full reloads and independent native REST reads retained the enrollment date, configured attributes, initial state and later state history for a clearly labelled synthetic staging patient. Isolated staging supplies authoritative `allowedStates`; the older shared-demo response does not.
- Direct API current-state removal returned HTTP 204, restoring the previous state's open end date and retaining the removed state's UUID/value in voided history. Direct API completion returned HTTP 200 with the configured Cured outcome. A browser reload moved the enrollment to Past programs. Independent native REST reads confirmed the completion date, closed previous state, unchanged attribute IDs/values and correct patient. These removal/completion writes are API proofs, not browser-save proofs.
- Both removal actions now reuse the existing Qorlia confirmation modal instead of native blocking popups. Cancel submits nothing; failed state removal closes the modal, exposes the error and allows retry. The shared service re-reads before state changes/removal and rejects completed/voided enrollments, unavailable/retired next states and stale/non-current state removal. It does not manufacture transitions or bypass backend permissions.
- Programs page checks passed (11), shared program-service checks passed (46) and sibling ProgramDetails checks passed (26). The page/service checks also passed in US Pacific time. Clinical type checking and the clinical/service library builds passed; existing form-renderer eval and bundle-size warnings remain.
- Behavior was traced against the pinned [legacy program controller](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/uicontrols/programmanagement/controllers/manageProgramController.js) and [program service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/domain/services/programService.js). The separate numeric Program ID metadata remains unchanged.

Remaining: browser removal/completion/void save proof, retrospective state/completion date controls, configured multi-workflow behavior, concurrent-write/failure and limited-role backend checks. A stale native popup blocked browser input during this checkpoint; the new in-page modal still needs populated browser verification. No production or shared-demo changes occurred.

## 4 October 2026 attachment-format checkpoint

This supersedes the PDF/JPEG/GIF verification gap in the protected attachment checkpoint below, not all upload formats or result workflows.

- The Radiology Order editor uploaded synthetic PDF, JPEG and GIF files, saved them with HTTP 200 and retained all three alongside the existing PNG and original note after a full reload. Independent native REST reads confirmed the patient/order association and active attachment observation IDs. The previously removed PNG remains voided; retained Procedure fields and coded-answer history still pass their read-only checks.
- Authenticated file reads returned the correct MIME types, private/no-store and nosniff headers, with bytes matching independently measured staging storage hashes. Anonymous reads returned 403. JPEG/GIF rendered in the browser. Bahmni re-encodes images; the PDF retained its original bytes exactly. The in-app browser's native PDF viewer remained blank, so the editor and read-only result view now offer a native Download PDF fallback. Its actual browser download matched the original PDF hash.
- WebP is no longer advertised by the result editor. The shared upload processor rejects WebP MIME/filenames before reading or submitting them, and Patient Documents rejects WebP selection. The isolated backend also rejected the probe with HTTP 400. This follows the existing [Bahmni ImageIO upload processor](https://github.com/Bahmni/bahmni-core/blob/master/bahmnicore-api/src/main/java/org/bahmni/module/bahmnicore/service/impl/PatientDocumentServiceImpl.java), rather than silently converting clinical originals.
- Both upload query consumers normalize an unset size setting to null, avoiding TanStack's undefined-data error while preserving the backend's authority. An unset limit is not interpreted as zero MB. Editor checks cover rejected format/oversize selections, retained notes, unset limits and protected PDF links. Editor/API/Orders tests passed (60), service upload tests passed (11), and Patient Documents widget tests passed (37), without the previous unset-limit query error.
- Clinical/widget type checking and clinical/service/widget library builds passed. The existing form-renderer eval warning, dynamic/static import warnings and large bundles remain release concerns. Rebuilding a watched dependency briefly removed generated CSS; the local build recovered after dependency-first rebuilding, and a fresh login/location/home check had no console errors.

Remaining: real size-limit/error boundaries, other media formats and saved Patient Documents edits/removals, populated limited-role checks, specialized form rules and the other React workflows below. No production/shared-demo deployment or public exposure occurred.

## 4 October 2026 protected radiology attachment checkpoint

This supersedes the pending radiology text/image browser checks in the earlier checkpoints below. It does not declare all attachment formats, result forms or clinical workflows complete.

- The redesigned Radiology Order page saved an explicitly synthetic text result and PNG attachment through the real legacy encounter API (HTTP 200), then retained both after a full reload. Adding a second PNG also returned HTTP 200 and preserved the original note and attachment observation IDs. Removing only the first attachment returned HTTP 200; a reload retained the note and second image, while native REST retained the removed image's original path in voided history. Only the isolated synthetic patient was edited.
- Opening the saved attachment initially returned 404 because isolated staging omitted the separate protected-file service. The repair uses Bahmni's existing patient-documents image with read-only staging file volumes, following its [official proxy route](https://github.com/Bahmni/bahmni-proxy/blob/main/resources/bahmni-proxy.conf). The local `/openmrs/auth` route now verifies the OpenMRS session and the upstream clinical/document application privileges. Raw file paths and the internal fetch route remain closed; no public ports, DNS routes or production services changed.
- The public MPL-covered authentication adapter validates directory boundaries, rejects encoded traversal/control characters, safely encodes internal redirects and fails closed on invalid session responses. Its native check and the actual pinned image's Nginx syntax check passed. Live authenticated reads returned image/png with private/no-store and nosniff headers; anonymous access returned 403, direct routes 404 and invalid paths 400. Served bytes matched independently measured staging file hashes. Bahmni's ImageIO PNG re-encoding means those bytes are not expected to match the original PNG encoding; image dimensions and browser rendering were verified.
- Editor/API/Orders page tests passed in Asia/Kolkata and America/Los_Angeles (57 tests), including partial multi-file upload failure, retained successful uploads, unsaved restoration and saved attachment voiding. The existing Procedure multi-select fields/IDs still passed independent checks after the radiology writes. Clinical type checking/build passed in the preceding checkpoint; no application code changed in this attachment-runtime repair.

Remaining: PDF/other supported image formats, upload-size/error boundaries with the real backend, populated limited-role checks, specialized result-form rules and the other React workflows listed below. The separate-product redesign remains the next phase.

## 4 October 2026 isolated clinical checkpoint

The isolated review at `http://localhost:3002/bahmni-v2/login` now has verified browser sign-in, location selection and React home navigation. A private development connection failure was repaired; its reconnect loop also passed a forced-disconnect recovery check. Production and the shared public demo are unchanged.

- Vitals form save and the consultation Done action returned HTTP 201 from the real `EncounterBundle` API. Pulse 78, oxygen saturation 98 and respiratory rate 16 persisted for the clearly labelled synthetic staging patient after reload.
- History and Examination now supports legacy plain-text form events through shared metadata normalization. Its conditional chief-complaint field and required-field save validation worked in the browser. Completed form creation returned HTTP 201 and persisted after reload. A later edit returned HTTP 201 with the original consultation UUID and preserved complaint, duration and units while updating history text.
- Allergy creation, severity/note editing and reaction removal passed real HTTP 201 transactions and full reload checks. Required-value and duplicate-allergen validation blocked invalid drafts. The shared formatter preserves coding-only display names and deduplicates reactions, with a failing-before/passing-after regression check. Clinical allergy and transaction tests passed (243 tests, four snapshots); allergy table tests passed (26 tests); allergy service tests passed (40 tests).
- Synthetic medication creation, editing and stopping passed HTTP 201 transactions and reload checks. Creation retained the drug, dosing fields, route, instructions, quantity and note. Editing created a linked revision, updating duration and calculated quantity. Stopping removed it from Active & Scheduled and retained its date, reason and note in All history. Missing dosing fields or stop reason were blocked before submission. Medication/stop tests passed (121 tests, one snapshot); other prescribing modes remain pending.
- A single browser `EncounterBundle` transaction returned HTTP 201 for clearly labelled synthetic CBC, chest X-ray and dressing orders. Independent REST reads confirmed all three share the saved consultation, retain their notes and use the proper Lab, Radiology and Procedure order types. CBC retains STAT priority; the other two remain ROUTINE. The urgency checkbox now follows the draft store rather than its own uncontrolled state, with real-store toggle and restored-priority regression coverage.
- Orders uses Standard's `app:orders` entry privilege, not the separate `app:radiologyOrders` privilege. It formats numeric and ISO timestamps through the shared date helper. Result-save confirmation reuses the shared accessible modal and retains the draft on cancellation or save failure. Mocked checks cover lost write permission and preventing a repeat save after failed read-back. The older native prompt is gone; its stale X-ray draft remains protected by the concurrent-edit guard and must not be submitted. Direct API radiology-result create/edit checks persisted the synthetic note; independent REST reads confirmed the patient/order association and voided original note history. The Procedure browser proof below verifies the replacement modal, including Keep editing and confirmed saves. Radiology text/attachment browser persistence still needs verification. Focused order/investigation tests passed (160 tests, two snapshots), along with clinical type checking and library build. The upstream form-renderer eval warning and large bundles remain release concerns.
- Diagnosis entry remains hidden for the isolated seed account because matching V2 add privileges are absent. Existing legacy edit privileges were not converted into add permission. Staging role metadata and API permission boundaries still need verification.
- Order-result forms render native numeric, date and local date/time fields plus coded and Boolean answer toggles using configured concept metadata. They retain zero/false values, units, short labels, answer UUIDs and notes. Required/disable-notes rules, absolute limits, valid calendar dates and default future-date restrictions are checked before confirmation and again before save; explicit `allowFutureDates` is honored. Notes are limited to the legacy 255 characters. Normal-reference violations are indicated without blocking valid abnormal results. Conditional, computed, repeated, autocomplete, month/year-only and other unmigrated rules remain read-only. The existing shared concept-label/date helpers are reused. Editor/API/Orders page checks passed (56 tests) in Asia/Kolkata and America/Los_Angeles, including nonexistent daylight-saving time rejection, multi-select requirements/history and read-only permissions. Clinical type checking and build passed. Behavior was traced against the pinned [legacy concept-set model](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/concept-set/models/conceptSetObservation.js).
- A clearly labelled synthetic Procedure fulfillment form was added only to isolated staging because the seed lacks one. Date/Datetime/Boolean/Numeric/Coded result create and edit returned HTTP 200 from the legacy encounter API. Independent native REST and Bahmni reads confirmed the edited time, true answer, numeric 12 and configured Yes UUID with the correct patient/order association. Clearing Date retained its voided original observation; original Datetime history was also verified. The real check exposed and fixed ISO Datetime rejection: writes now use `yyyy-MM-dd` and local minute-precision `yyyy-MM-dd HH:mm`, matching [OpenMRS 2.6.15's parser](https://github.com/openmrs/openmrs-core/blob/2.6.15/api/src/main/java/org/openmrs/Obs.java) and the [legacy datetime control](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/ui-helper/directives/datetimepicker.js). The failed ISO request was re-read before retrying and had left no Procedure result. These are direct API proofs, not browser save parity or production metadata changes.
- Configured coded multi-select members now render one control with independent answer toggles. Each selected answer is a separate observation, not an array-valued result. Unsaved removal drops the leaf; saved removal preserves its UUID in voided history, and undo before saving restores the same leaf. Required validation applies across active selections and sibling fields/notes are retained, following the pinned [legacy multi-select model](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/concept-set/models/multiSelectObservations.js). A root multi-select and unimplemented rule combinations remain read-only.
- Multi-select was enabled only on the existing synthetic staging QA field after backing up its configuration. Browser creation and answer removal both returned HTTP 200. Full reloads and independent Bahmni/native REST reads confirmed Date `2026-10-03`, local Datetime `2026-10-03 15:27`, Boolean false, Numeric 0 and separate Yes/No answer observations. Removing Yes retained the original No UUID and all four other field UUIDs/values, and the removed Yes retained its value in voided history. No production metadata changed. These are populated browser proofs for this synthetic form, not all configured forms or attachment handling.
- The browser was serving an old Orders configuration from its HTTP disk cache. Development backend-config responses now use `Cache-Control: no-store`, with a boundary regression test. A one-time cache-bypassing reload fetched the new configuration, then the temporary bypass was reset. Normal reloads loaded the current controls. The restarted local home and result route rendered without captured console errors.
- A recoverable, exact-row staging metadata repair resolved ambiguous diagnosis mappings. An isolated application restart cleared the mapping cache; the vitals flowsheet returned HTTP 200 and displayed saved data.
- The shared narrow-screen card/action layout keeps the save footer inside the viewport. Full form-control visual/accessibility parity is still pending.
- Mobile clinical navigation opens through Carbon's existing menu button and dismisses on section selection, overlay click or Escape, with those paths verified in the browser. Its labels use the branded foreground and the content no longer reserves an empty rail. A separate desktop-sized tab confirmed the expanded sidebar, hidden mobile button and saved medication history. Header/layout tests passed (58 tests), including desktop-rail unit coverage.
- Focused checks passed for the proxy challenge-header boundary, metadata normalization, action layouts, form containers/hooks and event execution. Shared service/design-system type checks and library builds passed.

This supersedes the observation-form, allergy, medication-create/edit/stop and investigation-order-create browser-save gaps in the 1 October checkpoint below, not its other remaining items. Other prescribing modes, diagnosis, order changes/results, attachments and permission/failure flows still need populated end-to-end verification. Separate products remain the later phase.

## 1 October 2026 integration checkpoint

This section supersedes the earlier "no writes tested" milestones below. It does not declare full parity or authorize production replacement.

- The local Qorlia login and home are now the entry flow. Patient Documents, Orders and the radiology overview are also reachable from React home/admin links. Operator consoles and separate external products are not React replacements.
- Synthetic patient `QorliaQA OctTwo Synthetic` (`ABC200013`) was created and edited through React registration. Demographics/contact data, visit creation and the registration encounter were read back after their successful REST writes. Patient profile conversion preserves existing identifiers and uses the same native representation for reads and writes. Photo/video capture and role-specific registration checks remain.
- Patient Documents search opens the React uploader. A synthetic screenshot was uploaded with a note and document type, saved through the legacy document/visit APIs, then loaded again after a browser reload. The app now supplies the shared user-action context, preserves pending documents on failures, validates upload acknowledgements and paths, and checks the active visit before saving. Saved edit/deletion and all supported formats still need testing.
- Appointment create and edit persisted through the native API, including service/type, location, date/time and notes. A clear conflict response of HTTP 204 is handled as an empty conflict result. The populated test booking was cancelled through the status API. Check-in, provider edits/responses, recurrence and service administration remain unverified.
- TB enrollment create and attribute edit persisted after reload. Native `v=full` reads replace a custom representation rejected by the older backend. Missing transition metadata now has an explicit UI warning without breaking enrollment display/editing. The shared TB program-ID rule remains numeric, so using the alphanumeric patient ID is still blocked by metadata. Next-state selection, state removal, completion and void writes need compatible staging data and permission checks.
- Inpatient admission, transfer and discharge passed real synthetic writes. Transfer was visible after reload; discharge released the assigned bed. Both test beds are free again. The active IPD visit after discharge matches the legacy behavior. Bed tags, other IPD actions and role boundaries remain.
- OT block create/edit, actual-time record/clear, single-surgery cancellation and whole-block cancellation passed synthetic API checks. Saving projects writable appointment/attribute fields only, preserving retained cancelled surgeries without sending GET-only metadata. A regression test covers the original `bedNumber` failure and nested attribute metadata. The block was voided after testing, releasing its future theatre reservation. The earlier HTTP 400 edit partially persisted a note; an error response must not be assumed to mean rollback. Advanced queue, bulk-note, time-slot, print and role checks remain.
- The shared demo still lacks the clinical `EncounterBundle` resource. A separate, internal-only staging backend now starts with the additional FHIR extension. Direct API consultation/observation save, read-back and rejected-transaction rollback checks passed there. The React browser save remains pending, so this is not completed clinical parity. Do not bypass the transaction with separate clinical writes. Orders/result entry has real API wiring and tests but lacks populated synthetic end-to-end write proof. Reports/admin populated writes also remain pending.
- The shared notification hook now imports its context directly, removing a self-barrel cycle. Source aliases in the local distro keep review screens current without rebuilding every shared JavaScript package after each edit. Shared CSS builds and production package builds are still required.

See [backend readiness](BACKEND_READINESS.md) for response evidence, compatibility gaps and the release boundary. OpenELIS, Odoo, PACS, analytics and outreach reskinning remain the next phase.

## Local Qorlia entry flow (28 September 2026)

- The local review build opens `/bahmni-v2/login` for sign-in and location selection. It uses Bahmni's existing session and login-location APIs. The legacy `/bahmni/home/index.html` path redirects to the new login in the local development server. A browser with the older page cached may need a cache-bypassing reload once.
- After location selection, the user lands on `/bahmni-v2/home/`. In the local review build, home tiles for Registration, Programs, Clinical, Bed Management, Admin, Reports, Operation Theatre and Appointments open React routes. Tiles without an equivalent review route are noninteractive and marked "In progress". The clinical workspace's Appointments links also stay in React.
- These review links are not a production release decision. Standard production tile targets remain unchanged until the workflows below pass populated-backend, permission and write-path verification. Do not remove legacy modules or deploy the review routing as a hospital replacement yet.

This is an implementation ledger, not a claim that the redesign is complete. It compares the official Standard home configuration at commit `f39d186eb9e610d5f219d44ecc5e14b3e615c0db` with this fork's React routes. Recheck it against the authenticated Qorlia Standard demo before changing any default link. A working page title or successful build does not prove a clinical workflow.

| Standard module or workflow                                      | Current React coverage in this repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Remaining proof or implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home and role-filtered module tiles                              | `/bahmni-v2/home/` reads `home/v2/extension.json` and user privileges. With the synthetic demo account on 25 September 2026, 13 module tiles rendered. Registration and Admin use React routes; the other visible modules still link to legacy applications or operator tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Compare visible tiles and links against Standard for each role. Keep legacy targets until their replacement workflows pass the release gate below.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Registration and patient search                                  | `/bahmni-v2/registration/search`, `/patient/new`, and `/patient/:patientUuid` use the registration config and OpenMRS services. Authenticated synthetic patient name search and patient detail navigation were verified locally on 25 September 2026.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Test create, edit, validation, visit and role rules against synthetic patients.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Clinical patient search and consultation                         | `/bahmni-v2/clinical/` now shows a Qorlia workspace when the Standard V2 clinical config omits extensions. It reads today's appointments through Bahmni's legacy appointment search API and searches patients through the existing OpenMRS Lucene service. On 25 September 2026 the signed-in synthetic demo returned an empty appointment list and real patient search results; a result opened its React consultation route. Explicit extension configurations still take precedence. A synthetic patient detail loaded observations, forms and vitals. The New Consultation panel opened with the demo account; its save flow was not tested. On the older demo FHIR server, Condition, diagnosis, Immunization and ServiceRequest reads now retry patient-only queries after unsupported-filter errors. ServiceRequest fallback filters category, encounter and recent visits locally. Patient appointments fall back to Bahmni's legacy appointment search when the FHIR Appointment route returns 404. Medication reads fall back to legacy drug orders when FHIR MedicationRequest returns 500; these records are read-only. Local browser QA confirmed that the synthetic patient's empty medication list now loads without an error notice.                                                                                                                                                                      | The clinical home tile still points to the working legacy app. Do not switch it until clinical reads and writes pass the release gate. The demo backend lacks FHIR ImagingStudy, so radiology enrichment remains unavailable. Test populated medication and appointment records, consultation writes, permissions and errors before release.                                                                                                                                                                                                                                            |
| Appointments                                                     | React admin service and unavailability screens use the Qorlia appointment workspace layout while retaining their existing Bahmni API queries and permission gates. The React appointments home shows weekly service, specialty, provider and location sections plus a selected day's appointment list from the live Bahmni APIs. The separate React daily list and awaiting list use the legacy `/appointment/all` and `/appointment/search` endpoints with service, provider, location, status and patient filters. On 26 September 2026, the signed-in synthetic demo loaded six service rows and empty specialty, provider, location, daily and awaiting lists. A daily appointment detail panel renders the search response when records exist. For users with appointment-management privileges, the lists read legacy `app.json` and offer only status transitions allowed for each current status. The booking form reads real patient, location and eligible provider data, checks conflicts, and maps Requested services to provider acceptance before calling Bahmni's appointment save API. The new React calendar offers day and week views from the live appointment search API, groups the day by provider, excludes cancelled and waitlisted appointments, and reuses the booking form behind its permission gate. The signed-in local demo loaded both views with an empty schedule on 26 September 2026. | The legacy service tree, time-slot layout, and calendar event actions still need parity. The demo lists were empty, so populated calendar cards and live booking or status writes have not been browser-verified. Booking and status actions are not release-ready. Verify these workflows before changing the official home tile from the legacy frontend.                                                                                                                                                                                                                             |
| Reports                                                          | `/bahmni-v2/reports/` reads the Standard catalog and settings, filters by privilege, and supports date ranges, formats, run links and queue actions. My Reports reads the authenticated queue and offers completed downloads and confirmed deletion. The signed-in local preview displayed 13 reports and an empty queue on 26 September 2026.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A synthetic run, queue, download and deletion still need isolated end-to-end checks before switching the legacy Reports tile.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Patient documents                                                | `/bahmni-v2/patient-documents/:patientUuid` fetches patient and encounter data and mounts document components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Test upload, view, search, permissions and radiology-specific document rules. The search breadcrumb still targets legacy document upload.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Admin                                                            | `/bahmni-v2/admin` renders five role-filtered tiles for the synthetic demo account. All still link to legacy pages. Separate React preview routes now cover CSV Upload, CSV Export, Audit Log and Order Sets, using the legacy Bahmni APIs. Live read paths were checked locally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verify role-specific access, populated records and synthetic write paths in an isolated environment before switching any tile.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Programs, inpatient/bed management, operation theatre and orders | React inpatient lists, patient-stay actions, and ward views use the existing Bahmni configuration and OpenMRS APIs. The ward view includes a permission-gated bed-tag editor. The React Programs route searches patients through Bahmni's Lucene API and reads active and past enrollments, outcomes, attributes and state history through the existing OpenMRS program service. Users with `Add Patient Programs` can enroll a patient with configured attributes and an optional initial state. Users with `Edit Patient Programs` can edit enrollment date and configured attributes, select an allowed next state, remove the current state after confirmation, or complete an active enrollment with a configured outcome. Users with `Delete Patient Programs` can void an enrollment after confirmation. These actions use Bahmni's existing program APIs. The legacy manager remains linked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verify the program catalog, attributes, reads, enrollment create, and state update against a signed-in isolated synthetic environment with populated records. Verify enrollment-date and attribute edits, state removal, completion, and void writes against an isolated backend before considering Programs parity. Verify populated inpatient records, role boundaries, and all write paths in an isolated synthetic environment. Operation theatre, orders, and remaining legacy IPD features still need one-to-one React coverage. Keep legacy links until the release gate passes. |
| Laboratory, stock, billing, radiology and analytics              | Separate OpenELIS, Odoo, PACS and reporting applications or legacy routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Reskin and verify each separately after the React app, preserving license notices and product-specific behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Implementer interface and AtomFeed console                       | No React route in this repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Treat as operator tools, not patient-facing navigation; verify their service health and access controls separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

For every migrated workflow, the release gate is the same: compare old and new screens for each role, map every read and write to the same backend API or a documented equivalent, exercise success and failure paths with synthetic data, verify audit and permission boundaries, then switch the tile link. Until then, keep the working legacy route available. Do not infer parity from shared CSS or from the static design preview.

## 28 September operation theatre preview

- The React day calendar can now group blocks by theatre or by surgeon. Surgeon columns use the existing provider API and the OT configuration's `primarySurgeonsForOT` list, including configured surgeons with no bookings. The week view remains grouped by date. This is a read-only calendar change; local authenticated browser verification is still pending.
- Day and week surgical-block requests now match the legacy calendar's `includeVoided=false` setting. Week requests and the displayed week honor the OT configuration's `startOfWeek` value rather than assuming Monday. A unit test covers a non-Monday week boundary; a signed-in local browser check is still needed.
- `/bahmni-v2/clinical/operation-theatre` reads day or week surgical blocks from Bahmni's `/openmrs/ws/rest/v1/surgicalBlock` API behind `app:ot`. The list calculates each surgery's expected start from the preceding surgery and cleaning time, and shows patient age, status notes, bed location, bed ID and the surgery attributes present in the returned cases. Provider-valued attributes resolve against Bahmni's provider catalog. List headings can be sorted in both directions. Day and week views show each case only when its expected time overlaps the selected date range, including overnight cases. The calendar uses the OT configuration's hours and split interval, lists configured theatres, and places active blocks and cases on the timeline. Both views filter by theatre, surgeon, status and patient. Users with `app:ot:write` can record actual surgery time and open the new block editor at `/bahmni-v2/clinical/operation-theatre/new` or edit an existing block. The editor reads Bahmni's OT config, surgeons, operation-theatre locations, surgery attribute types and patient search, then sends block and surgery data to the official surgical-block API. It validates duration and checks for concurrent edits before saving. It can cancel or postpone a whole block, or one scheduled surgery, with a reason while preserving the other surgeries. Mocked tests cover the API payload, schedule timing, timeline placement, cancellation and stale-edit rejection. The list now reads configured surgery attribute types, so its columns remain visible when the selected cases have no values. The list offers a native print action with a compact landscape layout, while preserving the selected date range and filters. Print output still needs a browser and printer check. The patient queue, bulk notes, advanced filters and detailed time-slot actions remain. Populated-backend behavior still needs verification, so the official OT tile opens the legacy screen.
- Users with `app:ot:write` can record actual start, end and notes for scheduled or completed surgeries in the React preview. As in legacy OT, the form suggests the expected times, requires start and end together, and can clear a completed surgery's recorded times to restore Scheduled status. It re-reads the surgical block before posting to Bahmni's surgical-appointment endpoint and refuses a stale, voided or cancelled booking. Focused tests cover its permission gate, request shape, clearing, stale-record rejection and time validation. No write was sent to the shared demo, so this action is not release-ready. The legacy OT screen remains the official entry point.

The inpatient row above records the earlier read-only milestone. The update below describes the newer action implementation and its remaining release checks.

## 26 September local verification

- The React Programs preview has patient search, expandable enrollment outcome, attributes and state history, loading, error, and privilege states. Users with `Add Patient Programs` can create an enrollment with configured attributes and an optional initial state. Users with `Edit Patient Programs` can change enrollment date and configured attributes, change or remove the current state, or complete an active enrollment with an outcome; users with `Delete Patient Programs` can void an enrollment after confirmation. All use Bahmni's existing APIs. The create flow rechecks active enrollment immediately before saving and does not treat a failed refresh as a failed write. Focused page and service tests cover read rendering, state and attribute updates, state removal, completion, enrollment serialization, duplicate protection and permission gates. Authenticated browser parity and backend writes are still unverified. The official Programs tile remains on the legacy route, and React links there for other remaining actions.
- The React calendar now shows configured status actions inside an appointment card for users with appointment-management privileges. It uses the same legacy action rules and status API as the daily list, requires a time for check-in, and refreshes appointment views after a successful change. The edit action loads the full legacy appointment and can change its service, configured service type, location, date, start and end time, and notes. It loads service types from Bahmni's service API, clears an unrelated type when the service changes, preserves patient, status, appointment kind, scheduled date and active provider responses, and checks conflicts before saving through Bahmni's existing appointment endpoint. Focused tests cover the edit request, service/type/location changes and permission boundary. Bahmni's conflict endpoint returns HTTP 204 for a clear slot; the service normalizes its empty response to an empty conflict map. The signed-in local calendar and booking form loaded on 26 September 2026, but the schedule has no appointments, so populated-card behavior and backend writes remain unverified. The legacy calendar's provider editing, provider response, recurring cancellation, teleconsultation and time-slot workflows still need parity.
- The React appointment list now asks for a check-in time before sending the legacy `CheckedIn` status request, and booking or status changes refresh the list, calendar, and summary queries. Focused tests cover the request time and cache refresh, and the authenticated local appointment list loads with its live service, provider, and location filters. The demo has no appointments on the selected day, so the populated check-in form and backend status write remain unverified; the legacy appointment link stays in place.
- The React appointment service list opens an API-backed service detail form. Local read-only QA loaded all six services and opened one service with its name, duration, speciality and color. Users without edit privileges see "View service" and disabled fields. The form includes basic service settings and weekly availability. No service save was sent to the shared demo, so write behavior and role-specific access still need isolated verification. Keep the legacy service editor available.
- The service editor now loads Bahmni's attribute-type catalog for both new and existing services, supports typed attribute values and required/multiple-value rules, and edits service types when the existing appointments configuration enables them. Before voiding an existing service type it checks Bahmni's future-appointments endpoint, as the legacy editor does. The shared demo backend returns 404 for the newer attribute-type catalog, so only that response falls back to no catalog while retaining existing service attributes. The read-only service form still loads locally. These controls have model/API tests, but the demo role cannot save and its configuration disables service types. No write or enabled-service-type UI path has been verified against a backend; the legacy service editor remains available.
- The React patient-stay preview offers admit, transfer, and discharge controls behind `app:adt` and `Assign Beds`. It reads the configured default visit type, current visit, assigned bed, available beds, encounter type IDs, and the configured ADT note concept. The Standard configuration's text note can be sent with the encounter; unsupported concept types block saving and direct staff to the legacy screen. The save path checks the current visit, assignment, and target bed again immediately before sending a request. Mocked tests cover request order, visit conversion, movement notes, transfer, discharge, occupied-bed rejection, changed-stay rejection, unsupported note concepts, and partial assignment failure. Local browser QA opened and canceled the transfer selector without saving. Isolated end-to-end write verification and other ADT actions are still missing, so this is not release-ready and the legacy IPD link stays in place.
- During legacy flow inspection, selecting "Continue with current Visit" immediately saved an admission for synthetic patient `ABC200000` and assigned bed `GW1-01`. The legacy UI gave no second confirmation. The resulting visit and bed were verified read-only, and no further legacy writes were made. This shared demo state should be reset or reviewed before using that patient for a public demo.

- `/bahmni-v2/clinical/inpatient/:patientUuid` follows the legacy IPD patient route's patient, active visit, visit summary, and bed reads. Before the synthetic admission noted above, the patient showed an OPD visit with an admission record but no assigned bed. The legacy screen still offered Admit, so patient-list classification and action availability must not be treated as equivalent. The React action path is implemented but not release-ready; the legacy route remains operational.
- `/bahmni-v2/clinical/inpatient` reads the same four search tabs and privilege rules as the legacy IPD screen. Three status tabs use Bahmni's SQL search with the signed-in login location and practitioner; All uses the existing patient search. Before the synthetic admission, the local demo showed zero To Admit, one Admitted, and zero To Discharge patients, and the admitted row opened the React patient-stay page. Each list reports its own loading or error state. Keep the legacy home link until all inpatient writes have isolated end-to-end tests.
- `/bahmni-v2/clinical/beds` reads the legacy `admissionLocation` endpoints behind the `app:adt` privilege. The signed-in synthetic demo showed Emergency, General Ward and Pediatric Ward; General Ward had two rooms and eight available beds. Selecting a room and bed displayed its live number, status, type and tags. The React editor now uses the legacy `bedTag` and `bedTagMap` APIs behind `Edit Bed Tags`, checks the bed's tag mappings immediately before saving, and refreshes the ward afterward. Five mocked tests cover add/remove, stale tags, unavailable tags, retired tags, and partial failure. Local browser QA opened and canceled the editor; the demo's tag catalog was empty, so a populated editor remains unverified. No tag writes were sent to the shared demo. Bed assignment still requires the patient-stay action, and isolated end-to-end verification is pending before switching the legacy IPD link.
- The local development proxy now rewrites upstream cookie domains to its loopback host. Bahmni's `reporting_session` cookie is present, and the React My Reports queue successfully returned an empty list. Report generation, download and deletion still need isolated synthetic end-to-end checks, so the home tile stays on the legacy route.
- `/bahmni-v2/admin/csv-export` now searches the live OpenMRS concept API and enables the existing Bahmni concept-set export endpoint only after a result is selected. The local synthetic demo returned matching concepts and opened the export URL. File contents and permissions still need verification before switching the Admin tile.
- `/bahmni-v2/admin/audit-log` now uses the live OpenMRS audit-log API behind the existing Admin privilege gate. The local synthetic demo returned 50 events from the selected date and the next page began with event 51, matching the legacy Audit Log. Date, time, username, patient ID, and empty-page behavior have automated coverage. This remains a preview route until role-specific permission and legacy parity checks are complete; the legacy tile stays in place.
- `/bahmni-v2/admin/csv` now offers the 11 legacy import types, multipart file submission, per-file progress and cancel controls, and the live import-status endpoint. The local synthetic demo returned an empty recent-import list. Upload requests are covered by a mocked test, but no file was submitted to the shared demo; a disposable isolated environment is still needed to prove backend writes and error-file downloads before switching the legacy tile.
- `/bahmni-v2/admin/order-sets` now reads the legacy Bahmni order-set API. The local synthetic demo returned an empty list. The React editor loads the five live order types and drug-order configuration, filters concept search by the selected order type, and exposes the legacy dosing template after concept selection. Local browser QA confirmed the concept suggestions and dosing options. Create, edit, and retire requests are implemented against the legacy API, with save serialization covered by a mocked test. No writes were sent to the shared demo. A disposable environment with populated order sets is required to verify saved records, editing, retirement, and role-specific access before switching the legacy tile.
