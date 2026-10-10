const API = '/openmrs/qorlia-billing-api';

export class BillingSessionExpired extends Error {
  readonly billingSessionExpired = true;
}

export class BillingActionRejected extends Error {}

export interface BillingSession {
  uid: number | false;
  name?: string;
  db?: string;
}

export interface Invoice {
  id: number;
  name: string | false;
  ref: string | false;
  move_type: 'out_invoice' | 'out_refund';
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  state: string;
  payment_state: string;
  amount_total: number;
  amount_untaxed: number;
  qorlia_item_subtotal: number;
  amount_tax: number;
  discount: number;
  round_off_amount: number;
  invoice_total: number;
  amount_residual: number;
  currency_id: [number, string];
}

export interface InvoiceLine {
  id: number;
  name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  discount: number;
  price_total: number;
}

export interface InvoiceWorkflow {
  id: number;
  name: string | false;
  state: 'draft' | 'posted' | 'cancel';
  move_type: 'out_invoice' | 'out_refund';
  version: string;
  customer: string | false;
  currency: [number, string];
  total: number;
  open_amount: number;
  payment_state: string;
  invoice_date: string | false;
  journal: string;
  company: string;
  ledger_balanced: boolean;
  can_post: boolean;
}

export interface InvoiceJournal {
  invoice_id: number;
  name: string | false;
  state: 'draft' | 'posted' | 'cancel';
  journal: string;
  company: string;
  currency: [number, string];
  date: string | false;
  version: string;
  after: number | false;
  next_after: number | false;
  total_count: number;
  debit: number;
  credit: number;
  balanced: boolean;
  analytics_visible: boolean;
  rows: {
    id: number;
    name: string | false;
    account_id: Relation;
    partner_id: Relation;
    date: string | false;
    date_maturity: string | false;
    debit: number;
    credit: number;
    balance: number;
    currency_id: Relation;
    amount_currency: number;
    amount_residual: number;
    amount_residual_currency: number;
    reconciled: boolean;
    matching_number: string | false;
    tax_ids: [number, string][];
    tax_tag_ids: [number, string][];
    display_type: string | false;
    qorlia_adjustment_kind: false | 'discount' | 'rounding';
    analytic_distribution: Record<string, number> | false;
    can_cutoff: boolean;
  }[];
}

