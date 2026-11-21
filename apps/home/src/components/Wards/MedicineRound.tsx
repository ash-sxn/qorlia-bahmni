import { Button, InlineLoading } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useActivePractitioner } from '@bahmni/widgets';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import today from '../Today/Today.module.scss';
import {
  buildSchedule,
  DoseSlot,
  doseState,
  getDoseSlots,
  getScheduledOrderUuids,
  NOT_GIVEN_REASONS,
  recordDose,
  scheduleOrder,
  suggestedHours,
} from './doseService';
import styles from './Wards.module.scss';
import type { CurrentMedicine, WardBed } from './wardService';

const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dayBounds = (now: Date) => {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
};

interface MedicineRoundProps {
  beds: WardBed[];
  /** Current medicines per bed, in the same order as beds. */
  medicines: (CurrentMedicine[] | undefined)[];
}

/**
 * Today's doses for the ward: what is due or overdue, with Given and Not given,
 * and new inpatient orders that still need times. Everything is recorded through
 * Bahmni's IPD module, with the nurse as the person who gave it.
 */
export const MedicineRound: React.FC<MedicineRoundProps> = ({
  beds,
  medicines,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { practitioner } = useActivePractitioner();
  const providerUuid = practitioner?.uuid ?? '';
  const now = new Date();
  const { from, to } = dayBounds(now);
  const [askingWhy, setAskingWhy] = useState('');
  const [reason, setReason] = useState<string>(NOT_GIVEN_REASONS[0]);
  const [message, setMessage] = useState('');

  const slots = useQueries({
    queries: beds.map((bed) => ({
      queryKey: ['wards', 'doses', bed.patientUuid, from.toDateString()],
      queryFn: () => getDoseSlots(bed.patientUuid, from, to),
      retry: false,
      refetchInterval: 120_000,
    })),
  });
  const scheduled = useQueries({
    queries: beds.map((bed) => ({
      queryKey: ['wards', 'scheduled-orders', bed.patientUuid],
      queryFn: () => getScheduledOrderUuids(bed.patientUuid),
      retry: false,
    })),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const record = useMutation({
    mutationFn: ({
      slot,
      given,
      why,
    }: {
      slot: DoseSlot;
      given: boolean;
      why?: string;
    }) =>
      recordDose(
        slot,
        providerUuid,
        given ? { given: true } : { given: false, reason: why ?? '' },
      ),
    onSuccess: (_data, { slot, given }) => {
      setAskingWhy('');
      setMessage(
        t(given ? 'WARDS_DOSE_GIVEN_SAVED' : 'WARDS_DOSE_SKIPPED_SAVED', {
          medicine: slot.medicine,
        }),
      );
      void refresh();
    },
  });

  const schedule = useMutation({
    mutationFn: ({
      medicine,
      bed,
      hours,
    }: {
      medicine: CurrentMedicine;
      bed: WardBed;
      hours: number[];
    }) =>
      scheduleOrder(
        buildSchedule(medicine, bed.patientUuid, providerUuid, hours),
      ),
    onSuccess: () => {
      setMessage(t('WARDS_TIMES_SAVED'));
      void refresh();
    },
  });

  const bedOf = (patientUuid: string) =>
    beds.find((bed) => bed.patientUuid === patientUuid);
  const allSlots = slots.flatMap((query) => query.data ?? []);
  const open = allSlots
    .filter((slot) => ['due', 'overdue'].includes(doseState(slot, now)))
    .sort((a, b) => a.time - b.time);
  const later = allSlots.filter((slot) => doseState(slot, now) === 'later');
  const recorded = allSlots
    .filter((slot) => ['given', 'not-given'].includes(doseState(slot, now)))
    .sort((a, b) => b.time - a.time);

  const needTimes = beds.flatMap((bed, index) =>
    (medicines[index] ?? [])
      .filter(
        (medicine) =>
          medicine.careSetting === 'INPATIENT' &&
          !medicine.asNeeded &&
          scheduled[index]?.data &&
          !scheduled[index].data.has(medicine.uuid),
      )
      .map((medicine) => ({
        bed,
        medicine,
        hours: suggestedHours(medicine.frequency),
      })),
  );

  const loading = slots.some((query) => query.isPending);
  const failed = slots.some((query) => query.isError);

  const stateLabel = (slot: DoseSlot) =>
    doseState(slot, now) === 'overdue'
      ? { text: t('WARDS_DOSE_OVERDUE'), tone: styles.toneAlert }
      : { text: t('WARDS_DOSE_DUE'), tone: today.waiting };

  return (
    <div className={styles.round}>
      {message && (
        <p role="status" className={styles.saved}>
          {message}
        </p>
      )}
      {(record.isError || schedule.isError) && (
        <p role="alert" className={today.error}>
          {t('WARDS_DOSE_SAVE_ERROR')}
        </p>
      )}

      <section className={styles.boardPanel} aria-labelledby="doses-due">
        <div className={styles.roundHeading}>
          <h2 id="doses-due">{t('WARDS_DOSES_DUE')}</h2>
          <span className={today.meta}>
            {t('WARDS_DOSES_DUE_LEAD', { count: open.length })}
          </span>
        </div>
        {loading && <InlineLoading description={t('WARDS_LOADING')} />}
        {failed && (
          <p role="alert" className={today.error}>
            {t('WARDS_DOSES_ERROR')}
          </p>
        )}
        {!loading && !failed && open.length === 0 && (
          <p className={today.empty}>{t('WARDS_NOTHING_DUE')}</p>
        )}
        <ul className={styles.doseList}>
          {open.map((slot) => {
            const bed = bedOf(slot.patientUuid);
            const state = stateLabel(slot);
            return (
              <li key={slot.uuid} className={styles.dose}>
                <span className={styles.doseTime}>
                  <strong>{clock.format(slot.time)}</strong>
                  <span className={`${today.status} ${state.tone}`}>
                    {state.text}
                  </span>
                </span>
                <span>
                  <strong>{slot.medicine}</strong>
                  <span className={today.meta}>{slot.how}</span>
                </span>
                <span>
                  {bed?.name}
                  <span className={today.meta}>
                    {t('WARDS_BED', { bed: bed?.bedNumber ?? '' })}
                  </span>
                </span>
                <span className={styles.doseActions}>
                  {askingWhy === slot.uuid ? (
                    <>
                      <label className={styles.reason}>
                        <span>{t('WARDS_NOT_GIVEN_WHY')}</span>
                        <select
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        >
                          {NOT_GIVEN_REASONS.map((code) => (
                            <option key={code} value={code}>
                              {t(`WARDS_REASON_${code}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        kind="ghost"
                        size="md"
                        onClick={() => setAskingWhy('')}
                      >
                        {t('WARDS_CANCEL')}
                      </Button>
                      <Button
                        size="md"
                        disabled={record.isPending}
                        onClick={() =>
                          record.mutate({
                            slot,
                            given: false,
                            why: t(`WARDS_REASON_${reason}`),
                          })
                        }
                      >
                        {t('WARDS_SAVE_NOT_GIVEN')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        kind="ghost"
                        size="md"
                        disabled={!providerUuid || record.isPending}
                        onClick={() => {
                          setReason(NOT_GIVEN_REASONS[0]);
                          setAskingWhy(slot.uuid);
                        }}
                      >
                        {t('WARDS_NOT_GIVEN')}
                      </Button>
                      <Button
                        size="md"
                        disabled={!providerUuid || record.isPending}
                        onClick={() => record.mutate({ slot, given: true })}
                      >
                        {t('WARDS_GIVEN')}
                      </Button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {!providerUuid && (
          <p className={styles.note}>{t('WARDS_NO_PROVIDER')}</p>
        )}
      </section>

      {needTimes.length > 0 && (
        <section className={styles.boardPanel} aria-labelledby="need-times">
          <div className={styles.roundHeading}>
            <h2 id="need-times">{t('WARDS_NEED_TIMES')}</h2>
            <span className={today.meta}>{t('WARDS_NEED_TIMES_LEAD')}</span>
          </div>
          <ul className={styles.doseList}>
            {needTimes.map(({ bed, medicine, hours }) => (
              <li key={medicine.uuid} className={styles.needTimes}>
                <span>
                  <strong>{medicine.name}</strong>
                  <span className={today.meta}>
                    {[medicine.dose, medicine.route, medicine.frequency]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span>
                  {bed.name}
                  <span className={today.meta}>
                    {t('WARDS_BED', { bed: bed.bedNumber })}
                  </span>
                </span>
                {hours ? (
                  <span className={styles.doseActions}>
                    <span className={today.meta}>
                      {t('WARDS_SUGGESTED_TIMES', {
                        times: hours
                          .map((h) => `${String(h).padStart(2, '0')}:00`)
                          .join(', '),
                      })}
                    </span>
                    <Button
                      size="md"
                      disabled={!providerUuid || schedule.isPending}
                      onClick={() => schedule.mutate({ medicine, bed, hours })}
                    >
                      {t('WARDS_USE_TIMES')}
                    </Button>
                  </span>
                ) : (
                  <span className={today.meta}>
                    {t('WARDS_NO_USUAL_TIMES')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.boardPanel} aria-labelledby="doses-done">
        <div className={styles.roundHeading}>
          <h2 id="doses-done">{t('WARDS_DOSES_RECORDED')}</h2>
          <span className={today.meta}>
            {t('WARDS_DOSES_LATER', { count: later.length })}
          </span>
        </div>
        {recorded.length === 0 ? (
          <p className={today.empty}>{t('WARDS_NOTHING_RECORDED')}</p>
        ) : (
          <ul className={styles.doseList}>
            {recorded.map((slot) => {
              const bed = bedOf(slot.patientUuid);
              const given = doseState(slot, now) === 'given';
              return (
                <li key={slot.uuid} className={styles.dose}>
                  <span className={styles.doseTime}>
                    <strong>{clock.format(slot.time)}</strong>
                    <span className={`${today.status} ${today.done}`}>
                      {given ? t('WARDS_DOSE_GIVEN') : t('WARDS_DOSE_SKIPPED')}
                    </span>
                  </span>
                  <span>
                    <strong>{slot.medicine}</strong>
                    <span className={today.meta}>{slot.how}</span>
                  </span>
                  <span>
                    {bed?.name}
                    <span className={today.meta}>
                      {t('WARDS_BED', { bed: bed?.bedNumber ?? '' })}
                    </span>
                  </span>
                  <span className={today.meta}>
                    {[
                      slot.recordedBy &&
                        t('WARDS_RECORDED_BY', {
                          name: slot.recordedBy,
                          time: slot.recordedAt
                            ? clock.format(slot.recordedAt)
                            : '',
                        }),
                      !given && slot.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default MedicineRound;
