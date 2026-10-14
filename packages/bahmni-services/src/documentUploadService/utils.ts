import { DEFAULT_FILE_TYPE } from './constants';
import { ProcessedFileData } from './models';

export const getDocumentPath = (
  value: unknown,
  directory: 'document_images' | 'uploaded_results' = 'document_images',
): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  let path = value.replace(new RegExp(`^/?${directory}/`), '');
  try {
    for (let i = 0; i < 3 && path.includes('%'); i++)
      path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (
    // eslint-disable-next-line no-control-regex -- Reject control characters in server-provided paths.
    /[:?#\\%\u0000-\u001f\u007f]/.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => part === '..' || part === '.' || !part)
  )
    return undefined;
  return path;
};

export const getAuthenticatedDocumentUrl = (
  value: unknown,
  directory: 'document_images' | 'uploaded_results' = 'document_images',
): string | undefined => {
  const path = getDocumentPath(value, directory);
  return path
    ? `/openmrs/auth?requested_document=/${directory}/${path.split('/').map(encodeURIComponent).join('/')}`
    : undefined;
};

export async function processFileForUpload(
  file: File,
): Promise<ProcessedFileData> {
  // Bahmni's ImageIO upload processor cannot read or write WebP. Do not
  // silently convert a clinical image and change its original representation.
  if (file.type === 'image/webp' || /\.webp$/i.test(file.name))
    throw new Error(
      'WebP is not supported. Choose a JPEG, PNG, GIF image or PDF.',
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Content = (reader.result as string).split(',')[1];
      if (!base64Content) {
        reject(new Error('File is empty or could not be read'));
        return;
      }
      const fullFileName = file.name;
      let fileName = fullFileName;
      let format = '';
      const lastDotIndex = fullFileName.lastIndexOf('.');

      if (lastDotIndex !== -1) {
        fileName = fullFileName.substring(0, lastDotIndex);
        format = fullFileName.substring(lastDotIndex + 1).toLowerCase();
      }

      const fileType = file.type ? file.type.split('/')[0] : DEFAULT_FILE_TYPE;

      resolve({
        content: base64Content,
        fileName,
        fileType,
        format,
      });
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}
