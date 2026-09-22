import { useState, useEffect, useMemo, Fragment } from 'react';
import api from '../lib/api';
import InvoiceModal from '../components/InvoiceModal';
import CreditNoteModal from '../components/CreditNoteModal';
import { Search, Filter, CreditCard, ChevronRight, ChevronDown, Download, PlusCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { formatIndianNumber, formatCurrencyDetailed } from '../lib/utils';

const AdminLedger = () => {
  const [ledger, setLedger] = useState<any[]>([]);
  const [expandedDistributors, setExpandedDistributors] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { showToast } = useToast();

  // Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Bulk Payment Modal State
  const [bulkPaymentDistributor, setBulkPaymentDistributor] = useState<any>(null);
  const [bulkPaymentForm, setBulkPaymentForm] = useState({
    amount: '',
    payment_mode: 'Cash',
    reference_no: '',
    payment_date: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })()
  });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Credit Note Modal State
  const [creditNoteDistributor, setCreditNoteDistributor] = useState<any>(null);

  useEffect(() => {
    fetchLedger();
  }, []);

  const fetchLedger = async () => {
    try {
      const response = await api.get('/api/ledger');
      setLedger(response.data);
    } catch (err) {
      setError('Failed to fetch ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkPaymentForm.amount || parseFloat(bulkPaymentForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      await api.post('/api/ledger/payment/record-bulk', {
        distributor_id: bulkPaymentDistributor.distributor_id,
        amount: bulkPaymentForm.amount,
        payment_mode: bulkPaymentForm.payment_mode,
        reference_no: bulkPaymentForm.reference_no,
        payment_date: bulkPaymentForm.payment_date
      });
      showToast('Bulk payment processed successfully!', 'success');
      setBulkPaymentDistributor(null);
      const d = new Date();
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setBulkPaymentForm({ amount: '', payment_mode: 'Cash', reference_no: '', payment_date: localDate });
      fetchLedger(); // Refresh
    } catch (err) {
      showToast('Failed to process bulk payment', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };



  const toggleExpand = (distId: number) => {
    setExpandedDistributors(prev => ({ ...prev, [distId]: !prev[distId] }));
  };

  const filteredLedger = useMemo(() => ledger.filter(dist => {
    // Search filter
    const matchesSearch = !searchQuery ||
      dist.firm_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dist.invoices.some((inv: any) => inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()));
      
    // Status filter
    const matchesStatus = 
      statusFilter === 'All' ? true :
      statusFilter === 'Has Pending' ? dist.total_pending > 0.01 :
      statusFilter === 'Fully Paid' ? dist.total_pending <= 0.01 : true;

    // Date filter
    const matchesDate = !dateFilter || dist.invoices.some((inv: any) => 
      inv.created_at && inv.created_at.split('T')[0] === dateFilter
    );

    return matchesSearch && matchesStatus && matchesDate;
  }), [ledger, searchQuery, statusFilter, dateFilter]);

  const totalPages = Math.ceil(filteredLedger.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLedger.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, dateFilter]);

  // Summary totals across ALL filtered distributors

  const totalRevenue = filteredLedger.reduce((sum, dist) => sum + (dist.total_billed || 0), 0);
  const totalPaid = filteredLedger.reduce((sum, dist) => sum + (dist.total_paid || 0), 0);
  const totalPending = filteredLedger.reduce((sum, dist) => sum + (dist.total_pending || 0), 0);


  return (
    <div>
      {error && <div className="error-message">{error}</div>}

      {/* Summary Cards */}
      {!loading && ledger.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Invoices</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-main)' }} title={filteredLedger.reduce((sum, dist) => sum + dist.total_invoices, 0).toLocaleString('en-IN')}>
              {formatIndianNumber(filteredLedger.reduce((sum, dist) => sum + dist.total_invoices, 0))}
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Billed</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4f46e5' }} title={'₹' + formatCurrencyDetailed(totalRevenue)}>₹{formatIndianNumber(totalRevenue)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Paid</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669' }} title={'₹' + formatCurrencyDetailed(totalPaid)}>₹{formatIndianNumber(totalPaid)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Pending</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }} title={'₹' + formatCurrencyDetailed(totalPending)}>₹{formatIndianNumber(totalPending)}</div>
          </div>
        </div>
      )}

      <div className="data-card">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading ledger...</div>
        ) : ledger.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            No invoices generated yet. Execute an order to generate one.
          </div>
        ) : (
          <div>
            {/* Filter Bar */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Search */}
                <div style={{ position: 'relative', width: '320px' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                    <Search size={16} />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by Firm Name or Invoice #..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ padding: '9px 12px 9px 36px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>

                {/* Status Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={16} color="#64748b" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  >
                    <option value="All">All Status</option>
                    <option value="Has Pending">Has Pending</option>
                    <option value="Fully Paid">Fully Paid</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  />
                </div>

                {/* Clear Filters */}
                {(searchQuery || statusFilter !== 'All' || dateFilter) && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('All'); setDateFilter(''); }}
                    style={{ padding: '6px 12px', fontSize: '13px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    ✕ Clear Filters
                  </button>
                )}
              </div>

              <span style={{ fontSize: '14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Showing {filteredLedger.length > 0 ? indexOfFirstItem + 1 : 0} to {Math.min(indexOfLastItem, filteredLedger.length)} of {filteredLedger.length} firms
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>FIRM NAME</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>TOTAL INVOICES</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>TOTAL BILLED</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>TOTAL PAID</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>TOTAL PENDING</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.length > 0 ? currentItems.map((dist) => {
                    const isExpanded = expandedDistributors[dist.distributor_id];
                    return (
                      <Fragment key={dist.distributor_id}>
                        {/* Master Row */}
                        <tr 
                          style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                          onClick={() => toggleExpand(dist.distributor_id)}
                        >
                          <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ display: 'inline-block', width: '16px', color: '#64748b', textAlign: 'center' }}>
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </span>
                              {dist.firm_name}
                              {dist.invoices?.length > 0 && (new Date().getTime() - new Date(dist.invoices[0].created_at).getTime()) < 24 * 60 * 60 * 1000 && (
                                <span style={{
                                  background: '#ef4444',
                                  color: 'white',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  fontWeight: 'bold',
                                  animation: 'pulse 2s infinite'
                                }}>
                                  NEW
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px', fontWeight: 600 }}>{dist.total_invoices}</td>
                          <td style={{ padding: '12px', color: '#4f46e5', fontWeight: 600 }}>₹{dist.total_billed.toFixed(2)}</td>
                          <td style={{ padding: '12px', color: '#059669', fontWeight: 600 }}>₹{dist.total_paid.toFixed(2)}</td>
                          <td style={{ padding: '12px', color: '#dc2626', fontWeight: 600 }}>₹{dist.total_pending.toFixed(2)}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const handleDownload = async () => {
                                    try {
                                      const res = await api.get(`/api/ledger/payment/distributor/${dist.distributor_id}/download`, {
                                        responseType: 'blob'
                                      });
                                      const url = window.URL.createObjectURL(new Blob([res.data]));
                                      const link = document.createElement('a');
                                      link.href = url;
                                      link.setAttribute('download', `Ledger_${dist.firm_name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
                                      document.body.appendChild(link);
                                      link.click();
                                      link.remove();
                                    } catch (err) {
                                      console.error("Download failed", err);
                                      alert("Failed to download ledger statement.");
                                    }
                                  };
                                  handleDownload();
                                }}
                                style={{
                                  background: '#fff',
                                  border: '1px solid #cbd5e1',
                                  color: '#334155',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Download Statement of Account"
                              >
                                <Download size={14} /> 
                                Statement
                              </button>

                              <button 
                                onClick={(e) => { e.stopPropagation(); setCreditNoteDistributor(dist); }}
                                style={{
                                  background: '#fff',
                                  border: '1px solid #cbd5e1',
                                  color: '#334155',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Issue Credit Note"
                              >
                                <PlusCircle size={14} /> 
                                Credit Note
                              </button>

                              <button 
                                onClick={(e) => { e.stopPropagation(); setBulkPaymentDistributor(dist); }}
                                style={{
                                  background: '#10b981',
                                  border: 'none',
                                  color: '#fff',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <CreditCard size={14} /> 
                                Record Payment
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Nested Invoices Rows */}
                        {isExpanded && dist.invoices.map((inv: any) => (
                          <tr key={inv.invoice_number} style={{ background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', paddingLeft: '44px' }}>
                              <button 
                                onClick={() => setSelectedOrderId(inv.order_id)}
                                style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                {inv.invoice_number}
                              </button>
                              {(new Date().getTime() - new Date(inv.created_at).getTime()) < 24 * 60 * 60 * 1000 && (
                                <span style={{
                                  background: '#ef4444',
                                  color: 'white',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  marginLeft: '8px',
                                  fontWeight: 'bold',
                                  animation: 'pulse 2s infinite'
                                }}>
                                  NEW
                                </span>
                              )}
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                {new Date(inv.created_at).toLocaleDateString()}
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>
                              <span style={{
                                padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                                backgroundColor: inv.payment_status === 'PAID' ? '#dcfce7' : inv.payment_status === 'PARTIAL' ? '#fef08a' : '#fee2e2',
                                color: inv.payment_status === 'PAID' ? '#166534' : inv.payment_status === 'PARTIAL' ? '#854d0e' : '#991b1b'
                              }}>
                                {inv.payment_status || 'UNPAID'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 500 }}>₹{Number(inv.grand_total).toFixed(2)}</td>
                            <td style={{ padding: '10px 12px', color: '#059669' }}>₹{Number(inv.paid_amount || 0).toFixed(2)}</td>
                            <td style={{ padding: '10px 12px', color: '#dc2626' }}>₹{(Number(inv.grand_total) - Number(inv.paid_amount || 0)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        No invoices match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center', background: '#f8fafc', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginRight: 'auto' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  style={{ padding: '8px 16px', background: currentPage === 1 ? '#f3f4f6' : '#fff', color: currentPage === 1 ? '#9ca3af' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                  Previous
                </button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  style={{ padding: '8px 16px', background: currentPage === totalPages ? '#f3f4f6' : '#fff', color: currentPage === totalPages ? '#9ca3af' : 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedOrderId && (
        <InvoiceModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}

      {/* Bulk Payment Modal */}
      {bulkPaymentDistributor && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '8px', fontSize: '20px' }}>Record Payment / Advance</h3>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>
              Distributor: <strong>{bulkPaymentDistributor.firm_name}</strong><br/>
              Total Pending: <strong style={{ color: '#dc2626' }}>₹{bulkPaymentDistributor.total_pending.toFixed(2)}</strong><br/>
              Advance Balance: <strong style={{ color: '#059669' }}>₹{(bulkPaymentDistributor.wallet_balance || 0).toFixed(2)}</strong>
            </p>
            <form onSubmit={handleBulkPaymentSubmit}>
              <div className="form-grid">
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Payment Amount Received (₹) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={bulkPaymentForm.amount} 
                    onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, amount: e.target.value})} 
                    required 
                    placeholder="e.g. 10000"
                    style={{ fontSize: '18px', padding: '12px' }}
                  />
                  <small style={{ color: '#64748b', marginTop: '4px' }}>Amount will automatically be applied to oldest unpaid invoices first. <br/><i>💡 Tip: Any excess amount will be saved as an Advance Payment.</i></small>
                </div>
                
                <div className="input-group">
                  <label>Payment Mode *</label>
                  <select 
                    value={bulkPaymentForm.payment_mode} 
                    onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, payment_mode: e.target.value})}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>Payment Date *</label>
                  <input 
                    type="date" 
                    value={bulkPaymentForm.payment_date} 
                    onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, payment_date: e.target.value})} 
                    required 
                  />
                </div>

                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Reference Number / Note</label>
                  <input 
                    type="text" 
                    value={bulkPaymentForm.reference_no} 
                    onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, reference_no: e.target.value})} 
                    placeholder="Transaction ID, Cheque No, or internal note..."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="secondary-btn" onClick={() => setBulkPaymentDistributor(null)} disabled={isSubmittingPayment}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSubmittingPayment}>
                  {isSubmittingPayment ? 'Processing...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Note Modal */}
      {creditNoteDistributor && (
        <CreditNoteModal
          distributor={creditNoteDistributor}
          onClose={() => setCreditNoteDistributor(null)}
          onSuccess={() => {
            setCreditNoteDistributor(null);
            fetchLedger();
          }}
        />
      )}

    </div>
  );
};

export default AdminLedger;
