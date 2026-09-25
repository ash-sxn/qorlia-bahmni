import {
  del,
  fetchMedicationOrdersMetadata,
  get,
  getOrderTypes,
  post,
  useTranslation,
  type MedicationOrdersMetadataResponse,
} from '@bahmni/services';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import styles from './styles/OrderSets.module.scss';

const base = '/openmrs/ws/rest/v1/bahmniorderset';
const routeBase = '/admin/order-sets';

interface OrderType {
  uuid: string;
  display: string;
  conceptClasses: { name: string }[];
}
interface Concept {
  uuid: string;
  name: { name: string };
  conceptClass: { name: string };
}
interface Drug {
  uuid: string;
  name: string;
  dosageForm?: { display: string };
  drugReferenceMaps?: unknown[];
}
interface Template {
  drug?: {
    uuid?: string;
    name?: string;
    form?: string;
    drugReferenceMaps?: unknown[];
  };
  dosingInstructions?: {
    dose?: number;
    doseUnits?: string;
    dosingRule?: string;
    frequency?: string;
    route?: string;
  };
  administrationInstructions?: string;
  duration?: number;
  durationUnits?: string;
  additionalInstructions?: string;
}
interface Member {
  uuid?: string;
  key: string;
  orderType: { uuid: string };
  concept: { uuid?: string; display?: string };
  orderTemplate: Template;
  retired?: boolean;
}
interface OrderSet {
  uuid?: string;
  name: string;
  description: string;
  operator: 'ALL' | 'ANY' | 'ONE';
  orderSetMembers: Member[];
  retired?: boolean;
}

const blankMember = (orderTypeUuid = ''): Member => ({
  key: crypto.randomUUID(),
  orderType: { uuid: orderTypeUuid },
  concept: {},
  orderTemplate: { drug: {}, dosingInstructions: {} },
  retired: false,
});
const parseOrderSet = (set: OrderSet): OrderSet => ({
  ...set,
  orderSetMembers: (set.orderSetMembers ?? []).map((member) => ({
    ...member,
    key: crypto.randomUUID(),
    orderTemplate:
      typeof member.orderTemplate === 'string'
        ? (JSON.parse(member.orderTemplate) as Template)
        : (member.orderTemplate ?? {}),
  })),
});
export const savePayload = (set: OrderSet) => ({
  uuid: set.uuid,
  name: set.name.trim(),
  description: set.description.trim(),
  operator: set.operator,
  orderSetMembers: set.orderSetMembers.map(
    ({ uuid, orderType, concept, retired, orderTemplate }) => ({
      uuid,
      orderType,
      concept,
      retired,
      orderTemplate: JSON.stringify(orderTemplate),
    }),
  ),
});
const searchConcepts = async (
  term: string,
  type?: OrderType,
): Promise<Concept[]> => {
  const params = new URLSearchParams({
    q: term,
    v: 'custom:(uuid,name:(uuid,name),conceptClass:(uuid,name,display))',
  });
  const response = await get<{ results: Concept[] }>(
    `/openmrs/ws/rest/v1/concept?${params}`,
  );
  const classes = new Set(type?.conceptClasses.map((item) => item.name) ?? []);
  return response.results.filter((concept) =>
    classes.has(concept.conceptClass?.name),
  );
};
const searchDrugs = async (
  term: string,
  conceptUuid: string,
): Promise<Drug[]> => {
  const params = new URLSearchParams({
    q: term,
    conceptUuid,
    s: 'ordered',
    v: 'custom:(uuid,strength,drugReferenceMaps,name,dosageForm,concept:(uuid,name,names:(name)))',
  });
  const response = await get<{ results: Drug[] }>(
    `/openmrs/ws/rest/v1/drug?${params}`,
  );
  return response.results;
};

