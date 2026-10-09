# Bahmni workflow parity ledger

## 10 October Invoice Journal Items protected read checkpoint

- Signed-in invoice details now expose native journal entries in the Qorlia modal,
  including account/label, partner, dates, debit/credit/balance, original currency,
  residual/matching, taxes/grids and role-scoped analytic distribution.
- Full totals cover the entire authorised journal; ordered 100-row pages carry a
  snapshot version. Changed journals and cross-invoice cursors are rejected.
  A denied journal line fails the full view instead of silently reducing totals.
- Installed native suite: 168 tests, zero failures/errors/skips. Home: 219 tests
  in 28 suites. Types, lint, seven gateway/webpack checks, compilation and build
  pass. Actual HTTP native comparisons cover two posted invoices and one draft,
  stable reload and unchanged financial/protected records.
- Protected browser opening/reload of INV/2026/00039 show three native rows with
  INR 500 debit and credit. Hosted 83 JS/CSS chunks and source/license archive
  match; authentication, robots exclusion and raw-route denial remain intact.
  Source was packaged before this note; tester access and expiry are unchanged.
- This is journal read parity only. Narrow-screen table polish, journal editing,
  remaining Billing, clinical and separate-product acceptance are still pending.
  Production and the shared public demo remain unchanged.

## 10 October regular-invoice deduction protected acceptance

- Explicit protected browser saves produced INR 300 with deduction enabled and
  INR 500 with it disabled, each against an INR 500 synthetic order with an
  existing INR 200 posted advance. Full reload/reopen retains both results.
- Independent native reads confirm exactly two linked invoices per order,
  balanced journal entries and unpaid invoices. Payment/stock counts and protected
  existing financial documents remain unchanged. No further invoice was created
  during reload verification.
- All 83 hosted JS/CSS chunks and the secret-free source/LICENSE/NOTICE archive
  match the accepted build. Tester gate, clinical session, secure cookies, robots
  exclusion and raw mutation/mail/report denial remain intact. The archive was
  packaged before this final browser acceptance note.
- Home 206 tests and native 157 tests cover this checkpoint. Fault-injected
  browser uncertain-save recovery, first-use advance account/tax selection and
  attachment upload/save/reload still require browser acceptance. Full Billing,
  clinical and separate-product parity remain incomplete. Production and the
  shared public demo have not received the redesign.

## 10 October regular-invoice advance deduction checkpoint

- Orders with native down-payment lines now show the native deduction checkbox,
  checked by default. Unchecking explicitly warns that the new invoice can charge
  the full invoiceable amount again. Failed/uncertain saves freeze the selection
  until a successful explicit status read resets the safe default. No automatic
  financial write retry is introduced.
- The adapter passes only a strict boolean to the native regular-invoice wizard.
  Odoo still selects invoiceable ordered/delivered quantities and handles negative
  final balances as credit notes. Existing callers retain default deduction.
- Actual HTTP testing exposed the installed Bahmni invoice-creation copy reposting
  every linked invoice, failing on an already-posted advance. A targeted pinned
  override retains Odoo creation and Bahmni preparation hooks, but posts only new
  drafts under the caller's identity. Existing draft/posted advances stay untouched.
  Revalidate this override before changing upstream module versions.
- Home 206 tests/26 suites, native 157 tests (zero failures/errors/skips), types,
  lint, seven gateway/webpack checks and the development build pass. Native tests
  cover opted-out full invoicing, later advance credit-note settlement, strict input,
  stale versions and automated posting with existing draft/posted advances.
- Actual HTTP saves persist balanced invoices of INR 300 (deduction enabled) and
  INR 500 (disabled) against INR 500 orders with INR 200 advances. Configured native
  automatic posting is retained. Stale replay is rejected; payments, stock and
  protected documents are unchanged. Protected release/browser acceptance is
  pending separately. Production/public demo and full-product completion unchanged.

## 10 October advance invoice protected browser checkpoint

- Protected browser calculation shows 40 percent of INR 500 as INR 200 and
  a fixed INR 80 review. Changing the type clears the earlier review. Unsaved
  close warns; Keep editing retains the percentage and requires review again.
- Explicit browser save creates one INR 200 draft. Full reload/reopen retains
  the linked draft on its confirmed order. Independent native read confirms
  one linked invoice, balanced entries, not paid, unchanged protected financial
  documents and unchanged payment/stock counts.
- All 83 hosted JS/CSS chunks and the secret-free source/LICENSE/NOTICE archive
  match the build. Tester gate, clinical session, secure cookies, robots exclusion
  and blocked raw wizard/mutation routes pass. Link, code, expiry and production/
  public demo are unchanged. Source was packaged before this acceptance note.
- Same-tab uncertain-save recovery and first-use manager/tax selections have
  native/API and mocked UI coverage, not fault-injected browser acceptance yet.
  Optional regular-invoice advance deduction and complete Billing remain open.

## 10 October advance invoice native and API checkpoint

- Confirmed signed-in charge orders now offer percentage/fixed advance invoices
  in the Qorlia action modal. Native Odoo deposit products, taxes, fiscal mapping,
  journals and balanced Bahmni adjustments calculate the reviewed draft totals.
  The action creates a draft, not a posted invoice, payment or stock delivery.
- First-use deposit account/tax settings are scoped to the order company. Only
  accounting managers may override the income account. Review uses virtual native
  records without consuming IDs; first save creates the native global default.
  Serialised setup prevents another order saving an obsolete first-use review.
- Exact canonical request identity supports explicit retry/status recovery. The
  UI retains uncertain requests in same-tab, user/order-scoped session storage
  across reload/sign-in, freezes edits and never retries financial writes itself.
  Missing status is inconclusive; a confirmed native rejection requires review.
- Native 154 tests, Home 203 tests/26 suites, types, lint, seven gateway/webpack
  checks and the development build pass. The native limited-role test uncovered
  and fixed a restricted system-setting read without expanding financial access.
- Actual concurrent HTTP saves persist one balanced INR 250 draft; exact status
  and retry return that invoice. Fixed INR 123.45 saves separately. Changed request
  values are rejected. Preview counts and existing protected financial records,
  payments and stock stay unchanged. Native first advance adds both a section
  and a deposit order line; the verifier was corrected, not that native behaviour.
- Protected release/browser acceptance remains a separate pending gate. Native
  regular invoicing currently deducts advances; its optional deduction selector,
  bank/provider/check/PDC, POS, stock/batch, cross-module sync and full Billing/
  clinical/separate-product parity remain open. Production/public demo unchanged.

## 10 October invoice attachment native and protected download checkpoint

- Conversation file selection/removal and attachment-only notes now use native
  atomic message posting with up to five files and 10 MiB total. Retry identity
  includes text, file names/order and byte hashes; status uses the same payload.
- Named download checks invoice/message/file membership, native attachment
  permissions and invoice ownership. Binary download never previews active
  content inline; validated native HTTP/HTTPS links are not fetched by the server.
- Gateway upload parsing is bounded at 15 MiB only for note/save-status actions,
  after the tester and clinical-session checks. Other Billing calls retain 32 KiB.
  Raw attachment/content routes remain unavailable. No new public access is added.
- Home 189 tests/24 suites, types/lint/build and seven gateway/webpack checks pass.
  Exact installed native code passes 143 tests, no failures/errors/skips.
  Concurrent HTTP save/status returns one message and one copy of each file,
  with native ID-sorted metadata and unchanged financial/follower/payment state.
- The protected build's 83 chunks and secret-free source archive match; existing
  tester/session/cookie/robots and blocked raw-route checks pass. Actual browser
  downloads match the original 40,065-byte and zero-byte native files. Browser
  upload/save/reload acceptance is pending because automation cannot complete the
  file chooser. Mocked upload/recovery tests do not establish that browser proof.
  This is not full Billing parity.
- Malware scanning/quarantine, attachment deletion/large-file delivery, external
  email, followers/activities and remaining modules still require completion.
  Production/shared-demo redesign deployments have not occurred.

## 10 October invoice conversation hosted checkpoint

- Browser save creates native internal message #21100 on INV/2026/00032.
  Full reload/reopen preserves it; back retains the invoice and INR 400 residual.
  Unsaved-close, Keep editing and explicit draft-discard controls work. The editor
  and save feedback appear before history, using the existing house design.
