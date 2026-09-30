'use client';

import { useCallback, useEffect, useState } from 'react';

import { adminFetch } from '@/lib/adminApi';
import { accountKindLabel } from '@/lib/accountHome.mjs';
import { formatCrDate } from '@/lib/crTime.mjs';

export default function CustomerAccountsPanel() {
  const [accounts, setAccounts] = useState([]);
  const [questionsReady, setQuestionsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/crm/customer-accounts');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load accounts');
      setAccounts(data.accounts || []);
      setQuestionsReady(data.questionsReady !== false);
    } catch (loadError) {
      setError(loadError.message || 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeAccount = async (account) => {
    const name = account.display_name || account.email;
    if (!window.confirm(`Delete the login for ${name}? Their orders stay. The profile and saved addresses are removed, and they must sign in again as a new account.`)) {
      return;
    }
    setBusyId(account.user_id);
    setError('');
    try {
      const response = await adminFetch('/api/admin/crm/customer-accounts', {
        method: 'DELETE',
        body: JSON.stringify({ userId: account.user_id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete the account');
      setAccounts((current) => current.filter((row) => row.user_id !== account.user_id));
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the account');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div style={{ margin: '0 0 18px', padding: 16, border: '1px solid #1e293b', borderRadius: 12, background: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Customer accounts ({accounts.length})</h3>
        <button type="button" onClick={load} style={{ background: 'none', border: 0, color: '#38bdf8', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>
      <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '0.82rem' }}>
        People who can sign in. Delete account removes the login only. Orders stay. The trash can on a customer row still sends their orders to the Bin, and also removes the login.
      </p>
      {!questionsReady ? (
        <p style={{ color: '#fbbf24', fontSize: '0.82rem' }}>
          Who the account is for is not saved yet. Run customer-account-questions.sql in Supabase.
        </p>
      ) : null}
      {error ? <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p> : null}
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p style={{ color: '#94a3b8', margin: 0 }}>No customer has signed in yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {accounts.map((account) => {
            const kind = accountKindLabel(account.account_kind, 'en');
            return (
              <div key={account.user_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #1e293b' }}>
                <div>
                  <strong>{account.display_name || account.email}</strong>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    {account.email}
                    {account.phone ? ` · ${account.phone}` : ''}
                    {kind ? ` · ${kind}` : ''}
                    {account.organization_name ? ` · ${account.organization_name}` : ''}
                    {account.created_at ? ` · signed up ${formatCrDate(account.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === account.user_id}
                  onClick={() => removeAccount(account)}
                  style={{ color: '#f87171', background: 'none', border: '1px solid #7f1d1d', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
                >
                  {busyId === account.user_id ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
