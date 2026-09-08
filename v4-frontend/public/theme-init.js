// Apply the saved theme before first paint to avoid a light/dark flash.
try {
  const savedTheme = localStorage.getItem('mt-v4-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch {
  // Keep the server-rendered light theme if storage is unavailable.
}
