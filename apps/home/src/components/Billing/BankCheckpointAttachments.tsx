import { Button } from '@bahmni/design-system';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  INVOICE_ATTACHMENT_LIMIT,
  downloadCheckpointAttachment,
  getCheckpointAttachments,
} from './billingService';

export function BankCheckpointAttachments({
  uid,
  checkpointId,
  reconnect,
  manage,
}: {
  uid: number;
  checkpointId: number;
  reconnect: () => void;
  manage?: () => void;
}) {
  const client = useQueryClient();
  const queryKey = ['billing', 'checkpoint-attachments', uid, checkpointId];
  const files = useInfiniteQuery({
    queryKey,
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
  const first = files.data?.pages[0];
  const rows = files.data?.pages.flatMap((page) => page.rows) ?? [];
  const inconsistent =
    (files.data?.pages.some(
      (page) =>
        page.version !== first?.version ||
        page.total_count !== first?.total_count,
    ) ??
      false) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.length > (first?.total_count ?? 0) ||
    (first && !files.hasNextPage && rows.length !== first.total_count);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const ready = first && !files.isError && !inconsistent && !failure;
  const download = async (id: number) => {
    if (!ready || busyRef.current || files.isFetching) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const file = await downloadCheckpointAttachment(
        checkpointId,
        id,
        first.version,
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
          : new Error('Checkpoint attachment download is unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <section className={styles.card} aria-label="Checkpoint attachments">
      <h3>Checkpoint attachments</h3>
      <p>
        Saved files linked to this native checkpoint. Binary downloads here are
        limited to 10 MiB. Manage attachments to upload files or remove their
        checkpoint links. Larger-file streaming is not available yet.
      </p>
      {files.isFetching ? (
        <p role="status">Loading saved checkpoint attachments...</p>
      ) : null}
      {files.isError || inconsistent ? (
        <p role="alert">
          {files.error instanceof BillingSessionExpired
            ? 'Your Billing session expired.'
            : (files.error?.message ??
              'Attachment pages changed or overlapped.')}{' '}
          The previous attachment list is hidden. Reload before downloading.
        </p>
      ) : null}
      {ready ? (
        <>
          <p>
            Showing {rows.length} of {first.total_count} saved attachments.
          </p>
          <ul className={styles.attachmentList}>
            {rows.map((row) => (
              <li key={row.id}>
                <span>
                  {row.name} (
                  {row.kind === 'url'
                    ? 'External link'
                    : `${row.byte_count} bytes`}
                  )
                </span>{' '}
                <Button
                  kind="tertiary"
                  disabled={
                    busy ||
                    files.isFetching ||
                    (row.kind === 'binary' &&
                      row.byte_count > INVOICE_ATTACHMENT_LIMIT)
                  }
                  onClick={() => void download(row.id)}
                >
                  {row.kind === 'url'
                    ? 'Open attachment link'
                    : 'Download attachment'}{' '}
                  {row.id}
                </Button>
              </li>
            ))}
          </ul>
          {!rows.length ? (
            <p>No attachments are linked to this checkpoint.</p>
          ) : null}
          {files.hasNextPage ? (
            <Button
              disabled={busy || files.isFetching}
              onClick={() => void files.fetchNextPage()}
            >
              Load more checkpoint attachments
            </Button>
          ) : null}
        </>
      ) : null}
      <Button
        kind="tertiary"
        disabled={busy || files.isFetching}
        onClick={() => {
          setFailure(null);
          setNotice('');
          void client.resetQueries({ queryKey, exact: true });
        }}
      >
        Reload checkpoint attachments
      </Button>
      {manage && ready && (first.can_upload || first.can_remove) ? (
        <Button disabled={busy || files.isFetching} onClick={manage}>
          Manage checkpoint attachments
        </Button>
      ) : null}
      {failure ? (
        <p role="alert">
          {failure instanceof BillingSessionExpired
            ? 'Your Billing session expired.'
            : failure.message}{' '}
          The previous attachment list is hidden. Reload before another
          download.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {files.error instanceof BillingSessionExpired ||
      failure instanceof BillingSessionExpired ? (
        <Button disabled={busy} onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : null}
    </section>
  );
}
