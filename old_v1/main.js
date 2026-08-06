const BASE_URL = 'https://docs.google.com/spreadsheets/d/1ViOs6UP2xn5wRbooHL21OzUJ13vEiGMDxnVAIlOCBtE/export?format=csv';
const GIDS = {
    en: { products: '634053495', info: '1510484594' },
    es: { products: '1980042516', info: '1496417111' },
    master: '1590810046'
};

// Default Settings
let currentLang = 'es';
let currentCurrency = 'CRC';
let currentTheme = localStorage.getItem('theme') || 'light';
let allProducts = [];
let categories = new Set();
let instructions = '';
let currentCategory = 'all';
let searchQuery = '';
let filterState = {
    price: 'all',
    sort: 'pop',
    inStockOnly: false
};
let viewMode = localStorage.getItem('viewMode') || 'list'; // 'list', 'compact', 'grid'
const WHATSAPP_NUMBER = '50684046973';

// DOM Elements
const productGrid = document.getElementById('productGrid');
const categoryNav = document.getElementById('categoryNav');
const searchInput = document.getElementById('searchInput');
const toggleUSD = document.getElementById('toggleUSD');
const toggleCRC = document.getElementById('toggleCRC');
const productModal = document.getElementById('productModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close-modal');
const viewToggle = document.getElementById('viewToggle');

async function init() {
    // Parse URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    const currencyParam = urlParams.get('currency');

    if (langParam === 'en') {
        currentLang = 'en';
        currentCurrency = 'USD';
    } else if (langParam === 'es') {
        currentLang = 'es';
        currentCurrency = 'CRC';
    }

    if (currencyParam === 'USD' || currencyParam === 'usd') currentCurrency = 'USD';
    if (currencyParam === 'CRC' || currencyParam === 'crc') currentCurrency = 'CRC';

    // Apply Theme
    document.documentElement.setAttribute('data-theme', currentTheme);

    function applyInitialViewMode() {
        productGrid.classList.remove('list-view', 'compact-view', 'grid-view');
        productGrid.classList.add(`${viewMode}-view`);
        if (viewToggle) {
            if (viewMode === 'list') viewToggle.innerHTML = '<span>𝌸</span>'; // Large List
            else if (viewMode === 'compact') viewToggle.innerHTML = '<span>≣</span>'; // Compact List
            else viewToggle.innerHTML = '<span>▦</span>'; // Grid
        }
    }
    applyInitialViewMode();

    try {
        await loadData();
        setupEventListeners();
        updateSelectorUI();
    } catch (error) {
        console.error('Error initializing app:', error);
        productGrid.innerHTML = `<div class="loader">Error al cargar el catálogo. Por favor, intente más tarde.</div>`;
    }
}

function updateSelectorUI() {
    const langEn = document.getElementById('langEn');
    const langEs = document.getElementById('langEs');
    if (currentLang === 'en') {
        langEn?.classList.add('active');
        langEs?.classList.remove('active');
    } else {
        langEs?.classList.add('active');
        langEn?.classList.remove('active');
    }

    if (currentCurrency === 'USD') {
        toggleUSD?.classList.add('active');
        toggleCRC?.classList.remove('active');
    } else {
        toggleCRC?.classList.add('active');
        toggleUSD?.classList.remove('active');
    }

    // Update Theme UI
    const themeLight = document.getElementById('themeLight');
    const themeDark = document.getElementById('themeDark');
    if (currentTheme === 'dark') {
        themeDark?.classList.add('active');
        themeLight?.classList.remove('active');
    } else {
        themeLight?.classList.add('active');
        themeDark?.classList.remove('active');
    }
}

const CATEGORY_TRANSLATIONS = {
    'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
    'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
    'Recovery & Healing': 'Recuperación y curación',
    'Anti-Inflammatory': 'Antiinflamatorio',
    'Performance & Hormones': 'Rendimiento y hormonas',
    'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
    'Immune System Modulation': 'Modulación del sistema inmunitario',
    'Cognitive & Mood': 'Cognitivo y estado de ánimo',
    'Sleep': 'Dormir',
    'Sexual Health': 'Salud sexual',
    'Tanning & Sexual Function': 'Bronceado y función sexual',
    'Skin & Hair': 'Piel y cabello',
    'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
    'Reconstitution Supply': 'Suministro de reconstitución'
};

