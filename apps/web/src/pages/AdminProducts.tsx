import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import api from '../lib/api';
import { Link } from 'react-router-dom';
import { Search, Edit, Trash2, Filter, Upload, Plus, Package } from 'lucide-react';
import Papa from 'papaparse';
import { useToast } from '../components/Toast';

const AdminProducts = () => {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Pagination, Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedHsn, setSelectedHsn] = useState('All');
  const [rateView, setRateView] = useState<'new' | 'old'>('new');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit & Add Variant Modal State
  const [editingVariant, setEditingVariant] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isUpdating, setIsUpdating] = useState(false);

  const [addingVariantTo, setAddingVariantTo] = useState<any>(null);
  const [newVariantForm, setNewVariantForm] = useState({ pack_size: '', pieces_per_box: '', distributor_rate: '', retailer_rate: '', old_distributor_rate: '', old_retailer_rate: '', mrp: '', rate_type: 'new' });
  const [isAddingVariant, setIsAddingVariant] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
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
    } catch (err) {
      setError('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (productId: number) => {
    setExpandedProducts(prev => ({ ...prev, [productId]: !prev[productId] }));
  };

  const handleDelete = async (variant_id: number) => {
    if (!window.confirm('Are you sure you want to delete this product variant?')) return;
    try {
      await api.delete(`/api/products/${variant_id}`);
      fetchProducts(); // Refresh list
    } catch (err) {
      showToast('Failed to delete product', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const response = await api.post('/api/products/bulk', results.data);
          showToast(`Upload complete: ${response.data.successCount} added, ${response.data.skipCount} skipped.`, 'success');
          fetchProducts();
        } catch (err: any) {
          showToast(err.response?.data?.message || 'Failed to upload products', 'error');
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = ''; // reset input
        }
      },
      error: (error: any) => {
        showToast(`Error parsing CSV: ${error.message}`, 'error');
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const handleDownloadTemplate = () => {
    const templateHeaders = "PRODUCT CATEGORY,PRODUCT NAME,HSN CODE,Packing,MRP-NEW,WEIGHT PER UNIT-GMS,GST Rate,PCS IN Box/Bag,DB RATE WITHOUT GST,RT RATE WITHOUT GST\n";
    const sampleRow = "NAMKEEN,RATLAMI SEV,21069099,5Rs,5,18g,5,240,925.17,996\n";
    const blob = new Blob([templateHeaders + sampleRow], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'Product_Upload_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openEditModal = (variant: any) => {
    let initialRateType = 'new';
    if (variant.old_distributor_rate && variant.distributor_rate === 0) initialRateType = 'old';
    else if (variant.old_distributor_rate && variant.distributor_rate) initialRateType = 'both';

    setEditingVariant(variant);
    setEditForm({ ...variant, rate_type: initialRateType });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      let d_rate = editForm.rate_type === 'old' ? 0 : parseFloat(editForm.distributor_rate) || 0;
      let r_rate = editForm.rate_type === 'old' ? 0 : parseFloat(editForm.retailer_rate) || 0;
      let old_d_rate = editForm.rate_type === 'new' ? null : parseFloat(editForm.old_distributor_rate) || null;
      let old_r_rate = editForm.rate_type === 'new' ? null : parseFloat(editForm.old_retailer_rate) || null;

      await api.put(`/api/products/${editingVariant.variant_id}`, {
        name: editingVariant.product_name,
        category_name: editingVariant.category_name,
        hsn_code: editingVariant.hsn_code,
        gst_percent: editingVariant.gst_percent,
        pack_size: editForm.pack_size,
        uom: editingVariant.uom,
        pieces_per_box: editForm.pieces_per_box ? parseInt(editForm.pieces_per_box) : null,
        distributor_rate: d_rate,
        retailer_rate: r_rate,
        old_distributor_rate: old_d_rate,
        old_retailer_rate: old_r_rate
      });
      setEditingVariant(null);
      fetchProducts();
      showToast('Variant updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update variant', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingVariant(true);
    try {
        let d_rate = newVariantForm.rate_type === 'old' ? 0 : parseFloat(newVariantForm.distributor_rate) || 0;
        let r_rate = newVariantForm.rate_type === 'old' ? 0 : parseFloat(newVariantForm.retailer_rate) || 0;
        let old_d_rate = newVariantForm.rate_type === 'new' ? null : parseFloat(newVariantForm.old_distributor_rate) || null;
        let old_r_rate = newVariantForm.rate_type === 'new' ? null : parseFloat(newVariantForm.old_retailer_rate) || null;

        await api.post(`/api/products/${addingVariantTo.product_id}/variants`, {
            pack_size: newVariantForm.pack_size,
            pieces_per_box: newVariantForm.pieces_per_box ? parseInt(newVariantForm.pieces_per_box) : null,
            distributor_rate: d_rate,
            retailer_rate: r_rate,
            old_distributor_rate: old_d_rate,
            old_retailer_rate: old_r_rate,
            mrp: parseFloat(newVariantForm.mrp) || 0
        });
        showToast('Variant added successfully!', 'success');
        setAddingVariantTo(null);
        setNewVariantForm({ pack_size: '', pieces_per_box: '', distributor_rate: '', retailer_rate: '', old_distributor_rate: '', old_retailer_rate: '', mrp: '', rate_type: 'new' });
        fetchProducts();
        setExpandedProducts(prev => ({ ...prev, [addingVariantTo.product_id]: true }));
    } catch (err: any) {
        showToast(err.response?.data?.message || 'Failed to add variant.', 'error');
    } finally {
        setIsAddingVariant(false);
    }
  };


  // Extract unique categories for filter dropdown
  const categories = useMemo(() => {
    const cats = catalog.map(p => p.category_name).filter(Boolean);
    return ['All', ...Array.from(new Set(cats))];
  }, [catalog]);

  // Extract unique HSN codes
  const hsnCodes = useMemo(() => {
    const codes = catalog.map(p => p.hsn_code).filter(Boolean);
    return ['All', ...Array.from(new Set(codes))];
  }, [catalog]);

  // Filter and Pagination Logic
  const filteredCatalog = useMemo(() => {
    const results = [];
    for (const p of catalog) {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (p.category_name && p.category_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || p.category_name === selectedCategory;
      const matchesHsn = selectedHsn === 'All' || p.hsn_code === selectedHsn;

      if (!matchesSearch || !matchesCategory || !matchesHsn) continue;

      const matchingVariants = p.variants.filter((v: any) => {
          const matchesMin = minRate === '' || parseFloat(v.distributor_rate) >= parseFloat(minRate);
          const matchesMax = maxRate === '' || parseFloat(v.distributor_rate) <= parseFloat(maxRate);
          return matchesMin && matchesMax;
      });

      if (matchingVariants.length > 0) {
        // Clone the product and replace variants with only the matching ones
        results.push({ ...p, variants: matchingVariants });
      }
    }
    return results;
  }, [catalog, searchQuery, selectedCategory, selectedHsn, minRate, maxRate]);

  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredCatalog.slice(indexOfFirstItem, indexOfLastItem);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  // Reset to page 1 when searching or filtering
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedHsn, minRate, maxRate]);


  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Products Catalogue</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="secondary-btn" 
            onClick={handleDownloadTemplate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#f8fafc' }}
          >
            <Upload size={18} />
            Download Template
          </button>
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            style={{ display: 'none' }} 
          />
          <button 
            className="secondary-btn" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Upload size={18} />
            {isUploading ? 'Uploading...' : 'Bulk Upload'}
          </button>
          <Link to="/admin/products/add" className="primary-btn">
            + Add New Product
          </Link>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="data-card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading products...</div>
        ) : catalog.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            No products found. Click "Add New Product" to create your catalogue.
          </div>
        ) : (
          <div>
            {/* Filter Bar */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Row 1: Search + Category + HSN */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Search */}
                  <div style={{ position: 'relative', width: '280px' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
                      <Search size={18} />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Search products by name or category..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: '10px 16px 10px 38px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}
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
                      style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  {/* HSN Code Filter */}
                  <select
                    value={selectedHsn}
                    onChange={(e) => setSelectedHsn(e.target.value)}
                    style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  >
                    {hsnCodes.map(code => <option key={code} value={code}>{code === 'All' ? 'All HSN Codes' : `HSN: ${code}`}</option>)}
                  </select>

                  {/* Rate View Filter */}
                  <select
                    value={rateView}
                    onChange={(e) => setRateView(e.target.value as 'new' | 'old')}
                    style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  >
                    <option value="new">New Rates</option>
                    <option value="old">Old Rates</option>
                  </select>

                  {/* Price Range */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>D Rate:</span>
                    <input
                      type="number"
                      placeholder="Min ₹"
                      value={minRate}
                      onChange={e => setMinRate(e.target.value)}
                      style={{ width: '80px', padding: '10px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    />
                    <span style={{ color: '#9ca3af' }}>—</span>
                    <input
                      type="number"
                      placeholder="Max ₹"
                      value={maxRate}
                      onChange={e => setMaxRate(e.target.value)}
                      style={{ width: '80px', padding: '10px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    />
                  </div>

                  {/* Clear Filters */}
                  {(searchQuery || selectedCategory !== 'All' || selectedHsn !== 'All' || minRate || maxRate) && (
                    <button
                      onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedHsn('All'); setMinRate(''); setMaxRate(''); }}
                      style={{ padding: '6px 12px', fontSize: '13px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      ✕ Clear Filters
                    </button>
                  )}
                </div>

                <span style={{ color: 'var(--text-muted)', fontSize: '14px', whiteSpace: 'nowrap' }}>
                  Showing {filteredCatalog.length === 0 ? 0 : indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredCatalog.length)} of {filteredCatalog.length} products
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
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>HSN CODE</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PACK SIZE</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'center' }}>UOM</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>PCS/BOX</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>MRP (₹)</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>{rateView === 'old' ? 'OLD D RATE' : 'D RATE'}</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>{rateView === 'old' ? 'OLD R RATE' : 'R RATE'}</th>
                    <th style={{ padding: '12px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#64748b', fontWeight: 600, fontSize: '13px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.length > 0 ? (
                    currentItems.map((product) => {
                      const isExpanded = expandedProducts[product.product_id];
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
                            <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '14px' }}>
                              {product.hsn_code || '-'}
                            </td>
                            <td colSpan={6}></td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setAddingVariantTo(product); }}
                                style={{
                                  background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)',
                                  padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto'
                                }}
                              >
                                <Plus size={14} /> Add Variant
                              </button>
                            </td>
                          </tr>

                          {/* Nested Variant Rows */}
                          {isExpanded && product.variants.map((v: any) => (
                            <tr key={v.variant_id} style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                              <td colSpan={3} style={{ padding: '8px 12px', paddingLeft: '80px', color: '#94a3b8', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '12px', height: '12px', borderLeft: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', borderRadius: '0 0 0 4px', marginTop: '-12px' }}></div>
                                  Variant
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>{v.pack_size}</td>
                              <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>{v.uom || '-'}</td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>{v.pieces_per_box}</td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>₹{(v.mrp || 0).toFixed(2)}</td>
                              <td style={{ padding: '8px 12px', color: '#166534', fontWeight: 600, fontSize: '13px' }}>₹{(rateView === 'old' ? (v.old_distributor_rate != null ? v.old_distributor_rate : 0) : (v.distributor_rate || 0)).toFixed(2)}</td>
                              <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>₹{(rateView === 'old' ? (v.old_retailer_rate != null ? v.old_retailer_rate : 0) : (v.retailer_rate || 0)).toFixed(2)}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button 
                                    onClick={() => openEditModal({ ...v, product_name: product.name, category_name: product.category_name, hsn_code: product.hsn_code, gst_percent: product.gst_percent })}
                                    title="Edit Variant"
                                    style={{ background: '#eff6ff', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(v.variant_id)}
                                    title="Delete Variant"
                                    style={{ background: '#fef2f2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        No products match your filters.
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

      {/* Edit Modal */}
      {editingVariant && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>Edit Product</h3>
            <form onSubmit={handleUpdate}>
              <div className="form-grid">
                <div className="input-group">
                  <label>Pack Size (e.g., 5Rs (180 PCS))</label>
                  <input type="text" value={editForm.pack_size || ''} onChange={(e) => setEditForm({...editForm, pack_size: e.target.value})} required />
                </div>
                <div className="input-group">
                  <label>HSN Code</label>
                  <input type="text" value={editingVariant.hsn_code || ''} onChange={(e) => setEditingVariant({...editingVariant, hsn_code: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>UOM (e.g. Box, Bag)</label>
                  <input type="text" value={editingVariant.uom || ''} onChange={(e) => setEditingVariant({...editingVariant, uom: e.target.value})} />
                </div>
                <div className="input-group">
                  <label>Pieces Per Box (Auto-extracted if blank)</label>
                  <input type="number" min="1" value={editForm.pieces_per_box || ''} onChange={(e) => setEditForm({...editForm, pieces_per_box: e.target.value})} placeholder="e.g. 180" />
                </div>
                <div className="input-group">
                  <label>GST Percent (%)</label>
                  <input type="number" step="0.01" value={editingVariant.gst_percent ?? 0} onChange={(e) => setEditingVariant({...editingVariant, gst_percent: parseFloat(e.target.value) || 0})} />
                </div>
                
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Rate Type</label>
                  <select value={editForm.rate_type || 'new'} onChange={e => setEditForm({...editForm, rate_type: e.target.value})}>
                    <option value="new">New Rates Only</option>
                    <option value="old">Old Rates Only</option>
                    <option value="both">Both Rates</option>
                  </select>
                </div>
                
                {editForm.rate_type !== 'old' && (
                  <>
                    <div className="input-group">
                      <label>New Distributor Rate (₹)</label>
                      <input type="number" step="0.01" value={editForm.distributor_rate || ''} onChange={(e) => setEditForm({...editForm, distributor_rate: e.target.value})} required={editForm.rate_type !== 'old'} />
                    </div>
                    <div className="input-group">
                      <label>New Retailer Rate (₹)</label>
                      <input type="number" step="0.01" value={editForm.retailer_rate || ''} onChange={(e) => setEditForm({...editForm, retailer_rate: e.target.value})} required={editForm.rate_type !== 'old'} />
                    </div>
                  </>
                )}
                
                {editForm.rate_type !== 'new' && (
                  <>
                    <div className="input-group">
                      <label>Old Distributor Rate (₹)</label>
                      <input type="number" step="0.01" value={editForm.old_distributor_rate || ''} onChange={(e) => setEditForm({...editForm, old_distributor_rate: e.target.value})} required={editForm.rate_type !== 'new'} />
                    </div>
                    <div className="input-group">
                      <label>Old Retailer Rate (₹)</label>
                      <input type="number" step="0.01" value={editForm.old_retailer_rate || ''} onChange={(e) => setEditForm({...editForm, old_retailer_rate: e.target.value})} required={editForm.rate_type !== 'new'} />
                    </div>
                  </>
                )}

                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>MRP (₹)</label>
                  <input type="number" step="0.01" value={editForm.mrp || ''} onChange={(e) => setEditForm({...editForm, mrp: e.target.value})} required />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="secondary-btn" onClick={() => setEditingVariant(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Variant Modal */}
      {addingVariantTo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '8px', fontSize: '20px' }}>Add New Variant</h3>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>Adding variant to <strong>{addingVariantTo.name}</strong></p>
            <form onSubmit={handleAddVariantSubmit}>
              <div className="form-grid">
                <div className="input-group">
                  <label>Pack Size (e.g. 5Rs (180 PCS))</label>
                  <input type="text" value={newVariantForm.pack_size} onChange={(e) => setNewVariantForm({...newVariantForm, pack_size: e.target.value})} required />
                </div>
                <div className="input-group">
                  <label>Pieces Per Box (Auto-extracted if blank)</label>
                  <input type="number" min="1" value={newVariantForm.pieces_per_box} onChange={(e) => setNewVariantForm({...newVariantForm, pieces_per_box: e.target.value})} placeholder="e.g. 180" />
                </div>
                
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Rate Type</label>
                  <select value={newVariantForm.rate_type} onChange={e => setNewVariantForm({...newVariantForm, rate_type: e.target.value})}>
                    <option value="new">New Rates Only</option>
                    <option value="old">Old Rates Only</option>
                    <option value="both">Both Rates</option>
                  </select>
                </div>
                
                {newVariantForm.rate_type !== 'old' && (
                  <>
                    <div className="input-group">
                      <label>New Distributor Rate (₹)</label>
                      <input type="number" step="0.01" value={newVariantForm.distributor_rate} onChange={(e) => setNewVariantForm({...newVariantForm, distributor_rate: e.target.value})} required={newVariantForm.rate_type !== 'old'} />
                    </div>
                    <div className="input-group">
                      <label>New Retailer Rate (₹)</label>
                      <input type="number" step="0.01" value={newVariantForm.retailer_rate} onChange={(e) => setNewVariantForm({...newVariantForm, retailer_rate: e.target.value})} required={newVariantForm.rate_type !== 'old'} />
                    </div>
                  </>
                )}
                
                {newVariantForm.rate_type !== 'new' && (
                  <>
                    <div className="input-group">
                      <label>Old Distributor Rate (₹)</label>
                      <input type="number" step="0.01" value={newVariantForm.old_distributor_rate} onChange={(e) => setNewVariantForm({...newVariantForm, old_distributor_rate: e.target.value})} required={newVariantForm.rate_type !== 'new'} />
                    </div>
                    <div className="input-group">
                      <label>Old Retailer Rate (₹)</label>
                      <input type="number" step="0.01" value={newVariantForm.old_retailer_rate} onChange={(e) => setNewVariantForm({...newVariantForm, old_retailer_rate: e.target.value})} required={newVariantForm.rate_type !== 'new'} />
                    </div>
                  </>
                )}

                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>MRP (₹)</label>
                  <input type="number" step="0.01" value={newVariantForm.mrp} onChange={(e) => setNewVariantForm({...newVariantForm, mrp: e.target.value})} required />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="secondary-btn" onClick={() => setAddingVariantTo(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isAddingVariant}>
                  {isAddingVariant ? 'Adding...' : 'Add Variant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
