# Module learning and ownership guide

[README](../README.md) · [Previous: repository map](project-structure.md) · [Next: API integration](api-integration-guide.md)

All paths below are under the normal `/bahmni-v2` browser base. Visibility depends on installation configuration and native privileges. Source paths describe implementation locations, not completion claims. Confirm the route on your assigned branch.

| Workflow          | Route or entry                                                                      | Source to read first                                                                                                           | Native questions to answer                                                          |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Login/location    | `/login`                                                                            | [LoginPage](../distro/src/app/LoginPage.tsx)                                                                                   | Which account, session, location and expiry?                                        |
| Home/Billing      | `/home/`, `/home/billing`                                                           | [Home routes](../apps/home/src/routes/index.tsx), [Billing](../apps/home/src/components/Billing/)                              | Which privileges, ERP session and company?                                          |
| Registration      | `/registration/search`, `/registration/patient/new`                                 | [Registration routes](../apps/registration/src/routes/index.tsx)                                                               | Identifier, duplicates, required attributes and visit behaviour?                    |
| Consultation      | `/clinical/`, `/clinical/:patientUuid`                                              | [Clinical routes](../apps/clinical/src/routes/index.tsx), [consultation pad](../apps/clinical/src/components/consultationPad/) | Correct patient/visit/encounter/provider and save recovery?                         |
| Programmes        | `/clinical/programs`, optionally a patient UUID                                     | [ProgramsPage](../apps/clinical/src/pages/ProgramsPage.tsx)                                                                    | Programme configuration, attribute format, states and enrolment?                    |
| Orders            | `/clinical/orders`, patient/order-type variants                                     | [OrdersPage](../apps/clinical/src/pages/OrdersPage.tsx)                                                                        | Order type, concept, status and authorized edit/stop?                               |
| Bed management    | `/clinical/beds`                                                                    | [BedManagement](../apps/clinical/src/pages/BedManagement.tsx)                                                                  | Ward, bed availability, assignment and native permissions?                          |
| Inpatient         | `/clinical/inpatient`, patient variant                                              | [Inpatient list](../apps/clinical/src/pages/InpatientPatientList.tsx)                                                          | Admission, transfer and discharge identities?                                       |
| Operation theatre | `/clinical/operation-theatre`, new/block variants                                   | [theatre page](../apps/clinical/src/pages/OperationTheatrePage.tsx)                                                            | Theatre/surgeon grouping, configured week start, block versus surgery cancellation? |
| Appointments      | `/appointments/list`, `/appointments/calendar`, service settings under the same app | [routes](../apps/appointments/src/routes/index.tsx), [pages](../apps/appointments/src/pages/)                                  | Native time zone, service/provider, conflicts, capacity and transitions?            |
| Patient Documents | `/patient-documents/*`                                                              | [routes](../apps/patient-documents/src/routes/index.tsx)                                                                       | Correct patient, file type, access, upload and reference?                           |
| Administration    | `/admin/*`                                                                          | [routes](../apps/admin/src/routes/index.tsx)                                                                                   | CSV permissions, audit visibility, order-set behaviour?                             |
| Reports           | `/reports/`, `/reports/my-reports`                                                  | [routes](../apps/reports/src/routes/index.tsx), [runtime](../runtime/reports/README.md)                                        | Queue, schedule, template, format, download and cancel/delete?                      |
| Shared command UI | configured shortcut                                                                 | [command-palette source](../apps/command-palette/src/)                                                                         | Which commands are configured/allowed and where do they lead?                       |

Laboratory/OpenELIS, radiology/PACS, analytics and outreach are separate integration lanes. Integration/implementer tools may use configured legacy or separate-product destinations. Do not imply they have complete new screens because a home tile exists. Record external destinations and gaps in [Feature parity](FEATURE_PARITY.md).

## A module audit should produce this table

| User action                     | Native behaviour                           | New UI behaviour                   | API/configuration                       | Evidence                        | Remaining gap                  |
| ------------------------------- | ------------------------------------------ | ---------------------------------- | --------------------------------------- | ------------------------------- | ------------------------------ |
| Example: reschedule appointment | configured transitions and conflict checks | observed result, not an assumption | endpoint, payload keys, relevant config | synthetic save/reload and tests | specific discrepancy or no gap |

Cover navigation, list/search/paging, creation, editing, status changes, cancel/delete, print/download and administration where the native module provides them. Include hidden/denied roles, loading, empty results, errors and expiry. Do not invent actions simply to fill the table.

## Current work split

Billing/native accounting, shared authentication/gateway and encounter recovery remain coordinated integration work. [Issue 3](https://github.com/ash-sxn/qorlia-bahmni/issues/3) is the proposed Appointments starter task. New developers should receive a named, bounded workflow after skills, availability and setup are confirmed.

One module can have several small tasks, but one shared file/API needs an agreed owner at a time. Do not split money calculations or encounter recovery casually between parallel branches. Team allocation and reporting are in [Team workflow](team-workflow.md).