- Independent native read confirms exactly one browser note and unchanged invoice,
  journal, payments, followers and attachments, with no email queued for this
  fixture. Native 135 tests and Home 180 tests cover this checkpoint.
- The 83 hosted chunks and credential-free source/LICENSE/NOTICE archive match.
  Tester gate, clinical session, secure cookies, robots and raw financial/mail/
  arbitrary report denial checks pass. URL/code/expiry and production/demo remain
  unchanged. Attachment delivery/upload, external email, followers/activities and
  all remaining Billing/whole-product parity are still open.

## 10 October invoice conversation backend checkpoint

- Selected signed-in invoices connect to native message/change history with
  30-row cursor pagination, currency-labelled changes, restricted-field filtering,
  safe text and explicit long-body/attachment-delivery limits.
- Internal notes preserve native author, internal subtype, roles and company/
  record permissions. Native staff notifications are queued; customer/portal
  followers are excluded. No arbitrary recipients/attachments or raw mail methods
  are exposed through the protected gateway, which also rejects caller context.
- Identical concurrent HTTP writes return one persisted note. Its request key
  binds exact text, invoice and author. The UI retains that key after timeouts and
  negative status checks, guards closing/duplicate clicks and never retries writes
  automatically. Confirmed status can resolve a save without another post.
- Native suite: 135 tests, no failures/errors/skips. Home: 180 tests/23 suites.
  Types, lint, seven gateway/webpack checks and direct build pass. Actual HTTP
  proves escaped text, native history/status read-back and unchanged financial,
  payment, follower and attachment snapshots. Hosted browser verification remains
  separate. Only the isolated synthetic QA author gained an `.invalid` email.
- Attachment delivery/upload, external email, followers/activities and complete
  Billing/whole-product parity remain unfinished. Production/demo are unchanged.

## 10 October customer statement PDF acceptance checkpoint

- React connects the loaded statement period to a named, fixed QWeb PDF action.
  House modal/download controls retain explicit retry, session recovery,
  duplicate-click and close guards, bounded PDF validation and invoice selection.
- The native report rebuilds the posted ledger within the user's accounting
  permissions and company. Caller balances/context are rejected; original
  document currencies remain separate. No statement attachment is cached.
- Actual HTTP/text/visual checks pass for four periods and independently read
  balances, including INR 500 opening/100 credits/400 closing and an empty period.
  Invoice/journal snapshots, payment counts and attachments remain unchanged.
- Independent native rerun: 124 tests, zero failures/errors/skips. Home: 165
  tests/21 suites. Types, lint, seven gateway/webpack checks and direct build pass.
- Protected browser full-period download delivered a PDF with INR 0/500/100/400.
  Edited dates retained the loaded period until submission; the one-day ledger
  and delivered PDF showed 500 opening/100 credits/400 closing. Back retained
  the same invoice and outstanding amount. All 83 chunks and secret-free
  source/licenses match; gate/session/secure-cookie, robots and blocked raw
  mutation/report checks pass. URL/code/expiry and production/demo are unchanged.
- Long-ledger PDF pagination/other hospital layout configurations, complete
  document styling, full Billing and wider-product parity remain unfinished.

## 10 October customer statement hosted acceptance checkpoint

- Actual hosted browser statement matches invoice INV/2026/00032's ledger:
  0 opening, 500 debits, 100 credits, 400 closing. A one-day period correctly
  shows 500 opening/100 credits/400 closing. Date edits do not relabel old results
  before submission; manual reload, retained invoice and explicit reopen pass.
- Fixed the modal's missing table spacing by sharing the house table rules with
  scroll wrappers. Narrow-width ledger amounts remain unwrapped; the focused
  region supports keyboard horizontal scrolling. The 83 hosted chunks and
  secret-free source/LICENSE/NOTICE archive match; gate/session/secure-cookie,
  robots and blocked raw mutation/report routes pass independently.
- Existing tester link/code/expiry and production/shared demo remain unchanged.
  This accepts the interactive customer ledger, not statement PDF printing,
  full report styling, complete Billing or whole-product parity.

## 10 October customer statement backend checkpoint

- Signed-in invoice details connect the Qorlia customer statement modal to a
  named read-only Odoo adapter. Explicit period loading, manual reload, session
  recovery and preserved invoice selection reuse the house controls.
- Posted native receivables supply opening/debit/credit/running/closing balances,
  including paid bills, credits and unallocated receipts. Company-currency
  totals and original document-currency amounts remain distinct. Native roles,
  ACL/company rules, strict dates and balanced journals are enforced. More than
  2,000 entries fails explicitly, never silently truncates financial history.
- Native suite: 116 tests, zero failures/errors/skips. Home: 159 tests/21 suites.
  Seven gateway/webpack checks and Home types pass. Actual HTTP independently
  verifies four accounting periods against native journal entries, including
  500 invoiced/100 credited/400 closing, opening balances and an empty period.
  Financial snapshots/payment counts remain unchanged. Only isolated QA gained
  the native Accounting Readonly role needed for this ledger view.
- Hosted UI acceptance is not inferred from code tests. Statement PDF/full
  document styling and remaining financial/inventory/integration modules, plus
  full clinical and separate-product parity, remain unfinished.

## 10 October order/payment report hosted acceptance checkpoint

- Protected browser downloads delivered the actual S00147 quotation/discount
  PDFs and PQR10/2026/00001 detailed/summary receipts. PDF text confirmed INR
  920 and INR 500/100/400 respectively. Back-navigation retained the selected
  order/payment without financial mutation.
- All 83 hosted JS/CSS chunks and the secret-free source/license archive match
  local review artifacts. Gate/session/secure-cookie checks pass; raw financial
  mutations and arbitrary report rendering remain blocked. Existing tester
  code, expiry, tunnel and production/shared demo remain unchanged.
- This accepts these report connections only. Full PDF styling, statements,
  financial/inventory extensions, cross-module synchronisation and the wider
  requested redesign remain unfinished.

## 10 October order/payment report backend checkpoint

- Saved quotation/order PDF actions and posted customer payment/refund PDF
  actions are connected through the existing Qorlia report modal. Three native
  variants exist per document kind, filtered by native permissions. Parent
  selection, explicit retry/session recovery and bounded/safe PDF checks remain.
- Corrected actual native quotation total mismatch (INR 945 vs saved INR 920)
  and hospital receipts' latest-invoice/unset-balance binding. Detailed/summary
  receipts now show only reconciled documents, native per-document-currency
  allocations, item/batch details and actual current residuals. No guessed
  historic customer balance or unrelated/latest invoice is printed. Existing
  report actions/company layout/permissions remain; versioned archive snapshots
  prevent stale financial reuse while retaining old files.
- Independent native suite: 110 tests, zero failures/errors/skips. Actual HTML
  tests cover order discounts/chargeable overrides/rounding, receipt allocations,
  refunds, multiple invoices, currency differences, archive refresh and guards.
  Home: 149 tests/19 suites; gateway/webpack: seven checks; Home types pass.
- Ten actual HTTP PDFs verified saved order INR 920, receipt INR 500/100/400
  and refund INR 475/100/375. Financial snapshots/payment count unchanged.
  Pro-forma is excluded from QA's permitted menu and direct access is denied;
  its actual template is tested under authorised native test permissions.
- Protected frontend browser release acceptance is a separate gate, not inferred
  from these tests. Production/shared demo unchanged. Statements, full document
  reskin, bank/provider/check/PDC, down payments, POS, stock/batch, Clinical-to-ERP
  sync, wider products and complete clinical parity remain unfinished.

## 10 October native customer invoice PDF release checkpoint

- Signed-in invoice details now expose a Qorlia report modal with the installed
  native Invoices and Invoices without Payment variants. Credit notes use the
  same report engine. Only an explicit click generates/downloads a PDF.
- Named list/download methods preserve native invoice/report read permissions,
  company rules, fixed templates, journal-balance and applied-adjustment checks.
  Arbitrary report IDs/templates, caller accounting context and raw report
  routes remain blocked. Frontend checks reject malformed/oversized PDF
  responses and unsafe filenames. Duplicate clicks/closing during generation,
  session expiry and explicit retry paths have regression coverage.
