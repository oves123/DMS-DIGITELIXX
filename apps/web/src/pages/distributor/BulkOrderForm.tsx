import { useState, useEffect, useMemo, Fragment } from 'react';
import api from '../../lib/api';
import { useToast } from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Trash2, X } from 'lucide-react';
import { useAutoSave, useNavigationWarning } from '../../hooks/useAutoSave';

const BulkOrderForm = () => {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  // orderData maps variant_id to quantity
  const [orderData, setOrderData, clearOrderData] = useAutoSave<Record<number, number>>('distributor_order_cart', {});
  const [submitting, setSubmitting] = useState(false);
  
  useNavigationWarning(Object.keys(orderData).length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [applyWallet, setApplyWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const user = JSON.parse(localStorage.getItem('dms_user') || '{}');

  // Derive preview items from orderData
  const previewItems = useMemo(() => {
    const items: any[] = [];
    catalog.forEach(product => {
      product.variants.forEach((variant: any) => {
        const qty = orderData[variant.variant_id];
        if (qty && qty > 0) {
          items.push({
            ...variant,
            product_name: product.name,
            qty: qty
          });
        }
      });
    });
    return items;
  }, [catalog, orderData]);

  useEffect(() => {
    fetchCatalog();
    if (user.user_id) {
      api.get(`/api/distributors/${user.user_id}/wallet`)
        .then(res => setWalletBalance(res.data.wallet_balance || 0))
        .catch(() => console.error('Failed to fetch wallet'));
    }
  }, []);

  const fetchCatalog = async () => {
    try {
      const response = await api.get('/api/products');
      const validProducts = response.data.filter((p: any) => p.variants && p.variants.length > 0);
      
      // Sort variants numerically by pack size (e.g. 5Rs before 10Rs)
      validProducts.forEach((p: any) => {
        p.variants.sort((a: any, b: any) => {
          const numA = parseInt(a.pack_size) || 0;
          const numB = parseInt(b.pack_size) || 0;
          return numA - numB;
        });
      });

      setCatalog(validProducts);
      
      // Auto-expand all by default
      const initialExpand: Record<number, boolean> = {};
      validProducts.forEach((p: any) => initialExpand[p.product_id] = true);
      setExpandedProducts(initialExpand);
    } catch (err) {
      showToast('Failed to load product catalog.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (productId: number) => {
    setExpandedProducts(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const handleQtyChange = (variantId: number, value: string) => {
    const qty = parseInt(value, 10);
    setOrderData(prev => {
      const newData = { ...prev };
      if (isNaN(qty) || qty <= 0) {
        delete newData[variantId];
      } else {
        newData[variantId] = qty;
      }
      return newData;
    });
  };

  const { grandTotalQty, grandTotalValue } = useMemo(() => {
    let q = 0;
    let v = 0;
    catalog.forEach(product => {
      product.variants.forEach((variant: any) => {
        const qty = orderData[variant.variant_id];
        if (qty) {
          q += qty;
          v += (qty * variant.distributor_rate);
        }
      });
    });
    return { grandTotalQty: q, grandTotalValue: Math.round(v) };
  }, [orderData, catalog]);

  const handleSubmitOrder = async () => {
    if (grandTotalQty === 0) {
      showToast('Please enter at least one quantity to place an order.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (!user.user_id) throw new Error("Not logged in");

      const items: { variant_id: number, requested_qty: number, price_at_order: number }[] = [];

      catalog.forEach(product => {
        product.variants.forEach((variant: any) => {
          const qty = orderData[variant.variant_id];
          if (qty) {
            items.push({
              variant_id: variant.variant_id,
              requested_qty: qty,
              price_at_order: variant.distributor_rate
            });
          }
        });
      });

      await api.post('/api/orders', {
        distributor_id: user.user_id,
        items,
        apply_wallet: applyWallet ? 1 : 0
      });
      
      showToast('Order placed successfully!', 'success');
      clearOrderData();
      setShowPreviewModal(false);
      navigate('/distributor/orders');
    } catch (err: any) {
      console.error(err);
      showToast('Failed to place order.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = useMemo(() => {
    const cats = new Set(catalog.map(p => p?.category_name).filter(c => typeof c === 'string' && c.trim() !== ''));
    return ['All', ...Array.from(cats)];
  }, [catalog]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading Catalog...</div>;
  }

  const filteredCatalog = catalog.filter(product => {
    const matchesSearch = (product?.name || '').toLowerCase().includes((searchQuery || '').toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product?.category_name === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ paddingBottom: '80px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 className="page-title" style={{ margin: 0 }}>Bulk Purchase Order Form</h2>

        {/* Category Dropdown & Search Bar */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              outlineColor: 'var(--primary)',
              background: '#fff',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div style={{ position: 'relative', width: '300px' }}>
            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outlineColor: 'var(--primary)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="data-card" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)', border: '2px solid #e2e8f0', borderRadius: '12px', maxWidth: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>
                PRODUCT NAME
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                PACK SIZE
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                PRICE / BOX (₹)
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 12px', background: '#f0fdf4', borderBottom: '2px solid #cbd5e1', color: '#166534', fontWeight: 700, width: '120px', fontSize: '13px' }}>
                QTY (BOXES)
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 12px', background: '#f0fdf4', borderBottom: '2px solid #cbd5e1', color: '#166534', fontWeight: 700, textAlign: 'right', fontSize: '13px' }}>
                TOTAL VALUE (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCatalog.map((product) => {
              const isExpanded = expandedProducts[product.product_id];
              return (
                <Fragment key={product.product_id}>
                  {/* Master Product Header Row */}
                  <tr 
                    style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                    onClick={() => toggleExpand(product.product_id)}
                  >
                    <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ display: 'inline-block', width: '16px', color: '#64748b', textAlign: 'center' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <div style={{ 
                          width: '32px', height: '32px', background: '#e2e8f0', borderRadius: '6px', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                        }}>
                          <Package size={18} />
                        </div>
                        <div>
                          {product.name}
                          <span style={{ marginLeft: '12px', fontSize: '12px', color: '#64748b', fontWeight: 'normal', background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px' }}>
                            {product.variants.length} Variants
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Nested Variant Rows */}
                  {isExpanded && product.variants.map((variant: any) => {
                    const qty = orderData[variant.variant_id] || '';
                    const rowValue = qty ? (qty * variant.distributor_rate) : 0;
                    
                    return (
                      <tr key={variant.variant_id} style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 12px', paddingLeft: '80px', color: '#64748b', fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#cbd5e1' }}></div>
                            {variant.pack_size}
                          </div>
                        </td>
                        <td style={{ padding: '6px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>
                          {variant.pack_size}
                        </td>
                        <td style={{ padding: '6px 12px', color: '#166534', fontWeight: 600, fontSize: '13px' }}>
                          ₹{variant.distributor_rate.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 12px', background: '#f0fdf4' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={qty}
                            onChange={(e) => handleQtyChange(variant.variant_id, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '4px 8px',
                              textAlign: 'center',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              outlineColor: 'var(--primary)',
                              fontWeight: 'bold',
                              fontSize: '14px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: rowValue > 0 ? '#166534' : '#9ca3af', background: '#f0fdf4', fontSize: '13px' }}>
                          ₹{rowValue.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky-bottom-bar">
        <div className="sticky-bottom-metrics">
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Quantity</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>{grandTotalQty} Boxes</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Grand Total Value</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
              {applyWallet && walletBalance > 0 && (
                <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '16px', marginRight: '8px' }}>
                  ₹{grandTotalValue.toFixed(2)}
                </span>
              )}
              ₹{(applyWallet ? Math.max(0, grandTotalValue - walletBalance) : grandTotalValue).toFixed(2)}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowPreviewModal(true)}
          disabled={submitting || grandTotalQty === 0}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            background: (submitting || grandTotalQty === 0) ? '#cbd5e1' : 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: (submitting || grandTotalQty === 0) ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)',
            transition: 'all 0.2s'
          }}
        >
          Review Order
        </button>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ 
            background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '900px', 
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            
            {/* Modal Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Review Your Order</h3>
              <button 
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {previewItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Your order is empty. Please select some items.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px' }}>Product</th>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px' }}>Pack Size</th>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px' }}>Price/Box</th>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px', width: '120px' }}>Quantity</th>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '14px', textAlign: 'center', width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item) => (
                      <tr key={item.variant_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{item.product_name}</td>
                        <td style={{ padding: '12px', color: '#64748b' }}>{item.pack_size}</td>
                        <td style={{ padding: '12px', color: '#166534', fontWeight: 500 }}>₹{item.distributor_rate.toFixed(2)}</td>
                        <td style={{ padding: '12px' }}>
                          <input
                            type="number"
                            min="0"
                            value={item.qty}
                            onChange={(e) => handleQtyChange(item.variant_id, e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', textAlign: 'center', border: '1px solid #cbd5e1',
                              borderRadius: '4px', outlineColor: 'var(--primary)', fontWeight: 'bold'
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                          ₹{(item.qty * item.distributor_rate).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleQtyChange(item.variant_id, '0')}
                            title="Remove from order"
                            style={{ background: '#fef2f2', border: 'none', color: '#ef4444', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <div className="modal-footer-metrics">
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Boxes</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{grandTotalQty}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Grand Total</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                    {applyWallet && walletBalance > 0 && (
                      <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '16px', marginRight: '8px' }}>
                        ₹{grandTotalValue.toFixed(2)}
                      </span>
                    )}
                    ₹{(applyWallet ? Math.max(0, grandTotalValue - walletBalance) : grandTotalValue).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="modal-footer-actions">
                {walletBalance > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', padding: '8px 16px', borderRadius: '8px', border: '1px solid #10b981' }}>
                    <input 
                      type="checkbox" 
                      id="applyWallet"
                      checked={applyWallet}
                      onChange={e => setApplyWallet(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#10b981' }}
                    />
                    <label htmlFor="applyWallet" style={{ cursor: 'pointer', fontSize: '14px', color: '#065f46', fontWeight: 600 }}>
                      Apply Wallet Balance (₹{parseFloat(walletBalance.toString()).toFixed(2)})
                    </label>
                  </div>
                )}
                
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  style={{ padding: '12px 24px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ← Go Back
                </button>
                <button 
                  onClick={handleSubmitOrder}
                  disabled={submitting || grandTotalQty === 0}
                  style={{
                    padding: '12px 24px', background: (submitting || grandTotalQty === 0) ? '#cbd5e1' : 'var(--primary)',
                    color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: (submitting || grandTotalQty === 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submitting ? 'Placing Order...' : 'Confirm & Place Order'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default BulkOrderForm;
