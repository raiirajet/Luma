const { HttpsError } = require('firebase-functions/v2/https');
const { inputObject, inputText } = require('./model');

const COUNTRIES = new Set(['AL', 'TR', 'GR', 'RS', 'SI', 'XK', 'MK', 'HR', 'BA', 'ME', 'BG', 'RO']);
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

function normalizeSearch(data) {
  const name = inputText(data.name, 120, 'search name');
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
  if (!Array.isArray(data.countries) || data.countries.length > COUNTRIES.size ||
      data.countries.some(country => !COUNTRIES.has(country))) {
    throw new HttpsError('invalid-argument', 'Invalid search countries.');
  }
  return { name, filters, countries: [...new Set(data.countries)].sort() };
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

function matchesSearch(listing, { filters, countries }) {
  if (countries.length > 0 && !countries.includes(listing.country)) return false;
  const { keyword, make, model, engineTerm } = filters;
  if (keyword) {
    const haystack = [listing.title, listing.make, listing.model, listing.modelExtension, listing.city,
      listing.description, listing.serviceHistory, listing.modificationNotes].join(' ').toLowerCase();
    if (!haystack.includes(keyword.toLowerCase())) return false;
  }
  if (make) {
    const normalizedFilter = normalizeMake(make);
    const normalizedListing = normalizeMake(listing.make);
    const filterMake = MAKE_ALIASES.get(normalizedFilter) ?? normalizedFilter;
    const listingMake = MAKE_ALIASES.get(normalizedListing) ?? normalizedListing;
    if (!listingMake.includes(filterMake)) return false;
  }
  if (model && !normalizeMake(listing.model).includes(normalizeMake(model))) return false;
  if (engineTerm && !String(listing.engineName ?? '').toLowerCase().includes(engineTerm.toLowerCase())) {
    return false;
  }

  for (const field of ['body', 'fuel', 'transmission', 'sellerType']) {
    if (filters[field] && filters[field] !== listing[field]) return false;
  }
  for (const [field, [min, max]] of Object.entries(RANGE_FILTERS)) {
    if (!filters[min] && !filters[max]) continue;
    const value = Number(listing[field]);
    if (!Number.isFinite(value) || (field === 'engineCapacity' && !value)) return false;
    if (filters[min] && value < Number(filters[min])) return false;
    if (filters[max] && value > Number(filters[max])) return false;
  }
  return true;
}

module.exports = { matchesSearch, normalizeSearch };
