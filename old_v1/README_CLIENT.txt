========================================================================
                  PEPTIDES COSTA RICA - CATALOG WEB APPLICATION
                         CLIENT IMPLEMENTATION DOCUMENT
========================================================================

Dear Peptides Costa Rica Team,

I have successfully completed all requested updates and visual integrations 
for your web catalog application, establishing a seamless brand identity 
matching your official website: https://peptidescostarica.net

Below is a detailed guide outlining the newly implemented design aesthetics,
logic architectures, and features.

------------------------------------------------------------------------
1. BRAND VISUAL IDENTITY & THEME COLOR SYSTEM
------------------------------------------------------------------------
The visual presentation has been meticulously matched to the aesthetics of
your main website:
*   Primary Brand Navy Blue (#002766): Used for dominant text elements, 
    interactive elements, and active UI states.
*   Action & Accent Rust Orange-Red (#C8530C): Styled for key highlights, 
    price ranges, discount badges, and CTA highlights.
*   Clinical Background (#F4F6F9): A smooth, off-white clean background 
    replacing the generic slate grey. Supports a seamless transitions.
*   Connected SVG Molecule Logo: The simple emoji logo has been replaced by 
    a custom inline SVG logo depicting three glowing cyan molecular nodes 
    connected by lines. The nodes feature smooth micro-animations 
    (rotating and expanding) when hovered.
*   Horizontal "OUT OF STOCK" Banner Overlay: 
    When products are unavailable, the image displays a thick horizontal 
    deep navy blue banner (#002766) across the middle with bold white text 
    ("OUT OF STOCK" / "AGOTADO") matching the live website's design. The 
    product card border is faded out to visually prioritize in-stock items.

------------------------------------------------------------------------
2. MASTER INVENTORY DATA SYNC & TRANSLATION ENGINE
------------------------------------------------------------------------
The application logic has been rearchitected to treat the Master Inventory 
Sheet (gid=1590810046) as the absolute source of truth.
*   Automatic Locale Child Sheet Merging: The database builder pulls from 
    the Master sheet first to guarantee that all new and "Coming Soon" 
    products are fully included in the catalog, even if they aren't manually 
    updated in the English or Spanish sub-sheets.
*   Automatic Category Translations: If a product is parsed from the 
    Master Sheet and does not have an translation row in the Spanish sheet,
    the app auto-localizes the category using a custom dictionary, e.g.:
    - "Weight Loss & Metabolism" -> "Pérdida de peso y metabolismo"
    - "Recovery & Healing"       -> "Recuperación y curación"
    - "Sexual Health"            -> "Salud sexual"
*   Dynamic Currency Auto-Conversion: Missing CRC prices for synthesized 
    products are calculated dynamically from USD using a derived exchange 
    rate of 454.48, formatting them cleanly (e.g. ₡56,810).
*   Automatic Status Localizer: Synthesized products translate stock statuses 
    to Spanish ("Disponible", "Agotado", "Próximamente") or English 
    ("In Stock", "Out of Stock", "Coming Soon") dynamically.

------------------------------------------------------------------------
3. LOCALIZATION & CURRENCY OVERRIDES via URL
------------------------------------------------------------------------
To optimize for Costa Rican users while welcoming international buyers, 
I implemented a default localization system with overrides:
*   Default Spanish / CRC: By default, users entering the website see all 
    headings, buttons, categories, and prices in Spanish and CRC (Colones).
*   English Override Link: For English-speaking clients, you can share a 
    custom URL parameter link:
    
    👉 https://yourdomain.com/?lang=en
    
    When clicked, this link automatically overrides all page elements to 
    English and changes the primary currency to USD.

------------------------------------------------------------------------
4. SMART SORTING & stock prioritization
------------------------------------------------------------------------
To maximize conversion rates and help users find what they are looking for 
faster, sorting behaves dynamically:
*   "All Products" Default View: Displays items in the exact original order
    defined in your Google Sheet (placing the most popular items at the top).
*   Category View: When a user clicks on a category bubble, the catalog 
    automatically floats all "Disponible" (In Stock) products to the 
    top, while pushing unavailable products to the bottom. Crucially, the 
    original popularity ranking of products is perfectly preserved within 
    both the in-stock and out-of-stock groups.

------------------------------------------------------------------------
5. DIRECT INTEGRATION WITH WHATSAPP
------------------------------------------------------------------------
All ordering and contact channels are routed directly to your official 
WhatsApp phone line:
*   Official Number: +506 8404-6973 (encoded as 50684046973 in link targets)
*   Interactive Orders: When a user clicks "Order via WhatsApp" inside a 
    product detail modal, the application automatically prepares a pre-filled 
    custom message, e.g.:
    "Estoy interesado en Retatrutide 10mg" (Spanish view) or
    "I'm interested in Retatrutide 10mg" (English view).

------------------------------------------------------------------------
6. HOW THE GOOGLE SHEETS LINKING WORKS
------------------------------------------------------------------------
The front-end code reads the spreadsheets directly using the configuration
located at the very top of main.js (lines 1-6). 

If you ever migrate to a brand new Google Sheet in the future, follow these 
simple instructions:

1. Update the BASE_URL in main.js:
   Change the spreadsheet ID in the URL to your new spreadsheet ID:
   const BASE_URL = 'https://docs.google.com/spreadsheets/d/[NEW_ID]/export?format=csv';

2. Update the Tab GIDs in main.js:
   In your Google Sheet, when you click on a tab, copy the number after
   "gid=" at the end of your browser's address bar and update the GIDS 
   constant:
   const GIDS = {
       en: { products: 'NEW_EN_PRODUCTS_GID', info: 'NEW_EN_INFO_GID' },
       es: { products: 'NEW_ES_PRODUCTS_GID', info: 'NEW_ES_INFO_GID' },
       master: 'NEW_MASTER_INVENTORY_GID'
   };

3. Set Permissions:
   Ensure your new Google Sheet is shared with "Anyone with the link can view" 
   (or "Published to the Web") so the catalog application has permission 
   to fetch the data.

------------------------------------------------------------------------
7. HOW TO DEPLOY & MAINTAIN
------------------------------------------------------------------------
1. Make updates to your Google Spreadsheet as usual. All new items and 
   updated prices will sync automatically.
2. The application is compiled using Vite. If you update the code, run:
   $ npm run build
   The production files will be generated in the /dist directory, ready 
   for direct upload to your production web hosting server.

Thank you for your business! Please let us know if you need any further 
enhancements or revisions.

Best Regards,
Omer Farooq

========================================================================

