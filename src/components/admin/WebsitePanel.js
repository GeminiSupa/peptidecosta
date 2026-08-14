"use client";

import { ExternalLink, Globe, FileText, Languages, ImageIcon, AlertTriangle } from 'lucide-react';

/**
 * Marketing Website panel.
 *
 * The marketing site at peptidescostarica.net is being rebuilt in a separate
 * repo (peptidecostarica-website). This panel is the seat that rebuild occupies
 * inside the dashboard.
 *
 * Deliberately READ-ONLY and self-contained:
 *  - it reads nothing from Supabase and writes nothing anywhere,
 *  - it imports no existing admin module, so it cannot affect one.
 *
 * The figures below are the rebuild's harvested inventory, kept here as static
 * reference rather than fetched, because the website is a separate deployment
 * with no API for the dashboard to call yet. When the site_cms_* tables land,
 * the editor replaces this panel's body and the nav entry and permission key
 * stay exactly as they are.
 */

const SITE_URL = 'https://peptidescostarica.net';
const CATALOG_URL = 'https://catalog.peptidescostarica.net';

const INVENTORY = [
  { label: 'Core pages', en: 15, note: 'home, about, contact, FAQ, shop index' },
  { label: 'Legal', en: 4, note: 'privacy, shipping, returns, sitemap' },
  { label: 'Categories', en: 14, note: 'marketing category pages' },
  { label: 'Product landers', en: 40, note: '/<name>-costa-rica/' },
  { label: 'Guides', en: 56, note: 'long-form editorial' },
  { label: 'City pages', en: 93, note: '7 provinces + 86 towns' },
  { label: 'Blog posts', en: 12, note: '/blog/<slug>/' },
  { label: 'Shop products', en: 67, note: '/product/<slug>/' },
  { label: 'Shop categories', en: 15, note: '/product-category/<slug>/' },
];

const card = {
  background: '#0e1626',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.05)',
};

const kicker = {
  fontSize: '0.7rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  marginBottom: '10px',
};

function Stat({ icon, value, label }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(56,189,248,0.1)',
          color: '#38bdf8',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{label}</div>
      </div>
    </div>
  );
}

export default function WebsitePanel() {
  const totalEn = INVENTORY.reduce((sum, row) => sum + row.en, 0);

  return (
    <div className="admin-orders-tab">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>
          <Globe
            size={20}
            style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom', color: '#38bdf8' }}
          />
          Marketing Website
        </h2>
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn"
          style={{
            padding: '6px 14px',
            fontSize: '0.85rem',
            background: 'rgba(56,189,248,0.1)',
            border: '1px solid rgba(56,189,248,0.2)',
            color: '#38bdf8',
            borderRadius: '8px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            textDecoration: 'none',
          }}
        >
          Open live site <ExternalLink size={14} />
        </a>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Stat icon={<FileText size={20} />} value={totalEn} label="English pages rebuilt" />
        <Stat icon={<Languages size={20} />} value={totalEn - 1} label="Spanish pages" />
        <Stat icon={<ImageIcon size={20} />} value="143" label="Images mirrored" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        <div style={card}>
          <div style={kicker}>Page inventory</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <tbody>
              {INVENTORY.map((row) => (
                <tr key={row.label} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px 0', color: '#f8fafc', fontWeight: 600 }}>{row.label}</td>
                  <td style={{ padding: '8px 0', color: '#38bdf8', fontWeight: 800, textAlign: 'right', width: 50 }}>
                    {row.en}
                  </td>
                  <td style={{ padding: '8px 0 8px 14px', color: '#64748b' }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={card}>
            <div style={kicker}>The two sites</div>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.6 }}>
              The marketing site shows products and sends every buy button to the
              catalog. The catalog owns the cart, checkout and orders — this
              dashboard.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                ['Marketing site', SITE_URL],
                ['Catalog (this system)', CATALOG_URL],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#172237',
                    color: '#f8fafc',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {label}
                  <ExternalLink size={14} color="#38bdf8" />
                </a>
              ))}
            </div>
          </div>

          <div
            style={{
              ...card,
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <div style={{ ...kicker, color: '#f59e0b' }}>
              <AlertTriangle size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              Not editable yet
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              Nothing on this screen writes anywhere. Editing the marketing
              site&apos;s text, images and section order from here needs the
              <code style={{ color: '#f59e0b', margin: '0 4px' }}>site_cms_*</code>
              tables, which have not been created. That migration will be handed
              over as SQL for you to review and run — it does not touch any table
              this dashboard already uses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
