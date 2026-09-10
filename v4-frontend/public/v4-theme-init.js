// Apply the saved colour theme before first paint to avoid a light-theme flash.
try {
  const saved = localStorage.getItem('mt-v4-theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
  }
} catch {
  // If storage is unavailable, keep the server-rendered light theme.
}
