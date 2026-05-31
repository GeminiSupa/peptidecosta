/**
 * Robust, exception-proof wrapper for localStorage.
 * Automatically falls back to an in-memory store if localStorage is blocked
 * or throws a SecurityError/DOMException (e.g., inside Safari Private Browsing or restricted WebViews).
 */

const memoryStore = {};

export const safeLocalStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    try {
      // Direct storage retrieval
      const val = window.localStorage.getItem(key);
      return val !== undefined ? val : null;
    } catch (e) {
      // In-memory fallback
      return key in memoryStore ? memoryStore[key] : null;
    }
  },

  setItem: (key, val) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, String(val));
    } catch (e) {
      // In-memory fallback
      memoryStore[key] = String(val);
    }
  },

  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // In-memory fallback
      delete memoryStore[key];
    }
  },

  clear: () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.clear();
    } catch (e) {
      // In-memory fallback
      for (const k in memoryStore) {
        if (Object.prototype.hasOwnProperty.call(memoryStore, k)) {
          delete memoryStore[k];
        }
      }
    }
  }
};

const sessionMemoryStore = {};

export const safeSessionStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    try {
      const val = window.sessionStorage.getItem(key);
      return val !== undefined ? val : null;
    } catch (e) {
      return key in sessionMemoryStore ? sessionMemoryStore[key] : null;
    }
  },

  setItem: (key, val) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, String(val));
    } catch (e) {
      sessionMemoryStore[key] = String(val);
    }
  },

  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(key);
    } catch (e) {
      delete sessionMemoryStore[key];
    }
  },

  clear: () => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.clear();
    } catch (e) {
      for (const k in sessionMemoryStore) {
        if (Object.prototype.hasOwnProperty.call(sessionMemoryStore, k)) {
          delete sessionMemoryStore[k];
        }
      }
    }
  }
};

