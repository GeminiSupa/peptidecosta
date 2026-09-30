'use client';

import { useEffect, useState } from 'react';

import AccountShell from '../AccountShell';
import AccountQuestions from '../AccountQuestions';
import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';

export default function AccountProfilePage() {
  const [lang, setLang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const isEn = lang === 'en';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [columnsMissing, setColumnsMissing] = useState(false);

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return undefined;

    let active = true;
    supabase
      .from('customer_profiles')
      .select('display_name, phone, locale, account_kind, organization_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error && /account_kind|organization_name|schema cache/i.test(error.message || '')) {
          const basic = await supabase
            .from('customer_profiles')
            .select('display_name, phone, locale')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!active) return;
          setProfile(basic.data || {});
          setColumnsMissing(true);
        } else {
          setProfile(data || {});
          setColumnsMissing(false);
        }
        setLoading(false);
      });

    return () => { active = false; };
  }, [user]);

  return (
    <AccountShell title={{ en: 'You', es: 'Tú' }}>
      {columnsMissing ? (
        <div className="account-notice is-error">
          {isEn
            ? 'The extra questions are not saved yet. Run customer-account-questions.sql in the database first.'
            : 'Las preguntas extra aún no se guardan. Ejecute customer-account-questions.sql en la base de datos primero.'}
        </div>
      ) : null}

      <div className="account-card">
        <h2>{isEn ? 'Your details' : 'Sus datos'}</h2>

        {loading || !profile ? (
          <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
        ) : (
          <>
            <div className="account-field">
              <label htmlFor="profile-email">{isEn ? 'Email' : 'Correo electrónico'}</label>
              <input id="profile-email" value={user?.email || ''} readOnly disabled />
              <p className="account-muted" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                {isEn
                  ? 'Your email is how we match your past orders, so it cannot be changed here. Contact us if you need it updated.'
                  : 'Su correo es lo que usamos para vincular sus pedidos anteriores, por eso no se puede cambiar aquí. Contáctenos si necesita actualizarlo.'}
              </p>
            </div>
            <AccountQuestions
              user={user}
              initial={profile}
              lang={lang}
              setLang={setLang}
              onSaved={(row) => setProfile(row)}
            />
          </>
        )}
      </div>
    </AccountShell>
  );
}
