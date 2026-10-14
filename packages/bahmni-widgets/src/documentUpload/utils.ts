export const isAcceptedFileType = (mimeType: string): boolean =>
  (mimeType.startsWith('image/') && mimeType !== 'image/webp') ||
  mimeType.startsWith('video/') ||
  mimeType === 'application/pdf';