const STATUS_TRANSLATIONS = {
    'es': {
        'in stock': 'Disponible',
        'out of stock': 'Agotado',
        'coming soon': 'Próximamente'
    },
    'en': {
        'in stock': 'In Stock',
        'out of stock': 'Out of Stock',
        'coming soon': 'Coming Soon'
    }
};

function isInStock(statusText) {
    const s = (statusText || '').toLowerCase().trim();
    return s === 'in stock' || s === 'disponible';
}

async function loadData() {
    productGrid.innerHTML = `<div class="loader">${currentLang === 'en' ? 'Loading catalog...' : 'Cargando catálogo...'}</div>`;
    
    const results = await Promise.allSettled([
        fetchCSV(GIDS[currentLang].products),
        fetchCSV(GIDS[currentLang].info),
        fetchCSV(GIDS.master)
    ]);

    let masterData = [];
    if (results[2].status === 'fulfilled') {
        masterData = parseMasterSheet(results[2].value);
    }

    if (results[0].status === 'fulfilled') {
        parseProducts(results[0].value, masterData);
    }

    if (results[1].status === 'fulfilled') {
        parseInstructions(results[1].value);
    }
    
    renderCategories();
    renderProducts();
    updateStaticText();
}

async function fetchCSV(gid) {
    const response = await fetch(`${BASE_URL}&gid=${gid}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.text();
}

let lastUpdated = '';

function parseMasterSheet(csvText) {
    const lines = splitCSV(csvText);
    const headerRowIndex = lines.findIndex(l => l.some(cell => cell.toLowerCase().includes('product') || cell.toLowerCase().includes('producto')));
    if (headerRowIndex === -1) return [];

    const headers = lines[headerRowIndex].map(h => h.toLowerCase().trim());
    const dataLines = lines.slice(headerRowIndex + 1);

    return dataLines
        .filter(line => line[0])
        .map(line => {
            const p = {};
            headers.forEach((h, i) => {
                const key = h.replace(/\s+/g, '');
                if (key.includes('product') || key.includes('producto')) p.product = line[i];
                else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
                else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
                else if (key.includes('status') || key.includes('estado')) p.status = line[i];
                else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
                else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
                else if (key.includes('coa')) p.coaUrl = line[i];
                else if (key.includes('image') || key.includes('imagen') || key.includes('photo') || key.includes('foto')) p.imageUrl = line[i];
            });
            return p;
        });
}

function parseProducts(csvText, masterData) {
    const lines = splitCSV(csvText);
    
    // Find Last Updated
    const dateRow = lines.find(l => l[0]?.toLowerCase().includes('last updated') || l[0]?.toLowerCase().includes('última actualización'));
    if (dateRow) lastUpdated = dateRow[1] || '';

    const headerRowIndex = lines.findIndex(l => l.some(cell => cell.toLowerCase().includes('product') || cell.toLowerCase().includes('producto')));
    
    let childProducts = [];
    if (headerRowIndex !== -1) {
        const headers = lines[headerRowIndex].map(h => h.toLowerCase().trim());
        const dataLines = lines.slice(headerRowIndex + 1);
        childProducts = dataLines
            .filter(line => line[0] && line[1]) 
            .map(line => {
                const p = {};
                headers.forEach((h, i) => {
                    const key = h.replace(/\s+/g, '');
                    if (key.includes('product') || key.includes('producto')) p.product = line[i];
                    else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
                    else if (key.includes('usd')) p.priceUsd = line[i];
                    else if (key.includes('crc')) p.priceCrc = line[i];
                    else if (key.includes('discount') || key.includes('volumen') || key.includes('bulk')) p.discount = line[i];
                    else if (key.includes('status') || key.includes('estado')) p.status = line[i];
                    else if (key.includes('coa')) p.coaText = line[i];
                    else if (key.includes('image') || key.includes('imagen') || key.includes('photo') || key.includes('foto')) p.imageUrl = line[i];
                    else p[key] = line[i];
                });
                return p;
            });
    }

    categories.clear();
    allProducts = [];

    if (masterData && masterData.length > 0) {
        masterData.forEach(masterProd => {
            const name = masterProd.product || '';
            if (!name) return;

            const childMatch = childProducts.find(cp => cp.product?.toLowerCase().trim() === name.toLowerCase().trim());
            const p = {};

            p.product = name;
            
            if (childMatch) {
                p.category = childMatch.category || masterProd.category;
                p.priceUsd = childMatch.priceUsd || masterProd.priceUsd;
                p.priceCrc = childMatch.priceCrc;
                p.discount = childMatch.discount;
                p.status = childMatch.status || masterProd.status;
                p.coa = masterProd.coaUrl || childMatch.coaText || '';
                p.imageUrl = childMatch.imageUrl || masterProd.imageUrl || '';
            } else {
                const masterCat = masterProd.category || '';
                if (currentLang === 'es') {
                    p.category = CATEGORY_TRANSLATIONS[masterCat] || masterCat;
                } else {
                    p.category = masterCat;
                }

                p.priceUsd = masterProd.priceUsd || '';
                
                const usdNum = parsePrice(masterProd.priceUsd);
                const exchangeRate = 454.48;
                const calculatedCrc = Math.round(usdNum * exchangeRate);
                p.priceCrc = calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '';

                p.discount = currentLang === 'es' ? (masterProd.bulkDiscountEs || '') : (masterProd.bulkDiscountEn || '');

                const masterStatus = (masterProd.status || '').toLowerCase().trim();
                if (STATUS_TRANSLATIONS[currentLang] && STATUS_TRANSLATIONS[currentLang][masterStatus]) {
                    p.status = STATUS_TRANSLATIONS[currentLang][masterStatus];
                } else {
                    p.status = masterProd.status || '';
                }

                p.coa = masterProd.coaUrl || '';
                p.imageUrl = masterProd.imageUrl || '';
            }

            p.emoji = getEmojiForCategory(p.category || '');
            if (p.category) categories.add(p.category);
            allProducts.push(p);
        });
    } else {
        childProducts.forEach(cp => {
            cp.emoji = getEmojiForCategory(cp.category || '');
            if (cp.category) categories.add(cp.category);
            cp.coa = cp.coaText || '';
            allProducts.push(cp);
        });
    }
}

function parseInstructions(csvText) {
    const lines = splitCSV(csvText);
    instructions = lines
        .filter(l => l[0] && l[0].length > 5)
        .map(l => `<p>${l[0]}</p>`)
        .join('');
}

function splitCSV(csvText) {
    return csvText.split('\n').map(line => {
        const result = [];
        let startValueIndex = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') inQuotes = !inQuotes;
            if (line[i] === ',' && !inQuotes) {
                result.push(line.substring(startValueIndex, i).replace(/^"|"$/g, '').trim());
                startValueIndex = i + 1;
            }
        }
        result.push(line.substring(startValueIndex).replace(/^"|"$/g, '').trim());
        return result;
    });
}

function getEmojiForCategory(cat) {
    const c = cat.toLowerCase();
    if (c.includes('weight') || c.includes('peso')) return '⚖️';
    if (c.includes('sleep') || c.includes('sueño')) return '🌙';
    if (c.includes('sexual')) return '🔥';
    if (c.includes('skin') || c.includes('piel')) return '✨';
    if (c.includes('immune') || c.includes('inmune')) return '🛡️';
    if (c.includes('supply') || c.includes('suministro')) return '💧';
    if (c.includes('brain') || c.includes('cerebro')) return '🧠';
    if (c.includes('muscle') || c.includes('músculo')) return '💪';
    return '💊';
}

function renderCategories() {
    const cats = Array.from(categories).sort();
    const allLabel = currentLang === 'en' ? 'All Products' : 'Todos los Productos';
    let html = `<button class="cat-chip ${currentCategory === 'all' ? 'active' : ''}" data-category="all">${allLabel}</button>`;
    cats.forEach(cat => {
        html += `<button class="cat-chip ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</button>`;
    });
    categoryNav.innerHTML = html;

    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.onclick = () => {
            currentCategory = chip.dataset.category;
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderProducts();
        };
    });
}