- The fresh native suite passes 98 tests with zero failures/errors/skips.
  Home passes 142 tests in 18 suites; seven gateway/webpack checks, Home types,
  changed-source lint and diff checks pass. Direct Jest uses
  `TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node","customConditions":null}'`
  because Jest's CommonJS config loader is incompatible with the base bundler
  resolution. Type checking runs independently, not bypassed. The development
  distro build retains the existing Nx-cycle workaround and bundle/data warnings.
  Actual HTTP downloaded six PDFs across draft #4038, posted INV/2026/00022 and
  draft credit #1808 without changing invoice/journal state or payment count.
  Native styling now resolves through staging's internal report.url.
- Hosted browser downloads and actual local files verified draft INR 1,150 and
  both posted variants. The payment report shows INR 500 billed, INR 100 paid and
  INR 400 due; the without-payment variant omits settlement details. PDF text
  and rendered layout were checked. The browser event hook missed the download;
  file delivery was verified independently rather than inferred from a notice.
- Production/shared demo, access code/expiry and tunnel URL remain unchanged.

This completes the selected customer-invoice PDF connection, not all report
printing or document redesign. Native PDF layout remains. Quotation, receipt and
statement reports, email/chatter, journal editing, bank/provider/check/PDC,
down payments, POS, stock/batch, Clinical-to-ERP sync and wider-module parity
remain. The full requested objective is still active and incomplete.

## 9 October standalone invoice creation release checkpoint

- The authenticated Invoices panel now offers New invoice. It reuses the Qorlia
  draft editor and named native routes, including customer/product defaults,
  manual services, taxes, terms, notes and document adjustments. Incomplete
  drafts can be calculated but cannot be saved until native validation succeeds.
- Server-side create ACLs/company rules, bounded fields/lines, native calculation
  versions and balanced-ledger checks remain enforced. A creation UUID, locked
  request digest and unique database key protect uncertain retries. Concurrent
  identical requests return the same invoice, not two documents. Altered payloads
  cannot reuse the key. No caller state/company/type or raw financial write is
  exposed. The browser freezes entries after an uncertain save and offers an
  explicit identical retry, with a duplicate-risk warning before closing.
- All 92 native tests pass. Home has 132 passing tests in 16 suites; seven gateway/
  webpack checks, types, changed-source lint, formatting and development build
  pass. Native HTTP created one draft #4005 from simultaneous requests, balanced
  its journal and retained payment/protected bill state. Preview was read-only.
- Hosted browser creation and full reload verified draft #4038, quantity 2,
  native unit price INR 500, reference/note and INR 1,150 total. Independent reads
  verify unposted state, balanced journal, no attached payment and unchanged
  protected amounts. The fixture's INR 150 tax is not a production tax policy.
- The existing protected tester gate, expiry, hospital-session requirement,
  robots exclusion, blocked mutation routes and matching secret-free source/
  licenses are retained. Production/shared demo and tunnel URL are unchanged.

This supersedes standalone invoice creation as an outstanding gap below. Journal
items, print/email/chatter, bank/provider/stock/feed, down payments, POS and wider
modules still require parity and acceptance. Build bundle/browser-data warnings
and the existing Nx dependency-cycle workaround remain, not a clean production
build claim. The full objective remains incomplete.

## 9 October invoice and credit-draft UI release checkpoint

This supersedes the earlier backend-only checkpoint below. The protected tester
build now exposes the named native draft load/preview/save/choices routes and
the signed-in invoice editor. The existing Qorlia controls cover customer and
dates, terms/currency/journal, product or manual lines, prices/quantities/taxes,
analytics, sections/notes, document discount/rounding and native invoice settings.
Native Billing calculates all previews. Saving does not post, pay or allocate.
Edits invalidate the reviewed totals; failed previews/saves preserve entries;
dirty-close confirmation and duplicate-save guards remain in place.

Hosted browser save/reload verified synthetic draft #2735: quantity 1.5, reference
and note persisted, total INR 750. Editable credit #1808 persisted quantity 0.5
and total INR 250 while remaining unposted. Independent native read-back confirms
both balanced journals, unchanged payment count, original/source records and
unrelated INV/2026/00022. No cash refund or credit allocation occurred.

The browser also exposed a shared expired-session redirect loop: app settings
returned 401 while already on login, repeatedly reloading the page. The shared
API interceptor now preserves the login form on that route; authenticated routes
still redirect. Actual staging sign-in and work-location selection succeeded.
Home passes 126 tests in 16 suites; API/authentication passes 52 tests; seven
gateway/webpack checks, types, changed-source lint, formatting and build pass.
The prior 86-test native suite remains the backend evidence for this adapter.
Hosted gate, session boundary, robots exclusion and matching source/license
archive are verified. Existing bundle/browser-data warnings remain.

Production/shared demo are unchanged. This is existing-draft editing acceptance,
not complete Billing or product parity. Standalone invoice creation, journal
items, print/email/chatter, bank/provider/stock/feed and wider modules remain.

## 9 October invoice and credit-draft backend checkpoint

- Added named native draft load/preview/save/choices methods for existing customer
  invoices, editable credits and replacement drafts. Header settings, product or
  manual service lines, quantities/prices, taxes, analytic allocations, sections
  and notes reuse Odoo's field/onchange behavior. Company and document type stay
  immutable; previously posted drafts retain their journal. Generated discount
  and rounding rows cannot be supplied or edited by callers.
- Preview uses the pinned native form tax engine rather than the old stored
  journal totals of a virtual draft. The regression that showed an unchanged
  header total after editing quantity is covered. Percentage discounts recompute
  against edited items; adjustment values are shared with native posting and
  applied once. Save writes changed fields only, preserves manually selected
  taxes and validates the saved total against the reviewed native calculation.
- Native ACLs, company rules, record ownership, bounded payloads, locks, source
  and calculation/configuration versions, balanced-ledger checks and explicit
  stale-review rejection apply. No generic write, posting, payment or stock
  action is exposed by these methods. Searches use company/native field domains.
- All 86 native tests pass with zero failures/errors/skips, including the 73
  existing tests. New coverage includes read-only preview, partial credits,
  replacement corrections, duplicate/stale saves, configuration changes,
  permissions, sections/notes/manual services, included taxes, cash/global
  rounding, early discounts, installments and foreign currency. Seven existing
  gateway/webpack checks pass. No React files changed in this checkpoint.
- Actual isolated staging HTTP preview changed neither timestamps nor document/
  journal counts. Two simultaneous saves of draft 2735 produced one successful
  correction and one rejection. New source 2736 retained INR 1,000 open after
  its credit 2737 was reduced to INR 250 and separately posted. All three journals
  balance; no payment was created; unrelated INV/2026/00022 remains INR 400 open.

This is a backend milestone, not an accepted Qorlia editor release. The React
editor, named review-gateway allowlist, matching tester release and browser save/
reload verification still need implementation. The tester frontend is unchanged;
only the isolated Billing staging backend was restarted. New methods remain
blocked at the current review gateway. Direct creation of new invoice drafts,
journal-item editing, print/email/chatter and remaining full Billing gates are
not covered by this existing-draft adapter. Production/shared demo are unchanged.

## 9 October reviewed credit-note creation and reversal checkpoint

- Signed-in Billing now loads, previews and confirms the pinned native
  `account.move.reversal` workflow. The native choices are editable draft credit,
  full reversal and full reversal with a separate replacement draft. Full
  reversal posts/reconciles the credit and releases existing allocations, but
  retains posted receipts. Future dates schedule native posting without reducing
  the invoice balance now. Fully allocated invoices retain the native
  editable-credit-only restriction. Journal/period rules remain native.
- No caller accounting context, arbitrary wizard writes or `sudo` is exposed.
  Native ACLs/rules, balanced-ledger checks, deterministic connected-document
  locks and post-lock version checks apply. Versions include existing reversal
  history, reconciliation and relevant accounting configuration. A reused or
  stale review cannot create another credit. Read-only preview persists no wizard.
- The Qorlia modal requires separate preview/confirmation, invalidates an edited
  review, prevents duplicate clicks and closing during saves, and uses read-only
  recovery after uncertain replies. It explains that credit creation does not
  refund money, return stock or cancel a sales order. Unnumbered drafts now have
  distinct record-ID labels throughout Billing instead of multiple `/` labels.
