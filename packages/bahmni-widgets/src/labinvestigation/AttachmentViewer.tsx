import { getAuthenticatedDocumentUrl } from '@bahmni/services';
import React from 'react';
import { Attachment } from './models';
import styles from './styles/LabInvestigation.module.scss';

interface AttachmentViewerProps {
  attachment: Attachment;
  index: number;
  totalCount: number;
}

const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  attachment,
  index,
  totalCount,
}) => {
  const isPDF = attachment.contentType?.toLowerCase().includes('pdf');
  const isImage = attachment.contentType?.toLowerCase().includes('image');
  const url = getAuthenticatedDocumentUrl(attachment.url, 'uploaded_results');
  if (!url) return <p role="alert">Attachment path is invalid.</p>;
  const iframeSrc = isPDF ? `${url}#toolbar=0` : url;

  return (
    <div className={styles.attachmentViewer}>
      {totalCount > 1 && (
        <div className={styles.attachmentNumber}>
          {index}/{totalCount}
        </div>
      )}
      {isImage ? (
        <img
          src={url}
          alt={attachment.id || `Attachment ${index}`}
          className={styles.attachmentImage}
        />
      ) : (
        <iframe
          src={iframeSrc}
          className={styles.attachmentIframe}
          title={attachment.id || `Attachment ${index}`}
        />
      )}
    </div>
  );
};

export default AttachmentViewer;
