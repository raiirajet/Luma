import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {estimateOfficialImport, officialDestination} from '../borderless-official.js';
import {RELEASE_TRANSLATIONS} from '../release-i18n.js';

const data = JSON.parse(readFileSync(new URL('../shared/borderless/official-import-data.json', import.meta.url)));
const destinations = {
  AL: 20, TR: 20, GR: 24, RS: 20, SI: 22, XK: 18, MK: 18,
  HR: 25, BA: 17, ME: 21, BG: 20, RO: 21, CH: 8.1
};
const get = country => officialDestination(data, country);
const estimate = (country, values = {}) => estimateOfficialImport(get(country), values);

test('every Borderless destination has a validated standard VAT rate and official links', () => {
  assert.deepEqual(Object.keys(data.destinations).sort(), Object.keys(destinations).sort());
  for (const [country, rate] of Object.entries(destinations)) {
    const entry = get(country);
    assert.ok(entry, country);
    assert.equal(entry.vatRate, rate);
    assert.match(entry.vatSource, /^https:\/\//);
    assert.match(entry.customsSource, /^https:\/\//);
    const amounts = estimate(country, {vatApplicable: true, vatBasis: 1000});
    assert.equal(amounts.vat, rate * 10);
  }
  assert.equal(get('US'), null);
  assert.equal(officialDestination({ ...data, schemaVersion: 2 }, 'AL'), null);
});

test('unknown values stay open and never produce a complete total', () => {
  const values = estimate('XK', {price: 5000, transport: 400, vatBasis: 6000});
  assert.equal(values.subtotal, 5400);
  assert.equal(values.customs, null);
  assert.equal(values.vat, null);
  assert.equal(values.registration, null);
  assert.equal(values.complete, false);
  assert.equal(estimate('XK', {vatApplicable: false}).vat, 0);
  assert.equal(estimate('XK', {vatApplicable: true, vatBasis: ''}).vat, null);
  assert.equal(estimate('XK', {transport: -10}).transport, null);
});

test('confirmed standard-duty bases, customs-free routes and custom amounts are distinct', () => {
  assert.equal(estimate('BA', {customsBasis: 10000}).customs, null);
  assert.equal(estimate('BA', {customsBasis: 10000, useCustomsRate: true}).customs, 1500);
  assert.equal(estimate('MK', {customsBasis: 10000, useCustomsRate: true}).customs, 500);
  assert.equal(estimate('MK', {customs: 0, customsBasis: 10000, useCustomsRate: true}).customs, 0);
  assert.equal(estimate('HR').customs, null);
  assert.equal(estimate('HR', {euCirculation: true}).customs, 0);
  assert.equal(estimate('XK', {euCirculation: true}).customs, null);
  assert.equal(estimate('AL').customs, 0);
});

test('Swiss automobile tax and VAT use their own confirmed bases', () => {
  const amounts = estimate('CH', {
    price: 20000, transport: 500, vatApplicable: true, vehicleTaxBasis: 20500,
    vatBasis: 21320, otherCharges: 0, registration: 200
  });
  assert.equal(amounts.vehicleTax, 820);
  assert.equal(amounts.vat, 1726.92);
  assert.equal(amounts.subtotal, 23246.92);
  assert.equal(amounts.complete, true);
});

test('website and Android use the same complete localized text', () => {
  const asset = new URL('../android/app/src/main/assets/release-i18n.json', import.meta.url);
  const android = JSON.parse(readFileSync(asset));
  assert.deepEqual(android, RELEASE_TRANSLATIONS);
  for (const [locale, labels] of Object.entries(android)) {
    assert.ok(labels.officialMode && labels.officialNeedsInput && labels.officialFxSource, locale);
  }
});
