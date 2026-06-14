import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { Briefcase, TrendingUp, DollarSign, Calendar, Target } from 'lucide-react';

export default function AgentDashboard({ currentUserProfile, currentUserEmail }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const response = await adminFetch('/api/agent/analytics');
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        } else {
          setError(data.error || 'Failed to fetch performance data');
        }
      } catch (err) {
        console.error(err);
        setError('Network error loading dashboard');
      }
      setLoading(false);
    };

    fetchAnalytics();
  }, []);

  const formatMoneyUI = (val, curr) => {
    const num = Number(val || 0);
    if (curr === 'USD') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `₡${Math.round(num).toLocaleString('en-US')}`;
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading your dashboard...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  if (!stats) return null;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>My Performance & Earnings</h2>
        <p style={{ color: '#94a3b8' }}>Welcome back, {currentUserProfile?.name || currentUserEmail}. Here is a snapshot of your sales performance.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {/* Base Weekly Salary Card */}
        <div style={{ background: 'linear-gradient(145deg, #0f172a 0%, #020617 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '10px' }}>
              <Briefcase size={24} color="#38bdf8" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Base Weekly Salary</p>
            </div>
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '2rem', fontWeight: '900', color: '#f8fafc' }}>
            {formatMoneyUI(stats.weeklySalary, stats.salaryCurrency)}
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Guaranteed per active week (Mon-Sun)</p>
        </div>

        {/* Commission Rate Card */}
        <div style={{ background: 'linear-gradient(145deg, #0f172a 0%, #020617 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '10px', borderRadius: '10px' }}>
              <Target size={24} color="#c084fc" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Commission Structure</p>
            </div>
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', fontWeight: '900', color: '#c084fc' }}>
            {stats.commissionRate}%
          </h3>
          {stats.commissionStructure && (
            <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic' }}>
              "{stats.commissionStructure}"
            </p>
          )}
        </div>

        {/* Current Week Orders Card */}
        <div style={{ background: 'linear-gradient(145deg, #0f172a 0%, #020617 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '10px' }}>
              <TrendingUp size={24} color="#22c55e" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Closed Orders This Week</p>
            </div>
          </div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '2rem', fontWeight: '900', color: '#22c55e' }}>
            {stats.currentWeekOrdersCount}
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
            Total Sales: {formatMoneyUI(stats.currentWeekSalesUSD, 'USD')} | {formatMoneyUI(stats.currentWeekSalesCRC, 'CRC')}
          </p>
        </div>
      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Recent Payouts</h3>
      
      {stats.recentPayouts.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
          No approved commission payouts recorded yet.
        </div>
      ) : (
        <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <table className="spreadsheet-table responsive-table">
            <thead>
              <tr>
                <th style={{ padding: '16px' }}>Period</th>
                <th style={{ padding: '16px' }}>Gross Sales</th>
                <th style={{ padding: '16px' }}>Base Salary Paid</th>
                <th style={{ padding: '16px' }}>Commissions Earned</th>
                <th style={{ padding: '16px', textAlign: 'right' }}>Total Payout</th>
                <th style={{ padding: '16px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentPayouts.map(p => {
                const formattedPeriod = `${new Date(p.start_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} - ${new Date(p.end_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`;
                const salaryCurrency = p.salary_currency || 'USD';
                return (
                  <tr key={p.id}>
                    <td data-label="Period" style={{ padding: '16px', fontWeight: 'bold' }}>{formattedPeriod}</td>
                    <td data-label="Gross Sales" style={{ padding: '16px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      USD: {formatMoneyUI(p.usd_sales, 'USD')}<br/>
                      CRC: {formatMoneyUI(p.crc_sales, 'CRC')}
                    </td>
                    <td data-label="Base Salary" style={{ padding: '16px', fontWeight: 'bold', color: '#38bdf8' }}>
                      {formatMoneyUI(p.weekly_salary_paid, salaryCurrency)}
                    </td>
                    <td data-label="Commissions Earned" style={{ padding: '16px', fontSize: '0.85rem' }}>
                      USD: <span style={{ color: '#c084fc', fontWeight: 'bold' }}>{formatMoneyUI(p.usd_commission, 'USD')}</span><br/>
                      CRC: <span style={{ color: '#c084fc', fontWeight: 'bold' }}>{formatMoneyUI(p.crc_commission, 'CRC')}</span>
                    </td>
                    <td data-label="Total Payout" style={{ padding: '16px', textAlign: 'right', fontWeight: '900', color: '#22c55e', fontSize: '1.1rem' }}>
                      {p.total_payout_usd > 0 ? formatMoneyUI(p.total_payout_usd, 'USD') : ''}
                      {p.total_payout_usd > 0 && p.total_payout_crc > 0 ? ' + ' : ''}
                      {p.total_payout_crc > 0 ? formatMoneyUI(p.total_payout_crc, 'CRC') : ''}
                      {p.total_payout_usd === 0 && p.total_payout_crc === 0 ? '$0.00' : ''}
                    </td>
                    <td data-label="Status" style={{ padding: '16px', textAlign: 'center' }}>
                      {p.status === 'Approved' ? (
                        <span className="status-badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          Paid
                        </span>
                      ) : (
                        <span className="status-badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
