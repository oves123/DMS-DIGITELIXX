import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { R2Bucket } from '@cloudflare/workers-types';
import { logoBase64, signatureBase64 } from './assets';

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
  const safeItems = items || [];

  const docDefinition: any = {
    content: [
      {
        table: {
          widths: ['*'],
          body: [
            [
              { text: 'Credit Note', alignment: 'center', bold: true, fontSize: 14, margin: [0, 4, 0, 4] }
            ],
            [
              {
                table: {
                  widths: ['*', 180],
                  body: [
                    [
                      {
                        text: [
                          { text: 'Anand Enterprises\n', fontSize: 18, bold: true },
                          `Address : ${settings?.address || ''}\n`,
                          `State : ${settings?.state || ''}\n`,
                          `GST No : ${settings?.gst_number || ''} , FSSAI No : ${settings?.fssai_number || ''}`
                        ],
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        image: logoBase64,
                        width: 120,
                        alignment: 'center',
                        margin: [0, 10, 0, 0],
                        border: [false, false, false, false]
                      }
                    ]
                  ]
                },
                margin: [0, 0, 0, 0],
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: (i: number) => (i === 1 ? 2 : 0)
                }
              }
            ],
            [
              {
                text: [
                  { text: `Bill To: ${distributorDetails.firm_name}\n`, bold: true },
                  distributorDetails.owner_name ? `Owner Name: ${distributorDetails.owner_name}\n` : '',
                  `Address: ${distributorDetails.address || '-'}\n`,
                  `Place Of Supply: Maharashtra${distributorDetails.fssai_number ? ` , FSSAI No : ${distributorDetails.fssai_number}` : ''}`
                ],
                margin: [4, 4, 4, 4]
              }
            ],
            [
              {
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      { text: `CREDIT NOTE NO. : ${credit_note.credit_note_number}`, bold: true, margin: [4, 4, 4, 4], border: [false, false, true, false] },
                      { text: `Date : ${new Date(credit_note.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')}`, bold: true, margin: [4, 4, 4, 4], border: [false, false, false, false] }
                    ]
                  ]
                },
                margin: [0, 0, 0, 0],
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: (i: number) => (i === 1 ? 2 : 0)
                }
              }
            ],
            [
              {
                table: {
                  headerRows: 1,
                  widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                  body: [
                    [
                      { text: 'Sr. no', alignment: 'center', bold: true },
                      { text: 'Product', bold: true },
                      { text: 'Pack Size', alignment: 'center', bold: true },
                      { text: 'Reason', alignment: 'center', bold: true },
                      { text: 'Defective Box', alignment: 'center', bold: true },
                      { text: 'Defective Pcs', alignment: 'center', bold: true },
                      { text: 'Amount', alignment: 'right', bold: true }
                    ],
                    ...safeItems.map((item: any, idx: number) => {
                      const taxableAmt = item.item_total || 0;
                      const gstPct = parseFloat(item.gst_percent) || 0;
                      const cgstAmt = taxableAmt * ((gstPct / 2) / 100);
                      const sgstAmt = taxableAmt * ((gstPct / 2) / 100);
                      const rowTotal = taxableAmt + cgstAmt + sgstAmt;
                      
                      return [
                        { text: idx + 1, alignment: 'center', margin: [0, 4, 0, 4] },
                        { text: item.product_name, bold: true, margin: [0, 4, 0, 4] },
                        { text: (item.pack_size && item.pack_size !== '-') ? item.pack_size : '-', alignment: 'center', margin: [0, 4, 0, 4] },
                        { text: item.reason || '-', alignment: 'center', margin: [0, 4, 0, 4] },
                        { text: item.quantity || 0, alignment: 'center', margin: [0, 4, 0, 4] },
                        { text: item.pieces_qty || 0, alignment: 'center', margin: [0, 4, 0, 4] },
                        { text: Math.round(rowTotal).toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] }
                      ];
                    }),
                    [
                      { text: 'Total', colSpan: 6, alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                      {}, {}, {}, {}, {},
                      { text: Math.round(parseFloat(credit_note.amount) || 0).toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 1,
                  vLineWidth: () => 1,
                  hLineColor: () => '#000000',
                  vLineColor: () => '#000000'
                },
                margin: [0, 0, 0, 0]
              }
            ],
            [
              {
                table: {
                  widths: ['*', 180],
                  body: [
                    [
                      {
                        text: [
                          { text: 'Note:\n', bold: true },
                          credit_note.applied_details ? { text: `Amount Applied To: ${credit_note.applied_details}\n`, color: '#059669', bold: true } : '',
                          { text: `1. Order By: ${distributorDetails.owner_name || '-'}\n`, bold: true },
                          { text: '2. Goods Check Before Received:\n', bold: true },
                          { text: '3. Subject to jurisdiction : Palghar', bold: true }
                        ],
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        text: [
                          { text: 'For Anand Enterprises\n', bold: true },
                          signatureBase64 ? { image: signatureBase64, width: 100, alignment: 'center' } : '\n\n',
                          { text: 'Authorised Signatory', bold: true }
                        ],
                        alignment: 'right',
                        margin: [4, 4, 4, 4],
                        border: [false, false, false, false]
                      }
                    ]
                  ]
                },
                margin: [0, 0, 0, 0],
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: (i: number) => (i === 1 ? 2 : 0)
                }
              }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 2,
          vLineWidth: () => 2,
          hLineColor: () => '#000000',
          vLineColor: () => '#000000'
        }
      }
    ],
    defaultStyle: {
      fontSize: 10,
      color: '#000000'
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
