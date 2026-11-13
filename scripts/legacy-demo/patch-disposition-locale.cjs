// SPDX-License-Identifier: MPL-2.0
// A targeted compatibility patch for the pinned legacy demo, not the React app.
'use strict';
const { readFileSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');

function patchDispositionLocale(bundle) {
  const start = 'angular.module("bahmni.common.domain").factory("dispositionService",["$http","$rootScope",function($http,$rootScope){';
  const end = 'angular.module("bahmni.common.domain").service("visitDocumentService",';
  assert.equal(bundle.split(start).length, 2, 'Expected exactly one known disposition service. Refuse an unknown build.');
  const begin = bundle.indexOf(start);
  const finish = bundle.indexOf(end, begin);
  assert(finish > begin, 'Disposition service boundary not found.');
  const original = bundle.slice(begin, finish);
  const locale = 'locale:$rootScope.currentUser.userProperties.defaultLocale';
  assert.equal(original.split(locale).length, 3, 'Expected visit and patient locale callers.');
  const patched = original
    .replace(start, start.replace('"$rootScope",function($http,$rootScope)', '"$rootScope","$translate",function($http,$rootScope,$translate)'))
    .split(locale).join('locale:($rootScope.currentUser&&$rootScope.currentUser.userProperties&&$rootScope.currentUser.userProperties.defaultLocale)||$translate.use()||"en"');
  return bundle.slice(0, begin) + patched + bundle.slice(finish);
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  assert(input && output && input !== output, 'Usage: node patch-disposition-locale.cjs ORIGINAL.js NEW.js');
  writeFileSync(output, patchDispositionLocale(readFileSync(input, 'utf8')), { flag: 'wx' });
}
module.exports = { patchDispositionLocale };
