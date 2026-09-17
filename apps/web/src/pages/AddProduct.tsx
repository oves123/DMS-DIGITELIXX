import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

const AddProduct = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Base Product State
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [gstPercent, setGstPercent] = useState('0');

  // Variants State
  const [variants, setVariants] = useState<any[]>([
    { pack_size: '', uom: 'Box', pieces_per_box: '', distributor_rate: '', retailer_rate: '', mrp: '' }
  ]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/api/products/categories');
      setCategories(response.data);
    } catch (err) {
      console.error('Failed to load categories', err);
    }
  };

  const addVariantRow = () => {
    setVariants([...variants, { pack_size: '', uom: 'Box', pieces_per_box: '', distributor_rate: '', retailer_rate: '', mrp: '' }]);
  };

  const removeVariantRow = (index: number) => {
    const newVariants = [...variants];
    newVariants.splice(index, 1);
    setVariants(newVariants);
  };

  const handleVariantChange = (index: number, field: string, value: string) => {
    const newVariants = [...variants];
    (newVariants[index] as any)[field] = value;
    setVariants(newVariants);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let finalCategoryId = categoryId;

      // If user wants to create a new category
      if (categoryId === 'NEW' && newCategoryName.trim() !== '') {
        const catRes = await api.post('/api/products/categories', {
          name: newCategoryName
        });
        finalCategoryId = catRes.data.category_id;
      }

      const payload = {
        name,
        category_id: finalCategoryId === 'NEW' || !finalCategoryId ? null : parseInt(finalCategoryId),
        hsn_code: hsnCode,
        gst_percent: parseFloat(gstPercent) || 0,
        variants: variants.map(v => ({
          ...v,
          nd_rate: parseFloat(v.nd_rate) || 0,
          retailer_rate: parseFloat(v.retailer_rate) || 0,
          mrp: parseFloat(v.mrp) || 0
        }))
      };

      await api.post('/api/products', payload);
      navigate('/admin/products');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Add New Product</h2>
        <button type="button" className="secondary-btn" onClick={() => navigate('/admin/products')}>
          Cancel
        </button>
      </div>

      <div className="data-card" style={{ padding: '32px' }}>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>Base Information</h3>
          
          <div className="form-grid">
            <div className="input-group">
              <label>Product Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className="input-group">
              <label>Category</label>
              <select 
                value={categoryId} 
                onChange={e => setCategoryId(e.target.value)}
                style={{
                  background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', 
                  padding: '12px 16px', fontSize: '15px', color: 'var(--text-main)', outline: 'none'
                }}
              >
                <option value="">-- Select Category --</option>
                {categories.map(c => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
                <option value="NEW">+ Add New Category</option>
              </select>
            </div>
          </div>

          {categoryId === 'NEW' && (
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>New Category Name</label>
              <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required={categoryId === 'NEW'} />
            </div>
          )}

          <div className="form-grid">
            <div className="input-group">
              <label>HSN Code</label>
              <input type="text" value={hsnCode} onChange={e => setHsnCode(e.target.value)} />
            </div>
            <div className="input-group">
              <label>GST Percent (%)</label>
              <input type="number" step="0.01" value={gstPercent} onChange={e => setGstPercent(e.target.value)} />
            </div>
          </div>

          <hr style={{ margin: '32px 0', borderColor: 'var(--border-color)', borderStyle: 'solid' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: 'var(--text-main)' }}>Pack Sizes & Pricing</h3>
            <button type="button" className="secondary-btn" onClick={addVariantRow} style={{ padding: '6px 12px', fontSize: '13px' }}>
              + Add Size
            </button>
          </div>

          {variants.map((v, index) => (
            <div key={index} className="variant-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
                <label>Pack Size * (e.g. 50g)</label>
                <input type="text" required value={v.pack_size} onChange={e => handleVariantChange(index, 'pack_size', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: '100px' }}>
                <label>Pcs/Box</label>
                <input type="number" min="1" placeholder="Auto" value={v.pieces_per_box} onChange={e => handleVariantChange(index, 'pieces_per_box', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: '90px' }}>
                <label>UOM</label>
                <input type="text" value={v.uom} onChange={e => handleVariantChange(index, 'uom', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0, flex: 1, minWidth: '120px' }}>
                <label>Distributor Rate (₹)</label>
                <input type="number" step="0.01" required value={v.distributor_rate} onChange={e => handleVariantChange(index, 'distributor_rate', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Retailer Rate (₹)</label>
                <input type="number" step="0.01" required value={v.retailer_rate} onChange={e => handleVariantChange(index, 'retailer_rate', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>MRP (₹)</label>
                <input type="number" step="0.01" required value={v.mrp} onChange={e => handleVariantChange(index, 'mrp', e.target.value)} />
              </div>
              {variants.length > 1 && (
                <button type="button" onClick={() => removeVariantRow(index)} style={{ padding: '12px', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                  X
                </button>
              )}
            </div>
          ))}

          <div style={{ marginTop: '32px', textAlign: 'right' }}>
            <button type="submit" className="primary-btn" disabled={loading} style={{ width: '200px' }}>
              {loading ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProduct;
