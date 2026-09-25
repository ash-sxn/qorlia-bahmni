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

Do not copy the clinic-config V2 files blindly into a hospital installation. They contain workflow, concept and privilege choices that need to match that installation. The next integration step is a separate staging configuration derived from the correct Bahmni distribution, followed by authenticated checks of patient search, encounter editing, appointments and role boundaries. The public demo is not changed by this frontend fork.

OpenELIS laboratory, Odoo billing and DCM4CHEE radiology are separate applications. Their UI and APIs are not part of this React repository, so the shared styling here does not reskin them.
