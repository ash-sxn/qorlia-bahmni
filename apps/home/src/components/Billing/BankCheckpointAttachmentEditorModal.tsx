import { Button, FileUploader, Modal } from '@bahmni/design-system';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  CheckpointAttachmentReceipt,
  CheckpointAttachmentSaveRequest,
  checkedCheckpointAttachmentRequest,
  getCheckpointAttachments,
  getCheckpointAttachmentStatus,
  readInvoiceUploads,
  saveCheckpointAttachments,
} from './billingService';
import {
  clearCheckpointAttachmentRecovery,
  loadCheckpointAttachmentRecovery,
  persistCheckpointAttachmentRecovery,
} from './checkpointAttachmentRecovery';

type Props = {
  uid: number;
  selection: number | null;
  close: () => void;
  reconnect: () => void;
};

export function BankCheckpointAttachmentEditorModal(props: Props) {
  const recovery = useQuery({
    queryKey: ['billing', 'checkpoint-attachment-recovery', props.uid],
    queryFn: () => loadCheckpointAttachmentRecovery(props.uid),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (
    recovery.isFetching ||
    recovery.isError ||
    (!recovery.data && props.selection === null)
  )
    return (
      <Modal
        open
        passiveModal
        size="lg"
        modalHeading="Manage checkpoint attachments"
        preventCloseOnClickOutside
        onRequestClose={props.close}
      >
        {recovery.isFetching ? (
          <p role="status">Checking attachment recovery storage...</p>
        ) : (
          <p role={recovery.isError ? 'alert' : 'status'}>
            {recovery.isError
              ? 'Attachment recovery storage is unavailable or invalid. No new save can start. Ask your Billing administrator to check any previous request.'
              : 'No pending attachment save was found. Open a checkpoint to manage its files.'}
          </p>
        )}
        <Button
          disabled={recovery.isFetching}
          onClick={() => void recovery.refetch()}
        >
          Reload attachment recovery
        </Button>
        <Button kind="ghost" onClick={props.close}>
          Back to checkpoints
        </Button>
      </Modal>
    );
  return (
    <AttachmentForm
      key={`${props.uid}:${recovery.dataUpdatedAt}`}
      {...props}
      checkpointId={recovery.data?.payload.checkpoint_id ?? props.selection!}
      initialPending={recovery.data ?? null}
      reloadRecovery={() => void recovery.refetch()}
    />
  );
}

function AttachmentForm({
  uid,
  checkpointId,
  initialPending,
  close,
  reconnect,
  reloadRecovery,
}: Omit<Props, 'selection'> & {
  checkpointId: number;
  initialPending: CheckpointAttachmentSaveRequest | null;
  reloadRecovery: () => void;
}) {
  const client = useQueryClient();
  const [pending, setPending] = useState(initialPending);
  const [selected, setSelected] = useState<{ id: string; file: File }[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [uploaderVersion, setUploaderVersion] = useState(0);
  const [accepted, setAccepted] = useState<CheckpointAttachmentReceipt | null>(
    null,
  );
  const [storageFailure, setStorageFailure] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [discard, setDiscard] = useState<
    'close' | 'reload' | 'reconnect' | null
  >(null);
  const source = useInfiniteQuery({
    queryKey: ['billing', 'checkpoint-attachment-editor', uid, checkpointId],
    enabled: !pending && !accepted && !storageFailure,
    initialPageParam: {
      after: false as number | false,
      version: false as string | false,
    },
    queryFn: ({ pageParam }) =>
      getCheckpointAttachments(
        checkpointId,
        pageParam.after,
        pageParam.version,
      ),
    getNextPageParam: (page) =>
      page.next_after === false
        ? undefined
        : { after: page.next_after, version: page.version },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const first = source.data?.pages[0];
  const rows = source.data?.pages.flatMap((page) => page.rows) ?? [];
  const inconsistent =
    (source.data?.pages.some(
      (page) =>
        page.version !== first?.version ||
        page.total_count !== first?.total_count ||
        page.can_upload !== first?.can_upload ||
        page.can_remove !== first?.can_remove,
    ) ??
      false) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.length > (first?.total_count ?? 0) ||
    (first && !source.hasNextPage && rows.length !== first.total_count);
  const expired =
    source.error instanceof BillingSessionExpired ||
    failure instanceof BillingSessionExpired;
  const locked = busy || !!pending || !!accepted || storageFailure || !!discard;
  const ready =
    first &&
    !source.isError &&
    !source.isFetching &&
    !inconsistent &&
    !expired &&
    !locked;
  const complete =
    ready && !source.hasNextPage && rows.length === first.total_count;
  const canSave =
    !!complete &&
    (selected.length > 0 || removed.length > 0) &&
    (!selected.length || first!.can_upload) &&
    (!removed.length || first!.can_remove) &&
    removed.every((id) => rows.some((row) => row.id === id));
  const dirty = !!pending || !!selected.length || !!removed.length;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const leave = (target: 'close' | 'reload' | 'reconnect') => {
    if (busyRef.current) return;
    if (pending) {
      if (target === 'reconnect') reconnect();
      else
        setNotice(
          'Confirm the exact pending attachment request before closing or reloading.',
        );
      return;
    }
    if (dirty) setDiscard(target);
    else ({ close, reload: reloadRecovery, reconnect })[target]();
  };
  const confirm = async (
    request: CheckpointAttachmentSaveRequest,
    result: CheckpointAttachmentReceipt,
  ) => {
    if (!result.accepted || !result.attachments)
      throw new Error(
        'The attachment save is not confirmed. Keep the exact request for recovery.',
      );
    setAccepted(result);
    let otherPending: CheckpointAttachmentSaveRequest | null;
    try {
      otherPending = await clearCheckpointAttachmentRecovery(uid, request);
    } catch {
      setStorageFailure(true);
      throw new Error(
        'The attachment save was accepted, but recovery storage could not be cleared. Check the exact save again before another request.',
      );
    }
    setPending(null);
    setStorageFailure(false);
    setSelected([]);
    setRemoved([]);
    setNotice(
      otherPending
        ? 'Your exact attachment request was accepted. Another attachment request is pending in this browser. It was not cleared. Close this result and use Resume pending attachment save.'
        : 'Your exact attachment request was accepted. Reopen the checkpoint before making more changes.',
    );
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'billing' &&
        query.queryKey[2] === uid &&
        [
          'checkpoint-history',
          'checkpoint-detail',
          'checkpoint-attachments',
        ].includes(String(query.queryKey[1])),
    });
  };
  const send = async (checkOnly = false) => {
    if (
      busyRef.current ||
      expired ||
      (checkOnly
        ? !pending
        : !pending && (!canSave || storageFailure || accepted))
    )
      return;
    if (
      !pending &&
      ((!selected.length && !removed.length) ||
        (selected.length && !first?.can_upload) ||
        (removed.length && !first?.can_remove))
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    let request = pending;
    let stored = !!pending;
    try {
      request ??= checkedCheckpointAttachmentRequest({
        payload: {
          checkpoint_id: checkpointId,
          version: first!.version,
          uploads: await readInvoiceUploads(
            selected.map((entry) => entry.file),
          ),
          remove_ids: removed,
        },
        request_key: crypto.randomUUID(),
      });
      // The IndexedDB transaction must commit before any native save starts.
      if (!checkOnly) {
        await persistCheckpointAttachmentRecovery(uid, request);
        stored = true;
        setPending(request);
      }
      const result = await (
        checkOnly ? getCheckpointAttachmentStatus : saveCheckpointAttachments
      )(request.payload, request.request_key);
      if (result.accepted) await confirm(request, result);
      else
        setNotice(
          'No saved receipt was found in this check. A delayed save may still finish. Retry the same exact request, not a replacement.',
        );
    } catch (error) {
      if (!stored && request) setStorageFailure(true);
      if (error instanceof BillingActionRejected && request && !checkOnly) {
        try {
          await clearCheckpointAttachmentRecovery(uid, request);
          setPending(null);
          setStorageFailure(false);
        } catch {
          setStorageFailure(true);
        }
      }
      setFailure(
        error instanceof Error
          ? error
          : new Error('Attachment save could not be confirmed.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading={`Manage checkpoint ${checkpointId} attachments`}
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      {discard ? (
        <div role="alert" className={styles.card}>
          <h3>Discard unsaved attachment selections?</h3>
          <p>
            No request is pending. Selected uploads and removals will be lost.
          </p>
          <Button
            kind="danger"
            onClick={() =>
              ({ close, reload: reloadRecovery, reconnect })[discard]()
            }
          >
            Discard attachment selections
          </Button>
          <Button kind="tertiary" onClick={() => setDiscard(null)}>
            Keep attachment selections
          </Button>
        </div>
      ) : null}
      <section
        aria-label="Checkpoint attachment editor"
        aria-busy={busy || source.isFetching}
      >
        {busy ? (
          <p role="status">
            Checking recovery storage and the native attachment save...
          </p>
        ) : null}
        <p>
          Upload files or remove their links from this statement. Removal does
          not delete the stored file or change accounting. Uploads may total 10
          MiB across five files.
        </p>
        <p className={styles.note}>
          Pending requests include file contents and are kept in this browser
          for this site until confirmed. Use a trusted staff device. Do not
          clear browser data while a save is pending.
        </p>
        {source.isFetching ? (
          <p role="status">Loading the complete native attachment list...</p>
        ) : null}
        {source.isError || inconsistent ? (
          <p role="alert">
            {source.error?.message ?? 'Attachment pages changed or overlapped.'}{' '}
            Previous files are hidden. Reload before selecting changes.
          </p>
        ) : null}
        {pending ? (
          <div className={styles.card} role="status">
            <h3>Exact attachment save pending</h3>
            <p>
              Checkpoint {pending.payload.checkpoint_id}. Request:{' '}
              {pending.request_key}
            </p>
            <p>
              {pending.payload.uploads.length} uploads and{' '}
              {pending.payload.remove_ids.length} link removals. The original
              source version is retained for exact retry.
            </p>
            <p>
              Uploads:{' '}
              {pending.payload.uploads.map((file) => file.name).join(', ') ||
                'None'}
            </p>
            <p>
              Removed attachment IDs:{' '}
              {pending.payload.remove_ids.join(', ') || 'None'}
            </p>
            <Button disabled={busy || expired} onClick={() => void send(true)}>
              Check exact attachment save
            </Button>
            <Button
              kind="tertiary"
              disabled={busy || expired || !!accepted}
              onClick={() => void send()}
            >
              Retry exact attachment save
            </Button>
          </div>
        ) : null}
        {ready ? (
          <>
            <p>
              Showing {rows.length} of {first.total_count} saved attachments.
              Load every page before saving changes.
            </p>
            <ul className={styles.attachmentList}>
              {rows.map((file) => (
                <li key={file.id}>
                  <span>
                    {file.name} (
                    {file.kind === 'url'
                      ? 'External link'
                      : `${file.byte_count} bytes`}
                    )
                  </span>
                  {first.can_remove ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={removed.includes(file.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setRemoved((prior) =>
                            checked
                              ? [...prior, file.id]
                              : prior.filter((id) => id !== file.id),
                          );
                          setFailure(null);
                          setNotice('');
                        }}
                      />{' '}
                      Remove attachment {file.id} from checkpoint
                    </label>
                  ) : null}
                </li>
              ))}
            </ul>
            {!rows.length ? <p>No saved attachments.</p> : null}
            {source.hasNextPage ? (
              <Button onClick={() => void source.fetchNextPage()}>
                Load more editor attachments
              </Button>
            ) : null}
            {!first.can_upload && !first.can_remove ? (
              <p>
                Your Billing account can read these files but cannot change
                them.
              </p>
            ) : null}
            {first.can_upload ? (
              <FileUploader
                key={uploaderVersion}
                labelTitle="Upload checkpoint attachments"
                labelDescription="Up to five files, 10 MiB total. Use synthetic files only in this test environment."
                buttonLabel="Choose checkpoint files"
                filenameStatus="complete"
                multiple
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const chosen = Array.from(event.target.files ?? []).map(
                    (file) => ({ id: crypto.randomUUID(), file }),
                  );
                  setSelected((prior) => [...prior, ...chosen]);
                  setUploaderVersion((value) => value + 1);
                  setFailure(null);
                  setNotice('');
                }}
              />
            ) : null}
            <ul className={styles.attachmentList}>
              {selected.map((entry) => (
                <li key={entry.id}>
                  <span>
                    {entry.file.name} ({entry.file.size} bytes), selected upload
                  </span>
                  <Button
                    kind="ghost"
                    onClick={() =>
                      setSelected((prior) =>
                        prior.filter((item) => item.id !== entry.id),
                      )
                    }
                  >
                    Remove selected upload {entry.file.name}
                  </Button>
                </li>
              ))}
            </ul>
            <Button disabled={!canSave} onClick={() => void send()}>
              Save attachment changes
            </Button>
          </>
        ) : null}
        {accepted?.attachments ? (
          <div className={styles.card} role="status">
            <h3>Native attachment save accepted</h3>
            <p>
              Checkpoint {accepted.checkpoint_id} currently has{' '}
              {accepted.attachments.total_count} linked files. This is the
              current state, including any later edits.
            </p>
          </div>
        ) : null}
        {failure ? (
          <p role="alert">
            {failure instanceof BillingSessionExpired
              ? 'Your Billing session expired.'
              : failure.message}
          </p>
        ) : null}
        {storageFailure ? (
          <p role="alert">
            Recovery storage needs attention. No replacement save is allowed.
          </p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {!pending && !accepted ? (
          <Button
            kind="tertiary"
            disabled={busy || source.isFetching}
            onClick={() => leave('reload')}
          >
            Reload attachment source and recovery
          </Button>
        ) : null}
        {expired ? (
          <Button disabled={busy} onClick={() => leave('reconnect')}>
            Reconnect Billing for attachments
          </Button>
        ) : null}
        <Button
          kind="ghost"
          disabled={busy || !!pending}
          onClick={() => leave('close')}
        >
          Back to checkpoints
        </Button>
      </section>
    </Modal>
  );
}
