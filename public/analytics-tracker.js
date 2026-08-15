(function () {
  'use strict';
  var script = document.currentScript;
  var endpoint = (script && script.dataset.endpoint) || 'https://catalog.peptidescostarica.net/api/analytics/track';
  var cookieName = 'pcr_visitor_id';
  var sessionKey = 'pcr_analytics_session_id';
  function id(prefix) {
    var value = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
    return prefix + '_' + value;
  }
  function cookie(name) {
    var found = document.cookie.split(';').map(function (part) { return part.trim(); }).find(function (part) { return part.indexOf(name + '=') === 0; });
    return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
  }
  var visitorId = cookie(cookieName) || localStorage.getItem(cookieName) || id('visitor');
  document.cookie = cookieName + '=' + encodeURIComponent(visitorId) + '; Max-Age=31536000; Path=/; Domain=.peptidescostarica.net; SameSite=Lax; Secure';
  localStorage.setItem(cookieName, visitorId);
  var sessionId = sessionStorage.getItem(sessionKey) || id('session');
  sessionStorage.setItem(sessionKey, sessionId);
  var params = new URLSearchParams(location.search);
  function payload(eventType) {
    return {
      visitorId: visitorId,
      sessionId: sessionId,
      eventType: eventType,
      hostname: location.hostname,
      path: location.pathname + location.search,
      pageTitle: document.title,
      referrer: document.referrer,
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      gclid: params.get('gclid') || '',
      fbclid: params.get('fbclid') || ''
    };
  }
  function send(eventType) {
    fetch(endpoint, { method: 'POST', mode: 'cors', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(eventType)) }).catch(function () {});
  }
  send('page_view');
  setInterval(function () { if (document.visibilityState === 'visible') send('heartbeat'); }, 15000);
})();
