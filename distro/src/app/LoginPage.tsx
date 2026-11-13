import { getHospitalBranding } from '@bahmni/design-system';
import {
  BAHMNI_USER_COOKIE_NAME,
  BAHMNI_USER_LOCATION_COOKIE,
  getAvailableLocations,
  getCurrentProvider,
  getCurrentUser,
  getUserLoginLocation,
  setCookie,
  updateSessionLocation,
  type UserLocation,
} from '@bahmni/services';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.scss';

type Step = 'checking' | 'credentials' | 'otp' | 'location';
type Session = { authenticated: boolean; user?: { username?: string } };

const sessionUrl = '/openmrs/ws/rest/v1/session';

function authHeader(username: string, password: string, otp?: string): string {
  const bytes = new TextEncoder().encode(
    `${username}:${password}${otp ? `:${otp}` : ''}`,
  );
  return `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
}

export function LoginPage() {
  const brand = getHospitalBranding();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [locationUuid, setLocationUuid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadLocations(authenticatedUsername: string) {
    setCookie(
      BAHMNI_USER_COOKIE_NAME,
      encodeURIComponent(JSON.stringify(authenticatedUsername)),
    );
    const user = await getCurrentUser();
    if (!user)
      throw new Error(
        'This account could not be loaded. Contact your administrator.',
      );
    const provider = await getCurrentProvider(user.uuid);
    if (!provider)
      throw new Error(
        'This account has no provider profile. Contact your administrator.',
      );

    const available = await getAvailableLocations();
    const assigned = provider.attributes
      ?.filter(
        (attribute) =>
          !attribute.voided &&
          attribute.attributeType.display === 'Login Locations' &&
          typeof attribute.value === 'object',
      )
      .map((attribute) => (attribute.value as UserLocation).uuid);
    const permitted = assigned?.length
      ? available.filter((location) => assigned.includes(location.uuid))
      : available;
    if (!permitted.length)
      throw new Error('No login locations are available for this account.');

    setLocations(permitted);
    let previousUuid = '';
    try {
      previousUuid = getUserLoginLocation().uuid;
    } catch {
      // A first-time login has no saved location.
    }
    setLocationUuid(
      permitted.find((location) => location.uuid === previousUuid)?.uuid ??
        permitted[0].uuid,
    );
    setStep('location');
  }

  useEffect(() => {
    let active = true;
    fetch(sessionUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not check your session.');
        return (await response.json()) as Session;
      })
      .then(async (session) => {
        if (!active) return;
        if (session.authenticated && session.user?.username) {
          setUsername(session.user.username);
          await loadLocations(session.user.username);
        } else {
          setStep('credentials');
        }
      })
      .catch((reason) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not check your session.',
        );
        setStep('credentials');
      });
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`${sessionUrl}?v=custom:(uuid)`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Authorization: authHeader(
            username.trim(),
            password,
            step === 'otp' ? otp : undefined,
          ),
        },
      });
      if (response.status === 204) {
        setStep('otp');
        return;
      }
      if (response.status === 429)
        throw new Error('Too many attempts. Please wait and try again.');
      if (response.status === 410)
        throw new Error('That verification code expired. Sign in again.');
      if (response.status === 401)
        throw new Error('The sign-in details were not accepted.');
      if (!response.ok)
        throw new Error('Sign-in is unavailable. Please try again.');
      const session = (await response.json()) as Session;
      if (!session.authenticated)
        throw new Error('The sign-in details were not accepted.');
      await loadLocations(username.trim());
      setPassword('');
      setOtp('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const location = locations.find((item) => item.uuid === locationUuid);
    if (!location) return;
    setError('');
    setBusy(true);
    try {
      await updateSessionLocation(location.uuid);
      setCookie(
        BAHMNI_USER_LOCATION_COOKIE,
        encodeURIComponent(
          JSON.stringify({ name: location.name, uuid: location.uuid }),
        ),
      );
      navigate('/home/', { replace: true });
    } catch {
      setError('Could not set your login location. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="qorlia-login">
      <section className="qorlia-login__intro" aria-label="Qorlia">
        <div className="qorlia-login__brand">
          {brand.logoPath ? (
            <img src={brand.logoPath} alt="" />
          ) : (
            <span aria-hidden="true" />
          )}
          <strong>{brand.name}</strong>
        </div>
        <div className="qorlia-login__message">
          <p className="qorlia-login__eyebrow">HOSPITAL WORKSPACE</p>
          <h1>One place for the work behind care.</h1>
          <p>
            Open your hospital workspace to work across patients, appointments
            and clinical teams.
          </p>
        </div>
        <small>Built on Bahmni</small>
      </section>

      <section className="qorlia-login__panel" aria-labelledby="login-heading">
        <div
          className="qorlia-login__card"
          aria-busy={busy || step === 'checking'}
        >
          <p className="qorlia-login__eyebrow">WELCOME BACK</p>
          <h2 id="login-heading">
            {step === 'location'
              ? 'Choose your location'
              : step === 'otp'
                ? 'Verify your sign-in'
                : 'Sign in to Qorlia'}
          </h2>
          <p className="qorlia-login__hint">
            {step === 'location'
              ? 'Select where you are working today.'
              : step === 'otp'
                ? 'Enter the code sent for this account.'
                : 'Use your hospital account to continue.'}
          </p>

          {error && (
            <p className="qorlia-login__error" role="alert">
              {error}
            </p>
          )}
          {step === 'checking' ? (
            <p role="status">Checking your session...</p>
          ) : step === 'location' ? (
            <form onSubmit={chooseLocation}>
              <label htmlFor="login-location">Login location</label>
              <select
                id="login-location"
                value={locationUuid}
                onChange={(event) => setLocationUuid(event.target.value)}
                required
              >
                {locations.map((location) => (
                  <option key={location.uuid} value={location.uuid}>
                    {location.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy}>
                Continue to workspace
              </button>
            </form>
          ) : (
            <form onSubmit={signIn}>
              {step === 'credentials' ? (
                <>
                  <label htmlFor="login-username">Username</label>
                  <input
                    id="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    required
                  />
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </>
              ) : (
                <>
                  <label htmlFor="login-otp">Verification code</label>
                  <input
                    id="login-otp"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                  />
                  <button
                    className="qorlia-login__text-button"
                    type="button"
                    onClick={() => {
                      setOtp('');
                      setStep('credentials');
                      setError('');
                    }}
                  >
                    Back to sign in
                  </button>
                </>
              )}
              <button type="submit" disabled={busy}>
                {busy ? 'Please wait...' : 'Continue'}
              </button>
            </form>
          )}
          <p className="qorlia-login__help">
            Need access? Contact your hospital administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
