import { getAuthenticatedDocumentUrl } from '@bahmni/services';

export const resolveDocumentSrc = (src: string): string =>
  src.startsWith('blob:') ? src : (getAuthenticatedDocumentUrl(src) ?? '#');
