import {
  getAppointmentBookingConflicts,
  type Appointment,
  type AppointmentUpdateRequest,
  updateAppointment,
  useTranslation,
} from '@bahmni/services';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { hasAppointmentConflicts } from './appointmentActions';
import styles from './styles/index.module.scss';

const dateValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const timeValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const EditAppointmentForm = ({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => dateValue(appointment.startDateTime));
  const [startTime, setStartTime] = useState(() =>
    timeValue(appointment.startDateTime),
  );
  const [endTime, setEndTime] = useState(() =>
    timeValue(appointment.endDateTime),
  );
  const [comments, setComments] = useState(appointment.comments ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start < today ||
      end <= start
    ) {
      setError(t('APPOINTMENTS_EDIT_TIME_ERROR'));
      return;
    }
    if (
      !appointment.patient?.uuid ||
      !appointment.service?.uuid ||
      !appointment.location?.uuid ||
      !appointment.appointmentKind
    ) {
      setError(t('APPOINTMENTS_BOOKING_REFERENCE_ERROR'));
      return;
    }
    const scheduled = appointment.dateAppointmentScheduled;
    const request: AppointmentUpdateRequest = {
      uuid: appointment.uuid,
      patientUuid: appointment.patient.uuid,
      serviceUuid: appointment.service.uuid,
      ...(appointment.serviceType?.uuid
        ? { serviceTypeUuid: appointment.serviceType.uuid }
        : {}),
      locationUuid: appointment.location.uuid,
      ...(Number.isFinite(scheduled)
        ? { dateAppointmentScheduled: new Date(scheduled).toISOString() }
        : {}),
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      appointmentKind: appointment.appointmentKind,
      status: appointment.status,
      providers: (appointment.providers ?? [])
        .filter(
          (provider) => provider.uuid && provider.response !== 'CANCELLED',
        )
        .map((provider) => ({
          uuid: provider.uuid as string,
          response: provider.response ?? 'ACCEPTED',
          comments: provider.comments ?? null,
        })),
      comments: comments.trim() || null,
    };
    setSaving(true);
    try {
      const conflicts = await getAppointmentBookingConflicts(request);
      if (hasAppointmentConflicts(conflicts)) {
        setError(t('APPOINTMENTS_BOOKING_CONFLICT'));
        return;
      }
      await updateAppointment(request);
      await Promise.all(
        [
          'appointment',
          'appointment-summary',
          'appointment-day',
          'appointment-list-day',
          'appointment-waitlist',
          'appointment-calendar',
          'appointment-edit',
          'appointment-week',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      onSaved();
    } catch {
      setError(t('APPOINTMENTS_EDIT_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="edit-heading">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>{t('APPOINTMENTS_PATIENT')}</span>
          <h2 id="edit-heading">{t('APPOINTMENTS_EDIT')}</h2>
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
        <p>
          <strong>{appointment.patient.name}</strong> (
          {appointment.patient.identifier})
        </p>
        <p>
          {appointment.service.name}
          {appointment.serviceType?.name
            ? `, ${appointment.serviceType.name}`
            : ''}
          {appointment.location?.name ? `, ${appointment.location.name}` : ''}
        </p>
        <label>
          {t('APPOINTMENTS_DATE')}
          <input
            type="date"
            required
            min={dateValue(Date.now())}
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
        <label>
          {t('APPOINTMENTS_END_TIME')}
          <input
            type="time"
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
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
        {error && (
          <p className={styles.fullWidth} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fullWidth}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={saving}
          >
            {saving ? t('APPOINTMENTS_SAVING') : t('APPOINTMENTS_SAVE_CHANGES')}
          </button>
        </div>
      </form>
    </section>
  );
};
