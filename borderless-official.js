const officialImportPath = 'shared/borderless/official-import-data.json';
let officialImportRequest;

function isStandardRate(rate) {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

function isOfficialLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function officialDestination(data, country) {
  if (data?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.verifiedOn ?? '') ||
      !Object.hasOwn(data.destinations ?? {}, country)) return null;

  const entry = data.destinations[country];
  if (!entry || !isStandardRate(entry.vatRate) || !isOfficialLink(entry.vatSource) ||
      !isOfficialLink(entry.customsSource) || typeof entry.isEu !== 'boolean' ||
      !/^[A-Z]{3}$/.test(entry.currency ?? '')) return null;
  if (entry.customsStandardRate != null && !isStandardRate(entry.customsStandardRate)) return null;
  if (entry.vehicleTaxRate != null &&
      (!isStandardRate(entry.vehicleTaxRate) || !isOfficialLink(entry.vehicleTaxSource))) return null;
  if ([entry.extraSource, entry.fxSource].some(link => link != null && !isOfficialLink(link))) return null;
  return entry;
}

export function loadOfficialImportData() {
  if (officialImportRequest) return officialImportRequest;
  officialImportRequest = Promise.resolve().then(async () => {
    const embedded = document.getElementById('officialImportData');
    if (embedded) return JSON.parse(embedded.textContent);

    const response = await fetch(new URL(officialImportPath, document.baseURI), {cache: 'no-cache'});
    return response.ok ? response.json() : null;
  }).catch(() => {
    // A new selection can retry after a temporary network failure.
    officialImportRequest = undefined;
    return null;
  }).then(data => {
    if (!data) officialImportRequest = undefined;
    return data;
  });
  return officialImportRequest;
}

function importAmount(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function roundImportCents(scaled) {
  return Math.round(scaled + Number.EPSILON * scaled) / 100;
}

function importCharge(basis, rate) {
  const amount = importAmount(basis);
  return amount === null || !isStandardRate(rate) ? null : roundImportCents(amount * rate);
}

export function estimateOfficialImport(destination, inputs) {
  const {
    price, transport, customsBasis, useCustomsRate, vatBasis, vatApplicable,
    vehicleTaxBasis, otherCharges, registration, euCirculation
  } = inputs;
  let customs = importAmount(inputs.customs);
  if (customs === null) {
    if (destination.customsZero === true || (destination.isEu && euCirculation === true)) customs = 0;
    else if (useCustomsRate === true) customs = importCharge(customsBasis, destination.customsStandardRate);
  }

  const amounts = {
    price: importAmount(price),
    transport: importAmount(transport),
    customs,
    vat: vatApplicable === true ? importCharge(vatBasis, destination.vatRate) : vatApplicable === false ? 0 : null,
    vehicleTax: destination.vehicleTaxRate == null ? 0 : importCharge(vehicleTaxBasis, destination.vehicleTaxRate),
    otherCharges: importAmount(otherCharges),
    registration: importAmount(registration)
  };
  const values = Object.values(amounts);
  const subtotal = roundImportCents(values.reduce((sum, amount) => sum + (amount ?? 0), 0) * 100);
  return { ...amounts, subtotal, complete: values.every(amount => amount !== null) };
}
