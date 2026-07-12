"use client";
import React from 'react';

const CHUNK_RELOAD_KEY = 'peptides_chunk_reload_attempted_v1';
const CHUNK_RELOAD_TTL_MS = 5 * 60 * 1000;

function isChunkLoadError(error) {
  const message = `${error?.name || ''} ${error?.message || ''} ${String(error || '')}`;
  return /ChunkLoadError|Loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(message);
}

function shouldReloadForChunkError() {
  if (typeof window === 'undefined') return false;
  try {
    const key = `${CHUNK_RELOAD_KEY}:${window.location.pathname}`;
    const lastAttempt = Number(window.sessionStorage.getItem(key) || 0);
    const now = Date.now();
    if (lastAttempt && now - lastAttempt < CHUNK_RELOAD_TTL_MS) return false;
    window.sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });

    if (isChunkLoadError(error) && shouldReloadForChunkError()) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#e2e8f0',
          border: '1px solid rgba(248, 113, 113, 0.25)',
          borderRadius: '12px',
          margin: '20px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.24)'
        }}>
          <h2 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: '1rem' }}>
            {this.state.isChunkError ? 'Admin module refreshed' : 'Something went wrong in this component.'}
          </h2>
          <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {this.state.isChunkError
              ? 'This usually happens right after a new deployment when the browser still has an older admin file cached. Reloading the page will fetch the latest version.'
              : 'The rest of the admin panel is still available. You can reload this page or open the error details below.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#f97316',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 13px',
              fontWeight: 800,
              cursor: 'pointer',
              marginBottom: '12px'
            }}
          >
            Reload admin
          </button>
          <details style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: '0.78rem' }}>
            <summary>Click for error details</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