export async function getInvoiceJournal(
  invoiceId: number,
  after: number | false = false,
  version: string | false = false,
): Promise<InvoiceJournal> {
  const identifier = (value: unknown) =>
    Number.isSafeInteger(value) && Number(value) > 0;
  const date = (value: unknown) =>
    value === false ||
    (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const hash = (value: unknown) =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const text = (value: unknown) => value === false || typeof value === 'string';
  if (
    !identifier(invoiceId) ||
    !(after === false || identifier(after)) ||
    !(version === false || hash(version)) ||
    (after !== false && version === false)
  )
    throw new Error('Select an invoice and reload its journal items.');
  const method = 'qorlia_invoice_journal';
  const result = await rpc<InvoiceJournal>(
    `/web/dataset/call_kw/account.move/${method}`,
    {
      model: 'account.move',
      method,
      args: [],
      kwargs: { invoice_id: invoiceId, after, version },
    },
  );
  if (
    result?.invoice_id !== invoiceId ||
    result.after !== after ||
    !text(result.name) ||
    !['draft', 'posted', 'cancel'].includes(result.state) ||
    typeof result.journal !== 'string' ||
    typeof result.company !== 'string' ||
    !Array.isArray(result.currency) ||
    !validRelation(result.currency) ||
    !date(result.date) ||
    !hash(result.version) ||
    (version !== false && result.version !== version) ||
    !(result.next_after === false || identifier(result.next_after)) ||
    !Number.isSafeInteger(result.total_count) ||
    result.total_count < 0 ||
    ![result.debit, result.credit].every(Number.isFinite) ||
    result.debit < 0 ||
    result.credit < 0 ||
    typeof result.balanced !== 'boolean' ||
    typeof result.analytics_visible !== 'boolean' ||
    !Array.isArray(result.rows) ||
    result.rows.length > 100 ||
    result.rows.length > result.total_count
  )
    throw new Error('Invalid journal response. Reload all journal items.');
  let previous = after || 0;
  for (const row of result.rows) {
    const distribution = row?.analytic_distribution;
    if (
      !row ||
      !identifier(row.id) ||
      row.id <= previous ||
      !text(row.name) ||
      !validRelation(row.account_id) ||
      !validRelation(row.partner_id) ||
      !date(row.date) ||
      !date(row.date_maturity) ||
      !validRelation(row.currency_id) ||
      typeof row.can_cutoff !== 'boolean' ||
      (row.can_cutoff && (result.state !== 'posted' || row.reconciled)) ||
      ![
        row.debit,
        row.credit,
        row.balance,
        row.amount_currency,
        row.amount_residual,
        row.amount_residual_currency,
      ].every(Number.isFinite) ||
      row.debit < 0 ||
      row.credit < 0 ||
      typeof row.reconciled !== 'boolean' ||
      !text(row.matching_number) ||
      ![row.tax_ids, row.tax_tag_ids].every(
        (values) =>
          Array.isArray(values) &&
          values.every((value) => Array.isArray(value) && validRelation(value)),
      ) ||
      !text(row.display_type) ||
      ![false, 'discount', 'rounding'].includes(row.qorlia_adjustment_kind) ||
      !(
        distribution === false ||
        (result.analytics_visible &&
          distribution &&
          typeof distribution === 'object' &&
          !Array.isArray(distribution) &&
          Object.entries(distribution).every(
            ([key, value]) =>
              /^\d+(,\d+)*$/.test(key) && Number.isFinite(value),
          ))
      )
    )
      throw new Error('Invalid journal item. Reload all journal items.');
    previous = row.id;
  }
  if (
    (result.next_after !== false &&
      (result.rows.length !== 100 || result.next_after !== previous)) ||
    (after === false && result.rows.length === 0 && result.total_count !== 0)
  )
    throw new Error('Invalid journal pagination. Reload all journal items.');
  return result;
}

type Relation = [number, string] | false;

export interface BankEntry {
  id: number;
  date: string;
  payment_ref: string | false;
  partner_id: Relation;
  journal_id: [number, string];
  statement_id: Relation;
  move_id: [number, string];
  state: 'draft' | 'posted' | 'cancel';
  amount: number;
  currency_id: [number, string];
  foreign_currency_id: Relation;
  amount_currency: number;
  amount_residual: number;
  is_reconciled: boolean;
}
export interface BankCheckpoint {
  id: number;
  name: string | false;
  reference: string | false;
  date: string | false;
  journal_id: Relation;
  company_id: Relation;
  currency_id: Relation;
  balance_start: number;
  balance_end: number;
  balance_end_real: number;
  is_complete: boolean;
  is_valid: boolean;
  problem_description: string | false;
}
export interface BankCheckpointDetail {
  checkpoint_id: number;
  checkpoint: BankCheckpoint;
  version: string;
  after: number | false;
  next_after: number | false;
  total_count: number;
  rows: BankEntry[];
}
export interface BankLedgerRow {
  id: number;
  name: string | false;
  account_id: [number, string];
  partner_id: Relation;
  date: string;
  debit: number;
  credit: number;
  currency_id: Relation;
  amount_currency: number;
  amount_residual: number;
  amount_residual_currency: number;
  reconciled: boolean;
}
export interface BankDetail {
  statement_line_id: number;
  version: string;
  after: number | false;
  next_after: number | false;
  total_count: number;
  entry: BankEntry;
  company: string;
  company_currency: [number, string];
  debit: number;
  credit: number;
  balanced: boolean;
  rows: (BankLedgerRow & {
    balance: number;
    matching_number: string | false;
    kind: 'liquidity' | 'suspense' | 'counterpart';
  })[];
}
export interface BankCandidates {
  statement_line_id: number;
  version: string;
  offset: number;
  has_more: boolean;
  rows: (BankLedgerRow & { move_id: [number, string] })[];
}
const bankId = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
const bankHash = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const bankDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const bankText = (value: unknown) =>
  value === false || typeof value === 'string';
function checkedBankSearch(search: string, offset: number) {
  if (
    typeof search !== 'string' ||
    search.length > 160 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 2147483647
  )
    throw new Error('Use a valid statement search and page.');
}
function validBankEntry(row: BankEntry) {
  return (
    row &&
    bankId(row.id) &&
    bankDate(row.date) &&
    bankText(row.payment_ref) &&
    ['draft', 'posted', 'cancel'].includes(row.state) &&
    typeof row.is_reconciled === 'boolean' &&
    [
      row.partner_id,
      row.journal_id,
      row.statement_id,
      row.move_id,
      row.currency_id,
      row.foreign_currency_id,
    ].every(validRelation) &&
    [row.journal_id, row.move_id, row.currency_id].every(Array.isArray) &&
    [row.amount, row.amount_currency, row.amount_residual].every(
      Number.isFinite,
    )
  );
}
function validBankLedger(row: BankLedgerRow) {
  return (
    row &&
    bankId(row.id) &&
    bankText(row.name) &&
    bankDate(row.date) &&
    Array.isArray(row.account_id) &&
    [row.account_id, row.partner_id, row.currency_id].every(validRelation) &&
    [
      row.debit,
      row.credit,
      row.amount_currency,
      row.amount_residual,
      row.amount_residual_currency,
    ].every(Number.isFinite) &&
    row.debit >= 0 &&
    row.credit >= 0 &&
    typeof row.reconciled === 'boolean'
  );
}
const bankCall = <T>(action: string, kwargs: object) =>
  rpc<T>(
    `/web/dataset/call_kw/account.bank.statement.line/qorlia_bank_${action}`,
    {
      model: 'account.bank.statement.line',
      method: `qorlia_bank_${action}`,
      args: [],
      kwargs,
    },
  );
function validBankCheckpoint(row: BankCheckpoint) {
  return (
    row &&
    bankId(row.id) &&
    bankText(row.name) &&
    bankText(row.reference) &&
    (row.date === false || bankDate(row.date)) &&
    [row.journal_id, row.company_id, row.currency_id].every(validRelation) &&
    [row.balance_start, row.balance_end, row.balance_end_real].every(
      Number.isFinite,
    ) &&
    typeof row.is_complete === 'boolean' &&
    typeof row.is_valid === 'boolean' &&
    bankText(row.problem_description)
  );
}
const checkpointCall = <T>(
  action:
    | 'history'
    | 'detail'
    | 'editor_load'
    | 'editor_preview'
    | 'editor_save'
    | 'editor_status',
  kwargs: object,
) =>
  rpc<T>(
    `/web/dataset/call_kw/account.bank.statement/qorlia_checkpoint_${action}`,
    {
      model: 'account.bank.statement',
      method: `qorlia_checkpoint_${action}`,
      args: [],
      kwargs,
    },
  );
export async function getBankCheckpointHistory(
  search = '',
  state = 'all',
  journalType = 'all',
  offset = 0,
) {
  checkedBankSearch(search, offset);
  if (
    !['all', 'invalid', 'empty'].includes(state) ||
    !['all', 'bank', 'cash'].includes(journalType)
  )
    throw new Error('Select a valid checkpoint status and journal type.');
  const data = await checkpointCall<{
    rows: BankCheckpoint[];
    offset: number;
    has_more: boolean;
  }>('history', { search, state, journal_type: journalType, offset });
  if (
    data?.offset !== offset ||
    typeof data.has_more !== 'boolean' ||
    !Array.isArray(data.rows) ||
    data.rows.length > 25 ||
    (data.has_more && data.rows.length !== 25) ||
    !data.rows.every(validBankCheckpoint) ||
    new Set(data.rows.map((row) => row.id)).size !== data.rows.length
  )
    throw new Error('Invalid statement checkpoint history.');
  return data;
}
export interface BankCheckpointSelection {
  checkpoint_id: number | false;
  entry_ids: number[];
  split_line_id: number | false;
}
export interface BankCheckpointValues {
  name: string | false;
  reference: string | false;
  balance_start: number;
  balance_end_real: number;
}
export interface BankCheckpointPayload extends BankCheckpointSelection {
  version: string;
  values: BankCheckpointValues;
}
export interface BankCheckpointEditor extends BankCheckpointPayload {
  checkpoint: Omit<BankCheckpoint, 'id'>;
  selected_entry_ids: number[];
}
export interface BankCheckpointReview {
  values: BankCheckpointValues;
  checkpoint: Omit<BankCheckpoint, 'id'>;
  entry_ids: number[];
  affected: {
    checkpoint: Omit<BankCheckpoint, 'id'> & { id: number | 'new' };
    entry_ids: number[];
  }[];
  financial: BankGraph;
  review_version: string;
}
export interface BankCheckpointRequest {
  payload: BankCheckpointPayload;
  review_version: string;
  request_key: string;
}
const checkpointIds = (ids: unknown): ids is number[] =>
  Array.isArray(ids) && ids.every(bankId) && new Set(ids).size === ids.length;
function checkedCheckpointSelection(selection: BankCheckpointSelection) {
  if (
    !bankObject(selection) ||
    !(selection.checkpoint_id === false || bankId(selection.checkpoint_id)) ||
    !checkpointIds(selection.entry_ids) ||
    !(selection.split_line_id === false || bankId(selection.split_line_id)) ||
    (selection.checkpoint_id !== false &&
      (selection.entry_ids.length || selection.split_line_id !== false)) ||
    (selection.checkpoint_id === false && !selection.entry_ids.length) ||
    (selection.split_line_id !== false &&
      (selection.entry_ids.length !== 1 ||
        selection.entry_ids[0] !== selection.split_line_id))
  )
    throw new Error(
      'Select a checkpoint or distinct native transactions from one journal.',
    );
}
function checkedCheckpointValues(values: BankCheckpointValues) {
  if (
    !bankObject(values) ||
    Object.keys(values).length !== 4 ||
    !['name', 'reference'].every(
      (key) =>
        bankText(values[key as keyof BankCheckpointValues]) &&
        (values[key as 'name' | 'reference'] === false ||
          String(values[key as 'name' | 'reference']).length <= 200),
    ) ||
    ![values.balance_start, values.balance_end_real].every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  )
    throw new Error(
      'Review the complete statement reference and finite balances.',
    );
}
export function checkedBankCheckpointPayload(payload: BankCheckpointPayload) {
  checkedCheckpointSelection(payload);
  if (Object.keys(payload).length !== 5 || !bankHash(payload.version))
    throw new Error('Reload the native statement source before editing.');
  checkedCheckpointValues(payload.values);
  return payload;
}
function checkedCheckpointHeader(
  checkpoint: Omit<BankCheckpoint, 'id'>,
  values: BankCheckpointValues,
) {
  checkedCheckpointValues(values);
  if (
    !bankObject(checkpoint) ||
    !validBankCheckpoint({ ...checkpoint, id: 1 }) ||
    Object.entries(values).some(
      ([key, value]) => checkpoint[key as keyof typeof checkpoint] !== value,
    )
  )
    throw new Error(
      'The native statement header and reviewed values disagree.',
    );
}
export async function loadBankCheckpointEditor(
  selection: BankCheckpointSelection,
): Promise<BankCheckpointEditor> {
  checkedCheckpointSelection(selection);
  if (Object.keys(selection).length !== 3)
    throw new Error('Use only native statement selection fields.');
  const result = await checkpointCall<BankCheckpointEditor>(
    'editor_load',
    selection,
  );
  if (
    !bankObject(result) ||
    result.checkpoint_id !== selection.checkpoint_id ||
    result.split_line_id !== selection.split_line_id ||
    !checkpointIds(result.entry_ids) ||
    JSON.stringify(result.entry_ids) !== JSON.stringify(selection.entry_ids) ||
    !bankHash(result.version) ||
    !checkpointIds(result.selected_entry_ids) ||
    !selection.entry_ids.every((id) =>
      result.selected_entry_ids.includes(id),
    ) ||
    (selection.checkpoint_id === false &&
      selection.split_line_id === false &&
      result.selected_entry_ids.length !== selection.entry_ids.length)
  )
    throw new Error('Invalid native statement editor selection or source.');
  checkedCheckpointHeader(result.checkpoint, result.values);
  return result;
}
export async function previewBankCheckpoint(
  payload: BankCheckpointPayload,
): Promise<BankCheckpointReview> {
  checkedBankCheckpointPayload(payload);
  const result = await checkpointCall<BankCheckpointReview>('editor_preview', {
    payload,
  });
  if (
    !bankObject(result) ||
    !bankHash(result.review_version) ||
    !checkpointIds(result.entry_ids) ||
    !payload.entry_ids.every((id) => result.entry_ids.includes(id)) ||
    (payload.checkpoint_id === false &&
      payload.split_line_id === false &&
      result.entry_ids.length !== payload.entry_ids.length) ||
    !Array.isArray(result.affected) ||
    new Set(result.affected.map((item) => item?.checkpoint?.id)).size !==
      result.affected.length
  )
    throw new Error('Invalid complete native statement effects.');
  checkedCheckpointHeader(result.checkpoint, result.values);
  if (
    Object.entries(payload.values).some(
      ([key, value]) =>
        result.values[key as keyof BankCheckpointValues] !== value,
    )
  )
    throw new Error('The native statement review changed the proposed values.');
  const target =
    payload.checkpoint_id === false ? 'new' : payload.checkpoint_id;
  let reviewedTarget = false;
  for (const item of result.affected) {
    if (
      !bankObject(item) ||
      !bankObject(item.checkpoint) ||
      !checkpointIds(item.entry_ids) ||
      !(
        bankId(item.checkpoint.id) ||
        (target === 'new' && item.checkpoint.id === 'new')
      ) ||
      !validBankCheckpoint({ ...item.checkpoint, id: 1 })
    )
      throw new Error('An affected native checkpoint is incomplete.');
    if (item.checkpoint.id === target) {
      reviewedTarget = true;
      if (
        JSON.stringify(item.entry_ids) !== JSON.stringify(result.entry_ids) ||
        Object.entries(result.checkpoint).some(
          ([key, value]) =>
            JSON.stringify(
              item.checkpoint[key as keyof typeof item.checkpoint],
            ) !== JSON.stringify(value),
        )
      )
        throw new Error(
          'The selected checkpoint disagrees with its affected-statement review.',
        );
    }
  }
  if (!reviewedTarget)
    throw new Error('The affected statements omit the selected checkpoint.');
  if (!bankObject(result.financial))
    throw new Error('The unchanged native accounting snapshot is unavailable.');
  if (!result.entry_ids.length) {
    if (Object.keys(result.financial).length)
      throw new Error('An empty checkpoint has unexpected accounting effects.');
  } else {
    const entries = result.financial['account.bank.statement.line'];
    if (!bankObject(entries) || !Array.isArray(entries.rows))
      throw new Error('The complete native bank effects are unavailable.');
    const rows = entries.rows.map((row) => {
      if (!bankObject(row.values) || Object.hasOwn(row.values, 'statement_id'))
        throw new Error('Invalid unchanged-accounting snapshot.');
      return { ...row, values: { ...row.values, statement_id: false } };
    });
    const graph = {
      ...result.financial,
      'account.bank.statement.line': { ...entries, rows },
    };
    for (const id of result.entry_ids) checkedBankGraph(graph, id, false);
  }
  return result;
}
function checkedCheckpointRequest(request: BankCheckpointRequest) {
  if (
    !bankObject(request) ||
    Object.keys(request).length !== 3 ||
    !bankHash(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error('Use an exact reviewed statement save request.');
  checkedBankCheckpointPayload(request.payload);
}
async function checkpointSaveResult(
  action: 'editor_save' | 'editor_status',
  request: BankCheckpointRequest,
) {
  checkedCheckpointRequest(request);
  const result = await checkpointCall<{
    accepted: boolean;
    checkpoint: BankCheckpoint | false;
  }>(action, request);
  if (
    !bankObject(result) ||
    typeof result.accepted !== 'boolean' ||
    (action === 'editor_save' && !result.accepted) ||
    (result.accepted
      ? !result.checkpoint ||
        !validBankCheckpoint(result.checkpoint) ||
        (request.payload.checkpoint_id !== false &&
          result.checkpoint.id !== request.payload.checkpoint_id)
      : result.checkpoint !== false)
  )
    throw new Error('Invalid native statement save or recovery response.');
  return result;
}
export const saveBankCheckpoint = (request: BankCheckpointRequest) =>
  checkpointSaveResult('editor_save', request);
export const getBankCheckpointSaveStatus = (request: BankCheckpointRequest) =>
  checkpointSaveResult('editor_status', request);
export async function getBankCheckpointDetail(
  checkpointId: number,
  after: number | false = false,
  version: string | false = false,
): Promise<BankCheckpointDetail> {
  if (
    !bankId(checkpointId) ||
    !(after === false || bankId(after)) ||
    !(version === false || bankHash(version)) ||
    (after !== false && version === false)
  )
    throw new Error('Reload a saved statement checkpoint and all its entries.');
  const data = await checkpointCall<BankCheckpointDetail>('detail', {
    checkpoint_id: checkpointId,
    after,
    version,
  });
  if (
    data?.checkpoint_id !== checkpointId ||
    !validBankCheckpoint(data.checkpoint) ||
    data.checkpoint.id !== checkpointId ||
    data.after !== after ||
    !bankHash(data.version) ||
    (version !== false && data.version !== version) ||
    !Number.isSafeInteger(data.total_count) ||
    data.total_count < 0 ||
    !(data.next_after === false || bankId(data.next_after)) ||
    !Array.isArray(data.rows) ||
    data.rows.length > 100 ||
    data.rows.length > data.total_count ||
    (data.rows.length === 0 && (after !== false || data.total_count !== 0)) ||
    data.rows.some(
      (row) =>
        !validBankEntry(row) ||
        row.statement_id === false ||
        row.statement_id[0] !== checkpointId ||
        row.id === after,
    ) ||
    new Set(data.rows.map((row) => row.id)).size !== data.rows.length ||
    (data.next_after !== false &&
      (data.rows.length !== 100 || data.next_after !== data.rows[99].id)) ||
    (after === false &&
      data.next_after === false &&
      data.rows.length !== data.total_count)
  )
    throw new Error('Invalid statement checkpoint entries. Reload all pages.');
  return data;
}
export async function getBankHistory(search = '', state = 'all', offset = 0) {
  checkedBankSearch(search, offset);
  if (!['all', 'unmatched', 'matched'].includes(state))
    throw new Error('Select a statement matching state.');
  const data = await bankCall<{
    rows: BankEntry[];
    offset: number;
    has_more: boolean;
  }>('history', { search, state, offset });
  if (
    data?.offset !== offset ||
    typeof data.has_more !== 'boolean' ||
    !Array.isArray(data.rows) ||
    data.rows.length > 25 ||
    (data.has_more && data.rows.length !== 25) ||
    !data.rows.every(validBankEntry) ||
    new Set(data.rows.map((row) => row.id)).size !== data.rows.length
  )
    throw new Error('Invalid bank statement history.');
  return data;
}
export async function getBankDetail(
  statementLineId: number,
  after: number | false = false,
  version: string | false = false,
): Promise<BankDetail> {
  if (
    !bankId(statementLineId) ||
    !(after === false || bankId(after)) ||
    !(version === false || bankHash(version)) ||
    (after !== false && version === false)
  )
    throw new Error('Reload a saved statement entry and its ledger.');
  const data = await bankCall<BankDetail>('detail', {
    statement_line_id: statementLineId,
    after,
    version,
  });
  if (
    data?.statement_line_id !== statementLineId ||
    data.after !== after ||
    !bankHash(data.version) ||
    (version !== false && data.version !== version) ||
    !validBankEntry(data.entry) ||
    data.entry.id !== statementLineId ||
    typeof data.company !== 'string' ||
    !Array.isArray(data.company_currency) ||
    !validRelation(data.company_currency) ||
    ![data.debit, data.credit].every(Number.isFinite) ||
    data.debit < 0 ||
    data.credit < 0 ||
    typeof data.balanced !== 'boolean' ||
    !Number.isSafeInteger(data.total_count) ||
    data.total_count < 0 ||
    !(data.next_after === false || bankId(data.next_after)) ||
    !Array.isArray(data.rows) ||
    data.rows.length > 100 ||
    data.rows.length > data.total_count ||
    (after === false && data.rows.length === 0 && data.total_count !== 0) ||
    data.rows.some(
      (row, index) =>
        !validBankLedger(row) ||
        !Number.isFinite(row.balance) ||
        !bankText(row.matching_number) ||
        !['liquidity', 'suspense', 'counterpart'].includes(row.kind) ||
        row.id <= (index ? data.rows[index - 1].id : after || 0),
    ) ||
    (data.next_after !== false &&
      (data.rows.length !== 100 || data.next_after !== data.rows[99].id))
  )
    throw new Error('Invalid statement ledger. Reload all pages.');
  return data;
}
export async function getBankCandidates(
  statementLineId: number,
  version: string,
  search = '',
  offset = 0,
): Promise<BankCandidates> {
  checkedBankSearch(search, offset);
  if (!bankId(statementLineId) || !bankHash(version))
    throw new Error(
      'Reload the statement entry before finding possible matches.',
    );
  const data = await bankCall<BankCandidates>('candidates', {
    statement_line_id: statementLineId,
    version,
    search,
    offset,
  });
  if (
    data?.statement_line_id !== statementLineId ||
    data.version !== version ||
    data.offset !== offset ||
    typeof data.has_more !== 'boolean' ||
    !Array.isArray(data.rows) ||
    data.rows.length > 25 ||
    (data.has_more && data.rows.length !== 25) ||
    data.rows.some(
      (row) =>
        !validBankLedger(row) ||
        row.reconciled ||
        !Array.isArray(row.move_id) ||
        !validRelation(row.move_id),
    ) ||
    new Set(data.rows.map((row) => row.id)).size !== data.rows.length
  )
    throw new Error('Invalid possible statement matches.');
  return data;
}

export interface BankMatchPayload {
  statement_line_id: number;
  version: string;
  action: 'match' | 'undo';
  allocations: {
    line_id: number;
    amount: number;
    analytic_distribution?: Record<string, number> | false;
  }[];
  fee_model_id: number | false;
}
export interface BankMatchRequest {
  payload: BankMatchPayload;
  review_version: string;
  request_key: string;
}
export interface BankGraphRow {
  id: number | string;
  values: Record<string, unknown>;
}
export type BankGraph = Record<
  string,
  { rows: BankGraphRow[]; removed_ids: number[] }
>;
export interface BankMatchView {
  statement_line_id: number;
  entry: BankEntry;
  version: string;
  graph: BankGraph;
  labels: Record<string, string>;
  company_currency: [number, string];
  transaction_currency: [number, string];
  reason: string | false;
  can_match: boolean;
  can_undo: boolean;
  accepted?: true;
  request_key?: string;
}
export interface BankMatchReview {
  statement_line_id: number;
  before: BankGraph;
  after: BankGraph;
  labels: Record<string, string>;
  review_version: string;
}
const bankGraphFields = {
  'account.bank.statement.line':
    'move_id journal_id date payment_ref partner_id amount currency_id amount_currency foreign_currency_id amount_residual is_reconciled to_check payment_ids statement_id transaction_type',
  'account.move':
    'name state move_type date company_id journal_id partner_id currency_id amount_total amount_residual payment_state line_ids reversed_entry_id tax_cash_basis_rec_id tax_cash_basis_origin_move_id narration',
  'account.move.line':
    'name move_id account_id partner_id date date_maturity debit credit balance currency_id amount_currency amount_residual amount_residual_currency reconciled matched_debit_ids matched_credit_ids full_reconcile_id tax_ids tax_tag_ids tax_repartition_line_id tax_line_id group_tax_id tax_base_amount tax_tag_invert display_type reconcile_model_id analytic_distribution payment_id statement_line_id',
  'account.partial.reconcile':
    'debit_move_id credit_move_id amount debit_amount_currency credit_amount_currency full_reconcile_id exchange_move_id max_date',
  'account.full.reconcile':
    'name partial_reconcile_ids reconciled_line_ids exchange_move_id',
  'account.payment':
    'move_id state amount currency_id payment_type partner_type partner_id journal_id is_matched is_reconciled',
  'account.analytic.line':
    'move_line_id account_id date amount unit_amount company_id',
};
const bankGraphMoney = new Set(
  'amount amount_currency amount_residual amount_residual_currency amount_total debit credit balance debit_amount_currency credit_amount_currency tax_base_amount unit_amount'.split(
    ' ',
  ),
);
const bankGraphFlags = new Set(
  'is_reconciled is_matched to_check reconciled tax_tag_invert'.split(' '),
);
const bankGraphRequiredIds: Record<string, string[]> = {
  'account.bank.statement.line': ['move_id', 'journal_id', 'currency_id'],
  'account.move': ['company_id', 'journal_id', 'currency_id'],
  'account.move.line': ['move_id', 'account_id', 'currency_id'],
  'account.partial.reconcile': ['debit_move_id', 'credit_move_id'],
  'account.full.reconcile': [],
  'account.payment': ['move_id', 'currency_id', 'journal_id'],
  'account.analytic.line': ['move_line_id', 'account_id', 'company_id'],
};
const bankGraphId = (value: unknown, temporary: boolean) =>
  bankId(value) ||
  (temporary && typeof value === 'string' && /^new:[1-9]\d*$/.test(value));
const bankObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function checkedBankGraph(
  graph: BankGraph,
  entryId: number,
  temporary: boolean,
) {
  if (
    !bankObject(graph) ||
    Object.keys(graph).length !== Object.keys(bankGraphFields).length
  )
    throw new Error('The complete native bank effects are unavailable.');
  for (const [model, fields] of Object.entries(bankGraphFields)) {
    const part = graph[model];
    const expected = fields.split(' ');
    if (
      !bankObject(part) ||
      Object.keys(part).length !== 2 ||
      !Array.isArray(part.rows) ||
      !Array.isArray(part.removed_ids) ||
      !part.removed_ids.every(bankId) ||
      new Set(part.removed_ids).size !== part.removed_ids.length ||
      (!temporary && part.removed_ids.length) ||
      new Set(part.rows.map((row) => row?.id)).size !== part.rows.length
    )
      throw new Error('Invalid native bank graph rows or deletions.');
    for (const row of part.rows) {
      if (
        !bankObject(row) ||
        Object.keys(row).length !== 2 ||
        !bankGraphId(row.id, temporary) ||
        part.removed_ids.includes(row.id as number) ||
        !bankObject(row.values) ||
        Object.keys(row.values).length !== expected.length ||
        !expected.every((key) => Object.hasOwn(row.values, key))
      )
        throw new Error('A native bank effect is incomplete.');
      for (const [key, value] of Object.entries(row.values)) {
        let valid: boolean;
        if (key === 'analytic_distribution') {
          valid =
            value === false ||
            (bankObject(value) &&
              Object.entries(value).every(
                ([ids, amount]) =>
                  /^[1-9]\d*(,[1-9]\d*)*$/.test(ids) &&
                  typeof amount === 'number' &&
                  Number.isFinite(amount),
              ));
        } else if (bankGraphMoney.has(key)) {
          valid =
            typeof value === 'number' &&
            Number.isFinite(value) &&
            (!['debit', 'credit'].includes(key) || value >= 0);
        } else if (bankGraphFlags.has(key)) {
          valid = typeof value === 'boolean';
        } else if (key.endsWith('_ids')) {
          valid =
            Array.isArray(value) &&
            value.every((id) => bankGraphId(id, temporary)) &&
            new Set(value).size === value.length;
        } else if (key.endsWith('_id')) {
          valid = value === false || bankGraphId(value, temporary);
        } else if (['date', 'date_maturity', 'max_date'].includes(key)) {
          valid = value === false || bankDate(value);
        } else {
          valid = bankText(value);
        }
        if (!valid) throw new Error('Invalid native bank effect values.');
      }
      if (
        !bankGraphRequiredIds[model].every((key) =>
          bankGraphId(row.values[key], temporary),
        )
      )
        throw new Error(
          'A native bank effect is missing its account, journal or currency.',
        );
    }
  }
  const origin = graph['account.bank.statement.line'].rows.find(
    (row) => row.id === entryId,
  );
  if (
    !origin ||
    !bankId(origin.values.move_id) ||
    !graph['account.move'].rows.some(
      (row) => row.id === origin.values.move_id,
    ) ||
    !graph['account.move.line'].rows.some(
      (row) => row.values.move_id === origin.values.move_id,
    )
  )
    throw new Error('The reviewed bank entry and ledger are missing.');
  return graph;
}
function checkedBankLabels(labels: Record<string, string>) {
  if (
    !bankObject(labels) ||
    !Object.entries(labels).every(
      ([key, name]) =>
        /^[a-z_]+(\.[a-z_]+)*:[1-9]\d*$/.test(key) && typeof name === 'string',
    )
  )
    throw new Error('Invalid native bank labels.');
}
export function checkedBankMatchPayload(payload: BankMatchPayload) {
  if (
    !bankObject(payload) ||
    Object.keys(payload).length !== 5 ||
    !bankId(payload.statement_line_id) ||
    !bankHash(payload.version) ||
    !['match', 'undo'].includes(payload.action) ||
    !(payload.fee_model_id === false || bankId(payload.fee_model_id)) ||
    !Array.isArray(payload.allocations) ||
    payload.allocations.length > 1000 ||
    payload.allocations.some(
      (item) =>
        !bankObject(item) ||
        Object.keys(item).some(
          (key) =>
            !['line_id', 'amount', 'analytic_distribution'].includes(key),
        ) ||
        !bankId(item.line_id) ||
        typeof item.amount !== 'number' ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0 ||
        (Object.prototype.hasOwnProperty.call(item, 'analytic_distribution') &&
          item.analytic_distribution !== false &&
          (!bankObject(item.analytic_distribution) ||
            Object.keys(item.analytic_distribution).length > 100 ||
            Object.entries(item.analytic_distribution).some(
              ([key, percent]) =>
                !/^[1-9]\d*(,[1-9]\d*)*$/.test(key) ||
                !key.split(',').every((id) => bankId(Number(id))) ||
                new Set(key.split(',')).size !== key.split(',').length ||
                typeof percent !== 'number' ||
                !Number.isFinite(percent) ||
                percent < 0 ||
                percent > 100,
            ) ||
            journalAnalyticIds(item.analytic_distribution).length > 200)),
    ) ||
    new Set(payload.allocations.map((item) => item.line_id)).size !==
      payload.allocations.length ||
    (payload.action === 'undo' &&
      (payload.allocations.length || payload.fee_model_id !== false)) ||
    (payload.action === 'match' &&
      !payload.allocations.length &&
      payload.fee_model_id === false)
  )
    throw new Error(
      'Check the saved bank entry, matching items and source-currency amounts.',
    );
  return payload;
}
export function checkedBankMatchRequest(request: BankMatchRequest) {
  if (
    !bankObject(request) ||
    Object.keys(request).length !== 3 ||
    !bankHash(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error('Invalid reviewed bank save request.');
  checkedBankMatchPayload(request.payload);
  return request;
}
function checkedBankMatchView(
  view: BankMatchView,
  entryId: number,
  requestKey?: string,
) {
  if (
    view?.statement_line_id !== entryId ||
    !validBankEntry(view.entry) ||
    view.entry.id !== entryId ||
    !bankHash(view.version) ||
    ![view.company_currency, view.transaction_currency].every(
      (value) => Array.isArray(value) && validRelation(value),
    ) ||
    !bankText(view.reason) ||
    typeof view.can_match !== 'boolean' ||
    typeof view.can_undo !== 'boolean' ||
    (view.reason !== false && (view.can_match || view.can_undo)) ||
    (requestKey !== undefined &&
      (view.request_key !== requestKey || view.accepted !== true))
  )
    throw new Error(
      'Invalid bank access or recovery response. Reload the entry.',
    );
  checkedBankGraph(view.graph, entryId, false);
  checkedBankLabels(view.labels);
  const origin = view.graph['account.bank.statement.line'].rows.find(
    (row) => row.id === entryId,
  )!;
  if (
    origin.values.amount !== view.entry.amount ||
    origin.values.amount_currency !== view.entry.amount_currency ||
    origin.values.currency_id !== view.entry.currency_id[0] ||
    origin.values.move_id !== view.entry.move_id[0] ||
    origin.values.is_reconciled !== view.entry.is_reconciled
  )
    throw new Error(
      'The bank entry does not agree with its native ledger review.',
    );
  return view;
}
export async function getBankMatch(statementLineId: number) {
  if (!bankId(statementLineId)) throw new Error('Select a saved bank entry.');
  return checkedBankMatchView(
    await bankCall<BankMatchView>('match_load', {
      statement_line_id: statementLineId,
    }),
    statementLineId,
  );
}
export async function previewBankMatch(payload: BankMatchPayload) {
  checkedBankMatchPayload(payload);
  const review = await bankCall<BankMatchReview>('match_preview', { payload });
  if (
    !review ||
    review.statement_line_id !== payload.statement_line_id ||
    !bankHash(review.review_version)
  )
    throw new Error('Invalid native bank review identity.');
  checkedBankGraph(review.before, payload.statement_line_id, false);
  checkedBankGraph(review.after, payload.statement_line_id, true);
  checkedBankLabels(review.labels);
  if (
    !payload.allocations.every((item) =>
      review.before['account.move.line'].rows.some(
        (row) => row.id === item.line_id,
      ),
    )
  )
    throw new Error('The bank review omits a selected matching item.');
  return review;
}
export async function saveBankMatch(request: BankMatchRequest) {
  checkedBankMatchRequest(request);
  return checkedBankMatchView(
    await bankCall<BankMatchView>('match_save', request),
    request.payload.statement_line_id,
    request.request_key,
  );
}
export async function getBankMatchStatus(request: BankMatchRequest) {
  checkedBankMatchRequest(request);
  const result = await bankCall<BankMatchView | false>('match_status', request);
  return result === false
    ? false
    : checkedBankMatchView(
        result,
        request.payload.statement_line_id,
        request.request_key,
      );
}
export async function getBankFeeChoices(
  statementLineId: number,
  search = '',
  offset = 0,
) {
  checkedBankSearch(search, offset);
  if (!bankId(statementLineId)) throw new Error('Select a saved bank entry.');
  const result = await bankCall<{
    rows: {
      id: number;
      name: string;
      rule_type: 'writeoff_button' | 'writeoff_suggestion';
    }[];
    offset: number;
    has_more: boolean;
  }>('fee_choices', { statement_line_id: statementLineId, search, offset });
  if (
    result?.offset !== offset ||
    typeof result.has_more !== 'boolean' ||
    !Array.isArray(result.rows) ||
    result.rows.length > 25 ||
    (result.has_more && result.rows.length !== 25) ||
    result.rows.some(
      (row) =>
        !row ||
        !bankId(row.id) ||
        typeof row.name !== 'string' ||
        !['writeoff_button', 'writeoff_suggestion'].includes(row.rule_type),
    ) ||
    new Set(result.rows.map((row) => row.id)).size !== result.rows.length
  )
    throw new Error('Invalid applicable native bank fee rules.');
  return result;
}

export async function getBankMatchAnalytics(
  statementLineId: number,
  sourceLineId: number,
  accountIds: number[],
) {
  if (
    !bankId(statementLineId) ||
    !bankId(sourceLineId) ||
    !Array.isArray(accountIds) ||
    accountIds.length > 200 ||
    !accountIds.every(bankId) ||
    new Set(accountIds).size !== accountIds.length
  )
    throw new Error('Select saved matching items and valid analytic accounts.');
  const result = await bankCall<{
    statement_line_id: number;
    source_line_id: number;
    account_id: number;
    plans: JournalAnalyticPlan[];
    accounts: JournalAnalyticAccount[];
  }>('match_analytics', {
    statement_line_id: statementLineId,
    source_line_id: sourceLineId,
    account_ids: accountIds,
  });
  if (
    result?.statement_line_id !== statementLineId ||
    result.source_line_id !== sourceLineId ||
    !bankId(result.account_id)
  )
    throw new Error('Invalid bank analytic scope. Reload the matching item.');
  checkedAnalyticMetadata(result.plans, result.accounts, accountIds);
  return result;
}

export async function getBankAnalyticChoices(
  statementLineId: number,
  sourceLineId: number,
  planId: number,
  accountIds: number[],
  search = '',
  offset = 0,
) {
  checkedBankSearch(search, offset);
  if (
    !bankId(statementLineId) ||
    !bankId(sourceLineId) ||
    !bankId(planId) ||
    !Array.isArray(accountIds) ||
    accountIds.length > 200 ||
    !accountIds.every(bankId) ||
    new Set(accountIds).size !== accountIds.length
  )
    throw new Error('Select a native analytic plan and saved matching item.');
  const result = await bankCall<{
    rows: [number, string][];
    offset: number;
    has_more: boolean;
  }>('analytic_choices', {
    statement_line_id: statementLineId,
    source_line_id: sourceLineId,
    plan_id: planId,
    account_ids: accountIds,
    search,
    offset,
  });
  if (
    result?.offset !== offset ||
    typeof result.has_more !== 'boolean' ||
    !Array.isArray(result.rows) ||
    result.rows.length > 25 ||
    (result.has_more && result.rows.length !== 25) ||
    !result.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        bankId(row[0]) &&
        typeof row[1] === 'string',
    ) ||
    new Set(result.rows.map(([id]) => id)).size !== result.rows.length
  )
    throw new Error('Invalid native bank analytic choices.');
  return result;
}

export type CutoffValues = {
  date: string;
  percentage: number;
  total_amount: number;
  journal_id: number | false;
  revenue_accrual_account: number | false;
  expense_accrual_account: number | false;
};
export type CutoffData = {
  invoice_id: number;
  line_id: number;
  name: string;
  version: string;
  values: CutoffValues;
  labels: Partial<
    Record<
      'journal_id' | 'revenue_accrual_account' | 'expense_accrual_account',
      [number, string]
    >
  >;
  account_type: 'income' | 'expense';
  currency: [number, string];
  source_account: [number, string];
  source_balance: number;
  company: string;
  can_create: boolean;
  lock_date_message: string | false;
};
export type CutoffReview = CutoffData & {
  review_version: string;
  reconcile_accrual_rows: boolean;
  default_changes: {
    journal: [number, string];
    account: [number, string];
    account_type: 'income' | 'expense';
  };
  entries: {
    kind: 'recognition' | 'adjustment';
    date: string;
    ref: string;
    state: 'draft' | 'posted';
    rows: {
      role: 'source' | 'accrual';
      name: string;
      account_id: [number, string];
      partner_id: Relation;
      currency_id: [number, string];
      debit: number;
      credit: number;
      amount_currency: number;
      analytic_distribution: Record<string, number> | false;
    }[];
  }[];
};
export type CutoffRequest = {
  invoice_id: number;
  line_id: number;
  version: string;
  values: CutoffValues;
  review_version: string;
  request_key: string;
};
export type CutoffSaved = {
  invoice_id: number;
  line_id: number;
  request_key: string;
  entries: {
    id: number;
    name: string;
    date: string;
    state: 'draft' | 'posted' | 'cancel';
    auto_post: string;
    ref: string | false;
    journal_id: [number, string];
  }[];
};
const cutoffFields = [
  'date',
  'percentage',
  'total_amount',
  'journal_id',
  'revenue_accrual_account',
  'expense_accrual_account',
] as const;
const cutoffDate = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
function checkedCutoffValues(values: CutoffValues) {
  if (
    !values ||
    Object.keys(values).length !== cutoffFields.length ||
    !cutoffFields.every((key) => Object.hasOwn(values, key)) ||
    !cutoffDate(values.date) ||
    ![values.percentage, values.total_amount].every(Number.isFinite) ||
    !['journal_id', 'revenue_accrual_account', 'expense_accrual_account'].every(
      (key) => {
        const value = values[key as keyof CutoffValues];
        return value === false || journalId(value);
      },
    )
  )
    throw new Error('Invalid Cut-Off values. Reload this invoice item.');
  return values;
}
export function checkedCutoffRequest(request: CutoffRequest) {
  const keys = [
    'invoice_id',
    'line_id',
    'version',
    'values',
    'review_version',
    'request_key',
  ];
  if (
    !request ||
    Object.keys(request).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(request, key)) ||
    !journalId(request.invoice_id) ||
    !journalId(request.line_id) ||
    !journalHash(request.version) ||
    !journalHash(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error(
      'Invalid Cut-Off recovery request. Check the invoice before creating another request.',
    );
  checkedCutoffValues(request.values);
  return request;
}
function cutoffRpc<T>(
  action: 'load' | 'choices' | 'onchange' | 'preview' | 'save' | 'status',
  kwargs: object,
) {
  const method = `qorlia_cutoff_${action}`;
  return rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });
}
function checkedCutoffData(
  data: CutoffData,
  invoiceId: number,
  lineId: number,
) {
  if (
    data?.invoice_id !== invoiceId ||
    data.line_id !== lineId ||
    !journalHash(data.version) ||
    typeof data.name !== 'string' ||
    typeof data.company !== 'string' ||
    typeof data.can_create !== 'boolean' ||
    !['income', 'expense'].includes(data.account_type) ||
    !Array.isArray(data.currency) ||
    !validRelation(data.currency) ||
    !Array.isArray(data.source_account) ||
    !validRelation(data.source_account) ||
    !Number.isFinite(data.source_balance) ||
    !(
      data.lock_date_message === false ||
      typeof data.lock_date_message === 'string'
    ) ||
    !data.labels ||
    Array.isArray(data.labels) ||
    typeof data.labels !== 'object'
  )
    throw new Error('Invalid native Cut-Off response.');
  checkedCutoffValues(data.values);
  for (const key of [
    'journal_id',
    'revenue_accrual_account',
    'expense_accrual_account',
  ] as const) {
    const label = data.labels[key];
    if (
      data.values[key]
        ? !Array.isArray(label) ||
          !validRelation(label) ||
          label[0] !== data.values[key]
        : label !== undefined
    )
      throw new Error('Cut-Off labels do not match their native values.');
  }
  return data;
}
export async function getCutoff(invoiceId: number, lineId: number) {
  if (!journalId(invoiceId) || !journalId(lineId))
    throw new Error('Select a saved invoice item.');
  return checkedCutoffData(
    await cutoffRpc<CutoffData>('load', {
      invoice_id: invoiceId,
      line_id: lineId,
    }),
    invoiceId,
    lineId,
  );
}
export async function onchangeCutoff(
  current: CutoffData,
  values: CutoffValues,
  field: keyof CutoffValues,
) {
  checkedCutoffData(current, current.invoice_id, current.line_id);
  checkedCutoffValues(values);
  if (!cutoffFields.includes(field))
    throw new Error('Unsupported Cut-Off field.');
  const result = checkedCutoffData(
    await cutoffRpc<CutoffData>('onchange', {
      invoice_id: current.invoice_id,
      line_id: current.line_id,
      version: current.version,
      values,
      field,
    }),
    current.invoice_id,
    current.line_id,
  );
  if (result.version !== current.version)
    throw new Error('The Cut-Off source changed. Reload before continuing.');
  return result;
}
export async function previewCutoff(current: CutoffData, values: CutoffValues) {
  checkedCutoffData(current, current.invoice_id, current.line_id);
  checkedCutoffValues(values);
  const result = await cutoffRpc<CutoffReview>('preview', {
    invoice_id: current.invoice_id,
    line_id: current.line_id,
    version: current.version,
    values,
  });
  checkedCutoffData(result, current.invoice_id, current.line_id);
  const active =
    result.account_type === 'income'
      ? 'revenue_accrual_account'
      : 'expense_accrual_account';
  if (
    result.version !== current.version ||
    !journalHash(result.review_version) ||
    typeof result.reconcile_accrual_rows !== 'boolean' ||
    !result.default_changes ||
    !Array.isArray(result.default_changes.journal) ||
    !validRelation(result.default_changes.journal) ||
    result.default_changes.journal[0] !== result.values.journal_id ||
    !Array.isArray(result.default_changes.account) ||
    !validRelation(result.default_changes.account) ||
    result.default_changes.account[0] !== result.values[active] ||
    result.default_changes.account_type !== result.account_type ||
    !Array.isArray(result.entries) ||
    result.entries.length !== 2
  )
    throw new Error('Invalid reviewed adjusting entries.');
  for (const entry of result.entries) {
    if (
      entry.kind !==
        (entry === result.entries[0] ? 'recognition' : 'adjustment') ||
      !cutoffDate(entry.date) ||
      typeof entry.ref !== 'string' ||
      !['draft', 'posted'].includes(entry.state) ||
      !Array.isArray(entry.rows) ||
      entry.rows.length !== 2 ||
      entry.rows.some(
        (row) =>
          !row ||
          !['source', 'accrual'].includes(row.role) ||
          typeof row.name !== 'string' ||
          !Array.isArray(row.account_id) ||
          !validRelation(row.account_id) ||
          !validRelation(row.partner_id) ||
          !Array.isArray(row.currency_id) ||
          !validRelation(row.currency_id) ||
          ![row.debit, row.credit, row.amount_currency].every(
            Number.isFinite,
          ) ||
          row.debit < 0 ||
          row.credit < 0,
      ) ||
      Math.abs(
        entry.rows.reduce((sum, row) => sum + row.debit - row.credit, 0),
      ) > 0.000001
    )
      throw new Error('Invalid or unbalanced Cut-Off preview.');
    if (entry.rows[0].role !== 'source' || entry.rows[1].role !== 'accrual')
      throw new Error('Invalid Cut-Off preview row order.');
  }
  return result;
}
function checkedCutoffSaved(result: CutoffSaved, request: CutoffRequest) {
  if (
    result?.invoice_id !== request.invoice_id ||
    result.line_id !== request.line_id ||
    result.request_key !== request.request_key ||
    !Array.isArray(result.entries) ||
    result.entries.length !== 2 ||
    new Set(result.entries.map((entry) => entry.id)).size !== 2 ||
    result.entries.some(
      (entry) =>
        !journalId(entry.id) ||
        typeof entry.name !== 'string' ||
        !cutoffDate(entry.date) ||
        !['draft', 'posted', 'cancel'].includes(entry.state) ||
        typeof entry.auto_post !== 'string' ||
        !(entry.ref === false || typeof entry.ref === 'string') ||
        !Array.isArray(entry.journal_id) ||
        !validRelation(entry.journal_id),
    )
  )
    throw new Error(
      'Invalid Cut-Off receipt. Check the same request before creating another.',
    );
  return result;
}
export async function saveCutoff(request: CutoffRequest) {
  checkedCutoffRequest(request);
  return checkedCutoffSaved(
    await cutoffRpc<CutoffSaved>('save', request),
    request,
  );
}
export async function getCutoffStatus(request: CutoffRequest) {
  checkedCutoffRequest(request);
  const result = await cutoffRpc<CutoffSaved | false>('status', request);
  return result === false ? false : checkedCutoffSaved(result, request);
}
export async function getCutoffChoices(
  invoiceId: number,
  lineId: number,
  kind: 'journal' | 'accrual',
  search = '',
) {
  if (
    !journalId(invoiceId) ||
    !journalId(lineId) ||
    !['journal', 'accrual'].includes(kind) ||
    typeof search !== 'string' ||
    search.length > 200
  )
    throw new Error('Use a valid Cut-Off search.');
  const result = await cutoffRpc<[number, string][]>('choices', {
    invoice_id: invoiceId,
    line_id: lineId,
    kind,
    search,
  });
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    !result.every((row) => Array.isArray(row) && validRelation(row))
  )
    throw new Error('Invalid Cut-Off search result.');
  return result;
}

export type JournalDetailValues = {
  name: string | false;
  account_id: number;
  date_maturity: string | false;
  tax_tag_ids: number[];
  analytic_distribution: Record<string, number> | false;
  discount_date: string | false;
  discount_amount_currency: number;
};
export type JournalAnalyticPlan = {
  id: number;
  name: string;
  applicability: 'optional' | 'mandatory';
};
export type JournalAnalyticAccount = {
  id: number;
  name: string;
  plan_id: number;
};
export type JournalAnalytics = {
  invoice_id: number;
  line_id: number;
  account_id: number;
  plans: JournalAnalyticPlan[];
  accounts: JournalAnalyticAccount[];
};
export interface JournalDetails {
  invoice_id: number;
  line_id: number;
  name: string | false;
  state: 'draft' | 'posted' | 'cancel';
  version: string;
  values: JournalDetailValues;
  account: [number, string];
  tax_grids: [number, string][];
  analytics_visible: boolean;
  analytic_plans: JournalAnalyticPlan[];
  analytic_accounts: JournalAnalyticAccount[];
  can_edit: boolean;
  currency: [number, string];
  transaction_currency: [number, string];
  debit: number;
  credit: number;
  review_version?: string;
}
export type JournalDetailRequest = {
  invoice_id: number;
  line_id: number;
  version: string;
  values: JournalDetailValues;
  review_version: string;
  request_key: string;
};
const journalId = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
const journalHash = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function journalAnalyticIds(
  distribution: Record<string, number> | false,
) {
  return [
    ...new Set(
      Object.keys(distribution || {}).flatMap((key) =>
        key.split(',').map(Number),
      ),
    ),
  ].sort((a, b) => a - b);
}
function checkedAnalyticMetadata(
  plans: JournalAnalyticPlan[],
  accounts: JournalAnalyticAccount[],
  ids: number[],
) {
  if (
    !Array.isArray(plans) ||
    plans.length > 100 ||
    !plans.every(
      (plan) =>
        journalId(plan?.id) &&
        typeof plan.name === 'string' &&
        ['optional', 'mandatory'].includes(plan.applicability),
    ) ||
    new Set(plans.map((plan) => plan.id)).size !== plans.length ||
    !Array.isArray(accounts) ||
    accounts.length !== ids.length ||
    !accounts.every(
      (account) =>
        journalId(account?.id) &&
        ids.includes(account.id) &&
        typeof account.name === 'string' &&
        plans.some((plan) => plan.id === account.plan_id),
    ) ||
    new Set(accounts.map((account) => account.id)).size !== accounts.length
  )
    throw new Error(
      'Analytic account names or plan rules are unavailable. Nothing was removed.',
    );
}
function checkedJournalValues(
  values: JournalDetailValues,
): JournalDetailValues {
  const date = (value: unknown) =>
    value === false ||
    (typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value);
  const fields = [
    'name',
    'account_id',
    'date_maturity',
    'tax_tag_ids',
    'analytic_distribution',
    'discount_date',
    'discount_amount_currency',
  ];
  if (
    !values ||
    Object.keys(values).length !== fields.length ||
    !fields.every((key) => Object.hasOwn(values, key)) ||
    !(
      values.name === false ||
      (typeof values.name === 'string' && values.name.length <= 10000)
    ) ||
    !journalId(values.account_id) ||
    !date(values.date_maturity) ||
    !date(values.discount_date) ||
    !Number.isFinite(values.discount_amount_currency) ||
    values.discount_amount_currency < 0 ||
    !Array.isArray(values.tax_tag_ids) ||
    values.tax_tag_ids.length > 100 ||
    !values.tax_tag_ids.every(journalId) ||
    new Set(values.tax_tag_ids).size !== values.tax_tag_ids.length ||
    !(
      values.analytic_distribution === false ||
      (values.analytic_distribution &&
        typeof values.analytic_distribution === 'object' &&
        !Array.isArray(values.analytic_distribution) &&
        Object.keys(values.analytic_distribution).length <= 100 &&
        Object.entries(values.analytic_distribution).every(
          ([key, value]) =>
            /^[1-9]\d*(,[1-9]\d*)*$/.test(key) &&
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 100,
        ))
    )
  )
    throw new Error(
      'Invalid journal details. Check your entries before reviewing.',
    );
  return values;
}
export function checkedJournalRequest(
  value: JournalDetailRequest,
): JournalDetailRequest {
  const fields = [
    'invoice_id',
    'line_id',
    'version',
    'values',
    'review_version',
    'request_key',
  ];
  if (
    !value ||
    Object.keys(value).length !== fields.length ||
    !fields.every((key) => Object.hasOwn(value, key)) ||
    !journalId(value.invoice_id) ||
    !journalId(value.line_id) ||
    !journalHash(value.version) ||
    !journalHash(value.review_version) ||
    typeof value.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value.request_key,
    )
  )
    throw new Error(
      'Invalid journal save request. Check the current invoice before retrying.',
    );
  checkedJournalValues(value.values);
  return value;
}
function checkedJournalDetails(
  value: JournalDetails,
  invoiceId: number,
  lineId: number,
  review = false,
) {
  if (
    value?.invoice_id !== invoiceId ||
    value.line_id !== lineId ||
    !journalHash(value.version) ||
    !(value.name === false || typeof value.name === 'string') ||
    !['draft', 'posted', 'cancel'].includes(value.state) ||
    (value.state === 'cancel' && value.can_edit) ||
    !Array.isArray(value.account) ||
    !validRelation(value.account) ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    !Array.isArray(value.transaction_currency) ||
    !validRelation(value.transaction_currency) ||
    typeof value.can_edit !== 'boolean' ||
    typeof value.analytics_visible !== 'boolean' ||
    ![value.debit, value.credit].every(
      (amount) => Number.isFinite(amount) && amount >= 0,
    ) ||
    !Array.isArray(value.tax_grids) ||
    !value.tax_grids.every(
      (grid) => Array.isArray(grid) && validRelation(grid),
    ) ||
    (review && !journalHash(value.review_version))
  )
    throw new Error(
      'Invalid journal detail response. Reload the current invoice.',
    );
  checkedJournalValues(value.values);
  checkedAnalyticMetadata(
    value.analytic_plans,
    value.analytic_accounts,
    journalAnalyticIds(value.values.analytic_distribution),
  );
  if (
    value.account[0] !== value.values.account_id ||
    (!value.analytics_visible &&
      (value.values.analytic_distribution !== false ||
        value.analytic_plans.length !== 0 ||
        value.analytic_accounts.length !== 0)) ||
    value.tax_grids.length !== value.values.tax_tag_ids.length ||
    !value.tax_grids.every(([id]) => value.values.tax_tag_ids.includes(id))
  )
    throw new Error('Journal detail labels do not match their native values.');
  return value;
}
function journalDetailsRpc<T>(action: string, kwargs: object) {
  const method = `qorlia_journal_edit_${action}`;
  return rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });
}

