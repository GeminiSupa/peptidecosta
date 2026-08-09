export const MAIN_SITE_TIKTOK_PIXEL_ID = 'D9RUF4RC77UA78AD50M0';
export const CATALOG_TIKTOK_PIXEL_ID = 'D9RUIARC77U97D5QFMN0';

const PIXEL_ID_BY_HOSTNAME = Object.freeze({
  'peptidescostarica.net': MAIN_SITE_TIKTOK_PIXEL_ID,
  'www.peptidescostarica.net': MAIN_SITE_TIKTOK_PIXEL_ID,
  'catalog.peptidescostarica.net': CATALOG_TIKTOK_PIXEL_ID,
});

export function getTikTokPixelId(hostname) {
  return PIXEL_ID_BY_HOSTNAME[String(hostname || '').trim().toLowerCase()] || '';
}

export function getTikTokPixelBootstrapScript() {
  const pixelIds = JSON.stringify(PIXEL_ID_BY_HOSTNAME);

  return `!function(w,d,t){
var pixelId=${pixelIds}[String(w.location.hostname||'').toLowerCase()];
if(!pixelId)return;
w.TiktokAnalyticsObject=t;
var ttq=w[t]=w[t]||[];
ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js',o=n&&n.partner;ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement('script');n.type='text/javascript';n.async=!0;n.src=r+'?sdkid='+e+'&lib='+t;e=d.getElementsByTagName('script')[0];e.parentNode.insertBefore(n,e)};
ttq.load(pixelId);
ttq.page();
}(window,document,'ttq');`;
}
