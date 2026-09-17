(() => {
  const input = document.getElementById('key');
  const toggle = document.getElementById('toggle-key');
  if (!(input instanceof HTMLInputElement) || !(toggle instanceof HTMLButtonElement)) return;

  toggle.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    const label = showing ? 'Vis testnøgle' : 'Skjul testnøgle';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    toggle.setAttribute('aria-pressed', showing ? 'false' : 'true');
    input.focus();
  });
})();