export type JournalMoneyValues = Partial<
  JournalDetailValues & {
    partner_id: number | false;
    currency_id: number;
    amount_currency: number;
    debit: number;
    credit: number;
    tax_ids: number[];
  }
>;
export type JournalMoneyChange =
  | { id: number | false; values: JournalMoneyValues }
  | { id: number; delete: true };
export type JournalMoneyPayload = {
  invoice_id: number;
  version: string;
  changes: JournalMoneyChange[];
};
export type JournalMoneyRequest = {
  payload: JournalMoneyPayload;
  review_version: string;
  request_key: string;
};
export interface JournalMoneyResult {
  invoice_id: number;
  totals: {
    state: 'draft' | 'posted' | 'cancel';
    payment_state: string;
    amount_untaxed: number;
    amount_tax: number;
    amount_total: number;
    invoice_total: number;
    amount_residual: number;
  };
  rows: {
    id: number | false;
    values: Omit<
      JournalDetailValues,
      'account_id' | 'analytic_distribution'
    > & {
      account_id: number | false;
      analytic_distribution?: Record<string, number> | false;
      partner_id: number | false;
      currency_id: number | false;
      amount_currency: number;
      debit: number;
      credit: number;
      balance: number;
      tax_ids: number[];
      product_id: number | false;
      product_uom_id: number | false;
      quantity: number;
      price_unit: number;
      price_subtotal: number;
      price_total: number;
      discount: number;
      sequence: number;
      display_type: string | false;
      qorlia_adjustment_kind: false | 'discount' | 'rounding';
      amount_residual: number;
      amount_residual_currency: number;
      reconciled: boolean;
      matched_debit_ids: number[];
      matched_credit_ids: number[];
      full_reconcile_id: number | false;
    };
  }[];
}
export interface JournalMoneyView extends JournalMoneyResult {
  name: string | false;
  move_type: 'out_invoice' | 'out_refund';
  version: string;
  labels: Record<string, string>;
  company_currency: [number, string];
  transaction_currency: [number, string];
  can_edit: boolean;
  can_add: boolean;
  can_delete: boolean;
  editable_fields: (keyof JournalMoneyValues)[];
  request_key?: string;
}
export type JournalMoneyReview = JournalMoneyResult & {
  review_version: string;
  labels: Record<string, string>;
};
export type JournalMoneyChoice =
  | 'account'
  | 'partner'
  | 'currency'
  | 'tax'
  | 'grid'
  | 'analytic';
const journalMoneyFields = [
  'name',
  'account_id',
  'date_maturity',
  'tax_tag_ids',
  'analytic_distribution',
  'discount_date',
  'discount_amount_currency',
  'partner_id',
  'currency_id',
  'amount_currency',
  'debit',
  'credit',
  'tax_ids',
];
const uniqueJournalIds = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(journalId) &&
  new Set(value).size === value.length;

