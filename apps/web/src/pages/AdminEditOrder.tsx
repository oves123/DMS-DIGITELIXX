import React, { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { Search, ShoppingCart, User, Settings2, Filter, Package, Trash2, ArrowLeft } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useParams, useNavigate } from 'react-router-dom';
import { useAutoSave, useNavigationWarning } from '../hooks/useAutoSave';

const AdminEditOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [selectedClient, setSelectedClient, clearClient] = useAutoSave<any>(`admin_edit_order_${id}_client`, null);
  const [pricingTier, setPricingTier, clearPricingTier] = useAutoSave<'distributor' | 'retailer'>(`admin_edit_order_${id}_pricing_tier`, 'distributor');
  const [priceListVersion, setPriceListVersion, clearPriceListVersion] = useAutoSave<'new' | 'old'>(`admin_edit_order_${id}_price_version`, 'new');
  
  const [cart, setCart, clearCart] = useAutoSave<{ [key: number]: { qty: number, variant: any, price: number, product_name?: string } }>(`admin_edit_order_${id}_cart`, {});
  
  // Track if initial load is done so we don't warn immediately if the cart has items from the DB
  const [hasChanges, setHasChanges] = useState(false);

  // Warn if cart has been changed since initial load
  useNavigationWarning(hasChanges);
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);



  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [distRes, prodRes, ordersRes] = await Promise.all([
        api.get('/api/distributors'),
        api.get('/api/products'),
        api.get('/api/orders/admin')
      ]);
      setClients(distRes.data);
      
      const sortedProducts = prodRes.data.map((p: any) => ({
        ...p,
        variants: p.variants ? [...p.variants].sort((a: any, b: any) => {
          const aPack = String(a.pack_size || '').toLowerCase();
          const bPack = String(b.pack_size || '').toLowerCase();
          
          const aIs5 = aPack.includes('5rs');
          const aIs10 = aPack.includes('10rs');
          const bIs5 = bPack.includes('5rs');
          const bIs10 = bPack.includes('10rs');

          if (aIs5 && !bIs5) return -1;
          if (!aIs5 && bIs5) return 1;
          if (aIs10 && !bIs10) return -1;
          if (!aIs10 && bIs10) return 1;
          return 0;
        }) : []
      }));

      setProducts(sortedProducts);
      
      // Find the order
      const order = ordersRes.data.find((o: any) => o.order_id.toString() === id);
      if (order) {
        // Set client
        const client = distRes.data.find((c: any) => c.firm_name === order.distributor_name);
        setSelectedClient(client);
        if (client) {
            setPricingTier(client.rate_type || 'distributor');
            setPriceListVersion(client.rate_version === 'old' ? 'old' : 'new');
        }
        
        // Populate cart
        const initialCart: any = {};
        order.items.forEach((item: any) => {
            // Find full variant object from products
            let fullVariant = null;
            sortedProducts.forEach((p: any) => {
                const v = p.variants.find((vari: any) => vari.variant_id === item.variant_id);
                if (v) fullVariant = v;
            });
            
            if (fullVariant) {
                initialCart[item.variant_id] = {
                    qty: item.requested_qty,
                    variant: fullVariant,
                    price: item.price_at_order,
                    product_name: item.product_name
                };
            }
        });
        
        // Only set cart if we didn't load from local storage
        if (Object.keys(cart).length === 0) {
            setCart(initialCart);
        }
      } else {
        showToast('Order not found', 'error');
        navigate('/admin/orders');
      }

    } catch (err) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClientChange = (clientId: string) => {
    if (!clientId) {
      setSelectedClient(null);
      return;
    }
    const client = clients.find(c => c.user_id.toString() === clientId);
    setSelectedClient(client);
    if (client) {
      setPricingTier(client.rate_type || 'distributor');
    }
  };

  const getPrice = (variant: any) => {
    if (priceListVersion === 'old') {
        if (pricingTier === 'retailer' && variant.old_retailer_rate != null) return variant.old_retailer_rate;
        if (pricingTier === 'distributor' && variant.old_distributor_rate != null) return variant.old_distributor_rate;
    }
    return pricingTier === 'retailer' ? variant.retailer_rate : variant.distributor_rate;
  };

  const updateCart = (variant: any, delta: number, productName?: string) => {
    setCart(prev => {
      const current = prev[variant.variant_id]?.qty || 0;
      let next = current + delta;
      
      const maxStock = variant.current_stock || 0;
      if (next > maxStock && delta > 0) {
        next = maxStock; // Cap at max stock
      }
      
      const newCart = { ...prev };
      
      if (next <= 0) {
        delete newCart[variant.variant_id];
      } else {
        const price = getPrice(variant);
        newCart[variant.variant_id] = { 
          qty: next, 
          variant, 
          price,
          product_name: productName || prev[variant.variant_id]?.product_name || 'Unknown Product'
        };
      }
      
      setHasChanges(true);
      return newCart;
    });
  };

  const handleQtyChange = (variant: any, nextQty: number, productName?: string) => {
    setCart(prev => {
      const newCart = { ...prev };
      const maxStock = variant.current_stock || 0;
      
      let finalQty = nextQty;
      if (finalQty > maxStock) finalQty = maxStock;

      if (finalQty <= 0 || isNaN(finalQty)) {
        delete newCart[variant.variant_id];
      } else {
        const price = getPrice(variant);
        newCart[variant.variant_id] = { 
          qty: finalQty, 
          variant, 
          price,
          product_name: productName || prev[variant.variant_id]?.product_name || 'Unknown Product'
        };
      }
      setHasChanges(true);
      return newCart;
    });
  };

  // Re-calculate cart prices if pricing tier or price list changes
  useEffect(() => {
    setCart(prev => {
      const newCart = { ...prev };
      Object.keys(newCart).forEach(key => {
        const item = newCart[parseInt(key)];
        item.price = getPrice(item.variant);
      });
      return newCart;
    });
  }, [pricingTier, priceListVersion]);

  const cartTotal = useMemo(() => {
    let total = 0;
    Object.values(cart).forEach((item: any) => {
      total += item.qty * item.price;
    });
    return Math.round(total);
  }, [cart]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category_name || 'Uncategorized'));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory !== 'All') {
      result = result.filter(p => (p.category_name || 'Uncategorized') === selectedCategory);
    }
    if (searchQuery) {
      result = result.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return result;
  }, [products, searchQuery, selectedCategory]);

  const toggleExpand = (id: number) => {
    setExpandedProducts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveOrder = async () => {
    if (!selectedClient) {
      showToast('Please select a client', 'error');
      return;
    }
    const items = Object.values(cart);
    if (items.length === 0) {
      showToast('Cart is empty', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.put(`/api/orders/${id}`, {
        items: items.map((item: any) => ({
          variant_id: item.variant.variant_id,
          requested_qty: item.qty,
          price_at_order: item.price
        }))
      });
      
      showToast('Order updated successfully!', 'success');
      setHasChanges(false);
      clearCart();
      clearClient();
      clearPriceListVersion();
      clearPricingTier();
      navigate('/admin/orders');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update order', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };



  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => navigate('/admin/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', color: '#64748b' }}>
            <ArrowLeft size={20} />
        </button>
        <h2 className="page-title" style={{ margin: 0 }}>Edit Order #{id}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Client Selection & Product List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Configuration Card */}
          <div className="data-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 size={18} /> Order Configuration
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
              <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label>Select Client *</label>
                </div>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                    <User size={16} />
                  </div>
                  <select 
                    value={selectedClient?.user_id || ''} 
                    onChange={e => handleClientChange(e.target.value)}
                    disabled
                    style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--border-color)', borderRadius: '6px', background: '#f1f5f9', cursor: 'not-allowed' }}
                  >
                    <option value="">-- Choose Client --</option>
                    {clients.map(c => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.firm_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label>Price List Version *</label>
                <select 
                  value={priceListVersion} 
                  onChange={e => setPriceListVersion(e.target.value as 'new' | 'old')}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                >
                  <option value="new">New Price</option>
                  <option value="old">Old Price</option>
                </select>
              </div>

              <div className="input-group">
                <label>Pricing Tier *</label>
                <select 
                  value={pricingTier} 
                  onChange={e => setPricingTier(e.target.value as 'distributor' | 'retailer')}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                >
                  <option value="distributor">Distributor Rate (D-Rate)</option>
                  <option value="retailer">Retailer Rate (R-Rate)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Catalog */}
          <div className="data-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ margin: 0 }}>Products</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '250px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input 
                    type="text" 
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    style={{ padding: '8px 12px 8px 32px', width: '100%', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={16} color="#64748b" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '13px', cursor: 'pointer', backgroundColor: '#fff' }}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div className="table-responsive">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PRODUCT / VARIANT</th>
                      <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PACK SIZE</th>
                      <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PRICE</th>
                      <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'center' }}>AVAILABLE STOCK</th>
                      <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'center' }}>QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const ITEMS_PER_PAGE = 10;
                      const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                      
                      return paginatedProducts.map(p => {
                        const isExpanded = expandedProducts[p.product_id];
                      return (
                      <React.Fragment key={p.product_id}>
                        <tr 
                          style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                          onClick={() => toggleExpand(p.product_id)}
                        >
                          <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ display: 'inline-block', width: '16px', color: '#64748b', textAlign: 'center' }}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              <div style={{ width: '32px', height: '32px', background: '#e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                <Package size={18} />
                              </div>
                              <div>
                                {p.name}
                                <span style={{ marginLeft: '12px', fontSize: '12px', color: '#64748b', fontWeight: 'normal', background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px' }}>
                                  {p.variants.length} Variants
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && p.variants.map((v: any) => {
                          const qty = cart[v.variant_id]?.qty || '';
                          const price = getPrice(v);
                          
                          return (
                            <tr key={v.variant_id} style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 12px', paddingLeft: '48px', color: '#94a3b8', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '12px', height: '12px', borderLeft: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', borderRadius: '0 0 0 4px', marginTop: '-12px' }}></div>
                                  Variant
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>{v.pack_size}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }}>
                                ₹{price} <span style={{fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginLeft: '4px'}}>(MRP: ₹{v.mrp})</span>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', color: (v.current_stock || 0) > 0 ? '#10b981' : '#ef4444' }}>
                                {v.current_stock || 0}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <input 
                                  type="number"
                                  min="0"
                                  max={v.current_stock || 0}
                                  value={qty}
                                  onChange={(e) => handleQtyChange(v, parseInt(e.target.value) || 0, p.name)}
                                  style={{ width: '70px', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', textAlign: 'center', outline: 'none' }}
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                      );
                      });
                    })()}
                    
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                          No products found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {filteredProducts.length > 10 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 12px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, filteredProducts.length)} of {filteredProducts.length} products
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ 
                        padding: '6px 12px', 
                        border: '1px solid var(--border-color)', 
                        background: currentPage === 1 ? '#f1f5f9' : '#fff', 
                        color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                        borderRadius: '4px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Previous
                    </button>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredProducts.length / 10), p + 1))}
                      disabled={currentPage >= Math.ceil(filteredProducts.length / 10)}
                      style={{ 
                        padding: '6px 12px', 
                        border: '1px solid var(--border-color)', 
                        background: currentPage >= Math.ceil(filteredProducts.length / 10) ? '#f1f5f9' : '#fff', 
                        color: currentPage >= Math.ceil(filteredProducts.length / 10) ? '#94a3b8' : '#0f172a',
                        borderRadius: '4px',
                        cursor: currentPage >= Math.ceil(filteredProducts.length / 10) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div style={{ position: 'sticky', top: '24px' }}>
          <div className="data-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={18} /> Order Summary
            </h3>
            
            {selectedClient ? (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Selected Client</div>
                <div style={{ fontWeight: 'bold', color: '#14532d' }}>{selectedClient.firm_name}</div>
              </div>
            ) : (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
                Please select a client to place an order.
              </div>
            )}

            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px', paddingRight: '12px' }}>
              {Object.values(cart).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: '15px' }}>Cart is empty</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {Object.values(cart).map(item => (
                    <div key={item.variant.variant_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', marginBottom: '4px' }}>
                          {item.product_name}
                          <button onClick={() => updateCart(item.variant, 0 - item.qty)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div style={{ color: '#475569', fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>
                          Pack: <span style={{ color: '#0f172a' }}>{item.variant.pack_size}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button onClick={() => updateCart(item.variant, -1)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}>-</button>
                          <input type="number" min="0" value={item.qty} onChange={e => handleQtyChange(item.variant, parseInt(e.target.value) || 0)} style={{ width: '50px', padding: '4px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none', fontSize: '14px', fontWeight: 600 }} />
                          <button onClick={() => updateCart(item.variant, 1)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}>+</button>
                          <span style={{ marginLeft: '8px', fontSize: '14px', color: '#64748b' }}>x ₹{item.price}</span>
                        </div>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#0f172a', display: 'flex', alignItems: 'flex-start', paddingTop: '4px' }}>
                        ₹{(item.qty * item.price).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '18px' }}>
                <span>Subtotal</span>
                <span>₹{cartTotal.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'right', marginTop: '4px' }}>
                * GST will be calculated at execution
              </div>
            </div>

            <button 
              className="primary-btn" 
              style={{ width: '100%', padding: '12px', fontSize: '16px' }}
              disabled={!selectedClient || Object.values(cart).length === 0 || isSubmitting}
              onClick={handleSaveOrder}
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </div>

      </div>



    </div>
  );
};

export default AdminEditOrder;
