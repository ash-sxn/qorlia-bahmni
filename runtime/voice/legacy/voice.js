/*
 * Qorlia voice dictation for the classic Bahmni clinical screens.
 *
 * Adds a microphone button. The doctor clicks into any notes box, presses the
 * button and speaks; the words are typed into that box every few seconds. The first
 * use shows a notice naming the speech service, which the doctor must accept.
 * Plain browser JavaScript, no build step: it is loaded by the clinical app's
 * customControl.js and talks only to /qorlia-voice on the same address.
 */
(function () {
  'use strict';
  if (window.__qorliaVoice) return;
  window.__qorliaVoice = true;
  if (!/\/bahmni\/clinical\//.test(window.location.pathname)) return;

  var API = '/qorlia-voice';
  var MAX_SEGMENT_MS = 25000;
  var MIN_SEGMENT_MS = 6000;
  var PAUSE_MS = 700;
  var LANGUAGE_KEY = 'qorlia.voice.language';

  var config = null;
  var target = null;
  var recorder = null;
  var queue = Promise.resolve();
  var pending = 0;
  var ui = {};

  function storedLanguage() {
    try {
      return window.localStorage.getItem(LANGUAGE_KEY) || 'en-IN';
    } catch (e) {
      return 'en-IN';
    }
  }

  function remember(language) {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch (e) {
      /* only a convenience */
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'style') node.style.cssText = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function isEditable(node) {
    if (!node || node.disabled || node.readOnly) return false;
    if (node.tagName === 'TEXTAREA') return true;
    return (
      node.tagName === 'INPUT' && /^(text|search|)$/i.test(node.type || '')
    );
  }

  document.addEventListener(
    'focusin',
    function (event) {
      if (!ui.box || ui.box.contains(event.target) || !isEditable(event.target))
        return;
      target = event.target;
      if (recorder) setStatus(listeningText());
    },
    true,
  );

  function insertText(text) {
    if (!text) return;
    if (!target || !document.body.contains(target)) {
      setStatus(
        'Click into a notes box: the last words were not placed.',
        true,
      );
      return;
    }
    var start =
      target.selectionStart == null
        ? target.value.length
        : target.selectionStart;
    var end = target.selectionEnd == null ? start : target.selectionEnd;
    var before = target.value.slice(0, start);
    var spacer = before && !/\s$/.test(before) ? ' ' : '';
    target.setRangeText(spacer + text, start, end, 'end');
    // AngularJS reads the box on these events, so the consultation saves the text.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setStatus(message, isError) {
    ui.status.textContent = message || '';
    ui.status.style.color = isError ? '#a2191f' : '#161616';
    ui.status.hidden = !message;
  }

  function listeningText() {
    return target
      ? 'Listening. Text appears in the selected box every few seconds.'
      : 'Listening. Click into the notes box where the text should go.';
  }

  function request(path, options) {
    options = options || {};
    options.credentials = 'same-origin';
    return fetch(API + path, options).then(function (response) {
      if (response.status === 204) return null;
      return response.json().then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || 'failed');
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function errorText(error) {
    switch (error && error.message) {
      case 'not_signed_in':
        return 'Your Bahmni session has ended. Sign in again to dictate.';
      case 'not_allowed':
        return 'Your account cannot use voice dictation.';
      case 'too_many':
        return 'Voice dictation limit reached for this hour. Please type for now.';
      case 'service_busy':
      case 'service_unreachable':
        return 'The speech service is busy. Try again in a minute.';
      case 'switched_off':
      case 'not_configured':
        return 'Voice dictation is switched off on this server.';
      default:
        return 'Some words could not be turned into text. Please check the note.';
    }
  }

  /* Recording: one short recording per phrase, cut at a pause, so each can be sent on its own. */
  function startRecording(language) {
    var options = {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    };
    return navigator.mediaDevices.getUserMedia(options).then(function (stream) {
      var types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      var mimeType = types.filter(function (type) {
        return window.MediaRecorder && MediaRecorder.isTypeSupported(type);
      })[0];
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      var context = new AudioContextClass();
      var analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      var samples = new Float32Array(analyser.fftSize);

      var state = { stopped: false, segment: null };

      function newSegment() {
        var options = { audioBitsPerSecond: 32000 };
        if (mimeType) options.mimeType = mimeType;
        var media = new MediaRecorder(stream, options);
        var parts = [];
        var segment = {
          media: media,
          started: Date.now(),
          lastVoice: 0,
          voiced: false,
        };
        media.ondataavailable = function (event) {
          if (event.data && event.data.size) parts.push(event.data);
        };
        media.onstop = function () {
          if (segment.voiced && parts.length) {
            send(
              new Blob(parts, {
                type: media.mimeType || mimeType || 'audio/webm',
              }),
              language,
            );
          }
        };
        media.start();
        state.segment = segment;
      }

      var timer = window.setInterval(function () {
        var segment = state.segment;
        if (!segment) return;
        analyser.getFloatTimeDomainData(samples);
        var sum = 0;
        for (var i = 0; i < samples.length; i += 1)
          sum += samples[i] * samples[i];
        var level = Math.sqrt(sum / samples.length);
        var time = Date.now();
        if (level > 0.015) {
          segment.voiced = true;
          segment.lastVoice = time;
        }
        var age = time - segment.started;
        var paused = segment.voiced && time - segment.lastVoice > PAUSE_MS;
        if (age > MAX_SEGMENT_MS || (age > MIN_SEGMENT_MS && paused)) {
          segment.media.stop();
          newSegment();
        }
      }, 100);

      newSegment();
      return {
        stop: function () {
          if (state.stopped) return;
          state.stopped = true;
          window.clearInterval(timer);
          if (state.segment) state.segment.media.stop();
          stream.getTracks().forEach(function (track) {
            track.stop();
          });
          context.close();
        },
      };
    });
  }

  function send(blob, language) {
    pending += 1;
    render();
    var job = fetch(API + '/transcribe?lang=' + encodeURIComponent(language), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': blob.type.split(';')[0] },
      body: blob,
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || 'failed');
          throw error;
        }
        return body.text;
      });
    });
    // Text is placed in the order it was spoken, even if replies arrive out of order.
    queue = queue
      .then(function () {
        return job;
      })
      .then(insertText, function (error) {
        setStatus(errorText(error), true);
        if (
          error.message === 'not_signed_in' ||
          error.message === 'consent_needed'
        )
          stop();
      })
      .then(function () {
        pending -= 1;
        render();
      });
  }

  function start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus(
        'This browser cannot record. Use a recent Chrome, Edge or Firefox.',
        true,
      );
      return;
    }
    var language = ui.language.value;
    remember(language);
    ui.button.disabled = true;
    startRecording(language)
      .then(function (handle) {
        recorder = handle;
        setStatus(listeningText());
      })
      .catch(function () {
        setStatus(
          'The microphone is blocked. Allow it in the browser address bar and try again.',
          true,
        );
      })
      .then(function () {
        ui.button.disabled = false;
        render();
      });
  }

  function stop() {
    if (recorder) recorder.stop();
    recorder = null;
    setStatus(pending ? 'Finishing the last words...' : '');
    render();
  }

  function render() {
    var on = Boolean(recorder);
    ui.button.textContent = on ? 'Stop dictation' : 'Dictate';
    ui.button.setAttribute('aria-pressed', on ? 'true' : 'false');
    ui.button.style.background = on ? '#da1e28' : '#0f62fe';
    ui.dot.style.display = on ? 'inline-block' : 'none';
    ui.language.disabled = on;
    ui.working.hidden = pending === 0;
    if (!on && pending === 0 && /Finishing/.test(ui.status.textContent))
      setStatus('');
  }

  /* The notice. It names the service and must be accepted once per user and version. */
  function showNotice() {
    var service = config.service;
    var checkbox = el('input', { type: 'checkbox', id: 'qorlia-voice-agree' });
    var agree = el('button', {
      type: 'button',
      text: 'Agree and start',
      disabled: 'disabled',
      style: buttonStyle('#0f62fe'),
    });
    var cancel = el('button', {
      type: 'button',
      text: 'Cancel',
      style: buttonStyle('#6f6f6f'),
    });
    var points = service.outside
      ? [
          'While you dictate, the recording is sent to ' +
            service.name +
            ' (' +
            service.country +
            ') to turn speech into text. Nothing is sent when the microphone is off.',
          'Qorlia does not keep the recording. The text only goes into the box you selected, and is saved only when you save the consultation.',
          'Do not say the patient’s name, phone number or ID numbers. Describe complaints, findings and medicines.',
          'Check every word before saving. Speech recognition makes mistakes, especially with medicine names and doses.',
          'Tell the patient that you are using voice dictation.',
        ]
      : [
          'The recording is turned into text on this hospital’s Qorlia server and is not kept.',
          'Check every word before saving. Speech recognition makes mistakes, especially with medicine names and doses.',
        ];
    var list = el(
      'ul',
      { style: 'margin:0 0 12px 18px;padding:0;list-style:disc' },
      points.map(function (point) {
        return el('li', { text: point, style: 'margin:0 0 6px' });
      }),
    );
    var children = [
      el('h2', {
        id: 'qorlia-voice-title',
        text: 'Before you use voice dictation',
        style: 'margin:0 0 12px;font-size:20px',
      }),
      list,
    ];
    if (service.policyUrl) {
      children.push(
        el('p', { style: 'margin:0 0 12px' }, [
          el('a', {
            href: service.policyUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: service.name + ' privacy policy',
          }),
        ]),
      );
    }
    children.push(
      el(
        'label',
        {
          for: 'qorlia-voice-agree',
          style: 'display:flex;gap:8px;align-items:flex-start;margin:0 0 16px',
        },
        [
          checkbox,
          el('span', {
            text: 'I have read this and agree to send my dictation for transcription.',
          }),
        ],
      ),
    );
    children.push(
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, [
        cancel,
        agree,
      ]),
    );
    var dialog = el(
      'div',
      {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'qorlia-voice-title',
        style:
          'background:#fff;color:#161616;max-width:560px;width:calc(100% - 32px);padding:24px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)',
      },
      children,
    );
    var overlay = el(
      'div',
      {
        style:
          'position:fixed;inset:0;background:rgba(22,22,22,.5);display:flex;align-items:center;justify-content:center;z-index:100001',
      },
      [dialog],
    );

    function close() {
      overlay.remove();
      // Back to the notes box, so the doctor sees where the words will go.
      if (target && document.body.contains(target)) target.focus();
      else ui.button.focus();
    }
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) agree.removeAttribute('disabled');
      else agree.setAttribute('disabled', 'disabled');
    });
    cancel.addEventListener('click', close);
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });
    agree.addEventListener('click', function () {
      agree.setAttribute('disabled', 'disabled');
      request('/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: config.consentVersion,
          accepted: true,
          app: 'legacy',
        }),
      })
        .then(function () {
          config.consented = true;
          close();
          start();
        })
        .catch(function (error) {
          close();
          setStatus(errorText(error), true);
        });
    });
    document.body.appendChild(overlay);
    checkbox.focus();
  }

  function buttonStyle(color) {
    return (
      'background:' +
      color +
      ';color:#fff;border:0;padding:10px 16px;font:inherit;cursor:pointer;min-height:40px'
    );
  }

  function onButton() {
    if (recorder) {
      stop();
      return;
    }
    if (!config.consented) {
      showNotice();
      return;
    }
    start();
  }

  function build() {
    ui.button = el('button', {
      type: 'button',
      'aria-pressed': 'false',
      style:
        buttonStyle('#0f62fe') +
        ';border-radius:20px;padding:10px 18px;box-shadow:0 2px 6px rgba(0,0,0,.3)',
    });
    // Keep the cursor in the notes box when the button is pressed.
    ui.button.addEventListener('mousedown', function (event) {
      event.preventDefault();
    });
    ui.button.addEventListener('click', onButton);
    ui.dot = el('span', {
      'aria-hidden': 'true',
      style:
        'width:10px;height:10px;border-radius:50%;background:#da1e28;display:inline-block;animation:qorliaVoicePulse 1s infinite',
    });
    ui.language = el(
      'select',
      {
        'aria-label': 'Dictation language',
        style:
          'font:inherit;padding:8px;min-height:40px;border:1px solid #8d8d8d;background:#fff',
      },
      config.languages.map(function (language) {
        return el('option', { value: language.code, text: language.label });
      }),
    );
    ui.language.value = storedLanguage();
    if (!ui.language.value) ui.language.value = config.languages[0].code;
    ui.working = el('span', {
      text: 'Writing...',
      style: 'font-size:12px;color:#525252',
    });
    ui.status = el('p', {
      role: 'status',
      'aria-live': 'polite',
      style:
        'margin:0;max-width:260px;font-size:13px;background:#fff;padding:6px 8px;box-shadow:0 2px 6px rgba(0,0,0,.2)',
    });
    ui.box = el(
      'div',
      {
        'data-qorlia-voice': '',
        style:
          'position:fixed;right:16px;bottom:16px;z-index:100000;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font:14px/1.4 system-ui,sans-serif',
      },
      [
        ui.status,
        el('div', { style: 'display:flex;gap:6px;align-items:center' }, [
          ui.working,
          ui.dot,
          ui.language,
          ui.button,
        ]),
      ],
    );
    var style = el('style', {
      text: '@keyframes qorliaVoicePulse{0%,100%{opacity:1}50%{opacity:.25}}@media print{[data-qorlia-voice]{display:none!important}}',
    });
    document.head.appendChild(style);
    document.body.appendChild(ui.box);
    setStatus('');
    render();
  }

  function init() {
    request('/config')
      .then(function (body) {
        if (!body.enabled) return;
        config = body;
        build();
      })
      .catch(function () {
        /* Not signed in yet, or voice is not installed here: show nothing. */
      });
  }

  // The clinical app signs in on another page, so the session exists by the time this runs.
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
