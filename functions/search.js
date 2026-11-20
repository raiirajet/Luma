const { HttpsError } = require('firebase-functions/v2/https');
const { inputObject, inputText } = require('./model');
const { findListingPlace, isSupportedCountry, isWithinListingRadius, matchLegacyListingPlace } = require('./listing-places');

const FILTER_LENGTHS = {
  keyword: 120, make: 35, model: 65, priceTo: 12, yearFrom: 4, mileageTo: 12,
  fuel: 16, transmission: 16, body: 16, sellerType: 20, priceFrom: 12, yearTo: 4,
  mileageFrom: 12, powerFrom: 10, powerTo: 10, engineTerm: 80, capacityFrom: 10, capacityTo: 10,
};
const RANGE_FILTERS = {
  price: ['priceFrom', 'priceTo'],
  year: ['yearFrom', 'yearTo'],
  mileage: ['mileageFrom', 'mileageTo'],
  power: ['powerFrom', 'powerTo'],
  engineCapacity: ['capacityFrom', 'capacityTo'],
};
const NUMBER_FIELDS = new Set(Object.values(RANGE_FILTERS).flat());
const EXACT_FILTERS = ['body', 'fuel', 'transmission', 'sellerType'];

function normalizeSearch(data) {
  const name = inputText(data.name, 120, 'search name');
  return { name, ...normalizeSearchCriteria(data) };
}

function normalizeSearchCriteria(data) {
  const supplied = inputObject(data.filters);
  if (Object.keys(supplied).some(field => !Object.hasOwn(FILTER_LENGTHS, field))) {
    throw new HttpsError('invalid-argument', 'Unknown search filter.');
  }
  const filters = {};
  for (const [field, maxLength] of Object.entries(FILTER_LENGTHS)) {
    const raw = Object.hasOwn(supplied, field) ? supplied[field] : '';
    if (typeof raw !== 'string' || raw.length > maxLength) {
      throw new HttpsError('invalid-argument', 'Invalid search filter.');
    }
    const value = raw.trim();
    if (value && NUMBER_FIELDS.has(field) && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new HttpsError('invalid-argument', 'Invalid search range.');
    }
    filters[field] = value;
  }
  if (!Array.isArray(data.countries) || data.countries.length > 12 ||
      data.countries.some(country => !isSupportedCountry(country))) {
    throw new HttpsError('invalid-argument', 'Invalid search countries.');
  }
  const criteria = { filters, countries: [...new Set(data.countries)].sort() };
  // Keep the saved-alert hash stable for searches that predate location filters.
  if (data.radius != null) {
    const radius = inputObject(data.radius);
    const { placeId, km } = radius;
    if (Object.keys(radius).some(key => key !== 'placeId' && key !== 'km') ||
        !findListingPlace(placeId) || !Number.isInteger(km) || km < 1 || km > 500) {
      throw new HttpsError('invalid-argument', 'Select a location and a radius from 1 to 500 km.');
    }
    criteria.radius = { placeId, km };
  }
  return criteria;
}

function normalizeMake(value) {
  return String(value ?? '').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s._’'\-]+/g, ' ').toLocaleLowerCase('en');
}

// Keep aliases consistent with the public make picker in car-brands.js.
const MAKE_ALIASES = new Map([
  ['mercedes', 'mercedes benz'], ['vw', 'volkswagen'], ['mini cooper', 'mini'],
  ['landrover', 'land rover'], ['gtr', 'nissan'], ['ssang yong', 'ssangyong'],
]);

function normalizeListingMake(value) {
  const normalized = normalizeMake(value);
  return MAKE_ALIASES.get(normalized) ?? normalized;
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase();
}

function listingSearchText(listing) {
  return normalizeSearchText([listing.title, listing.make, listing.model, listing.modelExtension, listing.city,
    listing.description, listing.serviceHistory, listing.modificationNotes].join(' '));
}

function listingSearchPlace(listing) {
  if (!listing.placeId) return matchLegacyListingPlace(listing.city, listing.country);
  const place = findListingPlace(listing.placeId);
  if (!place || place.country !== listing.country) return undefined;
  const nameMatches = place.name === listing.city || matchLegacyListingPlace(listing.city, listing.country)?.id === place.id;
  return nameMatches ? place : undefined;
}

function listingSearchNumber(listing, field) {
  const raw = listing[field];
  const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
  return Number.isFinite(value) && (field !== 'engineCapacity' || value > 0) ? value : undefined;
}

function matchesSearch(listing, { filters, countries, radius }) {
  if (countries.length > 0 && !countries.includes(listing.country)) return false;
  const { keyword, make, model, engineTerm } = filters;
  if (keyword && !listingSearchText(listing).includes(normalizeSearchText(keyword))) return false;
  if (make && !normalizeListingMake(listing.make).includes(normalizeListingMake(make))) return false;
  if (model && !normalizeMake(listing.model).includes(normalizeMake(model))) return false;
  if (engineTerm && !normalizeSearchText(listing.engineName).includes(normalizeSearchText(engineTerm))) {
    return false;
  }

  for (const field of EXACT_FILTERS) {
    if (filters[field] && filters[field] !== listing[field]) return false;
  }
  for (const [field, [min, max]] of Object.entries(RANGE_FILTERS)) {
    if (!filters[min] && !filters[max]) continue;
    const value = listingSearchNumber(listing, field);
    if (value === undefined) return false;
    if (filters[min] && value < Number(filters[min])) return false;
    if (filters[max] && value > Number(filters[max])) return false;
  }
  return !radius || isWithinListingRadius(listingSearchPlace(listing), findListingPlace(radius.placeId), radius.km);
}

module.exports = {
  EXACT_FILTERS, RANGE_FILTERS, matchesSearch, normalizeSearch, normalizeSearchCriteria, normalizeMake,
  normalizeListingMake, normalizeSearchText, listingSearchText, listingSearchPlace, listingSearchNumber,
};
