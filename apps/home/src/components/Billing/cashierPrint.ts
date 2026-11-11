import {
  downloadDocumentReport,
  downloadInvoiceReport,
} from './billingService';

type PdfLoad = () => Promise<{ filename: string; blob: Blob }>;

// Long enough for the new tab to read the PDF before its URL is released.
const RELEASE_AFTER_MS = 60_000;

const download = (url: string, filename: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
};

/** Prints from a hidden frame when no tab may be opened. */
const printInPage = (url: string, filename: string) => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => {
    try {
      frame.contentWindow?.print();
    } catch {
      download(url, filename);
    }
    window.setTimeout(() => frame.remove(), RELEASE_AFTER_MS);
  };
  frame.src = url;
  document.body.appendChild(frame);
};

/**
 * Opens a Billing PDF in a new tab, where the browser's viewer prints it in one
 * step. The tab is opened before the PDF loads, while the click still counts,
 * so pop-up blockers allow it. Where tabs are blocked, the page prints the PDF
 * itself.
 */
export async function openPdfForPrint(load: PdfLoad): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { filename, blob } = await load();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else printInPage(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), RELEASE_AFTER_MS);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export const printReceipt = (paymentId: number) =>
  openPdfForPrint(() =>
    downloadDocumentReport('payment', paymentId, 'payment_receipt'),
  );

export const printBill = (invoiceId: number) =>
  openPdfForPrint(() => downloadInvoiceReport(invoiceId, 'invoice'));
