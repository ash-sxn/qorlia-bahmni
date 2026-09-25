# Bahmni workflow parity ledger

This is an implementation ledger, not a claim that the redesign is complete. It compares the official Standard home configuration at commit `f39d186eb9e610d5f219d44ecc5e14b3e615c0db` with this fork's React routes. Recheck it against the authenticated Qorlia Standard demo before changing any default link. A working page title or successful build does not prove a clinical workflow.

| Standard module or workflow | Current React coverage in this repository | Remaining proof or implementation |
| --- | --- | --- |
| Home and role-filtered module tiles | `/bahmni-v2/home/` reads `home/v2/extension.json` and user privileges. | Authenticate, compare visible tiles and links against Standard for each role. |
| Registration and patient search | `/bahmni-v2/registration/search`, `/patient/new`, and `/patient/:patientUuid` use the registration config and OpenMRS services. | Test search, create, edit, validation, visit and role rules against synthetic patients. |
| Clinical patient search and consultation | `/bahmni-v2/clinical/` and `/:patientUuid` use clinical config, patient and encounter services. | Compare all configured sections, orders, medications, notes, saved-state and error flows with legacy clinical UI. The official Standard home tile still points to legacy clinical. |
| Appointments | React admin service and unavailability screens exist. Patient appointment search now uses the backend's list response. `/bahmni-v2/appointments/` is only a placeholder. | Build or integrate scheduling, calendars, booking, check-in, status changes and patient/provider views. The official home tile points to the separate legacy appointment frontend. |
| Reports | `/bahmni-v2/reports/` has Reports and My Reports tabs, but both contain placeholder text. | Connect report catalog, run, results, exports and permissions to real reporting services, or keep the legacy link until parity is proven. |
| Patient documents | `/bahmni-v2/patient-documents/:patientUuid` fetches patient and encounter data and mounts document components. | Test upload, view, search, permissions and radiology-specific document rules. The search breadcrumb still targets legacy document upload. |
| Admin | React dashboard tiles and CSV upload exist. | Follow each configured admin tile to its actual target, then test or rebuild the legacy administration workflows. |
| Programs, inpatient/bed management, operation theatre and orders | No corresponding React route in this repository. | Inventory the current screens, data sources, permissions and writes before rebuilding them. Do not redirect these tiles to a placeholder. |
| Laboratory, stock, billing, radiology and analytics | Separate OpenELIS, Odoo, PACS and reporting applications or legacy routes. | Reskin and verify each separately after the React app, preserving license notices and product-specific behavior. |
| Implementer interface and AtomFeed console | No React route in this repository. | Treat as operator tools, not patient-facing navigation; verify their service health and access controls separately. |

For every migrated workflow, the release gate is the same: compare old and new screens for each role, map every read and write to the same backend API or a documented equivalent, exercise success and failure paths with synthetic data, verify audit and permission boundaries, then switch the tile link. Until then, keep the working legacy route available. Do not infer parity from shared CSS or from the static design preview.
