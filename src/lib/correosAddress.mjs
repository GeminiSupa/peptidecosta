/**
 * A Costa Rican address, turned into the codes Correos de Costa Rica needs.
 *
 * Correos identifies a destination by three numbers, not by names: provincia
 * (1 digit), cantón (2) and distrito (2). Strung together they are also the
 * postal code — San José / Alajuelita / Alajuelita is 1-10-01, or 11001.
 *
 * Checkout collects all three from linked dropdowns, so the values start out
 * clean. They do not stay that way: the order row keeps `shipping_address` as
 * one free-text blob with the three names flattened onto a "Distrito, Cantón,
 * Provincia" line at the end, manual orders are typed by hand, and older rows
 * predate the dropdowns entirely. So the job here is to recover codes from
 * whatever the row actually holds, and — more importantly — to be honest when
 * it cannot.
 *
 * Nothing here guesses. A parcel sent to a confidently wrong district is worse
 * than one an agent has to finish by hand, so an unresolved district resolves
 * to the cantón and says so rather than picking the nearest-looking name.
 *
 * The data is src/lib/costarica.json, the same file the checkout dropdowns are
 * built from: 7 provincias, 82 cantones, 479 distritos, keyed by official code.
 */

import territory from './costarica.json' with { type: 'json' };

/**
 * Names compare with accents and case removed.
 *
 * "Pérez Zeledón", "PEREZ ZELEDON" and "perez zeledon" are one place. The blob
 * these names are recovered from has been through a checkout, a database, an
 * email and sometimes a person retyping it, and the accent is the first thing
 * any of those drops.
 */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cantón 01 answers to two different names.
 *
 * costarica.json calls it "Central" in six of the seven provinces, which is
 * what the checkout dropdown shows and therefore what lands in the order. INEC
 * and Correos call it after its province — "San José", "Alajuela", "Limón".
 * Both have to resolve to 01 or half the country fails to match.
 */
function cantonAliases(cantonName, provinceName, cantonCode) {
  const names = [cantonName];
  if (cantonCode === '01') names.push('Central', provinceName);
  return names.map(normalizeName);
}

/** province code -> { code, name, cantones: Map<normalized name, canton> } */
function buildIndex(data) {
  const provinces = new Map();

  for (const [provinceCode, province] of Object.entries(data.provincias || {})) {
    const cantones = new Map();

    for (const [cantonCode, canton] of Object.entries(province.cantones || {})) {
      const districts = new Map();
      for (const [districtCode, districtName] of Object.entries(canton.distritos || {})) {
        districts.set(normalizeName(districtName), { code: districtCode, name: districtName });
      }

      const entry = { code: cantonCode, name: canton.nombre, districts };
      for (const alias of cantonAliases(canton.nombre, province.nombre, cantonCode)) {
        // First writer wins: a real cantón named like a province keeps its own
        // code rather than being overwritten by the 01 alias.
        if (!cantones.has(alias)) cantones.set(alias, entry);
      }
    }

    const entry = { code: provinceCode, name: province.nombre, cantones };
    provinces.set(normalizeName(province.nombre), entry);
    provinces.set(provinceCode, entry);
  }

  return provinces;
}

const INDEX = buildIndex(territory);

/** The 5-digit Correos postal code, or '' when the address is not fully resolved. */
export function postalCode({ provinceCode, cantonCode, districtCode } = {}) {
  if (!provinceCode || !cantonCode || !districtCode) return '';
  return `${provinceCode}${cantonCode}${districtCode}`;
}

/**
 * Names in, codes out.
 *
 * `level` says how far it got, and is the field a caller should branch on:
 *   'district' — all three resolved, there is a postal code, ready to ship
 *   'canton'   — province and cantón are right, the district needs a human
 *   'province' — only the province is trustworthy
 *   'none'     — nothing matched; do not send this to Correos
 *
 * The district is only ever looked up inside the cantón that matched, never
 * across the country. There are several San Isidros and several San Franciscos,
 * and the only thing that separates them is the cantón they sit in.
 */
