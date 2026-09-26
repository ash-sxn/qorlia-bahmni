import { getHospitalBranding } from '@bahmni/design-system';
import {
  Add,
  ArrowRight,
  Calendar,
  ChartBar,
  Chemistry,
  ChevronDown,
  Close,
  Document,
  Filter,
  Help,
  Location,
  Notification,
  Pills,
  Search,
  Settings,
  Stethoscope,
  User,
  Wallet,
} from '@carbon/icons-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './DesignPreview.scss';

type QueueStatus = 'Waiting' | 'In room' | 'Completed';
type Patient = {
  id: string;
  time: string;
  name: string;
  initials: string;
  age: number;
  gender: 'M' | 'F';
  visit: string;
  detail: string;
  status: QueueStatus;
  avatar: string;
};

const initialPatients: Patient[] = [
  {
    id: 'QH001234',
    time: '09:00 AM',
    name: 'Ramesh Sharma',
    initials: 'RS',
    age: 46,
    gender: 'M',
    visit: 'Follow-up',
    detail: 'Hypertension',
    status: 'Waiting',
    avatar: 'mint',
  },
  {
    id: 'QH001235',
    time: '09:20 AM',
    name: 'Pooja Kumari',
    initials: 'PK',
    age: 32,
    gender: 'F',
    visit: 'Antenatal visit',
    detail: 'ANC',
    status: 'Waiting',
    avatar: 'blue',
  },
  {
    id: 'QH001236',
    time: '09:40 AM',
    name: 'Mohammed Arif',
    initials: 'MA',
    age: 58,
    gender: 'M',
    visit: 'New visit',
    detail: 'Diabetes',
    status: 'In room',
    avatar: 'green',
  },
  {
    id: 'QH001237',
    time: '10:00 AM',
    name: 'Sunita Patil',
    initials: 'SP',
    age: 27,
    gender: 'F',
    visit: 'Follow-up',
    detail: 'Thyroid',
    status: 'Waiting',
    avatar: 'lavender',
  },
  {
    id: 'QH001238',
    time: '10:20 AM',
    name: 'Vikram Khandelwal',
    initials: 'VK',
    age: 61,
    gender: 'M',
    visit: 'New visit',
    detail: 'General medicine',
    status: 'Waiting',
    avatar: 'rose',
  },
];

const navigation = [
  { label: 'Today', icon: Calendar },
  { label: 'Patients', icon: User },
  { label: 'Appointments', icon: Calendar },
  { label: 'Clinical', icon: Stethoscope },
  { label: 'Laboratory', icon: Chemistry },
  { label: 'Pharmacy', icon: Pills },
  { label: 'Billing', icon: Wallet },
  { label: 'Reports', icon: ChartBar },
];

