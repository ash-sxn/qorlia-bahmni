import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  get,
  getAllAppointmentServices,
  getAppointmentService,
  getLocationByTag,
  hasPrivilege,
  saveAppointmentService,
  type AppointmentService,
  type AppointmentServiceAvailability,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import workspaceStyles from '../../styles/index.module.scss';
import { MANAGE_APPOINTMENT_SERVICES_PRIVILEGE } from './constants';
import {
  fieldsFromService,
  serviceSaveRequest,
  validAvailability,
  type ServiceFields,
} from './serviceEditorModel';
import styles from './styles/index.module.scss';

const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

type LegacyConfig = {
  config: {
    enableAppointmentRequests?: boolean;
    enableSpecialities?: boolean;
    enableServiceTypes?: boolean;
    colorsForAppointmentService?: string[];
  };
};

type AttributeType = { name: string; minOccurs?: number };

const ServiceForm = ({
  service,
  services,
  config,
  locations,
  specialities,
  requiredAttributes,
  canManageService,
  canManageAvailability,
}: {
  service?: AppointmentService;
  services: AppointmentService[];
  config: LegacyConfig['config'];
  locations: { uuid: string; display: string }[];
  specialities: { uuid: string; name: string }[];
  requiredAttributes: AttributeType[];
  canManageService: boolean;
  canManageAvailability: boolean;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<ServiceFields>(() =>
    fieldsFromService(service, config.colorsForAppointmentService?.[0]),
  );
  const [availability, setAvailability] = useState<
    AppointmentServiceAvailability[]
  >(() => service?.weeklyAvailability ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const activeAvailability = availability.filter((item) => !item.voided);

  const updateField = (field: keyof ServiceFields, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));
  const updateAvailability = (
    index: number,
    field: keyof AppointmentServiceAvailability,
    value: string,
  ) =>
    setAvailability((current) =>
      current.map((item, position) =>
        position === index
          ? {
              ...item,
              [field]:
                field === 'maxAppointmentsLimit'
                  ? value === ''
                    ? null
                    : Number(value)
                  : value,
            }
          : item,
      ),
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const name = fields.name.trim().toLowerCase();
    if (
      !name ||
      services.some(
        (other) =>
          other.uuid !== service?.uuid && other.name.toLowerCase() === name,
      )
    ) {
      setError(t('ADMIN_SERVICE_NAME_ERROR'));
      return;
    }
    if (
      !validAvailability(availability) ||
      activeAvailability.some((item) => !item.startTime || !item.endTime) ||
      (!activeAvailability.length &&
        ((fields.startTime && !fields.endTime) ||
          (!fields.startTime && fields.endTime) ||
          (fields.startTime && fields.startTime >= fields.endTime)))
    ) {
      setError(t('ADMIN_SERVICE_TIME_ERROR'));
      return;
    }
    if (!service && requiredAttributes.length) {
      setError(t('ADMIN_SERVICE_REQUIRED_ATTRIBUTES'));
      return;
    }
    if (
      !service &&
      (Number(fields.durationMins) <= 0 ||
        (!activeAvailability.length && (!fields.startTime || !fields.endTime)))
    ) {
      setError(t('ADMIN_SERVICE_NEW_REQUIRED'));
      return;
    }
    setSaving(true);
    try {
      await saveAppointmentService(
        serviceSaveRequest(service, fields, availability),
      );
      await queryClient.invalidateQueries({
        queryKey: ['allAppointmentServices'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['appointment-summary'],
      });
      navigate('/bahmni-v2/appointments/admin/services');
    } catch {
      setError(t('ADMIN_SERVICE_SAVE_ERROR'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.serviceForm} onSubmit={submit}>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      <div className={styles.serviceFields}>
        <label>
          {t('ADMIN_SERVICE_NAME')}
          <input
            required
            value={fields.name}
            disabled={!canManageService}
            onChange={(event) => updateField('name', event.target.value)}
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_DESCRIPTION')}
          <textarea
            value={fields.description}
            disabled={!canManageService}
            onChange={(event) => updateField('description', event.target.value)}
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_DURATION')}
          <input
            type="number"
            min="0"
            value={fields.durationMins}
            disabled={!canManageService}
            onChange={(event) =>
              updateField('durationMins', event.target.value)
            }
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_LOCATION')}
          <select
            value={fields.locationUuid}
            disabled={!canManageService}
            onChange={(event) =>
              updateField('locationUuid', event.target.value)
            }
          >
            <option value="">{t('APPOINTMENTS_NOT_SPECIFIED')}</option>
            {locations.map((location) => (
              <option key={location.uuid} value={location.uuid}>
                {location.display}
              </option>
            ))}
          </select>
        </label>
        {config.enableSpecialities && (
          <label>
            {t('ADMIN_SERVICE_SPECIALITY')}
            <select
              value={fields.specialityUuid}
              disabled={!canManageService}
              onChange={(event) =>
                updateField('specialityUuid', event.target.value)
              }
            >
              <option value="">{t('APPOINTMENTS_NOT_SPECIFIED')}</option>
              {specialities.map((speciality) => (
                <option key={speciality.uuid} value={speciality.uuid}>
                  {speciality.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.enableAppointmentRequests && (
          <label>
            {t('ADMIN_SERVICE_INITIAL_STATUS')}
            <select
              value={fields.initialAppointmentStatus}
              disabled={!canManageService}
              onChange={(event) =>
                updateField('initialAppointmentStatus', event.target.value)
              }
            >
              <option value="">{t('APPOINTMENTS_NOT_SPECIFIED')}</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Requested">Requested</option>
            </select>
          </label>
        )}
        <label>
          {t('ADMIN_SERVICE_START_TIME')}
          <input
            type="time"
            value={fields.startTime}
            disabled={!canManageService || activeAvailability.length > 0}
            onChange={(event) => updateField('startTime', event.target.value)}
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_END_TIME')}
          <input
            type="time"
            value={fields.endTime}
            disabled={!canManageService || activeAvailability.length > 0}
            onChange={(event) => updateField('endTime', event.target.value)}
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_MAX_LOAD')}
          <input
            type="number"
            min="0"
            value={fields.maxAppointmentsLimit}
            disabled={
              !canManageService ||
              activeAvailability.length > 0 ||
              !!service?.serviceTypes?.length
            }
            onChange={(event) =>
              updateField('maxAppointmentsLimit', event.target.value)
            }
          />
        </label>
        <label>
          {t('ADMIN_SERVICE_COLOR')}
          <input
            type="color"
            value={fields.color}
            disabled={!canManageService}
            onChange={(event) => updateField('color', event.target.value)}
          />
        </label>
      </div>
      <section className={styles.availabilitySection}>
        <h2>{t('ADMIN_SERVICE_WEEKLY_AVAILABILITY')}</h2>
        {availability.map((item, index) =>
          item.voided ? null : (
            <div
              key={item.uuid ?? `new-${index}`}
              className={styles.availabilityRow}
            >
              <label>
                {t('ADMIN_SERVICE_DAY')}
                <select
                  value={item.dayOfWeek}
                  disabled={!canManageAvailability}
                  onChange={(event) =>
                    updateAvailability(index, 'dayOfWeek', event.target.value)
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('ADMIN_SERVICE_START_TIME')}
                <input
                  type="time"
                  required
                  value={item.startTime.slice(0, 5)}
                  disabled={!canManageAvailability}
                  onChange={(event) =>
                    updateAvailability(index, 'startTime', event.target.value)
                  }
                />
              </label>
              <label>
                {t('ADMIN_SERVICE_END_TIME')}
                <input
                  type="time"
                  required
                  value={item.endTime.slice(0, 5)}
                  disabled={!canManageAvailability}
                  onChange={(event) =>
                    updateAvailability(index, 'endTime', event.target.value)
                  }
                />
              </label>
              <label>
                {t('ADMIN_SERVICE_MAX_LOAD')}
                <input
                  type="number"
                  min="0"
                  value={item.maxAppointmentsLimit ?? ''}
                  disabled={
                    !canManageAvailability || !!service?.serviceTypes?.length
                  }
                  onChange={(event) =>
                    updateAvailability(
                      index,
                      'maxAppointmentsLimit',
                      event.target.value,
                    )
                  }
                />
              </label>
              {canManageAvailability && (
                <button
                  type="button"
                  className={workspaceStyles.secondaryButton}
                  onClick={() =>
                    setAvailability((current) =>
                      current.flatMap((entry, position) =>
                        position !== index
                          ? [entry]
                          : entry.uuid
                            ? [{ ...entry, voided: true }]
                            : [],
                      ),
                    )
                  }
                >
                  {t('ADMIN_SERVICE_REMOVE_SLOT')}
                </button>
              )}
            </div>
          ),
        )}
        {canManageAvailability && (
          <button
            type="button"
            className={workspaceStyles.secondaryButton}
            onClick={() =>
              setAvailability((current) => [
                ...current,
                {
                  dayOfWeek: 'MONDAY',
                  startTime: '09:00',
                  endTime: '17:00',
                  maxAppointmentsLimit: null,
                },
              ])
            }
          >
            {t('ADMIN_SERVICE_ADD_SLOT')}
          </button>
        )}
      </section>
      {!!service?.serviceTypes?.length && (
        <p className={styles.preservedFields}>
          {t('ADMIN_SERVICE_TYPES_PRESERVED')}:{' '}
          {service.serviceTypes
            .filter((item) => !item.voided)
            .map((item) => item.name)
            .join(', ')}
        </p>
      )}
      {!!service?.attributes?.length && (
        <p className={styles.preservedFields}>
          {t('ADMIN_SERVICE_ATTRIBUTES_PRESERVED')}:{' '}
          {service.attributes
            .filter((item) => !item.voided)
            .map((item) => item.attributeType)
            .filter(Boolean)
            .join(', ')}
        </p>
      )}
      <div className={styles.formActions}>
        <a
          className={workspaceStyles.secondaryButton}
          href="/bahmni-v2/appointments/admin/services"
        >
          {t('APPOINTMENTS_CANCEL')}
        </a>
        {(canManageService || canManageAvailability) && (
          <button className={workspaceStyles.primaryButton} disabled={saving}>
            {saving ? t('ADMIN_SERVICE_SAVING') : t('ADMIN_SERVICE_SAVE')}
          </button>
        )}
      </div>
    </form>
  );
};

export const ServiceEditorPage = () => {
  const { t } = useTranslation();
  const { uuid = '' } = useParams();
  const isNew = uuid === 'new';
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:appointments:adminTab');
  const canManageService = hasPrivilege(
    userPrivileges,
    MANAGE_APPOINTMENT_SERVICES_PRIVILEGE,
  );
  const canManageAvailability =
    canManageService ||
    hasPrivilege(userPrivileges, 'app:appointments:manageServiceAvailability');
  const editorTitle = isNew
    ? t('ADMIN_ALL_SERVICES_ADD')
    : t(
        canManageService || canManageAvailability
          ? 'ADMIN_ALL_SERVICES_EDIT'
          : 'ADMIN_ALL_SERVICES_VIEW',
      );
  const service = useQuery({
    queryKey: ['appointment-service', uuid],
    queryFn: () => getAppointmentService(uuid),
    enabled: canView && !isNew,
  });
  const services = useQuery({
    queryKey: ['allAppointmentServices'],
    queryFn: getAllAppointmentServices,
    enabled: canView,
  });
  const config = useQuery({
    queryKey: ['legacy-appointment-config'],
    queryFn: () =>
      get<LegacyConfig>('/bahmni_config/openmrs/apps/appointments/app.json'),
    enabled: canView,
  });
  const locations = useQuery({
    queryKey: ['appointment-locations'],
    queryFn: () => getLocationByTag('Appointment Location'),
    enabled: canView,
  });
  const specialities = useQuery({
    queryKey: ['appointment-specialities'],
    queryFn: () =>
      get<{ uuid: string; name: string }[]>(
        '/openmrs/ws/rest/v1/speciality/all',
      ),
    enabled: canView && !!config.data?.config.enableSpecialities,
  });
  const attributeTypes = useQuery({
    queryKey: ['appointment-service-attribute-types'],
    queryFn: () =>
      get<AttributeType[]>(
        '/openmrs/ws/rest/v1/appointment-service-attribute-types',
      ),
    enabled: canView && isNew,
  });
  const loading =
    privilegesLoading ||
    services.isLoading ||
    config.isLoading ||
    locations.isLoading ||
    (!isNew && service.isLoading) ||
    (Boolean(config.data?.config.enableSpecialities) &&
      specialities.isLoading) ||
    (isNew && attributeTypes.isLoading);
  const error =
    services.isError ||
    config.isError ||
    locations.isError ||
    (!isNew && service.isError) ||
    (Boolean(config.data?.config.enableSpecialities) && specialities.isError) ||
    (isNew && attributeTypes.isError);

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: t('BREADCRUMB_HOME'), href: BAHMNI_HOME_PATH },
            {
              id: 'appointments',
              label: t('BREADCRUMB_APPOINTMENTS'),
              href: '/bahmni-v2/appointments/',
            },
            {
              id: 'services',
              label: t('ADMIN_ALL_SERVICES_PAGE_TITLE'),
              href: '/bahmni-v2/appointments/admin/services',
            },
            {
              id: 'edit',
              label: editorTitle,
              isCurrentPage: true,
            },
          ]}
          userMenu={<UserGlobalAction />}
        />
      }
      main={
        <main className={workspaceStyles.page}>
          <div className={workspaceStyles.intro}>
            <span className={workspaceStyles.eyebrow}>
              {t('APPOINTMENTS_ADMIN')}
            </span>
            <h1>{editorTitle}</h1>
          </div>
          {!canView ? (
            <p role="alert">
              {t('ADMIN_ALL_SERVICES_ERROR_MESSAGE_NO_VIEW_PRIVILEGE')}
            </p>
          ) : loading ? (
            <p role="status">{t('APPOINTMENTS_LOADING')}</p>
          ) : error ||
            !config.data ||
            !services.data ||
            !locations.data ||
            (!isNew && !service.data) ? (
            <p role="alert">{t('ADMIN_SERVICE_LOAD_ERROR')}</p>
          ) : (
            <ServiceForm
              key={uuid}
              service={service.data}
              services={services.data}
              config={config.data.config}
              locations={locations.data}
              specialities={specialities.data ?? []}
              requiredAttributes={(attributeTypes.data ?? []).filter(
                (item) => (item.minOccurs ?? 0) > 0,
              )}
              canManageService={canManageService}
              canManageAvailability={canManageAvailability}
            />
          )}
        </main>
      }
    />
  );
};