export function resolveTerritory({ province, canton, district } = {}) {
  const empty = {
    level: 'none',
    provinceCode: '', cantonCode: '', districtCode: '',
    province: '', canton: '', district: '',
    postalCode: '',
    unresolved: [],
  };

  const provinceEntry = INDEX.get(normalizeName(province)) || INDEX.get(String(province ?? '').trim());
  if (!provinceEntry) {
    return { ...empty, unresolved: ['province', 'canton', 'district'] };
  }

  const cantonEntry = provinceEntry.cantones.get(normalizeName(canton));
  if (!cantonEntry) {
    return {
      ...empty,
      level: 'province',
      provinceCode: provinceEntry.code,
      province: provinceEntry.name,
      unresolved: ['canton', 'district'],
    };
  }

  const districtEntry = cantonEntry.districts.get(normalizeName(district));
  if (!districtEntry) {
    return {
      ...empty,
      level: 'canton',
      provinceCode: provinceEntry.code,
      cantonCode: cantonEntry.code,
      province: provinceEntry.name,
      canton: cantonEntry.name,
      unresolved: ['district'],
    };
  }

  const codes = {
    provinceCode: provinceEntry.code,
    cantonCode: cantonEntry.code,
    districtCode: districtEntry.code,
  };

  return {
    level: 'district',
    ...codes,
    province: provinceEntry.name,
    canton: cantonEntry.name,
    district: districtEntry.name,
    postalCode: postalCode(codes),
    unresolved: [],
  };
}

/** Every valid 5-digit code, so a bare number in the text can be trusted or rejected. */
const POSTAL_CODES = (() => {
  const codes = new Map();
  for (const [provinceCode, province] of Object.entries(territory.provincias || {})) {
    for (const [cantonCode, canton] of Object.entries(province.cantones || {})) {
      for (const [districtCode, districtName] of Object.entries(canton.distritos || {})) {
        codes.set(`${provinceCode}${cantonCode}${districtCode}`, {
          provinceCode, cantonCode, districtCode,
          province: province.nombre, canton: canton.nombre, district: districtName,
        });
      }
    }
  }
  return codes;
})();

// Words people type around the values rather than instead of them: "Provincia
// San José", "código postal 40610". Stripped so the name underneath can match.
const LABELS = /^(provincia|canton|cantón|distrito|district|province|codigo postal|código postal|cp)\s*:?\s*/i;

function cleanPart(part) {
  return String(part ?? '')
    // Trimmed before the label is stripped, not after: splitting on commas
    // leaves a leading space on every part but the first, and LABELS is
    // anchored, so " Cantón Curridabat" kept its label while the first field
    // lost one — the same line parsed inconsistently across its own fields.
    .trim()
    .replace(LABELS, '')
    // A postal code trailing a name — "San Jose 10501" — is the same place
    // twice. Drop it so the name resolves; it is recovered separately below.
    .replace(/\b\d{5}\b\s*$/, '')
    .trim();
}

/**
 * Reads a comma-separated line by finding the province in it, rather than
 * trusting a field order.
 *
 * Checkout writes "Distrito, Cantón, Provincia", but a good share of orders are
 * typed the other way round — "Heredia, San Rafael, San Josecito" — and one
 * order read as the other sends a parcel to a different part of the country.
 *
 * The province is what makes this decidable without guessing: there are only
 * seven, so whichever end of the run holds one determines which way the line
 * runs. When neither end does, the line is not a location line and is skipped.
 */