- All 73 native adapter tests pass with zero failures/errors/skips. The new
  tests cover all native reversal modes, future/original-entry dates, retained
  partial receipts, fully allocated restrictions, discount/rounding/foreign
  currency, ordinary cashier and company/read-only boundaries, stale/invalid
  reviews and unbalanced-source rejection. Home passes 113 tests in 14 suites,
  gateway/webpack seven checks, types/lint/formatting/diff and development build.
- Actual native HTTP tests created one draft credit and rejected a concurrent
  duplicate. Full reversals, replacement drafts and a scheduled credit read
  back correctly with balanced journals and no new payment. Hosted browser
  INV/2026/00030 was first reviewed for future posting and closed: independent
  reads proved no document, timestamp or persistent-wizard mutation. Its
  explicitly confirmed immediate reversal then created RINV/2026/00014 (posted,
  fully allocated) and replacement draft 1819 (INR 500), leaving the original
  at INR 0. Independent native reads proved balance, no additional payment and
  unrelated INV/2026/00022 unchanged at INR 400. Full reload retained history,
  restrictions and the distinct replacement draft label.
- Only isolated synthetic staging and the protected tester review changed.
  Gate code/expiry, session boundaries and blocked raw financial routes remain
  unchanged. Matching source and licenses are available with the review build;
  tester secrets are absent. Production and the shared demo are unchanged.

Editable invoice/credit draft corrections, statement matching, provider/check/
PDC payments, printing, down payments, POS, stock/batch fulfillment and
Clinical-to-ERP synchronization remain unfinished or unverified. This supersedes
the credit-note creation/reversal gaps below, not full Billing or whole-product
parity. The 100-credit/1,000-connected-line review limits require native Billing
for larger cases, rather than silently truncating accounting evidence.

## 9 October reviewed invoice reset/cancellation checkpoint

- Signed-in Billing now reviews invoice/credit-note reset to draft and draft
  cancellation through named adapter methods. Native `button_draft` and
  `button_cancel` preserve accounting behavior, document identity and permissions.
  Posted invoices cannot be directly cancelled. These actions do not delete
  receipts, move funds, return stock or cancel sales orders.
- The review displays current allocations and reset consequences. Separate
  confirmation, duplicate-click prevention, blocked closing during saves and
  read-only recovery after uncertain responses protect the React workflow.
  Native ACLs/rules, connected-document locks, post-lock version checks and
  ledger checks remain enforced. Snapshots include analytic entries, related
  reconciliation, lock dates and protected-journal configuration.
- All 63 native adapter tests pass without failures/errors/skips. New cases
  cover reset/cancel/restore/repost, disabling scheduled posting, retained
  receipts and unrelated allocations, foreign-currency exchange reversal,
  locked periods, protected journals, ordinary cashier and read-only/company
  boundaries, stale/repeated requests and unbalanced history. Home passes
  101 tests in 12 suites; gateway/webpack seven checks. Types, targeted lint,
  formatting, diff and development build pass, retaining existing build warnings.
- Native HTTP INV/2026/00024 produced one reset and one rejection for concurrent
  identical requests, then cancelled/restored/reposted with its number retained.
  Its INR 100 receipt remains posted and unapplied; final invoice balance is
  INR 500. No extra payment was created and journal entries balance.
- Hosted browser INV/2026/00025 was reviewed/closed with INR 400 unchanged,
  then explicitly reset, cancelled, restored and reposted. Independent reads
  verified each state, preserved posted receipt 219, no additional payments,
  balanced journals and unchanged unrelated INV/2026/00022 at INR 400.
  Full reload retained posted INR 500 and the released INR 100 credit without
  automatic reallocation. Tester gate, expiry, isolated sessions and blocked
  raw mutation routes remain unchanged; source/licenses match the review build.

Credit-note creation/edit/reversal, statement matching, provider/check/PDC,
printing, down payments, POS, stock/batch fulfillment and Clinical-to-ERP sync
remain unfinished or unverified. Only isolated synthetic staging and protected
review changed, not production. This supersedes reset/cancellation gaps below,
not the full Billing or whole-product parity requirement.

## 9 October reviewed reconciliation removal checkpoint

- The existing-credit dialog now reviews and removes one native reconciled item
  through `js_remove_outstanding_partial`. It does not delete the invoice,
  credit note or receipt, create a refund or transfer funds. Exchange rows
  cannot be selected directly; native reversal handles related exchange and
  cash-basis entries.
- The named adapter action checks native access rights and record rules,
  balances and a fresh reconciliation-graph snapshot. Deterministic document
  and journal-line locks plus a post-lock version check reject stale or repeated
  requests. Raw reconciliation removal remains blocked at the review gateway.
- Native tests cover partial/full removal, preservation of other allocations
  and posted receipts, ordinary cashier rights, credit-note perspective,
  foreign currency and exchange/cash-basis reversals. All 54 adapter tests pass
  without failures, errors or skips. Home passes 92 tests in 11 suites;
  gateway/webpack pass seven checks. Home types, targeted lint/formatting,
  whitespace checks and development build pass.
- Existing native HTTP evidence proves that duplicate concurrent removals yield
  one successful removal and one rejection, followed by successful reallocation.
  Hosted browser INV/2026/00023 was reviewed and closed without changing its
  INR 400 balance. An explicit removal of its INR 100 allocation returned native
  `not_paid` and INR 500 open. Independent native reads found INR 100 reopened
  on RINV/2026/00011, no reconciliation, balanced journals and no payments.
  Full browser reload retained the restored outstanding credit and no history.
  Separate INV/2026/00022 stayed INR 400 with its original allocation.
- Only the isolated synthetic backend and protected tester review are involved.
  The hosted source archive matches, tester secrets are absent, and existing
  gate code, session boundaries, expiry and production services are unchanged.

Remaining Billing gates include statement matching, correction/refund UI,
provider/check/PDC workflows, printouts, down payments, POS, stock/batch
fulfillment and Clinical-to-ERP synchronization. Native tests are not browser
acceptance of every accounting configuration or proof of full module parity.

## 9 October native credit allocation checkpoint

- The signed-in Billing workspace now includes an explicit review for existing
  receipt credits and credit notes. It uses the native outstanding widget and
  reconciliation action, with native history, currency conversion, residuals
  and no additional payment creation. Outstanding debits on credit notes are
  handled through the same native workflow.
- Source/target ACLs, record rules, balanced ledgers, account eligibility,
  deterministic document/line locks and fresh versions protect allocation.
  The snapshot includes source balances, company locks and currency settings.
  Reads use Odoo compute protection and do not change invoice timestamps.
  Wrong-customer, stale, already-used and unbalanced sources are rejected.
- The React review blocks duplicate writes and closing while saving. Uncertain
  responses require a fresh status read and another explicit review. Session
  recovery clears financial data. The gateway allows named adapter methods,
  never raw native allocation/removal or caller accounting context.
- Actual native HTTP INV/2026/00019 received a credit-note allocation of INR 100,
  leaving INR 400. Two identical concurrent requests produced one allocation and
  one rejection. A subsequent INR 600 credit settled the remaining INR 400 and
  left INR 200 on its source. INV/2026/00020 stayed INR 500 open. Independent
  reads verified balanced journals, native history and no additional payments.
- Home: 87 tests in 11 suites. Native adapter: 46 tests with zero failures,
  errors or skips, including excess receipts, foreign currency, cashier rights
  and cache-reset/read-only stability. Gateway/webpack: seven checks. Types,
  targeted lint, formatting, diff checks and development build pass.
- Hosted browser INV/2026/00021 and source RINV/2026/00009 retained INR 500 and
  INR 100 open respectively after reviewing and closing, verified independently.
  Applying the INR 100 once left INR 400 on the invoice and zero on its source.
  Reopening showed native history and no available source. Independent native
  reads verified one partial reconciliation linking only those two documents,
  balanced journals and no payment. The hosted source/licenses match and the
  shared gate, hospital/ERP session boundaries and expiry remain unchanged.

Billing remains incomplete: provider/check/PDC workflows, statement matching,
removing reconciliation, printing, correction UI, down payments, POS, stock/batch
fulfillment and Clinical-to-ERP synchronization. The 200 outstanding-item review
limit requires the native screen for larger cases. Production is unchanged.

## 9 October reviewed native payment checkpoint

