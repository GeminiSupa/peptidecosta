'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function EntryDisclaimer() {
  const [accepted, setAccepted] = useState(true); // Default to true to prevent hydration flash
  const pathname = usePathname() || '';

  // Skip rendering on admin routes
  const isAdminRoute = pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminRoute) return;
    const hasAccepted = localStorage.getItem('compliance_accepted') === 'true';
    if (!hasAccepted) {
      setAccepted(false);
      document.body.style.overflow = 'hidden';
    }
  }, [isAdminRoute]);

  if (isAdminRoute || accepted) {
    return null;
  }

  const handleAgree = () => {
    localStorage.setItem('compliance_accepted', 'true');
    setAccepted(true);
    document.body.style.overflow = '';
  };

  const handleDisagree = () => {
    // Redirect away from the site
    window.location.href = 'https://www.google.com';
  };

  return (
    <div className="entry-disclaimer-overlay" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="entry-disclaimer-modal">
        <h2 id="disclaimer-title" className="entry-disclaimer-title">Research Use Only | 21+ to Enter</h2>
        
        <p className="entry-disclaimer-text">
          By selecting <strong>"Yes, I Agree,"</strong> you confirm that you are at least 21 years old and acknowledge the following:
        </p>
        
        <ul className="entry-disclaimer-list">
          <li>Products are supplied strictly for laboratory research and are not intended for human or animal consumption, treatment, or personal use.</li>
          <li>You understand that research materials require appropriate knowledge, facilities, and handling precautions.</li>
          <li>You agree to follow applicable laws and the product-specific handling and safety information.</li>
          <li>Peptides Costa Rica reserves the right to decline or cancel orders where human or animal use is suspected.</li>
        </ul>

        <div className="entry-disclaimer-actions">
          <button type="button" className="entry-btn-disagree" onClick={handleDisagree}>
            No, I Disagree
          </button>
          <button type="button" className="entry-btn-agree" onClick={handleAgree}>
            Yes, I Agree
          </button>
        </div>
      </div>

      <style>{`
        .entry-disclaimer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 2147483647; /* Maximum possible z-index to stay above everything */
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .entry-disclaimer-modal {
          background-color: #ffffff;
          border-radius: 12px;
          max-width: 600px;
          width: 100%;
          padding: 36px 32px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          border: 2px solid #e2e8f0;
          animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .entry-disclaimer-title {
          margin: 0 0 20px 0;
          font-size: 1.5rem;
          font-weight: 800;
          color: #b91c1c;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: var(--font-montserrat), sans-serif;
        }

        .entry-disclaimer-text {
          font-size: 1rem;
          color: #334155;
          margin-bottom: 16px;
          line-height: 1.5;
          font-family: var(--font-inter), sans-serif;
        }

        .entry-disclaimer-list {
          margin: 0 0 28px 0;
          padding-left: 24px;
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.6;
          font-family: var(--font-inter), sans-serif;
        }

        .entry-disclaimer-list li {
          margin-bottom: 10px;
        }

        .entry-disclaimer-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
        }

        .entry-btn-agree, .entry-btn-disagree {
          padding: 14px 24px;
          font-size: 1rem;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          flex: 1;
          max-width: 200px;
          font-family: var(--font-montserrat), sans-serif;
        }

        .entry-btn-agree {
          background-color: #16a34a;
          color: white;
          box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);
        }

        .entry-btn-agree:hover {
          background-color: #15803d;
          transform: translateY(-2px);
          box-shadow: 0 6px 8px -1px rgba(22, 163, 74, 0.3);
        }

        .entry-btn-disagree {
          background-color: #f1f5f9;
          color: #64748b;
          border: 1px solid #cbd5e1;
        }

        .entry-btn-disagree:hover {
          background-color: #e2e8f0;
          color: #475569;
        }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 480px) {
          .entry-disclaimer-modal {
            padding: 24px 20px;
          }
          
          .entry-disclaimer-title {
            font-size: 1.25rem;
          }
          
          .entry-disclaimer-actions {
            flex-direction: column-reverse;
          }
          
          .entry-btn-agree, .entry-btn-disagree {
            max-width: 100%;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