const MemberEditor = ({
  member,
  types,
  config,
  onChange,
  onRemove,
  onMove,
}: {
  member: Member;
  types: OrderType[];
  config?: MedicationOrdersMetadataResponse;
  onChange: (member: Member) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) => {
  const { t } = useTranslation();
  const [conceptTerm, setConceptTerm] = useState(member.concept.display ?? '');
  const [drugTerm, setDrugTerm] = useState(
    member.orderTemplate.drug?.name ?? '',
  );
  const [debouncedConcept, setDebouncedConcept] = useState('');
  const [debouncedDrug, setDebouncedDrug] = useState('');
  const type = types.find((item) => item.uuid === member.orderType.uuid);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedConcept(conceptTerm.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [conceptTerm]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedDrug(drugTerm.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [drugTerm]);
  const concepts = useQuery({
    queryKey: ['admin', 'order-set-concepts', type?.uuid, debouncedConcept],
    queryFn: () => searchConcepts(debouncedConcept, type),
    enabled: debouncedConcept.length >= 2 && !member.concept.uuid && !!type,
  });
  const drugs = useQuery({
    queryKey: ['admin', 'order-set-drugs', member.concept.uuid, debouncedDrug],
    queryFn: () => searchDrugs(debouncedDrug, member.concept.uuid!),
    enabled:
      debouncedDrug.length >= 2 &&
      !!member.concept.uuid &&
      !member.orderTemplate.drug?.uuid,
  });
  const template = member.orderTemplate;
  const dosing = template.dosingInstructions ?? {};
  const changeTemplate = (change: Partial<Template>) =>
    onChange({
      ...member,
      orderTemplate: { ...template, ...change },
    });
  const changeDosing = (
    change: Partial<NonNullable<Template['dosingInstructions']>>,
  ) => changeTemplate({ dosingInstructions: { ...dosing, ...change } });
  const optionList = (items?: { name: string }[]) =>
    items?.map((item) => (
      <option key={item.name} value={item.name}>
        {item.name}
      </option>
    ));

  return (
    <fieldset className={styles.member}>
      <legend>{t('ADMIN_ORDER_MEMBER')}</legend>
      <div className={styles.memberHeader}>
        <label>
          {t('ADMIN_ORDER_TYPE')}
          <select
            required
            value={member.orderType.uuid}
            onChange={(event) => {
              setConceptTerm('');
              setDrugTerm('');
              onChange({
                ...member,
                orderType: { uuid: event.target.value },
                concept: {},
                orderTemplate: { drug: {}, dosingInstructions: {} },
              });
            }}
          >
            {types.map((item) => (
              <option key={item.uuid} value={item.uuid}>
                {item.display}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.searchField}>
          <label>
            {t('ADMIN_ORDER_CONCEPT')}
            <input
              required
              value={conceptTerm}
              autoComplete="off"
              onChange={(event) => {
                setConceptTerm(event.target.value);
                onChange({
                  ...member,
                  concept: {},
                  orderTemplate: { drug: {}, dosingInstructions: {} },
                });
              }}
            />
          </label>
          {!member.concept.uuid &&
            debouncedConcept === conceptTerm.trim() &&
            !!concepts.data?.length && (
              <ul
                className={styles.suggestions}
                aria-label={t('ADMIN_ORDER_CONCEPT_RESULTS')}
              >
                {concepts.data.map((concept) => (
                  <li key={concept.uuid}>
                    <button
                      type="button"
                      onClick={() => {
                        setConceptTerm(concept.name.name);
                        onChange({
                          ...member,
                          concept: {
                            uuid: concept.uuid,
                            display: concept.name.name,
                          },
                        });
                      }}
                    >
                      {concept.name.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {concepts.isError && (
            <p role="alert">{t('ADMIN_ORDER_CONCEPT_ERROR')}</p>
          )}
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            onClick={() => onMove(-1)}
            aria-label={t('ADMIN_ORDER_MOVE_UP')}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            aria-label={t('ADMIN_ORDER_MOVE_DOWN')}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('ADMIN_ORDER_REMOVE_MEMBER')}
          >
            ×
          </button>
        </div>
      </div>
      {member.concept.uuid && (
        <div className={styles.template}>
          <div className={styles.searchField}>
            <label>
              {t('ADMIN_ORDER_DRUG')}
              <input
                value={drugTerm}
                autoComplete="off"
                onChange={(event) => {
                  setDrugTerm(event.target.value);
                  changeTemplate({ drug: { name: event.target.value } });
                }}
              />
            </label>
            {!template.drug?.uuid &&
              debouncedDrug === drugTerm.trim() &&
              !!drugs.data?.length && (
                <ul
                  className={styles.suggestions}
                  aria-label={t('ADMIN_ORDER_DRUG_RESULTS')}
                >
                  {drugs.data.map((drug) => (
                    <li key={drug.uuid}>
                      <button
                        type="button"
                        onClick={() => {
                          setDrugTerm(drug.name);
                          changeTemplate({
                            drug: {
                              uuid: drug.uuid,
                              name: drug.name,
                              form: drug.dosageForm?.display,
                              drugReferenceMaps: drug.drugReferenceMaps ?? [],
                            },
                          });
                        }}
                      >
                        {drug.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <label>
            {t('ADMIN_ORDER_DOSE')}
            <input
              type="number"
              min="0"
              step="any"
              required={dosing.dosingRule !== 'customrule'}
              disabled={dosing.dosingRule === 'customrule'}
              value={dosing.dose ?? ''}
              onChange={(event) =>
                changeDosing({
                  dose: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            {t('ADMIN_ORDER_DOSE_UNIT')}
            <select
              required={!dosing.dosingRule}
              disabled={!!dosing.dosingRule}
              value={dosing.doseUnits ?? ''}
              onChange={(event) =>
                changeDosing({ doseUnits: event.target.value })
              }
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {optionList(config?.doseUnits)}
            </select>
          </label>
          <label>
            {t('ADMIN_ORDER_RULE')}
            <select
              value={dosing.dosingRule ?? ''}
              onChange={(event) =>
                changeDosing({ dosingRule: event.target.value })
              }
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {config?.dosingRules.map((rule) => (
                <option key={rule} value={rule}>
                  {rule}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('ADMIN_ORDER_FREQUENCY')}
            <select
              required
              value={dosing.frequency ?? ''}
              onChange={(event) =>
                changeDosing({ frequency: event.target.value })
              }
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {optionList(config?.frequencies)}
            </select>
          </label>
          <label>
            {t('ADMIN_ORDER_ADMINISTRATION')}
            <select
              value={template.administrationInstructions ?? ''}
              onChange={(event) =>
                changeTemplate({
                  administrationInstructions: event.target.value,
                })
              }
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {optionList(config?.dosingInstructions)}
            </select>
          </label>
          <label>
            {t('ADMIN_ORDER_DURATION')}
            <input
              type="number"
              min="1"
              step="1"
              required
              value={template.duration ?? ''}
              onChange={(event) =>
                changeTemplate({
                  duration: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            {t('ADMIN_ORDER_DURATION_UNIT')}
            <select
              required
              value={template.durationUnits ?? ''}
              onChange={(event) =>
                changeTemplate({ durationUnits: event.target.value })
              }
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {optionList(config?.durationUnits)}
            </select>
          </label>
          <label>
            {t('ADMIN_ORDER_ROUTE')}
            <select
              required
              value={dosing.route ?? ''}
              onChange={(event) => changeDosing({ route: event.target.value })}
            >
              <option value="">{t('ADMIN_ORDER_CHOOSE')}</option>
              {optionList(config?.routes)}
            </select>
          </label>
          <label className={styles.wide}>
            {t('ADMIN_ORDER_INSTRUCTIONS')}
            <textarea
              value={template.additionalInstructions ?? ''}
              onChange={(event) =>
                changeTemplate({ additionalInstructions: event.target.value })
              }
            />
          </label>
        </div>
      )}
    </fieldset>
  );
};

export const OrderSets = () => {
  const { t } = useTranslation();
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrderSet | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'order-sets'],
    queryFn: () => get<{ results: OrderSet[] }>(`${base}?v=full`),
    enabled: !uuid,
  });
  const types = useQuery({
    queryKey: ['admin', 'order-types'],
    queryFn: getOrderTypes,
    enabled: !!uuid,
  });
  const config = useQuery({
    queryKey: ['admin', 'drug-orders-config'],
    queryFn: fetchMedicationOrdersMetadata,
    enabled: !!uuid,
  });
  const detail = useQuery({
    queryKey: ['admin', 'order-set', uuid],
    queryFn: () => get<OrderSet>(`${base}/${encodeURIComponent(uuid!)}?v=full`),
    enabled: !!uuid && uuid !== 'new',
  });

  useEffect(() => {
    if (!uuid) {
      setForm(null);
      return;
    }
    if (uuid === 'new' && types.data && !form) {
      const firstType = types.data.results[0]?.uuid ?? '';
      setForm({
        name: '',
        description: '',
        operator: 'ALL',
        orderSetMembers: [blankMember(firstType), blankMember(firstType)],
      });
    } else if (uuid !== 'new' && detail.data && form?.uuid !== uuid) {
      setForm(parseOrderSet(detail.data));
    }
  }, [uuid, types.data, detail.data, form]);

  const changeMember = (key: string, member: Member) =>
    setForm(
      (current) =>
        current && {
          ...current,
          orderSetMembers: current.orderSetMembers.map((item) =>
            item.key === key ? member : item,
          ),
        },
    );
  const moveMember = (key: string, direction: -1 | 1) =>
    setForm((current) => {
      if (!current) return current;
      const members = [...current.orderSetMembers];
      const index = members.findIndex((item) => item.key === key);
      const next = index + direction;
      if (next < 0 || next >= members.length) return current;
      [members[index], members[next]] = [members[next], members[index]];
      return { ...current, orderSetMembers: members };
    });
  const removeMember = (key: string) =>
    setForm(
      (current) =>
        current && {
          ...current,
          orderSetMembers: current.orderSetMembers.flatMap((item) =>
            item.key !== key
              ? [item]
              : item.uuid
                ? [{ ...item, retired: true }]
                : [],
          ),
        },
    );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const active = form.orderSetMembers.filter((member) => !member.retired);
    if (active.length < 2) {
      setError(t('ADMIN_ORDER_MINIMUM'));
      return;
    }
    if (active.some((member) => !member.concept.uuid)) {
      setError(t('ADMIN_ORDER_SELECT_CONCEPT'));
      return;
    }
    if (
      active.some(
        (member) =>
          member.orderTemplate.drug?.name && !member.orderTemplate.drug.uuid,
      )
    ) {
      setError(t('ADMIN_ORDER_SELECT_DRUG'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const path = form.uuid
        ? `${base}/${encodeURIComponent(form.uuid)}`
        : base;
      const saved = await post<OrderSet>(path, savePayload(form));
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'order-sets'],
      });
      setForm(null);
      navigate(`${routeBase}/${saved.uuid}`);
    } catch {
      setError(t('ADMIN_ORDER_SAVE_ERROR'));
    } finally {
      setSaving(false);
    }
  };
  const retire = async (set: OrderSet) => {
    if (
      !set.uuid ||
      !window.confirm(t('ADMIN_ORDER_REMOVE_CONFIRM', { name: set.name }))
    )
      return;
    try {
      await del(`${base}/${encodeURIComponent(set.uuid)}`, {
        params: { reason: 'User deleted the orderSet.' },
      });
      await list.refetch();
    } catch {
      setError(t('ADMIN_ORDER_REMOVE_ERROR'));
    }
  };

  return (
    <AdminLayout>
      <section className={styles.page} aria-label={t('ADMIN_ORDER_TITLE')}>
        <p className={styles.eyebrow}>{t('BREADCRUMB_ADMIN')}</p>
        <div className={styles.heading}>
          <div>
            <h1>{t('ADMIN_ORDER_TITLE')}</h1>
            <p>{t('ADMIN_ORDER_DESCRIPTION')}</p>
          </div>
          {uuid ? (
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setError('');
                navigate(routeBase);
              }}
            >
              {t('ADMIN_ORDER_BACK')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError('');
                navigate(`${routeBase}/new`);
              }}
            >
              {t('ADMIN_ORDER_CREATE')}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!uuid && (
          <div className={styles.card}>
            {list.isLoading && <p role="status">{t('ADMIN_ORDER_LOADING')}</p>}
            {list.isError && <p role="alert">{t('ADMIN_ORDER_LOAD_ERROR')}</p>}
            {list.data?.results.filter((set) => !set.retired).length === 0 && (
              <p>{t('ADMIN_ORDER_EMPTY')}</p>
            )}
            {!!list.data?.results.length && (
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('ADMIN_ORDER_NAME')}</th>
                      <th scope="col">{t('ADMIN_ORDER_ACTIONS')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.results
                      .filter((set) => !set.retired)
                      .map((set) => (
                        <tr key={set.uuid}>
                          <td>
                            <button
                              type="button"
                              className={styles.textButton}
                              onClick={() =>
                                navigate(`${routeBase}/${set.uuid}`)
                              }
                            >
                              {set.name}
                            </button>
                          </td>
                          <td>
                            <button type="button" onClick={() => retire(set)}>
                              {t('ADMIN_ORDER_REMOVE')}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {!!uuid &&
          (types.isLoading || detail.isLoading || config.isLoading) && (
            <p role="status">{t('ADMIN_ORDER_LOADING')}</p>
          )}
        {!!uuid && (types.isError || detail.isError || config.isError) && (
          <p role="alert">{t('ADMIN_ORDER_LOAD_ERROR')}</p>
        )}
        {!!uuid && form && types.data && config.data && (
          <form className={styles.card} onSubmit={save}>
            <h2>{t('ADMIN_ORDER_DETAILS')}</h2>
            <div className={styles.fields}>
              <label>
                {t('ADMIN_ORDER_NAME')}
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                {t('ADMIN_ORDER_SET_DESCRIPTION')}
                <input
                  required
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <label>
                {t('ADMIN_ORDER_OPERATOR')}
                <select
                  required
                  value={form.operator}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      operator: event.target.value as OrderSet['operator'],
                    })
                  }
                >
                  <option>ALL</option>
                  <option>ANY</option>
                  <option>ONE</option>
                </select>
              </label>
            </div>
            <div className={styles.subheading}>
              <h2>{t('ADMIN_ORDER_MEMBERS')}</h2>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    orderSetMembers: [
                      ...form.orderSetMembers,
                      blankMember(types.data.results[0]?.uuid),
                    ],
                  })
                }
              >
                {t('ADMIN_ORDER_ADD_MEMBER')}
              </button>
            </div>
            {form.orderSetMembers
              .filter((member) => !member.retired)
              .map((member) => (
                <MemberEditor
                  key={member.key}
                  member={member}
                  types={types.data.results}
                  config={config.data}
                  onChange={(next) => changeMember(member.key, next)}
                  onRemove={() => removeMember(member.key)}
                  onMove={(direction) => moveMember(member.key, direction)}
                />
              ))}
            <div className={styles.footer}>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  navigate(routeBase);
                }}
              >
                {t('ADMIN_ORDER_CANCEL')}
              </button>
              <button type="submit" disabled={saving}>
                {saving ? t('ADMIN_ORDER_SAVING') : t('ADMIN_ORDER_SAVE')}
              </button>
            </div>
          </form>
        )}
      </section>
    </AdminLayout>
  );
};
