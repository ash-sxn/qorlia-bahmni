// Qorlia voice dictation: append these lines to
// openmrs/apps/customDisplayControl/js/customControl.js in the Bahmni config.
// The classic clinical app already loads that file, so no Bahmni code changes.
(function () {
  var script = document.createElement('script');
  script.src = '/qorlia-voice/voice.js';
  script.defer = true;
  document.head.appendChild(script);
})();