- The common Qorlia Billing workspace now includes a payment review modal using
  native Odoo payment-register computation, posting and invoice reconciliation.
  It requires an explicit preview, blocks repeat clicks and closing during a
  write, and requires a fresh status read after an uncertain response.
- Manual full/partial receipts, outbound credit-note disbursements, difference
  settlement, installments and currency conversion pass native tests. Excess
  credit does not automatically pay another invoice. Balanced/posted/open-amount
  eligibility, ordinary cashier access, input validation, row locks and stale
  invoice/configuration checks are enforced in the adapter, without `sudo`.
- Real HTTP INV/2026/00009 recorded INR 100 then INR 375 against an INR 475
  invoice, leaving INR 375 then zero. Two simultaneous identical requests
  produced one payment and one rejection. Independent reads verified balances
  and balanced payment entries. RINV/2026/00003 recorded an outbound INR 100,
  leaving INR 375. An INR 500 receipt for INV/2026/00011 did not allocate the
  excess to INV/2026/00010; the latter remains INR 475 open with no payments.
- Native Community Odoo may label a fully reconciled invoice `paid` while bank
  matching remains incomplete. The UI retains native invoice status and shows
  native bank matching separately. Cash registration does not transfer money.
- Home: 77 tests in 10 suites; native adapter: 36 tests, no failures/errors/skips;
  gateway/webpack: seven checks. Targeted types/lint and development build pass.
- Hosted browser INV/2026/00012 (reference
  QORLIAQA-PAY-BROWSER-20261009-12d50526) retained INR 475 and no payment after
  opening, previewing and closing the review. An explicit INR 100 cash receipt
  then left INR 375 open with native `partial` status. Independent native reads
  verified exactly one inbound payment, linked only to this invoice, and a
  balanced payment journal. The protected review includes the corresponding
  source archive and licenses; tester/session boundaries remain enforced.

This is not complete Billing parity. Provider/check/PDC flows, bank statement
matching, credit-allocation UI, receipt/invoice printing, correction UI, down
payments, POS, stock/batch fulfillment and Clinical-to-ERP synchronization remain
unfinished or unverified. Historical unbalanced records remain blocked. Only
isolated synthetic staging is changed, not production.

## 9 October Billing discount/rounding accounting checkpoint

- Customer posting now creates explicit document-discount and signed rounding
  adjustment lines on configured accounts. Native Odoo calculates receivables,
  installments, currency conversion and residuals. The balance guard still
  rejects unequal entries and old invalid records are not silently repaired.
- Fixed and percentage discounts, both credit-note signs, rounding up/down,
  installments, foreign currency, native reversal, reset/repost and onchange
  consistency pass isolated native tests. Missing, deprecated and cross-company
  accounts are rejected. A company rounding account is required explicitly.
  Existing item tax is preserved, matching Bahmni's after-tax discount semantics,
  not certifying Indian healthcare tax policy.
- Actual HTTP posting produced balanced INV/2026/00006 (INR 919.75) and
  RINV/2026/00002 (INR 919.25), with unpaid residuals and two adjustment lines.
  Discounted service order S00146 produced INV/2026/00007 (INR 920).
- Hosted browser posting of invoice 106 produced INV/2026/00008 (INR 919.75).
  Closing the review first was verified not to post. The UI shows INR 900 items,
  INR 45 tax, INR 25.50 document discount and INR 0.25 rounding without duplicate
  adjustment rows in the item table. Independent reads verify five unreconciled,
  balanced journal lines and no payment. A subsequent review offers no posting.
- Native adapter tests: 24 passed, no failures/errors/skips. Home: 66 tests in
  nine suites. Gateway/webpack: seven checks. Types, targeted lint, diff and build
  pass. Tester gate, expiry and separate native sessions remain unchanged.

Billing remains incomplete: payments/reconciliation, refund disbursement, React
correction workflows, partial/down-payment discount allocation, POS, stock/batch
acceptance, complete role/company acceptance, printouts and Clinical-to-ERP sync.
Native reversal/reset test coverage is not UI parity for those actions. Changes
remain non-production; historical unbalanced invoices remain failure fixtures.

## 9 October Billing balanced-invoice posting checkpoint

Historical checkpoint. Its missing-counterpart blocker is superseded above.

- The earlier INR 920 order-flow checkpoint below proved displayed/API amounts,
  not journal balance. Native ledger inspection later found an INR -25 difference
  on INV/2026/00002 and INV/2026/00003. They are retained as invalid synthetic
  failure fixtures, not accepted accounting results. No payment should be
  recorded against them.
- The LGPL Billing adapter restores Odoo's native balance rejection omitted by
  the installed Bahmni discount override. Document-discount/rounding posting is
  blocked and rolled back instead of accepting unequal entries. This is a guard,
  not a completed fix of discount/rounding counterpart accounting. Draft editing
  is preserved. Actual HTTP confirmation of S00093 failed the guard and a fresh
  read confirmed draft state and zero invoices.
- Reviewed standalone invoice posting uses native `action_post`, native access
  controls, invoice/line locks and semantic version checks. The common Qorlia
  dialog explains posting, displays actual customer/company/journal/total, and
  warns about existing unbalanced records. It blocks repeated clicks and closing
  while a write is pending, and requires read-only recovery after an uncertain
  reply. The protected gateway exposes named load/post methods, never raw
  posting/write/reset/cancellation or client-supplied accounting context.
- Synthetic INV/2026/00004 was posted through a real native HTTP request. Its
  final total and open amount are INR 472.50; independent journal-line reads
  confirm zero debit-credit difference, unreconciled entries and `not_paid`.
  An old-version repeat was rejected. This is not a payment or tax-compliance
  claim. Nine Home suites pass 65 tests, gateway/webpack seven checks and native
  adapter 12 tests. Types, targeted lint, diff checks and development build pass.
- Hosted browser verification opened/closed invoice 25's review without a write,
  then posted it once as INV/2026/00005. The result shows INR 472.50 open and no
  payment recorded. Reopening the review offers no second posting. Independent
  native reads confirm one matching invoice and three unreconciled journal lines
  with zero debit-credit difference. The old INV/2026/00003 review shows its
  balance warning and no posting action. Browser error logs were empty. Tester
  credentials, gate and expiry are unchanged; screenshots are retained privately.

Billing is not complete. Discount/rounding accounting, payments/reconciliation,
refunds, cancellation/reset, down payments, POS, stock/batch workflows, full
role/company acceptance and Clinical-to-ERP synchronization remain. The earlier
checkpoint's standalone-posting limit is superseded only for the balanced
invoice flow verified here. All changes remain non-production.

## 9 October Billing order confirmation and invoicing checkpoint

Historical display/API checkpoint, superseded by the ledger correction above.

- Billing is part of the signed-in React workspace. The shared design-system
  review dialog reads the current native order state and exposes only actions
  allowed by that state and the signed-in ERP account. It describes configured
  automatic stock delivery and invoice posting before confirmation. Saving a
  draft remains separate from confirming it, creating an invoice or payment.
- The original LGPL-3.0 adapter delegates confirmation to native Bahmni/Odoo
  `action_confirm` and regular invoicing to Odoo's sales invoice wizard. Native
  ACLs, record rules, order/line locks and fresh version checks precede writes.
  A version includes the configured automation and linked invoice/delivery
  states. Repeating an old confirmation is rejected instead of creating another
  invoice. Uncertain replies require an explicit status read, never an automatic
  mutation replay. The gateway allows named adapter actions, not raw financial
  create/write/confirmation calls or arbitrary adapter context overrides.
- Isolated native HTTP testing confirmed synthetic S00054 and produced one
  posted INV/2026/00002. Hosted browser testing reviewed and then confirmed
  synthetic S00055, producing one posted INV/2026/00003. Independent native reads
  confirm INR 45 tax, INR 25 document discount, INR 920 total and INR 920 unpaid
  balance. These service-only orders have no stock picking. The unchanged draft
  fixture S00028 remains available for draft-edit testing.
- All eight Home suites pass 57 tests; gateway/webpack guards pass seven tests;
  native adapter tests pass eight tests with no failures, errors or skips.
  Home library types, changed-source lint, diff checks and the development build
  pass. Native tests also cover manual regular invoicing when automatic invoicing
  is disabled, stale order/configuration versions and a role without Billing
  access. Hosted browser error logs were empty for the verified flow.