function checkedJournalMoneyPayload(payload: JournalMoneyPayload) {
  if (
    !payload ||
    Object.keys(payload).length !== 3 ||
    !journalId(payload.invoice_id) ||
    !journalHash(payload.version) ||
    !Array.isArray(payload.changes) ||
    payload.changes.length < 1 ||
    payload.changes.length > 1000
  )
    throw new Error('Reload the complete journal change request.');
  const ids = new Set<number>();
  for (const change of payload.changes) {
    if (
      !change ||
      Object.keys(change).length !== 2 ||
      !(change.id === false || journalId(change.id)) ||
      (change.id && ids.has(change.id))
    )
      throw new Error('Use distinct saved journal items or new rows.');
    if (change.id) ids.add(change.id);
    if ('delete' in change) {
      if (!change.id || change.delete !== true)
        throw new Error('Select a saved journal item to remove.');
      continue;
    }
    const values = change.values;
    if (
      !values ||
      typeof values !== 'object' ||
      Array.isArray(values) ||
      !Object.keys(values).length ||
      !Object.keys(values).every((key) => journalMoneyFields.includes(key))
    )
      throw new Error('Change only supported journal fields.');
    const details = {
      name: false,
      account_id: 1,
      date_maturity: false,
      tax_tag_ids: [],
      analytic_distribution: false,
      discount_date: false,
      discount_amount_currency: 0,
      ...values,
    };
    checkedJournalValues(
      Object.fromEntries(
        Object.entries(details).filter(
          ([key]) =>
            ![
              'partner_id',
              'currency_id',
              'amount_currency',
              'debit',
              'credit',
              'tax_ids',
            ].includes(key),
        ),
      ) as JournalDetailValues,
    );
    if (
      ('partner_id' in values &&
        !(values.partner_id === false || journalId(values.partner_id))) ||
      ('currency_id' in values && !journalId(values.currency_id)) ||
      ('tax_ids' in values &&
        (!uniqueJournalIds(values.tax_ids) || values.tax_ids.length > 100)) ||
      ['amount_currency', 'debit', 'credit'].some(
        (key) =>
          key in values &&
          !Number.isFinite(values[key as keyof JournalMoneyValues]),
      ) ||
      (values.debit !== undefined && values.debit < 0) ||
      (values.credit !== undefined && values.credit < 0) ||
      (change.id === false && (!values.account_id || !values.name))
    )
      throw new Error('Check the journal account, currencies and amounts.');
  }
  return payload;
}
export function checkedJournalMoneyRequest(request: JournalMoneyRequest) {
  if (
    !request ||
    Object.keys(request).length !== 3 ||
    !journalHash(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error('Invalid reviewed journal save request.');
  checkedJournalMoneyPayload(request.payload);
  return request;
}
function checkedJournalMoneyResult<T extends JournalMoneyResult>(
  result: T,
  invoiceId: number,
  review = false,
): T {
  const totals = result?.totals;
  if (
    result?.invoice_id !== invoiceId ||
    !totals ||
    !['draft', 'posted', 'cancel'].includes(totals.state) ||
    typeof totals.payment_state !== 'string' ||
    ![
      totals.amount_untaxed,
      totals.amount_tax,
      totals.amount_total,
      totals.invoice_total,
      totals.amount_residual,
    ].every(Number.isFinite) ||
    !Array.isArray(result.rows) ||
    result.rows.length > 1000
  )
    throw new Error('Invalid native journal calculation. Reload the invoice.');
  const ids = new Set<number>();
  for (const row of result.rows) {
    const values = row?.values;
    if (
      !row ||
      !((review && row.id === false) || journalId(row.id)) ||
      (row.id && ids.has(row.id)) ||
      !values ||
      ![
        values.amount_currency,
        values.debit,
        values.credit,
        values.balance,
        values.quantity,
        values.price_unit,
        values.price_subtotal,
        values.price_total,
        values.discount,
        values.sequence,
        values.amount_residual,
        values.amount_residual_currency,
        values.discount_amount_currency,
      ].every(Number.isFinite) ||
      values.debit < 0 ||
      values.credit < 0 ||
      ![
        'account_id',
        'partner_id',
        'currency_id',
        'product_id',
        'product_uom_id',
        'full_reconcile_id',
      ].every(
        (key) =>
          values[key as keyof typeof values] === false ||
          journalId(values[key as keyof typeof values]),
      ) ||
      ![
        values.tax_ids,
        values.tax_tag_ids,
        values.matched_debit_ids,
        values.matched_credit_ids,
      ].every(uniqueJournalIds) ||
      !(
        values.display_type === false || typeof values.display_type === 'string'
      ) ||
      ![false, 'discount', 'rounding'].includes(
        values.qorlia_adjustment_kind,
      ) ||
      typeof values.reconciled !== 'boolean'
    )
      throw new Error('Invalid native journal rows. Nothing was accepted.');
    if (row.id) ids.add(row.id);
    checkedJournalValues({
      name: values.name,
      account_id: values.account_id || 1,
      date_maturity: values.date_maturity,
      tax_tag_ids: values.tax_tag_ids,
      analytic_distribution: values.analytic_distribution ?? false,
      discount_date: values.discount_date,
      discount_amount_currency: values.discount_amount_currency,
    });
  }
  return result;
}
function checkedJournalMoneyView(
  result: JournalMoneyView,
  invoiceId: number,
  requestKey?: string,
) {
  checkedJournalMoneyResult(result, invoiceId);
  if (
    !journalHash(result.version) ||
    !(result.name === false || typeof result.name === 'string') ||
    !['out_invoice', 'out_refund'].includes(result.move_type) ||
    ![result.company_currency, result.transaction_currency].every(
      (value) => Array.isArray(value) && validRelation(value),
    ) ||
    ![result.can_edit, result.can_add, result.can_delete].every(
      (value) => typeof value === 'boolean',
    ) ||
    !Array.isArray(result.editable_fields) ||
    !result.editable_fields.every((key) => journalMoneyFields.includes(key)) ||
    new Set(result.editable_fields).size !== result.editable_fields.length ||
    (!result.can_edit &&
      (result.editable_fields.length || result.can_add || result.can_delete)) ||
    (result.can_delete && result.totals.state !== 'draft') ||
    (result.can_edit && result.totals.state === 'cancel') ||
    !result.labels ||
    typeof result.labels !== 'object' ||
    Array.isArray(result.labels) ||
    !Object.entries(result.labels).every(
      ([key, name]) =>
        /^[a-z_]+(\.[a-z_]+)*:[1-9]\d*$/.test(key) && typeof name === 'string',
    ) ||
    (requestKey !== undefined && result.request_key !== requestKey)
  )
    throw new Error(
      'Invalid journal access or recovery response. Reload the invoice.',
    );
  return result;
}
function journalMoneyRpc<T>(action: string, kwargs: object) {
  const method = `qorlia_journal_money_${action}`;
  return rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });
}
export async function getJournalMoney(invoiceId: number) {
  if (!journalId(invoiceId)) throw new Error('Select a saved invoice.');
  return checkedJournalMoneyView(
    await journalMoneyRpc<JournalMoneyView>('load', { invoice_id: invoiceId }),
    invoiceId,
  );
}
export async function previewJournalMoney(payload: JournalMoneyPayload) {
  checkedJournalMoneyPayload(payload);
  const result = checkedJournalMoneyResult(
    await journalMoneyRpc<JournalMoneyReview>('preview', { payload }),
    payload.invoice_id,
    true,
  );
  if (
    !journalHash(result.review_version) ||
    !result.labels ||
    typeof result.labels !== 'object' ||
    Array.isArray(result.labels) ||
    !Object.entries(result.labels).every(
      ([key, name]) =>
        /^[a-z_]+(\.[a-z_]+)*:[1-9]\d*$/.test(key) && typeof name === 'string',
    )
  )
    throw new Error('The journal review token is unavailable.');
  return result;
}
export async function saveJournalMoney(request: JournalMoneyRequest) {
  checkedJournalMoneyRequest(request);
  return checkedJournalMoneyView(
    await journalMoneyRpc<JournalMoneyView>('save', request),
    request.payload.invoice_id,
    request.request_key,
  );
}
export async function getJournalMoneyStatus(request: JournalMoneyRequest) {
  checkedJournalMoneyRequest(request);
  const result = await journalMoneyRpc<JournalMoneyView | false>(
    'status',
    request,
  );
  return result === false
    ? false
    : checkedJournalMoneyView(
        result,
        request.payload.invoice_id,
        request.request_key,
      );
}
export async function getJournalMoneyChoices(
  invoiceId: number,
  kind: JournalMoneyChoice,
  search = '',
  lineId: number | false = false,
  analyticScope?: {
    account_id: number;
    plan_id: number;
    account_ids: number[];
  },
) {
  if (
    !journalId(invoiceId) ||
    !(lineId === false || journalId(lineId)) ||
    !['account', 'partner', 'currency', 'tax', 'grid', 'analytic'].includes(
      kind,
    ) ||
    typeof search !== 'string' ||
    search.length > 200 ||
    (analyticScope &&
      (kind !== 'analytic' ||
        !journalId(analyticScope.account_id) ||
        !journalId(analyticScope.plan_id) ||
        !uniqueJournalIds(analyticScope.account_ids) ||
        analyticScope.account_ids.length > 200))
  )
    throw new Error('Use a valid journal search.');
  const result = await journalMoneyRpc<[number, string][]>('choices', {
    invoice_id: invoiceId,
    kind,
    search,
    line_id: lineId,
    ...(analyticScope ?? {}),
  });
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    !result.every((value) => Array.isArray(value) && validRelation(value)) ||
    new Set(result.map(([id]) => id)).size !== result.length
  )
    throw new Error('Invalid native journal choices.');
  return result;
}

export async function getJournalMoneyAnalytics(
  invoiceId: number,
  lineId: number | false,
  accountId: number,
  accountIds: number[],
) {
  if (
    !journalId(invoiceId) ||
    !(lineId === false || journalId(lineId)) ||
    !journalId(accountId) ||
    !uniqueJournalIds(accountIds) ||
    accountIds.length > 200
  )
    throw new Error('Select valid journal and analytic accounts.');
  const result = await journalMoneyRpc<
    Omit<JournalAnalytics, 'line_id'> & { line_id: number | false }
  >('analytics', {
    invoice_id: invoiceId,
    line_id: lineId,
    account_id: accountId,
    account_ids: accountIds,
  });
  if (
    result?.invoice_id !== invoiceId ||
    result.line_id !== lineId ||
    result.account_id !== accountId
  )
    throw new Error(
      'Invalid analytic plan response. Reload this journal item.',
    );
  checkedAnalyticMetadata(result.plans, result.accounts, accountIds);
  return result;
}
export async function getJournalDetails(invoiceId: number, lineId: number) {
  if (!journalId(invoiceId) || !journalId(lineId))
    throw new Error('Select a saved invoice journal item.');
  return checkedJournalDetails(
    await journalDetailsRpc<JournalDetails>('load', {
      invoice_id: invoiceId,
      line_id: lineId,
    }),
    invoiceId,
    lineId,
  );
}
export async function previewJournalDetails(
  current: JournalDetails,
  values: JournalDetailValues,
) {
  if (
    !journalId(current.invoice_id) ||
    !journalId(current.line_id) ||
    !journalHash(current.version)
  )
    throw new Error('Reload journal details before reviewing.');
  const result = checkedJournalDetails(
    await journalDetailsRpc<JournalDetails>('preview', {
      invoice_id: current.invoice_id,
      line_id: current.line_id,
      version: current.version,
      values: checkedJournalValues(values),
    }),
    current.invoice_id,
    current.line_id,
    true,
  );
  if (
    result.version !== current.version ||
    result.state !== current.state ||
    result.transaction_currency[0] !== current.transaction_currency[0]
  )
    throw new Error(
      'The journal review version changed. Reload before saving.',
    );
  return result;
}
export async function saveJournalDetails(request: JournalDetailRequest) {
  checkedJournalRequest(request);
  return checkedJournalDetails(
    await journalDetailsRpc<JournalDetails>('save', request),
    request.invoice_id,
    request.line_id,
  );
}
export async function getJournalDetailsStatus(request: JournalDetailRequest) {
  checkedJournalRequest(request);
  const result = await journalDetailsRpc<JournalDetails | false>(
    'status',
    request,
  );
  return result === false
    ? false
    : checkedJournalDetails(result, request.invoice_id, request.line_id);
}
export async function getJournalDetailChoices(
  invoiceId: number,
  lineId: number,
  kind: 'account' | 'grid' | 'analytic',
  search = '',
  analyticScope?: {
    account_id: number;
    plan_id: number;
    account_ids: number[];
  },
) {
  if (
    !journalId(invoiceId) ||
    !journalId(lineId) ||
    !['account', 'grid', 'analytic'].includes(kind) ||
    typeof search !== 'string' ||
    search.length > 200 ||
    (analyticScope &&
      (kind !== 'analytic' ||
        !journalId(analyticScope.account_id) ||
        !journalId(analyticScope.plan_id) ||
        !Array.isArray(analyticScope.account_ids) ||
        analyticScope.account_ids.length > 200 ||
        !analyticScope.account_ids.every(journalId) ||
        new Set(analyticScope.account_ids).size !==
          analyticScope.account_ids.length))
  )
    throw new Error('Use a valid journal detail search.');
  const result = await journalDetailsRpc<[number, string][]>('choices', {
    invoice_id: invoiceId,
    line_id: lineId,
    kind,
    search,
    ...(analyticScope
      ? {
          account_id: analyticScope.account_id,
          plan_id: analyticScope.plan_id,
          account_ids: analyticScope.account_ids,
        }
      : {}),
  });
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    !result.every((row) => Array.isArray(row) && validRelation(row))
  )
    throw new Error('Invalid journal detail choices.');
  return result;
}

export async function getJournalAnalytics(
  invoiceId: number,
  lineId: number,
  accountId: number,
  accountIds: number[],
) {
  if (
    ![invoiceId, lineId, accountId].every(journalId) ||
    !Array.isArray(accountIds) ||
    accountIds.length > 200 ||
    !accountIds.every(journalId) ||
    new Set(accountIds).size !== accountIds.length
  )
    throw new Error('Select valid journal and analytic accounts.');
  const result = await journalDetailsRpc<JournalAnalytics>('analytics', {
    invoice_id: invoiceId,
    line_id: lineId,
    account_id: accountId,
    account_ids: accountIds,
  });
  if (
    result?.invoice_id !== invoiceId ||
    result.line_id !== lineId ||
    result.account_id !== accountId
  )
    throw new Error(
      'Invalid analytic plan response. Reload this journal item.',
    );
  checkedAnalyticMetadata(result.plans, result.accounts, accountIds);
  return result;
}

export interface ChargeOrder {
  id: number;
  name: string;
  client_order_ref: string | false;
  partner_id: Relation;
  shop_id: Relation;
  date_order: string;
  state: 'draft' | 'sent' | 'sale' | 'done' | 'cancel';
  invoice_status: 'upselling' | 'invoiced' | 'to invoice' | 'no';
  care_setting: 'opd' | 'ipd' | false;
  provider_name: string | false;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
  discount: number;
  discount_type: 'none' | 'fixed' | 'percentage';
  discount_percentage: number;
  chargeable_amount: number;
  disc_acc_id: Relation;
  round_off_amount: number;
  currency_id: [number, string];
  invoice_ids: number[];
}

export interface ChargeOrderLine {
  id: number;
  name: string;
  display_type: 'line_section' | 'line_note' | false;
  product_id: Relation;
  product_uom: Relation;
  product_uom_qty: number;
  qty_delivered: number;
  qty_invoiced: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
  price_tax: number;
  price_total: number;
  dispensed: boolean;
  lot_id: Relation;
  expiry_date: string | false;
}

const validRelation = (value: unknown) =>
  value === false ||
  (Array.isArray(value) &&
    value.length === 2 &&
    Number.isInteger(value[0]) &&
    value[0] > 0 &&
    typeof value[1] === 'string');

export interface CustomerStatement {
  invoice_id: number;
  customer: string;
  company: string;
  currency: [number, string];
  date_from: string;
  date_to: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  rows: {
    id: number;
    move_id: number;
    date: string;
    document: string;
    move_type: string;
    reference: string | false;
    label: string | false;
    journal: string;
    account: string;
    debit: number;
    credit: number;
    balance: number;
    currency: [number, string];
    amount_currency: number;
  }[];
}

const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export async function getCustomerStatement(
  invoiceId: number,
  dateFrom: string,
  dateTo: string,
) {
  checkedStatementRange(invoiceId, dateFrom, dateTo);
  const method = 'qorlia_customer_statement';
  const result = await rpc<CustomerStatement>(
    `/web/dataset/call_kw/account.move/${method}`,
    {
      model: 'account.move',
      method,
      args: [],
      kwargs: { invoice_id: invoiceId, date_from: dateFrom, date_to: dateTo },
    },
  );
  return checkedCustomerStatement(result, invoiceId, dateFrom, dateTo);
}

function checkedStatementRange(
  invoiceId: number,
  dateFrom: string,
  dateTo: string,
) {
  if (
    !Number.isInteger(invoiceId) ||
    invoiceId <= 0 ||
    !validDate(dateFrom) ||
    !validDate(dateTo) ||
    dateFrom > dateTo
  )
    throw new Error('Select a saved invoice and valid statement date range.');
}

function checkedCustomerStatement(
  result: CustomerStatement,
  invoiceId: number,
  dateFrom: string,
  dateTo: string,
) {
  const finite = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value);
  const text = (value: unknown) => typeof value === 'string';
  if (
    result?.invoice_id !== invoiceId ||
    result.date_from !== dateFrom ||
    result.date_to !== dateTo ||
    !text(result.customer) ||
    !text(result.company) ||
    !result.currency ||
    !validRelation(result.currency) ||
    ![result.opening, result.debit, result.credit, result.closing].every(
      finite,
    ) ||
    !Array.isArray(result.rows) ||
    result.rows.length > 2000 ||
    new Set(result.rows.map((row) => row?.id)).size !== result.rows.length ||
    result.rows.some(
      (row) =>
        !row ||
        !Number.isInteger(row.id) ||
        row.id <= 0 ||
        !Number.isInteger(row.move_id) ||
        row.move_id <= 0 ||
        !validDate(row.date) ||
        row.date < dateFrom ||
        row.date > dateTo ||
        ![row.document, row.move_type, row.journal, row.account].every(text) ||
        !(row.reference === false || text(row.reference)) ||
        !(row.label === false || text(row.label)) ||
        !row.currency ||
        !validRelation(row.currency) ||
        ![row.debit, row.credit, row.balance, row.amount_currency].every(
          finite,
        ) ||
        row.debit < 0 ||
        row.credit < 0,
    )
  )
    throw new Error('Invalid customer statement response.');
  return result;
}

async function rpc<T>(path: string, params: object): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
  });
  if (response.status === 401) {
    window.location.assign('/bahmni-v2/login');
    throw new Error('Sign in to Qorlia to open Billing.');
  }
  if (!response.ok)
    throw new Error('Billing is unavailable. Please try again.');
  const body = await response.json();
  if (body.error) {
    if (body.error.code === 100) throw new BillingSessionExpired();
    if (
      ['odoo.exceptions.UserError', 'odoo.exceptions.ValidationError'].includes(
        body.error.data?.name,
      ) &&
      typeof body.error.data?.arguments?.[0] === 'string'
    )
      throw new BillingActionRejected(body.error.data.arguments[0]);
    throw new Error(
      'Billing access failed. Check your billing account permissions.',
    );
  }
  if (!Object.hasOwn(body, 'result'))
    throw new Error('Invalid billing response.');
  return body.result;
}

export const getBillingSession = () =>
  rpc<BillingSession>('/web/session/get_session_info', {});

export const signInToBilling = (login: string, password: string) =>
  rpc<BillingSession>('/web/session/authenticate', {
    db: 'odoo',
    login,
    password,
  });

export const disconnectBilling = () => rpc('/web/session/destroy', {});

export interface DraftLine {
  id: number | false;
  values: {
    product_id: number | false;
    name: string | false;
    display_type: 'line_section' | 'line_note' | false;
    sequence: number;
    product_uom: number | false;
    product_uom_qty: number;
    price_unit: number;
    discount: number;
    tax_id: number[];
    lot_id: number | false;
    expiry_date: string | false;
    analytic_distribution: Record<string, number> | false;
  };
  totals: { price_subtotal: number; price_tax: number; price_total: number };
}

export interface BillingDraft {
  id: number | false;
  name: string;
  version: string | false;
  values: {
    partner_id: number | false;
    partner_invoice_id: number | false;
    partner_shipping_id: number | false;
    shop_id: number | false;
    care_setting: 'opd' | 'ipd' | false;
    provider_name: string | false;
    client_order_ref: string | false;
    company_id: number;
    pricelist_id: number | false;
    warehouse_id: number | false;
    location_id: number | false;
    payment_term_id: number | false;
    fiscal_position_id: number | false;
    date_order: string | false;
    discount_type: 'none' | 'fixed' | 'percentage';
    discount: number;
    discount_percentage: number;
    chargeable_amount: number;
    disc_acc_id: number | false;
    note: string | false;
    partner_village: number | false;
    user_id: number | false;
    team_id: number | false;
    validity_date: string | false;
  };
  lines: DraftLine[];
  totals: {
    amount_untaxed: number;
    amount_tax: number;
    amount_total: number;
    round_off_amount: number;
    currency_id: number | false;
  };
  labels: Record<string, string>;
  warning: { title?: string; message: string } | false;
}

export type DraftChoiceKind =
  | 'customer'
  | 'shop'
  | 'product'
  | 'pricelist'
  | 'payment_term'
  | 'discount_account'
  | 'tax'
  | 'unit'
  | 'lot';

const draftPayload = ({ id, version, values, lines }: BillingDraft) => ({
  id,
  version,
  values,
  lines,
});

const draftCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/sale.order/${method}`, {
    model: 'sale.order',
    method,
    args: [],
    kwargs,
  });

const validId = (id: unknown) =>
  id === false || (Number.isInteger(id) && Number(id) > 0);

function checkedDraft(value: BillingDraft): BillingDraft {
  const stringOrFalse = (text: unknown) =>
    text === false || typeof text === 'string';
  if (
    !value ||
    !validId(value.id) ||
    typeof value.name !== 'string' ||
    !(
      value.version === false ||
      (typeof value.version === 'string' &&
        /^[a-f0-9]{64}$/.test(value.version))
    ) ||
    !value.values ||
    ![
      'partner_id',
      'partner_invoice_id',
      'partner_shipping_id',
      'shop_id',
      'company_id',
      'pricelist_id',
      'warehouse_id',
      'location_id',
      'payment_term_id',
      'fiscal_position_id',
      'disc_acc_id',
      'partner_village',
      'user_id',
      'team_id',
    ].every((field) =>
      validId(value.values[field as keyof BillingDraft['values']]),
    ) ||
    ![false, 'opd', 'ipd'].includes(value.values.care_setting) ||
    !['none', 'fixed', 'percentage'].includes(value.values.discount_type) ||
    ![
      'provider_name',
      'client_order_ref',
      'note',
      'date_order',
      'validity_date',
    ].every((field) =>
      stringOrFalse(value.values[field as keyof BillingDraft['values']]),
    ) ||
    ![
      value.values.discount,
      value.values.discount_percentage,
      value.values.chargeable_amount,
    ].every(Number.isFinite) ||
    !Array.isArray(value.lines) ||
    !value.lines.every(
      (line) =>
        line &&
        validId(line.id) &&
        line.values &&
        [
          line.values.product_id,
          line.values.product_uom,
          line.values.lot_id,
        ].every(validId) &&
        stringOrFalse(line.values.name) &&
        stringOrFalse(line.values.expiry_date) &&
        [false, 'line_section', 'line_note'].includes(
          line.values.display_type,
        ) &&
        [
          line.values.sequence,
          line.values.product_uom_qty,
          line.values.price_unit,
          line.values.discount,
        ].every(Number.isFinite) &&
        Array.isArray(line.values.tax_id) &&
        line.values.tax_id.every((id) => Number.isInteger(id) && id > 0) &&
        line.totals &&
        [
          line.totals.price_subtotal,
          line.totals.price_tax,
          line.totals.price_total,
        ].every(Number.isFinite),
    ) ||
    !value.totals ||
    ![
      value.totals.amount_untaxed,
      value.totals.amount_tax,
      value.totals.amount_total,
      value.totals.round_off_amount,
    ].every(Number.isFinite) ||
    !validId(value.totals.currency_id) ||
    !value.labels ||
    typeof value.labels !== 'object' ||
    (value.totals.currency_id &&
      !value.labels[`res.currency:${value.totals.currency_id}`]) ||
    (!value.totals.currency_id &&
      [
        value.totals.amount_untaxed,
        value.totals.amount_tax,
        value.totals.amount_total,
        value.totals.round_off_amount,
      ].some((amount) => amount !== 0)) ||
    !Object.values(value.labels).every((label) => typeof label === 'string') ||
    !(
      value.warning === false ||
      (value.warning && typeof value.warning.message === 'string')
    )
  )
    throw new Error('Invalid draft response. Reload the editor.');
  return value;
}

export const getBillingDraft = async (orderId: number | false = false) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_load', { order_id: orderId }),
  );

export const previewBillingDraft = async (
  draft: BillingDraft,
  change: { field: string; line?: number },
) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_preview', {
      payload: draftPayload(draft),
      change,
    }),
  );

export const saveBillingDraft = async (
  draft: BillingDraft,
  requestKey: string,
) =>
  checkedDraft(
    await draftCall<BillingDraft>('qorlia_draft_save', {
      payload: draftPayload(draft),
      request_key: requestKey,
    }),
  );

export interface OrderWorkflow {
  id: number;
  name: string;
  state: ChargeOrder['state'];
  version: string;
  customer: string | false;
  currency: [number, string];
  amount_total: number;
  can_confirm: boolean;
  can_invoice: boolean;
  can_advance: boolean;
  has_down_payments: boolean;
  automation: { delivery: boolean; invoice: boolean; legacy_delivery: boolean };
  invoices: {
    id: number;
    name: string | false;
    state: 'draft' | 'posted' | 'cancel';
    total: number;
    currency: [number, string];
  }[];
  pickings: { id: number; name: string; state: string }[];
}

function checkedWorkflow(value: OrderWorkflow): OrderWorkflow {
  const positiveId = (id: unknown) => Number.isInteger(id) && Number(id) > 0;
  if (
    !value ||
    !positiveId(value.id) ||
    typeof value.name !== 'string' ||
    !['draft', 'sent', 'sale', 'done', 'cancel'].includes(value.state) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !(value.customer === false || typeof value.customer === 'string') ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    !Number.isFinite(value.amount_total) ||
    typeof value.can_confirm !== 'boolean' ||
    typeof value.can_invoice !== 'boolean' ||
    typeof value.can_advance !== 'boolean' ||
    typeof value.has_down_payments !== 'boolean' ||
    !value.automation ||
    !['delivery', 'invoice', 'legacy_delivery'].every(
      (key) =>
        typeof value.automation[key as keyof OrderWorkflow['automation']] ===
        'boolean',
    ) ||
    !Array.isArray(value.invoices) ||
    !value.invoices.every(
      (invoice) =>
        invoice &&
        positiveId(invoice.id) &&
        (invoice.name === false || typeof invoice.name === 'string') &&
        ['draft', 'posted', 'cancel'].includes(invoice.state) &&
        Number.isFinite(invoice.total) &&
        Array.isArray(invoice.currency) &&
        validRelation(invoice.currency),
    ) ||
    !Array.isArray(value.pickings) ||
    !value.pickings.every(
      (picking) =>
        picking &&
        positiveId(picking.id) &&
        typeof picking.name === 'string' &&
        typeof picking.state === 'string',
    )
  )
    throw new Error(
      'Invalid order status response. Reload the current status.',
    );
  return value;
}

export const getOrderWorkflow = async (orderId: number) =>
  checkedWorkflow(
    await draftCall<OrderWorkflow>('qorlia_order_workflow_load', {
      order_id: orderId,
    }),
  );

export const runOrderWorkflow = async (
  order: OrderWorkflow,
  action: 'confirm' | 'invoice',
  deductDownPayments = true,
) =>
  checkedWorkflow(
    await draftCall<OrderWorkflow>('qorlia_order_workflow_run', {
      order_id: order.id,
      version: order.version,
      action,
      ...(action === 'invoice'
        ? { deduct_down_payments: deductDownPayments }
        : {}),
    }),
  );

export interface AdvanceValues {
  advance_payment_method: 'percentage' | 'fixed';
  amount: number;
  fixed_amount: number;
  deposit_account_id: number | false;
  deposit_taxes_id: number[];
}

export interface AdvanceInvoice {
  order: OrderWorkflow;
  values: AdvanceValues;
  product: Relation;
  can_set_account: boolean;
}

export interface AdvanceReview extends AdvanceInvoice {
  review_version: string;
  invoice: {
    company: string;
    journal: string;
    currency: [number, string];
    totals: InvoiceDraft['totals'];
    lines: { key: string; name: string; subtotal: number; total: number }[];
  };
}

export interface SavedAdvance {
  order: OrderWorkflow;
  invoice: InvoiceWorkflow;
}

export interface AdvanceRequest {
  order_id: number;
  values: AdvanceValues;
  review_version: string;
  request_key: string;
}

function checkedAdvanceValues(value: AdvanceValues): AdvanceValues {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'advance_payment_method,amount,deposit_account_id,deposit_taxes_id,fixed_amount' ||
    !['percentage', 'fixed'].includes(value.advance_payment_method) ||
    ![value.amount, value.fixed_amount].every(Number.isFinite) ||
    !validId(value.deposit_account_id) ||
    !Array.isArray(value.deposit_taxes_id) ||
    value.deposit_taxes_id.length > 100 ||
    value.deposit_taxes_id.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(value.deposit_taxes_id).size !== value.deposit_taxes_id.length
  )
    throw new Error('Invalid advance invoice values. Reload the form.');
  return value;
}

function checkedAdvance(value: AdvanceInvoice, orderId: number) {
  if (
    !value ||
    checkedWorkflow(value.order).id !== orderId ||
    !validRelation(value.product) ||
    typeof value.can_set_account !== 'boolean'
  )
    throw new Error('Invalid advance invoice response. Reload the form.');
  checkedAdvanceValues(value.values);
  return value;
}

export const getAdvanceInvoice = async (orderId: number) =>
  checkedAdvance(
    await draftCall<AdvanceInvoice>('qorlia_advance_load', {
      order_id: orderId,
    }),
    orderId,
  );

export const getAdvanceChoices = async (
  orderId: number,
  kind: 'account' | 'tax',
  search: string,
) => {
  const result = await draftCall<[number, string][]>('qorlia_advance_choices', {
    order_id: orderId,
    kind,
    search,
  });
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    result.some((row) => !Array.isArray(row) || !validRelation(row))
  )
    throw new Error('Invalid advance setting choices. Search again.');
  return result;
};

export const previewAdvanceInvoice = async (
  orderId: number,
  values: AdvanceValues,
) => {
  checkedAdvanceValues(values);
  const result = await draftCall<AdvanceReview>('qorlia_advance_preview', {
    order_id: orderId,
    values,
  });
  checkedAdvance(result, orderId);
  const invoice = result.invoice;
  if (
    typeof result.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.review_version) ||
    (Object.keys(values) as (keyof AdvanceValues)[]).some(
      (field) =>
        JSON.stringify(result.values[field]) !== JSON.stringify(values[field]),
    ) ||
    !invoice ||
    typeof invoice.company !== 'string' ||
    typeof invoice.journal !== 'string' ||
    !Array.isArray(invoice.currency) ||
    !validRelation(invoice.currency) ||
    invoice.currency[0] !== result.order.currency[0] ||
    !invoice.totals ||
    ![
      'qorlia_item_subtotal',
      'amount_tax',
      'amount_total',
      'invoice_total',
      'round_off_amount',
    ].every((key) =>
      Number.isFinite(invoice.totals[key as keyof InvoiceDraft['totals']]),
    ) ||
    !Array.isArray(invoice.lines) ||
    !invoice.lines.length ||
    invoice.lines.length > 500 ||
    new Set(invoice.lines.map((line) => line?.key)).size !==
      invoice.lines.length ||
    invoice.lines.some(
      (line) =>
        !line ||
        typeof line.key !== 'string' ||
        !line.key ||
        typeof line.name !== 'string' ||
        ![line.subtotal, line.total].every(Number.isFinite),
    )
  )
    throw new Error('Invalid advance invoice calculation. Review again.');
  return result;
};

export function checkedAdvanceRequest(request: AdvanceRequest): AdvanceRequest {
  checkedAdvanceValues(request?.values);
  if (
    Object.keys(request).sort().join(',') !==
      'order_id,request_key,review_version,values' ||
    !Number.isInteger(request.order_id) ||
    request.order_id <= 0 ||
    typeof request.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error(
      'Review the advance and use a valid save request identifier.',
    );
  return request;
}

function checkedSavedAdvance(result: SavedAdvance, orderId: number) {
  if (!result || checkedWorkflow(result.order).id !== orderId)
    throw new Error('Invalid saved advance order. Check its current status.');
  const invoice = checkedInvoiceWorkflow(result.invoice);
  const linked = result.order.invoices.find((item) => item.id === invoice.id);
  if (
    !linked ||
    invoice.move_type !== 'out_invoice' ||
    !invoice.ledger_balanced ||
    invoice.currency[0] !== result.order.currency[0] ||
    linked.total !== invoice.total ||
    linked.state !== invoice.state ||
    linked.currency[0] !== invoice.currency[0]
  )
    throw new Error('Invalid saved advance invoice. Check its current status.');
  return result;
}

export const saveAdvanceInvoice = async (request: AdvanceRequest) =>
  checkedSavedAdvance(
    await draftCall<SavedAdvance>(
      'qorlia_advance_save',
      checkedAdvanceRequest(request),
    ),
    request.order_id,
  );

export const getAdvanceInvoiceStatus = async (request: AdvanceRequest) => {
  const result = await draftCall<SavedAdvance | false>(
    'qorlia_advance_status',
    checkedAdvanceRequest(request),
  );
  return result === false
    ? false
    : checkedSavedAdvance(result, request.order_id);
};

function checkedInvoiceWorkflow(value: InvoiceWorkflow): InvoiceWorkflow {
  if (
    !value ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    !(value.name === false || typeof value.name === 'string') ||
    !['draft', 'posted', 'cancel'].includes(value.state) ||
    !['out_invoice', 'out_refund'].includes(value.move_type) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !(value.customer === false || typeof value.customer === 'string') ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    ![value.total, value.open_amount].every(Number.isFinite) ||
    typeof value.payment_state !== 'string' ||
    !(value.invoice_date === false || typeof value.invoice_date === 'string') ||
    typeof value.journal !== 'string' ||
    typeof value.company !== 'string' ||
    typeof value.ledger_balanced !== 'boolean' ||
    typeof value.can_post !== 'boolean'
  )
    throw new Error(
      'Invalid invoice status response. Reload its current status.',
    );
  return value;
}

const invoiceWorkflowCall = async (method: string, kwargs: object) =>
  checkedInvoiceWorkflow(
    await rpc<InvoiceWorkflow>(`/web/dataset/call_kw/account.move/${method}`, {
      model: 'account.move',
      method,
      args: [],
      kwargs,
    }),
  );

export const getInvoiceWorkflow = (invoiceId: number) =>
  invoiceWorkflowCall('qorlia_invoice_workflow_load', {
    invoice_id: invoiceId,
  });

export const postInvoiceWorkflow = (invoice: InvoiceWorkflow) =>
  invoiceWorkflowCall('qorlia_invoice_workflow_post', {
    invoice_id: invoice.id,
    version: invoice.version,
  });

export interface InvoiceDraftLine {
  id: number | false;
  values: {
    product_id: number | false;
    name: string | false;
    display_type: 'product' | 'line_section' | 'line_note';
    sequence: number;
    account_id: number | false;
    product_uom_id: number | false;
    quantity: number;
    price_unit: number;
    discount: number;
    tax_ids: number[];
    analytic_distribution: Record<string, number> | false;
  };
  totals: { price_subtotal: number; price_total: number };
}

export interface InvoiceDraft {
  id: number | false;
  name: string | false;
  move_type: 'out_invoice' | 'out_refund';
  company: [number, string];
  version: string;
  review_version?: string;
  values: {
    partner_id: number | false;
    partner_shipping_id: number | false;
    ref: string | false;
    payment_reference: string | false;
    invoice_date: string | false;
    date: string | false;
    invoice_date_due: string | false;
    invoice_payment_term_id: number | false;
    journal_id: number | false;
    currency_id: number | false;
    fiscal_position_id: number | false;
    invoice_user_id: number | false;
    partner_bank_id: number | false;
    invoice_incoterm_id: number | false;
    narration: string | false;
    discount_type: 'none' | 'fixed' | 'percentage';
    discount: number;
    discount_percentage: number;
    disc_acc_id: number | false;
    invoice_cash_rounding_id: number | false;
    auto_post: 'no' | 'at_date' | 'monthly' | 'quarterly' | 'yearly';
    auto_post_until: string | false;
    to_check: boolean;
  };
  lines: InvoiceDraftLine[];
  totals: {
    qorlia_item_subtotal: number;
    amount_tax: number;
    amount_total: number;
    invoice_total: number;
    round_off_amount: number;
  };
  labels: Record<string, string>;
  warning: { title?: string; message: string } | false;
  generated_adjustments: { kind: string; name: string; amount: number }[];
  selections: {
    discount_type: [string, string][];
    auto_post: [string, string][];
  };
  journal_locked: boolean;
  can_edit: boolean;
}

export type InvoiceDraftChoiceKind =
  | 'customer'
  | 'shipping'
  | 'product'
  | 'journal'
  | 'currency'
  | 'account'
  | 'discount_account'
  | 'tax'
  | 'payment_term'
  | 'fiscal_position'
  | 'bank'
  | 'incoterm'
  | 'cash_rounding'
  | 'salesperson'
  | 'analytic'
  | 'unit';

const invoiceDraftCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });

export interface InvoiceMessage {
  id: number;
  date: string;
  author: string;
  subject: string;
  kind: string;
  body: string;
  body_truncated: boolean;
  changes: { id: number; field: string; old: string; new: string }[];
  attachments: { id: number; name: string }[];
}
export interface InvoiceConversation {
  invoice_id: number;
  can_note: boolean;
  messages: InvoiceMessage[];
  next_before: number | false;
}

function checkedMessage(value: InvoiceMessage): InvoiceMessage {
  if (
    !value ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.date) ||
    !validDate(value.date.slice(0, 10)) ||
    !Number.isFinite(Date.parse(value.date.replace(' ', 'T') + 'Z')) ||
    !['author', 'subject', 'kind', 'body'].every(
      (key) => typeof value[key as 'body'] === 'string',
    ) ||
    value.body.length > 20000 ||
    typeof value.body_truncated !== 'boolean' ||
    !Array.isArray(value.changes) ||
    value.changes.length > 200 ||
    value.changes.some(
      (change) =>
        !change ||
        !Number.isInteger(change.id) ||
        change.id <= 0 ||
        !['field', 'old', 'new'].every(
          (key) => typeof change[key as 'field'] === 'string',
        ),
    ) ||
    !Array.isArray(value.attachments) ||
    value.attachments.length > 200 ||
    value.attachments.some(
      (file) =>
        !file ||
        !Number.isInteger(file.id) ||
        file.id <= 0 ||
        typeof file.name !== 'string',
    )
  )
    throw new Error('Invalid invoice conversation response.');
  return value;
}

export async function getInvoiceConversation(
  invoiceId: number,
  before: number | false = false,
) {
  if (
    !Number.isInteger(invoiceId) ||
    invoiceId <= 0 ||
    (before !== false && (!Number.isInteger(before) || before <= 0))
  )
    throw new Error('Select a saved invoice and valid conversation cursor.');
  const result = await invoiceDraftCall<InvoiceConversation>(
    'qorlia_invoice_messages',
    { invoice_id: invoiceId, before },
  );
  if (
    result?.invoice_id !== invoiceId ||
    typeof result.can_note !== 'boolean' ||
    !Array.isArray(result.messages) ||
    result.messages.length > 30
  )
    throw new Error('Invalid invoice conversation response.');
  result.messages.forEach(checkedMessage);
  if (
    result.messages.some(
      (message, index) =>
        (before !== false && message.id >= before) ||
        (index > 0 && message.id >= result.messages[index - 1].id),
    ) ||
    (result.next_before !== false &&
      (result.messages.length !== 30 ||
        result.next_before !== result.messages[29].id))
  )
    throw new Error('Invalid invoice conversation response.');
  return result;
}

async function invoiceNoteRequest(
  action: 'note' | 'note_status',
  invoiceId: number,
  requestKey: string,
  body: string,
  uploads: InvoiceUpload[] = [],
) {
  checkedUploads(uploads);
  if (
    !Number.isInteger(invoiceId) ||
    invoiceId <= 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      requestKey,
    ) ||
    typeof body !== 'string' ||
    (!body.trim() && !uploads.length) ||
    body.length > 5000 ||
    body.includes('\0')
  )
    throw new Error('Enter a valid internal note of 1 to 5,000 characters.');
  const result = await invoiceDraftCall<{
    invoice_id: number;
    request_key: string;
    message: InvoiceMessage | false;
  }>(`qorlia_invoice_${action}`, {
    invoice_id: invoiceId,
    request_key: requestKey,
    body,
    ...(uploads.length ? { uploads } : {}),
  });
  if (
    result?.invoice_id !== invoiceId ||
    result.request_key !== requestKey ||
    (result.message === false && action === 'note')
  )
    throw new Error('Invalid saved internal note response.');
  if (result.message !== false) {
    checkedMessage(result.message);
    if (result.message.kind !== 'note')
      throw new Error('Invalid saved internal note response.');
  }
  return result.message;
}
export const postInvoiceNote = (
  invoiceId: number,
  requestKey: string,
  body: string,
  uploads: InvoiceUpload[] = [],
) => invoiceNoteRequest('note', invoiceId, requestKey, body, uploads);
export const checkInvoiceNote = (
  invoiceId: number,
  requestKey: string,
  body: string,
  uploads: InvoiceUpload[] = [],
) => invoiceNoteRequest('note_status', invoiceId, requestKey, body, uploads);

export interface InvoiceUpload {
  name: string;
  content: string;
}
export const INVOICE_ATTACHMENT_LIMIT = 10 * 1024 * 1024;
const safeAttachmentName = (name: string) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 160 &&
  name.trim() === name &&
  name !== '.' &&
  name !== '..' &&
  !/[\p{C}/\\]/u.test(name);

function attachmentBytes(content: string, size: number) {
  if (
    !Number.isInteger(size) ||
    size < 0 ||
    size > INVOICE_ATTACHMENT_LIMIT ||
    typeof content !== 'string' ||
    content.length !== 4 * Math.ceil(size / 3) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
  )
    throw new Error('Invalid attachment content or size.');
  let raw: string;
  try {
    raw = atob(content);
  } catch {
    throw new Error('Invalid attachment content.');
  }
  if (raw.length !== size || btoa(raw) !== content)
    throw new Error('Invalid attachment content or size.');
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
function checkedUploads(uploads: InvoiceUpload[]) {
  if (!Array.isArray(uploads) || uploads.length > 5)
    throw new Error('Select up to five attachments, totalling at most 10 MiB.');
  let total = 0;
  for (const file of uploads) {
    if (
      !file ||
      Object.keys(file).sort().join(',') !== 'content,name' ||
      !safeAttachmentName(file.name) ||
      typeof file.content !== 'string' ||
      file.content.length > 4 * Math.ceil(INVOICE_ATTACHMENT_LIMIT / 3)
    )
      throw new Error('Invalid attachment name or content.');
    const padding = file.content.endsWith('==')
      ? 2
      : file.content.endsWith('=')
        ? 1
        : 0;
    total += attachmentBytes(
      file.content,
      (file.content.length / 4) * 3 - padding,
    ).length;
  }
  if (total > INVOICE_ATTACHMENT_LIMIT)
    throw new Error('Attachments may total at most 10 MiB.');
}
export async function readInvoiceUploads(
  files: File[],
): Promise<InvoiceUpload[]> {
  if (
    files.length > 5 ||
    files.some((file) => !safeAttachmentName(file.name)) ||
    files.reduce((sum, file) => sum + file.size, 0) > INVOICE_ATTACHMENT_LIMIT
  )
    throw new Error(
      'Select up to five files with valid names, totalling at most 10 MiB.',
    );
  return Promise.all(
    files.map(
      (file) =>
        new Promise<InvoiceUpload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reader.onabort = () =>
            reject(
              new Error(`Could not read ${file.name}. Select the file again.`),
            );
          reader.onload = () => {
            if (
              typeof reader.result !== 'string' ||
              !reader.result.includes(';base64,')
            )
              return reject(new Error(`Could not read ${file.name}.`));
            resolve({
              name: file.name,
              content: reader.result.split(';base64,')[1],
            });
          };
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export async function downloadInvoiceAttachment(
  invoiceId: number,
  messageId: number,
  attachmentId: number,
): Promise<
  | { kind: 'binary'; filename: string; blob: Blob }
  | { kind: 'url'; url: string }
> {
  if (
    [invoiceId, messageId, attachmentId].some(
      (id) => !Number.isInteger(id) || id <= 0,
    )
  )
    throw new Error('Select a saved invoice message and attachment.');
  const result = await invoiceDraftCall<{
    invoice_id: number;
    message_id: number;
    attachment_id: number;
    kind: string;
    filename: string;
    mimetype: string;
    byte_count: number;
    content: string;
    url: string;
  }>('qorlia_invoice_attachment_download', {
    invoice_id: invoiceId,
    message_id: messageId,
    attachment_id: attachmentId,
  });
  if (
    result?.invoice_id !== invoiceId ||
    result.message_id !== messageId ||
    result.attachment_id !== attachmentId
  )
    throw new Error('Invalid invoice attachment response.');
  if (result.kind === 'url') {
    let url: URL;
    try {
      url = new URL(result.url);
    } catch {
      throw new Error('Invalid attachment link.');
    }
    if (
      typeof result.url !== 'string' ||
      /[\p{C}\s]/u.test(result.url) ||
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new Error('Invalid attachment link.');
    return { kind: 'url', url: result.url };
  }
  if (
    result.kind !== 'binary' ||
    !safeAttachmentName(result.filename) ||
    result.mimetype !== 'application/octet-stream'
  )
    throw new Error('Invalid invoice attachment response.');
  return {
    kind: 'binary',
    filename: result.filename,
    blob: new Blob([attachmentBytes(result.content, result.byte_count)], {
      type: 'application/octet-stream',
    }),
  };
}

export type InvoiceReportKey = 'invoice' | 'invoice_without_payments';
export interface InvoiceReport {
  key: InvoiceReportKey;
  name: string;
}
const isInvoiceReportKey = (key: unknown): key is InvoiceReportKey =>
  key === 'invoice' || key === 'invoice_without_payments';
const checkedReportInvoiceId = (id: number) => {
  if (!Number.isInteger(id) || id <= 0)
    throw new Error('Select a saved invoice before printing.');
};

export async function getInvoiceReports(
  invoiceId: number,
): Promise<InvoiceReport[]> {
  checkedReportInvoiceId(invoiceId);
  const result = await invoiceDraftCall<{
    invoice_id: number;
    reports: InvoiceReport[];
  }>('qorlia_invoice_report_list', { invoice_id: invoiceId });
  if (result?.invoice_id !== invoiceId)
    throw new Error('Invalid invoice report list.');
  return checkedInvoiceReports(result.reports);
}

function checkedInvoiceReports(reports: InvoiceReport[]): InvoiceReport[] {
  if (
    !Array.isArray(reports) ||
    reports.length > 2 ||
    reports.some(
      (report) =>
        !isInvoiceReportKey(report?.key) ||
        typeof report.name !== 'string' ||
        !report.name.trim() ||
        report.name.length > 200,
    ) ||
    new Set(reports.map((report) => report.key)).size !== reports.length
  )
    throw new Error('Invalid invoice report list.');
  return reports;
}

function checkedReportInvoiceIds(ids: number[]) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 25 ||
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Select between 1 and 25 distinct saved invoices.');
}

function sameReportInvoiceIds(actual: unknown, expected: number[]) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

export async function getInvoiceBatchReports(
  invoiceIds: number[],
): Promise<InvoiceReport[]> {
  checkedReportInvoiceIds(invoiceIds);
  const result = await invoiceDraftCall<{
    invoice_ids: number[];
    reports: InvoiceReport[];
  }>('qorlia_invoice_batch_report_list', { invoice_ids: invoiceIds });
  if (!sameReportInvoiceIds(result?.invoice_ids, invoiceIds))
    throw new Error('Invalid invoice report list.');
  return checkedInvoiceReports(result.reports);
}

export async function downloadInvoiceBatchReport(
  invoiceIds: number[],
  reportKey: InvoiceReportKey,
) {
  checkedReportInvoiceIds(invoiceIds);
  if (!isInvoiceReportKey(reportKey))
    throw new Error('Select an available invoice report.');
  const result = await invoiceDraftCall<
    PdfResponse & { invoice_ids: number[] }
  >('qorlia_invoice_batch_report_download', {
    invoice_ids: invoiceIds,
    report_key: reportKey,
  });
  return checkedPdf(
    result,
    sameReportInvoiceIds(result?.invoice_ids, invoiceIds),
    'invoice batch',
  );
}

export async function downloadInvoiceReport(
  invoiceId: number,
  reportKey: InvoiceReportKey,
): Promise<{ filename: string; blob: Blob }> {
  checkedReportInvoiceId(invoiceId);
  if (!isInvoiceReportKey(reportKey))
    throw new Error('Select an available invoice report.');
  const result = await invoiceDraftCall<{
    invoice_id: number;
    filename: string;
    mimetype: string;
    byte_count: number;
    content: string;
  }>('qorlia_invoice_report_download', {
    invoice_id: invoiceId,
    report_key: reportKey,
  });
  return checkedPdf(result, result?.invoice_id === invoiceId, 'invoice');
}

interface PdfResponse {
  filename: string;
  mimetype: string;
  byte_count: number;
  content: string;
}

export async function downloadCustomerStatement(
  invoiceId: number,
  dateFrom: string,
  dateTo: string,
) {
  checkedStatementRange(invoiceId, dateFrom, dateTo);
  const result = await invoiceDraftCall<
    PdfResponse & { invoice_id: number; date_from: string; date_to: string }
  >('qorlia_customer_statement_download', {
    invoice_id: invoiceId,
    date_from: dateFrom,
    date_to: dateTo,
  });
  return checkedPdf(
    result,
    result?.invoice_id === invoiceId &&
      result?.date_from === dateFrom &&
      result?.date_to === dateTo,
    'customer statement',
  );
}

function checkedPdf(result: PdfResponse, matchingId: boolean, label: string) {
  if (
    !matchingId ||
    result.mimetype !== 'application/pdf' ||
    typeof result.filename !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}\.pdf$/.test(result.filename) ||
    !Number.isInteger(result.byte_count) ||
    result.byte_count < 5 ||
    result.byte_count > 10 * 1024 * 1024 ||
    typeof result.content !== 'string' ||
    result.content.length !== 4 * Math.ceil(result.byte_count / 3) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(result.content)
  )
    throw new Error(`Invalid ${label} PDF response.`);
  let binary: string;
  try {
    binary = atob(result.content);
  } catch {
    throw new Error(`Invalid ${label} PDF response.`);
  }
  if (
    binary.length !== result.byte_count ||
    !binary.startsWith('%PDF-') ||
    btoa(binary) !== result.content
  )
    throw new Error(`Invalid ${label} PDF response.`);
  return {
    filename: result.filename,
    blob: new Blob(
      [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
      { type: 'application/pdf' },
    ),
  };
}

export type DocumentReportKind = 'order' | 'payment';
export type DocumentReportKey =
  | 'quotation'
  | 'proforma'
  | 'discount_summary'
  | 'payment_receipt'
  | 'receipt'
  | 'receipt_summary';
export interface DocumentReport {
  key: DocumentReportKey;
  name: string;
}

function documentReportConfig(kind: DocumentReportKind) {
  if (kind === 'order')
    return {
      model: 'sale.order',
      field: 'order_id',
      keys: ['quotation', 'proforma', 'discount_summary'],
    };
  if (kind === 'payment')
    return {
      model: 'account.payment',
      field: 'payment_id',
      keys: ['payment_receipt', 'receipt', 'receipt_summary'],
    };
  throw new Error('Select an available Billing report.');
}

async function documentReportCall<T>(
  kind: DocumentReportKind,
  id: number,
  action: 'list' | 'download',
  key?: DocumentReportKey,
): Promise<T> {
  const config = documentReportConfig(kind);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error('Select a saved Billing document before printing.');
  if (action === 'download' && (!key || !config.keys.includes(key)))
    throw new Error('Select an available Billing report.');
  const method = `qorlia_${kind}_report_${action}`;
  return rpc<T>(`/web/dataset/call_kw/${config.model}/${method}`, {
    model: config.model,
    method,
    args: [],
    kwargs: {
      [config.field]: id,
      ...(action === 'download' ? { report_key: key } : {}),
    },
  });
}

export async function getDocumentReports(
  kind: DocumentReportKind,
  id: number,
): Promise<DocumentReport[]> {
  const config = documentReportConfig(kind);
  const result = await documentReportCall<
    Record<string, unknown> & { reports: DocumentReport[] }
  >(kind, id, 'list');
  if (
    result?.[config.field] !== id ||
    !Array.isArray(result.reports) ||
    result.reports.length > config.keys.length ||
    result.reports.some(
      (report) =>
        !config.keys.includes(report?.key) ||
        typeof report.name !== 'string' ||
        !report.name.trim() ||
        report.name.length > 200,
    ) ||
    new Set(result.reports.map((report) => report.key)).size !==
      result.reports.length
  )
    throw new Error(`Invalid ${kind} report list.`);
  return result.reports;
}

export async function downloadDocumentReport(
  kind: DocumentReportKind,
  id: number,
  key: DocumentReportKey,
) {
  const config = documentReportConfig(kind);
  const result = await documentReportCall<
    PdfResponse & Record<string, unknown>
  >(kind, id, 'download', key);
  return checkedPdf(result, result?.[config.field] === id, kind);
}

const hashVersion = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dateOrFalse = (value: unknown) =>
  value === false ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));

function checkedInvoiceDraft(
  value: InvoiceDraft,
  invoiceId: number | false,
  reviewed = false,
): InvoiceDraft {
  const header = value?.values;
  const selection = (rows: unknown) =>
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        row.every((part) => typeof part === 'string'),
    );
  const stringOrFalse = (text: unknown) =>
    text === false || typeof text === 'string';
  if (
    !value ||
    !validId(value.id) ||
    value.id !== invoiceId ||
    (invoiceId === false && value.move_type !== 'out_invoice') ||
    !stringOrFalse(value.name) ||
    !['out_invoice', 'out_refund'].includes(value.move_type) ||
    !value.company ||
    !validRelation(value.company) ||
    !hashVersion(value.version) ||
    (reviewed &&
      !hashVersion(value.review_version) &&
      !(invoiceId === false && value.warning)) ||
    (value.review_version !== undefined &&
      !hashVersion(value.review_version)) ||
    !header ||
    ![
      header.partner_id,
      header.partner_shipping_id,
      header.invoice_payment_term_id,
      header.journal_id,
      header.currency_id,
      header.fiscal_position_id,
      header.invoice_user_id,
      header.partner_bank_id,
      header.invoice_incoterm_id,
      header.disc_acc_id,
      header.invoice_cash_rounding_id,
    ].every(validId) ||
    ![header.ref, header.payment_reference, header.narration].every(
      stringOrFalse,
    ) ||
    ![
      header.invoice_date,
      header.date,
      header.invoice_date_due,
      header.auto_post_until,
    ].every(dateOrFalse) ||
    !['none', 'fixed', 'percentage'].includes(header.discount_type) ||
    !['no', 'at_date', 'monthly', 'quarterly', 'yearly'].includes(
      header.auto_post,
    ) ||
    ![header.discount, header.discount_percentage].every(Number.isFinite) ||
    typeof header.to_check !== 'boolean' ||
    !Array.isArray(value.lines) ||
    value.lines.length > 500 ||
    !value.lines.every(
      (line) =>
        line &&
        validId(line.id) &&
        line.values &&
        [
          line.values.product_id,
          line.values.account_id,
          line.values.product_uom_id,
        ].every(validId) &&
        stringOrFalse(line.values.name) &&
        ['product', 'line_section', 'line_note'].includes(
          line.values.display_type,
        ) &&
        [
          line.values.sequence,
          line.values.quantity,
          line.values.price_unit,
          line.values.discount,
        ].every(Number.isFinite) &&
        Array.isArray(line.values.tax_ids) &&
        line.values.tax_ids.every((id) => Number.isInteger(id) && id > 0) &&
        (line.values.analytic_distribution === false ||
          (line.values.analytic_distribution &&
            typeof line.values.analytic_distribution === 'object' &&
            !Array.isArray(line.values.analytic_distribution) &&
            Object.entries(line.values.analytic_distribution).every(
              ([key, percentage]) =>
                /^\d+(,\d+)*$/.test(key) && Number.isFinite(percentage),
            ))) &&
        line.totals &&
        [line.totals.price_subtotal, line.totals.price_total].every(
          Number.isFinite,
        ),
    ) ||
    !value.totals ||
    ![
      value.totals.qorlia_item_subtotal,
      value.totals.amount_tax,
      value.totals.amount_total,
      value.totals.invoice_total,
      value.totals.round_off_amount,
    ].every(Number.isFinite) ||
    !value.labels ||
    typeof value.labels !== 'object' ||
    Array.isArray(value.labels) ||
    !Object.values(value.labels).every((label) => typeof label === 'string') ||
    !header.currency_id ||
    !value.labels[`res.currency:${header.currency_id}`] ||
    !(
      value.warning === false ||
      (value.warning && typeof value.warning.message === 'string')
    ) ||
    !Array.isArray(value.generated_adjustments) ||
    !value.generated_adjustments.every(
      (row) =>
        row &&
        typeof row.kind === 'string' &&
        typeof row.name === 'string' &&
        Number.isFinite(row.amount),
    ) ||
    !value.selections ||
    !selection(value.selections.discount_type) ||
    !selection(value.selections.auto_post) ||
    typeof value.journal_locked !== 'boolean' ||
    typeof value.can_edit !== 'boolean'
  )
    throw new Error('Invalid invoice draft response. Reload the editor.');
  return value;
}

const invoiceDraftPayload = ({ id, version, values, lines }: InvoiceDraft) => ({
  id,
  version,
  values,
  lines,
});
export const getInvoiceDraft = async (invoiceId: number | false) =>
  checkedInvoiceDraft(
    await invoiceDraftCall<InvoiceDraft>('qorlia_invoice_draft_load', {
      invoice_id: invoiceId,
    }),
    invoiceId,
  );
export const previewInvoiceDraft = async (
  draft: InvoiceDraft,
  change: { field: string; line?: number },
) =>
  checkedInvoiceDraft(
    await invoiceDraftCall<InvoiceDraft>('qorlia_invoice_draft_preview', {
      payload: invoiceDraftPayload(draft),
      change,
    }),
    draft.id,
    true,
  );
export const saveInvoiceDraft = async (
  draft: InvoiceDraft,
  requestKey?: string,
) => {
  if (!hashVersion(draft.review_version))
    throw new Error('Recalculate this draft before saving.');
  if (
    draft.id === false &&
    (!requestKey ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        requestKey,
      ))
  )
    throw new Error('A valid invoice save request identifier is required.');
  const result = await invoiceDraftCall<InvoiceDraft>(
    'qorlia_invoice_draft_save',
    {
      payload: invoiceDraftPayload(draft),
      review_version: draft.review_version,
      ...(draft.id === false ? { request_key: requestKey } : {}),
    },
  );
  if (
    draft.id === false &&
    (!result?.id ||
      !validId(result.id) ||
      result.move_type !== 'out_invoice' ||
      result.company?.[0] !== draft.company[0])
  )
    throw new Error(
      'Invalid new invoice response. Check the invoice list before starting again.',
    );
  return checkedInvoiceDraft(result, draft.id === false ? result.id : draft.id);
};
export const getInvoiceDraftChoices = async (
  invoiceId: number | false,
  kind: InvoiceDraftChoiceKind,
  search: string,
  productId: number | false = false,
) => {
  const result = await invoiceDraftCall<[number, string][]>(
    'qorlia_invoice_draft_choices',
    {
      invoice_id: invoiceId,
      kind,
      search,
      product_id: productId,
    },
  );
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    !result.every((row) => row && validRelation(row))
  )
    throw new Error('Invalid invoice choices response.');
  return result;
};

export interface CorrectionWorkflow {
  invoice: InvoiceWorkflow;
  version: string;
  can_reset: boolean;
  can_cancel: boolean;
  posted_before: boolean;
  allocations: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    is_exchange: boolean;
  }[];
}

export const getCorrectionWorkflow = async (invoiceId: number) => {
  const value = await rpc<CorrectionWorkflow>(
    '/web/dataset/call_kw/account.move/qorlia_correction_load',
    {
      model: 'account.move',
      method: 'qorlia_correction_load',
      args: [],
      kwargs: { invoice_id: invoiceId },
    },
  );
  if (
    !value ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    typeof value.can_reset !== 'boolean' ||
    typeof value.can_cancel !== 'boolean' ||
    typeof value.posted_before !== 'boolean' ||
    !Array.isArray(value.allocations) ||
    value.allocations.length > 200 ||
    value.allocations.some(
      (row) =>
        !row ||
        !Number.isInteger(row.id) ||
        row.id <= 0 ||
        typeof row.name !== 'string' ||
        typeof row.date !== 'string' ||
        !Number.isFinite(row.amount) ||
        row.amount < 0 ||
        !Array.isArray(row.currency) ||
        !validRelation(row.currency) ||
        typeof row.is_exchange !== 'boolean',
    )
  )
    throw new Error('Invalid correction review. Reload the current status.');
  checkedInvoiceWorkflow(value.invoice);
  if (value.invoice.id !== invoiceId)
    throw new Error('The correction review belongs to another invoice.');
  return value;
};

export const runCorrectionWorkflow = async (
  review: CorrectionWorkflow,
  action: 'reset' | 'cancel',
) => {
  const result = await invoiceWorkflowCall('qorlia_correction_run', {
    invoice_id: review.invoice.id,
    version: review.version,
    action,
  });
  if (result.id !== review.invoice.id)
    throw new Error(
      'The correction result belongs to another invoice. Reload its current status.',
    );
  return result;
};

export interface ReversalValues {
  date_mode: 'custom' | 'entry';
  date: string | false;
  reason: string | false;
  refund_method: 'refund' | 'cancel' | 'modify';
  journal_id: number | false;
}

export interface ReversalWorkflow {
  invoice: InvoiceWorkflow;
  can_reverse: boolean;
  reason: string | false;
  values: ReversalValues | false;
  source_version: string | false;
  version: string | false;
  journals: [number, string][];
  methods: [ReversalValues['refund_method'], string][];
  effective_date: string | false;
  scheduled: boolean;
  history: InvoiceWorkflow[];
}

export interface ReversalResult {
  invoice: InvoiceWorkflow;
  credits: InvoiceWorkflow[];
  replacements: InvoiceWorkflow[];
  scheduled: boolean;
  effective_date: string;
}

const reversalCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/account.move/${method}`, {
    model: 'account.move',
    method,
    args: [],
    kwargs,
  });

