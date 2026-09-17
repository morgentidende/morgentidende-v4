(() => {
  const input = document.getElementById('key');
  const toggle = document.getElementById('toggle-key');
  const slash = document.getElementById('eye-slash');
  if (!(input instanceof HTMLInputElement) || !(toggle instanceof HTMLButtonElement)) return;

  const syncIcon = () => {
    const showing = input.type === 'text';
    if (slash instanceof SVGElement) slash.style.display = showing ? 'none' : '';
    const label = showing ? 'Skjul testnøgle' : 'Vis testnøgle';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    toggle.setAttribute('aria-pressed', showing ? 'true' : 'false');
  };

  syncIcon();

  toggle.addEventListener('click', () => {
    input.type = input.type === 'text' ? 'password' : 'text';
    syncIcon();
    input.focus();
  });
})();