This is not complete Billing acceptance. Payments, reconciliation, refunds,
standalone posting/cancellation, down payments, POS, stock/batch delivery and
returns, the full role/company matrix, and Clinical-to-ERP synchronization remain
unfinished. The ERP has separate synthetic data and no public ports or outbound
network access. Automatic stock delivery was disclosed but not verified by these
service-only fixtures. The test chart and tax are arithmetic fixtures, not an
Indian healthcare accounting setup. The protected VPS tester release changed;
production and the existing public demo did not. Large development bundles and
Quick Tunnel availability remain limitations.

## 7 October visit creation and uncertain-reply recovery checkpoint

- Visit entry now waits for a fresh patient/location-scoped read instead of
  starting from cached empty data. A synchronous guard prevents duplicate starts
  during StrictMode effect replay. The native visit-location resolution and an
  immediate active-visit preflight precede every POST. A visit started since the
  panel opened is reused, without a second creation or invented OPEN_VISIT event.
- The existing FHIR visit POST is unchanged. Its acknowledgment must identify
  the expected patient, location and visit type, carry the native visit tag,
  and include an ID and start timestamp. Native OpenMRS returns status `unknown`;
  the check does not incorrectly require `in-progress`. Malformed search pages,
  non-Encounter visit entries and invalid visit-location responses fail visibly,
  rather than becoming permission to create a visit.
- Failed or uncertain creation keeps the shared Qorlia action panel visible.
  Check visit status performs reads only. A recovered visit opens the pad; a
  confirmed empty read requires an explicit Start visit click, even for a
  single-type configuration. Failed status checks keep writes blocked. Metadata
  errors expose read retry. Unmounting a pending start cannot reset the next
  patient's global consultation draft. Patient-keyed containers isolate entry.
- Actual isolated browser verification registered QorliaQA VisitRecovery as
  ABC200001, then intercepted the test POST response only after the backend
  returned 201. The browser received a failed reply and showed Check visit status.
  Recovery issued GETs returning 200 and opened the existing OPD visit. Complete,
  non-truncated captures contain exactly one visit POST and no recovery mutation.
  Independent native reads confirm one active visit, zero clinical encounters,
  and no fabricated OPEN_VISIT audit event for the unacknowledged write. The empty
  consultation was cancelled; interception was cleared and the QA tab closed.
- Regression checks reproduced the duplicate effect-driven start and blank
  failure panel before correction. All 65 services suites pass 1,682 tests and
  all 110 Clinical suites pass 2,716 tests/36 snapshots in India and US Pacific
  time. The three focused Clinical suites pass 67 tests/one snapshot in both.
  Changed-source lint has no errors and one pre-existing ConsultationPage hook
  warning. Library type checks and services/Clinical builds pass. Existing large
  bundles and the upstream form2-controls eval warning remain.

This verifies same-container write ownership and the tested lost-reply path, not
atomic duplicate prevention across concurrent clients. The read-before-write
check cannot close a server race between separate clients. Single-type behavior
has unit/StrictMode coverage, not a live single-type configuration test. Live
limited-role checks, multi-location consultation selection, full clinical parity,
and the separate-product redesign remain unfinished. No production/shared-demo
deployment, dependency addition, purchase or staff privilege change occurred.

## 7 October native audit-writer checkpoint

- The shared writer now persists the native message key and optional JSON
  parameters, not text translated in the writer's locale. Read-time translation
  remains in the audit screen. Clinical visit creation emits `OPEN_VISIT` with
  `OPEN_VISIT_MESSAGE` and its visit-type parameter, replacing the non-native
  `START_VISIT` emission. Existing stored history was not rewritten.
- Reports now installs its audit listener in an effect that returns cleanup,
  matching the other apps. The StrictMode regression failed before the fix and
  confirms cleanup both on effect replay and unmount. No listener is installed
  later by a stale asynchronous initialization callback.
- The isolated browser registered QorliaQA AuditFixture as ABC200000, opened its
  clinical record and explicitly started one OPD visit. Complete request captures
  show one FHIR Encounter POST (201) and one native OPEN_VISIT audit POST (200).
  Independent native reads confirm one active visit with no clinical encounters
  and three patient audit entries: registration, dashboard access and visit open.
  The redesigned table filters to IDs 155, 156 and 157 and displays their full
  translated descriptions, including the OPD visit type. Patient creation used
  synthetic details only. The empty consultation was cancelled afterward.
- The full services suite passes 1,658 tests. The five audit/visit suites pass
  48 tests in US Pacific time; Reports passes 57 tests in both India and US
  Pacific time. The focused consultation-container suite passes 19 tests in
  both tested time zones. Changed-source lint, library type checks and services,
  Clinical and Reports builds pass. Reports' test type check passes. Services
  and Clinical test-project type checks still have unrelated existing errors;
  they are not claimed green. Existing large bundles and form2-controls eval
  warnings remain.

This verifies these emissions and Reports listener ownership, not every native
event, audit-write failure handling, one-type automatic visit creation under
effect replay, limited-role behavior or full React acceptance. Separate-product
redesign and other workflow parity work remain unfinished. Production and the
shared demo are unchanged.

## 7 October native audit-log checkpoint

- The redesigned table follows the native default reversal and 50-record cursor
  paging. Submitted date/time, username and patient ID remain attached to page
  reads. Empty next/previous responses retain the current page. Previous from an
  empty filter invokes the native default view and clears visible identity
  fields instead of mislabelling those results. Clearing the date can omit the
  native startFrom filter; invalid/future dates and nonexistent local times reject.
- Timestamps retain seconds. Message parsing preserves tildes inside JSON
  parameters; malformed messages remain visible rather than crashing. Event
  types and modules use the configured translations. Malformed response envelopes
  and invalid rows fail visibly, with explicit read retry. Re-entry refetches
  despite the Admin app's cache defaults. No audit write or history rewrite occurs.
- Actual isolated browser filtering by superman/QST910001 returned 50 rows
  (IDs 1 through 147, with gaps belonging to other patients). Next used cursor 147
  and returned IDs 148 through 153. Previous used 148 with prev=true and restored
  the original 50 rows. Empty-user filtering and default recovery returned the
  latest 50 global events (104 through 153), with identity fields cleared.
- Blocking audit GETs retained the displayed page and disabled paging. The app's
  configured read retries made three failed GETs. Explicit Try again then issued
  one GET returning 200, retained the page on its empty response and displayed
  No more events found. Complete captures contain no mutations; blocking is
  cleared. Independent native reads corroborate the filter count/cursors.
- Anonymous audit GET returns HTTP 200 with an authentication-error object, not
  rows. Envelope validation rejects it instead of treating it as successful data.
  Actual cleared-date browser filtering omits startFrom and returns 50 records.
- Nine Admin suites pass 61 tests in India and US Pacific time. Lint, type checks
  and the package build pass. Existing large-bundle concerns remain. Older React
  START_VISIT entries use a non-native message key; their emission needs a separate
  source correction, not rewriting stored audit history. Live limited-role and
  full cross-workflow event coverage remain unverified.

This is a local/native audit-read checkpoint, not complete React acceptance.
Other React workflows and separate-product redesign remain unfinished. Production
and the shared demo are unchanged.

## 7 October native CSV import/export checkpoint

- Import reads the native `bahmni.admin.csv` extension, including its replacement
  `urlMap` and `patientMatchingAlgorithm`, rather than guessing from the v2 tile
  catalogue. The eleven native default types remain when no custom map exists.
  Missing, malformed or external-destination settings block file selection and
  expose read retry. Queued files retain their selected type and configuration.
- Multipart requests retain the native file and algorithm fields. Only Boolean
  `true` acknowledges submission; an HTML login response cannot show success.
  Acknowledgment is not completion. Failed status refresh leaves the submitted
  state intact and does not offer another POST. Cancel copy warns that the server
  may already have received the request. Status refetches on entry and by Refresh.
- Native browser concept import saved one synthetic row, while a second import
  rejected a missing Concept Class. Independent status reads show COMPLETED
  (one success, zero failures) and COMPLETED_WITH_ERRORS (zero successes, one
  failure). The invalid concept is absent from native concept search.
