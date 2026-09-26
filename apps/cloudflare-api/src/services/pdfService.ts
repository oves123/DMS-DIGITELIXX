import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { R2Bucket } from '@cloudflare/workers-types';
import { logoBase64, signatureBase64 } from './assets';

// Initialize fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;


// Helper functions for categorization
const CATEGORY_ORDER: any = {
  'chips': 1, 'corn products': 2, 'chocos': 3, 'extruded': 4,
  'fryums': 5, 'namkeen': 6, 'biscuits': 7, 'bakery': 8
};

const extractPriceOrWeight = (packSize: string) => {
  if (!packSize) return null;
  const str = String(packSize).trim();
  const rsMatch = str.match(/(\d+)Rs/i);
  if (rsMatch) return `${rsMatch[1]}Rs`;
  const weightMatch = str.match(/(\d+(?:\.\d+)?)\s*(g|gm|kg|ml|l)/i);
  if (weightMatch) {
    let unit = weightMatch[2].toLowerCase();
    if (unit === 'gm') unit = 'g';
    return `${weightMatch[1]}${unit}`;
  }
  return null;
};

const formatPackSize = (packSize: string) => {
  if (!packSize) return '';
  const match = String(packSize).match(/^(\d+)Rs/i);
  if (match) {
    const retailPrice = parseInt(match[1], 10);
    if (retailPrice <= 20) return String(packSize).replace(/\s*\d+\s*(?:g|gm|kg)\s*$/i, '');
  }
  return packSize;
};

const getPackSizeWeight = (packSize: string) => {
  if (!packSize) return 999999;
  const str = String(packSize).toLowerCase();
  const numMatch = str.match(/(\d+(\.\d+)?)/);
  const num = numMatch ? parseFloat(numMatch[1]) : 0;
  if (str.includes('rs')) return num;
  if (str.includes('kg')) return 10000 + (num * 1000);
  if (str.includes('gm') || str.includes('g')) return 10000 + num;
  if (str.includes('l') && !str.includes('ml')) return 20000 + (num * 1000);
  if (str.includes('ml')) return 20000 + num;
  return 999000 + num;
};

const sortItemsByCategory = (items: any[]) => {
  if (!items || !Array.isArray(items)) return items;
  return [...items].sort((a, b) => {
    const weightA = getPackSizeWeight(a.pack_size);
    const weightB = getPackSizeWeight(b.pack_size);
    if (weightA !== weightB) return weightA - weightB;
    const catA = a.category_name ? String(a.category_name).toLowerCase().trim() : '';
    const catB = b.category_name ? String(b.category_name).toLowerCase().trim() : '';
    const rankA = CATEGORY_ORDER[catA] || 99;
    const rankB = CATEGORY_ORDER[catB] || 99;
    return rankA - rankB;
  });
};

