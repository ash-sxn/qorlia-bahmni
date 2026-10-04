# Qorlia React frontend backend readiness

## Latest condition-inactivation candidate

New encounter creation and condition inactivation now share one EncounterBundle
transaction, matching the additional FHIR extension's bundle-local Condition
reference handling and returned-resource contract. The existing matched encounter
path remains one transaction. Missing condition IDs are rejected before writing;
unexpected acknowledgements never trigger a standalone create or automatic retry.
Service/bundle tests passed 46 checks in India and US Pacific time, plus lint,
service TypeScript checking and library build. Native condition create/inactivate,
permission boundaries and rollback remain unverified; this is not full clinical
save parity. See the latest feature-ledger checkpoint.

Local HTML navigation to login/home returns 200. A generic Accept-header HTTP
probe receives 404 intentionally and must not be treated as browser failure.
The signed-in React home was also verified in the actual review browser.

## Latest diagnosis-history failure verification

The diagnosis editor now distinguishes failed history reads from no matching
concepts, blocks additions until both histories are available, and preserves
retained drafts without crashing on missing condition data. Condition conversion
is disabled while that history is unavailable without claiming a known duplicate.
The existing component suites passed 71 tests and nine snapshots in India and US
Pacific time, plus lint, clinical type checking and the clinical library build.
The build retains existing upstream eval/large-bundle warnings. These are
component checks, not a native diagnosis-save or condition-lifecycle proof.
The isolated seed's missing V2 add privileges were not aliased or expanded.

## Latest wide report layout verification

The native converter now applies derived padding/font styles to explicit native
columns as well as default columns. Automatic static-title widths follow heading
word metrics; configured widths, character counts, dynamic headings, value
formatting and explicit report/template split policies remain unchanged. Default
printable bands prevent ordinary row splits. Native checks passed 46 controller
and 49 upload assertions plus six formats, byte-identical CSV and retained XLS
template contents. A 65-row, three-page fixture was inspected on every page after
a failing row-boundary regression exposed and corrected a split patient row.

The React direct HTML result appeared after the earlier browser observation,
with updated padding/9-point dense-table typography, full headings and the
synthetic visit/date range. No duplicate request or Run now control change was
made. One new queued PDF was downloaded and rendered; its SHA-256 matched native
stored bytes. Independent SQL retains nine Completed reports and sixteen audit
attempts. No report deletion, clinical write or public deployment occurred.

This proves the observed wide Visit Report and native fixture, not every report,
font, crosstab, paper size or recovery case. Confirmed React deletion and broader
workflow parity remain open. See the newest feature-ledger checkpoint.

## Latest native report design verification

The isolated Reports converter now derives Qorlia header/table styles without
mutating native shared templates or changing SQL, calculations, CSV data structure
or supplied XLS sheets. It can read the same operator-mounted branding JSON as
the frontend (name/primary only), with validation and safe defaults. Native checks
passed 46 controller and 49 upload assertions plus all six formats, including
two-row colors, literal HTML escaping and retained spreadsheet values/types and
template styling. Only private Reports restarted after a rollback snapshot.

Actual React populated HTML generation visibly retained synthetic visit data and
the configured date range with green/white headings and sage row styling. One
queued PDF completed and downloaded with a native-storage SHA-256 match. Independent
SQL retained all seven earlier reports plus this PDF and fourteen RUN_REPORT audits.
PDF extraction/rendering retained data and credit, but several wide-table header
words still split and body cells remain tightly spaced. Layout acceptance,
crosstabs, other definitions and Unicode/font embedding are not complete. No
clinical/shared-demo/production deployment or report deletion occurred. See the
newest checkpoint in FEATURE_PARITY.md; older output-branding gaps are superseded
only for the styles verified here.

Updated 5 October 2026. The local review at `http://localhost:3002/bahmni-v2/login` uses the isolated synthetic staging backend. The earlier port 3000 review uses the existing synthetic demo backend at `demo-bahmni.qorlia.com`. No redesigned frontend or backend upgrade has been deployed there. This is development evidence, not a production release gate.

## Latest native exporter and browser Custom Excel verification

The previously broken custom XLS exporter now passes with a checksum-pinned
DynamicReports 6.12.1 / JasperReports 6.21.5 / POI 5.4.1 dependency set in private
Java 11 staging. The source manifest and install/fetch scripts are public; JARs,
private configuration and report fixtures are not committed. Original libraries
remain recoverable. This compatibility result does not establish production
dependency security or every hospital template's compatibility.