function renderProducts() {
    let filtered = allProducts.filter(p => {
        const name = p.product || '';
        const category = p.category || '';
        const status = p.status || '';
        const inStock = isInStock(status);
        
        // 1. Category Filter
        const matchesCat = currentCategory === 'all' || category === currentCategory;
        if (!matchesCat) return false;

        // 2. Search Filter
        const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        // 3. Stock Filter
        if (filterState.inStockOnly && !inStock) return false;

        // 4. Price Filter
        if (filterState.price !== 'all') {
            const priceVal = parsePrice(currentCurrency === 'USD' ? p.priceUsd : p.priceCrc);
            if (currentCurrency === 'USD') {
                if (filterState.price === 'low' && priceVal >= 100) return false;
                if (filterState.price === 'mid' && (priceVal < 100 || priceVal > 200)) return false;
                if (filterState.price === 'high' && priceVal <= 200) return false;
            } else {
                if (filterState.price === 'low' && priceVal >= 55000) return false;
                if (filterState.price === 'mid' && (priceVal < 55000 || priceVal > 110000)) return false;
                if (filterState.price === 'high' && priceVal <= 110000) return false;
            }
        }

        return true;
    });

    // 5. Sorting
    if (filterState.sort === 'pop') {
        // Default (Popularity)
        // If category is selected, prioritize stock
        if (currentCategory !== 'all') {
            filtered = [...filtered].sort((a, b) => {
                const inStockA = isInStock(a.status);
                const inStockB = isInStock(b.status);
                if (inStockA && !inStockB) return -1;
                if (!inStockA && inStockB) return 1;
                return 0; // preserve original spreadsheet order
            });
        }
    } else {
        filtered = [...filtered].sort((a, b) => {
            const priceA = parsePrice(currentCurrency === 'USD' ? a.priceUsd : a.priceCrc);
            const priceB = parsePrice(currentCurrency === 'USD' ? b.priceUsd : b.priceCrc);
            return filterState.sort === 'lowToHigh' ? priceA - priceB : priceB - priceA;
        });
    }

    const emptyMsg = currentLang === 'en' ? 'No products found.' : 'No se encontraron productos.';
    if (filtered.length === 0) {
        productGrid.innerHTML = `<div class="loader">${emptyMsg}</div>`;
        return;
    }

    productGrid.innerHTML = filtered.map(p => {
        const name = p.product || '';
        const category = p.category || '';
        const priceUsd = p.priceUsd || '';
        const priceCrc = p.priceCrc || '';
        const discount = p.discount || '';
        const status = p.status || '';
        const imageUrl = p.imageUrl || '';
        const inStock = isInStock(status);

        const cardClass = inStock ? 'product-card' : 'product-card card-out-of-stock';
        const imageOverlay = inStock ? '' : `<div class="out-of-stock-overlay"><span>${currentLang === 'en' ? 'OUT OF STOCK' : 'AGOTADO'}</span></div>`;

        return `
        <div class="${cardClass}" onclick="openProductDetail('${name.replace(/'/g, "\\'")}')">
            <div class="product-image">
                ${imageUrl ? `<img src="${imageUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">` : p.emoji}
                ${imageOverlay}
            </div>
            <div class="product-info">
                <div class="product-category">${category}</div>
                <h3 class="product-name">${name}</h3>
                <div class="product-pricing">
                    <span class="price-main">${currentCurrency === 'USD' ? priceUsd : priceCrc}</span>
                    <span class="price-sub">${currentCurrency === 'USD' ? priceCrc : priceUsd}</span>
                </div>
                ${discount ? `<div class="discount-badge">${discount}</div>` : ''}
                <div class="stock-badge ${inStock ? 'stock-in' : 'stock-out'}">
                    ${status}
                </div>
            </div>
        </div>
    `}).join('');
}

