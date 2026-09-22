import { useState, useEffect } from 'react';
import api from '../lib/api';
import { X, Printer, IndianRupee, Download } from 'lucide-react';
import { signatureBase64 } from '../assets/signatureBase64';
import RecordPaymentModal from './RecordPaymentModal';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface InvoiceModalProps {
  orderId: number;
  onClose: () => void;
}


const CATEGORY_ORDER: Record<string, number> = {
  'chips': 1,
  'corn products': 2,
  'chocos': 3,
  'extruded': 4,
  'fryums': 5,
  'namkeen': 6,
  'biscuits': 7,
  'bakery': 8
};

const extractPriceOrWeight = (packSize: string): string | null => {
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

const getPackSizeWeight = (packSize: string): number => {
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
    
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    
    const catA = a.category_name ? String(a.category_name).toLowerCase().trim() : '';
    const catB = b.category_name ? String(b.category_name).toLowerCase().trim() : '';
    const rankA = CATEGORY_ORDER[catA] || 99;
    const rankB = CATEGORY_ORDER[catB] || 99;
    
    return rankA - rankB;
  });
};

const formatPackSize = (packSize: string) => {
  if (!packSize) return '';
  const match = String(packSize).match(/^(\d+)Rs/i);
  if (match) {
    const retailPrice = parseInt(match[1]);
    if (retailPrice <= 20) {
      return String(packSize).replace(/\s*\d+\s*(?:g|gm|kg)\s*$/i, '');
    }
  }
  return packSize;
};

