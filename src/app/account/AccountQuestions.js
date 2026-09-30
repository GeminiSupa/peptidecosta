'use client';

import { useState } from 'react';

import { getCustomerSupabase } from '@/lib/customerSupabase';
import { ACCOUNT_KINDS, isAccountKind } from '@/lib/accountHome.mjs';

/**
 * The questions asked when an account is set up, and again on the profile page.
 * Name, phone, who the account is for, and the lab or business name.
 */
export default function AccountQuestions({ user, initial, lang, onSaved, setLang }) {
  const isEn = lang === 'en';
  const [displayName, setDisplayName] = useState(initial?.display_name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [locale, setLocale] = useState(initial?.locale === 'en' ? 'en' : 'es');
  const [accountKind, setAccountKind] = useState(initial?.account_kind || '');
  const [organization, setOrganization] = useState(initial?.organization_name || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const needsOrganization = accountKind === 'researcher' || accountKind === 'pharmacy' || accountKind === 'clinic';

  const save = async (event) => {
    event.preventDefault();
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return;

    if (!displayName.trim() || !phone.trim() || !isAccountKind(accountKind)) {
      setNotice({
        tone: 'is-error',
        text: isEn ? 'Name, phone, and account type are required.' : 'El nombre, el teléfono y el tipo de cuenta son obligatorios.',
      });
      return;
    }
    if (needsOrganization && !organization.trim()) {
      setNotice({
        tone: 'is-error',
        text: isEn ? 'Add the lab, pharmacy, or clinic name.' : 'Agregue el nombre del laboratorio, la farmacia o la clínica.',
      });
      return;
    }

    setSaving(true);
    setNotice(null);

    const row = {
      user_id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
      display_name: displayName.trim(),
      phone: phone.trim(),
      locale: locale === 'en' ? 'en' : 'es',
      account_kind: accountKind,
      organization_name: organization.trim() || null,
    };

    const { error } = await supabase
      .from('customer_profiles')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('[account/questions] save failed:', error);
      const missingColumn = /account_kind|organization_name|schema cache/i.test(error.message || '');
      setNotice({
        tone: 'is-error',
        text: missingColumn
          ? (isEn
            ? 'These questions are not saved yet. The database update customer-account-questions.sql still needs to be run.'
            : 'Estas preguntas aún no se guardan. Falta ejecutar customer-account-questions.sql en la base de datos.')
          : (isEn ? 'Could not save your answers.' : 'No pudimos guardar sus respuestas.'),
      });
    } else {
      setNotice({ tone: 'is-success', text: isEn ? 'Saved.' : 'Guardado.' });
      if (setLang) setLang(row.locale);
      if (onSaved) onSaved(row);
    }
    setSaving(false);
  };

  return (
    <form onSubmit={save}>
      {notice ? <div className={`account-notice ${notice.tone}`}>{notice.text}</div> : null}

      <div className="account-field">
        <label htmlFor="questions-name">{isEn ? 'Name' : 'Nombre'}</label>
        <input id="questions-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      </div>

      <div className="account-field">
        <label htmlFor="questions-phone">{isEn ? 'Phone' : 'Teléfono'}</label>
        <input id="questions-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
      </div>

      <div className="account-field">
        <label htmlFor="questions-kind">{isEn ? 'Who is this account for?' : '¿Para quién es esta cuenta?'}</label>
        <select id="questions-kind" value={accountKind} onChange={(event) => setAccountKind(event.target.value)} required>
          <option value="">{isEn ? 'Choose one' : 'Elija uno'}</option>
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>{isEn ? kind.en : kind.es}</option>
          ))}
        </select>
      </div>

      <div className="account-field">
        <label htmlFor="questions-org">
          {isEn ? 'Lab, pharmacy, or clinic name' : 'Nombre del laboratorio, farmacia o clínica'}
        </label>
        <input
          id="questions-org"
          value={organization}
          onChange={(event) => setOrganization(event.target.value)}
          required={needsOrganization}
        />
      </div>

      <div className="account-field">
        <label htmlFor="questions-locale">{isEn ? 'Language' : 'Idioma'}</label>
        <select id="questions-locale" value={locale} onChange={(event) => setLocale(event.target.value)}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>

      <button type="submit" className="account-btn-primary" disabled={saving}>
        {saving ? (isEn ? 'Saving…' : 'Guardando…') : (isEn ? 'Save' : 'Guardar')}
      </button>
    </form>
  );
}
