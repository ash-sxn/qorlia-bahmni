import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryDraftForm,
  previewInventoryDraftForm,
  type InventoryDraftForm,
  type InventoryHeaderEdit,
} from './billingService';
import {
  InventoryHeaderFields,
  inventoryHeaderInputValue,
  inventoryHeaderText,
} from './InventoryHeaderFields';

type Props = {
  uid: number;
  close: () => void;
  reconnect: () => void;
  openTransfer: (id: number) => void;
  returnFocus?: () => void;
};
type LeaveTarget = 'close' | 'reload' | 'reconnect' | { transferId: number };

export function InventoryDraftEditor(props: Props) {
  return <DraftEditor key={props.uid} {...props} />;
}

function DraftEditor({
  uid,
  close,
  reconnect,
  openTransfer,
  returnFocus,
}: Props) {
  const session = useId(),
    mounted = useRef(true),
    busyRef = useRef(false);
  const discardHeading = useRef<HTMLLegendElement>(null);
  const [view, setView] = useState<InventoryDraftForm | null>(null);
  const [local, setLocal] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Error | null>(null);
  const [discard, setDiscard] = useState<LeaveTarget | null>(null);
  const loaded = useQuery({
    queryKey: ['billing', 'inventory-new-form', uid, session],
    queryFn: () => getInventoryDraftForm(),
    retry: false,
    // Native defaults must not rebase when another Billing workflow invalidates its reads.
    staleTime: 'static',
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const current = view ?? loaded.data;
  const seed = loaded.data?.seed;
  const dirty = !!current?.edits.length || Object.keys(local).length > 0;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked =
    busy || loaded.isFetching || loaded.isError || expired || !!discard;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (!dirty) return;
    // shortcut: full-page unload and explicit exits are guarded; router-history parity still needs integration.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (discard) discardHeading.current?.focus();
  }, [discard]);

  const executeLeave = (target: LeaveTarget) => {
    if (target === 'reload') {
      setView(null);
      setLocal({});
      setFailure(null);
      void loaded.refetch();
    } else if (target === 'reconnect') reconnect();
    else if (target === 'close') close();
    else {
      close();
      openTransfer(target.transferId);
    }
  };
  const leave = (target: LeaveTarget) => {
    if (busyRef.current || (loaded.isFetching && target !== 'close')) return;
    if (dirty) setDiscard(target);
    else executeLeave(target);
  };
  const change = (node: number, value: InventoryHeaderEdit['value']) => {
    const row = current?.form.layout[node];
    if (
      busyRef.current ||
      locked ||
      !current ||
      !seed ||
      !row?.rules.visible ||
      row.rules.readonly
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    void previewInventoryDraftForm(seed, [...current.edits, { node, value }])
      .then((updated) => {
        if (!mounted.current) return;
        setView(updated);
        setLocal((old) => {
          const remaining = { ...old };
          delete remaining[node];
          return remaining;
        });
      })
      .catch((error) => {
        if (mounted.current)
          setFailure(
            error instanceof Error
              ? error
              : new Error(
                  'Native transfer defaults could not be updated. Nothing was created.',
                ),
          );
      })
      .finally(() => {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const blur = (node: number) => {
    if (local[node] === undefined || !current || locked) return;
    try {
      const name = current.form.layout[node].field;
      const value = inventoryHeaderInputValue(
        current.form.fields[name].type,
        local[node],
        current.form.timezone,
      );
      if (
        value === current.form.values[name] ||
        (value === false && current.form.values[name] === '')
      )
        setLocal((old) => {
          const remaining = { ...old };
          delete remaining[node];
          return remaining;
        });
      else change(node, value);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Enter a valid native field value.'),
      );
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Prepare new inventory transfer"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Native new-transfer form"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Explore native defaults and edit the new-transfer header. These
          changes are not saved. Creation, child editing and durable create
          recovery are still being integrated.
        </p>
        {loaded.isFetching ? (
          <p role="status">Loading signed native transfer defaults...</p>
        ) : null}
        {loaded.error ? (
          <p role="alert">
            {loaded.error.message} No new-transfer form is shown.
          </p>
        ) : null}
        {current && seed && !loaded.isFetching && !loaded.isError ? (
          <>
            {current.form.warning ? (
              <p role="alert">
                {inventoryHeaderText(
                  current.form.warning.title,
                  'Native warning',
                )}
                : {inventoryHeaderText(current.form.warning.message)}
              </p>
            ) : null}
            {current.form.unsupported.length ? (
              <p role="alert">
                Native field adapters are missing:{' '}
                {current.form.unsupported.join(', ')}.
              </p>
            ) : null}
            <InventoryHeaderFields
              uid={uid}
              form={current.form}
              selection={{ seed, edits: current.edits }}
              local={local}
              disabled={locked}
              edit={(node, value) => {
                setLocal((old) => ({ ...old, [node]: value }));
                setFailure(null);
              }}
              blur={blur}
              change={change}
              reconnect={() => leave('reconnect')}
              openTransfer={(id) => leave({ transferId: id })}
            />
            {Object.keys(local).length ? (
              <div>
                <p role="status">
                  Some input has not passed native onchange. Leave the field to
                  apply its rules, or explicitly discard the unapplied input.
                </p>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => {
                    setLocal({});
                    setFailure(null);
                  }}
                >
                  Discard unapplied new-transfer inputs
                </Button>
              </div>
            ) : null}
            {busy ? (
              <p role="status">
                Applying native new-transfer rules. Nothing is being saved...
              </p>
            ) : null}
            <p>
              Native creation review, Save and recovery are not available yet.
              No transfer reference has been assigned and no record has been
              created.
            </p>
            <Button disabled>Create transfer (not integrated)</Button>
          </>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || loaded.isFetching}
            onClick={() => leave(expired ? 'reconnect' : 'reload')}
          >
            {expired ? 'Reconnect Billing' : 'Reload native defaults'}
          </Button>
          <Button
            kind="tertiary"
            disabled={busy}
            onClick={() => leave('close')}
          >
            Close new-transfer form
          </Button>
        </div>
        {discard ? (
          <fieldset>
            <legend ref={discardHeading} tabIndex={-1}>
              Discard unsaved new-transfer changes?
            </legend>
            <p>
              No record was created. Your local edits and the current signed
              defaults will be lost.
            </p>
            <Button
              kind="danger"
              onClick={() => {
                const target = discard;
                setDiscard(null);
                executeLeave(target);
              }}
            >
              Discard new-transfer edits
            </Button>
            <Button kind="tertiary" onClick={() => setDiscard(null)}>
              Keep new-transfer edits
            </Button>
          </fieldset>
        ) : null}
      </section>
    </Modal>
  );
}
