try {
  const preference = JSON.parse(localStorage.getItem('luma_auto_theme'));
  if (preference === 'light' || preference === 'dark') document.documentElement.dataset.theme = preference;
} catch {
  // The automatic CSS theme still works when storage is unavailable.
}