function checkedReversal(value: ReversalWorkflow, invoiceId: number) {
  const version = (input: unknown) =>
    input === false ||
    (typeof input === 'string' && /^[a-f0-9]{64}$/.test(input));
  const text = (input: unknown) => input === false || typeof input === 'string';
  if (
    !value ||
    typeof value.can_reverse !== 'boolean' ||
    !text(value.reason) ||
    !version(value.version) ||
    !version(value.source_version) ||
    !text(value.effective_date) ||
    typeof value.scheduled !== 'boolean' ||
    !Array.isArray(value.journals) ||
    !value.journals.every((row) => Array.isArray(row) && validRelation(row)) ||
    !Array.isArray(value.methods) ||
    !value.methods.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        ['refund', 'cancel', 'modify'].includes(row[0]) &&
        typeof row[1] === 'string',
    ) ||
    !Array.isArray(value.history) ||
    value.history.length > 100
  )
    throw new Error('Invalid credit-note review. Reload the current status.');
  checkedInvoiceWorkflow(value.invoice);
  if (value.invoice.id !== invoiceId)
    throw new Error('The credit-note review belongs to another invoice.');
  value.history.forEach(checkedInvoiceWorkflow);
  if (
    value.values !== false &&
    (!value.values ||
      !['custom', 'entry'].includes(value.values.date_mode) ||
      !['refund', 'cancel', 'modify'].includes(value.values.refund_method) ||
      !text(value.values.date) ||
      !text(value.values.reason) ||
      !(
        value.values.journal_id === false ||
        (Number.isInteger(value.values.journal_id) &&
          value.values.journal_id > 0)
      ))
  )
    throw new Error(
      'Invalid native credit-note options. Reload the current status.',
    );
  if (
    value.can_reverse &&
    (!value.values ||
      !value.version ||
      !value.source_version ||
      !value.effective_date ||
      !value.journals.some(
        ([id]) => value.values && id === value.values.journal_id,
      ) ||
      !value.methods.some(
        ([method]) => value.values && method === value.values.refund_method,
      ))
  )
    throw new Error('The credit-note review has no eligible native options.');
  return value;
}

export const getReversalWorkflow = async (invoiceId: number) =>
  checkedReversal(
    await reversalCall<ReversalWorkflow>('qorlia_reversal_load', {
      invoice_id: invoiceId,
    }),
    invoiceId,
  );

export const previewReversalWorkflow = async (
  review: ReversalWorkflow,
  values: ReversalValues,
) =>
  checkedReversal(
    await reversalCall<ReversalWorkflow>('qorlia_reversal_preview', {
      invoice_id: review.invoice.id,
      source_version: review.source_version,
      values,
    }),
    review.invoice.id,
  );

export const runReversalWorkflow = async (review: ReversalWorkflow) => {
  const result = await reversalCall<ReversalResult>('qorlia_reversal_run', {
    invoice_id: review.invoice.id,
    version: review.version,
    values: review.values,
  });
  if (
    !result ||
    !Array.isArray(result.credits) ||
    result.credits.length !== 1 ||
    !Array.isArray(result.replacements) ||
    result.replacements.length !==
      (review.values && review.values.refund_method === 'modify' ? 1 : 0) ||
    typeof result.scheduled !== 'boolean' ||
    typeof result.effective_date !== 'string'
  )
    throw new Error(
      'Invalid credit-note result. Reload Billing before trying again.',
    );
  checkedInvoiceWorkflow(result.invoice);
  result.credits.forEach(checkedInvoiceWorkflow);
  result.replacements.forEach(checkedInvoiceWorkflow);
  if (
    result.invoice.id !== review.invoice.id ||
    result.credits.some((move) => move.move_type !== 'out_refund') ||
    result.replacements.some((move) => move.move_type !== 'out_invoice')
  )
    throw new Error(
      'The credit-note result has unexpected documents. Reload Billing before trying again.',
    );
  const expectedState =
    result.scheduled ||
    (review.values && review.values.refund_method === 'refund')
      ? 'draft'
      : 'posted';
  if (
    result.scheduled !== review.scheduled ||
    result.effective_date !== review.effective_date ||
    !result.invoice.ledger_balanced ||
    result.credits.some(
      (move) =>
        move.id === review.invoice.id ||
        move.state !== expectedState ||
        !move.ledger_balanced,
    ) ||
    result.replacements.some(
      (move) => move.state !== 'draft' || !move.ledger_balanced,
    )
  )
    throw new Error(
      'The saved credit-note status differs from the review. Reload Billing before trying again.',
    );
  return result;
};

export interface CreditWorkflow {
  invoice: InvoiceWorkflow;
  version: string;
  credits: {
    id: number;
    source_id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    can_apply: boolean;
  }[];
  history: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency: [number, string];
    is_exchange: boolean;
    can_remove: boolean;
  }[];
}

const creditCall = async (method: string, kwargs: object) => {
  const value = await rpc<CreditWorkflow>(
    `/web/dataset/call_kw/account.move/${method}`,
    { model: 'account.move', method, args: [], kwargs },
  );
  if (!value?.invoice)
    throw new Error(
      'Invalid credit allocation response. Reload current status.',
    );
  checkedInvoiceWorkflow(value.invoice);
  const validRow = (row: CreditWorkflow['history'][number]) =>
    row &&
    Number.isInteger(row.id) &&
    row.id > 0 &&
    typeof row.name === 'string' &&
    typeof row.date === 'string' &&
    Number.isFinite(row.amount) &&
    row.amount >= 0 &&
    Array.isArray(row.currency) &&
    validRelation(row.currency);
  if (
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !Array.isArray(value.credits) ||
    !Array.isArray(value.history) ||
    !value.credits.every(
      (row) =>
        validRow({ ...row, is_exchange: false, can_remove: false }) &&
        Number.isInteger(row.source_id) &&
        row.source_id > 0 &&
        typeof row.can_apply === 'boolean' &&
        (!row.can_apply ||
          (value.invoice.ledger_balanced &&
            value.invoice.state === 'posted' &&
            value.invoice.open_amount > 0)),
    ) ||
    !value.history.every(
      (row) =>
        validRow(row) &&
        typeof row.is_exchange === 'boolean' &&
        typeof row.can_remove === 'boolean' &&
        (!row.can_remove ||
          (!row.is_exchange &&
            value.invoice.ledger_balanced &&
            value.invoice.state === 'posted')),
    )
  )
    throw new Error(
      'Invalid credit allocation response. Reload current status.',
    );
  return value;
};

