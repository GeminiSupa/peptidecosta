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
| `{{3}}` | End date | `jueves 10 de septiembre` |
| `{{4}}` | Catalog link | `https://catalog.peptidescostarica.net/catalog?lang=es&promo_code=CELLULAR40` |

Put `?promo_code=CELLULAR40` on the link. The catalog reads that parameter and
applies the code on arrival, so nobody has to type it.

**Spanish only.** Do not send the English variant to this list.

### Follow-up, final hours

Send at roughly T-6h to anyone who opened but did not order. Same template, only
`{{3}}` changes:

```
{{3}} = hoy — últimas horas
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

Termina el jueves 10 de septiembre.

Ordená acá 👉 https://catalog.peptidescostarica.net/catalog?lang=es&promo_code=CELLULAR40
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

Body HTML lives in **`docs/cellular40-email-es.html`**. Open it in a browser
to preview, then copy the whole file into the campaign editor's HTML view.

It is kept as its own file rather than pasted here so there is only one copy to
change. Colours come from the site's own tokens: navy `#002766` carries it,
orange `#BF4F0B` appears once on the button and nowhere else.

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
