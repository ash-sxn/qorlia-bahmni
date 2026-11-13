import {
  processFileForUpload,
  getDocumentPath,
  getAuthenticatedDocumentUrl,
} from '../utils';

it('keeps attachment paths within their directory and safely encodes the query value', () => {
  expect(getDocumentPath('/document_images/100/report.pdf')).toBe(
    '100/report.pdf',
  );
  expect(getAuthenticatedDocumentUrl('100/my%20report.pdf')).toBe(
    '/openmrs/auth?requested_document=/document_images/100/my%20report.pdf',
  );
  expect(
    getAuthenticatedDocumentUrl('results/report.pdf', 'uploaded_results'),
  ).toBe(
    '/openmrs/auth?requested_document=/uploaded_results/results/report.pdf',
  );
  expect(
    getAuthenticatedDocumentUrl('file.pdf&requested_document=/secret'),
  ).toBe(
    '/openmrs/auth?requested_document=/document_images/file.pdf%26requested_document%3D/secret',
  );
  for (const path of [
    'https://example.com/file.pdf',
    '//example.com/a',
    '../secret',
    '100/%252e%252e/secret',
    'a\\b',
    'file.pdf#foo',
    'a%00b',
    'a%xx',
  ]) {
    expect(getAuthenticatedDocumentUrl(path)).toBeUndefined();
  }
});

describe('processFileForUpload', () => {
  const mockFileReaderInstance = {
    readAsDataURL: jest.fn(),
    onload: null as any,
    onerror: null as any,
    result: null as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).FileReader = jest.fn(() => mockFileReaderInstance);
  });

  it.each([
    ['scan.webp', 'image/webp'],
    ['scan.WEBP', 'image/png'],
  ])('rejects unsupported WebP before reading %s', async (name, type) => {
    await expect(
      processFileForUpload(new File(['image'], name, { type })),
    ).rejects.toThrow('WebP is not supported');
    expect(mockFileReaderInstance.readAsDataURL).not.toHaveBeenCalled();
  });

  it('should process image file and return base64 content with metadata', async () => {
    const mockFile = new File(
      ['test'],
      'Screenshot 2025-03-22 at 7.10.26 PM.png',
      {
        type: 'image/png',
      },
    );

    const processPromise = processFileForUpload(mockFile);

    mockFileReaderInstance.result =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    mockFileReaderInstance.onload();

    const result = await processPromise;

    expect(result).toEqual({
      content: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
      fileName: 'Screenshot 2025-03-22 at 7.10.26 PM',
      fileType: 'image',
      format: 'png',
    });
    expect(mockFileReaderInstance.readAsDataURL).toHaveBeenCalledWith(mockFile);
  });

  it('should process PDF file correctly', async () => {
    const mockFile = new File(['test'], 'document.pdf', {
      type: 'application/pdf',
    });

    const processPromise = processFileForUpload(mockFile);

    mockFileReaderInstance.result = 'data:application/pdf;base64,JVBERi0xLjQK';
    mockFileReaderInstance.onload();

    const result = await processPromise;

    expect(result).toEqual({
      content: 'JVBERi0xLjQK',
      fileName: 'document',
      fileType: 'application',
      format: 'pdf',
    });
  });

  it('should handle file without extension', async () => {
    const mockFile = new File(['test'], 'file-without-extension', {
      type: 'text/plain',
    });

    const processPromise = processFileForUpload(mockFile);

    mockFileReaderInstance.result = 'data:text/plain;base64,dGVzdA==';
    mockFileReaderInstance.onload();

    const result = await processPromise;

    expect(result).toEqual({
      content: 'dGVzdA==',
      fileName: 'file-without-extension',
      fileType: 'text',
      format: '',
    });
  });

  it('should handle file without MIME type', async () => {
    const mockFile = new File(['test'], 'file.bin', { type: '' });

    const processPromise = processFileForUpload(mockFile);

    mockFileReaderInstance.result = 'data:;base64,dGVzdA==';
    mockFileReaderInstance.onload();

    const result = await processPromise;

    expect(result.fileType).toBe('application');
  });

  it('should reject when file reading fails', async () => {
    const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

    const processPromise = processFileForUpload(mockFile);
    mockFileReaderInstance.onerror();

    await expect(processPromise).rejects.toThrow('Failed to read file');
  });
});
