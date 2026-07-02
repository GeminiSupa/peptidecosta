const fs = require('fs');
let pageContent = fs.readFileSync('src/app/admin/page.js', 'utf8');

const facebookLoader = `
        {activeTab === 'facebook' && (
          loadingFbNotifications ? (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
              <div className="sync-spinner" style={{ color: '#1877f2', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" /></svg></div>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Facebook Messages...</h3>
            </div>
          ) : (
            <div className="admin-orders-tab admin-tab-panel">
`;

pageContent = pageContent.replace(
  "{activeTab === 'facebook' && (\n          <div className=\"admin-orders-tab admin-tab-panel\">",
  facebookLoader + "          "
);
// We need to find exactly how 'facebook' is rendered
fs.writeFileSync('src/app/admin/page.js', pageContent);
console.log("Patched 2");