export const getCreditWorkflow = (invoiceId: number) =>
  creditCall('qorlia_credit_load', { invoice_id: invoiceId });

export const applyCreditWorkflow = (review: CreditWorkflow, lineId: number) =>
  creditCall('qorlia_credit_apply', {
    invoice_id: review.invoice.id,
    line_id: lineId,
    version: review.version,
  });

export const removeCreditWorkflow = (
  review: CreditWorkflow,
  partialId: number,
) =>
  creditCall('qorlia_credit_remove', {
    invoice_id: review.invoice.id,
    partial_id: partialId,
    version: review.version,
  });

export interface PaymentValues {
  journal_id: number | false;
  payment_method_line_id: number | false;
  currency_id: number | false;
  partner_bank_id: number | false;
  amount: number;
  payment_date: string;
  communication: string | false;
  payment_difference_handling: 'open' | 'reconcile';
  writeoff_account_id: number | false;
  writeoff_label: string | false;
  bank_reference: string | false;
  cheque_reference: string | false;
  effective_date: string | false;
}

export interface PaymentWorkflow {
  invoice: InvoiceWorkflow;
  values: PaymentValues | false;
  version: string | false;
  can_record: boolean;
  reason: string | false;
  currency: [number, string];
  payment_type: 'inbound' | 'outbound' | false;
  method_code: string | false;
  difference: number;
  journals: [number, string][];
  methods: [number, string][];
  currencies: [number, string][];
  banks: [number, string][];
  accounts: [number, string][];
  payments: {
    id: number;
    name: string;
    date: string;
    amount: number;
    currency_id: [number, string];
    journal_id: [number, string];
    journal_type: string;
    is_matched: boolean;
    state: string;
    payment_type: 'inbound' | 'outbound';
    ref: string | false;
    bank_reference: string | false;
    cheque_reference: string | false;
    effective_date: string | false;
    method_code: string | false;
  }[];
}

const paymentCall = async (method: string, kwargs: object) => {
  const value = await rpc<PaymentWorkflow>(
    `/web/dataset/call_kw/account.move/${method}`,
    { model: 'account.move', method, args: [], kwargs },
  );
  if (!value?.invoice)
    throw new Error(
      'Invalid native payment response. Reload the current status.',
    );
  checkedInvoiceWorkflow(value.invoice);
  const choices = [
    value.journals,
    value.methods,
    value.currencies,
    value.banks,
    value.accounts,
  ];
  const data = value.values;
  if (
    typeof value.can_record !== 'boolean' ||
    !(value.reason === false || typeof value.reason === 'string') ||
    !validRelation(value.currency) ||
    !Array.isArray(value.currency) ||
    ![false, 'inbound', 'outbound'].includes(value.payment_type) ||
    !(value.method_code === false || typeof value.method_code === 'string') ||
    !Number.isFinite(value.difference) ||
    !(
      value.version === false ||
      (typeof value.version === 'string' &&
        /^[a-f0-9]{64}$/.test(value.version))
    ) ||
    !choices.every(
      (rows) =>
        Array.isArray(rows) &&
        rows.every((row) => Array.isArray(row) && validRelation(row)),
    ) ||
    !(
      data === false ||
      (data &&
        [
          'journal_id',
          'payment_method_line_id',
          'currency_id',
          'partner_bank_id',
          'writeoff_account_id',
        ].every((field) => {
          const id = data[field as keyof PaymentValues];
          return (
            id === false ||
            (typeof id === 'number' && Number.isInteger(id) && id > 0)
          );
        }) &&
        Number.isFinite(data.amount) &&
        validDate(data.payment_date) &&
        (data.effective_date === false || validDate(data.effective_date)) &&
        ['open', 'reconcile'].includes(data.payment_difference_handling) &&
        [
          'communication',
          'writeoff_label',
          'bank_reference',
          'cheque_reference',
        ].every(
          (field) =>
            data[field as keyof PaymentValues] === false ||
            (typeof data[field as keyof PaymentValues] === 'string' &&
              (data[field as keyof PaymentValues] as string).length <= 500),
        ))
    ) ||
    (value.can_record &&
      (!data ||
        !value.version ||
        !value.invoice.ledger_balanced ||
        value.invoice.state !== 'posted' ||
        !['manual', 'check_printing', 'pdc'].includes(
          value.method_code || '',
        ) ||
        (value.method_code === 'pdc' && !data.effective_date))) ||
    !Array.isArray(value.payments) ||
    !value.payments.every(
      (payment) =>
        payment &&
        Number.isInteger(payment.id) &&
        payment.id > 0 &&
        typeof payment.name === 'string' &&
        validDate(payment.date) &&
        Number.isFinite(payment.amount) &&
        validRelation(payment.currency_id) &&
        Array.isArray(payment.currency_id) &&
        validRelation(payment.journal_id) &&
        Array.isArray(payment.journal_id) &&
        typeof payment.journal_type === 'string' &&
        typeof payment.is_matched === 'boolean' &&
        typeof payment.state === 'string' &&
        ['inbound', 'outbound'].includes(payment.payment_type) &&
        (payment.ref === false || typeof payment.ref === 'string') &&
        (payment.method_code === false ||
          typeof payment.method_code === 'string') &&
        (payment.effective_date === false ||
          validDate(payment.effective_date)) &&
        ['bank_reference', 'cheque_reference'].every((field) => {
          const text = payment[field as 'bank_reference' | 'cheque_reference'];
          return text === false || typeof text === 'string';
        }),
    )
  )
    throw new Error(
      'Invalid native payment response. Reload the current status.',
    );
  return value;
};

export const getPaymentWorkflow = (invoiceId: number) =>
  paymentCall('qorlia_payment_load', { invoice_id: invoiceId });

export const previewPaymentWorkflow = (
  invoice: InvoiceWorkflow,
  values: PaymentValues,
  changed:
    | false
    | 'journal_id'
    | 'payment_method_line_id'
    | 'currency_id'
    | 'payment_date' = false,
) =>
  paymentCall('qorlia_payment_preview', {
    invoice_id: invoice.id,
    invoice_version: invoice.version,
    values,
    changed,
  });

export const recordPaymentWorkflow = (review: PaymentWorkflow) =>
  paymentCall('qorlia_payment_record', {
    invoice_id: review.invoice.id,
    version: review.version,
    values: review.values,
  });

export interface ChequeWorkflow {
  payment_id: number;
  name: string;
  version: string;
  amount: number;
  currency: [number, string];
  journal: string;
  manual_sequencing: boolean;
  check_number: string | false;
  sent: boolean;
  bank_matched: boolean;
  can_print: boolean;
  reason: string | false;
  layout: string | false;
  number_to_print?: string;
  review_version?: string;
}

export interface ChequeRequest {
  payment_id: number;
  version: string;
  review_version: string;
  check_number: string | false;
  request_key: string;
}

const chequeCall = <T>(method: string, kwargs: object) =>
  rpc<T>(`/web/dataset/call_kw/account.payment/${method}`, {
    model: 'account.payment',
    method,
    args: [],
    kwargs,
  });

const chequeNumber = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9]{1,19}$/.test(value) &&
  (value.length < 19 || value <= '9223372036854775807');

export function checkedChequeRequest(value: ChequeRequest): ChequeRequest {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'check_number,payment_id,request_key,review_version,version' ||
    !Number.isSafeInteger(value.payment_id) ||
    value.payment_id <= 0 ||
    ![value.version, value.review_version].every(
      (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
    ) ||
    typeof value.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value.request_key,
    ) ||
    !(value.check_number === false || chequeNumber(value.check_number))
  )
    throw new Error(
      'Invalid cheque request. Check the saved payment before printing again.',
    );
  return value;
}

function checkedCheque(
  value: ChequeWorkflow,
  paymentId: number,
): ChequeWorkflow {
  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0 ||
    value?.payment_id !== paymentId ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !Number.isFinite(value.amount) ||
    value.amount < 0 ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    typeof value.journal !== 'string' ||
    ![
      value.manual_sequencing,
      value.sent,
      value.bank_matched,
      value.can_print,
    ].every((item) => typeof item === 'boolean') ||
    !(value.check_number === false || chequeNumber(value.check_number)) ||
    !(value.reason === false || typeof value.reason === 'string') ||
    !(value.layout === false || typeof value.layout === 'string') ||
    (value.can_print && (value.sent || !value.layout || value.reason))
  )
    throw new Error('Invalid cheque status. Reload the saved payment.');
  return value;
}

export async function getChequeWorkflow(paymentId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0)
    throw new Error('Select a saved cheque payment.');
  return checkedCheque(
    await chequeCall<ChequeWorkflow>('qorlia_cheque_load', {
      payment_id: paymentId,
    }),
    paymentId,
  );
}

export async function previewChequeWorkflow(
  payment: ChequeWorkflow,
  number: string | false,
) {
  checkedCheque(payment, payment.payment_id);
  if (!payment.can_print || !(number === false || chequeNumber(number)))
    throw new Error('Enter and review a valid cheque number.');
  const result = checkedCheque(
    await chequeCall<ChequeWorkflow>('qorlia_cheque_preview', {
      payment_id: payment.payment_id,
      version: payment.version,
      check_number: number,
    }),
    payment.payment_id,
  );
  if (
    result.version !== payment.version ||
    !chequeNumber(result.number_to_print) ||
    result.number_to_print !==
      (number === false ? payment.check_number : number) ||
    typeof result.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.review_version)
  )
    throw new Error('Invalid cheque review. Reload before printing.');
  return result;
}

export async function printChequeWorkflow(request: ChequeRequest) {
  checkedChequeRequest(request);
  const result = await chequeCall<{
    payment: ChequeWorkflow;
    pdf: PdfResponse & { payment_id: number };
  }>('qorlia_cheque_print', request);
  const payment = checkedCheque(result?.payment, request.payment_id);
  if (
    !payment.sent ||
    payment.can_print ||
    !payment.check_number ||
    (request.check_number !== false &&
      payment.check_number !== request.check_number)
  )
    throw new Error(
      'Cheque response does not match the reviewed number. Check status before another print.',
    );
  return {
    payment,
    pdf: checkedPdf(
      result.pdf,
      result.pdf?.payment_id === request.payment_id,
      'cheque',
    ),
  };
}

export async function getChequeStatus(request: ChequeRequest) {
  checkedChequeRequest(request);
  const result = await chequeCall<{
    accepted: boolean;
    payment: ChequeWorkflow;
  }>('qorlia_cheque_status', request);
  if (!result || typeof result.accepted !== 'boolean')
    throw new Error('Cheque request status is unavailable.');
  return {
    accepted: result.accepted,
    payment: checkedCheque(result.payment, request.payment_id),
  };
}

export async function downloadCheque(request: ChequeRequest) {
  checkedChequeRequest(request);
  const pdf = await chequeCall<PdfResponse & { payment_id: number }>(
    'qorlia_cheque_download',
    request,
  );
  return checkedPdf(pdf, pdf?.payment_id === request.payment_id, 'cheque');
}

export async function downloadCurrentCheque(paymentId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0)
    throw new Error('Select a saved cheque payment.');
  const pdf = await chequeCall<PdfResponse & { payment_id: number }>(
    'qorlia_cheque_download_current',
    { payment_id: paymentId },
  );
  return checkedPdf(pdf, pdf?.payment_id === paymentId, 'cheque');
}

export type ChequeSentAction = 'mark_sent' | 'unmark_sent';
export interface ChequeSentWorkflow {
  payment_id: number;
  name: string;
  amount: number;
  currency: [number, string];
  journal: string;
  check_number: string | false;
  sent: boolean;
  bank_matched: boolean;
  can_update: boolean;
  reason: string | false;
  version: string;
  action?: ChequeSentAction;
  review_version?: string;
}
export interface ChequeSentRequest {
  payment_id: number;
  version: string;
  review_version: string;
  request_key: string;
  action: ChequeSentAction;
}
export function checkedChequeSentRequest(value: ChequeSentRequest) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'action,payment_id,request_key,review_version,version' ||
    !['mark_sent', 'unmark_sent'].includes(value.action)
  )
    throw new Error(
      'Invalid cheque sent-status request. Check the saved payment.',
    );
  checkedChequeRequest({
    payment_id: value.payment_id,
    version: value.version,
    review_version: value.review_version,
    request_key: value.request_key,
    check_number: false,
  });
  return value;
}
function checkedChequeSent(value: ChequeSentWorkflow, paymentId: number) {
  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0 ||
    value?.payment_id !== paymentId ||
    typeof value.name !== 'string' ||
    typeof value.journal !== 'string' ||
    !Number.isFinite(value.amount) ||
    value.amount < 0 ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    !(value.check_number === false || chequeNumber(value.check_number)) ||
    ![value.sent, value.bank_matched, value.can_update].every(
      (item) => typeof item === 'boolean',
    ) ||
    !(value.reason === false || typeof value.reason === 'string') ||
    (value.can_update && !!value.reason) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version)
  )
    throw new Error('Invalid cheque sent status. Reload the saved payment.');
  return value;
}
export async function getChequeSentWorkflow(paymentId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0)
    throw new Error('Select a saved cheque payment.');
  return checkedChequeSent(
    await chequeCall<ChequeSentWorkflow>('qorlia_cheque_sent_load', {
      payment_id: paymentId,
    }),
    paymentId,
  );
}
export async function previewChequeSentWorkflow(
  payment: ChequeSentWorkflow,
  action: ChequeSentAction,
) {
  checkedChequeSent(payment, payment.payment_id);
  if (
    !payment.can_update ||
    !['mark_sent', 'unmark_sent'].includes(action) ||
    payment.sent === (action === 'mark_sent')
  )
    throw new Error('Select an available cheque sent-status action.');
  const reviewed = checkedChequeSent(
    await chequeCall<ChequeSentWorkflow>('qorlia_cheque_sent_preview', {
      payment_id: payment.payment_id,
      version: payment.version,
      action,
    }),
    payment.payment_id,
  );
  if (
    reviewed.version !== payment.version ||
    reviewed.action !== action ||
    !reviewed.can_update ||
    reviewed.sent !== payment.sent ||
    (
      [
        'name',
        'amount',
        'currency',
        'journal',
        'check_number',
        'bank_matched',
      ] as const
    ).some(
      (field) =>
        JSON.stringify(reviewed[field]) !== JSON.stringify(payment[field]),
    ) ||
    typeof reviewed.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(reviewed.review_version)
  )
    throw new Error('Invalid cheque sent-status review. Reload before saving.');
  return reviewed;
}
async function chequeSentResult(method: string, request: ChequeSentRequest) {
  checkedChequeSentRequest(request);
  const result = await chequeCall<{
    accepted: boolean;
    action: ChequeSentAction;
    payment: ChequeSentWorkflow;
  }>(method, request);
  if (
    typeof result?.accepted !== 'boolean' ||
    result.action !== request.action ||
    (method === 'qorlia_cheque_sent_run' && !result.accepted)
  )
    throw new Error(
      'Cheque sent-status response is unavailable. Check the request status.',
    );
  return {
    ...result,
    payment: checkedChequeSent(result.payment, request.payment_id),
  };
}
export const saveChequeSentWorkflow = (request: ChequeSentRequest) =>
  chequeSentResult('qorlia_cheque_sent_run', request);
export const getChequeSentRequestStatus = (request: ChequeSentRequest) =>
  chequeSentResult('qorlia_cheque_sent_status', request);

export interface ChequeVoidWorkflow {
  payment_id: number;
  name: string;
  amount: number;
  currency: [number, string];
  state: string;
  check_number: string | false;
  sent: boolean;
  bank_matched: boolean;
  can_void: boolean;
  reason: string | false;
  documents: {
    id: number;
    name: string;
    type: string;
    state: string;
    total: number;
    open_amount: number;
    currency: [number, string];
  }[];
  version: string;
  review_version?: string;
}
export type ChequeVoidRequest = Omit<ChequeSentRequest, 'action'>;
export function checkedChequeVoidRequest(value: ChequeVoidRequest) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'payment_id,request_key,review_version,version'
  )
    throw new Error(
      'Invalid cheque void request. Ask your Billing administrator to check it.',
    );
  checkedChequeRequest({ ...value, check_number: false });
  return value;
}
function checkedChequeVoid(value: ChequeVoidWorkflow, paymentId: number) {
  if (
    !Number.isSafeInteger(paymentId) ||
    paymentId <= 0 ||
    value?.payment_id !== paymentId ||
    typeof value.name !== 'string' ||
    !Number.isFinite(value.amount) ||
    value.amount < 0 ||
    !Array.isArray(value.currency) ||
    !validRelation(value.currency) ||
    !['draft', 'posted', 'cancel'].includes(value.state) ||
    !(value.check_number === false || chequeNumber(value.check_number)) ||
    ![value.sent, value.bank_matched, value.can_void].every(
      (item) => typeof item === 'boolean',
    ) ||
    !(value.reason === false || typeof value.reason === 'string') ||
    (value.can_void &&
      (value.reason || value.state !== 'posted' || !value.sent)) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.version) ||
    !Array.isArray(value.documents) ||
    value.documents.length > 1000 ||
    new Set(value.documents.map((row) => row?.id)).size !==
      value.documents.length ||
    value.documents.some(
      (row) =>
        !Number.isSafeInteger(row?.id) ||
        row.id <= 0 ||
        typeof row.name !== 'string' ||
        typeof row.type !== 'string' ||
        !['draft', 'posted', 'cancel'].includes(row.state) ||
        !Number.isFinite(row.total) ||
        !Number.isFinite(row.open_amount) ||
        !Array.isArray(row.currency) ||
        !validRelation(row.currency),
    )
  )
    throw new Error(
      'Invalid cheque void status. Reload before reviewing its allocations.',
    );
  return value;
}
export async function getChequeVoidWorkflow(paymentId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0)
    throw new Error('Select a saved cheque payment.');
  return checkedChequeVoid(
    await chequeCall<ChequeVoidWorkflow>('qorlia_cheque_void_load', {
      payment_id: paymentId,
    }),
    paymentId,
  );
}
export async function previewChequeVoidWorkflow(payment: ChequeVoidWorkflow) {
  checkedChequeVoid(payment, payment.payment_id);
  if (!payment.can_void)
    throw new Error(
      'This cheque cannot be voided in its current native state.',
    );
  const reviewed = checkedChequeVoid(
    await chequeCall<ChequeVoidWorkflow>('qorlia_cheque_void_preview', {
      payment_id: payment.payment_id,
      version: payment.version,
    }),
    payment.payment_id,
  );
  if (
    !reviewed.can_void ||
    reviewed.version !== payment.version ||
    (
      [
        'name',
        'amount',
        'currency',
        'state',
        'check_number',
        'sent',
        'bank_matched',
        'documents',
      ] as const
    ).some(
      (field) =>
        JSON.stringify(reviewed[field]) !== JSON.stringify(payment[field]),
    ) ||
    typeof reviewed.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(reviewed.review_version)
  )
    throw new Error(
      'The cheque void review changed. Reload its connected documents.',
    );
  return reviewed;
}
async function chequeVoidResult(method: string, request: ChequeVoidRequest) {
  checkedChequeVoidRequest(request);
  const result = await chequeCall<{
    accepted: boolean;
    payment: ChequeVoidWorkflow;
  }>(method, request);
  if (
    typeof result?.accepted !== 'boolean' ||
    (method === 'qorlia_cheque_void_run' && !result.accepted)
  )
    throw new Error(
      'Cheque void response unavailable. Check the exact request status.',
    );
  return {
    ...result,
    payment: checkedChequeVoid(result.payment, request.payment_id),
  };
}
export const saveChequeVoidWorkflow = (request: ChequeVoidRequest) =>
  chequeVoidResult('qorlia_cheque_void_run', request);
export const getChequeVoidRequestStatus = (request: ChequeVoidRequest) =>
  chequeVoidResult('qorlia_cheque_void_status', request);

