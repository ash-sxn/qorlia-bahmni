# Qorlia React frontend backend readiness

Updated 1 October 2026. The local React review build uses the existing synthetic demo backend at `demo-bahmni.qorlia.com`. No redesigned frontend or backend upgrade has been deployed there. This is development evidence, not a production release gate.

## Verified synthetic workflows

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
- Clinical consultation saving calls `/openmrs/ws/fhir2/R4/EncounterBundle`. The shared backend returns 404 (unknown resource). Its installed `fhir2` version is 2.1.0; `fhir2Extensions` is not the additional module implementing this resource. The official [Bahmni additional FHIR extension](https://github.com/Bahmni/bahmni-module-fhir2-addl-extension) must be evaluated with matching dependency versions in an isolated staging backend. Installing its newer dependency set into the shared demo is not an approved or verified upgrade. Do not replace the transaction with independent browser writes that can leave a half-saved consultation.
- FHIR `DocumentReference`, `Appointment` and `ImagingStudy` are unavailable on this backend. Documents and appointments use their existing Bahmni APIs; some legacy medication reads are read-only. Missing imaging enrichment is not proof of a PACS failure.
- TB's `ID Number` attribute metadata still uses `[0-9]*`. `ABC200013` is not accepted as its program ID. This needs an approved metadata change, not a global frontend override. Enrollment responses also omit `allowedStates`; the UI reports that next-state selection is unavailable rather than inventing a transition.
- OT write payloads must exclude GET-only bed, observation and resource metadata fields. This is covered by a regression test for active and retained cancelled appointments. One rejected HTTP 400 edit nevertheless persisted its note on the older module. Re-read after ambiguous failures before retrying. Supported writable fields are documented in the official [surgical appointment resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentResource.java) and [attribute resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentAttributeResource.java).

## Release boundary

An isolated staging backend uses the official public demo seed, separate database/file volumes, an internal-only network and resource caps. It does not copy the shared demo or hospital data. Its frontend uses a separate loopback hostname/session. The pinned image contains FHIR2 2.5.1 and the additional extension 1.0.0; its bundled core is a snapshot, so staging instead mounts the checksum-verified OpenMRS 2.6.15 WAR specified by the official [Bahmni 1.2.0 release definition](https://github.com/Bahmni/openmrs-distro-bahmni/blob/1.2.0/distro/pom.xml).

### Isolated staging API checkpoint

- OpenMRS session and FHIR capability APIs return 200. FHIR2 and its additional extension report `started: true` through the module API.
- A direct API `EncounterBundle` transaction saved one consultation and a synthetic weight observation for `QorliaQA StageClinical Synthetic`. Subsequent FHIR and REST reads returned the weight and its consultation/visit association.
- A second transaction containing an invalid observation returned 400. Re-reading the test patient's encounters and observations confirmed unchanged counts, with no orphan encounter left behind.
- These are backend integration checks, not browser save proof. The React consultation form must still submit successfully and display persisted data after reload before clinical parity is claimed.
- Metadata initialization completed but logged concept-import and location-attribute errors. Startup success does not establish that every Standard form, concept or workflow is available; those mappings still need targeted checks.

The production frontend build and local login tests pass. Bundles and service-worker precaching remain large (40.4 MB across 113 precached URLs); build success is not a performance release gate.

`/bahmni-v2/login` and `/bahmni-v2/home/` are the local review entry points. The local legacy home URL redirects there. Implemented module tiles stay within React; full legacy tools remain available where parity is incomplete. Check the detailed [feature parity ledger](FEATURE_PARITY.md) before switching production defaults.

Still needed: complete consultation transactions on a compatible staging backend, populated order-result writes, program lifecycle/state writes, reports generation/download/deletion, administrative imports and order-set writes, remaining advanced OT/IPD/appointment actions, and role-specific permission/error checks.

OpenELIS laboratory, Odoo billing, DCM4CHEE radiology and the external analytics/outreach applications remain separate products. Reskinning this React repository does not redesign them. They are the next phase after React workflow parity.
