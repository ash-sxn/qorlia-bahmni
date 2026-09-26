# Clinical workspace design QA

Reference: `docs/assets/qorlia-calm-clinical-concept.png` (1680 × 941). Implementation: local `/bahmni-v2/design-preview`, checked in the in-app browser at 1680 × 941 and at a narrow 814 px viewport on 24 September 2026. The browser capture is visible in the task but was not saved to this repository.

The implemented layout follows the reference's Qorlia header, dark navigation, queue table, right-hand summary cards, green primary actions and calm clinical palette. At narrow width the navigation becomes horizontal and the summary cards move below the queue. Search, status filters, consultation dialog and sample completion were exercised in the browser.

Intentional differences: the preview adds a `CLINICAL WORKSPACE` label and a visible sample-data note; patient IDs are shown instead of asserting that they are UHIDs; counts reflect the five sample records rather than the reference's illustrative 17 visits. The reference's three-dot row menu is omitted because it has no defined actions. These choices avoid implying a working clinical backend where none exists.

Open before production: connect the interface to Bahmni's actual role-aware clinical routes and data, replace preview-only notices with real actions, verify keyboard and screen-reader use against real workflows, and test each hospital theme and approved logo. The existing live Bahmni Standard demo has not been changed.

## Connected clinical landing, 25 September 2026

Reference: the same calm clinical concept. Implementation: local `/bahmni-v2/clinical`, checked in the signed-in in-app browser at 1672 × 940 and 390 × 844. The local site uses the existing Qorlia design tokens and shared header. No public demo deployment changed.

The live layout preserves the reference's dark navigation, central work area and summary rail. The central queue becomes a real appointment list and a patient search, with no fabricated names or counts. The current demo returned zero appointments, so the empty state is displayed. Patient search returned two synthetic records and the first record opened its React consultation page. The right-side Find a patient action focuses the search field. The mobile layout keeps navigation scrollable and moves summary cards below the work area. Automated accessibility and route tests passed.

Intentional differences from the visual reference: the shared app header is shorter; the summary omits a named clinician because that role was not verified; and the appointment table is empty because the backend returned no records. These are preferable to presenting fictional queue data as live information.

Result: passed for the connected clinical landing. Full clinical parity is not passed. The current demo backend rejects several newer FHIR queries and the consultation page still displays errors for affected sections. See `docs/FEATURE_PARITY.md` before redirecting the public Clinical tile.
