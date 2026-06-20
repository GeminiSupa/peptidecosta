(function() {
  var container = document.getElementById('costa-peptides-catalog');
  if (!container) {
    console.error('Costa Peptides Widget: Could not find container div with id "costa-peptides-catalog". Please add it to your page.');
    return;
  }

  // Generate iframe
  var iframe = document.createElement('iframe');
  
  // You can set default parameters here if needed, like language
  var widgetUrl = 'https://catalog.peptidescostarica.net/embed/catalog';
  
  iframe.src = widgetUrl;
  iframe.style.width = '100%';
  iframe.style.minHeight = '1200px';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.background = 'transparent';
  iframe.setAttribute('scrolling', 'yes');
  iframe.id = 'costa-peptides-iframe';

  // Clear container and append iframe
  container.innerHTML = '';
  container.appendChild(iframe);

  // Optional: Auto-resize iframe height based on content
  window.addEventListener('message', function(e) {
    // Basic security check (allow costapeptides domains or localhost for testing)
    if (!e.origin.includes('peptidescostarica.net') && !e.origin.includes('localhost')) return;
    
    if (e.data && e.data.type === 'resize' && e.data.height) {
      iframe.style.height = e.data.height + 'px';
      iframe.style.minHeight = 'auto';
    }
  });
})();
