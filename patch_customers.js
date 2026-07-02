const fs = require('fs');
let code = fs.readFileSync('src/components/admin/CustomersCRM.js', 'utf8');

const importReplacement = `import React, { useState, useMemo } from 'react';
import { 
  Users, Mail, MessageCircle, Download, ExternalLink, Activity, DollarSign, Package, Calendar, AlertCircle, ArrowDownUp
} from 'lucide-react';`;

code = code.replace(/import React, { useState, useMemo } from 'react';[\s\S]*?} from 'lucide-react';/, importReplacement);

const sortStateInjection = `  const [generatingPitchId, setGeneratingPitchId] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  
  // Sorting State
  const [sortField, setSortField] = useState('date'); // 'date', 'ltv', 'orders'
  const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'
`;

code = code.replace(/  const \[filterTab, setFilterTab\] = useState\('all'\);/, sortStateInjection);

const sortLogicInjection = `
  // Filter based on search and selected tab
  const filteredCustomers = useMemo(() => {
    let result = customers.filter(c => {
      // Search term filter
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.phone.includes(searchTerm);
      if (!matchesSearch) return false;
      
      // Tab filter
      if (filterTab === 'customers') return !c.isLead;
      if (filterTab === 'leads') return c.isLead;
      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        const timeA = new Date(a.lastActive).getTime();
        const timeB = new Date(b.lastActive).getTime();
        comparison = timeA - timeB;
      } else if (sortField === 'ltv') {
        comparison = (a.totalSpentUsd || 0) - (b.totalSpentUsd || 0);
      } else if (sortField === 'orders') {
        comparison = (a.orderCount || 0) - (b.orderCount || 0);
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [customers, searchTerm, filterTab, sortField, sortDir]);
`;

code = code.replace(/  \/\/ Filter based on search and selected tab[\s\S]*?\}, \[customers, searchTerm, filterTab\]\);/, sortLogicInjection);

const uiInjection = `
      {/* Tab Filter Row */}
      <div className="crm-tabs-row" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
          <button 
            className={\`crm-tab \${filterTab === 'all' ? 'active' : ''}\`}
            onClick={() => { setFilterTab('all'); setCurrentPage(1); }}
          >
            All Contacts
            <span className="crm-tab-badge">{customers.length}</span>
          </button>
          <button 
            className={\`crm-tab \${filterTab === 'customers' ? 'active' : ''}\`}
            onClick={() => { setFilterTab('customers'); setCurrentPage(1); }}
          >
            Customers
            <span className="crm-tab-badge">{customers.filter(c => !c.isLead).length}</span>
          </button>
          <button 
            className={\`crm-tab \${filterTab === 'leads' ? 'active' : ''}\`}
            onClick={() => { setFilterTab('leads'); setCurrentPage(1); }}
          >
            Cart Leads
            <span className="crm-tab-badge">{customers.filter(c => c.isLead).length}</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '4px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowDownUp size={14} color="#94a3b8" />
          <select 
            value={sortField} 
            onChange={(e) => setSortField(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="date" style={{background: '#0f172a'}}>Sort by Date</option>
            <option value="ltv" style={{background: '#0f172a'}}>Sort by Value</option>
            <option value="orders" style={{background: '#0f172a'}}>Sort by Orders</option>
          </select>
          <select 
            value={sortDir} 
            onChange={(e) => setSortDir(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="desc" style={{background: '#0f172a'}}>Desc</option>
            <option value="asc" style={{background: '#0f172a'}}>Asc</option>
          </select>
        </div>
      </div>
`;

code = code.replace(/      \{\/\* Tab Filter Row \*\/\}[\s\S]*?<\/div>/, uiInjection);

fs.writeFileSync('src/components/admin/CustomersCRM.js', code);
console.log('Patched CustomersCRM');