Native checks passed 46 authorization/controller assertions, 49 upload assertions
and all six export formats. Actual direct and queued custom XLS retain the test
template sheet, formula and populated synthetic visit. A native check also retains
a named range and a non-executable OLE marker, not a verified real VBA project.
All six queued formats have correct MIME/bytes and 206 range responses. The queue
remains JSON after XML template libraries are added. Served files match native
storage hashes; session/ownership denials still pass.

Actual React template upload, one Custom Excel schedule and its My Reports
download passed. Independent POI inspection confirms the downloaded template
label/formula, generated Report sheet and synthetic patient identifier. SQL
retains the five original reports and two custom test reports, with eleven audit
events. Only private Reports restarted after its rollback backup. No clinical
service recreation, shared-demo change or public exposure occurred.

Reports confirmations identify request time, format and filename so identical
report names are distinguishable. Cancel retained seven rows and eleven audit
events and restored focus; narrow and desktop rendering passed. Confirmed React
deletion is still pending. Reports checks passed 56 tests in both India and US
Pacific time. Translation/client checks passed 49 tests: only a missing optional
override is quiet, not required-file/authentication/server failures. The actual
browser reload kept bundled labels and the queue without captured console errors.
Changed-source lint, both type checks and dependency-first builds passed.
Existing duplicate-mock and large-bundle warnings remain release work.

React confirmed deletion, configured templates/real macros, other definitions,
failure/concurrency/restart recovery, output design and CSRF/method migration
remain open. See the newest feature-ledger checkpoint rather than treating the
older broken-exporter observations below as current.

## 5 October direct Reports and authorization checkpoint

### Later native lifecycle and XLS upload verification

Native limited-role/per-report verification passed 27 checks, including
revocation, fail-closed invalid configuration, permission restoration and actual
synthetic row/file deletion. Independent SQL retained the five original reports
and ten audit events; the test user was retired and the original catalogue was
restored exactly. These checks supersede the native lifecycle gaps below, not
React browser deletion proof.

The reviewed native upload controller now validates XLS content, safe filenames
and confined unique writes, preserves original bytes and returns UTF-8 filenames.
It passed 49 native checks alongside the 33 existing authorization checks. Six
actual HTTP upload assertions passed, including Hindi and invalid-file/session
boundaries. The upload fix runs only in isolated staging after a Reports-only
backup/restart. Existing multipart limits and global authentication remain.

Actual direct Custom Excel generation returned 500 because JasperReports 6.0.0
requires HSSFColor$WHITE, absent from the pinned POI 5.2.1 library. No scheduled
record was added. This runtime compatibility issue, native template/formula and
macro preservation, browser template upload/deletion, and scheduled Custom Excel
remain open. Do not label this format working on the strength of upload tests.

### Later native authorization correction

The Reports controller correction is now running only in isolated staging.
Authenticated owner checks cover queue, schedule, download and deletion;
configured report privilege checks cover schedule/direct/download/deletion;
authorization errors fail closed. The direct-denial continuation and queued
duplicate-extension defects are corrected. Global session validation remains
enabled. Native controller checks passed (33); actual HTTP checks passed (16),
including a Reports-only synthetic user's denied cross-user access. The check
account was retired, not left active. Independent SQL retained the original
five Completed report rows and ten report-run audits. A Reports-only rollback
backup preceded recreation; no clinical container, public route or production
service changed. Source and reproduction notes are in `runtime/reports`.

This supersedes the explicit ownership implementation gap below. Live restricted
report definitions, actual deletion, templates, concurrency/recovery and output
design remain unverified. Controller tests do not establish those live paths.

The populated Visit Report now has actual React Run now proof for HTML and native CSV/PDF/Excel/OpenDocument downloads. HTML and CSV retain the synthetic visit; the other files' native signatures were checked, not their complete direct-path document layout. Independent SQL shows five new audit attempts and no new scheduled records. Direct filenames have a single extension. The detailed [parity ledger](FEATURE_PARITY.md) records the evidence and its limits.

Inspection of the pinned Reports application's compiled controller and interceptor identified missing explicit owner checks in queue/download/deletion methods, no per-report schedule check, a fail-open queue predicate on authorization exceptions, and generation continuing after direct privilege denial. Session/global reporting privilege checks remain intact, but are insufficient proof of those narrower boundaries. Cross-user/limited-role runtime probes and server-side corrections are the next priority; do not release Reports on the strength of its UI filters.

