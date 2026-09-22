import { useState, useEffect, useMemo, Fragment } from 'react';
import api from '../lib/api';
import { Search, Filter, Package } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useAutoSave, useNavigationWarning } from '../hooks/useAutoSave';
import { formatIndianNumber, formatCurrencyDetailed } from '../lib/utils';

const AdminInventory = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Inline Editing State
  const [editingCell, setEditingCell, clearEditingCell] = useAutoSave<{ variantId: number, field: 'stock' | 'threshold' } | null>('admin_inventory_editing_cell', null);
  const [editValue, setEditValue, clearEditValue] = useAutoSave<string>('admin_inventory_edit_value', '');
  const { showToast } = useToast();

  // Warn if they are in the middle of editing
  useNavigationWarning(editingCell !== null);

  // Pagination, Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [showCritical, setShowCritical] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/api/inventory');
      const validProducts = response.data.filter((p: any) => p.variants && p.variants.length > 0);
      
      // Sort variants numerically by pack size (e.g. 5Rs before 10Rs)
      validProducts.forEach((p: any) => {
        p.variants.sort((a: any, b: any) => {
          const numA = parseInt(a.pack_size) || 0;
          const numB = parseInt(b.pack_size) || 0;
          return numA - numB;
        });
      });

      setInventory(validProducts);
    } catch (err) {
      setError('Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (productId: number) => {
    setExpandedProducts(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const handleInlineSave = async (variantId: number, field: 'stock' | 'threshold', currentStock?: number) => {
    if (editValue === '') {
      setEditingCell(null);
      clearEditingCell();
      return;
    }

    try {
      const payload: any = {};
      if (field === 'stock') {
        const addedStock = parseInt(editValue, 10) || 0;
        payload.current_stock = (currentStock || 0) + addedStock;
      }
      if (field === 'threshold') payload.low_stock_threshold = editValue;

      await api.put(`/api/inventory/inline/${variantId}`, payload);
      
      setEditingCell(null);
      clearEditingCell();
      setEditValue('');
      clearEditValue();
      showToast('Successfully updated', 'success');
      await fetchInventory();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update', 'error');
    }
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = inventory.map((item: any) => item.category_name).filter(Boolean);
    return ['All', ...Array.from(new Set(cats))];
  }, [inventory]);

  // Filter and Pagination Logic
  const filteredInventory = useMemo(() => {
    let result = [];
    
    for (const product of inventory) {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (product.category_name && product.category_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || product.category_name === selectedCategory;
      
      if (!matchesSearch || !matchesCategory) continue;

      // Filter child variants
      const matchingVariants = product.variants.filter((item: any) => {
        if (stockFilter === 'All') return true;
        if (stockFilter === 'Low Stock') return (item.current_stock || 0) <= (item.low_stock_threshold || 5);
        if (stockFilter === 'Out of Stock') return (item.current_stock || 0) === 0;
        return true;
      });

      if (matchingVariants.length > 0) {
        result.push({ ...product, variants: matchingVariants });
      }
    }

    if (showCritical) {
      result.sort((a, b) => {
        const aCritical = a.variants.some((v: any) => (v.current_stock || 0) <= (v.low_stock_threshold || 5));
        const bCritical = b.variants.some((v: any) => (v.current_stock || 0) <= (v.low_stock_threshold || 5));
        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;
        return 0; // fallback to default order
      });
    }

    return result;
  }, [inventory, searchQuery, selectedCategory, stockFilter, showCritical]);

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredInventory.slice(indexOfFirstItem, indexOfLastItem);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, stockFilter, showCritical]);


  // Calculate Grand Totals
  const { totalValue, totalItems, criticalItems } = useMemo(() => {
    let tVal = 0;
    let tItems = 0;
    let cItems = 0;
    inventory.forEach(p => {
      p.variants?.forEach((v: any) => {
        tItems += v.current_stock || 0;
        tVal += (v.current_stock || 0) * (v.distributor_rate || 0);
        if (v.current_stock <= (v.low_stock_threshold || 5)) {
          cItems++;
        }
      });
    });
    return { totalValue: tVal, totalItems: tItems, criticalItems: cItems };
  }, [inventory]);


  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Live Inventory Management</h2>
      </div>

      {!loading && inventory.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Total Warehouse Value</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }} title={'₹' + formatCurrencyDetailed(totalValue)}>₹{formatIndianNumber(totalValue)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Total Items in Stock</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }} title={totalItems.toLocaleString('en-IN')}>{formatIndianNumber(totalItems)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Critical Items (Low Stock)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: criticalItems > 0 ? '#ef4444' : '#10b981' }}>{criticalItems} Variants</div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="data-card">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading inventory...</div>
        ) : inventory.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            No products found. Add products first to manage their inventory.
          </div>
        ) : (
          <div>
            {/* Search Bar + Filters */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Search */}
                <div style={{ position: 'relative', width: '300px' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                    <Search size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search by product name or category..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                      padding: '10px 16px 10px 38px', 
                      width: '100%', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      fontSize: '14px',
                      transition: 'border-color 0.2s',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={16} color="#64748b" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>

                {/* Stock Level Filter */}
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}
                >
                  <option value="All">All Stock Levels</option>
                  <option value="Low Stock">Low Stock (&lt;100)</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>

                {/* Clear Filters */}
                {(searchQuery || selectedCategory !== 'All' || stockFilter !== 'All' || showCritical) && (
                  <button
                    onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setStockFilter('All'); setShowCritical(false); }}
                    style={{ padding: '6px 12px', fontSize: '13px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    ✕ Clear Filters
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 500, color: '#dc2626' }}>
                  <input 
                    type="checkbox" 
                    checked={showCritical} 
                    onChange={(e) => setShowCritical(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: '#dc2626' }}
                  />
                  Show Critical Stock First
                </label>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px', whiteSpace: 'nowrap' }}>
                  Showing {filteredInventory.length > 0 ? indexOfFirstItem + 1 : 0} to {Math.min(indexOfLastItem, filteredInventory.length)} of {filteredInventory.length} products
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontWeight: 700, fontSize: '13px' }}>PRODUCT NAME</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>CATEGORY</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PACK SIZE</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'center' }}>CURRENT STOCK</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'center' }}>ALERT LIMIT</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'right' }}>AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.length > 0 ? (
                    currentItems.map((product) => {
                      const isExpanded = expandedProducts[product.product_id];
                      
                      const totalProdStock = product.variants.reduce((sum: number, v: any) => sum + (v.current_stock || 0), 0);
                      const totalProdAmount = product.variants.reduce((sum: number, v: any) => sum + ((v.current_stock || 0) * (v.distributor_rate || 0)), 0);
                      const hasLowStock = product.variants.some((v: any) => (v.current_stock || 0) <= (v.low_stock_threshold || 5));

                      return (
                        <Fragment key={product.product_id}>
                          {/* Master Product Header Row */}
                          <tr 
                            style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                            onClick={() => toggleExpand(product.product_id)}
                          >
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>
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
                            <td style={{ padding: '10px 12px', color: '#0f172a', fontSize: '14px', fontWeight: 500 }}>
                              {product.category_name || '-'}
                            </td>
                            <td></td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a', textAlign: 'center' }}>
                              {totalProdStock} Total
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {hasLowStock ? <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', background: '#fef2f2', padding: '4px 8px', borderRadius: '4px' }}>⚠️ 1+ Variant Low!</span> : <span style={{ color: '#94a3b8' }}>-</span>}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: totalProdAmount > 0 ? '#166534' : totalProdAmount < 0 ? '#dc2626' : '#64748b', textAlign: 'right' }}>
                              ₹{totalProdAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>

                          {/* Nested Variant Rows */}
                          {isExpanded && product.variants.map((item: any) => {
                            const isLowStock = (item.current_stock || 0) <= (item.low_stock_threshold || 5);
                            const amount = item.current_stock * item.distributor_rate;
                            
                            return (
                            <tr key={item.variant_id} style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                              <td colSpan={2} style={{ padding: '8px 12px', paddingLeft: '80px', color: '#94a3b8', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '12px', height: '12px', borderLeft: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', borderRadius: '0 0 0 4px', marginTop: '-12px' }}></div>
                                  Variant
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>{item.pack_size}</td>
                              
                              <td 
                                onClick={() => {
                                  if (editingCell?.variantId !== item.variant_id || editingCell?.field !== 'stock') {
                                    setEditingCell({ variantId: item.variant_id, field: 'stock' });
                                    setEditValue('');
                                  }
                                }}
                                style={{ cursor: 'pointer', position: 'relative', textAlign: 'center' }}
                                title="Click to add new stock"
                              >
                                {editingCell?.variantId === item.variant_id && editingCell?.field === 'stock' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 600 }}>{item.current_stock} +</span>
                                    <input 
                                      type="number"
                                      autoFocus
                                      placeholder="New"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleInlineSave(item.variant_id, 'stock', item.current_stock);
                                        if (e.key === 'Escape') {
                                            setEditingCell(null);
                                            clearEditingCell();
                                            setEditValue('');
                                            clearEditValue();
                                          }
                                      }}
                                      style={{ width: '60px', padding: '6px', border: '2px solid var(--primary)', borderRadius: '4px', outline: 'none' }}
                                    />
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: isLowStock ? '#ef4444' : '#10b981',
                                    fontSize: '15px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    transition: 'background 0.2s',
                                    background: isLowStock ? '#fef2f2' : '#ecfdf5'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                                  onMouseLeave={e => e.currentTarget.style.background = isLowStock ? '#fef2f2' : '#ecfdf5'}
                                  >
                                    {item.current_stock}
                                    {isLowStock && <span style={{ fontSize: '16px' }}>⚠️</span>}
                                  </span>
                                  </div>
                                )}
                              </td>
                              <td 
                                onClick={() => {
                                  setEditingCell({ variantId: item.variant_id, field: 'threshold' });
                                  setEditValue(item.low_stock_threshold?.toString() || '5');
                                }}
                                style={{ cursor: 'pointer', textAlign: 'center' }}
                                title="Click to quickly edit limit"
                              >
                                {editingCell?.variantId === item.variant_id && editingCell?.field === 'threshold' ? (
                                  <input 
                                    type="number"
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleInlineSave(item.variant_id, 'threshold');
                                      if (e.key === 'Escape') {
                                        setEditingCell(null);
                                        clearEditingCell();
                                        setEditValue('');
                                        clearEditValue();
                                      }
                                    }}
                                    style={{ width: '80px', padding: '6px', border: '2px solid #f59e0b', borderRadius: '4px', outline: 'none' }}
                                  />
                                ) : (
                                  <span style={{ 
                                    color: '#64748b',
                                    fontSize: '14px',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >
                                    {item.low_stock_threshold || 5}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: amount > 0 ? '#166534' : amount < 0 ? '#dc2626' : '#64748b', fontWeight: 600, fontSize: '14px', textAlign: 'right' }}>
                                ₹{amount.toFixed(2)}
                              </td>
                            </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        No inventory matches your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                <button 
                  onClick={handlePrevPage} 
                  disabled={currentPage === 1}
                  style={{ 
                    padding: '8px 16px', 
                    background: currentPage === 1 ? '#f3f4f6' : '#fff', 
                    color: currentPage === 1 ? '#9ca3af' : 'var(--text-main)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '6px', 
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 500
                  }}>
                  Previous
                </button>
                
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button 
                  onClick={handleNextPage} 
                  disabled={currentPage === totalPages}
                  style={{ 
                    padding: '8px 16px', 
                    background: currentPage === totalPages ? '#f3f4f6' : '#fff', 
                    color: currentPage === totalPages ? '#9ca3af' : 'var(--text-main)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '6px', 
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 500
                  }}>
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminInventory;
