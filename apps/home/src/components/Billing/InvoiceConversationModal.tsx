import { Button, FileUploader, Modal, TextArea } from '@bahmni/design-system';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  checkInvoiceNote,
  downloadInvoiceAttachment,
  getInvoiceConversation,
  InvoiceUpload,
  postInvoiceNote,
  readInvoiceUploads,
} from './billingService';

export function InvoiceConversationModal({
  uid,
  invoiceId,
  close,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const history = useInfiniteQuery({
    queryKey: ['billing', 'invoice-conversation', uid, invoiceId],
    initialPageParam: false as number | false,
    queryFn: ({ pageParam }) => getInvoiceConversation(invoiceId, pageParam),
    getNextPageParam: (page) =>
      page.next_before === false ? undefined : page.next_before,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [uploaderVersion, setUploaderVersion] = useState(0);
  const [pending, setPending] = useState<{
    key: string;
    body: string;
    uploads: InvoiceUpload[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState<'close' | 'reconnect' | null>(null);
  const dirty = Boolean(body.trim() || files.length || pending);
  const expired =
    history.error instanceof BillingSessionExpired ||
    failure instanceof BillingSessionExpired;
  const ready =
    !expired && !history.isFetching && !history.isError && history.data;
  const canNote = Boolean(ready && history.data?.pages[0].can_note);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const leave = (action: 'close' | 'reconnect') => {
    if (busyRef.current || history.isFetching) return;
    if (dirty) setDiscard(action);
    else (action === 'close' ? close : reconnect)();
  };
  const send = async (checkOnly = false) => {
    if (busyRef.current || (checkOnly ? !pending || expired : !canNote)) return;
    if ((!body.trim() && !files.length && !pending) || body.length > 5000)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const request = pending ?? {
        key: crypto.randomUUID(),
        body,
        uploads: await readInvoiceUploads(files.map((entry) => entry.file)),
      };
      setPending(request);
      const message = await (checkOnly ? checkInvoiceNote : postInvoiceNote)(
        invoiceId,
        request.key,
        request.body,
        ...(request.uploads.length
          ? ([request.uploads] as [InvoiceUpload[]])
          : []),
      );
      if (message) {
        setPending(null);
        setBody('');
        setFiles([]);
        setUploaderVersion((value) => value + 1);
        setNotice(
          `Internal note #${message.id} is saved in Billing. No invoice amounts were changed.`,
        );
        await history.refetch();
      } else
        setNotice(
          'No saved note was found in this check. A delayed save may still finish. Retry the same note to confirm its result before changing this text.',
        );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Internal note could not be confirmed.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const download = async (messageId: number, attachmentId: number) => {
    if (busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const file = await downloadInvoiceAttachment(
        invoiceId,
        messageId,
        attachmentId,
      );
      const anchor = document.createElement('a');
      const objectUrl =
        file.kind === 'binary' ? URL.createObjectURL(file.blob) : null;
      anchor.href = objectUrl ?? (file.kind === 'url' ? file.url : '');
      if (file.kind === 'binary') anchor.download = file.filename;
      else {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        if (objectUrl)
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      setNotice(
        file.kind === 'binary'
          ? 'Attachment download requested. Open the downloaded file to check it.'
          : 'Attachment link opened separately. The external site has its own access and privacy rules.',
      );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Attachment download failed.'),
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
      modalHeading="Invoice conversation"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Invoice conversation"
        aria-busy={busy || history.isFetching}
      >
        <p>
          Messages and change history from native Billing, newest first.
          Internal notes are not messages to the patient. Billing may notify
          existing internal followers according to their notification settings.
        </p>
        {failure && !expired ? <p role="alert">{failure.message}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect before reading or posting
              notes.
            </p>
            <Button onClick={() => leave('reconnect')}>
              Reconnect Billing
            </Button>
          </div>
        ) : (
          <>
            {history.data?.pages[0].can_note ? (
              <>
                <TextArea
                  id="invoice-internal-note"
                  labelText="Internal note"
                  value={body}
                  maxLength={5000}
                  rows={4}
                  disabled={!canNote || busy || Boolean(pending)}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setNotice('');
                  }}
                />
                <p className={styles.note}>
                  {body.length}/5,000 characters. Saved notes remain in the
                  invoice history.
                </p>
                <FileUploader
                  key={uploaderVersion}
                  labelTitle="Attach files to this internal note"
                  labelDescription="Up to five files, 10 MiB total. Files save together with the note. Do not upload real patient information to this test environment."
                  buttonLabel="Choose attachments"
                  multiple
                  filenameStatus="complete"
                  disabled={!canNote || busy || Boolean(pending)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setFiles((current) => [
                      ...current,
                      ...Array.from(event.target.files ?? []).map((file) => ({
                        id: crypto.randomUUID(),
                        file,
                      })),
                    ]);
                    setUploaderVersion((value) => value + 1);
                    setFailure(null);
                  }}
                />
                {files.length ? (
                  <ul aria-label="Unsent attachments">
                    {files.map(({ id, file }) => (
                      <li key={id}>
                        {file.name} ({file.size.toLocaleString()} bytes){' '}
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={busy || Boolean(pending)}
                          onClick={() =>
                            setFiles((current) =>
                              current.filter((entry) => entry.id !== id),
                            )
                          }
                        >
                          Remove {file.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  disabled={!canNote || busy || (!body.trim() && !files.length)}
                  onClick={() => void send()}
                >
                  {busy
                    ? 'Checking Billing...'
                    : pending
                      ? 'Retry same note'
                      : 'Save internal note'}
                </Button>
              </>
            ) : ready ? (
              <p>
                Your Billing account can read this conversation but cannot post
                notes.
              </p>
            ) : null}
            {pending && !busy ? (
              <div role="alert">
                <p>
                  The save has not been confirmed. No automatic retry was sent.
                  Check the request or retry the same note before editing it.
                </p>
                <Button
                  kind="tertiary"
                  disabled={history.isFetching}
                  onClick={() => void send(true)}
                >
                  Check saved note
                </Button>
              </div>
            ) : null}
            {history.isError ? (
              <p role="alert">{history.error.message}</p>
            ) : history.data ? (
              <ol
                className={styles.conversation}
                aria-label="Saved invoice messages"
              >
                {history.data.pages
                  .flatMap((page) => page.messages)
                  .map((message) => (
                    <li key={message.id}>
                      <h3>
                        {message.kind === 'note'
                          ? 'Internal note'
                          : 'Billing message'}{' '}
                        #{message.id}
                      </h3>
                      <p className={styles.note}>
                        {message.author} ·{' '}
                        <time dateTime={message.date.replace(' ', 'T') + 'Z'}>
                          {new Date(
                            message.date.replace(' ', 'T') + 'Z',
                          ).toLocaleString()}
                        </time>
                      </p>
                      {message.subject ? <h4>{message.subject}</h4> : null}
                      <p className={styles.messageBody}>{message.body}</p>
                      {message.body_truncated ? (
                        <p>
                          Long message shortened here. View the complete message
                          in native Billing.
                        </p>
                      ) : null}
                      {message.changes.length ? (
                        <ul aria-label={`Changes in message ${message.id}`}>
                          {message.changes.map((change) => (
                            <li key={change.id}>
                              {change.field}: {change.old} → {change.new}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {message.attachments.length ? (
                        <>
                          <p>Attachments:</p>
                          <ul>
                            {message.attachments.map((file) => (
                              <li key={file.id}>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={busy || !ready}
                                  onClick={() =>
                                    void download(message.id, file.id)
                                  }
                                >
                                  Download or open {file.name}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </li>
                  ))}
              </ol>
            ) : null}
            {history.isFetching ? (
              <p role="status">Loading invoice conversation...</p>
            ) : null}
            {history.data?.pages[0].messages.length === 0 &&
            !history.isError ? (
              <p>No saved messages.</p>
            ) : null}
            <div className={styles.toolbar}>
              <Button
                kind="tertiary"
                disabled={busy || history.isFetching}
                onClick={() => void history.refetch()}
              >
                Reload conversation
              </Button>
              {history.hasNextPage ? (
                <Button
                  kind="tertiary"
                  disabled={busy || history.isFetching || history.isError}
                  onClick={() => void history.fetchNextPage()}
                >
                  Load older messages
                </Button>
              ) : null}
            </div>
          </>
        )}
        {discard ? (
          <div role="alert">
            <p>
              {pending
                ? 'This note may already be saved. Check the invoice history after reconnecting; do not post a new copy without checking.'
                : 'Your unsaved note will be discarded.'}
            </p>
            <Button
              kind="danger"
              onClick={() => (discard === 'close' ? close : reconnect)()}
            >
              Discard local draft and{' '}
              {discard === 'close' ? 'close' : 'reconnect'}
            </Button>
            <Button kind="ghost" onClick={() => setDiscard(null)}>
              Keep editing
            </Button>
          </div>
        ) : null}
        <div className={styles.toolbar}>
          <Button
            kind="ghost"
            disabled={busy || history.isFetching}
            onClick={() => leave('close')}
          >
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
