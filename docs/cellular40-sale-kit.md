# CELLULAR40 — 48h flash sale kit

Everything needed to announce the sale. Copy is final; paste it as-is.

**The offer:** 40% off MOTS-C, NAD+ (500mg and 1000mg) and SS-31, on 5 or more
vials of those three, mixable across them. Code `CELLULAR40`. 48 hours.

**Two rules the copy must never break:**

1. The 40% applies **only** to those three products. Other products in the same
   basket stay at their normal price. Never write "40% off everything".
2. The five vials must be **those three products**. Padding a basket with other
   items no longer unlocks the code, so any message promising otherwise creates
   a support ticket.

---

## 1. Announcement banner (catalog)

Announcements panel → new banner → paste both. Keep them short; the banner is a
single line on a phone.

**English**

```
⚡ 48-HOUR FLASH SALE — 40% off MOTS-C, NAD+ and SS-31 on 5+ vials. Code: CELLULAR40
```

**Español**

```
⚡ OFERTA RELÁMPAGO 48H — 40% en MOTS-C, NAD+ y SS-31 llevando 5+ viales. Código: CELLULAR40
```

Name the code in the banner. A discount visitors have to type is one they must
be told about, and a banner that only shouts the percentage reads as an
automatic price cut that the cart then appears to ignore.

---

## 2. WhatsApp

**Template:** `promo_precio_especial_v1` — the flexible offer template already
approved for this kind of send. It takes four parameters.

| Slot | Meaning | Value for this sale |
|------|---------|---------------------|
| `{{1}}` | Product | `MOTS-C, NAD+ y SS-31` |
| `{{2}}` | Offer | `40% de descuento llevando 5 o más viales (código CELLULAR40)` |
| `{{3}}` | End date | `jueves 10 de septiembre, 10:00 a.m.` |
| `{{4}}` | Catalog link | your catalog URL with `?promo_code=CELLULAR40` |

Put `?promo_code=CELLULAR40` on the link. The catalog reads that parameter and
applies the code on arrival, so nobody has to type it.

**Spanish only.** Do not send the English variant to this list.

### Follow-up, final hours

Send at roughly T-6h to anyone who opened but did not order. Same template, only
`{{3}}` changes:

```
{{3}} = hoy a las 10:00 a.m. — últimas horas
```

### If you send free-form instead of a template

Only valid inside a 24-hour customer service window. Outside it Meta rejects
anything but an approved template.

```
¡Hola {{name}}! 👋

Tenemos 48 horas de oferta relámpago en optimización celular:

⚡ 40% de descuento en MOTS-C, NAD+ y SS-31
📦 Llevando 5 o más viales (podés combinar entre estos tres)
🔑 Código: CELLULAR40

Soporte mitocondrial y energía celular:
• Más energía
• Antienvejecimiento
• Renovación celular
• Salud mitocondrial

Termina el jueves 10 de septiembre a las 10:00 a.m.

Ordená acá 👉 [enlace]
```

`{{name}}` is substituted automatically. A contact with no name on file reads
`¡Hola Cliente!`, which is why the greeting is written to survive it.

---

## 3. Email (Spanish)

Subject lines, pick one:

- `⚡ 48 horas: 40% en MOTS-C, NAD+ y SS-31`
- `Optimización celular con 40% de descuento — solo 48 horas`

Preheader:

```
40% llevando 5 o más viales. Código CELLULAR40. Termina el jueves.
```

Body HTML — paste into the campaign editor's HTML view. Table-based and inline
styled, because Gmail and Outlook strip a `<style>` block and ignore flexbox.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">

      <tr><td style="background:#c2410c;padding:22px 28px;text-align:center;">
        <div style="color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:1.5px;">OFERTA RELÁMPAGO 48 HORAS</div>
        <div style="color:#ffffff;font-size:32px;font-weight:bold;padding-top:6px;">40% DE DESCUENTO</div>
        <div style="color:#fed7aa;font-size:15px;padding-top:6px;">MOTS-C · NAD+ · SS-31</div>
      </td></tr>

      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hola,</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
          Por 48 horas tenemos <strong>40% de descuento</strong> en nuestra línea de
          optimización celular, llevando <strong>5 o más viales</strong>. Podés
          combinar entre los tres productos para llegar a los 5.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-left:4px solid #c2410c;border-radius:6px;margin-bottom:22px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:13px;color:#9a3412;font-weight:bold;letter-spacing:0.5px;">SOPORTE MITOCONDRIAL</div>
            <div style="font-size:14px;color:#374151;line-height:1.9;padding-top:8px;">
              • Más energía<br>
              • Antienvejecimiento<br>
              • Renovación celular<br>
              • Salud mitocondrial
            </div>
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed #c2410c;border-radius:8px;margin-bottom:24px;">
          <tr><td align="center" style="padding:16px;">
            <div style="font-size:12px;color:#6b7280;letter-spacing:1px;">CÓDIGO PROMOCIONAL</div>
            <div style="font-size:26px;font-weight:bold;color:#c2410c;letter-spacing:2px;padding-top:4px;">CELLULAR40</div>
          </td></tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 22px;">
          <tr><td style="background:#c2410c;border-radius:8px;">
            <a href="{{CATALOG_URL}}?promo_code=CELLULAR40" style="display:inline-block;padding:15px 42px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
              Ver la oferta
            </a>
          </td></tr>
        </table>

        <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;line-height:1.6;">
          Termina el jueves 10 de septiembre a las 10:00 a.m.<br>
          Descuento válido en MOTS-C, NAD+ y SS-31 llevando 5 o más viales.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
```

Replace `{{CATALOG_URL}}` with the catalog address. The `?promo_code=CELLULAR40`
after it applies the code when they land, so the button does the typing.

---

## 4. Sending order

1. Banner live on the catalog first, so arrivals from any channel see it.
2. Email to the full list.
3. WhatsApp two hours later, so anyone who ordered from the email is not
   messaged again.
4. Final-hours WhatsApp at T-6h to openers who did not order.

## 5. Before you send

- Apply `CELLULAR40` to a real cart of 5 covered vials and confirm the total.
- Confirm the products are **not** also discounted in the Products table. If
  they are, the code takes 40% off an already-reduced price and the real
  discount is 64%.
- Check the promo's expiry matches the date written in the copy above.
