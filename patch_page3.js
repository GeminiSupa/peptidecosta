const fs = require('fs');
let pageContent = fs.readFileSync('src/app/admin/page.js', 'utf8');

const reviewsLoader = `
        {activeTab === 'reviews' && (
          loadingReviews ? (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
              <div className="sync-spinner" style={{ color: '#fbbf24', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Reviews...</h3>
            </div>
          ) : (
            <div className="admin-orders-tab">
`;

pageContent = pageContent.replace(
  "{activeTab === 'reviews' && (\n          <div className=\"admin-orders-tab\">",
  reviewsLoader + "          "
);

fs.writeFileSync('src/app/admin/page.js', pageContent);
console.log("Patched 3");
