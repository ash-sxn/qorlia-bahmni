'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { patchDispositionLocale } = require('./patch-disposition-locale.cjs');
const original = 'angular.module("bahmni.common.domain").factory("dispositionService",["$http","$rootScope",function($http,$rootScope){return{getDispositionByVisit:function(visitUuid){return $http.get("visit",{params:{visitUuid:visitUuid,locale:$rootScope.currentUser.userProperties.defaultLocale}})},getDispositionByPatient:function(patientUuid,numberOfVisits){return $http.get("patient",{params:{patientUuid:patientUuid,numberOfVisits:numberOfVisits,locale:$rootScope.currentUser.userProperties.defaultLocale}})}}}]),angular.module("bahmni.common.domain").service("visitDocumentService",[]);';

for (const [name, user, selected, expected] of [
  ['saved language retained', { userProperties: { defaultLocale: 'hi' } }, 'en', 'hi'],
  ['selected language used', { userProperties: {} }, 'hi', 'hi'],
  ['missing properties handled', {}, 'en', 'en'],
  ['missing user handled', undefined, 'hi', 'hi'],
  ['English fallback', { userProperties: {} }, undefined, 'en'],
  ['empty preference handled', { userProperties: { defaultLocale: '' } }, 'hi', 'hi'],
]) {
  test(name, () => {
    let definition;
    const module = { factory(_name, deps) { definition = deps; return module; }, service() { return module; } };
    vm.runInNewContext(patchDispositionLocale(original), { angular: { module() { return module; } } });
    assert.deepEqual(Array.from(definition.slice(0, -1)), ['$http', '$rootScope', '$translate']);
    const requests = [];
    const service = definition.at(-1)({ get(url, opts) { requests.push({ url, opts }); } }, { currentUser: user }, { use() { return selected; } });
    service.getDispositionByVisit('visit-qa');
    service.getDispositionByPatient('patient-qa', 1);
    assert.equal(requests[0].opts.params.visitUuid, 'visit-qa');
    assert.equal(requests[1].opts.params.patientUuid, 'patient-qa');
    assert.equal(requests[1].opts.params.numberOfVisits, 1);
    requests.forEach(request => assert.equal(request.opts.params.locale, expected));
  });
}
test('unknown, duplicate, or already patched builds fail closed', () => {
  assert.throws(() => patchDispositionLocale('different bundle'));
  assert.throws(() => patchDispositionLocale(original + original));
  assert.throws(() => patchDispositionLocale(patchDispositionLocale(original)));
  assert.throws(() => patchDispositionLocale(original.replace('locale:$rootScope.currentUser.userProperties.defaultLocale', 'locale:"en"')));
});
