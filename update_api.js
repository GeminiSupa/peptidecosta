const fs = require('fs');

const path = 'src/app/api/agent/analytics/route.js';
let content = fs.readFileSync(path, 'utf8');

// Add startOfMonthCR
content = content.replace(
  'function startOfWeekCR(date = nowCR()) {',
  `function startOfMonthCR(date = nowCR()) {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeekCR(date = nowCR()) {`
);

// Update query to use monthStartUtc
content = content.replace(
  'const weekStartUtc = crToUtc(startOfWeekCR()).toISOString();',
  `const monthStartUtc = crToUtc(startOfMonthCR()).toISOString();
    const weekStartUtc = crToUtc(startOfWeekCR()).toISOString();`
);

content = content.replace(
  `.gte('created_at', weekStartUtc)`,
  `.gte('created_at', monthStartUtc)`
);

// We need to calculate monthSales, weekSales, todaySales
content = content.replace(
  /const agentOrders = \(orders \|\| \[\]\)\.filter\(\(o\) => orderBelongsToAgent\(o, profile\)\);\n    const todayOrders = agentOrders\.filter\(\(o\) => o\.created_at >= todayStartUtc\);\n    const pendingOrders = agentOrders\.filter\(\(o\) => \(o\.status \|\| 'Pending'\) === 'Pending'\);\n\n    const weekSales = sumAgentOrders\(agentOrders\);\n    const todaySales = sumAgentOrders\(todayOrders\);/g,
  `const agentOrders = (orders || []).filter((o) => orderBelongsToAgent(o, profile));
    const todayOrders = agentOrders.filter((o) => o.created_at >= todayStartUtc);
    const weekOrders = agentOrders.filter((o) => o.created_at >= weekStartUtc);
    const pendingOrders = agentOrders.filter((o) => (o.status || 'Pending') === 'Pending');

    const monthSales = sumAgentOrders(agentOrders);
    const weekSales = sumAgentOrders(weekOrders);
    const todaySales = sumAgentOrders(todayOrders);`
);

// Update recentAll query to get more, and maybe by agent specifically if possible, but orderBelongsToAgent requires in-memory. So just get 500 recent orders.
content = content.replace(
  `.limit(100);`,
  `.limit(500);`
);

content = content.replace(
  `.slice(0, 8);`,
  `.slice(0, 50);`
);

content = content.replace(
  /currentWeekOrdersCount: weekSales\.count,/,
  `currentMonthOrdersCount: monthSales.count,
        currentMonthSalesUSD: monthSales.usd,
        currentMonthSalesCRC: monthSales.crc,
        currentWeekOrdersCount: weekSales.count,`
);

fs.writeFileSync(path, content, 'utf8');
