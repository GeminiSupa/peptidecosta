const fs = require('fs');
let code = fs.readFileSync('src/components/admin/CartsManager.js', 'utf8');

const importReplacement = `import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, Trash2, Upload, Brain, Sparkles, AlertCircle, 
  Clock, Mail, MessageCircle, ArrowRight, Package, CreditCard, Eye, Search, ArrowDownUp
} from 'lucide-react';`;

code = code.replace(/import React, { useState } from 'react';[\s\S]*?} from 'lucide-react';/, importReplacement);

const sortStateInjection = `
  // Sorting & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('date'); // 'date', 'value'
  const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'

  const filteredAndSortedCarts = useMemo(() => {
    let result = [...(abandonedCarts || [])];
    
    // Filter
    if (searchTerm) {
      const lowerQ = searchTerm.toLowerCase();
      result = result.filter(c => 
        (c.user_email || c.customer_email || '').toLowerCase().includes(lowerQ) ||
        (c.user_phone || c.customer_phone || '').includes(searchTerm)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'value') {
        const totalA = calculateCartTotal(a.cart_data);
        const totalB = calculateCartTotal(b.cart_data);
        comparison = totalA - totalB;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [abandonedCarts, searchTerm, sortField, sortDir]);

`;

code = code.replace('  // Visual Urgency Calculation', sortStateInjection + '  // Visual Urgency Calculation');

const uiInjection = `
      {/* Search and Sort Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 250px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input 
            type="text" 
            placeholder="Search email or phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 10px 10px 36px', borderRadius: '8px', fontSize: '0.9rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowDownUp size={14} color="#94a3b8" />
          <select 
            value={sortField} 
            onChange={(e) => setSortField(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="date" style={{background: '#0f172a'}}>Sort by Date</option>
            <option value="value" style={{background: '#0f172a'}}>Sort by Value</option>
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

      {/* CARTS TABLE */}
`;

code = code.replace(/\{\/\* CARTS GRID - MOBILE FIRST CARDS \*\/\}/, uiInjection);

// Replace `(abandonedCarts || []).length` with `filteredAndSortedCarts.length` for empty state
code = code.replace(/\{\!\(abandonedCarts \|\| \[\]\)\.length \? \(/g, '{!filteredAndSortedCarts.length ? (');

// In checkbox select all logic:
code = code.replace(/checked=\{\(abandonedCarts \|\| \[\]\)\.length > 0 && selectedCarts && selectedCarts\.length === \(abandonedCarts \|\| \[\]\)\.length\}/g, 
  'checked={filteredAndSortedCarts.length > 0 && selectedCarts && selectedCarts.length === filteredAndSortedCarts.length}');

// Replace `.map(` logic
code = code.replace(/\{\(abandonedCarts \|\| \[\]\)\.map\(\(cart, index\) => \{/g, '{filteredAndSortedCarts.map((cart, index) => {');

// Fix the shiftKey selection logic
code = code.replace(/const idsInRange = abandonedCarts\.slice\(start, end \+ 1\)\.map\(c => c\.session_id\);/g, 
  'const idsInRange = filteredAndSortedCarts.slice(start, end + 1).map(c => c.session_id);');

fs.writeFileSync('src/components/admin/CartsManager.js', code);
console.log('Patched CartsManager');
