import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  formatDateTime,
  get,
  getFormattedPatientById,
  getUserLoginLocation,
  hasPrivilege,
  searchPatientByNameOrId,
} from '@bahmni/services';
import {
  UserGlobalAction,
  useActivePractitioner,
  useUserPrivilege,
} from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styles from './BedManagement.module.scss';
import OrderResultEditor, { OrderResultValues } from './OrderResultEditor';
import {
  findFulfillmentEncounter,
  getFulfillmentForm,
  getFulfillmentOrders,
} from './ordersApi';

interface OrderSearchTab {
  id: string;
  label: string;
  order?: number;
  extensionPointId: string;
  requiredPrivilege?: string;
  extensionParams: {
    searchHandler?: string;
    additionalParams?: string;
    forwardUrl?: string;
  };
}

interface OrderPatientRow {
  uuid: string;
  name: string;
  identifier: string;
  activeVisitUuid?: string;
  [column: string]: unknown;
}

interface OrdersConfig {
  config: {
    ignoredTabularViewHeadings?: string[];
    conceptSetUI?: Record<string, Record<string, unknown>>;
  };
}

export const fetchOrderPatients = (
  tab: OrderSearchTab,
  locationUuid: string,
  providerUuid: string,
) =>
  get<OrderPatientRow[]>('/openmrs/ws/rest/v1/bahmnicore/sql', {
    params: {
      q: tab.extensionParams.searchHandler,
      v: 'full',
      location_uuid: locationUuid,
      provider_uuid: providerUuid,
      additionalParams: tab.extensionParams.additionalParams,
    },
  });

