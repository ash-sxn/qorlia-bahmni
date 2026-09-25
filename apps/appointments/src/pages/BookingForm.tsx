import {
  bookAppointment,
  fetchAllProviders,
  getAppointmentBookingConflicts,
  getLocationByTag,
  searchPatientByNameOrId,
  type AppointmentBookingRequest,
  type AppointmentSummary,
  useTranslation,
} from '@bahmni/services';
import { useDebounce } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { PROVIDER_ATTRIBUTE_AVAILABLE_FOR_APPOINTMENT } from './admin/appointmentUnavailability/constants';
import styles from './styles/index.module.scss';

interface BookingFormProps {
  services: AppointmentSummary[];
  selectedDay: string;
  selectedServiceUuid: string;
  onClose: () => void;
  onBooked: () => void;
}

export const BookingForm = ({
  services,
  selectedDay,
  selectedServiceUuid,
  onClose,
  onBooked,
}: BookingFormProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [patientUuid, setPatientUuid] = useState('');
  const [patientName, setPatientName] = useState('');
  const [serviceUuid, setServiceUuid] = useState(selectedServiceUuid);
  const [locationUuid, setLocationUuid] = useState('');
  const [providerUuid, setProviderUuid] = useState('');
  const [date, setDate] = useState(selectedDay);
  const [startTime, setStartTime] = useState('09:00');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const patients = useQuery({
    queryKey: ['booking-patients', debouncedSearch],
    queryFn: () => searchPatientByNameOrId(debouncedSearch),
    enabled: debouncedSearch.length >= 3 && !patientUuid,
  });
  const locations = useQuery({
    queryKey: ['appointment-locations'],
    queryFn: () => getLocationByTag('Appointment Location'),
  });
  const providers = useQuery({
    queryKey: ['appointment-providers'],
    queryFn: fetchAllProviders,
  });
  const service = services.find(
    (item) => item.appointmentService.uuid === serviceUuid,
  )?.appointmentService;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!patientUuid) {
      setError(t('APPOINTMENTS_SELECT_PATIENT'));
      return;
    }
    const start = new Date(date + 'T' + startTime);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
      setError(t('APPOINTMENTS_FUTURE_TIME'));
      return;
    }
    if (!service || !locationUuid) {
      setError(t('APPOINTMENTS_BOOKING_REFERENCE_ERROR'));
      return;
    }
    const duration = service.durationMins;
    if (
      duration == null ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      (service.location?.uuid && service.location.uuid !== locationUuid)
    ) {
      setError(t('APPOINTMENTS_BOOKING_REFERENCE_ERROR'));
      return;
    }
    const needsProviderAcceptance =
      service.initialAppointmentStatus === 'Requested' && !!providerUuid;
    const request: AppointmentBookingRequest = {
      patientUuid,
      serviceUuid,
      locationUuid,
      startDateTime: start.toISOString(),
      endDateTime: new Date(start.getTime() + duration * 60_000).toISOString(),
      appointmentKind: 'Scheduled',
      status: needsProviderAcceptance ? 'Requested' : 'Scheduled',
      providers: providerUuid
        ? [
            {
              uuid: providerUuid,
              response: needsProviderAcceptance ? 'AWAITING' : 'ACCEPTED',
              comments: null,
            },
          ]
        : [],
      ...(comments.trim() ? { comments: comments.trim() } : {}),
    };
    setSaving(true);
    try {
      const conflicts = await getAppointmentBookingConflicts(request);
      // ponytail: Conflicts block booking; add a role-gated override only after hospital policy is agreed.
      if (
        !conflicts ||
        typeof conflicts !== 'object' ||
        Array.isArray(conflicts) ||
        Object.values(conflicts).some(
          (items) => !Array.isArray(items) || items.length > 0,
        )
      ) {
        setError(t('APPOINTMENTS_BOOKING_CONFLICT'));
        return;
      }
      await bookAppointment(request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointment-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['appointment-day'] }),
      ]);
      onBooked();
    } catch {
      setError(t('APPOINTMENTS_BOOKING_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="booking-heading">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>{t('APPOINTMENTS_NEW')}</span>
          <h2 id="booking-heading">{t('APPOINTMENTS_BOOK')}</h2>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onClose}
        >
          {t('APPOINTMENTS_CANCEL')}
        </button>
      </div>
      <form className={styles.bookingForm} onSubmit={submit}>
        <div className={styles.patientSearch}>
          <label htmlFor="booking-patient-search">
            {t('APPOINTMENTS_PATIENT')}
          </label>
          {patientUuid ? (
            <div className={styles.selectedPatient}>
              <strong>{patientName}</strong>
              <button
                type="button"
                onClick={() => {
                  setPatientUuid('');
                  setPatientName('');
                  setSearch('');
                }}
              >
                {t('APPOINTMENTS_CHANGE_PATIENT')}
              </button>
            </div>
          ) : (
            <>
              <input
                id="booking-patient-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('APPOINTMENTS_SEARCH_PATIENT')}
                autoComplete="off"
              />
              {patients.isLoading && (
                <p role="status">{t('APPOINTMENTS_SEARCHING')}</p>
              )}
              {patients.isError && (
                <p role="alert">{t('APPOINTMENTS_SEARCH_ERROR')}</p>
              )}
              {patients.data?.pageOfResults.length === 0 && (
                <p>{t('APPOINTMENTS_NO_PATIENTS')}</p>
              )}
              {patients.data && patients.data.pageOfResults.length > 0 && (
                <ul className={styles.patientResults}>
                  {patients.data.pageOfResults.map((patient) => {
                    const name = [
                      patient.givenName,
                      patient.middleName,
                      patient.familyName,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <li key={patient.uuid}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientUuid(patient.uuid);
                            setPatientName(name);
                          }}
                        >
                          {name} ({patient.identifier})
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
        <label>
          {t('APPOINTMENTS_SERVICE')}
          <select
            required
            value={serviceUuid}
            onChange={(event) => {
              setServiceUuid(event.target.value);
              setLocationUuid('');
            }}
          >
            <option value="">{t('APPOINTMENTS_SELECT_SERVICE')}</option>
            {services.map((item) => (
              <option
                key={item.appointmentService.uuid}
                value={item.appointmentService.uuid}
              >
                {item.appointmentService.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('APPOINTMENTS_LOCATION')}
          <select
            required
            value={locationUuid}
            onChange={(event) => setLocationUuid(event.target.value)}
            disabled={locations.isLoading || locations.isError}
          >
            <option value="">{t('APPOINTMENTS_SELECT_LOCATION')}</option>
            {(locations.data ?? [])
              .filter(
                (location) =>
                  !service?.location?.uuid ||
                  location.uuid === service.location.uuid,
              )
              .map((location) => (
                <option key={location.uuid} value={location.uuid}>
                  {location.display}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t('APPOINTMENTS_PROVIDER')}
          <select
            value={providerUuid}
            onChange={(event) => setProviderUuid(event.target.value)}
            disabled={providers.isLoading || providers.isError}
          >
            <option value="">{t('APPOINTMENTS_NO_PROVIDER')}</option>
            {(providers.data ?? [])
              .filter((provider) =>
                provider.attributes?.some(
                  (attribute) =>
                    !attribute.voided &&
                    attribute.attributeType.display ===
                      PROVIDER_ATTRIBUTE_AVAILABLE_FOR_APPOINTMENT &&
                    attribute.value === true,
                ),
              )
              .map((provider) => (
                <option key={provider.uuid} value={provider.uuid}>
                  {provider.person?.display ?? provider.display}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t('APPOINTMENTS_DATE')}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          {t('APPOINTMENTS_START_TIME')}
          <input
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <label className={styles.fullWidth}>
          {t('APPOINTMENTS_NOTES')}
          <textarea
            rows={3}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </label>
        {(locations.isError || providers.isError) && (
          <p className={styles.fullWidth} role="alert">
            {t('APPOINTMENTS_BOOKING_REFERENCE_ERROR')}
          </p>
        )}
        {error && (
          <p className={styles.fullWidth} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fullWidth}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={
              saving ||
              locations.isLoading ||
              providers.isLoading ||
              locations.isError ||
              providers.isError
            }
          >
            {saving
              ? t('APPOINTMENTS_SAVING')
              : t('APPOINTMENTS_CONFIRM_BOOKING')}
          </button>
        </div>
      </form>
    </section>
  );
};
