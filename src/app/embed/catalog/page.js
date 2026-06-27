"use client";

import CatalogClient from "@/app/catalog/CatalogClient";
import { useEffect } from "react";

export default function EmbedCatalog() {
  useEffect(() => {
    // Inject CSS to hide header, sticky sections, and footer
    // This allows the catalog to be embedded seamlessly into another site (like WordPress)
    const style = document.createElement('style');
    style.innerHTML = `
      .main-header { display: none !important; }
      .header-sticky-section { top: 0 !important; }
      .footer { display: none !important; }
      .customer-transformation-banner { display: none !important; }
      body { background: transparent !important; }
      .app-wrapper { padding-top: 0 !important; }
    `;
    document.head.appendChild(style);
    
    // Auto-resize message sender to parent window
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (window.parent) {
          window.parent.postMessage({
            type: 'resize',
            height: entry.contentRect.height + 50 // small buffer
          }, '*');
        }
      }
    });
    
    resizeObserver.observe(document.body);
    
    return () => {
      document.head.removeChild(style);
      resizeObserver.disconnect();
    };
  }, []);

  // Render the exact same catalog component, just with the CSS overrides active
  return <CatalogClient />;
}
