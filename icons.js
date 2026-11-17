// Source-controlled, scalable outline icons for Luma Auto. Every icon is a real SVG path.
export function icon(name, cls = '') {
  const safe = String(name).replace(/[^a-z0-9_]/g, '');
  return `<svg class="ui-icon ${cls}" aria-hidden="true" focusable="false"><use href="#luma-icon-${safe}"></use></svg>`;
}