- The native error link exposed a missing private staging route. A relative
  redirect now carries the browser to the existing `/openmrs/auth` endpoint,
  where its path-scoped session cookie can be checked. CSV import files require
  `Import CSV Files` or OpenMRS's implicit System Developer privilege; clinical
  access alone is insufficient. Patient-document permissions remain unchanged.
  The browser downloaded the exact failed-row CSV, with its proper filename and
  validation message. Anonymous requests return 403. Actual limited-role browser
  checks remain, beyond the runnable adapter permission/path checks.
- Exact concept selection and keyboard Enter downloaded the native ZIP containing
  `concepts.csv` and `concept_sets.csv`. Archive inspection retained the synthetic
  concept UUID/name. Copy now describes the ZIP correctly. Editing a selected
  name disables export; failed searches expose GET retry.
- Admin's nine suites pass 51 tests in India and US Pacific time. Source lint,
  type checking, adapter checks and the package build pass. The existing large
  Admin bundle remains. No new dependency or production deployment was added.

This closes the tested concept-import, error-download and concept-export paths,
not all eleven import formats, patient matching, cancellation races, large-file
handling or real limited-role enforcement. Other React workflows and separate
OpenELIS/Odoo/radiology/analytics/outreach redesign remain in scope and unfinished.

## 7 October order-set lifecycle and retirement checkpoint

- The React editor follows the pinned native Bahmni [controller](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/controllers/orderSetController.js)
  and [service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/services/adminOrderSetService.js):
  full native reads, POST create/update, serialized member templates, native
  concept/drug/configuration lookups, member ordering and retirement without
  purge. It retains the original template fields after concept selection.
- Saving now resets the native detail query instead of restoring an old cached
  representation. A successful write followed by an unavailable read exposes
  GET retry, not another POST. Required read failures block saving while keeping
  unsaved input. Pending saves disable editing/cancellation. URL-keyed editors
  separate drafts, and completion of an old unmounted editor cannot redirect a
  newer one. List/detail entry refetches explicitly override the app's disabled
  mount-refetch default; browser QA found that otherwise a saved new order set
  stayed invisible in the cached empty list.
- Retirement now uses the existing shared Qorlia modal, not a browser-native
  confirmation. Cancel and Escape restore the row trigger. Pending retirement
  disables both footer controls and prevents Close/Escape dismissal or repeat
  submission. After confirmed retirement, focus moves to Create order set. A
  failed DELETE stays in the confirmation without automatic replay. A failed
  following list GET has its own read retry and retains the confirmed retirement.
- The order-set suite passes 15 tests; the complete Admin suite passes 44 tests
  across nine suites in India and US Pacific time. This includes the actual
  Admin query defaults. Stale-list and post-retirement focus regressions failed
  before correction. Admin type checking, changed-source lint, formatting and
  package build pass. The existing large Admin bundle remains.
- Isolated browser creation returned POST 201 and full detail GET 200. Earlier
  populated edits preserved member UUIDs/templates and ordering after POST 200
  and fresh GET 200; blocked post-save detail reads recovered through GET only.
  For the new retirement fixture, Cancel/Escape captures contain no mutations.
  A blocked DELETE produced one failed attempt and a visible error; independent
  read-back confirmed the fixture remained active. After clearing the fault,
  confirmation returned DELETE 204 followed by list GET 200. A second disposable
  fixture verified keyboard Enter confirmation and focus on Create order set.
  Both native records remain readable as retired, with their two members intact.
  Complete relevant captures are non-truncated.
- The two newly retired fixtures are `32ab378c-cb2e-449a-97d8-0cb29f79f26e` and
  `3414a46c-2a3b-477f-9225-1fe721551585`. They were not purged. Independent full
  clinical comparison remains unchanged from the after-visit baseline: seven
  encounters, four visits and pulse 81. Temporary request blocking is cleared.

Remaining: other order types/dosing rules, member-removal saves, malformed
templates, concurrent writes and actual limited-role boundaries. Admin imports,
operator tools, broader React acceptance and separate-product redesign remain
open. The legacy production tile is unchanged; this is a verified local staging
checkpoint, not complete product acceptance or a public deployment.

## 7 October confirmed form-pin preference checkpoint

- Selector and editor use the existing shared, user-keyed query cache. Pins
  reflect confirmed native preferences, not optimistic success. Pending or
  failed reads/writes disable pin changes without blocking clinical form entry
  or saving. A lost write response triggers a read, never an automatic POST
  replay. Try again performs a GET and preserves the mounted form draft.
- Same-client writes are serialized per user. Late replaced-user responses stay
  in their own cache; refreshed form versions rematch by native stored name.
  Pins outside the current privilege/programme-filtered catalogue are retained.
  Malformed top-level preference payloads and non-string pin values reject.
- Nine hook regressions and four malformed-payload regressions failed before
  correction. Six focused suites pass 248 tests/five snapshots in India and US
  Pacific time. The complete clinical suite passes 2,706 tests/36 snapshots in
  both time zones after refreshing only four stale generated header CSS class
  names. Five OT fixtures now encode the selected browser-local time rather
  than a fixed India offset, matching the original Bahmni calendar. An explicit
  offset regression confirms that actual API timestamps keep their meaning;
  application date handling was unchanged.
  Clinical type checking, source lint, formatting and build pass with the
  existing form-renderer eval and bundle-size warnings.
- Actual isolated browser blocking verifies failed preference reads and a failed
  POST while keeping unsaved pulse 82 in the native form. Complete retry captures
  contain one GET returning 200, with no POST replay. Enter pin and Space unpin
  each returned POST 200; independent read-back confirmed the saved pin and the
  restored original empty preference. The form was discarded and consultation
  cancelled. Full native records remain unchanged after today's earlier
  synthetic visit initialization: seven encounters, four visits and pulse 81.

Remaining: concurrent writes from separate browsers/clients (the native API has
no compared-version write), broader malformed preferences, privilege recovery,
other form/context/permission transitions, responsive/keyboard acceptance,
unfinished operator tools, full React parity and separate-product redesign.
No public/shared-demo deployment or existing staff privilege change occurred.

## 7 October observation-form pin accessibility checkpoint

- The form header reuses the shared Carbon IconButton instead of a clickable
  div. Tab, Enter and Space work natively; the translated accessible name and
  pressed state identify Pin/Unpin. Hover, focus and selected styling come from
  the existing design system, without a separate keyboard handler or dependency.
- Two added regressions failed before correction. Five focused clinical suites
  pass 204 tests/four snapshots in India and US Pacific time. Clinical type
  checking, changed-source lint, formatting and build pass with existing warnings.
- In the isolated browser, keyboard Enter pinned Second Vitals with a captured
  native preference POST returning 200. Independent read-back confirmed the pin.
  Space unpinned it and read-back confirmed the original empty preference. The
  temporary QA tab is closed. No form was submitted; full clinical records still
  match the after-visit baseline (seven encounters, four visits and pulse 81).

Remaining: pin preference failure/recovery, ordering and user-context changes,
broader keyboard/responsive acceptance, full React parity and separate products.
No public/shared-demo deployment or existing staff privilege change occurred.

## 7 October form-metadata and patient-read recovery checkpoint

- The observation editor exposes the existing metadata and patient query retry
  actions. Initial unavailable data and background fetch/error states block
  submission, including the validation override. A loaded renderer remains
  mounted through background failure and retry, keeping its unsaved input.
  Retry targets only the failed or missing read. Native schemas, validation and
  save payloads are unchanged; no dependency or mirrored query state was added.
- Four container regressions and two real-query hook checks cover unavailable
  metadata, draft preservation, background loading and patient-only retry. The
  five focused clinical suites pass 202 tests and four snapshots in India and
  US Pacific time. Clinical type checking, source lint and build pass, retaining
  existing upstream form-renderer eval and large-bundle warnings.
- Actual isolated browser transport blocking covers initial metadata failure,
  background metadata failure with typed text, and background patient failure
  with the same draft. Save is disabled during the faults. Removing each block
  and using Try again recovers native reads with HTTP 200 and preserves the
  typed text. Complete non-truncated captures contain GET requests only; the
  patient-only recovery does not refetch valid metadata. Temporary blocking and
  query devtools are closed. The unsaved form was discarded and consultation
  cancelled, without submitting observations.
