import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './Toast';
import { X, Download } from 'lucide-react';
import { signatureBase64 } from '../assets/signatureBase64';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface CreditNoteModalProps {
  distributor: any;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_ORDER: Record<string, number> = {
  'chips': 1,
  'popcorn': 2,
  'fryums': 3,
  'namkeen': 4,
  'kurkure': 5,
  'choco bites': 6
};

const sortItemsByCategory = (items: any[]) => {
  if (!items || !Array.isArray(items)) return items;
  return [...items].sort((a, b) => {
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

const CreditNoteModal: React.FC<CreditNoteModalProps> = ({ distributor, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'defective' | 'direct'>('defective');
  
  // Defective mode state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any>({});
  
  // Direct mode state
  const [directAmount, setDirectAmount] = useState('');
  const [directReason, setDirectReason] = useState('Subsidy / Direct Credit');
  
  const [isPaidOut, setIsPaidOut] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [loadingItems, setLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PDF / Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [data, setData] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (distributor && distributor.invoices) {
        setInvoices(distributor.invoices);
    }
  }, [distributor]);

  const handleInvoiceSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const invId = e.target.value;
    if (!invId) {
        setSelectedInvoice(null);
        setInvoiceItems([]);
        setSelectedItems({});
        return;
    }
    const inv = invoices.find(i => i.invoice_id.toString() === invId);
    setSelectedInvoice(inv);
    
    if (inv) {
        setLoadingItems(true);
        try {
            const res = await api.get(`/api/ledger/invoice/${inv.order_id}`);
            setInvoiceItems(res.data.items || []);
            setSelectedItems({});
        } catch (err) {
            showToast('Failed to load invoice items', 'error');
        } finally {
            setLoadingItems(false);
        }
    }
  };

  const handleItemToggle = (item: any) => {
    const id = item.order_item_id;
    if (selectedItems[id]) {
        const newSel = { ...selectedItems };
        delete newSel[id];
        setSelectedItems(newSel);
    } else {
        setSelectedItems({
            ...selectedItems,
            [id]: {
                ...item,
                return_qty: 0,
                return_pieces: 0,
                reason: 'Defective'
            }
        });
    }
  };

  const handleItemChange = (id: number, field: string, value: any) => {
    setSelectedItems((prev: any) => ({
        ...prev,
        [id]: {
            ...prev[id],
            [field]: value
        }
    }));
  };

  const calculateItemTotal = (item: any) => {
    const qty = parseInt(item.return_qty) || 0;
    const pieces = parseInt(item.return_pieces) || 0;
    const piecesPerBox = item.pieces_per_box || 1;
    const totalQty = qty + (pieces / piecesPerBox);
    return totalQty * item.price_at_order;
  };

  const totalCalculatedCredit: number = mode === 'defective' 
    ? Number(Object.values(selectedItems).reduce((sum: number, item: any) => sum + calculateItemTotal(item), 0))
    : (parseFloat(directAmount) || 0);
  
  const totalWithGst: number = mode === 'defective'
    ? Number(Object.values(selectedItems).reduce((sum: number, item: any) => {
        const itemTotal = calculateItemTotal(item);
        const gstPct = parseFloat(item.gst_percent) || 0;
        return sum + (itemTotal * (1 + (gstPct/100)));
      }, 0))
    : (parseFloat(directAmount) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let payload: any = {
        distributor_id: distributor.distributor_id,
        is_paid_out: isPaidOut,
        payment_mode: paymentMode,
        is_direct_amount: mode === 'direct',
        apply_wallet: !isPaidOut
    };

    if (mode === 'direct') {
        const amt = parseFloat(directAmount);
        if (isNaN(amt) || amt <= 0) {
            showToast('Please enter a valid direct amount.', 'error');
            return;
        }
        if (!directReason.trim()) {
            showToast('Please enter a reason.', 'error');
            return;
        }
        payload.direct_amount = amt;
        payload.total_amount = amt;
        payload.reason = directReason;
    } else {
        const itemsPayload = Object.values(selectedItems).map((i: any) => {
            const qty = parseInt(i.return_qty) || 0;
            const pieces = parseInt(i.return_pieces) || 0;
            const piecesPerBox = i.pieces_per_box || 1;
            const totalQty = qty + (pieces / piecesPerBox);
            return {
                variant_id: i.variant_id,
                quantity: qty,
                pieces_qty: pieces,
                reason: i.reason,
                price_at_order: i.price_at_order,
                item_total: calculateItemTotal(i),
                total_qty: totalQty,
                product_name: i.product_name,
                pack_size: i.pack_size,
                hsn_code: i.hsn_code,
                gst_percent: i.gst_percent
            };
        }).filter((i: any) => i.total_qty > 0);

        if (itemsPayload.length === 0) {
            showToast('Please select at least one item and enter return quantities.', 'error');
            return;
        }
        if (!selectedInvoice) {
            showToast('Please select an invoice.', 'error');
            return;
        }
        payload.invoice_id = selectedInvoice.invoice_id;
        payload.items = itemsPayload;
        payload.total_amount = totalCalculatedCredit;
        payload.reason = 'Defective Products Return';
    }

    setIsSubmitting(true);
    try {
        const res = await api.post('/api/ledger/credit-note', payload);
        const responseData = res.data;
        setData(responseData);
        setShowPreview(true);
        showToast('Credit Note issued successfully!', 'success');
        onSuccess();
    } catch (err) {
        showToast('Failed to issue credit note', 'error');
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const invoiceElement = document.getElementById('credit-note-content');
      if (!invoiceElement) throw new Error('Credit Note content not found');

      const canvas = await html2canvas(invoiceElement, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const finalHeight = pdfHeight > pdf.internal.pageSize.getHeight() ? pdf.internal.pageSize.getHeight() : pdfHeight;
      const finalWidth = pdfHeight > pdf.internal.pageSize.getHeight() ? (canvas.width * finalHeight) / canvas.height : pdfWidth;

      pdf.addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);
      pdf.save(`Credit_Note_${data?.credit_note?.credit_note_number || 'document'}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (showPreview && data) {
    const cn = data.credit_note;
    const items = data.items || [];
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
      }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Credit Note Preview</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handleDownloadPdf} 
                disabled={downloading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                <Download size={16} /> {downloading ? 'Generating PDF...' : 'Download PDF'}
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div id="credit-note-content" style={{ background: '#fff', padding: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#000', fontSize: '12px', fontFamily: 'Arial, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>CREDIT NOTE</h1>
                <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Original for Recipient</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>CN Number: {cn.credit_note_number}</div>
                <div style={{ color: '#64748b' }}>Date: {new Date(cn.created_at || Date.now()).toLocaleDateString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <strong>Issued To:</strong>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>{distributor.firm_name}</div>
                <div>{distributor.billing_address || distributor.address}</div>
                {distributor.gstin && <div>GSTIN: {distributor.gstin}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>Payment Status:</strong>
                <div>{cn.is_paid_out ? `Paid (${cn.payment_mode || 'Cash'})` : 'Credited to Wallet'}</div>
              </div>
            </div>

            {cn.is_direct_amount ? (
              <div style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Reason: {cn.reason}</div>
                <div style={{ fontSize: '14px' }}>Amount: ₹{parseFloat(cn.total_amount || 0).toFixed(2)}</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Item Description</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>HSN</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>GST %</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 'bold' }}>{item.product_name}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{item.pack_size} | Reason: {item.reason}</div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{item.hsn_code || '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{item.total_qty}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>₹{parseFloat(item.price_at_order || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{item.gst_percent}%</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>₹{parseFloat(item.item_total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px', borderTop: '1px solid #cbd5e1', paddingTop: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '350px' }}>
                  This is a computer-generated credit note and does not require a physical signature.
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: '200px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span>Total Amount: </span>
                  <strong style={{ fontSize: '14px' }}>₹{parseFloat(cn.total_amount || 0).toFixed(2)}</strong>
                </div>
                {signatureBase64 && (
                  <div style={{ marginTop: '12px' }}>
                    <img src={signatureBase64} alt="Signature" style={{ height: '40px', objectFit: 'contain' }} />
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>Authorized Signatory</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ marginBottom: '8px', fontSize: '20px' }}>Issue Credit Note</h3>
        <p style={{ color: '#64748b', marginBottom: '24px' }}>
          Distributor/Client: <strong>{distributor.firm_name}</strong>
        </p>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: mode === 'defective' ? 600 : 400 }}>
                <input 
                    type="radio" 
                    name="mode" 
                    checked={mode === 'defective'} 
                    onChange={() => setMode('defective')} 
                />
                Defective Products
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: mode === 'direct' ? 600 : 400 }}>
                <input 
                    type="radio" 
                    name="mode" 
                    checked={mode === 'direct'} 
                    onChange={() => setMode('direct')} 
                />
                Direct Amount / Subsidy
            </label>
        </div>

        <form onSubmit={handleSubmit}>
            {mode === 'defective' ? (
                <>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Select Invoice *</label>
                        <select 
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                            onChange={handleInvoiceSelect}
                            value={selectedInvoice?.invoice_id?.toString() || ""}
                            required
                        >
                            <option value="" disabled>-- Choose an Invoice --</option>
                            {invoices.map(inv => (
                                <option key={inv.invoice_id} value={inv.invoice_id}>
                                    {inv.invoice_number} (₹{inv.grand_total}) - {new Date(inv.created_at).toLocaleDateString()}
                                </option>
                            ))}
                        </select>
                    </div>

                    {loadingItems && <p>Loading invoice items...</p>}

                    {invoiceItems.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Select Defective Items</label>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Max Qty</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Pcs/Box</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Rate (₹)</th>
                                        <th style={{ padding: '8px', textAlign: 'center' }}>Defective Box/Bag</th>
                                        <th style={{ padding: '8px', textAlign: 'center' }}>Defective Pcs</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortItemsByCategory(invoiceItems).map(item => {
                                        const isSelected = !!selectedItems[item.order_item_id];
                                        return (
                                            <tr key={item.order_item_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '8px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected}
                                                            onChange={() => handleItemToggle(item)}
                                                        />
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                                                            <div style={{ color: '#64748b', fontSize: '11px' }}>{formatPackSize(item.pack_size)}</div>
                                                        </div>
                                                    </label>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>{item.executed_qty}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', color: '#64748b', fontSize: '12px' }}>{item.pieces_per_box || '-'}</td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{item.price_at_order}</td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max={item.executed_qty}
                                                        disabled={!isSelected}
                                                        value={selectedItems[item.order_item_id]?.return_qty ?? ''}
                                                        onChange={(e) => handleItemChange(item.order_item_id, 'return_qty', e.target.value)}
                                                        style={{ width: '60px', padding: '4px', textAlign: 'center' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        disabled={!isSelected}
                                                        value={selectedItems[item.order_item_id]?.return_pieces ?? ''}
                                                        onChange={(e) => handleItemChange(item.order_item_id, 'return_pieces', e.target.value)}
                                                        style={{ width: '60px', padding: '4px', textAlign: 'center' }}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    <input 
                                                        type="text" 
                                                        disabled={!isSelected}
                                                        value={selectedItems[item.order_item_id]?.reason ?? ''}
                                                        onChange={(e) => handleItemChange(item.order_item_id, 'reason', e.target.value)}
                                                        style={{ width: '100%', padding: '4px' }}
                                                        placeholder="Reason"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : (
                <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Amount (₹) *</label>
                        <input 
                            type="number" 
                            step="0.01"
                            min="0.01"
                            value={directAmount}
                            onChange={(e) => setDirectAmount(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                            placeholder="e.g. 500.00"
                            required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Reason / Details *</label>
                        <input 
                            type="text" 
                            value={directReason}
                            onChange={(e) => setDirectReason(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                            placeholder="e.g. Company Subsidy"
                            required
                        />
                    </div>
                </div>
            )}

            <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '14px' }}>
                    {mode === 'defective' ? 'Taxable Amount' : 'Amount'}: <strong>₹{totalCalculatedCredit.toFixed(2)}</strong><br/>
                    {mode === 'defective' && (
                        <>Estimated Total (+GST): <strong style={{ color: '#ef4444' }}>₹{Math.round(totalWithGst).toFixed(2)}</strong></>
                    )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '250px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={isPaidOut} 
                            onChange={(e) => setIsPaidOut(e.target.checked)} 
                        />
                        Mark as Paid Immediately
                    </label>
                    {isPaidOut && (
                        <select 
                            value={paymentMode} 
                            onChange={(e) => setPaymentMode(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    )}
                    {!isPaidOut && (
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                            Will be credited to wallet balance.
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="secondary-btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                <button 
                    type="submit" 
                    className="primary-btn" 
                    disabled={isSubmitting || (mode === 'defective' && invoiceItems.length === 0)}
                >
                  {isSubmitting ? 'Processing...' : 'Issue Credit Note'}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default CreditNoteModal;
