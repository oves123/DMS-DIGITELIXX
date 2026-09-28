import { useState, useEffect } from 'react';
import api from '../../lib/api';
import InvoiceModal from '../../components/InvoiceModal';

const DistributorLedger = () => {
  const [ledger, setLedger] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const user = JSON.parse(localStorage.getItem('dms_user') || '{}');

  useEffect(() => {
    fetchLedger();
  }, []);

  const fetchLedger = async () => {
    try {
      const response = await api.get(`/api/ledger/payment/distributor/${user.user_id}`);
      setLedger(response.data);
    } catch (err) {
      setError('Failed to fetch ledger details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading ledger...</div>;
  }

  if (error) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">My Ledger & Payments</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Total Billed</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>₹{(ledger?.summary?.total_billed || 0).toFixed(2)}</div>
        </div>
        <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '13px', color: '#166534', marginBottom: '4px' }}>Total Paid</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#15803d' }}>₹{(ledger?.summary?.total_paid || 0).toFixed(2)}</div>
        </div>
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '13px', color: '#991b1b', marginBottom: '4px' }}>Total Pending</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#b91c1c' }}>₹{((ledger?.summary?.total_billed || 0) - (ledger?.summary?.total_paid || 0)).toFixed(2)}</div>
        </div>
      </div>

      {ledger?.unpaid_invoices?.length > 0 && (
        <div className="data-card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '16px' }}>Unpaid Invoices</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Total Amount</th>
                  <th>Paid Amount</th>
                  <th>Pending Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.unpaid_invoices.map((inv: any) => (
                  <tr key={inv.invoice_id}>
                    <td>
                      <button 
                        onClick={() => setSelectedOrderId(inv.order_id)}
                        style={{ background: 'none', border: 'none', padding: 0, fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600 }}>₹{inv.grand_total}</td>
                    <td 
                        style={{ color: '#166534', cursor: inv.credit_applied > 0 ? 'help' : 'default' }}
                        title={inv.credit_applied > 0 ? `Wallet Balance Applied: ₹${Number(inv.credit_applied).toFixed(2)}` : undefined}
                    >
                        ₹{inv.paid_amount || 0}
                    </td>
                    <td 
                        style={{ fontWeight: 600, color: '#b91c1c', cursor: inv.credit_applied > 0 ? 'help' : 'default' }}
                        title={inv.credit_applied > 0 ? `Invoice: ₹${Number(inv.grand_total).toFixed(2)} - Wallet Paid: ₹${Number(inv.credit_applied).toFixed(2)} = Pending: ₹${(Number(inv.grand_total) - Number(inv.paid_amount || 0)).toFixed(2)}` : undefined}
                    >
                        ₹{(inv.grand_total - (inv.paid_amount || 0)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="data-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '16px' }}>Payment History</h3>
        {ledger?.recent_payments?.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px' }}>No payments recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th>Payment Mode</th>
                  <th>Reference No.</th>
                  <th>Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {ledger?.recent_payments?.map((p: any) => (
                  <tr key={p.payment_id}>
                    <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 500 }}>{p.invoice_number}</td>
                    <td>{p.payment_mode}</td>
                    <td style={{ color: '#64748b' }}>{p.reference_no || '-'}</td>
                    <td style={{ fontWeight: 600, color: '#166534' }}>₹{p.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrderId && (
        <InvoiceModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      )}
    </div>
  );
};

export default DistributorLedger;
