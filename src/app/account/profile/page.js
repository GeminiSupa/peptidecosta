'use client';

import { useEffect, useState } from 'react';

import AccountShell from '../AccountShell';
import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';

export default function AccountProfilePage() {
  const [lang, setLang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const isEn = lang === 'en';

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState('es');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return undefined;

    let active = true;
    supabase
      .from('customer_profiles')
      .select('display_name, phone, locale')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setDisplayName(data?.display_name || '');
        setPhone(data?.phone || '');
        setLocale(data?.locale || 'es');
        setLoading(false);
      });

    return () => { active = false; };
  }, [user]);

  const save = async (event) => {
    event.preventDefault();
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return;

    setSaving(true);
    setNotice(null);

    // customer_profiles' RLS insert/update checks require the row's email to
    // equal the address on the JWT, so the session's own email is always what
    // gets written — a customer cannot point their profile at someone else.
    const row = {
      user_id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
      display_name: displayName.trim() || null,
      phone: phone.trim() || null,
      locale: locale === 'en' ? 'en' : 'es',
    };

    const { error } = await supabase
      .from('customer_profiles')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('[account/profile] save failed:', error);
      setNotice({ tone: 'is-error', text: isEn ? 'Could not save your details.' : 'No pudimos guardar sus datos.' });
    } else {
      setNotice({ tone: 'is-success', text: isEn ? 'Saved.' : 'Guardado.' });
      setLang(row.locale);
    }
    setSaving(false);
  };

  return (
    <AccountShell title={{ en: 'Profile', es: 'Perfil' }}>
      {notice ? <div className={`account-notice ${notice.tone}`}>{notice.text}</div> : null}

      <div className="account-card">
        <h2>{isEn ? 'Your details' : 'Sus datos'}</h2>

        {loading ? (
          <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
        ) : (
          <form onSubmit={save}>
            <div className="account-field">
              <label htmlFor="profile-email">{isEn ? 'Email' : 'Correo electrónico'}</label>
              <input id="profile-email" value={user?.email || ''} readOnly disabled />
              <p className="account-muted" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                {isEn
                  ? 'Your email is how we match your past orders, so it cannot be changed here. Contact us if you need it updated.'
                  : 'Su correo es lo que usamos para vincular sus pedidos anteriores, por eso no se puede cambiar aquí. Contáctenos si necesita actualizarlo.'}
              </p>
            </div>

            <div className="account-field">
              <label htmlFor="profile-name">{isEn ? 'Name' : 'Nombre'}</label>
              <input
                id="profile-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="account-field">
              <label htmlFor="profile-phone">{isEn ? 'Phone' : 'Teléfono'}</label>
              <input
                id="profile-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="account-field">
              <label htmlFor="profile-locale">{isEn ? 'Language' : 'Idioma'}</label>
              <select
                id="profile-locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>

            <button type="submit" className="account-btn-primary" disabled={saving}>
              {saving ? (isEn ? 'Saving…' : 'Guardando…') : (isEn ? 'Save' : 'Guardar')}
            </button>
          </form>
        )}
      </div>
    </AccountShell>
  );
}
