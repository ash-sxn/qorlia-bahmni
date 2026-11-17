/**
 * Records the microphone as a series of short, self-contained recordings, each cut
 * at a pause (or after 25 seconds), so every phrase can be turned into text while
 * the doctor keeps talking. Silent stretches are never sent.
 */
const MAX_SEGMENT_MS = 25_000;
const MIN_SEGMENT_MS = 6_000;
const PAUSE_MS = 700;
const VOICE_LEVEL = 0.015;
const TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export interface VoiceRecording {
  stop: () => void;
}

export const canRecord = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia);

export const startVoiceRecording = async (
  onSegment: (audio: Blob) => void,
): Promise<VoiceRecording> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let segment: {
    media: MediaRecorder;
    started: number;
    lastVoice: number;
    voiced: boolean;
  };

  const newSegment = () => {
    const media = new MediaRecorder(stream, {
      // Speech needs far less than the music-quality default; smaller uploads are faster.
      audioBitsPerSecond: 32_000,
      ...(mimeType ? { mimeType } : {}),
    });
    const parts: Blob[] = [];
    const current = {
      media,
      started: Date.now(),
      lastVoice: 0,
      voiced: false,
    };
    media.ondataavailable = (event) => {
      if (event.data.size) parts.push(event.data);
    };
    media.onstop = () => {
      if (current.voiced && parts.length) {
        onSegment(
          new Blob(parts, {
            type: media.mimeType ? media.mimeType : (mimeType ?? 'audio/webm'),
          }),
        );
      }
    };
    media.start();
    segment = current;
  };

  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const now = Date.now();
    if (Math.sqrt(sum / samples.length) > VOICE_LEVEL) {
      segment.voiced = true;
      segment.lastVoice = now;
    }
    const age = now - segment.started;
    const paused = segment.voiced && now - segment.lastVoice > PAUSE_MS;
    if (age > MAX_SEGMENT_MS || (age > MIN_SEGMENT_MS && paused)) {
      segment.media.stop();
      newSegment();
    }
  }, 100);

  newSegment();
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      segment.media.stop();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    },
  };
};
