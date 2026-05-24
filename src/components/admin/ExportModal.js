import React from 'react';
import { Upload } from 'lucide-react';

export default function ExportModal({
  isOpen,
  onClose,
  title = 'Export Data',
  description = 'Choose a format to download the data.',
  onExportXLSX,
  onExportPDF,
  onExportCSV,
  loading = false
}) {
  if (!isOpen) return null;

  return (
    <div className="modal active" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', background: '#0e1626', color: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button className="close-modal" onClick={onClose} style={{ color: '#94a3b8', fontSize: '24px', position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer' }}>&times;</button>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
            <Upload size={24} color="#38bdf8" />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 8px 0' }}>{title}</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>{description}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {onExportXLSX && (
            <button 
              className="admin-btn"
              onClick={onExportXLSX}
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center' }}
            >
              {loading ? <div className="sync-spinner" style={{ width: '20px', height: '20px' }} /> : 'Excel Workbook (.xlsx)'}
            </button>
          )}
          {onExportPDF && (
            <button 
              className="admin-btn"
              onClick={onExportPDF}
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center' }}
            >
              {loading ? <div className="sync-spinner" style={{ width: '20px', height: '20px' }} /> : 'PDF Document (.pdf)'}
            </button>
          )}
          {onExportCSV && (
            <button 
              className="admin-btn"
              onClick={onExportCSV}
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#e2e8f0', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center' }}
            >
              {loading ? <div className="sync-spinner" style={{ width: '20px', height: '20px' }} /> : 'CSV File (.csv)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
