const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  findListingPlace, isSupportedCountry, isWithinListingRadius, listingDistanceKm,
  lookupListingPlacesHandler, matchLegacyListingPlace,
} = require('../listing-places');

const lookup = lookupListingPlacesHandler();

test('gazetteer supports every existing marketplace country', () => {
  for (const country of ['AL', 'BA', 'BG', 'GR', 'HR', 'ME', 'MK', 'RO', 'RS', 'SI', 'TR', 'XK']) {
    assert.equal(isSupportedCountry(country), true, country);
  }
  assert.equal(isSupportedCountry('CH'), false);
});

test('location lookup resolves multilingual aliases to one stable public result', async () => {
  const expected = { id: 'gn-786714', name: 'Pristina', country: 'XK', region: 'Komuna e Prishtinës, Pristina' };
  for (const query of ['Prishtinë', 'Prishtine', 'Приштина']) {
    const { places } = await lookup({ data: { query, country: 'XK' } });
    assert.deepEqual(places[0], expected);
  }
  const istanbul = await lookup({ data: { query: 'İstanbul', country: 'TR' } });
  assert.equal(istanbul.places[0].id, 'gn-745044');
  const athens = await lookup({ data: { query: 'Αθήνα', country: 'GR' } });
  assert.equal(athens.places[0].id, 'gn-264371');
});

test('location lookup handles bounded typeahead, same-name localities and invalid input', async () => {
  const { places } = await lookup({ data: { query: 'Valea Mare', country: 'RO' } });
  assert.equal(places.length, 12);
  assert.notEqual(places[0].region, places[1].region);
  assert.deepEqual(await lookup({ data: { query: 'a' } }), { places: [] });
  await assert.rejects(lookup({ data: { query: 'x'.repeat(91) } }), { code: 'invalid-argument' });
  await assert.rejects(lookup({ data: { query: 'Pristina', country: 'CH' } }), { code: 'invalid-argument' });
});

test('legacy matches stay country-scoped and skip ambiguous and unknown localities', () => {
  assert.equal(matchLegacyListingPlace('Prishtinë', 'XK'), findListingPlace('gn-786714'));
  assert.equal(matchLegacyListingPlace('Prishtinë', 'AL'), undefined);
  assert.equal(matchLegacyListingPlace('Valea Mare', 'RO'), undefined);
  assert.equal(matchLegacyListingPlace('Prish', 'XK'), undefined);
  assert.equal(findListingPlace('gn-0'), undefined);
});

test('radius applies a great circle from the chosen locality', () => {
  const center = findListingPlace('gn-786714');
  const prizren = findListingPlace('gn-786712');
  assert.equal(listingDistanceKm(center, center), 0);
  assert.equal(listingDistanceKm(undefined, center), null);
  assert.ok(Math.abs(listingDistanceKm(prizren, center) - 61) < 2);
  assert.equal(isWithinListingRadius(center, center, 1), true);
  assert.equal(isWithinListingRadius(prizren, center, 50), false);
  assert.equal(isWithinListingRadius(prizren, center, 100), true);
  assert.equal(isWithinListingRadius(undefined, center, 100), false);
});
