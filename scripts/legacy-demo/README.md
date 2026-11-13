# Legacy demo disposition locale repair

This does not change the redesigned React app or the backend. It repairs the two disposition readers in the current, pinned AngularJS demo bundle. The original service unconditionally reads `currentUser.userProperties.defaultLocale`. If that property is absent, Angular omits `locale`, and Bahmni Core's `patientWithLocale` endpoint returns HTTP 500.

The patch retains a saved language preference, otherwise uses Angular Translate's selected language, then English. It does not suppress server errors, change clinical records, or bypass authorization.

Upstream source: [dispositionService.js](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/master/ui/app/common/domain/services/dispositionService.js). The upstream source and this patch remain under the applicable MPL terms, with existing notices retained.

```sh
node --test scripts/legacy-demo/patch-disposition-locale.test.cjs
node scripts/legacy-demo/patch-disposition-locale.cjs ORIGINAL.js NEW.js
node --check NEW.js
```

The patch refuses unknown, duplicate, and already-patched bundle shapes. Keep the original assets, mount the new bundle read-only, and reference its new filename from the clinical index to avoid stale browser caches. Do not overwrite the original bundle or upgrade the entire stack to fix this one caller.

Deployment and rollback details are kept in private operator notes. Any future recreation of the demo web service must include the locale overlay. A future upstream frontend upgrade needs a fresh compatibility review; do not apply this patch blindly to another build.