export type PaymentStateAction = 'post' | 'reset' | 'cancel';
export interface CustomerPaymentRow {
  payment_id: number;
  name: string;
  date: string;
  customer: string;
  amount: number;
  currency: [number, string];
  journal: string;
  method: string;
  direction: 'inbound' | 'outbound';
  state: 'draft' | 'posted' | 'cancel';
  reference: string;
}
export interface PaymentStateWorkflow
  extends Omit<ChequeVoidWorkflow, 'can_void' | 'reason'> {
  state: 'draft' | 'posted' | 'cancel';
  date: string;
  effective_date: string | false;
  customer: string;
  journal: string;
  method: string;
  auto_allocate: boolean;
  reasons: Record<PaymentStateAction, string | false>;
  action?: PaymentStateAction;
}
export interface PaymentStateRequest extends ChequeVoidRequest {
  action: PaymentStateAction;
}
const paymentActions: PaymentStateAction[] = ['post', 'reset', 'cancel'];
const paymentDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
export function checkedPaymentStateRequest(value: PaymentStateRequest) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'action,payment_id,request_key,review_version,version' ||
    !paymentActions.includes(value.action)
  )
    throw new Error(
      'Invalid payment recovery request. Ask your Billing administrator to review it.',
    );
  checkedChequeVoidRequest({
    payment_id: value.payment_id,
    version: value.version,
    review_version: value.review_version,
    request_key: value.request_key,
  });
  return value;
}
function checkedPaymentState(value: PaymentStateWorkflow, paymentId: number) {
  checkedChequeVoid({ ...value, can_void: false, reason: false }, paymentId);
  if (
    !paymentDate(value.date) ||
    !(value.effective_date === false || paymentDate(value.effective_date)) ||
    ![value.customer, value.journal, value.method].every(
      (item) => typeof item === 'string',
    ) ||
    typeof value.auto_allocate !== 'boolean' ||
    !value.reasons ||
    Object.keys(value.reasons).sort().join(',') !== 'cancel,post,reset' ||
    paymentActions.some(
      (action) =>
        !(
          value.reasons[action] === false ||
          typeof value.reasons[action] === 'string'
        ),
    ) ||
    (value.state !== 'draft' &&
      (!value.reasons.post || !value.reasons.cancel)) ||
    (value.state === 'draft' && !value.reasons.reset)
  )
    throw new Error(
      'Invalid native payment state. Reload before another action.',
    );
  return value;
}
export async function getCustomerPaymentHistory(
  search: string,
  offset = 0,
  state = 'all',
) {
  if (
    typeof search !== 'string' ||
    search.length > 160 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 2147483647 ||
    !['all', 'draft', 'posted', 'cancel'].includes(state)
  )
    throw new Error('Use a valid customer payment search and page.');
  const result = await chequeCall<{
    rows: CustomerPaymentRow[];
    offset: number;
    has_more: boolean;
  }>('qorlia_payment_history', { search, offset, state });
  if (
    result?.offset !== offset ||
    typeof result.has_more !== 'boolean' ||
    !Array.isArray(result.rows) ||
    result.rows.length > 25 ||
    new Set(result.rows.map((row) => row?.payment_id)).size !==
      result.rows.length ||
    result.rows.some(
      (row) =>
        !Number.isSafeInteger(row?.payment_id) ||
        row.payment_id <= 0 ||
        !paymentDate(row.date) ||
        ![row.name, row.customer, row.journal, row.method, row.reference].every(
          (item) => typeof item === 'string',
        ) ||
        !Number.isFinite(row.amount) ||
        row.amount < 0 ||
        !Array.isArray(row.currency) ||
        !validRelation(row.currency) ||
        !['draft', 'posted', 'cancel'].includes(row.state) ||
        !['inbound', 'outbound'].includes(row.direction),
    )
  )
    throw new Error(
      'Invalid payment history. Reload before reviewing a payment.',
    );
  return result;
}
export async function getPaymentStateWorkflow(paymentId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0)
    throw new Error('Select a saved customer payment.');
  return checkedPaymentState(
    await chequeCall<PaymentStateWorkflow>('qorlia_payment_state_load', {
      payment_id: paymentId,
    }),
    paymentId,
  );
}
export async function previewPaymentStateWorkflow(
  payment: PaymentStateWorkflow,
  action: PaymentStateAction,
) {
  checkedPaymentState(payment, payment.payment_id);
  if (!paymentActions.includes(action) || payment.reasons[action])
    throw new Error(
      'This native payment action is unavailable. Reload its state.',
    );
  const reviewed = checkedPaymentState(
    await chequeCall<PaymentStateWorkflow>('qorlia_payment_state_preview', {
      payment_id: payment.payment_id,
      version: payment.version,
      action,
    }),
    payment.payment_id,
  );
  if (
    Object.keys(payment)
      .filter((field) => field !== 'action' && field !== 'review_version')
      .some(
        (field) =>
          JSON.stringify(reviewed[field as keyof PaymentStateWorkflow]) !==
          JSON.stringify(payment[field as keyof PaymentStateWorkflow]),
      ) ||
    reviewed.action !== action ||
    typeof reviewed.review_version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(reviewed.review_version)
  )
    throw new Error('The payment review changed. Reload before confirming.');
  return reviewed;
}
async function paymentStateResult(
  method: string,
  request: PaymentStateRequest,
) {
  checkedPaymentStateRequest(request);
  const result = await chequeCall<{
    accepted: boolean;
    action: PaymentStateAction;
    payment: PaymentStateWorkflow;
  }>(method, request);
  if (
    typeof result?.accepted !== 'boolean' ||
    result.action !== request.action ||
    (method === 'qorlia_payment_state_run' && !result.accepted)
  )
    throw new Error(
      'Payment response unavailable. Check this exact request before another action.',
    );
  return {
    ...result,
    payment: checkedPaymentState(result.payment, request.payment_id),
  };
}
export const savePaymentStateWorkflow = (request: PaymentStateRequest) =>
  paymentStateResult('qorlia_payment_state_run', request);
export const getPaymentStateRequestStatus = (request: PaymentStateRequest) =>
  paymentStateResult('qorlia_payment_state_status', request);

export interface CustomerPaymentDraftValues {
  partner_id: number | false;
  company_id: number;
  payment_type: 'inbound' | 'outbound';
  amount: number;
  date: string;
  journal_id: number | false;
  payment_method_line_id: number | false;
  currency_id: number | false;
  partner_bank_id: number | false;
  ref: string | false;
  payment_reference: string | false;
  bank_reference: string | false;
  cheque_reference: string | false;
  effective_date: string | false;
}
export interface CustomerPaymentDraftPayload {
  id: number | false;
  version: string | false;
  values: CustomerPaymentDraftValues;
}
export interface CustomerPaymentAllocation {
  invoice_id: number;
  name: string;
  date: string | false;
  care_setting: string | false;
  invoice_amount: number;
  allocated_amount: number;
  remaining_amount: number;
  selected: boolean;
  state: string;
  open_amount: number;
  document_currency: [number, string];
  document_version: string;
}
export interface CustomerPaymentDraft extends CustomerPaymentDraftPayload {
  warning?: string | false;
  labels: Record<string, string>;
  allocations: {
    outstanding: CustomerPaymentAllocation[];
    credits: CustomerPaymentAllocation[];
  };
  totals: { current_outstanding: number; balance_outstanding: number };
  auto_allocate: boolean;
  date_readonly: boolean;
  journal_readonly: boolean;
  show_bank: boolean;
  require_bank: boolean;
  multi_currency: boolean;
  review_version: string;
  ledger?: {
    name: string;
    account_id: number;
    partner_id: number | false;
    currency_id: number;
    debit: number;
    credit: number;
    amount_currency: number;
  }[];
  account_labels?: Record<string, string>;
}
export interface CustomerPaymentDraftRequest {
  payload: CustomerPaymentDraftPayload;
  review_version: string;
  request_key: string;
}
export type CustomerPaymentDraftChoiceKind =
  | 'company'
  | 'customer'
  | 'journal'
  | 'method'
  | 'bank'
  | 'currency';
const customerPaymentFields = [
  'partner_id',
  'company_id',
  'payment_type',
  'amount',
  'date',
  'journal_id',
  'payment_method_line_id',
  'currency_id',
  'partner_bank_id',
  'ref',
  'payment_reference',
  'bank_reference',
  'cheque_reference',
  'effective_date',
].sort();
const customerPaymentChoiceKinds: CustomerPaymentDraftChoiceKind[] = [
  'company',
  'customer',
  'journal',
  'method',
  'bank',
  'currency',
];
const paymentIdentifier = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
const paymentHash = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const paymentText = (value: unknown) =>
  value === false || typeof value === 'string';
function checkedCustomerPaymentValues(values: CustomerPaymentDraftValues) {
  if (
    !values ||
    Object.keys(values).sort().join(',') !== customerPaymentFields.join(',') ||
    !paymentIdentifier(values.company_id) ||
    !(
      [
        'partner_id',
        'journal_id',
        'payment_method_line_id',
        'currency_id',
        'partner_bank_id',
      ] as const
    ).every(
      (field) => values[field] === false || paymentIdentifier(values[field]),
    ) ||
    !['inbound', 'outbound'].includes(values.payment_type) ||
    !Number.isFinite(values.amount) ||
    values.amount < 0 ||
    !validDate(values.date) ||
    !(values.effective_date === false || validDate(values.effective_date)) ||
    ![
      values.ref,
      values.payment_reference,
      values.bank_reference,
      values.cheque_reference,
    ].every(paymentText)
  )
    throw new Error(
      'Invalid customer payment details. Reload the complete form.',
    );
  return values;
}
function checkedCustomerPaymentPayload(payload: CustomerPaymentDraftPayload) {
  if (
    !payload ||
    Object.keys(payload).sort().join(',') !== 'id,values,version' ||
    !(payload.id === false
      ? payload.version === false
      : paymentIdentifier(payload.id) && paymentHash(payload.version))
  )
    throw new Error('Invalid customer payment draft. Reload before editing.');
  checkedCustomerPaymentValues(payload.values);
  return payload;
}
export function checkedCustomerPaymentDraftRequest(
  request: CustomerPaymentDraftRequest,
) {
  if (
    !request ||
    Object.keys(request).sort().join(',') !==
      'payload,request_key,review_version' ||
    !paymentHash(request.review_version) ||
    typeof request.request_key !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      request.request_key,
    )
  )
    throw new Error(
      'Invalid payment draft recovery request. Ask your Billing administrator to review it.',
    );
  checkedCustomerPaymentPayload(request.payload);
  return request;
}
function checkedCustomerPaymentDraft(
  value: CustomerPaymentDraft,
  id: number | false,
  preview = false,
) {
  if (value?.id !== id)
    throw new Error('Customer payment response belongs to another draft.');
  checkedCustomerPaymentPayload({
    id: value.id,
    version: value.version,
    values: value.values,
  });
  const labels = (data: unknown) =>
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.values(data).every((label) => typeof label === 'string');
  if (
    !paymentHash(value.review_version) ||
    !(value.warning === undefined || paymentText(value.warning)) ||
    !labels(value.labels) ||
    ![
      value.auto_allocate,
      value.date_readonly,
      value.journal_readonly,
      value.show_bank,
      value.require_bank,
      value.multi_currency,
    ].every((flag) => typeof flag === 'boolean') ||
    value.date_readonly !== value.auto_allocate ||
    !value.totals ||
    ![value.totals.current_outstanding, value.totals.balance_outstanding].every(
      Number.isFinite,
    ) ||
    !value.allocations ||
    Object.keys(value.allocations).sort().join(',') !== 'credits,outstanding' ||
    ![value.allocations.outstanding, value.allocations.credits].every(
      (rows) =>
        Array.isArray(rows) &&
        rows.length <= 500 &&
        new Set(rows.map((row) => row?.invoice_id)).size === rows.length &&
        rows.every(
          (row) =>
            paymentIdentifier(row?.invoice_id) &&
            typeof row.name === 'string' &&
            (row.date === false || validDate(row.date)) &&
            paymentText(row.care_setting) &&
            [
              row.invoice_amount,
              row.allocated_amount,
              row.remaining_amount,
              row.open_amount,
            ].every(Number.isFinite) &&
            Array.isArray(row.document_currency) &&
            row.document_currency.length === 2 &&
            paymentIdentifier(row.document_currency[0]) &&
            typeof row.document_currency[1] === 'string' &&
            row.document_currency[1].length > 0 &&
            typeof row.selected === 'boolean' &&
            ['draft', 'posted', 'cancel'].includes(row.state) &&
            paymentHash(row.document_version),
        ),
    ) ||
    (preview &&
      (!labels(value.account_labels) ||
        !Array.isArray(value.ledger) ||
        value.ledger.length < 2 ||
        value.ledger.some(
          (row) =>
            !row ||
            typeof row.name !== 'string' ||
            !paymentIdentifier(row.account_id) ||
            !(row.partner_id === false || paymentIdentifier(row.partner_id)) ||
            !paymentIdentifier(row.currency_id) ||
            ![row.debit, row.credit, row.amount_currency].every(
              Number.isFinite,
            ) ||
            row.debit < 0 ||
            row.credit < 0,
        )))
  )
    throw new Error('Invalid native payment review. Reload before saving.');
  return value;
}
export async function getCustomerPaymentDraft(
  paymentId: number | false = false,
) {
  if (!(paymentId === false || paymentIdentifier(paymentId)))
    throw new Error('Select a saved payment or a new draft.');
  return checkedCustomerPaymentDraft(
    await chequeCall<CustomerPaymentDraft>(
      'qorlia_customer_payment_draft_load',
      { payment_id: paymentId },
    ),
    paymentId,
  );
}
export async function previewCustomerPaymentDraft(
  payload: CustomerPaymentDraftPayload,
) {
  checkedCustomerPaymentPayload(payload);
  const result = checkedCustomerPaymentDraft(
    await chequeCall<CustomerPaymentDraft>(
      'qorlia_customer_payment_draft_preview',
      { payload },
    ),
    payload.id,
    true,
  );
  if (result.version !== payload.version)
    throw new Error('This payment changed. Reload before editing.');
  return result;
}
export async function changeCustomerPaymentDraft(
  payload: CustomerPaymentDraftPayload,
  field: keyof CustomerPaymentDraftValues,
) {
  checkedCustomerPaymentPayload(payload);
  if (!customerPaymentFields.includes(field))
    throw new Error('Select a supported customer payment field.');
  const result = checkedCustomerPaymentDraft(
    await chequeCall<CustomerPaymentDraft>(
      'qorlia_customer_payment_draft_onchange',
      { payload, field },
    ),
    payload.id,
  );
  if (result.version !== payload.version)
    throw new Error('This payment changed. Reload before editing.');
  return result;
}
export async function getCustomerPaymentDraftChoices(
  values: CustomerPaymentDraftValues,
  kind: CustomerPaymentDraftChoiceKind,
  search = '',
) {
  checkedCustomerPaymentValues(values);
  if (
    !customerPaymentChoiceKinds.includes(kind) ||
    typeof search !== 'string' ||
    search.length > 200
  )
    throw new Error('Use a valid customer payment search.');
  const result = await chequeCall<[number, string][]>(
    'qorlia_customer_payment_draft_choices',
    { values, kind, search },
  );
  if (
    !Array.isArray(result) ||
    result.length > 26 ||
    new Set(result.map((row) => row?.[0])).size !== result.length ||
    result.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 2 ||
        !paymentIdentifier(row[0]) ||
        typeof row[1] !== 'string',
    )
  )
    throw new Error('Invalid customer payment choices. Search again.');
  return result;
}
async function customerPaymentDraftResult(
  method: string,
  request: CustomerPaymentDraftRequest,
) {
  checkedCustomerPaymentDraftRequest(request);
  const result = await chequeCall<{
    accepted: boolean;
    payment: PaymentStateWorkflow | false;
  }>(method, request);
  if (
    !result ||
    typeof result.accepted !== 'boolean' ||
    (method === 'qorlia_customer_payment_draft_save' && !result.accepted) ||
    (!result.accepted && result.payment !== false)
  )
    throw new Error(
      'Payment draft response unavailable. Check the exact request before another save.',
    );
  if (result.accepted) {
    if (!result.payment)
      throw new Error(
        'Saved payment state is unavailable. Check this exact request.',
      );
    checkedPaymentState(
      result.payment,
      request.payload.id || result.payment.payment_id,
    );
  }
  return result;
}
export const saveCustomerPaymentDraft = (
  request: CustomerPaymentDraftRequest,
) => customerPaymentDraftResult('qorlia_customer_payment_draft_save', request);
export const getCustomerPaymentDraftRequestStatus = (
  request: CustomerPaymentDraftRequest,
) =>
  customerPaymentDraftResult('qorlia_customer_payment_draft_status', request);

export const getDraftChoices = async (
  kind: DraftChoiceKind,
  search: string,
  shopId: number | false = false,
  productId: number | false = false,
) => {
  const result = await draftCall<[number, string][]>('qorlia_draft_choices', {
    kind,
    search,
    shop_id: shopId,
    product_id: productId,
  });
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        Number.isInteger(row[0]) &&
        row[0] > 0 &&
        typeof row[1] === 'string',
    )
  )
    throw new Error('Invalid billing choices response.');
  return result;
};

export const getInvoices = async (
  search: string,
  offset: number,
  invoiceIds?: number[],
) => {
  const result = await rpc<Invoice[]>(
    '/web/dataset/call_kw/account.move/search_read',
    {
      model: 'account.move',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ...(invoiceIds ? [['id', 'in', invoiceIds]] : []),
          ...(search
            ? [
                '|',
                '|',
                ['name', 'ilike', search],
                ['partner_id', 'ilike', search],
                ['ref', 'ilike', search],
              ]
            : []),
        ],
        fields: [
          'id',
          'name',
          'ref',
          'move_type',
          'partner_id',
          'invoice_date',
          'invoice_date_due',
          'state',
          'payment_state',
          'amount_total',
          'amount_untaxed',
          'qorlia_item_subtotal',
          'amount_tax',
          'discount',
          'round_off_amount',
          'invoice_total',
          'amount_residual',
          'currency_id',
        ],
        limit: 26,
        offset,
        order: 'id desc',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        (row.name === false || typeof row.name === 'string') &&
        (row.ref === false || typeof row.ref === 'string') &&
        ['out_invoice', 'out_refund'].includes(row.move_type) &&
        typeof row.state === 'string' &&
        typeof row.payment_state === 'string' &&
        [
          'amount_total',
          'amount_untaxed',
          'qorlia_item_subtotal',
          'amount_tax',
          'discount',
          'round_off_amount',
          'invoice_total',
          'amount_residual',
        ].every((field) => Number.isFinite(row[field as keyof Invoice])) &&
        Array.isArray(row.currency_id) &&
        Number.isInteger(row.currency_id[0]) &&
        row.currency_id[0] > 0 &&
        typeof row.currency_id[1] === 'string' &&
        (row.partner_id === false ||
          (Array.isArray(row.partner_id) &&
            Number.isInteger(row.partner_id[0]) &&
            row.partner_id[0] > 0 &&
            typeof row.partner_id[1] === 'string')) &&
        (row.invoice_date === false || typeof row.invoice_date === 'string') &&
        (row.invoice_date_due === false ||
          typeof row.invoice_date_due === 'string'),
    )
  )
    throw new Error('Invalid invoice response.');
  return result;
};

export const getChargeOrders = async (
  search: string,
  offset: number,
  status: 'draft' | 'confirmed' | 'all',
) => {
  const result = await rpc<ChargeOrder[]>(
    '/web/dataset/call_kw/sale.order/search_read',
    {
      model: 'sale.order',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ...(status === 'all'
            ? []
            : [
                [
                  'state',
                  'in',
                  status === 'draft' ? ['draft', 'sent'] : ['sale', 'done'],
                ],
              ]),
          ...(search
            ? [
                '|',
                '|',
                ['name', 'ilike', search],
                ['partner_id', 'ilike', search],
                ['client_order_ref', 'ilike', search],
              ]
            : []),
        ],
        fields: [
          'id',
          'name',
          'client_order_ref',
          'partner_id',
          'shop_id',
          'date_order',
          'state',
          'invoice_status',
          'care_setting',
          'provider_name',
          'amount_untaxed',
          'amount_tax',
          'amount_total',
          'discount',
          'discount_type',
          'discount_percentage',
          'chargeable_amount',
          'disc_acc_id',
          'round_off_amount',
          'currency_id',
          'invoice_ids',
        ],
        limit: 26,
        offset,
        order: 'id desc',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        typeof row.date_order === 'string' &&
        (row.client_order_ref === false ||
          typeof row.client_order_ref === 'string') &&
        (row.provider_name === false ||
          typeof row.provider_name === 'string') &&
        ['draft', 'sent', 'sale', 'done', 'cancel'].includes(row.state) &&
        ['upselling', 'invoiced', 'to invoice', 'no'].includes(
          row.invoice_status,
        ) &&
        [false, 'opd', 'ipd'].includes(row.care_setting) &&
        ['none', 'fixed', 'percentage'].includes(row.discount_type) &&
        [row.partner_id, row.shop_id, row.disc_acc_id].every(validRelation) &&
        Array.isArray(row.currency_id) &&
        validRelation(row.currency_id) &&
        [
          row.amount_untaxed,
          row.amount_tax,
          row.amount_total,
          row.discount,
          row.discount_percentage,
          row.chargeable_amount,
          row.round_off_amount,
        ].every(Number.isFinite) &&
        Array.isArray(row.invoice_ids) &&
        row.invoice_ids.every((id) => Number.isInteger(id) && id > 0),
    )
  )
    throw new Error('Invalid charge order response.');
  return result;
};

export const getChargeOrderLines = async (orderId: number) => {
  const result = await rpc<ChargeOrderLine[]>(
    '/web/dataset/call_kw/sale.order.line/search_read',
    {
      model: 'sale.order.line',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [['order_id', '=', orderId]],
        fields: [
          'id',
          'name',
          'display_type',
          'product_id',
          'product_uom',
          'product_uom_qty',
          'qty_delivered',
          'qty_invoiced',
          'price_unit',
          'discount',
          'price_subtotal',
          'price_tax',
          'price_total',
          'dispensed',
          'lot_id',
          'expiry_date',
        ],
        limit: 501,
        order: 'sequence, id',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        [false, 'line_section', 'line_note'].includes(row.display_type) &&
        [row.product_id, row.product_uom, row.lot_id].every(validRelation) &&
        [
          row.product_uom_qty,
          row.qty_delivered,
          row.qty_invoiced,
          row.price_unit,
          row.discount,
          row.price_subtotal,
          row.price_tax,
          row.price_total,
        ].every(Number.isFinite) &&
        typeof row.dispensed === 'boolean' &&
        (row.expiry_date === false || typeof row.expiry_date === 'string'),
    )
  )
    throw new Error('Invalid charge order detail response.');
  return result;
};

export const getInvoiceLines = async (invoiceId: number) => {
  const result = await rpc<InvoiceLine[]>(
    '/web/dataset/call_kw/account.move.line/search_read',
    {
      model: 'account.move.line',
      method: 'search_read',
      args: [],
      kwargs: {
        domain: [
          ['move_id', '=', invoiceId],
          ['display_type', '=', 'product'],
          ['qorlia_adjustment_kind', '=', false],
        ],
        fields: [
          'id',
          'name',
          'quantity',
          'price_unit',
          'price_subtotal',
          'discount',
          'price_total',
        ],
        limit: 501,
        order: 'sequence, id',
      },
    },
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) =>
        row &&
        Number.isInteger(row.id) &&
        row.id > 0 &&
        typeof row.name === 'string' &&
        Number.isFinite(row.quantity) &&
        Number.isFinite(row.price_unit) &&
        Number.isFinite(row.price_subtotal) &&
        Number.isFinite(row.discount) &&
        Number.isFinite(row.price_total),
    )
  )
    throw new Error('Invalid invoice detail response.');
  return result;
};
