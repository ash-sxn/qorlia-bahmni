# Clinical workspace design QA

Reference: `docs/assets/qorlia-calm-clinical-concept.png` (1680 × 941). Implementation: local `/bahmni-v2/design-preview`, checked in the in-app browser at 1680 × 941 and at a narrow 814 px viewport on 24 September 2026. The browser capture is visible in the task but was not saved to this repository.

The implemented layout follows the reference's Qorlia header, dark navigation, queue table, right-hand summary cards, green primary actions and calm clinical palette. At narrow width the navigation becomes horizontal and the summary cards move below the queue. Search, status filters, consultation dialog and sample completion were exercised in the browser.

Intentional differences: the preview adds a `CLINICAL WORKSPACE` label and a visible sample-data note; patient IDs are shown instead of asserting that they are UHIDs; counts reflect the five sample records rather than the reference's illustrative 17 visits. The reference's three-dot row menu is omitted because it has no defined actions. These choices avoid implying a working clinical backend where none exists.

Open before production: connect the interface to Bahmni's actual role-aware clinical routes and data, replace preview-only notices with real actions, verify keyboard and screen-reader use against real workflows, and test each hospital theme and approved logo. The existing live Bahmni Standard demo has not been changed.
