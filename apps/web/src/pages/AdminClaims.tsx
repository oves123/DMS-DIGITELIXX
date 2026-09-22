import React, { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { Download, Search, ChevronDown, ChevronRight, FileSpreadsheet, TrendingDown, Wallet, Banknote, AlertCircle } from 'lucide-react';
import { formatIndianNumber, formatCurrencyDetailed } from '../lib/utils';

const AdminClaims = () => {
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [distributorFilter, setDistributorFilter] = useState('all');

  // Sorting
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Expandable Rows
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [expandedRowItems, setExpandedRowItems] = useState<Record<number, any[]>>({});
  const [loadingItems, setLoadingItems] = useState(false);

  const [topReason, setTopReason] = useState('N/A');

  const fetchCreditNotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/ledger/credit-note');
      setCreditNotes(response.data);
      
      const statsResponse = await api.get('/api/ledger/credit-note-stats');
      if (statsResponse.data.topReason) {
        setTopReason(statsResponse.data.topReason);
      }
    } catch (err) {
      console.error('Failed to fetch credit notes:', err);
      setError('Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditNotes();
  }, []);

  const handleDownload = async (cnId: number) => {
    try {
      const response = await api.get(`/api/ledger/credit-note/${cnId}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CreditNote_${cnId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download Credit Note.');
    }
  };

  const toggleRow = async (cnId: number) => {
    if (expandedRowId === cnId) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(cnId);
    if (!expandedRowItems[cnId]) {
      setLoadingItems(true);
      try {
        const res = await api.get(`/api/ledger/credit-note/${cnId}/items`);
        setExpandedRowItems(prev => ({ ...prev, [cnId]: res.data }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  // Filter Logic
  const filteredNotes = useMemo(() => {
    return creditNotes.filter(cn => {
      // search
      const matchesSearch = cn.credit_note_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            cn.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            cn.distributor_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // status
      const matchesStatus = statusFilter === 'all' || 
                            (statusFilter === 'refunded' && cn.is_paid_out) ||
                            (statusFilter === 'wallet' && !cn.is_paid_out);
      
      // distributor
      const matchesDistributor = distributorFilter === 'all' || cn.distributor_id.toString() === distributorFilter;

      // date range
      let matchesDate = true;
      if (dateRange !== 'all' && cn.created_at) {
        const dateStr = cn.created_at.split('T')[0];
        const [year, month] = dateStr.split('-').map(Number);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        if (dateRange === 'thisMonth') {
          matchesDate = year === currentYear && month === currentMonth;
        } else if (dateRange === 'lastMonth') {
          let lastMonth = currentMonth - 1;
          let lastMonthYear = currentYear;
          if (lastMonth === 0) {
            lastMonth = 12;
            lastMonthYear -= 1;
          }
          matchesDate = year === lastMonthYear && month === lastMonth;
        } else if (dateRange === 'thisYear') {
          matchesDate = year === currentYear;
        }
      }

      return matchesSearch && matchesStatus && matchesDistributor && matchesDate;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'created_at') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [creditNotes, searchQuery, statusFilter, distributorFilter, dateRange, sortField, sortDirection]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredNotes.length / itemsPerPage);
  const paginatedNotes = filteredNotes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, distributorFilter, dateRange]);

  // Metrics
  const metrics = useMemo(() => {
    let totalCredit = 0;
    let totalRefunded = 0;
    let totalWallet = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    creditNotes.forEach(cn => {
      if (!cn.created_at) return;
      const dateStr = cn.created_at.split('T')[0];
      const [year, month] = dateStr.split('-').map(Number);
      
      if (year === currentYear && month === currentMonth) {
        totalCredit += cn.amount;
        if (cn.is_paid_out) totalRefunded += cn.amount;
        else totalWallet += cn.amount;
      }
    });
    return { totalCredit, totalRefunded, totalWallet, commonReason: topReason };
  }, [creditNotes, topReason]);

  const handleExportCSV = () => {
    const headers = ['Credit Note #', 'Distributor', 'Against Invoice', 'Date Issued', 'Amount', 'Status'];
    const rows = filteredNotes.map(cn => [
      cn.credit_note_number,
      `"${cn.distributor_name}"`,
      cn.invoice_number || '-',
      new Date(cn.created_at).toLocaleDateString(),
      cn.amount.toFixed(2),
      cn.is_paid_out ? 'Refunded' : 'Wallet Credit'
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `CreditNotes_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const uniqueDistributors = Array.from(new Set(creditNotes.map(cn => cn.distributor_id))).map(id => {
    const cn = creditNotes.find(c => c.distributor_id === id);
    return { id, name: cn.distributor_name };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>Defect Claims & Credit Notes</h1>
        <button onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          <FileSpreadsheet size={18} />
          Export to CSV
        </button>
      </div>

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '14px', fontWeight: 600 }}>
            <TrendingDown size={20} color="#ef4444" />
            Total Credit Issued (This Month)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }} title={'₹' + formatCurrencyDetailed(metrics.totalCredit)}>₹{formatIndianNumber(metrics.totalCredit)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '14px', fontWeight: 600 }}>
            <Banknote size={20} color="#f59e0b" />
            Total Refunded (Cash/UPI)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }} title={'₹' + formatCurrencyDetailed(metrics.totalRefunded)}>₹{formatIndianNumber(metrics.totalRefunded)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '14px', fontWeight: 600 }}>
            <Wallet size={20} color="#3b82f6" />
            Total Credited to Wallets
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }} title={'₹' + formatCurrencyDetailed(metrics.totalWallet)}>₹{formatIndianNumber(metrics.totalWallet)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#6b7280', fontSize: '14px', fontWeight: 600 }}>
            <AlertCircle size={20} color="#8b5cf6" />
            Most Common Defect Reason
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: 'auto' }}>{metrics.commonReason}</div>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        
        {/* Filters */}
        <div style={{ padding: '20px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Search Credit Notes, Invoices or Distributors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 16px 10px 40px', border: '1px solid #e5e7eb',
                borderRadius: '8px', outline: 'none', fontSize: '14px', transition: 'border-color 0.2s', boxSizing: 'border-box'
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>
          
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: '#fff', minWidth: '150px' }}>
            <option value="all">All Time</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisYear">This Year</option>
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: '#fff', minWidth: '150px' }}>
            <option value="all">All Status</option>
            <option value="refunded">Refunded (Cash/UPI)</option>
            <option value="wallet">Added to Wallet</option>
          </select>

          <select value={distributorFilter} onChange={e => setDistributorFilter(e.target.value)} style={{ padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: '#fff', minWidth: '180px' }}>
            <option value="all">All Distributors</option>
            {uniqueDistributors.map(d => (
              <option key={d.id} value={d.id.toString()}>{d.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading credit notes...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            <p style={{ fontSize: '18px', fontWeight: '500', color: '#111827', margin: '0 0 8px 0' }}>No Credit Notes Found</p>
            <p style={{ margin: 0 }}>Try adjusting your filters or generate a new Credit Note.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <th style={{ padding: '16px 16px 16px 24px', width: '40px' }}></th>
                    <th onClick={() => handleSort('credit_note_number')} style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Credit Note # {sortField === 'credit_note_number' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Distributor</th>
                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Against Invoice</th>
                    <th onClick={() => handleSort('created_at')} style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Date Issued {sortField === 'created_at' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('amount')} style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Amount (Credit) {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedNotes.map((cn) => (
                    <React.Fragment key={cn.credit_note_id}>
                      <tr style={{ borderBottom: expandedRowId === cn.credit_note_id ? 'none' : '1px solid #f3f4f6', backgroundColor: expandedRowId === cn.credit_note_id ? '#f8fafc' : '#fff', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '16px 16px 16px 24px' }}>
                          <button onClick={() => toggleRow(cn.credit_note_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {expandedRowId === cn.credit_note_id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                          </button>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '500', color: '#111827' }}>{cn.credit_note_number}</span>
                            {cn.created_at && (new Date().getTime() - new Date(cn.created_at).getTime()) < 24 * 60 * 60 * 1000 && (
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
                        <td style={{ padding: '16px' }}><span style={{ color: '#4b5563' }}>{cn.distributor_name}</span></td>
                        <td style={{ padding: '16px' }}><span style={{ color: '#4b5563' }}>{cn.invoice_number || '-'}</span></td>
                        <td style={{ padding: '16px' }}><span style={{ color: '#4b5563' }}>{new Date(cn.created_at).toLocaleDateString()}</span></td>
                        <td style={{ padding: '16px' }}><span style={{ fontWeight: '600', color: '#16a34a' }}>₹{cn.amount.toFixed(2)}</span></td>
                        <td style={{ padding: '16px' }}>
                          {cn.is_paid_out ? (
                            <span style={{ padding: '4px 10px', fontSize: '12px', fontWeight: '500', backgroundColor: '#eff6ff', color: '#1d4ed8', borderRadius: '9999px' }} title={cn.applied_details || ''}>Refunded via {cn.payment_mode || 'Cash'}</span>
                          ) : cn.applied_details && cn.applied_details.startsWith('Wallet') && !cn.applied_details.includes(',') ? (
                            <span style={{ padding: '4px 10px', fontSize: '12px', fontWeight: '500', backgroundColor: '#f0fdf4', color: '#15803d', borderRadius: '9999px' }} title={cn.applied_details}>Added to Wallet</span>
                          ) : cn.applied_details ? (
                            <span style={{ padding: '4px 10px', fontSize: '12px', fontWeight: '500', backgroundColor: '#e0e7ff', color: '#4338ca', borderRadius: '9999px', cursor: 'help' }} title={cn.applied_details}>
                              {cn.applied_details.includes('Wallet') ? 'Applied & Wallet' : 'Applied to Invoice'}
                            </span>
                          ) : (
                            <span style={{ padding: '4px 10px', fontSize: '12px', fontWeight: '500', backgroundColor: '#f0fdf4', color: '#15803d', borderRadius: '9999px' }}>Added to Wallet</span>
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <button
                            onClick={() => handleDownload(cn.credit_note_id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '500', color: 'var(--primary)', backgroundColor: '#fff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                          >
                            <Download size={16} /> Download
                          </button>
                        </td>
                      </tr>
                      {expandedRowId === cn.credit_note_id && (
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f3f4f6' }}>
                          <td colSpan={8} style={{ padding: '0 24px 24px 64px' }}>
                            <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Returned Items Detail</h4>
                              {loadingItems && !expandedRowItems[cn.credit_note_id] ? (
                                <div style={{ fontSize: '14px', color: '#94a3b8' }}>Loading items...</div>
                              ) : (
                                <table style={{ width: '100%', textAlign: 'left', fontSize: '13px' }}>
                                  <thead>
                                    <tr style={{ color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                                      <th style={{ paddingBottom: '8px' }}>Product</th>
                                      <th style={{ paddingBottom: '8px' }}>Pack Size</th>
                                      <th style={{ paddingBottom: '8px', textAlign: 'center' }}>Defective Box</th>
                                      <th style={{ paddingBottom: '8px', textAlign: 'center' }}>Defective Pcs</th>
                                      <th style={{ paddingBottom: '8px', textAlign: 'right' }}>Total (₹)</th>
                                      <th style={{ paddingBottom: '8px', paddingLeft: '16px' }}>Reason</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedRowItems[cn.credit_note_id]?.map((item, idx) => (
                                      <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '8px 0', fontWeight: 500, color: '#334155' }}>{item.product_name}</td>
                                        <td style={{ padding: '8px 0', color: '#64748b' }}>{item.pack_size}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'center', color: '#64748b' }}>{item.quantity}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'center', color: '#64748b' }}>{item.pieces_qty}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#475569' }}>{item.item_total.toFixed(2)}</td>
                                        <td style={{ padding: '8px 0 8px 16px', color: '#ef4444' }}>{item.reason}</td>
                                      </tr>
                                    ))}
                                    {expandedRowItems[cn.credit_note_id]?.length === 0 && (
                                      <tr><td colSpan={6} style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8' }}>No item details found.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                Showing <span style={{ fontWeight: 600, color: '#111827' }}>{((currentPage - 1) * itemsPerPage) + 1}</span> to <span style={{ fontWeight: 600, color: '#111827' }}>{Math.min(currentPage * itemsPerPage, filteredNotes.length)}</span> of <span style={{ fontWeight: 600, color: '#111827' }}>{filteredNotes.length}</span> results
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' }}>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '6px 12px', border: '1px solid #e2e8f0', backgroundColor: currentPage === 1 ? '#f8fafc' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#475569', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <button 
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: '6px 12px', border: '1px solid #e2e8f0', backgroundColor: currentPage === totalPages || totalPages === 0 ? '#f8fafc' : '#fff', color: currentPage === totalPages || totalPages === 0 ? '#94a3b8' : '#475569', borderRadius: '6px', cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminClaims;
