import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { R2Bucket } from '@cloudflare/workers-types';

// Initialize fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

export const generateInvoicePdf = async (invoiceData: any, settings: any, bucket: R2Bucket): Promise<string> => {
  const { invoice, items } = invoiceData;

  const docDefinition: any = {
    content: [
      { text: 'TAX INVOICE', style: 'header', alignment: 'center' },
      { text: `Anand Enterprises\nAddress: ${settings?.address || ''}\nGST No: ${settings?.gst_number || ''}`, margin: [0, 10, 0, 10] },
      { text: `Bill To: ${invoice.firm_name}\nAddress: ${invoice.address}\nBill No: ${invoice.invoice_number}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [
            ['#', 'Item Name', 'Qty', 'Rate', 'Amount'],
            ...(items || []).map((item: any, idx: number) => [
              idx + 1,
              item.product_name,
              item.executed_qty,
              item.price_at_order,
              (item.executed_qty * item.price_at_order).toFixed(2)
            ])
          ]
        }
      }
    ],
    styles: {
      header: { fontSize: 18, bold: true }
    }
  };

  const pdfDocGenerator = (pdfMake as any).createPdf(docDefinition);
  
  // Convert to array buffer
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    pdfDocGenerator.getBuffer((buffer: Uint8Array) => {
      resolve(buffer.buffer as ArrayBuffer);
    });
  });

  const fileName = `invoices/invoice_${invoice.invoice_number}_${Date.now()}.pdf`;
  
  // Upload to R2
  await bucket.put(fileName, buffer, {
    httpMetadata: { contentType: 'application/pdf' }
  });

  return fileName;
};

export const generateLedgerPdf = async (ledgerData: any, distributorDetails: any, settings: any, bucket: R2Bucket): Promise<string> => {
  const { summary, history } = ledgerData;

  const docDefinition: any = {
    content: [
      { text: 'STATEMENT OF ACCOUNT', style: 'header', alignment: 'center' },
      { text: `Distributor: ${distributorDetails.firm_name}\nTotal Pending: ₹${summary.total_pending}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto', 'auto'],
          body: [
            ['Date', 'Details', 'Debit', 'Credit', 'Balance'],
            ...(history || []).map((row: any) => [
              new Date(row.date).toLocaleDateString(),
              row.type,
              row.debit || '-',
              row.credit || '-',
              row.balance
            ])
          ]
        }
      }
    ],
    styles: {
      header: { fontSize: 18, bold: true }
    }
  };

  const pdfDocGenerator = (pdfMake as any).createPdf(docDefinition);
  
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    pdfDocGenerator.getBuffer((buffer: Uint8Array) => {
      resolve(buffer.buffer as ArrayBuffer);
    });
  });

  const fileName = `ledgers/ledger_${distributorDetails.distributor_id}_${Date.now()}.pdf`;
  
  await bucket.put(fileName, buffer, {
    httpMetadata: { contentType: 'application/pdf' }
  });

  return fileName;
};

export const generateCreditNotePdf = async (creditNoteData: any, distributorDetails: any, settings: any, bucket: R2Bucket): Promise<string> => {
  const { credit_note, items } = creditNoteData;

  const docDefinition: any = {
    content: [
      { text: 'CREDIT NOTE', style: 'header', alignment: 'center' },
      { text: `Distributor: ${distributorDetails.firm_name}\nCredit Note No: ${credit_note.credit_note_number}`, margin: [0, 10, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto'],
          body: [
            ['#', 'Product', 'Reason', 'Amount'],
            ...(items || []).map((item: any, idx: number) => [
              idx + 1,
              item.product_name,
              item.reason || '-',
              item.item_total
            ])
          ]
        }
      }
    ],
    styles: {
      header: { fontSize: 18, bold: true }
    }
  };

  const pdfDocGenerator = (pdfMake as any).createPdf(docDefinition);
  
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    pdfDocGenerator.getBuffer((buffer: Uint8Array) => {
      resolve(buffer.buffer as ArrayBuffer);
    });
  });

  const safeNumber = String(credit_note.credit_note_number).replace(/[/\\]/g, '_');
  const fileName = `credit_notes/cn_${safeNumber}_${Date.now()}.pdf`;
  
  await bucket.put(fileName, buffer, {
    httpMetadata: { contentType: 'application/pdf' }
  });

  return fileName;
};
