(() => {
  const match = /^\/inserat\/([A-Za-z0-9_-]{1,128})\/?$/.exec(location.pathname);
  if (match) location.replace('/#ad=' + encodeURIComponent(match[1]));
})();
