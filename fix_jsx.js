const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

// Fix CartsManager
code = code.replace(
  /handleDeleteCart=\{handleDeleteCart\}\n\s*\/>\n\s*\)\}/g,
  "handleDeleteCart={handleDeleteCart}\n          />\n          )\n        )}"
);

// Fix CustomersCRM
code = code.replace(
  /onWhatsAppClick=\{\(recipient\) => openWhatsAppComposer\(recipient\)\} \n\s*\/>\n\s*<\/div>/g,
  "onWhatsAppClick={(recipient) => openWhatsAppComposer(recipient)} \n            />\n            )}\n          </div>"
);

// Fix Reviews
// Reviews was inline.
// Original: {activeTab === 'reviews' && ( <div className="admin-orders-tab"> ... </div> )}
// I replaced `{activeTab === 'reviews' && ( <div className="admin-orders-tab">`
// with `... loadingReviews ? (...) : ( <div className="admin-orders-tab">`
// So it needs `)` before the final `)}` of the reviews block.
// Let's find the end of the reviews block.
code = code.replace(
  /          <\/div>\n        \)\}\n\n        \{\/\* TAB: FACEBOOK MESSENGER \*\/\}/g,
  "          </div>\n          )\n        )}\n\n        {/* TAB: FACEBOOK MESSENGER */}"
);

// Fix Facebook
// Original: {activeTab === 'facebook' && ( <div className="admin-orders-tab admin-tab-panel"> ... </div> )}
// Needs `)` before `)}`
code = code.replace(
  /          <\/div>\n        \)\}\n\n        \{\/\* TAB: EMAIL MARKETING STUDIO \*\/\}/g,
  "          </div>\n          )\n        )}\n\n        {/* TAB: EMAIL MARKETING STUDIO */}"
);

fs.writeFileSync('src/app/admin/page.js', code);
console.log("Fixed JSX syntax errors.");
