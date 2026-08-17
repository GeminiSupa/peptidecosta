'use client';

import { useCallback, useEffect, useState } from 'react';

import AccountShell from '../AccountShell';
import costaricaData from '@/lib/costarica.json';
import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';

const EMPTY_FORM = {
  label: '',
  recipient_name: '',
  phone: '',
  province: '',
  canton: '',
  district: '',
  detailed_address: '',
  postal_code: '',
  is_default: false,
};

// The checkout stores province, canton and district as their Spanish names, and
// matches them back against this same file to drive its cascading selects. The
// account form has to offer exactly those strings or a saved address would
// prefill fields the checkout then rejects as unrecognised.
const provinces = Object.values(costaricaData.provincias);

function cantonsOf(provinceName) {
  const province = provinces.find((item) => item.nombre === provinceName);
  return Object.values(province?.cantones || {});
}

function districtsOf(provinceName, cantonName) {
  const canton = cantonsOf(provinceName).find((item) => item.nombre === cantonName);
  return Object.values(canton?.distritos || {});
}

export default function AccountAddressesPage() {
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const isEn = lang === 'en';

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setNotice({ tone: 'is-error', text: isEn ? 'Could not load your addresses.' : 'No pudimos cargar sus direcciones.' });
      setAddresses([]);
    } else {
      setAddresses(data || []);
    }
    setLoading(false);
  }, [user, isEn]);

  useEffect(() => { load(); }, [load]);

  const setField = (name, value) => {
    setForm((current) => {
      const next = { ...current, [name]: value };
      // Clear the dependent fields when a parent changes, so a stale canton can
      // never be saved against a different province.
      if (name === 'province') { next.canton = ''; next.district = ''; }
      if (name === 'canton') { next.district = ''; }
      return next;
    });
  };

  const startAdd = () => {
    setForm({ ...EMPTY_FORM, is_default: addresses.length === 0 });
    setEditingId(null);
    setShowForm(true);
    setNotice(null);
  };

  const startEdit = (address) => {
    setForm({
      label: address.label || '',
      recipient_name: address.recipient_name || '',
      phone: address.phone || '',
      province: address.province || '',
      canton: address.canton || '',
      district: address.district || '',
      detailed_address: address.detailed_address || '',
      postal_code: address.postal_code || '',
      is_default: Boolean(address.is_default),
    });
    setEditingId(address.id);
    setShowForm(true);
    setNotice(null);
  };

  const save = async (event) => {
    event.preventDefault();
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return;

    setSaving(true);
    setNotice(null);

    const row = {
      customer_user_id: user.id,
      label: form.label.trim() || (isEn ? 'Home' : 'Casa'),
      recipient_name: form.recipient_name.trim(),
      phone: form.phone.trim() || null,
      province: form.province || null,
      canton: form.canton || null,
      district: form.district || null,
      detailed_address: form.detailed_address.trim(),
      postal_code: form.postal_code.trim() || null,
      is_default: form.is_default,
    };

    try {
      // customer_addresses carries a unique index allowing one default per
      // customer, so the previous default has to be stood down before this row
      // claims the flag — otherwise the insert trips the constraint.
      if (row.is_default) {
        let clear = supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_user_id', user.id)
          .eq('is_default', true);
        if (editingId) clear = clear.neq('id', editingId);
        await clear;
      }

      const { error } = editingId
        ? await supabase.from('customer_addresses').update(row).eq('id', editingId)
        : await supabase.from('customer_addresses').insert(row);

      if (error) throw error;

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNotice({ tone: 'is-success', text: isEn ? 'Address saved.' : 'Dirección guardada.' });
      await load();
    } catch (error) {
      console.error('[account/addresses] save failed:', error);
      setNotice({ tone: 'is-error', text: isEn ? 'Could not save the address.' : 'No pudimos guardar la dirección.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (address) => {
    const label = address.label || address.detailed_address;
    // lib/confirmDelete.mjs is the admin dashboard's helper and phrases itself
    // in English only. Storefront copy has to follow the customer's language.
    const question = isEn
      ? `Delete "${label}"?\n\nThis cannot be undone.`
      : `¿Eliminar "${label}"?\n\nEsta acción no se puede deshacer.`;
    if (!window.confirm(question)) return;

    const supabase = getCustomerSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('customer_addresses').delete().eq('id', address.id);
    if (error) {
      setNotice({ tone: 'is-error', text: isEn ? 'Could not delete the address.' : 'No pudimos eliminar la dirección.' });
      return;
    }
    await load();
  };

  const makeDefault = async (address) => {
    const supabase = getCustomerSupabase();
    if (!supabase || !user) return;

    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_user_id', user.id)
      .eq('is_default', true);
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', address.id);
    await load();
  };

  return (
    <AccountShell title={{ en: 'Addresses', es: 'Direcciones' }}>
      {notice ? <div className={`account-notice ${notice.tone}`}>{notice.text}</div> : null}

      <div className="account-card">
        <h2>{isEn ? 'Saved addresses' : 'Direcciones guardadas'}</h2>

        {loading ? (
          <p className="account-muted">{isEn ? 'Loading…' : 'Cargando…'}</p>
        ) : addresses.length === 0 ? (
          <p className="account-muted">
            {isEn
              ? 'No saved addresses yet. Add one and checkout will fill itself in next time.'
              : 'Aún no hay direcciones guardadas. Agregue una y el checkout se completará solo la próxima vez.'}
          </p>
        ) : (
          addresses.map((address) => (
            <div key={address.id} className="account-order">
              <div>
                <strong>{address.label}</strong>
                {address.is_default ? (
                  <span className="account-badge is-paid" style={{ marginLeft: 8 }}>
                    {isEn ? 'Default' : 'Predeterminada'}
                  </span>
                ) : null}
                <div className="account-order-meta">
                  {address.recipient_name}
                  {address.phone ? ` · ${address.phone}` : ''}
                </div>
                <div className="account-order-meta">
                  {[address.district, address.canton, address.province].filter(Boolean).join(', ')}
                </div>
                <div className="account-order-meta">{address.detailed_address}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <button type="button" className="account-btn-link" onClick={() => startEdit(address)}>
                  {isEn ? 'Edit' : 'Editar'}
                </button>
                {!address.is_default ? (
                  <button type="button" className="account-btn-link" onClick={() => makeDefault(address)}>
                    {isEn ? 'Make default' : 'Hacer predeterminada'}
                  </button>
                ) : null}
                <button type="button" className="account-btn-danger" onClick={() => remove(address)}>
                  {isEn ? 'Delete' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))
        )}

        {!showForm ? (
          <p style={{ marginTop: 16, marginBottom: 0 }}>
            <button type="button" className="account-btn-secondary" onClick={startAdd}>
              {isEn ? 'Add an address' : 'Agregar dirección'}
            </button>
          </p>
        ) : null}
      </div>

      {showForm ? (
        <div className="account-card">
          <h2>{editingId ? (isEn ? 'Edit address' : 'Editar dirección') : (isEn ? 'New address' : 'Nueva dirección')}</h2>
          <form onSubmit={save}>
            <div className="account-field">
              <label htmlFor="addr-label">{isEn ? 'Label' : 'Etiqueta'}</label>
              <input
                id="addr-label"
                value={form.label}
                onChange={(e) => setField('label', e.target.value)}
                placeholder={isEn ? 'Home, Office…' : 'Casa, Oficina…'}
              />
            </div>

            <div className="account-field">
              <label htmlFor="addr-name">{isEn ? 'Recipient name' : 'Nombre de quien recibe'}</label>
              <input
                id="addr-name"
                required
                value={form.recipient_name}
                onChange={(e) => setField('recipient_name', e.target.value)}
              />
            </div>

            <div className="account-field">
              <label htmlFor="addr-phone">{isEn ? 'Phone' : 'Teléfono'}</label>
              <input
                id="addr-phone"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>

            <div className="account-field">
              <label htmlFor="addr-province">{isEn ? 'Province' : 'Provincia'}</label>
              <select
                id="addr-province"
                required
                value={form.province}
                onChange={(e) => setField('province', e.target.value)}
              >
                <option value="">{isEn ? 'Select…' : 'Seleccione…'}</option>
                {provinces.map((province) => (
                  <option key={province.nombre} value={province.nombre}>{province.nombre}</option>
                ))}
              </select>
            </div>

            <div className="account-field">
              <label htmlFor="addr-canton">{isEn ? 'Canton' : 'Cantón'}</label>
              <select
                id="addr-canton"
                required
                disabled={!form.province}
                value={form.canton}
                onChange={(e) => setField('canton', e.target.value)}
              >
                <option value="">{isEn ? 'Select…' : 'Seleccione…'}</option>
                {cantonsOf(form.province).map((canton) => (
                  <option key={canton.nombre} value={canton.nombre}>{canton.nombre}</option>
                ))}
              </select>
            </div>

            <div className="account-field">
              <label htmlFor="addr-district">{isEn ? 'District' : 'Distrito'}</label>
              <select
                id="addr-district"
                required
                disabled={!form.canton}
                value={form.district}
                onChange={(e) => setField('district', e.target.value)}
              >
                <option value="">{isEn ? 'Select…' : 'Seleccione…'}</option>
                {districtsOf(form.province, form.canton).map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </div>

            <div className="account-field">
              <label htmlFor="addr-detail">{isEn ? 'Exact address' : 'Dirección exacta'}</label>
              <textarea
                id="addr-detail"
                required
                rows={3}
                value={form.detailed_address}
                onChange={(e) => setField('detailed_address', e.target.value)}
                placeholder={isEn ? 'Street, house, landmarks…' : 'Calle, casa, señas…'}
              />
            </div>

            <div className="account-field">
              <label htmlFor="addr-zip">{isEn ? 'Postal code (optional)' : 'Código postal (opcional)'}</label>
              <input
                id="addr-zip"
                value={form.postal_code}
                onChange={(e) => setField('postal_code', e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setField('is_default', e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span>{isEn ? 'Use this address by default' : 'Usar esta dirección por defecto'}</span>
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="account-btn-primary" disabled={saving}>
                {saving ? (isEn ? 'Saving…' : 'Guardando…') : (isEn ? 'Save address' : 'Guardar dirección')}
              </button>
              <button
                type="button"
                className="account-btn-secondary"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
              >
                {isEn ? 'Cancel' : 'Cancelar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AccountShell>
  );
}
