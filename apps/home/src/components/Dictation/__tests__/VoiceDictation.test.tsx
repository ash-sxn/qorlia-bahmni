import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceDictation } from '../VoiceDictation';
import { canRecord, startVoiceRecording } from '../voiceRecorder';

jest.mock('../voiceRecorder', () => ({
  canRecord: jest.fn(),
  startVoiceRecording: jest.fn(),
}));

const mockCanRecord = canRecord as jest.Mock;
const mockStart = startVoiceRecording as jest.Mock;

const settings = (consented: boolean) => ({
  enabled: true,
  consentVersion: 'v1',
  consented,
  service: {
    name: 'Sarvam AI',
    country: 'India',
    policyUrl: 'https://example.test/privacy',
    outside: true,
  },
  languages: [
    { code: 'en-IN', label: 'English' },
    { code: 'hi-IN', label: 'Hindi or Hinglish' },
  ],
});

const reply = (status: number, body?: unknown) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);

let configBody: ReturnType<typeof settings>;
let transcriptReplies: Promise<Response>[];
let fetchMock: jest.Mock;
let segment: (audio: Blob) => void;
let stopRecording: jest.Mock;

const renderVoice = () => {
  const onText = jest.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VoiceDictation onText={onText} />
    </QueryClientProvider>,
  );
  return onText;
};

beforeEach(() => {
  jest.clearAllMocks();
  configBody = settings(true);
  transcriptReplies = [];
  stopRecording = jest.fn();
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url === '/openmrs/qorlia-voice/config') return reply(200, configBody);
    if (url === '/openmrs/qorlia-voice/consent') {
      configBody = settings(true);
      return reply(204);
    }
    if (url.startsWith('/openmrs/qorlia-voice/transcribe')) {
      return transcriptReplies.shift() ?? reply(200, { text: '' });
    }
    return reply(404, { error: 'not_found', init });
  });
  global.fetch = fetchMock;
  mockCanRecord.mockReturnValue(true);
  mockStart.mockImplementation(async (onSegment: (audio: Blob) => void) => {
    segment = onSegment;
    return { stop: stopRecording };
  });
  window.localStorage.clear();
});

describe('VoiceDictation', () => {
  it('shows nothing where voice dictation is not installed', async () => {
    fetchMock.mockImplementation(() => reply(404, { error: 'not_found' }));
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <VoiceDictation onText={jest.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the notice naming the service before the microphone turns on', async () => {
    configBody = settings(false);
    const user = userEvent.setup();
    renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );

    expect(
      screen.getByText(
        /the recording is sent to Sarvam AI \(India\) to turn speech into text/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sarvam AI privacy policy' }),
    ).toHaveAttribute('href', 'https://example.test/privacy');
    expect(
      screen.getByRole('button', { name: 'Agree and start' }),
    ).toBeDisabled();
    expect(mockStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('records the agreement, then starts listening', async () => {
    configBody = settings(false);
    const user = userEvent.setup();
    renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );
    await user.click(
      screen.getByLabelText(
        'I have read this and agree to send my dictation for transcription.',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Agree and start' }));

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    const consent = fetchMock.mock.calls.find(
      ([url]) => url === '/openmrs/qorlia-voice/consent',
    );
    expect(JSON.parse(consent[1].body)).toEqual({
      version: 'v1',
      accepted: true,
      app: 'new',
    });
    // The closing dialog keeps the page hidden from the accessibility tree in jsdom.
    expect(await screen.findByText('Stop dictation')).toBeInTheDocument();
  });

  it('hands over the words in the order they were spoken', async () => {
    let finishFirst: (value: Response) => void = () => {};
    transcriptReplies = [
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
      reply(200, { text: 'second phrase' }),
    ];
    const user = userEvent.setup();
    const onText = renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    segment(new Blob(['a'], { type: 'audio/webm;codecs=opus' }));
    segment(new Blob(['b'], { type: 'audio/webm;codecs=opus' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onText).not.toHaveBeenCalled();

    finishFirst({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'first phrase' }),
    } as Response);

    await waitFor(() => expect(onText).toHaveBeenCalledTimes(2));
    expect(onText.mock.calls.map(([text]) => text)).toEqual([
      'first phrase',
      'second phrase',
    ]);
    const sent = fetchMock.mock.calls.find(([url]) =>
      url.startsWith('/openmrs/qorlia-voice/transcribe'),
    );
    expect(sent[0]).toBe('/openmrs/qorlia-voice/transcribe?lang=en-IN');
    expect(sent[1].headers).toEqual({ 'Content-Type': 'audio/webm' });
  });

  it('stops and explains when the session has ended', async () => {
    transcriptReplies = [reply(401, { error: 'not_signed_in' })];
    const user = userEvent.setup();
    renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    segment(new Blob(['a'], { type: 'audio/webm' }));

    expect(
      await screen.findByText(
        'Your session has ended. Sign in again to dictate.',
      ),
    ).toBeInTheDocument();
    expect(stopRecording).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Dictate by voice' }),
    ).toBeInTheDocument();
  });

  it('explains a blocked microphone', async () => {
    mockStart.mockRejectedValue(new Error('NotAllowedError'));
    const user = userEvent.setup();
    renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );

    expect(
      await screen.findByText(
        'The microphone is blocked. Allow it in the browser address bar and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('explains a browser that cannot record', async () => {
    mockCanRecord.mockReturnValue(false);
    const user = userEvent.setup();
    renderVoice();

    await user.click(
      await screen.findByRole('button', { name: 'Dictate by voice' }),
    );

    expect(
      screen.getByText(
        'This browser cannot record. Use a recent Chrome, Edge or Firefox.',
      ),
    ).toBeInTheDocument();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