function readLocationLine(line) {
  const parts = line.split(',').map(cleanPart).filter(Boolean);
  if (parts.length < 3) return null;

  const isProvince = (part) => INDEX.has(normalizeName(part));

  for (let i = parts.length - 1; i >= 2; i -= 1) {
    // "…, Distrito, Cantón, Provincia"
    if (isProvince(parts[i])) {
      const resolved = resolveTerritory({ province: parts[i], canton: parts[i - 1], district: parts[i - 2] });
      if (resolved.level === 'district') return resolved;
    }
  }

  for (let i = 0; i <= parts.length - 3; i += 1) {
    // "Provincia, Cantón, Distrito, …"
    if (isProvince(parts[i])) {
      const resolved = resolveTerritory({ province: parts[i], canton: parts[i + 1], district: parts[i + 2] });
      if (resolved.level === 'district') return resolved;
    }
  }

  // Nothing reached a district. A province and cantón alone are still worth
  // returning — they narrow the job for whoever finishes it by hand.
  for (const [i, part] of parts.entries()) {
    if (!isProvince(part)) continue;
    for (const other of [parts[i - 1], parts[i + 1]]) {
      const resolved = resolveTerritory({ province: part, canton: other, district: '' });
      if (resolved.level === 'canton') return resolved;
    }
  }

  return null;
}

/** A 5-digit code in the text, kept only when it is a real district. */
function readPostalCode(blob) {
  for (const match of String(blob ?? '').matchAll(/\b(\d{5})\b/g)) {
    const hit = POSTAL_CODES.get(match[1]);
    if (hit) {
      return {
        level: 'district',
        ...hit,
        postalCode: match[1],
        unresolved: [],
      };
    }
  }
  return null;
}

/**
 * Recovers the destination from the free-text blob the order actually stores.
 *
 * Lines are read bottom-up because checkout appends the location line last, and
 * the lines above it are the customer's own directions — full of place names
 * that would match something if they were allowed to.
 *
 * The written-out names are preferred over a postal code found in the text.
 * The names came from the checkout dropdowns; a bare number is more often
 * something the customer typed from memory, and only falls back to when no line
 * resolves.
 */
export function parseShippingAddress(blob) {
  const lines = String(blob ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  let partial = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const resolved = readLocationLine(lines[i]);
    if (resolved?.level === 'district') return { ...resolved, line: lines[i], lineIndex: i };
    if (resolved && !partial) partial = { ...resolved, line: lines[i], lineIndex: i };
  }

  const fromCode = readPostalCode(blob);
  if (fromCode) return { ...fromCode, line: '', lineIndex: -1 };

  return partial || { ...resolveTerritory({}), line: '', lineIndex: -1 };
}

/**
 * What an order gives Correos, as far as this side can determine it.
 *
 * Deliberately not the request body for their web service: the field names for
 * that come from documentation we do not have yet. This is the content — who,
 * where, which codes — in a shape a caller can map onto whatever the API turns
 * out to want, and that an agent can read off a screen today.
 *
 * `ready` is the whole point. True means every field Correos needs to cut a
 * guide is present and the destination resolved to a district. False means a
 * human has to finish it, and `missing` says what they have to supply.
 */
export function buildShipmentDraft(order = {}) {
  const address = parseShippingAddress(order.shipping_address);
  const name = String(order.customer_name ?? '').trim();
  const phone = String(order.customer_phone ?? '').replace(/[^0-9]/g, '').replace(/^506/, '');
  const email = String(order.customer_email ?? '').trim();

  const missing = [];
  if (!name) missing.push('customer_name');
  if (phone.length !== 8) missing.push('customer_phone');
  if (address.level !== 'district') missing.push(...address.unresolved);

  return {
    orderNumber: String(order.order_number ?? order.id ?? '').trim(),
    recipient: { name, phone, email },
    destination: {
      provinceCode: address.provinceCode,
      cantonCode: address.cantonCode,
      districtCode: address.districtCode,
      postalCode: address.postalCode,
      province: address.province,
      canton: address.canton,
      district: address.district,
    },
    // Everything the location line is not: the customer's own directions, which
    // Correos prints on the label as the street address.
    directions: String(order.shipping_address ?? '')
      .split(/\r?\n/)
      .filter((_, index) => index !== address.lineIndex)
      .join('\n')
      .trim(),
    ready: missing.length === 0,
    missing,
  };
}
