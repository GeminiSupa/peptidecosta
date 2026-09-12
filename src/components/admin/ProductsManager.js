import React, { useMemo, useState } from 'react';
import { Search, X, Upload, Plus, Save, Download, AlertCircle, Check, ChevronUp, ChevronDown, Trash2, FileText, Eye, EyeOff } from 'lucide-react';

const CATEGORY_TRANSLATIONS = {
  'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
  'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
  'Recovery & Healing': 'Recuperación y curación',
  'Anti-Inflammatory': 'Antiinflamatorio',
  'Performance & Hormones': 'Rendimiento y hormonas',
  'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
  'Immune System Modulation': 'Modulación del sistema inmunitario',
  'Cognitive & Mood': 'Cognitivo y estado de ánimo',
  'Sleep': 'Dormir',
  'Sexual Health': 'Salud sexual',
  'Tanning & Sexual Function': 'Bronceado y función sexual',
  'Skin & Hair': 'Piel y cabello',
  'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
};

export default function ProductsManager({
  products,
  productSearch, setProductSearch,
  isCsvOpen, setIsCsvOpen,
  csvDragActive, handleCsvDrag, handleCsvDrop, handleCsvFileSelect,
  handleAddRow, handleSaveChanges, saveLoading, saveStatus,
  setExportModalType,
  csvStatus, setCsvStatus,
  loadingProducts,
  highlightedProductId,
  handleCellChange,
  exchangeRate,
  exchangeRateUpdatedAt,
  bucketImages,
  getCategoryIcon,
  handleImageCellUpload,
  setEditDescProduct, setEditDescEn, setEditDescEs, setEditDescModalOpen,
  handleMoveRow, handleDeleteRow,
  handleToggleHidden,
  changedProductIds
}) {
  const [mobileEditProduct, setMobileEditProduct] = useState(null);
  const [mobileProductError, setMobileProductError] = useState('');
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  // Which rows have been edited since the last save. Save Changes writes the
  // whole grid regardless — this is only so the operator is told what they are
  // about to commit, which on a table this wide is not otherwise knowable.
  const changedProducts = useMemo(() => {
    if (!changedProductIds || changedProductIds.size === 0) return [];
    return products.filter((p) => changedProductIds.has(p.id));
  }, [products, changedProductIds]);
  const changedCount = changedProducts.length;

  const formatDerivedCrc = (usdPrice) => {
    const usdNum = parseFloat(String(usdPrice || '').replace(/[^0-9.]/g, '')) || 0;
    if (!usdNum) return 'Auto';
    return `₡${Math.round(usdNum * exchangeRate).toLocaleString('en-US')}`;
  };

  const exchangeUpdatedLabel = exchangeRateUpdatedAt
    ? new Date(exchangeRateUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'loading';
  const filteredProducts = useMemo(
    () => products.filter(p =>
      !productSearch ||
      p.product.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))
    ),
    [products, productSearch]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set([
      ...Object.keys(CATEGORY_TRANSLATIONS),
      ...products.map(prod => prod.category).filter(Boolean)
    ])).sort(),
    [products]
  );
  const mobileDirty = Boolean(mobileEditProduct && products.find((p) => p.id === mobileEditProduct.id && (
    p.product !== mobileEditProduct.product ||
    p.category !== mobileEditProduct.category ||
    String(p.priceUsd || '') !== String(mobileEditProduct.priceUsd || '') ||
    String(p.originalPriceUsd || '') !== String(mobileEditProduct.originalPriceUsd || '') ||
    String(p.saleStartTime || '') !== String(mobileEditProduct.saleStartTime || '') ||
    String(p.saleEndTime || '') !== String(mobileEditProduct.saleEndTime || '') ||
    String(p.status || '') !== String(mobileEditProduct.status || '') ||
    String(p.inventoryCount ?? '') !== String(mobileEditProduct.inventoryCount ?? '') ||
    String(p.lowStockThreshold ?? 5) !== String(mobileEditProduct.lowStockThreshold ?? 5) ||
    String(p.discount || '') !== String(mobileEditProduct.discount || '') ||
    String(p.imageUrl || '') !== String(mobileEditProduct.imageUrl || '') ||
    String(p.coa || '') !== String(mobileEditProduct.coa || '') ||
    Boolean(p.freeBacWater) !== Boolean(mobileEditProduct.freeBacWater) ||
    String(p.freeBacSizeMl ?? 3) !== String(mobileEditProduct.freeBacSizeMl ?? 3) ||
    String(p.freeBacVialsPerItem ?? 1) !== String(mobileEditProduct.freeBacVialsPerItem ?? 1)
  )));
  const openMobileEditor = (product) => {
    setMobileProductError('');
    setMobileEditProduct({ ...product });
  };
  const updateMobileDraft = (field, value) => {
    setMobileProductError('');
    setMobileEditProduct((current) => current ? { ...current, [field]: value } : current);
  };
  const validateMobileProduct = () => {
    const p = mobileEditProduct;
    if (!p?.product?.trim()) return 'Product name is required.';
    const price = parseFloat(String(p.priceUsd || '').replace(/[^0-9.]/g, ''));
    if (Number.isNaN(price) || price <= 0) return 'Enter a valid USD price.';
    if (p.originalPriceUsd) {
      const original = parseFloat(String(p.originalPriceUsd).replace(/[^0-9.]/g, ''));
      if (Number.isNaN(original) || original < 0) return 'Original USD price must be a valid number.';
    }
    if (p.saleStartTime && p.saleEndTime && new Date(p.saleStartTime) > new Date(p.saleEndTime)) {
      return 'Sale end must be after sale start.';
    }
    if (p.inventoryCount !== null && p.inventoryCount !== undefined && Number.isNaN(Number(p.inventoryCount))) {
      return 'Inventory must be a number.';
    }
    if (p.lowStockThreshold !== null && p.lowStockThreshold !== undefined && Number.isNaN(Number(p.lowStockThreshold))) {
      return 'Low stock alert must be a number.';
    }
    if (p.imageUrl && !/^https?:\/\//i.test(p.imageUrl)) return 'Image URL must start with http:// or https://.';
    if (p.coa && !/^https?:\/\//i.test(p.coa)) return 'COA URL must start with http:// or https://.';
    return '';
  };
  const saveMobileProduct = async () => {
    const error = validateMobileProduct();
    if (error) {
      setMobileProductError(error);
      return;
    }
    const original = products.find((p) => p.id === mobileEditProduct.id);
    if (!original) return;
    // The draft is a snapshot taken when the panel opened, and it does not own
    // the descriptions — those are edited in their own modal, which writes
    // straight to the grid through handleCellChange. Spreading the whole draft
    // would put the snapshot's stale copy back over a description that was
    // just rewritten, silently undoing it. Everything else here the panel does
    // own, so it wins.
    const { descriptionEn, descriptionEs, ...draft } = mobileEditProduct;
    const nextProducts = products.map((product) => (
      product.id === mobileEditProduct.id ? { ...product, ...draft } : product
    ));
    [
      'product',
      'category',
      'priceUsd',
      'originalPriceUsd',
      'saleStartTime',
      'saleEndTime',
      'status',
      'inventoryCount',
      'lowStockThreshold',
      'discount',
      'imageUrl',
      'coa',
      'freeBacWater',
      'freeBacSizeMl',
      'freeBacVialsPerItem',
    ].forEach((field) => {
      if (String(original[field] ?? '') !== String(mobileEditProduct[field] ?? '')) {
        handleCellChange(mobileEditProduct.id, field, mobileEditProduct[field]);
      }
    });
    setMobileEditProduct(null);
    await handleSaveChanges(nextProducts);
  };
  const mobileEditIndex = mobileEditProduct
    ? products.findIndex((p) => p.id === mobileEditProduct.id)
    : -1;
  const openMobileDescriptionEditor = () => {
    if (!mobileEditProduct) return;
    setEditDescProduct(mobileEditProduct);
    setEditDescEn(mobileEditProduct.descriptionEn || '');
    setEditDescEs(mobileEditProduct.descriptionEs || '');
    setEditDescModalOpen(true);
  };
  const uploadMobileImage = async (event) => {
    if (!mobileEditProduct) return;
    const imageUrl = await handleImageCellUpload(mobileEditProduct.id, event);
    if (imageUrl) updateMobileDraft('imageUrl', imageUrl);
  };
  const moveMobileProduct = async (direction) => {
    if (!mobileEditProduct || mobileEditIndex < 0) return;
    const newIndex = mobileEditIndex + direction;
    if (newIndex < 0 || newIndex >= products.length) return;
    const updated = [...products];
    const [moved] = updated.splice(mobileEditIndex, 1);
    updated.splice(newIndex, 0, moved);
    const withPriority = updated.map((product, index) => ({ ...product, priority: index }));
    handleMoveRow(mobileEditIndex, direction);
    await handleSaveChanges(withPriority);
  };
  const deleteMobileProduct = async () => {
    if (!mobileEditProduct) return;
    const confirmed = window.confirm(`Delete "${mobileEditProduct.product || 'this product'}" from the product database?`);
    if (!confirmed) return;
    const nextProducts = products.filter((product) => product.id !== mobileEditProduct.id);
    handleDeleteRow(mobileEditProduct.id);
    setMobileEditProduct(null);
    await handleSaveChanges(nextProducts);
  };

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h3>Master Inventory Products</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
            Edit USD prices as the source of truth. CRC is synced from the database rate: 1 USD = ₡{Math.round(exchangeRate).toLocaleString('en-US')} · refreshed {exchangeUpdatedLabel}.
          </p>
        </div>
        <div className="admin-actions-row">
          <div className="admin-search-wrapper">
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              className="admin-input"
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            {productSearch && (
              <button 
                onClick={() => setProductSearch('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button className="admin-btn" onClick={() => setIsCsvOpen(!isCsvOpen)}>
            <Upload size={16} />
            {isCsvOpen ? 'Hide CSV Importer' : 'Import CSV'}
          </button>
          <button className="admin-btn admin-btn-accent" onClick={handleAddRow}>
            <Plus size={16} />
            Add Product Row
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setSaveConfirmOpen(true)} disabled={saveLoading}>
            <Save size={16} />
            {saveLoading ? 'Syncing DB...' : 'Save Changes'}
            {changedCount > 0 && (
              <span className="pm-pending-count">{changedCount}</span>
            )}
          </button>
          {products.length > 0 && (
            <button
              className="admin-btn"
              onClick={() => setExportModalType('products')}
              style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            >
              <Download size={14} />
              Export Data
            </button>
          )}
        </div>
      </div>

      {saveStatus && (
        <div className="csv-status-banner" style={{ background: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', borderColor: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', color: saveStatus.includes('Failed') ? '#f87171' : '#4ade80' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {saveStatus.includes('Failed') ? <AlertCircle size={16} /> : <Check size={16} />}
            <span>{saveStatus}</span>
          </div>
        </div>
      )}

      {/* Collapsible Google sheet drag uploader */}
      {isCsvOpen && (
        <div 
          className={`csv-dropzone ${csvDragActive ? 'drag-active' : ''}`}
          onDragEnter={handleCsvDrag}
          onDragOver={handleCsvDrag}
          onDragLeave={handleCsvDrag}
          onDrop={handleCsvDrop}
        >
          <Upload className="csv-dropzone-icon" />
          <h4>Import Google Spreadsheet CSV</h4>
          <p>Drag and drop your exported `master_sheet.csv` here, or click to browse files from your computer.</p>
          <input 
            type="file" 
            accept=".csv" 
            style={{ display: 'none' }} 
            id="csvFileInput" 
            onChange={handleCsvFileSelect}
          />
          <button 
            className="admin-btn" 
            style={{ marginTop: '8px' }}
            onClick={() => document.getElementById('csvFileInput').click()}
          >
            Choose CSV File
          </button>
        </div>
      )}

      {csvStatus && (
        <div className="csv-status-banner" style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
          <span>{csvStatus}</span>
          <button className="admin-btn" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => setCsvStatus('')}>Dismiss</button>
        </div>
      )}

      {/* Main Spreadsheet grid */}
      {loadingProducts ? (
        <div className="loader">
          <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
          <div>Fetching master inventory table...</div>
        </div>
      ) : (
        <>
        <div className="products-mobile-list admin-mobile-only">
          {filteredProducts.map((p) => (
            <article key={p.id || p.product} className={`product-mobile-card${p.hidden ? ' is-hidden' : ''}`}>
              <button type="button" className="product-mobile-main" onClick={() => openMobileEditor(p)}>
                <div className="product-mobile-thumb">
                  {p.imageUrl && p.imageUrl.startsWith('http') ? (
                    <img src={p.imageUrl} alt="" />
                  ) : (
                    getCategoryIcon(p.category)
                  )}
                </div>
                <div className="product-mobile-copy">
                  <div className="product-mobile-name">{p.product || 'Untitled product'}</div>
                  <div className="product-mobile-category">{p.category || 'No category'}</div>
                  <div className="product-mobile-meta">
                    <span>{p.priceUsd ? `$${p.priceUsd}` : 'No price'}</span>
                    <span>{formatDerivedCrc(p.priceUsd)}</span>
                    <span>{p.status || 'In Stock'}</span>
                  </div>
                </div>
              </button>
              <div className="product-mobile-actions">
                <button type="button" className="admin-btn" onClick={() => openMobileEditor(p)}>
                  Edit
                </button>
                <button type="button" className="admin-btn" onClick={() => handleToggleHidden(p.id)}>
                  {p.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  {p.hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="spreadsheet-container">
          <table className="spreadsheet-table responsive-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ minWidth: '220px' }}>Product Peptide Name</th>
                <th style={{ minWidth: '180px' }}>Category</th>
                <th style={{ width: '100px' }}>Price (USD)</th>
                <th style={{ width: '100px' }}>CRC Auto</th>
                <th style={{ width: '110px' }}>Orig. Price (USD)</th>
                <th style={{ width: '110px' }}>Orig. CRC Auto</th>
                <th style={{ width: '130px' }}>Sale Start (CR)</th>
                <th style={{ width: '130px' }}>Sale End (CR)</th>
                <th style={{ minWidth: '180px' }}>Stock Status</th>
                <th style={{ width: '100px' }}>Inventory Count</th>
                <th style={{ width: '100px' }}>Low Stock Alert</th>
                <th style={{ minWidth: '180px' }}>Volume/Bulk Discount Info</th>
                <th style={{ minWidth: '200px' }}>Image URL / Physical Upload</th>
                <th style={{ minWidth: '220px' }}>COA URL Link</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Info/Blog</th>
                <th style={{ minWidth: '200px' }}>Free BAC Water Gift</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Catalog Visibility</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const idx = products.findIndex(prod => prod.id === p.id);
                // Clicking the row opens the full product editor — the same
                // panel the mobile card list uses, which already carries every
                // field on this row plus a way through to the description.
                // Editing a product otherwise means scrolling a fifteen-column
                // table sideways and hitting the right cell in the right row.
                //
                // Every other cell here is a live control, so the click is
                // ignored when it lands on one — otherwise picking a category
                // or correcting a price would fling a modal over the grid.
                // closest() rather than testing the target directly, because
                // the click often lands on an icon inside a button. A drag that
                // selected text is a read, not a click, and is ignored too.
                return (
                <tr
                  key={p.id}
                  id={`product-row-${p.id}`}
                  className={highlightedProductId === p.id ? 'row-highlight' : ''}
                  style={p.hidden ? { opacity: 0.5 } : undefined}
                  onClick={(e) => {
                    if (e.target.closest('input, select, textarea, button, a, label, [contenteditable="true"]')) return;
                    if (window.getSelection && String(window.getSelection()).length > 0) return;
                    openMobileEditor(p);
                  }}
                >
                  <td data-label="#" style={{ color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>{idx + 1}</td>
                  
                  {/* Name */}
                  <td data-label="Product Peptide Name">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => handleCellChange(p.id, 'product', e.target.innerText)}
                    >
                      {p.product}
                    </div>
                  </td>

                  {/* Category */}
                  <td data-label="Category">
                    <select 
                      className="cell-select"
                      value={p.category}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          const newCat = window.prompt("Enter new category (Format: English / Español):");
                          if (newCat && newCat.trim() !== "") {
                            handleCellChange(p.id, 'category', newCat.trim());
                          }
                        } else {
                          handleCellChange(p.id, 'category', e.target.value);
                        }
                      }}
                    >
                      {categoryOptions.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="__ADD_NEW__">➕ Create New Category...</option>
                    </select>
                  </td>

                  {/* USD Price */}
                  <td data-label="Price (USD)">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => {
                        const v = e.target.innerText;
                        handleCellChange(p.id, 'priceUsd', v);
                      }}
                    >
                      {p.priceUsd}
                    </div>
                  </td>

                  {/* CRC Price */}
                  <td data-label="Price (CRC)">
                    <div
                      className="cell-editable"
                      title="Auto-calculated from the USD price using the current exchange rate"
                      style={{ background: '#f8fafc', color: '#475569', cursor: 'default' }}
                    >
                      {formatDerivedCrc(p.priceUsd)}
                    </div>
                  </td>

                  {/* Orig USD Price */}
                  <td data-label="Orig. Price (USD)">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => {
                        const v = e.target.innerText;
                        handleCellChange(p.id, 'originalPriceUsd', v);
                      }}
                    >
                      {p.originalPriceUsd}
                    </div>
                  </td>

                  {/* Orig CRC Price */}
                  <td data-label="Orig. Price (CRC)">
                    <div
                      className="cell-editable"
                      title="Auto-calculated from the original USD price using the current exchange rate"
                      style={{ background: '#f8fafc', color: '#475569', cursor: 'default' }}
                    >
                      {formatDerivedCrc(p.originalPriceUsd)}
                    </div>
                  </td>

                  {/* Sale Start Time */}
                  <td data-label="Sale Start">
                    <input 
                      type="datetime-local" 
                      className="cell-input"
                      value={p.saleStartTime || ''}
                      onChange={(e) => handleCellChange(p.id, 'saleStartTime', e.target.value)}
                      style={{ background: 'transparent', color: '#fff', border: 'none', width: '100%', fontSize: '0.75rem', outline: 'none' }}
                    />
                  </td>

                  {/* Sale End Time */}
                  <td data-label="Sale End">
                    <input 
                      type="datetime-local" 
                      className="cell-input"
                      value={p.saleEndTime || ''}
                      onChange={(e) => handleCellChange(p.id, 'saleEndTime', e.target.value)}
                      style={{ background: 'transparent', color: '#fff', border: 'none', width: '100%', fontSize: '0.75rem', outline: 'none' }}
                    />
                  </td>

                  {/* Status */}
                  <td data-label="Stock Status">
                    <select 
                      className="cell-select"
                      value={p.status || 'In Stock'}
                      onChange={(e) => handleCellChange(p.id, 'status', e.target.value)}
                      style={{ 
                        color: (p.status || '').toLowerCase().includes('in stock') || (p.status || '').toLowerCase().includes('disponible') ? '#4ade80' : (p.status || '').toLowerCase().includes('coming soon') || (p.status || '').toLowerCase().includes('próximamente') ? '#facc15' : '#f87171',
                        fontWeight: 'bold'
                      }}
                    >
                      <option value="In Stock">In Stock / Disponible</option>
                      <option value="Out of Stock">Out of Stock / Agotado</option>
                      <option value="Coming Soon">Coming Soon / Próximamente</option>
                    </select>
                  </td>

                  {/* Inventory Count */}
                  <td data-label="Inventory Count">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => {
                        const val = e.target.innerText.trim();
                        const num = parseInt(val, 10);
                        handleCellChange(p.id, 'inventoryCount', isNaN(num) ? null : num);
                      }}
                    >
                      {p.inventoryCount !== null && p.inventoryCount !== undefined ? p.inventoryCount : ''}
                    </div>
                  </td>

                  {/* Low Stock Threshold */}
                  <td data-label="Low Stock Alert">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => {
                        const val = e.target.innerText.trim();
                        const num = parseInt(val, 10);
                        handleCellChange(p.id, 'lowStockThreshold', isNaN(num) ? 5 : num);
                      }}
                    >
                      {p.lowStockThreshold !== null && p.lowStockThreshold !== undefined ? p.lowStockThreshold : 5}
                    </div>
                  </td>

                  {/* Discount */}
                  <td data-label="Volume/Bulk Discount Info">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => handleCellChange(p.id, 'discount', e.target.innerText)}
                    >
                      {p.discount}
                    </div>
                  </td>

                  {/* Image cell with Dropdown & Direct Physical Upload */}
                  <td data-label="Image URL / Physical Upload">
                    <div className="admin-image-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
                      <div className="admin-image-preview" style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                        {p.imageUrl && p.imageUrl.startsWith('http') ? (
                          <img src={p.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          getCategoryIcon(p.category)
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, minWidth: '120px' }}>
                        <select
                          className="cell-select"
                          value={bucketImages.find(img => img.url === p.imageUrl)?.url || (p.imageUrl ? 'custom' : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'custom') return;
                            handleCellChange(p.id, 'imageUrl', val);
                          }}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0f172a',
                            color: '#e2e8f0',
                            fontSize: '0.7rem',
                            width: '100%',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">-- No Image / Select --</option>
                          {p.imageUrl && !bucketImages.some(img => img.url === p.imageUrl) && (
                            <option value="custom">Custom: {p.imageUrl.split('/').pop()?.substring(0, 15) || 'URL'}</option>
                          )}
                          {bucketImages.map((img) => (
                            <option key={img.name} value={img.url}>
                              {img.name.length > 20 ? img.name.substring(0, 17) + '...' : img.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <input 
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        id={`imageUpload-${p.id}`}
                        onChange={(e) => handleImageCellUpload(p.id, e)}
                      />
                      
                      <button 
                        className="admin-image-upload-btn"
                        title="Upload new image"
                        onClick={() => document.getElementById(`imageUpload-${p.id}`).click()}
                        style={{
                          width: '26px',
                          height: '26px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          flexShrink: 0
                        }}
                      >
                        <Upload size={11} />
                      </button>
                    </div>
                  </td>

                  {/* COA Link */}
                  <td data-label="COA URL Link">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      style={{ minWidth: '80px', maxWidth: '150px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                      onBlur={(e) => handleCellChange(p.id, 'coa', e.target.innerText)}
                      title={p.coa}
                    >
                      {p.coa}
                    </div>
                  </td>

                  {/* Info/Blog description edit button */}
                  <td data-label="Info/Blog" style={{ textAlign: 'center' }}>
                    <button
                      className="admin-btn"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '0 auto' }}
                      onClick={() => {
                        setEditDescProduct(p);
                        setEditDescEn(p.descriptionEn || '');
                        setEditDescEs(p.descriptionEs || '');
                        setEditDescModalOpen(true);
                      }}
                    >
                      <FileText size={12} />
                      <span>Edit Info</span>
                    </button>
                  </td>

                  {/* Free BAC water gift — per product: on/off, free vial size, and how many free vials each unit earns */}
                  <td data-label="Free BAC Water Gift">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: p.freeBacWater ? '#4ade80' : '#94a3b8', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!p.freeBacWater}
                          onChange={(e) => handleCellChange(p.id, 'freeBacWater', e.target.checked)}
                        />
                        {p.freeBacWater ? 'Gives free water' : 'No free water'}
                      </label>
                      {p.freeBacWater && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <select
                            className="cell-select"
                            value={String(p.freeBacSizeMl || 3)}
                            onChange={(e) => handleCellChange(p.id, 'freeBacSizeMl', parseInt(e.target.value, 10))}
                            style={{ width: 'auto' }}
                            title="Size of each free vial"
                          >
                            <option value="3">3 ml</option>
                            <option value="10">10 ml</option>
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={p.freeBacVialsPerItem || 1}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              handleCellChange(p.id, 'freeBacVialsPerItem', Number.isFinite(n) && n > 0 ? n : 1);
                            }}
                            style={{ width: '52px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '3px 6px', fontSize: '0.75rem', outline: 'none' }}
                            title="Free vials given per unit bought"
                          />
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>per item</span>
                        </div>
                      )}
                      <span style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.3 }}>
                        {p.freeBacWater
                          ? `Every 1 bought adds ${p.freeBacVialsPerItem || 1} free ${p.freeBacSizeMl || 3}ml vial${(p.freeBacVialsPerItem || 1) > 1 ? 's' : ''}, at no charge.`
                          : 'This product ships with no free water.'}
                      </span>
                    </div>
                  </td>

                  {/* Catalog Visibility toggle — hide/show on public catalog without deleting */}
                  <td data-label="Catalog Visibility" style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleHidden(p.id)}
                      title={p.hidden ? 'Hidden from catalog — click to show' : 'Visible in catalog — click to hide'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: p.hidden ? '1px solid rgba(248,113,113,0.35)' : '1px solid rgba(74,222,128,0.35)',
                        background: p.hidden ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.12)',
                        color: p.hidden ? '#f87171' : '#4ade80',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {p.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{p.hidden ? 'Hidden' : 'Visible'}</span>
                    </button>
                  </td>

                  {/* Actions */}
                  <td data-label="Action" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <button
                        className="admin-move-btn"
                        title="Move Up"
                        onClick={() => handleMoveRow(idx, -1)}
                        disabled={idx === 0 || productSearch !== ''}
                        style={{ opacity: (idx === 0 || productSearch !== '') ? 0.25 : 1 }}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        className="admin-move-btn"
                        title="Move Down"
                        onClick={() => handleMoveRow(idx, 1)}
                        disabled={idx === products.length - 1 || productSearch !== ''}
                        style={{ opacity: (idx === products.length - 1 || productSearch !== '') ? 0.25 : 1 }}
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button className="admin-delete-btn" onClick={() => handleDeleteRow(p.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        </>
      )}

      {mobileEditProduct && (
        <div className="product-mobile-drawer-overlay" onClick={() => setMobileEditProduct(null)}>
          <div className="product-mobile-drawer" role="dialog" aria-label="Edit product" onClick={(e) => e.stopPropagation()}>
            <div className="product-mobile-drawer-header">
              <div>
                <h3>{mobileEditProduct.product || 'Edit product'}</h3>
                <p>{mobileDirty ? 'Unsaved grid changes' : 'No changes yet'}</p>
              </div>
              <button type="button" className="product-mobile-close" onClick={() => setMobileEditProduct(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {mobileProductError && (
              <div className="product-mobile-error">
                <AlertCircle size={15} />
                {mobileProductError}
              </div>
            )}

            <div className="product-mobile-form">
              <div className="product-mobile-hint">
                Drawer edits apply to the product grid. Use the main Save Changes button to sync them to the database.
              </div>
              <label>
                <span>Name</span>
                <input value={mobileEditProduct.product || ''} onChange={(e) => updateMobileDraft('product', e.target.value)} />
              </label>
              <label>
                <span>Category</span>
                <select
                  value={mobileEditProduct.category || ''}
                  onChange={(e) => updateMobileDraft('category', e.target.value)}
                >
                  <option value="">No category</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <div className="product-mobile-field-grid">
                <label>
                  <span>USD price</span>
                  <input inputMode="decimal" value={mobileEditProduct.priceUsd || ''} onChange={(e) => updateMobileDraft('priceUsd', e.target.value)} />
                  <small>{formatDerivedCrc(mobileEditProduct.priceUsd)}</small>
                </label>
                <label>
                  <span>Original USD</span>
                  <input inputMode="decimal" value={mobileEditProduct.originalPriceUsd || ''} onChange={(e) => updateMobileDraft('originalPriceUsd', e.target.value)} />
                  <small>{formatDerivedCrc(mobileEditProduct.originalPriceUsd)}</small>
                </label>
              </div>
              <label>
                <span>Status</span>
                <select value={mobileEditProduct.status || 'In Stock'} onChange={(e) => updateMobileDraft('status', e.target.value)}>
                  <option value="In Stock">In Stock / Disponible</option>
                  <option value="Out of Stock">Out of Stock / Agotado</option>
                  <option value="Coming Soon">Coming Soon / Proximamente</option>
                </select>
              </label>
              <div className="product-mobile-field-grid">
                <label>
                  <span>Inventory</span>
                  <input inputMode="numeric" value={mobileEditProduct.inventoryCount ?? ''} onChange={(e) => updateMobileDraft('inventoryCount', e.target.value === '' ? null : parseInt(e.target.value, 10))} />
                </label>
                <label>
                  <span>Low stock alert</span>
                  <input inputMode="numeric" value={mobileEditProduct.lowStockThreshold ?? 5} onChange={(e) => updateMobileDraft('lowStockThreshold', parseInt(e.target.value, 10) || 5)} />
                </label>
              </div>
              <div className="product-mobile-field-grid">
                <label>
                  <span>Sale start</span>
                  <input type="datetime-local" value={mobileEditProduct.saleStartTime || ''} onChange={(e) => updateMobileDraft('saleStartTime', e.target.value)} />
                </label>
                <label>
                  <span>Sale end</span>
                  <input type="datetime-local" value={mobileEditProduct.saleEndTime || ''} onChange={(e) => updateMobileDraft('saleEndTime', e.target.value)} />
                </label>
              </div>
              <label>
                <span>Bulk discount info</span>
                <textarea rows="3" value={mobileEditProduct.discount || ''} onChange={(e) => updateMobileDraft('discount', e.target.value)} />
              </label>
              <label>
                <span>Free BAC water gift</span>
                <select
                  value={mobileEditProduct.freeBacWater ? 'on' : 'off'}
                  onChange={(e) => updateMobileDraft('freeBacWater', e.target.value === 'on')}
                >
                  <option value="on">On — gives free water</option>
                  <option value="off">Off — no free water</option>
                </select>
              </label>
              {mobileEditProduct.freeBacWater && (
                <div className="product-mobile-field-grid">
                  <label>
                    <span>Free vial size</span>
                    <select
                      value={String(mobileEditProduct.freeBacSizeMl || 3)}
                      onChange={(e) => updateMobileDraft('freeBacSizeMl', parseInt(e.target.value, 10))}
                    >
                      <option value="3">3 ml</option>
                      <option value="10">10 ml</option>
                    </select>
                  </label>
                  <label>
                    <span>Free vials per item</span>
                    <input
                      inputMode="numeric"
                      value={mobileEditProduct.freeBacVialsPerItem || 1}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        updateMobileDraft('freeBacVialsPerItem', Number.isFinite(n) && n > 0 ? n : 1);
                      }}
                    />
                  </label>
                </div>
              )}
              <label>
                <span>Image</span>
                <select
                  value={bucketImages.find(img => img.url === mobileEditProduct.imageUrl)?.url || (mobileEditProduct.imageUrl ? 'custom' : '')}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') updateMobileDraft('imageUrl', e.target.value);
                  }}
                >
                  <option value="">No image</option>
                  {mobileEditProduct.imageUrl && !bucketImages.some(img => img.url === mobileEditProduct.imageUrl) && (
                    <option value="custom">Custom URL</option>
                  )}
                  {bucketImages.map((img) => (
                    <option key={img.name} value={img.url}>{img.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Custom image URL</span>
                <input value={mobileEditProduct.imageUrl || ''} onChange={(e) => updateMobileDraft('imageUrl', e.target.value)} />
              </label>
              <label>
                <span>COA URL</span>
                <input value={mobileEditProduct.coa || ''} onChange={(e) => updateMobileDraft('coa', e.target.value)} />
              </label>
              <div className="product-mobile-secondary-actions">
                <button type="button" className="admin-btn" onClick={openMobileDescriptionEditor}>
                  <FileText size={14} />
                  Info/Blog
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => document.getElementById(`mobile-imageUpload-${mobileEditProduct.id}`)?.click()}
                >
                  <Upload size={14} />
                  Upload image
                </button>
                <input
                  type="file"
                  accept="image/*"
                  id={`mobile-imageUpload-${mobileEditProduct.id}`}
                  style={{ display: 'none' }}
                  onChange={uploadMobileImage}
                />
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => moveMobileProduct(-1)}
                  disabled={saveLoading || mobileEditIndex <= 0 || productSearch !== ''}
                >
                  <ChevronUp size={14} />
                  Move up
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => moveMobileProduct(1)}
                  disabled={saveLoading || mobileEditIndex < 0 || mobileEditIndex >= products.length - 1 || productSearch !== ''}
                >
                  <ChevronDown size={14} />
                  Move down
                </button>
                <button type="button" className="admin-btn product-mobile-danger" onClick={deleteMobileProduct} disabled={saveLoading}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>

            <div className="product-mobile-drawer-actions">
              <button type="button" className="admin-btn" onClick={() => setMobileEditProduct(null)}>Discard</button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={saveMobileProduct} disabled={!mobileDirty || saveLoading}>
                <Save size={15} />
                {saveLoading ? 'Saving...' : 'Save product'}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveConfirmOpen && (
        <div className="pm-confirm-overlay" onClick={() => setSaveConfirmOpen(false)}>
          <div className="pm-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pm-confirm-title">
            <h3 id="pm-confirm-title">Save to the live catalog?</h3>

            {changedCount > 0 ? (
              <>
                <p>
                  {changedCount === 1
                    ? 'One product has been edited since the last save:'
                    : `${changedCount} products have been edited since the last save:`}
                </p>
                <ul className="pm-confirm-list">
                  {changedProducts.slice(0, 12).map((p) => (
                    <li key={p.id}>{p.product || '(unnamed row)'}</li>
                  ))}
                  {changedCount > 12 && <li className="pm-confirm-more">and {changedCount - 12} more</li>}
                </ul>
              </>
            ) : (
              <p>
                No edits are pending. Saving now rewrites every row with what is
                currently on screen, which is harmless but does nothing.
              </p>
            )}

            <p className="pm-confirm-note">
              This writes to the database immediately and customers see it on the
              storefront straight away. There is no undo.
            </p>

            <div className="pm-confirm-actions">
              <button type="button" className="admin-btn" onClick={() => setSaveConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={saveLoading}
                onClick={() => { setSaveConfirmOpen(false); handleSaveChanges(); }}
              >
                <Save size={15} />
                {changedCount > 0 ? `Save ${changedCount} change${changedCount === 1 ? '' : 's'}` : 'Save anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pm-pending-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          margin-left: 6px;
          padding: 0 5px;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.25);
          font-size: 0.68rem;
          font-weight: 800;
        }
        .pm-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(2, 6, 23, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow-y: auto;
        }
        .pm-confirm {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 24px;
          width: 100%;
          max-width: 460px;
          margin: auto;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
          color: #e2e8f0;
        }
        .pm-confirm h3 {
          margin: 0 0 12px;
          font-size: 1.05rem;
          font-weight: 800;
        }
        .pm-confirm p {
          margin: 0 0 12px;
          font-size: 0.85rem;
          line-height: 1.5;
          color: #cbd5e1;
        }
        .pm-confirm-list {
          margin: 0 0 14px;
          padding-left: 20px;
          max-height: 190px;
          overflow-y: auto;
          font-size: 0.82rem;
          line-height: 1.6;
          color: #e2e8f0;
        }
        .pm-confirm-more { color: #94a3b8; list-style: none; margin-left: -20px; }
        .pm-confirm-note {
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(234, 179, 8, 0.1);
          border: 1px solid rgba(234, 179, 8, 0.25);
          color: #fbbf24 !important;
          font-size: 0.78rem !important;
        }
        .pm-confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