function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const clean = priceStr.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
}

function updateStaticText() {
    const texts = {
        en: {
            title: 'Peptides Costa Rica',
            searchPlaceholder: 'Search products...',
            howToOrder: 'How to Order',
            contact: 'Contact WhatsApp',
            updated: 'Last Updated',
            price: 'Price',
            sort: 'Sort',
            inStock: 'In Stock Only',
            anyPrice: 'Any Price',
            low: 'Economic',
            mid: 'Mid Range',
            high: 'Premium',
            pop: 'Most Popular',
            lowHigh: 'Price: Low to High',
            highLow: 'Price: High to Low'
        },
        es: {
            title: 'Péptidos Costa Rica',
            searchPlaceholder: 'Buscar productos...',
            howToOrder: 'Cómo Ordenar',
            contact: 'Contactar WhatsApp',
            updated: 'Última Actualización',
            price: 'Precio',
            sort: 'Ordenar',
            inStock: 'Solo disponibles',
            anyPrice: 'Cualquier precio',
            low: 'Económicos',
            mid: 'Gama Media',
            high: 'Premium',
            pop: 'Más populares',
            lowHigh: 'Precio: Bajo a Alto',
            highLow: 'Precio: Alto a Bajo'
        }
    };
    const t = texts[currentLang];
    document.querySelector('.logo h1').innerText = t.title;
    searchInput.placeholder = t.searchPlaceholder;
    document.getElementById('viewHowToOrder').innerText = t.howToOrder;
    document.querySelector('.footer-links a:last-child').innerText = t.contact;
    document.querySelector('.footer-links a:last-child').href = `https://wa.me/${WHATSAPP_NUMBER}`;

    // Filter labels
    document.getElementById('labelPriceRange').innerText = t.price;
    document.getElementById('labelSort').innerText = t.sort;
    document.getElementById('labelInStockOnly').innerText = t.inStock;
    
    // Select options
    const pf = document.getElementById('priceFilter');
    if (pf) {
        pf.options[0].text = t.anyPrice;
        pf.options[1].text = t.low;
        pf.options[2].text = t.mid;
        pf.options[3].text = t.high;
    }
    const so = document.getElementById('sortOrder');
    if (so) {
        so.options[0].text = t.pop;
        so.options[1].text = t.lowHigh;
        so.options[2].text = t.highLow;
    }
    
    if (lastUpdated) {
        let dateEl = document.querySelector('.last-updated');
        if (!dateEl) {
            dateEl = document.createElement('div');
            dateEl.className = 'last-updated container';
            const mainEl = document.querySelector('.main');
            if (mainEl && productGrid) {
                mainEl.insertBefore(dateEl, productGrid);
            }
        }
        dateEl.innerText = `${t.updated}: ${lastUpdated}`;
    }
}

