# @bahmni/patient-documents-app

[Project README](../../README.md) · [Setup](../../docs/setup-guide.md) · [API rules](../../docs/api-integration-guide.md)

## Responsibility and entry points

Patient search and a patient's document view live under `/bahmni-v2/patient-documents/`. Start with [routes](src/routes/index.tsx), [DocumentAccess](src/components/DocumentAccess.tsx) and [pages](src/pages/). Follow the [document reference/write service](../../packages/bahmni-services/src/documentReferenceService/) and [upload service](../../packages/bahmni-services/src/documentUploadService/). Selected native runtime source is under [runtime/patient-documents](../../runtime/patient-documents/).

An uploaded file and its clinical reference are different parts of a workflow. Preserve the correct patient UUID, native authorization, file restrictions and reference semantics. Do not treat binary uploads/downloads as ordinary JSON, or expose files through unprotected URLs.

## Change and verify

Use [testing](../../docs/testing-guide.md) with `apps/patient-documents/jest.config.ts` and `apps/patient-documents/tsconfig.lib.json`, from repository root. Use approved synthetic documents only. Check upload, native reference/read-back, display/download, invalid files, denied access, expiry and interrupted work. Inspect the relevant adjacent tests under [src](src/) and the shared service before changing either side. See [parity](../../docs/FEATURE_PARITY.md) for scoped acceptance.
