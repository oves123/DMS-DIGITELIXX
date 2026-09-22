import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { AlertTriangle, TrendingUp, Package, Users, ChevronDown, Search, FileText, FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatIndianNumber = (num: number) => {
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const AdminReports = () => {
  const [salesData, setSalesData] = useState([]);
  const [productData, setProductData] = useState([]);
  const [distributorData, setDistributorData] = useState([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<any[]>([]);
  const today = new Date();
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultStart = formatLocalDate(firstDay);
  const defaultEnd = formatLocalDate(today);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [loading, setLoading] = useState(true);
  const [distributorsList, setDistributorsList] = useState<any[]>([]);
  const [selectedDistributor, setSelectedDistributor] = useState('all');

  // Inventory Pagination State
  const [invPage, setInvPage] = useState(1);
  const invRowsPerPage = 10;

  // Detailed Transaction Report State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transStartDate, setTransStartDate] = useState('');
  const [transEndDate, setTransEndDate] = useState('');
  const [transMonth, setTransMonth] = useState('');
  const [transYear, setTransYear] = useState('');
  const [transLoading, setTransLoading] = useState(false);

  // Transactions Distributor Filter State
  const [transDistributor, setTransDistributor] = useState('all');
  const [transDistSearch, setTransDistSearch] = useState('');
  const [isTransDistOpen, setIsTransDistOpen] = useState(false);
  const transDropdownRef = useRef<HTMLDivElement>(null);

  // Combobox State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [distributorSearchText, setDistributorSearchText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (transDropdownRef.current && !transDropdownRef.current.contains(event.target)) {
        setIsTransDistOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDistributors = distributorsList.filter(d => 
    d.firm_name.toLowerCase().includes(distributorSearchText.toLowerCase())
  );

  const selectedDistributorName = selectedDistributor === 'all' 
    ? 'All Distributors (Global)' 
    : distributorsList.find(d => d.user_id.toString() === selectedDistributor)?.firm_name || 'Select Distributor';

  const filteredTransDistributors = distributorsList.filter(d => 
    d.firm_name.toLowerCase().includes(transDistSearch.toLowerCase())
  );

  const selectedTransDistributorName = transDistributor === 'all' 
    ? 'All Distributors' 
    : distributorsList.find(d => d.user_id.toString() === transDistributor)?.firm_name || 'Select Distributor';

  useEffect(() => {
    const fetchDistributors = async () => {
      try {
        const res = await api.get('/api/distributors');
        setDistributorsList(res.data);
      } catch (err) {
        console.error('Failed to fetch distributors', err);
      }
    };
    fetchDistributors();
  }, []);

  useEffect(() => {
    fetchAllReports();
  }, [selectedDistributor]); // Refetch when distributor changes

  const fetchAllReports = async () => {
    try {
      setLoading(true);
      const query = `?startDate=${startDate}&endDate=${endDate}`;
      
      if (selectedDistributor === 'all') {
        const [salesRes, prodRes, distRes, invRes] = await Promise.all([
          api.get(`/api/reports/admin/sales${query}`),
          api.get(`/api/reports/admin/products${query}`),
          api.get(`/api/reports/admin/distributors${query}`),
          api.get(`/api/reports/admin/inventory`)
        ]);

        setSalesData(salesRes.data);
        setProductData(prodRes.data);
        setDistributorData(distRes.data);
        setInventoryAlerts(invRes.data);
      } else {
        const [salesRes, prodRes] = await Promise.all([
          api.get(`/api/reports/distributor/${selectedDistributor}/purchases${query}`),
          api.get(`/api/reports/distributor/${selectedDistributor}/products${query}`)
        ]);

        // Map distributor data to match the admin chart keys
        const mappedSales = salesRes.data.map((d: any) => ({
          date: d.date,
          total_orders: d.total_orders,
          total_revenue: d.amount_spent
        }));
        
        const mappedProds = prodRes.data.map((d: any) => ({
          product_name: d.product_name,
          total_sold: d.total_bought
        }));

        setSalesData(mappedSales);
        setProductData(mappedProds);
        setDistributorData([]);
        setInventoryAlerts([]);
      }
    } catch (err) {
      console.error('Failed to fetch reports', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setTransLoading(true);
      let query = '';
      if (transMonth && transYear) {
        query = `?month=${transMonth}&year=${transYear}`;
      } else if (transStartDate && transEndDate) {
        query = `?startDate=${transStartDate}&endDate=${transEndDate}`;
      }
      
      const res = await api.get(`/api/reports/admin/transactions${query}`);
      setTransactions(res.data);
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    } finally {
      setTransLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [transStartDate, transEndDate, transMonth, transYear]);

  const filteredTransactions = transactions.filter(t => 
    transDistributor === 'all' || 
    t.firm_name === distributorsList.find(d => d.user_id.toString() === transDistributor)?.firm_name
  );

  // Download Excel
  const handleDownloadExcel = () => {
    if (filteredTransactions.length === 0) return alert('No data to download.');
    
    // Compute totals
    const totalTaxable = filteredTransactions.reduce((sum, t) => sum + t.taxable_amount, 0);
    const totalGst = filteredTransactions.reduce((sum, t) => sum + t.gst_amount, 0);
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.total_amount, 0);

    const data = filteredTransactions.map((t, i) => ({
      'SR': i + 1,
      'DATE': new Date(t.date).toLocaleDateString('en-GB'),
      'BILL NO': t.invoice_number,
      'FIRM NAME': t.firm_name,
      'TOWN': t.town,
      'TAXABLE AMOUNT': t.taxable_amount,
      'GST AMOUNT': t.gst_amount,
      'TOTAL AMOUNT': t.total_amount
    }));
    
    data.push({
      'SR': '' as any, 'DATE': '', 'BILL NO': '', 'FIRM NAME': '', 'TOWN': 'GRAND TOTAL',
      'TAXABLE AMOUNT': totalTaxable,
      'GST AMOUNT': totalGst,
      'TOTAL AMOUNT': totalAmount
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, "Transaction_Report.xlsx");
  };

  // Download PDF
  const handleDownloadPDF = () => {
    if (transactions.length === 0) return alert('No data to download.');
    
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Jollyz - Transaction Report", 14, 20);
    
    let subtitle = "Filtered Transactions";
    if (transMonth && transYear) subtitle = `For ${transMonth}/${transYear}`;
    else if (transStartDate && transEndDate) subtitle = `From ${transStartDate} to ${transEndDate}`;
    
    doc.setFontSize(12);
    doc.text(subtitle, 14, 28);

    const totalTaxable = filteredTransactions.reduce((sum, t) => sum + t.taxable_amount, 0);
    const totalGst = filteredTransactions.reduce((sum, t) => sum + t.gst_amount, 0);
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.total_amount, 0);

    const tableColumn = ["SR", "Date", "Bill No", "Firm Name", "Town", "Taxable", "GST", "Total"];
    const tableRows = filteredTransactions.map((t, i) => [
      i + 1,
      new Date(t.date).toLocaleDateString('en-GB'),
      t.invoice_number,
      t.firm_name,
      t.town,
      `Rs ${t.taxable_amount.toFixed(2)}`,
      `Rs ${t.gst_amount.toFixed(2)}`,
      `Rs ${t.total_amount.toFixed(2)}`
    ]);
    
    // Add Grand Total row
    tableRows.push([
      '', '', '', '', 'GRAND TOTAL',
      `Rs ${totalTaxable.toFixed(2)}`,
      `Rs ${totalGst.toFixed(2)}`,
      `Rs ${totalAmount.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 35,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
      didParseCell: function (data) {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249] as any;
        }
      }
    });
    
    doc.save(`Transaction_Report.pdf`);
  };

  const paginatedInventoryAlerts = inventoryAlerts.slice((invPage - 1) * invRowsPerPage, invPage * invRowsPerPage);
  const totalInvPages = Math.ceil(inventoryAlerts.length / invRowsPerPage);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading reports...</div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <h2 className="page-title">Reports & Analytics</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#fff', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
          
          <div ref={dropdownRef} style={{ position: 'relative', width: '260px' }}>
            <div 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{ 
                padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', 
                background: '#f8fafc', fontWeight: 500, display: 'flex', justifyContent: 'space-between', 
                alignItems: 'center', cursor: 'pointer', fontSize: '14px', height: '38px'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {selectedDistributorName}
              </span>
              <ChevronDown size={16} color="#64748b" style={{ flexShrink: 0, marginLeft: '8px' }} />
            </div>
            
            {isDropdownOpen && (
              <div style={{ 
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', 
                background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', 
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', zIndex: 50 
              }}>
                <div style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={14} color="#94a3b8" />
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Search distributor..." 
                    value={distributorSearchText}
                    onChange={e => setDistributorSearchText(e.target.value)}
                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', background: 'transparent' }}
                  />
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <div 
                    onClick={() => {
                      setSelectedDistributor('all');
                      setIsDropdownOpen(false);
                      setDistributorSearchText('');
                    }}
                    style={{ 
                      padding: '10px 12px', cursor: 'pointer', fontSize: '14px',
                      background: selectedDistributor === 'all' ? '#f1f5f9' : 'transparent',
                      fontWeight: selectedDistributor === 'all' ? 600 : 400,
                      color: selectedDistributor === 'all' ? 'var(--primary)' : 'var(--text-main)'
                    }}
                    onMouseEnter={e => { if (selectedDistributor !== 'all') e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (selectedDistributor !== 'all') e.currentTarget.style.background = 'transparent'; }}
                  >
                    All Distributors (Global)
                  </div>
                  {filteredDistributors.map(d => (
                    <div 
                      key={d.user_id}
                      onClick={() => {
                        setSelectedDistributor(d.user_id.toString());
                        setIsDropdownOpen(false);
                        setDistributorSearchText('');
                      }}
                      style={{ 
                        padding: '10px 12px', cursor: 'pointer', fontSize: '14px',
                        background: selectedDistributor === d.user_id.toString() ? '#f1f5f9' : 'transparent',
                        fontWeight: selectedDistributor === d.user_id.toString() ? 600 : 400,
                        color: selectedDistributor === d.user_id.toString() ? 'var(--primary)' : 'var(--text-main)'
                      }}
                      onMouseEnter={e => { if (selectedDistributor !== d.user_id.toString()) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (selectedDistributor !== d.user_id.toString()) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {d.firm_name}
                    </div>
                  ))}
                  {filteredDistributors.length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                      No matches found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} 
          />
          <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>to</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} 
          />
          <button onClick={fetchAllReports} className="primary-btn" style={{ padding: '8px 16px' }}>
            Filter
          </button>
        </div>
      </div>

      {/* Primary Sales Summary Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="data-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', borderRadius: '12px', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 4px 12px rgba(14, 165, 233, 0.2)'
          }}>
            <TrendingUp size={32} />
          </div>
          <div>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              PRIMARY SALES
            </p>
            <h2 style={{ margin: '4px 0 0 0', color: '#1e293b', fontSize: '32px', fontWeight: 600 }}>
              ₹{formatIndianNumber(salesData.reduce((acc: number, curr: any) => acc + (Number(curr.total_revenue) || 0), 0))}
            </h2>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
        
        {/* Sales & Revenue Chart */}
        <div className="data-card" style={{ padding: '24px', gridColumn: '1 / -1' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <TrendingUp color="var(--primary)" /> Sales Trend (Total Orders)
          </h3>
          <div style={{ height: '300px', width: '100%' }}>
            {salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend />
                  <Bar dataKey="total_orders" fill="#10b981" radius={[4, 4, 0, 0]} name="Total Orders" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '100px' }}>No sales data available.</div>
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="data-card" style={{ padding: '24px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Package color="#10b981" /> Top Selling Products
          </h3>
          <div style={{ height: '450px', width: '100%' }}>
            {productData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="product_name" type="category" tick={{fill: '#475569', fontSize: 12}} width={140} tickFormatter={(value) => value.length > 20 ? value.substring(0, 20) + '...' : value} />
                  <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="total_sold" fill="#10b981" radius={[0, 4, 4, 0]} name="Qty Sold" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '100px' }}>No product data available.</div>
            )}
          </div>
        </div>

        {/* Top Distributors - Only show if 'all' is selected */}
        {selectedDistributor === 'all' && (
          <div className="data-card" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Users color="#f59e0b" /> Top Distributors
            </h3>
            <div style={{ height: '300px', width: '100%' }}>
              {distributorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributorData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="distributor_name" tick={{fill: '#475569', fontSize: 11}} angle={-45} textAnchor="end" />
                    <YAxis hide />
                    <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="total_spent" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Revenue Generated (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                 <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '100px' }}>No distributor data available.</div>
              )}
            </div>
          </div>
        )}

        {/* Low Inventory Alerts - Only show if 'all' is selected */}
        {selectedDistributor === 'all' && (
          <div className="data-card" style={{ padding: '24px', gridColumn: '1 / -1' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#ef4444' }}>
              <AlertTriangle color="#ef4444" /> Low Inventory Alerts
            </h3>
            <div style={{ overflowX: 'auto' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Pack Size</th>
                    <th>Current Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInventoryAlerts.length > 0 ? (
                    paginatedInventoryAlerts.map((item, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                        <td>{item.pack_size}</td>
                        <td style={{ fontWeight: 'bold', color: item.current_stock_qty === 0 ? '#ef4444' : '#f59e0b' }}>
                          {item.current_stock_qty}
                        </td>
                        <td>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                            background: item.current_stock_qty === 0 ? '#fee2e2' : '#fef3c7',
                            color: item.current_stock_qty === 0 ? '#ef4444' : '#d97706'
                          }}>
                            {item.current_stock_qty === 0 ? 'Out of Stock' : 'Low Stock'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        All products are sufficiently stocked!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalInvPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 8px' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Showing {(invPage - 1) * invRowsPerPage + 1} to {Math.min(invPage * invRowsPerPage, inventoryAlerts.length)} of {inventoryAlerts.length} entries
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    disabled={invPage === 1} 
                    onClick={() => setInvPage(prev => Math.max(prev - 1, 1))}
                    style={{ padding: '6px 12px', fontSize: '13px', background: invPage === 1 ? '#f1f5f9' : '#fff', color: invPage === 1 ? '#94a3b8' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: invPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <button 
                    disabled={invPage === totalInvPages} 
                    onClick={() => setInvPage(prev => Math.min(prev + 1, totalInvPages))}
                    style={{ padding: '6px 12px', fontSize: '13px', background: invPage === totalInvPages ? '#f1f5f9' : '#fff', color: invPage === totalInvPages ? '#94a3b8' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: invPage === totalInvPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Detailed Transaction Report */}
        <div className="data-card" style={{ padding: '24px', gridColumn: '1 / -1', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FileText color="var(--primary)" /> Detailed Transaction Report
            </h3>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }} ref={transDropdownRef}>
                <button 
                  onClick={() => setIsTransDistOpen(!isTransDistOpen)}
                  style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '180px', justifyContent: 'space-between', fontSize: '13px', cursor: 'pointer' }}
                >
                  {selectedTransDistributorName} <ChevronDown size={14} />
                </button>

                {isTransDistOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '220px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '4px', zIndex: 100, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>
                      <input 
                        type="text" 
                        placeholder="Search distributor..." 
                        value={transDistSearch}
                        onChange={e => setTransDistSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px', background: 'transparent' }}
                      />
                    </div>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      <div 
                        onClick={() => { setTransDistributor('all'); setIsTransDistOpen(false); setTransDistSearch(''); }}
                        style={{ padding: '8px 10px', cursor: 'pointer', fontSize: '13px', background: transDistributor === 'all' ? '#f1f5f9' : 'transparent', fontWeight: transDistributor === 'all' ? 600 : 400, color: transDistributor === 'all' ? 'var(--primary)' : '#334155' }}
                        onMouseEnter={e => { if (transDistributor !== 'all') e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={e => { if (transDistributor !== 'all') e.currentTarget.style.background = 'transparent'; }}
                      >
                        All Distributors
                      </div>
                      {filteredTransDistributors.map(d => (
                        <div 
                          key={d.user_id}
                          onClick={() => { setTransDistributor(d.user_id.toString()); setIsTransDistOpen(false); setTransDistSearch(''); }}
                          style={{ padding: '8px 10px', cursor: 'pointer', fontSize: '13px', background: transDistributor === d.user_id.toString() ? '#f1f5f9' : 'transparent', fontWeight: transDistributor === d.user_id.toString() ? 600 : 400, color: transDistributor === d.user_id.toString() ? 'var(--primary)' : '#334155' }}
                          onMouseEnter={e => { if (transDistributor !== d.user_id.toString()) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { if (transDistributor !== d.user_id.toString()) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {d.firm_name}
                        </div>
                      ))}
                      {filteredTransDistributors.length === 0 && (
                        <div style={{ padding: '8px 10px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>No matches found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Month:</span>
                <select 
                  value={transMonth} 
                  onChange={e => setTransMonth(e.target.value)}
                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', fontSize: '13px' }}
                >
                  <option value="">Select</option>
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>)}
                </select>
                <select 
                  value={transYear} 
                  onChange={e => setTransYear(e.target.value)}
                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', fontSize: '13px' }}
                >
                  <option value="">Year</option>
                  {[2023, 2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <span style={{ fontSize: '13px', color: '#94a3b8' }}>OR</span>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <input 
                  type="date" 
                  value={transStartDate} 
                  onChange={e => setTransStartDate(e.target.value)} 
                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', fontSize: '13px' }} 
                />
                <span style={{ fontSize: '13px', color: '#64748b' }}>to</span>
                <input 
                  type="date" 
                  value={transEndDate} 
                  onChange={e => setTransEndDate(e.target.value)} 
                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', fontSize: '13px' }} 
                />
              </div>

              <button 
                onClick={() => { setTransStartDate(''); setTransEndDate(''); setTransMonth(''); setTransYear(''); setTransDistributor('all'); }}
                style={{ padding: '6px 12px', fontSize: '13px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Clear
              </button>

              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button 
                  onClick={handleDownloadExcel}
                  style={{ padding: '8px 16px', fontSize: '13px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FileSpreadsheet size={16} /> Excel
                </button>
                <button 
                  onClick={handleDownloadPDF}
                  style={{ padding: '8px 16px', fontSize: '13px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={16} /> PDF
                </button>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
            {transLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading transactions...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>SR</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>DATE</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>BILL NO</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>FIRM NAME</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>TOWN</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>TAXABLE AMOUNT</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>GST AMOUNT</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length > 0 ? filteredTransactions.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{t.invoice_number}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500 }}>{t.firm_name}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.town}>{t.town || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap', textAlign: 'right' }}>₹{t.taxable_amount.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', whiteSpace: 'nowrap', textAlign: 'right' }}>₹{t.gst_amount.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#059669', whiteSpace: 'nowrap', textAlign: 'right' }}>₹{t.total_amount.toFixed(2)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        No transactions found for the selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
                  <tr>
                    <td colSpan={5} style={{ padding: '12px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>GRAND TOTAL:</td>
                    <td style={{ padding: '12px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>₹{filteredTransactions.reduce((sum, t) => sum + t.taxable_amount, 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px', textAlign: 'right' }}>₹{filteredTransactions.reduce((sum, t) => sum + t.gst_amount, 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', background: '#ecfdf5', borderTop: '2px solid #10b981', color: '#047857', fontWeight: 700, fontSize: '14px', textAlign: 'right' }}>₹{filteredTransactions.reduce((sum, t) => sum + t.total_amount, 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminReports;