export const DesignPreview: React.FC = () => {
  const brand = getHospitalBranding();
  const [patients, setPatients] = useState(initialPatients);
  const [tab, setTab] = useState<'queue' | 'upcoming' | 'completed'>('queue');
  const [query, setQuery] = useState('');
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [notice, setNotice] = useState('');
  const [activeNav, setActiveNav] = useState('Today');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    previousFocus.current = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll('button');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [selected]);

  const visible = useMemo(
    () =>
      patients.filter((patient) => {
        if (tab === 'completed' && patient.status !== 'Completed') return false;
        if (tab === 'queue' && patient.status === 'Completed') return false;
        if (tab === 'upcoming' && patient.status !== 'Waiting') return false;
        if (waitingOnly && patient.status !== 'Waiting') return false;
        return `${patient.name} ${patient.id}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [patients, tab, query, waitingOnly],
  );

  const nextPatient = patients.find((patient) => patient.status === 'Waiting');
  const complete = () => {
    if (!selected) return;
    setPatients((current) =>
      current.map((patient) =>
        patient.id === selected.id
          ? { ...patient, status: 'Completed' }
          : patient,
      ),
    );
    setNotice(
      `${selected.name}'s sample visit was marked complete in this preview.`,
    );
    setSelected(null);
  };

  return (
    <div className="qorlia-preview">
      <header className="qorlia-preview__header">
        <div className="qorlia-preview__brand">
          {brand.logoPath ? (
            <img src={brand.logoPath} alt="" />
          ) : (
            <span className="qorlia-preview__mark" aria-hidden="true" />
          )}
          <span className="qorlia-preview__wordmark">{brand.name}</span>
          <span className="qorlia-preview__credit">Built on Bahmni</span>
        </div>
        <div className="qorlia-preview__header-right">
          <button
            className="qorlia-preview__location"
            onClick={() =>
              setNotice('OPD-1 is the sample location for this design preview.')
            }
          >
            <Location size={18} /> OPD-1 <ChevronDown size={16} />
          </button>
          <span className="qorlia-preview__clinician">
            <User size={23} />
            <span>
              <strong>Dr. Anjali Mehta</strong>
              <small>Medical Officer</small>
            </span>
          </span>
          <button
            className="qorlia-preview__icon-button"
            aria-label="Notifications"
            onClick={() =>
              setNotice('No new notifications in this design preview.')
            }
          >
            <Notification size={22} />
            <b>3</b>
          </button>
          <button
            className="qorlia-preview__account"
            onClick={() =>
              setNotice(
                'Account settings are not connected in this design preview.',
              )
            }
          >
            <span>AM</span>
            <ChevronDown size={16} />
          </button>
        </div>
      </header>

      <div className="qorlia-preview__shell">
        <aside className="qorlia-preview__sidebar" aria-label="Main navigation">
          <nav>
            {navigation.map(({ label, icon: Icon }) => (
              <button
                key={label}
                className={activeNav === label ? 'is-active' : ''}
                onClick={() => {
                  setActiveNav(label);
                  if (label !== 'Today')
                    setNotice(
                      `${label} is next in the Qorlia redesign. This preview shows today's queue.`,
                    );
                }}
              >
                <Icon size={21} />
                {label}
              </button>
            ))}
          </nav>
          <div className="qorlia-preview__sidebar-bottom">
            <button
              onClick={() =>
                setNotice('Settings are not connected in this design preview.')
              }
            >
              <Settings size={20} />
              Settings
            </button>
            <button
              onClick={() =>
                setNotice(
                  'Help will link to training and support in the live product.',
                )
              }
            >
              <Help size={20} />
              Help
            </button>
            <p>
              Better care.
              <br />
              Healthier communities.
            </p>
          </div>
        </aside>

        <main className="qorlia-preview__main">
          <div className="qorlia-preview__intro">
            <div>
              <span className="qorlia-preview__eyebrow">
                CLINICAL WORKSPACE
              </span>
              <h1>Good morning, Dr. Anjali</h1>
              <p>Here is your patient queue for today.</p>
            </div>
            <div className="qorlia-preview__date">
              <Calendar size={26} />
              <span>
                <strong>Today</strong>
                <small>Sample data, design preview</small>
              </span>
            </div>
          </div>
          {notice && (
            <div className="qorlia-preview__notice" role="status">
              {notice}
              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss message"
              >
                <Close size={19} />
              </button>
            </div>
          )}
          <section
            className="qorlia-preview__queue"
            aria-labelledby="queue-heading"
          >
            <div className="qorlia-preview__queue-tools">
              <div className="qorlia-preview__tabs" aria-label="Queue view">
                <button
                  aria-pressed={tab === 'queue'}
                  className={tab === 'queue' ? 'is-active' : ''}
                  onClick={() => setTab('queue')}
                  id="queue-heading"
                >
                  Patient queue (
                  {
                    patients.filter((patient) => patient.status !== 'Completed')
                      .length
                  }
                  )
                </button>
                <button
                  aria-pressed={tab === 'upcoming'}
                  className={tab === 'upcoming' ? 'is-active' : ''}
                  onClick={() => setTab('upcoming')}
                >
                  Upcoming (
                  {
                    patients.filter((patient) => patient.status === 'Waiting')
                      .length
                  }
                  )
                </button>
                <button
                  aria-pressed={tab === 'completed'}
                  className={tab === 'completed' ? 'is-active' : ''}
                  onClick={() => setTab('completed')}
                >
                  Completed (
                  {
                    patients.filter((patient) => patient.status === 'Completed')
                      .length
                  }
                  )
                </button>
              </div>
              <div className="qorlia-preview__search">
                <Search size={18} />
                <input
                  aria-label="Search by patient name or ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or ID"
                />
              </div>
              <button
                className={`qorlia-preview__filter ${waitingOnly ? 'is-active' : ''}`}
                aria-label="Show waiting patients only"
                aria-pressed={waitingOnly}
                onClick={() => setWaitingOnly(!waitingOnly)}
              >
                <Filter size={19} />
              </button>
            </div>
            <div className="qorlia-preview__table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Patient</th>
                    <th>Age / gender</th>
                    <th>Visit type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((patient, index) => (
                    <tr key={patient.id}>
                      <td>{index + 1}</td>
                      <td>{patient.time}</td>
                      <td>
                        <span className="qorlia-preview__patient-cell">
                          <span
                            className={`qorlia-preview__avatar ${patient.avatar}`}
                          >
                            {patient.initials}
                          </span>
                          <span className="qorlia-preview__patient">
                            <strong>{patient.name}</strong>
                            <small>ID: {patient.id}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        {patient.age} / {patient.gender}
                      </td>
                      <td>
                        <span className="qorlia-preview__visit">
                          <strong>{patient.visit}</strong>
                          <small>{patient.detail}</small>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`qorlia-preview__status ${patient.status.toLowerCase().replace(' ', '-')}`}
                        >
                          {patient.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="qorlia-preview__consult"
                          onClick={() => setSelected(patient)}
                        >
                          {patient.status === 'In room'
                            ? 'Resume'
                            : patient.status === 'Completed'
                              ? 'View'
                              : 'Consult'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && (
              <p className="qorlia-preview__empty">
                No sample patients match this view.
              </p>
            )}
          </section>
        </main>

        <aside className="qorlia-preview__rail" aria-label="Queue summary">
          <section className="qorlia-preview__panel">
            <h2>Next patient</h2>
            {nextPatient ? (
              <>
                <div className="qorlia-preview__next">
                  <span
                    className={`qorlia-preview__avatar ${nextPatient.avatar}`}
                  >
                    {nextPatient.initials}
                  </span>
                  <div>
                    <strong>{nextPatient.name}</strong>
                    <small>
                      {nextPatient.age} / {nextPatient.gender} &nbsp; | &nbsp;
                      ID: {nextPatient.id}
                    </small>
                    <small>
                      {nextPatient.visit}: {nextPatient.detail}
                    </small>
                  </div>
                </div>
                <button
                  className="qorlia-preview__primary"
                  onClick={() => setSelected(nextPatient)}
                >
                  <Stethoscope size={20} />
                  Start consultation
                  <ArrowRight size={19} />
                </button>
              </>
            ) : (
              <p>No one is waiting.</p>
            )}
          </section>
          <section className="qorlia-preview__panel">
            <h2>Today&apos;s summary</h2>
            <dl>
              <div>
                <dt>Scheduled</dt>
                <dd>{patients.length}</dd>
              </div>
              <div>
                <dt>Seen</dt>
                <dd>
                  {
                    patients.filter((patient) => patient.status === 'Completed')
                      .length
                  }
                </dd>
              </div>
              <div>
                <dt>Waiting</dt>
                <dd>
                  {
                    patients.filter((patient) => patient.status === 'Waiting')
                      .length
                  }
                </dd>
              </div>
              <div>
                <dt>In consultation</dt>
                <dd>
                  {
                    patients.filter((patient) => patient.status === 'In room')
                      .length
                  }
                </dd>
              </div>
            </dl>
          </section>
          <section className="qorlia-preview__panel">
            <h2>Quick actions</h2>
            <div className="qorlia-preview__quick">
              <button
                onClick={() =>
                  setNotice(
                    'Patient registration will be connected after staff review.',
                  )
                }
              >
                <Add size={19} />
                Register patient
              </button>
              <button
                onClick={() =>
                  setNotice(
                    'Appointment booking will be connected after staff review.',
                  )
                }
              >
                <Calendar size={19} />
                Book appointment
              </button>
              <button
                onClick={() =>
                  setNotice(
                    'Patient records will be connected after staff review.',
                  )
                }
              >
                <Document size={19} />
                View patient record
              </button>
            </div>
          </section>
        </aside>
      </div>

      {selected && (
        <div
          className="qorlia-preview__modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <section
            ref={dialog}
            className="qorlia-preview__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultation-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButton}
              className="qorlia-preview__close"
              onClick={() => setSelected(null)}
              aria-label="Close consultation"
            >
              <Close size={21} />
            </button>
            <span className="qorlia-preview__eyebrow">SAMPLE CONSULTATION</span>
            <h2 id="consultation-title">{selected.name}</h2>
            <p>
              {selected.age} / {selected.gender} · {selected.visit} ·{' '}
              {selected.detail}
            </p>
            <p>
              This screen is a design preview using sample information. It does
              not save clinical records.
            </p>
            <div className="qorlia-preview__modal-actions">
              <button onClick={() => setSelected(null)}>Back to queue</button>
              <button onClick={complete}>Mark sample visit complete</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