window.openProductDetail = (productName) => {
    const p = allProducts.find(prod => prod.product === productName);
    if (!p) return;

    const name = p.product || '';
    const category = p.category || '';
    const priceUsd = p.priceUsd || '';
    const priceCrc = p.priceCrc || '';
    const discount = p.discount || '';
    const status = p.status || '';
    const coa = p.coa || '';
    const imageUrl = p.imageUrl || '';
    const inStock = isInStock(status);

    const orderText = currentLang === 'en' ? "I'm interested in" : "Estoy interesado en";
    const btnText = currentLang === 'en' ? "Order via WhatsApp" : "Ordenar por WhatsApp";

    modalBody.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="margin-bottom: 12px; display: flex; justify-content: center;">
                <div class="product-image" style="width: 120px; height: 120px; font-size: 60px;">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 20px;">` : p.emoji}
                </div>
            </div>
            <div class="product-category" style="color: var(--text-primary);">${category}</div>
            <h2 style="font-size: 1.5rem; color: var(--text-main); font-weight: 800;">${name}</h2>
        </div>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem;">${currentLang === 'en' ? 'PRICE' : 'PRECIO'}</span>
                <span style="font-size: 1.4rem; font-weight: 900; color: var(--text-primary);">${currentCurrency === 'USD' ? priceUsd : priceCrc}</span>
            </div>
            ${discount ? `
                <div style="color: var(--accent); font-weight: 800; font-size: 0.85rem; text-align: right;">
                    ✨ ${discount}
                </div>
            ` : ''}
        </div>

        <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">${currentLang === 'en' ? 'Status' : 'Estado'}</span>
            <div class="stock-badge ${inStock ? 'stock-in' : 'stock-out'}" style="position: static;">
                ${status}
            </div>
        </div>

        ${coa && coa !== '—' && coa !== '' ? `
            <a href="${coa.startsWith('http') ? coa : '#'}" target="_blank" style="display: block; text-align: center; color: var(--text-primary); font-weight: 800; margin-bottom: 24px; text-decoration: none; font-size: 0.85rem;">
                📄 ${currentLang === 'en' ? 'View Certificate of Analysis' : 'Ver Certificado de Análisis'}
            </a>
        ` : ''}

        <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${orderText} ${encodeURIComponent(name)}" 
           target="_blank" 
           class="whatsapp-btn">
            ${btnText}
        </a>
    `;
    productModal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.showHowToOrder = () => {
    modalBody.innerHTML = `
        <h2 style="margin-bottom: 20px; color: var(--text-primary); font-size: 1.5rem; font-weight: 900;">${currentLang === 'en' ? 'How to Order' : 'Cómo Ordenar'}</h2>
        <div class="instructions-content" style="line-height: 1.6; color: var(--text-main); font-size: 0.95rem;">
            ${instructions}
        </div>
        <a href="https://wa.me/${WHATSAPP_NUMBER}" 
            target="_blank" 
            class="whatsapp-btn" style="margin-top: 30px;">
            ${currentLang === 'en' ? 'Chat with Support' : 'Chatear con Soporte'}
        </a>
    `;
    productModal.classList.add('active');
    document.body.style.overflow = 'hidden';
};

function setupEventListeners() {
    searchInput.oninput = (e) => {
        searchQuery = e.target.value;
        renderProducts();
    };

    toggleUSD.onclick = () => {
        currentCurrency = 'USD';
        toggleUSD.classList.add('active');
        toggleCRC.classList.remove('active');
        renderProducts();
    };

    toggleCRC.onclick = () => {
        currentCurrency = 'CRC';
        toggleCRC.classList.add('active');
        toggleUSD.classList.remove('active');
        renderProducts();
    };

    document.getElementById('viewHowToOrder').onclick = (e) => {
        e.preventDefault();
        showHowToOrder();
    };

    const langEn = document.getElementById('langEn');
    const langEs = document.getElementById('langEs');
    if (langEn && langEs) {
        langEn.onclick = () => {
            if (currentLang === 'en') return;
            currentLang = 'en';
            currentCurrency = 'USD';
            updateSelectorUI();
            loadData();
        };
        langEs.onclick = () => {
            if (currentLang === 'es') return;
            currentLang = 'es';
            currentCurrency = 'CRC';
            updateSelectorUI();
            loadData();
        };
    }
    
    // Theme Toggle
    const themeLight = document.getElementById('themeLight');
    const themeDark = document.getElementById('themeDark');
    if (themeLight && themeDark) {
        themeLight.onclick = () => {
            currentTheme = 'light';
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            updateSelectorUI();
        };
        themeDark.onclick = () => {
            currentTheme = 'dark';
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            updateSelectorUI();
        };
    }

    // Filter Events
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    const priceFilter = document.getElementById('priceFilter');
    const sortOrder = document.getElementById('sortOrder');
    const inStockOnly = document.getElementById('inStockOnly');

    if (filterToggle) {
        filterToggle.onclick = () => {
            filterToggle.classList.toggle('active');
            filterPanel.classList.toggle('active');
        };
    }

    if (viewToggle) {
        viewToggle.onclick = () => {
            if (viewMode === 'list') viewMode = 'compact';
            else if (viewMode === 'compact') viewMode = 'grid';
            else viewMode = 'list';
            
            localStorage.setItem('viewMode', viewMode);
            productGrid.classList.remove('list-view', 'compact-view', 'grid-view');
            productGrid.classList.add(`${viewMode}-view`);
            
            if (viewMode === 'list') viewToggle.innerHTML = '<span>𝌸</span>';
            else if (viewMode === 'compact') viewToggle.innerHTML = '<span>≣</span>';
            else viewToggle.innerHTML = '<span>▦</span>';
        };
    }

    if (priceFilter) {
        priceFilter.onchange = (e) => {
            filterState.price = e.target.value;
            renderProducts();
        };
    }

    if (sortOrder) {
        sortOrder.onchange = (e) => {
            filterState.sort = e.target.value;
            renderProducts();
        };
    }

    if (inStockOnly) {
        inStockOnly.onchange = (e) => {
            filterState.inStockOnly = e.target.checked;
            renderProducts();
        };
    }

    closeModal.onclick = () => {
        productModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    };

    window.onclick = (e) => {
        if (e.target === productModal) {
            productModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    };
}

init();
