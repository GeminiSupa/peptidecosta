const fs = require('fs');

let pageContent = fs.readFileSync('src/app/admin/page.js', 'utf8');

const analyticsLoader = `
            {(loadingOrders || loadingProducts || loadingAbandonedCarts) ? (
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
                <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></div>
                <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Analytics...</h3>
                <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Crunching numbers and fetching the latest data.</p>
              </div>
            ) : (
              <AnalyticsDashboard orders={orders} abandonedCarts={abandonedCarts} products={products} productViews={productViews} />
            )}
`;

pageContent = pageContent.replace(
  '<AnalyticsDashboard orders={orders} abandonedCarts={abandonedCarts} products={products} productViews={productViews} />',
  analyticsLoader
);

const cartsLoader = `
          loadingAbandonedCarts ? (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
              <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Carts...</h3>
              <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Fetching the latest abandoned carts.</p>
            </div>
          ) : (
            <CartsManager 
`;

pageContent = pageContent.replace(
  '<CartsManager ',
  cartsLoader
);

const customersLoader = `
            {loadingOrders ? (
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
                <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
                <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Customers...</h3>
                <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Fetching customer data from orders.</p>
              </div>
            ) : (
              <CustomersCRM 
`;

pageContent = pageContent.replace(
  '<CustomersCRM ',
  customersLoader
);

fs.writeFileSync('src/app/admin/page.js', pageContent);
console.log("Successfully patched page.js with loaders.");