- The old 5 October baseline remains preserved: its visit was subsequently
  closed by OpenMRS's daemon, not this editor. A separate 7 October baseline
  was taken before testing, then another after one explicitly started synthetic
  OPD visit. Since that visit initialization, the independent full native
  comparison is unchanged: seven encounters, four visits and pulse 81. No
  clinical form save, staff privilege change or public deployment occurred.

Remaining: privilege-load recovery, malformed/native form configurations,
additional draft/context/permission transitions, concurrency, responsive and
keyboard acceptance, full React parity and separate-product redesign.

## 5 October native-form narrow-layout checkpoint

- The configured History and Examination form had a duration label starting
  outside the pad at the normal 437px browser viewport. A scoped container query
  now stacks native form labels above controls below 40rem of actual form width,
  removes the reserved inline action gutter and keeps comment/clone actions in
  normal flow. The existing renderer, schema, validation and save payload remain
  unchanged. No resize listener or dependency was introduced.
- The failing DOM-boundary check now passes for labels, control wrappers and the
  numeric wrapper at 320px and 437px viewports. At 1440px, the 859px desktop pad
  retains the original row layout and passes the same boundary check. A 1000px
  viewport also retains the row layout in its full-width pad. Temporary viewport
  overrides were reset. These are fixture-specific checks, not acceptance of
  every configured control, language or device.
- The container suite passes 46 tests and two snapshots; clinical production
  build and changed-style formatting pass with the existing upstream eval/bundle
  warnings. The empty form was discarded and the consultation cancelled. The
  independent full native snapshot remains unchanged: seven encounters, three
  visits and pulse 81. No clinical save or public deployment occurred.

Remaining responsive work includes the narrow chart header, action-area height,
additional native form/control configurations and broader keyboard/touch checks.

## 5 October form-catalogue recovery checkpoint

This closes the tested catalogue-request and unavailable-form paths, not complete
observation-form, responsive or clinical parity.

- The observation selector now exposes the existing query's retry action. A
  catalogue failure or missing requested form shows an explicit error instead of
  initializing from failed cached data, inventing a replacement or spinning
  indefinitely. Manual, direct and edit/copyover entry respect the same guard.
  Retry does not remove selected drafts or reset the form store.
- Background catalogue fetching and unresolved privileges remain pending rather
  than being interpreted as an empty permitted form list. Matching and error
  states are derived from existing query data; no dependency or mirrored state
  was added. A loaded form is not replaced by the selector's error screen.
- Five catalogue/missing-form regressions failed before the fix. Recovery and
  cached-refetch hook checks were added afterward. The four affected clinical
  suites pass 169 tests and four snapshots in India and US Pacific time. Clinical
  type checking, changed-source lint and build pass, retaining the existing
  upstream form-renderer eval and large-bundle warnings.
- Actual isolated browser testing blocked the catalogue request, displayed the
  retry error with Done disabled, removed the temporary block and recovered the
  configured History and Examination form. The fresh complete recovery capture
  is non-truncated: catalogue/schema/translation/history requests are GET and
  return 200, with no clinical mutation. The empty form was discarded and the
  consultation cancelled. Full independent native records remain unchanged
  (seven encounters, three visits, pulse 81). An older evicted capture is not
  used as proof. The rendered narrow form still has clipped field labels, so
  responsive acceptance is not claimed.

Remaining: malformed catalogue payloads, translated/native form identity,
metadata and privilege-load recovery, broader draft/context/permission changes,
concurrent writes, full React parity and separate-product redesign. No public or
shared-demo deployment, staff privilege change or clinical save occurred.

## 5 October chart-note markup checkpoint

- Radiology and procedure note toggletips now use a block-compatible container,
  not a paragraph containing Carbon's block content. The shared tooltip stays
  unchanged; other callers already use compatible markup.
- Both regression assertions failed before correction. The two populated widget
  suites pass 91 tests in India and US Pacific time; widget type checking, changed
  source lint, formatting and build checks pass, retaining existing build warnings.
- A fresh isolated chart reload has no captured new console errors. Both saved
  synthetic notes open and dismiss with Escape. A dependency build temporarily
  replaced generated CSS; the existing development process recovered without a
  restart before this reload. No clinical record or public deployment changed.

This closes the paragraph-nesting issue below, not complete chart accessibility,
responsive acceptance or the remaining React/separate-product workflow gates.

## 5 October submitted-form history and edit-recovery checkpoint

This closes the tested history/read-failure paths, not complete observation-form
or clinical parity.

- Submitted-form history now distinguishes resolved empty/new encounters from
  pending or failed reads. The consultation's explicit encounter context takes
  precedence over the header snapshot; reset shared context remains pending.
  Selection and observation submission block until history is ready. A failed
  refresh keeps the draft and offers the existing branded retry control.
- Saved form observation, metadata and version reads no longer turn failures into
  an empty replacement. Edit/copyover initialization rejects late responses from
  replaced contexts, preserves native observation identity on edit and strips it
  only for copyover. Successful initialization remains latched across catalogue
  refresh so an existing draft cannot be reset by a repeated fetch. The reset
  readiness and catalogue-refresh regressions failed before correction.
- The shared observation reader follows every FHIR next page through the existing
  compatibility helper. Operation search cursors can target the FHIR root;
  unexpected paths, incomplete pages and cycles still reject. This operation's
  multi-page behavior has controlled transport coverage; the native observation
  fixture returned one complete page. Native Encounter pagination is separately
  verified with two real one-entry pages using the actual source services.
- Actual isolated browser fault/recovery blocked observation reads, displayed the
  saved-form error with Done disabled, and restored pulse 81 and its synthetic
  note after retry. Cancel returned to the chart. The complete recovery capture
  contains GET requests only; independent full native before/after records are
  unchanged. Temporary blocking was removed. This did not replay a save.
- Three clinical suites pass 131 tests and two snapshots; two sibling widget
  suites pass 83 tests and three snapshots; two service suites pass 46 tests, all
  in India and US Pacific time. Service/clinical type checks, builds and source
  lint pass with one existing consultation effect-dependency warning. Duplicate
  mock, upstream form-renderer eval and large-bundle warnings remain. A subsequent
  chart reload exposed invalid paragraph nesting around radiology/procedure note
  toggletips; that rendering correction is a separate open checkpoint.

Remaining: catalogue/missing-form recovery, additional context/draft/permission
transitions, noncoded/configured condition details, concurrent writes, broader
React workflows and separate-product redesign/acceptance. No production or
shared-demo deployment or staff privilege change occurred.

## 5 October encounter-request lifecycle checkpoint

This closes the tested header-hook initial-load/retry/context races, not all
clinical request races, concurrent native writes or complete React acceptance.

- One lifecycle now owns initial encounter lookup and retries. Only its newest
  request can publish a decision or error; cleanup rejects late completions.
  Patient/provider/encounter-type changes immediately hide the old hook result,
  including A-to-B-to-A navigation. Old callbacks cannot fetch a replaced context
  or update an unmounted hook. Missing context remains pending and non-actionable.
- Starting shared-store loading clears the previous encounter and eligibility.
  The header keeps its existing loading skeleton, and its saved-event listener
  tracks the current retry callback. No new dependency or transport cancellation
  layer was added; obsolete requests may finish but cannot publish their result.
- Eleven initial hook regressions and the pending-store regression failed before
  correction. Focused verification now passes 168 clinical tests and one snapshot,
  plus 181 service tests, in India and US Pacific time. Header integration tests
  use the real hook/store with deferred transport responses for patient, provider
  and type changes. They verify pending non-eligibility and rejection of a late
  retry after a newer decision. Additional tests retain a newer failure after an
  older success and reject post-unmount completions.
- Service/clinical type checks, changed-source lint and builds pass. Existing
  duplicate-mock, consultation act/CDSS warnings, upstream form-renderer eval and
  large bundles remain. The actual-source read-only native verifier still passes
  paginated selection, saved-ID validation, index-lag and failure checks, with
  full records unchanged. Its native reads do not prove browser response-order
  races; those are covered by controlled regression tests in this checkpoint.

Remaining: submitted-form failure handling, other context/draft/permission
transitions, noncoded/configured condition details, concurrent native writes,
broader React workflows and the separate-product redesign/acceptance. No clinical
write, staff privilege change or production/shared-demo deployment occurred.

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
