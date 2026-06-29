const fs = require('fs');

const path = 'src/components/admin/AgentDashboard.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '<h3 className="dashboard-section-title">My recent orders</h3>',
  '<h3 className="dashboard-section-title">My recent orders ({stats.recentOrders.length})</h3>'
);

content = content.replace(
  '<div className="dashboard-mini-list">',
  '<div className="dashboard-mini-list" style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "8px" }}>'
);

content = content.replace(
  '<div className="dashboard-kpi-grid">',
  `<div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {stats.currentMonthSalesUSD > 0
                ? formatMoney(stats.currentMonthSalesUSD, 'USD')
                : formatMoney(stats.currentMonthSalesCRC, 'CRC')}
            </div>
            <div className="dashboard-kpi-label">My sales this month</div>
            <div className="dashboard-mini-sub">{stats.currentMonthOrdersCount} completed</div>
          </div>
        </div>`
);

fs.writeFileSync(path, content, 'utf8');
