// Original 3D Limba icons supplied by the project owner.
// Keep SVG fallback for UI actions without a matching raster icon.
const LIMBA_ICONS = Object.freeze({"home": "home", "search": "search", "heart": "favorites", "settings": "settings", "car": "car", "layers": "vehicle_cards", "sliders": "filter", "info": "info", "arrow_left": "back", "list": "vehicle_cards", "user": "profile", "globe": "location", "bookmark": "notifications", "message": "messages", "messages": "messages", "notification": "notifications", "notifications": "notifications", "profile": "profile", "camera": "camera", "lock": "lock", "security": "security", "map": "map", "location": "location", "add": "add_car", "add_car": "add_car", "vehicle_cards": "vehicle_cards"});
export function icon(name, cls = '') {
 const safe = String(name).replace(/[^a-z0-9_]/g, '');
 const label = String(cls).replace(/[^a-zA-Z0-9_ -]/g, '');
 const raster = LIMBA_ICONS[safe];
 if (raster) return `<img class="ui-icon limba-3d-icon ${label}" src="assets/limba/icons/${raster}.png" alt="" aria-hidden="true" draggable="false">`;
 return `<svg class="ui-icon ${label}" aria-hidden="true" focusable="false"><use href="#luma-icon-${safe}"></use></svg>`;
}