const { HttpsError } = require('firebase-functions/v2/https');
const { inputObject } = require('./model');

const MAX_RESULTS = 12;
const MAX_QUERY_LENGTH = 90;
const EARTH_RADIUS_KM = 6371.0087714;
let catalog;

function normalizePlaceName(value) {
  return value.trim().normalize('NFKD').toLowerCase()
    .replace(/\p{M}/gu, '').replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function getCatalog() {
  if (catalog) return catalog;
  const { places } = require('./data/listing-places.json');
  const byId = new Map();
  const byCountry = new Map();
  const legacyMatches = new Map();
  for (const [country, rows] of Object.entries(places)) {
    const records = [];
    const matches = new Map();
    byCountry.set(country, records);
    legacyMatches.set(country, matches);
    for (const [sourceId, name, region, lat, lon, population, aliases] of rows) {
      const id = `gn-${sourceId}`;
      const place = Object.freeze({ id, name, country, region, lat, lon });
      const keys = [...new Set([name, ...aliases].map(normalizePlaceName).filter(Boolean))];
      byId.set(id, place);
      records.push({ place, population, keys });
      for (const key of keys) {
        matches.set(key, matches.has(key) ? null : place);
      }
    }
  }
  catalog = { byId, byCountry, legacyMatches };
  return catalog;
}

function isSupportedCountry(country) {
  return getCatalog().byCountry.has(country);
}

function findListingPlace(placeId) {
  return getCatalog().byId.get(placeId);
}

function matchLegacyListingPlace(city, country) {
  if (typeof city !== 'string') return undefined;
  return getCatalog().legacyMatches.get(country)?.get(normalizePlaceName(city)) ?? undefined;
}

function searchRank(query, keys) {
  if (keys[0] === query) return 0;
  if (keys.includes(query)) return 1;
  if (keys[0].startsWith(query)) return 2;
  if (keys.some(key => key.startsWith(query))) return 3;
  if (keys.some(key => key.split(' ').some(word => word.startsWith(query)))) return 4;
  return undefined;
}

function publicPlace({ id, name, country, region }) {
  return { id, name, country, region };
}

function lookupListingPlacesHandler() {
  return async request => {
    const { query, country } = inputObject(request.data);
    if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
      throw new HttpsError('invalid-argument', 'Invalid location search.');
    }
    if (country !== undefined && country !== '' && !isSupportedCountry(country)) {
      throw new HttpsError('invalid-argument', 'Invalid location country.');
    }
    const normalizedQuery = normalizePlaceName(query);
    if (normalizedQuery.length < 2) return { places: [] };

    const { byCountry } = getCatalog();
    const records = country ? [byCountry.get(country)] : byCountry.values();
    const matches = [];
    for (const group of records) {
      for (const { place, population, keys } of group) {
        const rank = searchRank(normalizedQuery, keys);
        if (rank !== undefined) matches.push({ place, population, rank });
      }
    }
    matches.sort((a, b) => a.rank - b.rank || b.population - a.population || a.place.id.localeCompare(b.place.id, 'en'));
    return { places: matches.slice(0, MAX_RESULTS).map(match => publicPlace(match.place)) };
  };
}

function listingDistanceKm(place, center) {
  if (![place?.lat, place?.lon, center?.lat, center?.lon].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const latitudeDistance = (place.lat - center.lat) * radians;
  const longitudeDistance = (place.lon - center.lon) * radians;
  const haversine = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(center.lat * radians) * Math.cos(place.lat * radians) * Math.sin(longitudeDistance / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function isWithinListingRadius(place, center, km) {
  if (!Number.isFinite(km) || km <= 0) return false;
  const distance = listingDistanceKm(place, center);
  return distance !== null && distance <= km;
}

module.exports = {
  findListingPlace, isSupportedCountry, isWithinListingRadius, listingDistanceKm,
  lookupListingPlacesHandler, matchLegacyListingPlace,
};
