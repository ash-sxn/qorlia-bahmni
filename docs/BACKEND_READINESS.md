# Qorlia React frontend backend readiness

Checked 25 September 2026 against the synthetic demo at `demo-bahmni.qorlia.com`. This is a development check, not a production release gate.

The React frontend already uses the Bahmni/OpenMRS service layer for patient search, registration, consultation, appointments, documents, administration and reports. It needs matching V2 deployment configuration before those screens can be exercised end to end. The current public demo serves legacy clinical configuration but not the V2 files requested by this fork.

| Request | Result | Meaning |
| --- | --- | --- |
| `/openmrs/ws/rest/v1/session` | 200 | OpenMRS API responds; authentication is still required for patient data. |
| `/openmrs/ws/fhir2/R4/metadata` | 200 | FHIR R4 API responds. |
| `/bahmni_config/openmrs/apps/home/v2/extension.json` | 404 | React home cannot load its role-filtered module tiles. |
| `/bahmni_config/openmrs/apps/clinical/v2/app.json` | 404 | React clinical configuration is missing. |
| `/bahmni_config/openmrs/apps/registration/v2/app.json` | 404 | React registration configuration is missing. |
| `/bahmni_config/openmrs/apps/clinical/app.json` | 200 | The older Bahmni UI configuration is present. |

The official Bahmni `standard-config` repository does contain V2 files for home, clinical, registration, appointments, admin and command palette. Its current commit `f39d186eb9e610d5f219d44ecc5e14b3e615c0db` is a local development candidate, not proof that its concepts and privileges match this older demo installation. The development proxy can serve those pinned files without copying them into this public fork or changing the demo server. Do not substitute `clinic-config` for this hospital distribution. The next integration step is to test the official Standard config against authenticated synthetic patient search, encounter editing, appointments and role boundaries, then create a separate staging configuration if mismatches remain.

Local check on 25 September: the development server returned valid pinned Standard V2 JSON for home, clinical and registration. The same proxy returned the demo's OpenMRS session response with `authenticated: false`, proving that API traffic still reaches the demo but not that an authenticated screen works. The real React home route redirected to the proxied Bahmni login page. No patient or encounter workflow has passed end-to-end testing yet.

OpenELIS laboratory, Odoo billing and DCM4CHEE radiology are separate applications. Their UI and APIs are not part of this React repository, so the shared styling here does not reskin them.