const InvoiceModal = ({ orderId, onClose }: InvoiceModalProps) => {
  const [data, setData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [categorySummary, setCategorySummary] = useState<Record<string, number>>({});
  const [priceSummary, setPriceSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoiceDetail();
  }, [orderId]);

  const fetchInvoiceDetail = async () => {
    try {
      const response = await api.get(`/api/ledger/invoice/${orderId}`);
      setData(response.data);
      
      const summary: Record<string, number> = {};
      const pSummary: Record<string, number> = {};
      if (response.data && response.data.items) {
        response.data.items.forEach((item: any) => {
          const cat = item.category_name || 'Other';
          summary[cat] = (summary[cat] || 0) + item.executed_qty;
          
          const groupKey = extractPriceOrWeight(item.pack_size);
          if (groupKey) {
            pSummary[groupKey] = (pSummary[groupKey] || 0) + item.executed_qty;
          }
        });
      }
      setCategorySummary(summary);
      setPriceSummary(pSummary);
      
      try {
        const settingsRes = await api.get('/api/settings/company');
        setSettings(settingsRes.data);
      } catch (e) {
        console.error('Failed to fetch company settings');
      }

      try {
        const qrResponse = await api.get('/api/settings/company/qr', { responseType: 'blob' });
        if (qrResponse.data.size > 0) {
          const objectUrl = URL.createObjectURL(qrResponse.data);
          setQrPreview(objectUrl);
        }
      } catch (qrErr) {
        console.error('No QR code found or failed to fetch');
      }
    } catch (err) {
      setError('Invoice not generated yet or failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const invoiceElement = document.getElementById('invoice-content');
      if (!invoiceElement) throw new Error('Invoice content not found');

      const canvas = await html2canvas(invoiceElement, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      
      // A4 format size is 210 x 297 mm
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Ensure the image fits within the A4 page height, otherwise scale it down
      const finalHeight = pdfHeight > pdf.internal.pageSize.getHeight() ? pdf.internal.pageSize.getHeight() : pdfHeight;
      const finalWidth = pdfHeight > pdf.internal.pageSize.getHeight() ? (canvas.width * finalHeight) / canvas.height : pdfWidth;

      pdf.addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);
      pdf.save(`Invoice_${data.invoice.invoice_number}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px'
    }}>
      <div style={{
        background: '#fff', width: '100%', maxWidth: '1100px',
        maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }} className="printable-invoice">
        {/* Header Actions (Hidden when printing) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {data && data.invoice.payment_status !== 'PAID' && JSON.parse(localStorage.getItem('dms_user') || '{}').role === 'SD_ADMIN' && (
              <button onClick={() => setShowPaymentModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                <IndianRupee size={16} /> Record Payment
              </button>
            )}
            <button onClick={handleDownloadPdf} disabled={downloading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '6px', cursor: downloading ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
              <Download size={16} /> {downloading ? 'Generating...' : 'Download PDF'}
            </button>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#eff6ff', color: 'var(--primary)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
              <X size={16} /> Close
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading invoice...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
        ) : data ? (
          <div style={{ padding: '24px' }} id="invoice-content" className="invoice-container">
            
            {/* EXCEL INVOICE WRAPPER */}
            <div style={{ 
              border: '2px solid #000', /* Green outer border */
              fontFamily: 'Arial, sans-serif',
              color: '#000',
              fontSize: '14px',
              background: '#fff'
            }}>
              
              {/* Top Bar: TAX INVOICE */}
              <div style={{ 
                borderBottom: '2px solid #000', 
                textAlign: 'center', 
                fontWeight: 'bold', 
                fontSize: '16px', 
                padding: '4px' 
              }}>
                TAX INVOICE
              </div>
              
              {/* Company Details Row */}
              <div style={{ display: 'flex', borderBottom: '2px solid #000' }}>
                <div style={{ flex: 1, padding: '4px 8px', borderRight: '2px solid #000' }}>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: 'bold' }}>Anand Enterprises</h2>
                  <p style={{ margin: '0 0 2px 0' }}>Address : {settings?.address || ''}</p>
                  <p style={{ margin: '0 0 2px 0' }}>Mobile No. : {settings?.mobile_number || ''} , State : {settings?.state || ''}</p>
                  <p style={{ margin: '0' }}>GST No : {settings?.gst_number || ''} , FSSAI No : {settings?.fssai_number || ''}</p>
                </div>
                <div style={{ width: '180px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/logo.png" alt="Jolliz Logo" style={{ maxWidth: '120px', maxHeight: '80px', objectFit: 'contain' }} />
                </div>
              </div>
              
              {/* Bill To & Ship To Details Row */}
              <div style={{ display: 'flex', borderBottom: '2px solid #000' }}>
                <div style={{ flex: 1, padding: '4px 8px', borderRight: '2px solid #000' }}>
                  <p style={{ margin: '0 0 2px 0' }}><strong>Bill To:</strong> {data.invoice.firm_name}</p>
                  {data.invoice.owner_name && (
                    <p style={{ margin: '0 0 2px 0' }}>Owner Name: {data.invoice.owner_name}</p>
                  )}
                  <p style={{ margin: '0 0 2px 0' }}>Address: {data.invoice.address}</p>
                  {data.invoice.gst_number && (
                    <p style={{ margin: '0 0 2px 0' }}>GST No : {data.invoice.gst_number}</p>
                  )}
                  <p style={{ margin: '0' }}>Place Of Supply: Maharashtra {data.invoice.fssai_number ? `, FSSAI No : ${data.invoice.fssai_number}` : ''}</p>
                </div>
                <div style={{ flex: 1, padding: '4px 8px' }}>
                  <p style={{ margin: '0 0 2px 0' }}><strong>Ship To:</strong> {data.invoice.firm_name}</p>
                  {data.invoice.owner_name && (
                    <p style={{ margin: '0 0 2px 0' }}>Owner Name: {data.invoice.owner_name}</p>
                  )}
                  <p style={{ margin: '0 0 2px 0' }}>Address: {data.invoice.address}</p>
                  {data.invoice.gst_number && (
                    <p style={{ margin: '0 0 2px 0' }}>GST No : {data.invoice.gst_number}</p>
                  )}
                  <p style={{ margin: '0' }}>Place Of Supply: Maharashtra {data.invoice.fssai_number ? `, FSSAI No : ${data.invoice.fssai_number}` : ''}</p>
                </div>
              </div>
              
              {/* Bill No & Date Row */}
              <div style={{ display: 'flex', borderBottom: '2px solid #000' }}>
                <div style={{ flex: 1, padding: '4px 8px', borderRight: '2px solid #000', fontWeight: 'bold' }}>
                  BILL NO. : {data.invoice.invoice_number}
                </div>
                <div style={{ flex: 1, padding: '4px 8px', fontWeight: 'bold' }}>
                  Date : {new Date(data.invoice.created_at).toLocaleDateString('en-GB').split('/').join('-')}
                </div>
              </div>
              
              {/* Data Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000' }} className="excel-table">
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '30px' }}>#</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '50px' }}>HSN</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Item Name</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '50px' }}>UOM</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '40px' }}>Qty</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', width: '50px' }}>Rate</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '40px' }}>CGST %</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', width: '50px' }}>CGST Amt</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '40px' }}>SGST %</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', width: '50px' }}>SGST Amt</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', width: '60px' }}>Taxable Amt</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', width: '70px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sortItemsByCategory(data.items).map((item: any, idx: number) => {
                    const taxableAmt = item.executed_qty * item.price_at_order;
                    const gstPct = parseFloat(item.gst_percent) || 0;
                    const cgstRate = gstPct / 2;
                    const sgstRate = gstPct / 2;
                    const cgstAmt = taxableAmt * (cgstRate / 100);
                    const sgstAmt = taxableAmt * (sgstRate / 100);
                    const rowTotal = taxableAmt + cgstAmt + sgstAmt;

                    return (
                      <tr key={idx}>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{item.hsn_code || '-'}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', fontWeight: 'bold' }}>
                          {item.product_name} - {formatPackSize(item.pack_size)}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{item.uom || 'Box'}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                          {item.executed_qty}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'right', fontWeight: 'bold' }}>
                          {item.price_at_order}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{cgstRate}%</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'right' }}>{cgstAmt.toFixed(2)}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'center' }}>{sgstRate}%</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'right' }}>{sgstAmt.toFixed(2)}</td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'right', fontWeight: 'bold' }}>
                          {taxableAmt.toFixed(2)}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '2px 4px', textAlign: 'right', fontWeight: 'bold' }}>
                          {Math.round(rowTotal).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={4} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                      TOTAL
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold', color: '#ef4444' }}>
                      {data.items.reduce((sum: number, item: any) => sum + item.executed_qty, 0)}
                    </td>
                    <td colSpan={2} style={{ border: '1px solid #000', padding: '4px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                      {data.items.reduce((sum: number, item: any) => sum + (item.executed_qty * item.price_at_order * ((parseFloat(item.gst_percent) || 0) / 2 / 100)), 0).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                      {data.items.reduce((sum: number, item: any) => sum + (item.executed_qty * item.price_at_order * ((parseFloat(item.gst_percent) || 0) / 2 / 100)), 0).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                      {(data.invoice.subtotal || 0).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                      {Math.round(data.items.reduce((sum: number, item: any) => {
                          const taxable = item.executed_qty * item.price_at_order;
                          const gstPct = parseFloat(item.gst_percent) || 0;
                          return sum + taxable + (taxable * (gstPct / 100));
                      }, 0)).toFixed(2)}
                    </td>
                  </tr>
                  {(data.invoice.extra_discount > 0 || data.invoice.credit_applied > 0) && (
                    <>
                      {data.invoice.extra_discount > 0 && (
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                            Extra Discount {data.invoice.discount_reason ? `(${data.invoice.discount_reason})` : ''}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                            -{(data.invoice.extra_discount || 0).toFixed(2)}
                          </td>
                        </tr>
                      )}
                      {data.invoice.credit_applied > 0 && (
                        <tr>
                          <td colSpan={11} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                            Wallet Credit Applied
                          </td>
                          <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                            -{(data.invoice.credit_applied || 0).toFixed(2)}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={11} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                          FINAL PAYABLE AMOUNT
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f1f5f9', color: '#2563eb' }}>
                          {Math.round(data.items.reduce((sum: number, item: any) => {
                              const taxable = item.executed_qty * item.price_at_order;
                              const gstPct = parseFloat(item.gst_percent) || 0;
                              return sum + taxable + (taxable * (gstPct / 100));
                          }, 0) - (data.invoice.extra_discount || 0) - (data.invoice.credit_applied || 0)).toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              
              {/* Category Summary Table */}
              {Object.keys(categorySummary).length > 0 && (() => {
                const preferredOrder = [
                  'chips',
                  'corn products',
                  'chocos',
                  'extruded',
                  'fryums',
                  'namkeen',
                  'biscuits',
                  'bakery'
                ];
                
                const getCategorySortWeight = (catName: string) => {
                  const lowerName = catName.toLowerCase();
                  const index = preferredOrder.indexOf(lowerName);
                  return index !== -1 ? index : 999;
                };

                const sortedCategories = Object.keys(categorySummary).sort((a, b) => {
                  return getCategorySortWeight(a) - getCategorySortWeight(b);
                });

                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000' }} className="excel-table">
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f8fafc' }}>Filling Type</th>
                        {sortedCategories.map(cat => (
                          <th key={cat} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f8fafc', textTransform: 'uppercase' }}>{cat}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Box</td>
                        {sortedCategories.map(cat => (
                          <td key={cat} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                            {categorySummary[cat]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
              
              {/* Price Summary Table */}
              {Object.keys(priceSummary).length > 0 && (() => {
                const sortedPrices = Object.keys(priceSummary).sort((a, b) => {
                  return getPackSizeWeight(a) - getPackSizeWeight(b);
                });

                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000' }} className="excel-table">
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f8fafc' }}>Pack Size / Price</th>
                        {sortedPrices.map(price => (
                          <th key={price} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f8fafc' }}>{price}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>Total Box</td>
                        {sortedPrices.map(price => (
                          <td key={price} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                            {priceSummary[price]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
              
              {/* Footer / Notes Row */}
              <div style={{ display: 'flex', minHeight: '150px' }}>
                <div style={{ flex: 1, padding: '4px 8px', borderRight: '2px solid #000', fontSize: '13px', fontWeight: 'bold' }}>
                  <p style={{ margin: '0 0 2px 0' }}>Note:</p>
                  <p style={{ margin: '0 0 2px 0' }}>1. Order By: {data.invoice.owner_name || '-'}</p>
                  <p style={{ margin: '0 0 2px 0' }}>2. Goods Check Before Received!</p>
                  <p style={{ margin: '0 0 2px 0' }}>3. Subject to jurisdiction : Palghar</p>
                </div>
                <div style={{ width: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid #000' }}>
                  <div style={{ 
                    width: '160px', 
                    height: '160px'
                  }}>
                    {qrPreview && (
                      <img 
                        src={qrPreview} 
                        alt="Payment QR" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '14px', fontWeight: 'bold' }}>
                  <p style={{ margin: '0 0 2px 0' }}>For Anand Enterprises</p>
                  <img src={signatureBase64} alt="Signature" style={{ width: '100px', height: 'auto', margin: '10px 0' }} />
                  <p style={{ margin: '0 0 2px 0' }}>Authorised Signatory</p>
                </div>
              </div>
              
            </div>
            
          </div>
        ) : null}
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-invoice, .printable-invoice * { visibility: visible; }
          
          .modal-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            display: block !important;
            overflow: visible !important;
          }

          .printable-invoice { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important; 
            border-radius: 0 !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
          
          .no-print { display: none !important; }

          @page {
            size: A4 portrait;
            margin: 0; 
          }
          
          .invoice-container {
            padding: 10mm !important; /* Move margin inside the container so browser headers are hidden */
          }
          
          .excel-table td, .excel-table th {
            border: 1px solid #000 !important;
          }
        }
      `}</style>
      {showPaymentModal && data && (
        <RecordPaymentModal 
          invoice={data.invoice} 
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            fetchInvoiceDetail(); // refresh data
          }}
        />
      )}
    </div>
  );
};

export default InvoiceModal;