The local app was not down: login/home HTML navigation returns 200. Non-HTML probes are deliberately not rewritten by the development history fallback. A regression now covers this distinction; no restart or authentication relaxation was needed.

## 5 October native export-format readiness checkpoint

The actual React Visit Report queue now generated PDF, Excel and OpenDocument in addition to HTML/CSV. Browser downloads retained the app route; native SQL confirmed Completed state and filenames. Read-only PDF extraction/rendering, Excel workbook import and ODS MIME/XML checks retained the expected synthetic visit. All three downloads matched native storage hashes. Native audit records contain all five request attempts. The separate HTML tab displays its populated output.

This proves those formats for this synthetic report, not every report definition, custom templates or role-specific download ownership. Native templates remain unbranded, some labels wrap poorly and download filenames repeat the extension. Direct Run now, custom XLS, deletion, failed-job/restart behavior and separate OpenELIS/Odoo datasets remain pending. Reports tests passed again (50) in India/US Pacific and its type check passed. No production/shared-demo changes occurred.

## 5 October native Reports readiness checkpoint

Native Reports is now running privately in the existing isolated staging network. The clinical backup `openmrs-before-reports-20261004T191744Z.sql` was saved before the image's two migrations; its SHA-256 is `de0cdcfae55ef590c169a478af94e3355fb247076f5894c7ff835e04269adebf`. The separate `bahmni_reports` schema and persistent generated-output volume belong only to staging. The existing proxy was reloaded after its syntax check, preserving its private review address. No production or shared-demo container was changed.

The public AGPL-covered startup adapter disables shell tracing/debugging and uses the original bundled changelogs and application. The reporting-session bridge preserves session validation and HttpOnly/Secure/same-site cookies. Anonymous and invalid-session queue requests redirect to login. These checks do not establish limited-role or report-owner authorization.

Authenticated React scheduling produced Completed HTML/CSV Visit Reports with the expected synthetic QA visit. Independent database records, native audit entries and the downloaded CSV/storage hash match passed. Both test reports remain after browser cancellation of removal. Frontend checks passed (50 tests in India/US Pacific, type check and build). Native PDF/Excel/ODS/templates/deletion, direct Run now, failure/restart recovery and server-side ownership are still open. OpenELIS and Odoo report sources are deliberately unavailable in this staging backend. This supersedes the missing-service gap below, not complete reporting or clinical readiness.

## 5 October Reports readiness checkpoint

Report-name requests, configured formats/date ranges, multipart XLS-template controls, timestamp/date grouping, stale/processing deletion guards and shared report-run audit logging now have frontend regression coverage. The full Reports suite passed 49 tests in India and US Pacific; shared audit-service checks passed 8. Reports/service type checks and dependency-first builds passed. Native browser review loaded the real 13-report catalogue and selected the correct previous-month dates. This is not generation or queue-write proof.

The private staging Compose project still has no Reports service. Its native queue is unavailable and the React page reports that failure explicitly. Inspection of cached official `bahmni/reports:1.1.0`, digest `sha256:3af8e248ae7603126fecb1efacb583e8b6b2bd4e9df0254fc198e8e4a2d63877`, confirmed two requirements before startup:

- The image runs Liquibase migrations on both clinical and report schemas. Back up isolated staging and review migration/schema permissions first. The upstream migration script uses shell tracing with database arguments; do not expose its credential-bearing logs in review output.
- Its registered authentication interceptor requires `reporting_session`, verifies that session through OpenMRS and checks reporting privilege. The [official proxy](https://github.com/Bahmni/bahmni-proxy/blob/main/resources/bahmni-proxy.conf) issues that HttpOnly cookie from the OpenMRS session. The private staging proxy has not yet implemented this bridge. Do not copy session tokens through frontend JavaScript or disable the interceptor.

Next native checks: private service startup, anonymous and limited-role denial, report privilege/queue ownership enforcement, synthetic generation, scheduling/read-back, completed-file contents, XLS upload and deletion. Other-schema OpenELIS/Odoo reports cannot be claimed working against OpenMRS-only staging. No Reports runtime, database or public route was changed during this checkpoint.

## 5 October confirmation focus checkpoint

The shared modal preserves Carbon's safe initial focus and restores its opening button or link on dismissal, including callers that unmount it and StrictMode replay. Populated Programs and Patient Documents browser checks verified Cancel/Stay, Escape, Close and keyboard reopening. No write requests occurred; the synthetic document remained a local pending file and was discarded without saving. Regression coverage uses the real shared/Carbon dialog, not a component mock.

Focused widget/conditions tests passed (57), Programs/result-editor tests passed (56), and document-section tests passed (30). Widget, clinical and document type checks and dependency-first builds passed. This supersedes the focus gap below, not full accessibility, Programs parity or release readiness. Other configured workflows, role/error checks and separate products remain unfinished. Production and the shared demo are unchanged.

## 5 October Programs browser checkpoint

Browser attribute saves now have full reload and independent native REST proof: concept changes, Boolean false/true, retrospective date creation and clearing retained unrelated attribute IDs/values and voided-date history. A backdated state save returned 200; confirmed current-state removal returned 204, reopened the prior state and retained removed-state history. Cancel sent no DELETE and Escape dismissed the in-page dialog.

A separate synthetic browser enrollment returned 201, completion returned 200, and full reload showed the configured outcome and retrospective completion in Past programs. A too-early date disabled submission without a write. Confirmed enrollment removal returned 204; direct native REST retained original attribute/state IDs and values as voided history with dates, outcome and reason, while leaving the patient active. Native search omits voided enrollments, so the verifier reads the independently recorded UUID without repeating writes. Enrollment defaults also respect the legacy `defaultProgram` configuration without clobbering explicit choices; this configuration variant has automated, not native staging-fixture, evidence.

Page/service tests passed (108) in India and US Pacific time, sibling widget tests passed (60, two snapshots), all three type checks passed, and service/widget/clinical builds passed. Existing eval/import/mock/bundle warnings remain. Remaining gates include other datatypes, configured defaults/multi-workflow, concurrent edits and limited-role backend enforcement. Browser dialog dismissal currently loses focus instead of restoring its trigger; this accessibility correction is still pending. No production/shared-demo changes occurred.

## 4 October Programs attribute checkpoint

Concept prefill and unchanged-value detection now cover all three supported concept datatypes and their UUID/label/object response forms. Missing configured answers block the edit rather than clearing existing data; invalid selections cause no POST. The legacy hydrated-object serializer and modern UUID serializer remain distinct.

Isolated staging returns primitive Boolean attributes. The model, editor and both shared summary consumers now retain booleans and numeric zero, exclude voided values and avoid rewriting unchanged scalars. Actual shared-service edits saved a new concept selection, true and a date, then cleared only the date. Independent native REST with `includeAll=true` retained the date's voided history and all four other attribute UUIDs/values. The corrected private read-back assertion did not replay successful writes.

Page/service checks passed in India and US Pacific time (100), sibling Programs widget checks passed (60, two snapshots), and clinical/service/widget type checks and library builds passed. Existing eval/import/mock/bundle warnings remain. The exact local login API returns 200 and authenticates the staging seed, but browser focus commands still time out. Populated browser edits, remaining datatypes, multi-workflow, concurrency and limited-role enforcement are still release gates. No production/shared-demo changes occurred.

## 4 October retrospective Programs date checkpoint

The state and completion controls now accept local calendar dates between the latest non-voided state and today. Shared preflight re-reads the enrollment and rejects invalid or out-of-range dates before posting; existing sibling state actions retain their today default.

An actual-service isolated integration check saved September 25 state progression and September 26 completion for a synthetic September 24 enrollment. Independent REST read-back preserved both state boundaries, the configured outcome and all three attribute UUIDs/values. Earlier invalid dates produced no POST. This is service/API proof; populated browser date saves remain pending because review-tab focus commands time out.

Page/service tests passed in Asia/Kolkata and America/Los_Angeles. Clinical/service type checks and library builds passed; existing eval/bundle warnings remain. The fixture's initial legacy hydrated-object payload was rejected without creating an enrollment. Using the modern ConceptDatatype UUID value corrected the fixture, not application code or staging metadata. No production/shared-demo changes occurred.

## 4 October Programs lifecycle checkpoint

React browser TB enrollment and state update returned HTTP 200 and persisted after reload. Isolated staging returns `allowedStates`; the missing metadata described below applies to the older shared demo. Native REST independently retained the synthetic patient/enrollment link, enrollment date, configured attributes and state history.

Direct API current-state removal returned 204 and completion with Cured returned 200. Read-back preserved attribute IDs/values and voided state history; a React reload showed the completed record in Past programs. These are not browser removal/completion proofs. No enrollment void write was performed.

Removal now uses the existing in-page Qorlia confirmation modal. Shared service preflight rejects stale, completed or voided enrollments/states and next states absent from current server metadata. Page/service/widget checks passed (83 tests); page/service checks also passed in America/Los_Angeles. Clinical type checking and clinical/service builds passed. A stale native popup prevented further browser input; modal UI save checks remain pending, together with retrospective dates, multi-workflow and limited-role enforcement. The server's numeric Program ID rule was not changed.

## 4 October attachment-format checkpoint

Synthetic PDF/JPEG/GIF uploads and a Radiology Order result save returned HTTP 200. Full reload and independent native REST reads retained those files, the existing PNG and original note with correct patient/order links. Authenticated responses matched storage hashes and MIME types; anonymous reads returned 403. JPEG/GIF rendered, and the PDF's original bytes were preserved. The in-app browser's native PDF viewer is blank, so a Download PDF link now provides a verified byte-identical native download. This supersedes the pending PDF/JPEG/GIF checks below, not all media or workflows.

WebP is rejected before upload in the shared processor and is no longer offered by the result editor. The isolated backend probe returned 400; Bahmni's [ImageIO implementation](https://github.com/Bahmni/bahmni-core/blob/master/bahmnicore-api/src/main/java/org/bahmni/module/bahmnicore/service/impl/PatientDocumentServiceImpl.java) names PNG/JPEG/GIF as supported images. No silent clinical-image conversion was added. Both upload screens now accept an unset size setting without returning undefined query data or treating the missing limit as zero. Focused editor/API/page tests passed (60), upload-service tests passed (11) and document-widget tests passed (37). Real backend size limits, populated limited-role checks, specialized forms and broader workflow parity remain pending.

Clinical/widget type checks and clinical/service/widget library builds passed, with existing eval/import/bundle warnings still outstanding. A watched dependency rebuild briefly removed generated CSS; dependency-first rebuilding restored it. A fresh local login entry reached location selection and React home with no console errors. The private backend still responds normally.

## 4 October protected attachment checkpoint

Radiology text/PNG browser create, a second attachment save and removal of one saved attachment now pass real HTTP 200 saves plus reload/native REST checks. The note and retained image keep their observation IDs; the removed image retains voided history. This supersedes the radiology text/image gaps recorded in the earlier checkpoints, not the remaining forms/formats or workflows.

Isolated staging was missing the separate patient-documents service. Its existing pinned upstream image is now used privately with read-only staging document volumes. The `/openmrs/auth` route follows the [official Bahmni proxy](https://github.com/Bahmni/bahmni-proxy/blob/main/resources/bahmni-proxy.conf), retaining session and clinical/document-app privilege checks. The MPL adapter in `runtime/patient-documents/njs.js` adds path validation and closed failure handling. Native checks, the actual image's Nginx check, authenticated file hash/dimension reads, anonymous denial (403), blocked direct/internal paths (404) and traversal rejection (400) passed. File responses are private/no-store and nosniff. No public exposure, shared-demo change or production deployment occurred.

The 57 focused Orders/editor/API tests passed in India and US Pacific time zones. Partial upload failure preserves successful uploads; attachment removal and restoration preserve unrelated values/history. PDF/other formats, real size-limit/error responses, limited-role verification and specialized forms remain pending. Full React workflow parity is still unfinished.

## 4 October isolated browser checkpoint

- Actual browser sign-in, login-location selection and React home navigation passed. A dropped private development connection caused the reported sign-in availability failure; restoring that connection restored authentication. The private review connection now retries after a disconnect, with a forced-disconnect recovery check passing. Staging remains internal-only.
- The development proxy removes the Basic authentication challenge header only from OpenMRS REST/FHIR HTTP 401 responses. The status still reaches the React login handler; this prevents a second native browser login prompt without disabling authentication or changing other services' challenges. A regression test covers that boundary.
- For `QorliaQA StageClinical Synthetic` (`QST910001`), the React Vitals form and Done action saved pulse 78, oxygen saturation 98 and respiratory rate 16 through an HTTP 201 `EncounterBundle` transaction. The saved observations and form history persisted after a full browser reload.
- History and Examination opened, its conditional custom-complaint field appeared after selecting Other generic, and its save event rejected missing required data. After completing the fields, Save Form and Done submitted an HTTP 201 transaction. History, complaint text, duration and units persisted after reload. Editing the saved history submitted another HTTP 201 transaction retaining the same consultation UUID and preserving the other form fields; the edited text was re-read.
- Allergy creation and severity/note editing returned HTTP 201 transactions and persisted after full reloads. Removing one reaction used the existing void-and-replace transaction because the backend appends reaction entries on ordinary updates; only the retained reaction was re-read. Missing severity/reactions and duplicate allergen selection were blocked before a write. The shared formatter now displays coding-only allergen/reaction names and deduplicates them, with a regression test that failed before the fix.
- Synthetic medication creation, editing and stopping returned HTTP 201 transactions and persisted after full reloads. The create retained its drug, dose, frequency, duration, route, instructions, calculated quantity and note. Editing created a linked prescription revision, updating duration and recalculating quantity. Stopping removed the current order from Active & Scheduled while retaining its stop date, reason and note in All history. Missing dosing fields or stop reason were blocked before a write. Other prescribing modes still require verification.
- Browser investigation ordering returned HTTP 201 for consultation `52ccef4c-4c98-4548-8621-f5ff9368cb21`. Independent REST reads returned HTTP 200 for CBC `f2ab6bbf-9d97-4384-a94c-1fcd8078ef69` (Lab Order, STAT), chest X-ray `f0e8bdae-7751-4563-a756-87959b51016e` (Radiology Order, ROUTINE) and dressing `10eabb61-63a7-4d8d-b476-31500bc44a5b` (Procedure Order, ROUTINE). All retain their explicit synthetic notes and the same consultation link.
- Standard's Orders entry uses `app:orders`; correcting the React gate does not add any user privilege. The urgency control now reflects stored draft priority, and order timestamps use the shared formatter. The result-save path uses the existing in-page confirmation modal, with automated cancel, save-failure, lost-permission and successful-write/failed-refresh checks. The old native prompt is gone; its stale draft is rejected by the concurrency guard. The synthetic Procedure browser check below passed Keep editing and confirmed create/edit saves. Direct API radiology-result create/edit persisted an explicit synthetic note, with independent REST checks of its patient/order link and voided original note history. Radiology text and attachment browser saves still require proof. Focused tests passed (160 tests, two snapshots), clinical type checking passed, and the clinical library built with the existing upstream form-renderer eval warning and large bundles.
- The shared metadata reader now converts legacy plain-text event scripts to UTF-8 base64 for the installed form renderer while preserving already encoded scripts. This applies to nested control events and all callers, with a regression check for Unicode, encoded events and non-event fields. No script is executed during normalization.
- Numeric, coded, Date, Datetime and Boolean order-result controls now use existing concept metadata and shared helpers. Configured coded multi-select members store each answer as a separate observation, preserving saved IDs/history through removal and unsaved restoration. Required validation checks the active selection group rather than each placeholder. Automated checks cover zero/false, numeric ranges, answer UUIDs, 255-character notes, required fields, future-date rules, valid calendar dates, nonexistent local times, clearing saved values, read-only permissions and unsupported-rule gates. The 56 editor/API/Orders page tests passed in Asia/Kolkata and America/Los_Angeles; clinical type checking and build passed. Specialized/conditional/computed/repeated/autocomplete rules and root multi-selects remain read-only. The local session API authenticates the seed account through port 3002; login/home HTML also returns HTTP 200.
- Staging lacked a Procedure fulfillment form, so seven clearly labelled QA concepts were created there only, leaving existing forms unchanged. Synthetic Date/Datetime/Boolean/Numeric/Coded result creation and editing returned HTTP 200. Independent Bahmni/native REST reads confirmed the edited time, true answer, numeric 12, configured Yes answer UUID and correct patient/order association. The cleared Date is inactive, and original Date/Datetime observations remain voided with their original values. Native REST expresses Boolean results as configured True/False concepts; Bahmni returns actual booleans. The test adapter was corrected after successful writes without replaying them.
- Real API testing rejected ISO Datetime with HTTP 500; a read confirmed no Procedure result had persisted before retry. The shared result serializer now follows [OpenMRS 2.6.15](https://github.com/openmrs/openmrs-core/blob/2.6.15/api/src/main/java/org/openmrs/Obs.java) and the [legacy datetime control](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/ui-helper/directives/datetimepicker.js): calendar Date as `yyyy-MM-dd`, local minute-precision Datetime as `yyyy-MM-dd HH:mm`. This does not claim UTC-instant or second-precision support. Direct API writes/read-back are verified; browser result saves and attachments remain unverified.
- The later synthetic Procedure browser check saved Date `2026-10-03`, Datetime `2026-10-03 15:27`, false, zero and two coded selections with HTTP 200, then removed one selection with another HTTP 200. Full reloads and independent Bahmni/native REST reads confirmed persistence, patient/order association, unchanged UUIDs/values for retained fields and voided history for the removed answer. This verifies this QA form's browser result-save path, superseding that part of the previous bullet, not attachment handling or all form configurations. Multi-select metadata was enabled only for the QA field after an exact-file backup; existing clinical fields and production metadata were not changed.
- Orders configuration was coming from the browser's old HTTP disk cache. The development proxy now sends `Cache-Control: no-store` for backend configuration, not unrelated API responses. Both proxy boundary tests pass. A temporary cache bypass was used once and reset; normal reloads then loaded the current controls. Local home and results rendered without captured console errors after the restart.
- Staging's duplicated legacy/CIEL diagnosis mappings caused flowsheet HTTP 500 responses. Only the nine exact conflicting reference mappings were removed after a recoverable backup, preserving concepts and records. Restarting only isolated OpenMRS cleared its mapping cache. The real flowsheet API now returns 200 and displays the saved pulse and respiratory rate. Other initializer metadata errors still need targeted verification.
- Narrow-screen form cards and action controls no longer overflow their container or put the save footer outside the viewport. This is a shared layout correction, not evidence that every form control has completed visual and accessibility review.
- The shared header now uses Carbon's explicit mobile menu rather than a hover rail. Browser checks confirmed section selection, overlay click and Escape dismiss it; clinical content uses the full narrow-screen width. Navigation text inherits the branded foreground color. A separate desktop-sized tab confirmed the expanded 256-pixel sidebar, hidden mobile button and readable prescription history. Header/layout checks passed (58 tests), including a mobile regression that failed before the fix and retained desktop-rail coverage.

These are populated browser proofs for two observation forms, allergy creation/editing/reaction removal, medication creation/editing/stopping and investigation-order creation, not full consultation parity. Other prescribing modes, diagnosis, order changes/results, attachments, permissions and failure-path verification remain.

## 1 October shared-demo synthetic workflows

Signed-in browser testing exercised the React screens, checked their API responses, and re-read saved data. The clearly labelled test patient is `QorliaQA OctTwo Synthetic` (`ABC200013`).

| Workflow                              | Backend evidence                                                                                     | Result                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient registration and profile edit | OpenMRS patient REST write: 200; visit creation: 201; registration encounter: 200                    | Patient ID, demographic/contact fields and visit persisted. Profile reads and writes now share the legacy REST representation instead of losing phone details through FHIR. |
| Patient documents                     | Document upload and visit-document write: 200; subsequent reads: 200                                 | A synthetic screenshot, note and document type persisted after reload. Saved edit/deletion and other media formats remain unverified.                                       |
| Appointments                          | Conflict check: 204; create/edit/status writes: 200                                                  | Service, location, date/time and notes persisted. The test booking was cancelled. Provider editing, check-in and recurring workflows still need verification.               |
| TB program                            | Enrollment: 201; attribute edit: 200; subsequent native full-representation reads: 200               | Numeric test program ID and doctor-in-charge attribute persisted. The server's separate program-ID rule is still numeric.                                                   |
| Inpatient stay                        | Admission, bed assignment, transfer and discharge: 200                                               | Transfer persisted after reload. Discharge released both test beds. The IPD visit remains active, matching the legacy discharge flow.                                       |
| Operation theatre                     | Create: 201; edit, actual-time record/clear, single-surgery cancellation and block cancellation: 200 | The edited note and recorded times were re-read. The test surgery is cancelled and its block is voided, releasing the theatre reservation.                                  |

## Backend compatibility gaps

- The shared demo serves legacy Standard configuration. The local proxy supplies the official Standard V2 files pinned to `f39d186eb9e610d5f219d44ecc5e14b3e615c0db`. It is a review candidate, not evidence that every concept, form or privilege matches. Fallbacks apply only to missing configuration, not authentication or server errors.
- The isolated seed's `superman` roles lack the V2 `Add Diagnoses` and `Add Conditions` privileges. Its existing `Edit Diagnoses`/`Edit Conditions` privileges do not establish equivalent authorization. The React diagnosis entry gate remains intact; matching role metadata and role-specific API enforcement must be verified before diagnosis save testing. No blanket privilege alias or client-side bypass was added.
- Clinical consultation saving calls `/openmrs/ws/fhir2/R4/EncounterBundle`. The shared backend returns 404 (unknown resource). Its installed `fhir2` version is 2.1.0; `fhir2Extensions` is not the additional module implementing this resource. The official [Bahmni additional FHIR extension](https://github.com/Bahmni/bahmni-module-fhir2-addl-extension) must be evaluated with matching dependency versions in an isolated staging backend. Installing its newer dependency set into the shared demo is not an approved or verified upgrade. Do not replace the transaction with independent browser writes that can leave a half-saved consultation.
- FHIR `DocumentReference`, `Appointment` and `ImagingStudy` are unavailable on this backend. Documents and appointments use their existing Bahmni APIs; some legacy medication reads are read-only. Missing imaging enrichment is not proof of a PACS failure.
- TB's `ID Number` attribute metadata still uses `[0-9]*`. `ABC200013` is not accepted as its program ID. This needs an approved metadata change, not a global frontend override. The older shared-demo enrollment responses omit `allowedStates`; the UI reports that next-state selection is unavailable rather than inventing a transition. Isolated staging returns the metadata and passed the state-save checks above.
- OT write payloads must exclude GET-only bed, observation and resource metadata fields. This is covered by a regression test for active and retained cancelled appointments. One rejected HTTP 400 edit nevertheless persisted its note on the older module. Re-read after ambiguous failures before retrying. Supported writable fields are documented in the official [surgical appointment resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentResource.java) and [attribute resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentAttributeResource.java).

## Release boundary

An isolated staging backend uses the official public demo seed, separate database/file volumes, an internal-only network and resource caps. It does not copy the shared demo or hospital data. Its frontend uses a separate loopback hostname/session. The pinned image contains FHIR2 2.5.1 and the additional extension 1.0.0; its bundled core is a snapshot, so staging instead mounts the checksum-verified OpenMRS 2.6.15 WAR specified by the official [Bahmni 1.2.0 release definition](https://github.com/Bahmni/openmrs-distro-bahmni/blob/1.2.0/distro/pom.xml).

### Isolated staging API checkpoint

- OpenMRS session and FHIR capability APIs return 200. FHIR2 and its additional extension report `started: true` through the module API.
- A direct API `EncounterBundle` transaction saved one consultation and a synthetic weight observation for `QorliaQA StageClinical Synthetic`. Subsequent FHIR and REST reads returned the weight and its consultation/visit association.
- A second transaction containing an invalid observation returned 400. Re-reading the test patient's encounters and observations confirmed unchanged counts, with no orphan encounter left behind.
- These direct API checks were not browser save proof. The 4 October checkpoint above adds populated observation, allergy and medication browser save/read-back evidence; it does not establish complete clinical parity.
- Metadata initialization completed but logged concept-import and location-attribute errors. Startup success does not establish that every Standard form, concept or workflow is available; those mappings still need targeted checks.

The production frontend build and local login tests pass. Bundles and service-worker precaching remain large (40.4 MB across 113 precached URLs); build success is not a performance release gate.

`/bahmni-v2/login` and `/bahmni-v2/home/` are the local review entry points. The local legacy home URL redirects there. Implemented module tiles stay within React; full legacy tools remain available where parity is incomplete. Check the detailed [feature parity ledger](FEATURE_PARITY.md) before switching production defaults.

Still needed: the remaining consultation transaction components on staging, specialized order-result forms and upload boundaries, remaining program lifecycle browser writes/retrospective dates, reports generation/download/deletion, administrative imports and order-set writes, remaining advanced OT/IPD/appointment actions, and role-specific permission/error checks.

OpenELIS laboratory, Odoo billing, DCM4CHEE radiology and the external analytics/outreach applications remain separate products. Reskinning this React repository does not redesign them. They are the next phase after React workflow parity.