// Only remap the legacy fulfillment target that this React route implements.
export const fulfillmentOrderType = (url?: string) =>
  url?.match(/\/fulfillment\/([^?#]+)/)?.[1];

const OrdersPage = () => {
  const { patientUuid, orderType } = useParams();
  const [params] = useSearchParams();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const { practitioner, loading: practitionerLoading } =
    useActivePractitioner();
  const [tabId, setTabId] = useState('');
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const canView = hasPrivilege(userPrivileges, 'app:orders');
  let locationUuid = '';
  try {
    locationUuid = getUserLoginLocation().uuid;
  } catch {
    /* Location is not ready. */
  }
  const ready =
    !privilegesLoading &&
    !practitionerLoading &&
    canView &&
    !!locationUuid &&
    !!practitioner?.uuid;
  const settings = useQuery({
    queryKey: ['orders-settings'],
    queryFn: async () => {
      const [extensions, app] = await Promise.all([
        get<Record<string, OrderSearchTab>>(
          '/bahmni_config/openmrs/apps/orders/extension.json',
        ),
        get<OrdersConfig>('/bahmni_config/openmrs/apps/orders/app.json'),
      ]);
      return { extensions, app };
    },
    enabled: ready,
  });
  const tabs = Object.values(settings.data?.extensions ?? {})
    .filter(
      (tab) =>
        tab.extensionPointId === 'org.bahmni.patient.search' &&
        (!tab.requiredPrivilege ||
          hasPrivilege(userPrivileges, tab.requiredPrivilege)),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const tab = tabs.find((entry) => entry.id === tabId) ?? tabs[0];
  const queue = useQuery({
    queryKey: [
      'orders-patient-queue',
      tab?.id,
      locationUuid,
      practitioner?.uuid,
    ],
    queryFn: () => fetchOrderPatients(tab!, locationUuid, practitioner!.uuid),
    enabled: ready && !patientUuid && !!tab?.extensionParams.searchHandler,
  });
  const search = useQuery({
    queryKey: ['orders-patient-search', term, locationUuid],
    queryFn: () => searchPatientByNameOrId(term),
    enabled:
      ready &&
      !patientUuid &&
      !tab?.extensionParams.searchHandler &&
      term.length >= 2,
  });
  const patient = useQuery({
    queryKey: ['patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid!),
    enabled: ready && !!patientUuid,
  });
  const visitUuid = params.get('visitUuid') ?? undefined;
  const orderUuid = params.get('orderUuid') ?? undefined;
  const results = useQuery({
    queryKey: [
      'order-fulfillment',
      patientUuid,
      orderType,
      locationUuid,
      practitioner?.uuid,
      visitUuid,
      orderUuid,
    ],
    queryFn: async () => {
      const form = await getFulfillmentForm(orderType!);
      const [orders, encounter] = await Promise.all([
        getFulfillmentOrders(patientUuid!, orderType!, form, {
          visitUuid,
          orderUuid,
        }),
        findFulfillmentEncounter(
          patientUuid!,
          locationUuid,
          practitioner!.uuid,
        ),
      ]);
      return { form, orders, encounter };
    },
    enabled: ready && !!patientUuid && !!orderType,
    // Do not replace a result draft when the browser regains focus.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const rows: OrderPatientRow[] = tab?.extensionParams.searchHandler
    ? (queue.data ?? []).filter((row) =>
        `${row.name} ${row.identifier}`
          .toLowerCase()
          .includes(input.trim().toLowerCase()),
      )
    : (search.data?.pageOfResults.map((row) => ({
        uuid: row.uuid,
        name: [row.givenName, row.middleName, row.familyName]
          .filter(Boolean)
          .join(' '),
        identifier: row.identifier,
        activeVisitUuid: row.activeVisitUuid,
      })) ?? []);
  const hiddenColumns = new Set([
    'uuid',
    'activeVisitUuid',
    'hasBeenAdmitted',
    'display',
    'image',
    '$$hashKey',
    ...(settings.data?.app.config.ignoredTabularViewHeadings ?? []),
  ]);
  const columns = rows[0]
    ? Object.keys(rows[0]).filter((key) => !hiddenColumns.has(key))
    : [];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.trim().length < 2) return;
    setTerm(input.trim());
  };
  const type = fulfillmentOrderType(tab?.extensionParams.forwardUrl);

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            {
              id: 'orders',
              label: 'Orders',
              href: patientUuid ? '/bahmni-v2/clinical/orders' : undefined,
              isCurrentPage: !patientUuid,
            },
            ...(patientUuid
              ? [
                  {
                    id: 'patient',
                    label: patient.data?.fullName ?? 'Patient results',
                    isCurrentPage: true,
                  },
                ]
              : []),
          ]}
          userMenu={<UserGlobalAction />}
        />
      }
      main={
        <main className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Orders and results</span>
            <h1>{patientUuid ? orderType : 'Order fulfillment'}</h1>
            <p>
              {patientUuid
                ? `${patient.data?.fullName ?? 'Patient'}: review requests and record their results.`
                : 'Choose a patient from the configured worklist.'}
            </p>
          </div>
          {privilegesLoading ||
          userPrivileges === null ||
          practitionerLoading ? (
            <p role="status">Loading access…</p>
          ) : !canView ? (
            <p role="alert">You do not have access to order fulfillment.</p>
          ) : !ready ? (
            <p role="alert">
              Select a login location and provider to continue.
            </p>
          ) : settings.isPending ? (
            <p role="status">Loading order settings…</p>
          ) : settings.isError ? (
            <p role="alert">Could not load order settings.</p>
          ) : patientUuid ? (
            <>
              <nav className={styles.pageNav}>
                <Link to="/clinical/orders">Back to worklist</Link>
                <Link to={`/clinical/${encodeURIComponent(patientUuid)}`}>
                  Patient record
                </Link>
              </nav>
              {patient.isError ? (
                <p role="alert">Could not load this patient.</p>
              ) : patient.isPending || results.isPending ? (
                <p role="status">Loading orders and results…</p>
              ) : results.isError ? (
                <p role="alert">
                  Could not load fulfillment data. {results.error.message}
                </p>
              ) : !results.data.orders.length ? (
                <p>No {orderType} requests were found for this patient.</p>
              ) : (
                results.data.orders.map((order) => (
                  <section className={styles.card} key={order.orderUuid}>
                    <h2>{order.concept.shortName ?? order.concept.name}</h2>
                    <p>
                      {[
                        order.orderNumber,
                        order.orderDate == null
                          ? undefined
                          : formatDateTime(order.orderDate, undefined, true)
                              .formattedResult,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {order.commentToFulfiller && (
                      <p>
                        <strong>Instructions: </strong>
                        {order.commentToFulfiller}
                      </p>
                    )}
                    {!!order.bahmniObservations?.length && (
                      <details>
                        <summary>Previous results</summary>
                        <OrderResultValues
                          observations={order.bahmniObservations}
                        />
                      </details>
                    )}
                    <OrderResultEditor
                      key={order.orderUuid}
                      patientUuid={patientUuid}
                      order={order}
                      form={results.data.form}
                      snapshot={results.data.encounter}
                      locationUuid={locationUuid}
                      providerUuid={practitioner!.uuid}
                      uiConfig={settings.data?.app.config.conceptSetUI ?? {}}
                      onSaved={async () => {
                        const fresh = await results.refetch();
                        if (fresh.isError)
                          throw new Error(
                            'Result saved, but refresh failed. Reload before another edit.',
                          );
                        return fresh.data!.encounter;
                      }}
                    />
                  </section>
                ))
              )}
            </>
          ) : (
            <section className={styles.card}>
              <nav className={styles.tabs} aria-label="Order worklists">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={tab?.id === item.id}
                    onClick={() => {
                      setTabId(item.id);
                      setInput('');
                      setTerm('');
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              {!tab ? (
                <p>No worklists are configured for your role.</p>
              ) : (
                <>
                  <form
                    className={styles.searchForm}
                    onSubmit={submit}
                    role="search"
                  >
                    <label htmlFor="orders-filter">
                      {tab.extensionParams.searchHandler
                        ? 'Filter worklist'
                        : 'Patient name or ID'}
                    </label>
                    <input
                      id="orders-filter"
                      type="search"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                    />
                    {!tab.extensionParams.searchHandler && (
                      <button type="submit" disabled={input.trim().length < 2}>
                        Search
                      </button>
                    )}
                  </form>
                  {queue.isLoading || search.isLoading ? (
                    <p role="status">Loading patients…</p>
                  ) : queue.isError || search.isError ? (
                    <p role="alert">Could not load this patient list.</p>
                  ) : !tab.extensionParams.searchHandler && term.length < 2 ? (
                    <p>Enter at least two characters to search.</p>
                  ) : !rows.length ? (
                    <p>No patients match this worklist.</p>
                  ) : (
                    <div className={styles.tableScroll}>
                      <table>
                        <thead>
                          <tr>
                            {columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.uuid}>
                              {columns.map((column) => (
                                <td key={column}>
                                  {row[column] == null
                                    ? ''
                                    : String(row[column])}
                                </td>
                              ))}
                              <td>
                                {type ? (
                                  <Link
                                    to={`/clinical/orders/${encodeURIComponent(row.uuid)}/${encodeURIComponent(type)}`}
                                  >
                                    View orders
                                  </Link>
                                ) : (
                                  <span>
                                    This configured workflow is not yet
                                    available in React.
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      }
    />
  );
};

export default OrdersPage;