function arrayBufferToBase64(buffer: any) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export const generateInvoicePdf = async (invoiceData: any, settings: any, bucket: R2Bucket): Promise<string> => {
  const { invoice, items } = invoiceData;
  const safeItems = sortItemsByCategory(items || []);

  const categorySummary: any = {};
  const priceSummary: any = {};
  safeItems.forEach((item: any) => {
      const cat = item.category_name || 'Other';
      categorySummary[cat] = (categorySummary[cat] || 0) + (item.executed_qty || 0);
      const groupKey = extractPriceOrWeight(item.pack_size);
      if (groupKey) {
          priceSummary[groupKey] = (priceSummary[groupKey] || 0) + (item.executed_qty || 0);
      }
  });

  const preferredOrder = ['chips', 'corn products', 'chocos', 'extruded', 'fryums', 'namkeen', 'biscuits', 'bakery'];
  const getCategorySortWeight = (catName: string) => {
    const lowerName = catName.toLowerCase();
    const index = preferredOrder.indexOf(lowerName);
    return index !== -1 ? index : 999;
  };
  const sortedCategories = Object.keys(categorySummary).sort((a, b) => getCategorySortWeight(a) - getCategorySortWeight(b));
  const sortedPrices = Object.keys(priceSummary).sort((a, b) => getPackSizeWeight(a) - getPackSizeWeight(b));

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalAmount = 0;
  let totalQty = 0;

  let qrCodeBase64 = '';
  if (settings?.qr_code_image) {
      try {
          qrCodeBase64 = arrayBufferToBase64(settings.qr_code_image);
      } catch (e) {
          console.error('Error converting qr image to base64', e);
      }
  }

  const docDefinition: any = {
    content: [
      {
        table: {
          widths: ['*'],
          body: [
            [
              { text: 'TAX INVOICE', alignment: 'center', bold: true, fontSize: 14, margin: [0, 4, 0, 4] }
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
                          `Mobile No. : ${settings?.mobile_number || ''} , State : ${settings?.state || 'Maharashtra'}\n`,
                          `GST No : ${settings?.gst_number || ''} , FSSAI No : ${settings?.fssai_number || ''}`
                        ],
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        image: logoBase64,
                        width: 100,
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
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      {
                        text: [
                          { text: `Bill To: ${invoice.firm_name || '-'}\n`, bold: true },
                          invoice.owner_name ? `Owner Name: ${invoice.owner_name}\n` : '',
                          `Address: ${invoice.address || '-'}\n`,
                          invoice.gst_number ? `GST No : ${invoice.gst_number}\n` : '',
                          `Place Of Supply: Maharashtra${invoice.fssai_number ? ` , FSSAI No : ${invoice.fssai_number}` : ''}`
                        ],
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        text: [
                          { text: `Ship To: ${invoice.firm_name || '-'}\n`, bold: true },
                          invoice.owner_name ? `Owner Name: ${invoice.owner_name}\n` : '',
                          `Address: ${invoice.address || '-'}\n`,
                          invoice.gst_number ? `GST No : ${invoice.gst_number}\n` : '',
                          `Place Of Supply: Maharashtra${invoice.fssai_number ? ` , FSSAI No : ${invoice.fssai_number}` : ''}`
                        ],
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
            ],
            [
              {
                table: {
                  widths: ['*', '*'],
                  body: [
                    [
                      { text: `BILL NO. : ${invoice.invoice_number}`, bold: true, margin: [4, 4, 4, 4], border: [false, false, true, false] },
                      { text: `Date : ${new Date(invoice.created_at || Date.now()).toLocaleDateString('en-GB').replace(/\//g, '-')}`, bold: true, margin: [4, 4, 4, 4], border: [false, false, false, false] }
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
                  widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                  body: [
                    [
                      { text: '#', alignment: 'center', bold: true },
                      { text: 'HSN', alignment: 'center', bold: true },
                      { text: 'Item Name', bold: true },
                      { text: 'UOM', alignment: 'center', bold: true },
                      { text: 'Qty', alignment: 'center', bold: true },
                      { text: 'Rate', alignment: 'right', bold: true },
                      { text: 'CGST\n%', alignment: 'center', bold: true },
                      { text: 'CGST\nAmt', alignment: 'right', bold: true },
                      { text: 'SGST\n%', alignment: 'center', bold: true },
                      { text: 'SGST\nAmt', alignment: 'right', bold: true },
                      { text: 'Taxable Amt', alignment: 'right', bold: true },
                      { text: 'Amount', alignment: 'right', bold: true }
                    ],
                    ...safeItems.map((item: any, idx: number) => {
                      const taxableAmt = (item.executed_qty || 0) * (item.price_at_order || 0);
                      const gstPct = parseFloat(item.gst_percent) || 0;
                      const cgstAmt = taxableAmt * ((gstPct / 2) / 100);
                      const sgstAmt = taxableAmt * ((gstPct / 2) / 100);
                      const rowTotal = taxableAmt + cgstAmt + sgstAmt;
                      
                      totalTaxable += taxableAmt;
                      totalCgst += cgstAmt;
                      totalSgst += sgstAmt;
                      totalAmount += rowTotal;
                      totalQty += (item.executed_qty || 0);
                      
                      const packDisplay = formatPackSize(item.pack_size);
                      const displayName = packDisplay ? `${item.product_name} - ${packDisplay}` : item.product_name;

                      return [
                        { text: idx + 1, alignment: 'center', margin: [0, 2, 0, 2] },
                        { text: item.hsn_code || '-', alignment: 'center', margin: [0, 2, 0, 2] },
                        { text: displayName || '-', bold: true, margin: [0, 2, 0, 2] },
                        { text: item.uom || 'Box', alignment: 'center', margin: [0, 2, 0, 2] },
                        { text: item.executed_qty || 0, alignment: 'center', bold: true, margin: [0, 2, 0, 2] },
                        { text: parseFloat(item.price_at_order || 0).toFixed(2), alignment: 'right', bold: true, margin: [0, 2, 0, 2] },
                        { text: (gstPct / 2).toFixed(1) + '%', alignment: 'center', margin: [0, 2, 0, 2] },
                        { text: cgstAmt.toFixed(2), alignment: 'right', margin: [0, 2, 0, 2] },
                        { text: (gstPct / 2).toFixed(1) + '%', alignment: 'center', margin: [0, 2, 0, 2] },
                        { text: sgstAmt.toFixed(2), alignment: 'right', margin: [0, 2, 0, 2] },
                        { text: taxableAmt.toFixed(2), alignment: 'right', bold: true, margin: [0, 2, 0, 2] },
                        { text: Math.round(rowTotal).toFixed(2), alignment: 'right', bold: true, margin: [0, 2, 0, 2] }
                      ];
                    }),
                    [
                      { text: 'TOTAL', colSpan: 4, alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                      {}, {}, {},
                      { text: totalQty, alignment: 'center', bold: true, margin: [0, 4, 0, 4], color: '#ef4444' },
                      { text: '', alignment: 'center', margin: [0, 4, 0, 4] },
                      { text: '', alignment: 'center', margin: [0, 4, 0, 4] },
                      { text: totalCgst.toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                      { text: '', alignment: 'center', margin: [0, 4, 0, 4] },
                      { text: totalSgst.toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                      { text: totalTaxable.toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                      { text: Math.round(totalAmount).toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] }
                    ],
                    ...(invoice.extra_discount ? [
                      [
                        { text: 'Extra Discount', colSpan: 11, alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                        {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                        { text: `-${Number(invoice.extra_discount).toFixed(2)}`, alignment: 'right', bold: true, margin: [0, 4, 0, 4], color: '#ef4444' }
                      ],
                      [
                        { text: 'FINAL PAYABLE', colSpan: 11, alignment: 'right', bold: true, margin: [0, 4, 0, 4] },
                        {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                        { text: Math.round(totalAmount - (invoice.extra_discount || 0)).toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] }
                      ]
                    ] : [])
                  ]
                },
                margin: [0, 0, 0, 0]
              }
            ],
            ...(sortedCategories.length > 0 ? [
              [
                {
                  table: {
                    widths: ['auto', ...sortedCategories.map(() => '*')],
                    body: [
                      [
                        { text: 'Filling Type', alignment: 'center', bold: true, fillColor: '#f8fafc', margin: [0, 4, 0, 4] },
                        ...sortedCategories.map((cat: string) => ({ text: cat.toUpperCase(), alignment: 'center', bold: true, fillColor: '#f8fafc', margin: [0, 4, 0, 4] }))
                      ],
                      [
                        { text: 'Box', alignment: 'center', bold: true, margin: [0, 4, 0, 4] },
                        ...sortedCategories.map((cat: string) => ({ text: categorySummary[cat] || 0, alignment: 'center', bold: true, margin: [0, 4, 0, 4] }))
                      ]
                    ]
                  },
                  margin: [0, 0, 0, 0],
                  layout: {
                    hLineWidth: () => 1,
                    vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 0 : 1,
                    hLineColor: () => '#000000',
                    vLineColor: () => '#000000'
                  }
                }
              ]
            ] : []),
            ...(sortedPrices.length > 0 ? [
              [
                {
                  table: {
                    widths: ['auto', ...sortedPrices.map(() => '*')],
                    body: [
                      [
                        { text: 'Pack Size / Price', alignment: 'center', bold: true, fillColor: '#f8fafc', margin: [0, 4, 0, 4] },
                        ...sortedPrices.map((price: string) => ({ text: price, alignment: 'center', bold: true, fillColor: '#f8fafc', margin: [0, 4, 0, 4] }))
                      ],
                      [
                        { text: 'Total Box', alignment: 'center', bold: true, margin: [0, 4, 0, 4] },
                        ...sortedPrices.map((price: string) => ({ text: priceSummary[price] || 0, alignment: 'center', bold: true, margin: [0, 4, 0, 4] }))
                      ]
                    ]
                  },
                  margin: [0, 0, 0, 0],
                  layout: {
                    hLineWidth: () => 1,
                    vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 0 : 1,
                    hLineColor: () => '#000000',
                    vLineColor: () => '#000000'
                  }
                }
              ]
            ] : []),
            [
              {
                table: {
                  widths: ['*', 100, 180],
                  body: [
                    [
                      {
                        text: [
                          { text: 'Note:\n', bold: true },
                          { text: `1. Order By: ${invoice.owner_name || '-'}\n`, bold: true },
                          { text: '2. Goods Check Before Received!\n', bold: true },
                          { text: '3. Subject to jurisdiction : Palghar', bold: true }
                        ],
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        stack: qrCodeBase64 ? [
                          { image: `data:${settings.qr_code_mimetype || 'image/png'};base64,${qrCodeBase64}`, width: 80, alignment: 'center', margin: [0, 5, 0, 5] }
                        ] : [{ text: '\n', margin: [0, 20, 0, 20] }],
                        alignment: 'center',
                        margin: [4, 4, 4, 4],
                        border: [false, false, true, false]
                      },
                      {
                        stack: [
                          { text: 'For Anand Enterprises\n', bold: true, alignment: 'right' },
                          signatureBase64 ? { image: signatureBase64, width: 75, alignment: 'right', margin: [0, 2, 0, 2] } : { text: '\n\n', alignment: 'right' },
                          { text: 'Authorised Signatory', bold: true, alignment: 'right' }
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
                  vLineWidth: (i: number) => (i === 1 || i === 2) ? 2 : 0
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
      fontSize: 8,
      color: '#000000'
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
                      { text: Math.round(parseFloat(credit_note.total_amount) || 0).toFixed(2), alignment: 'right', bold: true, margin: [0, 4, 0, 4] }
                    ]
                  ]
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
                        stack: [
                          { text: 'For Anand Enterprises\n', bold: true, alignment: 'right' },
                          signatureBase64 ? { image: signatureBase64, width: 75, alignment: 'right', margin: [0, 2, 0, 2] } : { text: '\n\n', alignment: 'right' },
                          { text: 'Authorised Signatory', bold: true, alignment: 'right' }
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
