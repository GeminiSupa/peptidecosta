/**
 * Costa Rica's 2026 administrative divisions, published by the Instituto
 * Geografico Nacional. Prospector keeps this small gazetteer locally so the
 * location combobox is instant and does not turn the public Nominatim service
 * into an autocomplete endpoint.
 *
 * Source: Division Territorial Administrativa 2026 (7 provinces, 84 cantons).
 */
const CANTONS_BY_PROVINCE = {
  'San Jose': [
    'San Jose', 'Escazu', 'Desamparados', 'Puriscal', 'Tarrazu', 'Aserri', 'Mora',
    'Goicoechea', 'Santa Ana', 'Alajuelita', 'Vazquez de Coronado', 'Acosta',
    'Tibas', 'Moravia', 'Montes de Oca', 'Turrubares', 'Dota', 'Curridabat',
    'Perez Zeledon', 'Leon Cortes Castro',
  ],
  Alajuela: [
    'Alajuela', 'San Ramon', 'Grecia', 'San Mateo', 'Atenas', 'Naranjo', 'Palmares',
    'Poas', 'Orotina', 'San Carlos', 'Zarcero', 'Sarchi', 'Upala', 'Los Chiles',
    'Guatuso', 'Rio Cuarto',
  ],
  Cartago: [
    'Cartago', 'Paraiso', 'La Union', 'Jimenez', 'Turrialba', 'Alvarado', 'Oreamuno',
    'El Guarco',
  ],
  Heredia: [
    'Heredia', 'Barva', 'Santo Domingo', 'Santa Barbara', 'San Rafael', 'San Isidro',
    'Belen', 'Flores', 'San Pablo', 'Sarapiqui',
  ],
  Guanacaste: [
    'Liberia', 'Nicoya', 'Santa Cruz', 'Bagaces', 'Carrillo', 'Canas', 'Abangares',
    'Tilaran', 'Nandayure', 'La Cruz', 'Hojancha',
  ],
  Puntarenas: [
    'Puntarenas', 'Esparza', 'Buenos Aires', 'Montes de Oro', 'Osa', 'Quepos',
    'Golfito', 'Coto Brus', 'Parrita', 'Corredores', 'Garabito', 'Monteverde',
    'Puerto Jimenez',
  ],
  Limon: ['Limon', 'Pococi', 'Siquirres', 'Talamanca', 'Matina', 'Guacimo'],
};

const DISPLAY_NAMES = {
  'San Jose': 'San José',
  Escazu: 'Escazú',
  Tarrazu: 'Tarrazú',
  Aserri: 'Aserrí',
  'Vazquez de Coronado': 'Vázquez de Coronado',
  Tibas: 'Tibás',
  'Perez Zeledon': 'Pérez Zeledón',
  'Leon Cortes Castro': 'León Cortés Castro',
  'San Ramon': 'San Ramón',
  Poas: 'Poás',
  Sarchi: 'Sarchí',
  'Rio Cuarto': 'Río Cuarto',
  Paraiso: 'Paraíso',
  'La Union': 'La Unión',
  Jimenez: 'Jiménez',
  'Santa Barbara': 'Santa Bárbara',
  Belen: 'Belén',
  Sarapiqui: 'Sarapiquí',
  Canas: 'Cañas',
  Tilaran: 'Tilarán',
  'Puerto Jimenez': 'Puerto Jiménez',
  Limon: 'Limón',
  Pococi: 'Pococí',
  Guacimo: 'Guácimo',
};

const displayName = (name) => DISPLAY_NAMES[name] || name;

const provinces = Object.keys(CANTONS_BY_PROVINCE).map(displayName);

export const COSTA_RICA_LOCATIONS = [
  {
    id: 'country-cr',
    type: 'country',
    name: 'Costa Rica',
    label: 'Costa Rica',
    detail: 'Country',
    value: 'Costa Rica',
  },
  ...provinces.map((province, index) => ({
    id: `province-${index + 1}`,
    type: 'province',
    name: province,
    label: province,
    detail: 'Province · Costa Rica',
    value: `Provincia de ${province}, Costa Rica`,
  })),
  ...Object.entries(CANTONS_BY_PROVINCE).flatMap(([rawProvince, cantons], provinceIndex) => {
    const province = displayName(rawProvince);
    return cantons.map((rawCanton, cantonIndex) => {
      const canton = displayName(rawCanton);
      return {
        id: `canton-${provinceIndex + 1}-${cantonIndex + 1}`,
        type: 'canton',
        name: canton,
        label: canton,
        detail: `Canton · ${province}`,
        value: `${canton}, ${province}, Costa Rica`,
      };
    });
  }),
];

const foldLocation = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const TYPE_ORDER = { country: 0, province: 1, canton: 2 };

/** Accent-insensitive, token-aware suggestions for the Prospector combobox. */
export function suggestCostaRicaLocations(query, limit = 8) {
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(Number(limit)) || 8));
  const foldedQuery = foldLocation(query);
  if (!foldedQuery) return COSTA_RICA_LOCATIONS.slice(0, boundedLimit);

  const tokens = foldedQuery.split(/\s+/).filter(Boolean);
  return COSTA_RICA_LOCATIONS
    .map((location) => {
      const name = foldLocation(location.name);
      const searchable = foldLocation(`${location.name} ${location.detail} ${location.value}`);
      if (!tokens.every((token) => searchable.includes(token))) return null;
      const score = name === foldedQuery ? 0
        : name.startsWith(foldedQuery) ? 1
          : searchable.startsWith(foldedQuery) ? 2
            : 3;
      return { location, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score
      || TYPE_ORDER[a.location.type] - TYPE_ORDER[b.location.type]
      || a.location.label.localeCompare(b.location.label, 'es'))
    .slice(0, boundedLimit)
    .map(({ location }) => location);
}

