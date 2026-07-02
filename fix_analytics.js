const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AnalyticsDashboard.js', 'utf8');

code = code.replace(/filteredOrders\.forEach/g, "orders.forEach");
code = code.replace(/filteredProductViews\.length/g, "productViews.length");
code = code.replace(/filteredCarts\.length/g, "carts.length");
code = code.replace(/filteredOrders\.length/g, "orders.length");

fs.writeFileSync('src/components/admin/AnalyticsDashboard.js', code);
console.log("Fixed AnalyticsDashboard variables.");
