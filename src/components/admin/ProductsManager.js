import React from 'react';
import { Search, X, Upload, Plus, Save, Download, AlertCircle, Check, ChevronUp, ChevronDown, Trash2, FileText } from 'lucide-react';

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
  bucketImages,
  getCategoryIcon,
  handleImageCellUpload,
  setEditDescProduct, setEditDescEn, setEditDescEs, setEditDescModalOpen,
  handleMoveRow, handleDeleteRow
}) {
  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h3>Master Inventory Products</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
            Edit details in place exactly like Excel. Changes will sync live to customers once you click <strong>Save Changes</strong>.
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
          <button className="admin-btn admin-btn-primary" onClick={handleSaveChanges} disabled={saveLoading}>
            <Save size={16} />
            {saveLoading ? 'Syncing DB...' : 'Save Changes'}
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
        <div className="spreadsheet-container">
          <table className="spreadsheet-table responsive-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ minWidth: '220px' }}>Product Peptide Name</th>
                <th style={{ minWidth: '180px' }}>Category</th>
                <th style={{ width: '100px' }}>Price (USD)</th>
                <th style={{ width: '100px' }}>Price (CRC)</th>
                <th style={{ width: '110px' }}>Orig. Price (USD)</th>
                <th style={{ width: '110px' }}>Orig. Price (CRC)</th>
                <th style={{ width: '130px' }}>Sale Start</th>
                <th style={{ width: '130px' }}>Sale End</th>
                <th style={{ minWidth: '180px' }}>Stock Status</th>
                <th style={{ width: '100px' }}>Inventory Count</th>
                <th style={{ width: '100px' }}>Low Stock Alert</th>
                <th style={{ minWidth: '180px' }}>Volume/Bulk Discount Info</th>
                <th style={{ minWidth: '200px' }}>Image URL / Physical Upload</th>
                <th style={{ minWidth: '220px' }}>COA URL Link</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Info/Blog</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p => !productSearch || p.product.toLowerCase().includes(productSearch.toLowerCase()) || (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))).map((p, filteredIdx) => {
                const idx = products.findIndex(prod => prod.id === p.id);
                return (
                <tr 
                  key={p.id}
                  id={`product-row-${p.id}`}
                  className={highlightedProductId === p.id ? 'row-highlight' : ''}
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
                      {Array.from(new Set([
                        ...Object.keys(CATEGORY_TRANSLATIONS),
                        ...products.map(prod => prod.category).filter(Boolean)
                      ])).sort().map(cat => (
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
                        // Auto calculate CRC price whenever USD changes
                        const usdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                        if (usdNum > 0) {
                          const calc = Math.round(usdNum * exchangeRate);
                          handleCellChange(p.id, 'priceCrc', `₡${calc.toLocaleString('en-US')}`);
                        }
                      }}
                    >
                      {p.priceUsd}
                    </div>
                  </td>

                  {/* CRC Price */}
                  <td data-label="Price (CRC)">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => handleCellChange(p.id, 'priceCrc', e.target.innerText)}
                    >
                      {p.priceCrc}
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
                        const origUsdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                        if (origUsdNum > 0) {
                          const calc = Math.round(origUsdNum * exchangeRate);
                          handleCellChange(p.id, 'originalPriceCrc', `₡${calc.toLocaleString('en-US')}`);
                        }
                      }}
                    >
                      {p.originalPriceUsd}
                    </div>
                  </td>

                  {/* Orig CRC Price */}
                  <td data-label="Orig. Price (CRC)">
                    <div 
                      contentEditable 
                      suppressContentEditableWarning
                      className="cell-editable"
                      onBlur={(e) => handleCellChange(p.id, 'originalPriceCrc', e.target.innerText)}
                    >
                      {p.originalPriceCrc}
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
      )}
    </div>
  );
}
