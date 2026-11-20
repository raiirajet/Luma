const fieldLimits = {
  make: 35, model: 65, modelExtension: 40, year: 4, mileage: 12,
  fuel: 16, transmission: 16, body: 16, power: 10, engineName: 80, engineCapacity: 10,
  price: 12, sellerType: 20, country: 2, city: 90, placeId: 13,
  condition: 12, accidentStatus: 12, conditionNote: 240, serviceHistory: 500,
  modificationNotes: 500, documentNotes: 240, description: 3000,
  batteryHealth: 16, batteryMeasuredAt: 10, batteryIssuer: 120, batteryUrl: 500,
};

const priceFields = new Set([
  'price', 'sellerType', 'country', 'city', 'placeId', 'description',
]);
const stepLabels = ['draftVehicleStep', 'draftPhotosStep', 'draftPriceStep', 'draftPreviewStep'];

function draftVersion(record) {
  return record ? `${record.draftId}:${record.revision}:${record.state}` : '';
}

function sameFields(first, second) {
  return Object.keys(fieldLimits).every(name => (first[name] ?? '') === (second[name] ?? ''));
}

function draftFields(form) {
  const fields = {};
  for (const [name, limit] of Object.entries(fieldLimits)) {
    const control = form.elements.namedItem(name);
    if (!control || control.closest('fieldset[disabled]')) continue;
    const value = control.value.trim().slice(0, limit);
    if (name !== 'placeId' || /^gn-[0-9]{1,10}$/.test(value)) fields[name] = value;
  }
  return fields;
}

class DraftConflict extends Error {
  constructor(remote) {
    super('The listing draft has changed.');
    this.code = 'listing-draft-conflict';
    this.remote = remote;
  }
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label) node.textContent = label;
  return node;
}

function button(label, className, action) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function mountListingWizard(form, { state, L, T, preview = false, onRestored = () => {} }) {
  const uid = state.user?.uid;
  const service = !preview && state.fb;
  const modules = service?.modules;
  const reference = modules?.doc(service.db, 'users', uid, 'listingDrafts', 'current');
  const cacheKey = `luma_auto_user:${uid}:listingDraftV1`;
  const belongsToAccount = () => state.user?.uid === uid;

  function readCache() {
    if (!reference) return {};
    try {
      return JSON.parse(localStorage.getItem(cacheKey)) || {};
    } catch {
      return {};
    }
  }

  const cache = readCache();
  let remote = cache.remote ?? null;
  let pending = cache.pending ?? null;
  let conflict = false;
  let saving;
  let discarding = false;
  let preparing = false;
  let publishing = false;
  let publishingVersion;
  let deferredRemote;
  let timer;
  let destroyed = false;
  let step = 0;
  let photoUrl = '';
  let localSaved = true;

  const isBusy = () => discarding || preparing || publishing;
  const active = () => !destroyed && form.isConnected && belongsToAccount();
  const controls = [...form.elements].filter(control => Object.hasOwn(fieldLimits, control.name));
  const defaults = Object.fromEntries(controls.map(control => [control.name, control.value]));
  const photoInput = form.elements.namedItem('images');
  const submit = form.querySelector('#sellSubmit');
  const note = form.querySelector('#sellNote');
  const submitRow = submit.parentElement;
  const inputSteps = Array.from({ length: 4 }, () => []);

  const shell = element('div', 'listing-wizard full-span');
  const steps = element('ol', 'listing-wizard-steps');
  const progress = stepLabels.map(label => element('li', '', L(label)));
  steps.append(...progress);
  shell.append(steps);
  const panes = stepLabels.map((label, index) => {
    const heading = element('h3', 'listing-wizard-heading', L(label));
    heading.tabIndex = -1;
    heading.id = `listingStepHeading${index}`;
    const pane = element('section', 'listing-wizard-pane form-grid');
    pane.setAttribute('aria-labelledby', heading.id);
    heading.classList.add('full-span');
    pane.append(heading);
    shell.append(pane);
    return { heading, pane };
  });

  const photosSection = form.querySelector('#marketPhotoFields')?.closest('fieldset');
  for (const child of [...form.children]) {
    if (child === submitRow) continue;
    const input = child.matches('input, select, textarea') ? child : child.querySelector('input, select, textarea');
    let destination = 0;
    if (input === photoInput || child === photosSection) destination = 1;
    else if (priceFields.has(input?.name) || child.matches('.helper')) destination = 2;
    panes[destination].pane.append(child);
  }
  for (let index = 0; index < panes.length; index++) {
    inputSteps[index] = [...panes[index].pane.querySelectorAll('input, select, textarea')];
  }
  const photosHint = element('p', 'helper full-span', L('draftPhotosLocal'));
  if (reference) panes[1].pane.append(photosHint);
  const summary = element('div', 'listing-draft-preview full-span');
  panes[3].pane.append(summary);

  const status = element('p', 'helper');
  status.setAttribute('role', 'status');
  const warning = element('div', 'listing-draft-conflict');
  warning.append(element('p', '', L('draftConflict')));
  const keep = button(L('draftKeepDevice'), 'primary-btn', async () => {
    if (isBusy() || !pending) return;
    pending = {
      base: draftVersion(remote),
      draftId: remote?.state === 'open' ? remote.draftId : crypto.randomUUID(),
      fields: pending.fields,
    };
    conflict = false;
    persist();
    await save();
  });
  const load = button(L('draftLoadCloud'), 'outline-btn', () => {
    if (isBusy()) return;
    if (remote?.state !== 'open' || remote.draftId !== pending?.draftId) clearPhotos();
    pending = null;
    conflict = false;
    restore(remote?.state === 'open' ? remote.fields : {});
    persist();
    setStatus(remote?.state === 'open' ? 'draftSynced' : '');
  });
  warning.append(keep, load);
  const retry = button(L('draftTryAgain'), 'outline-btn compact-btn', () => void save());
  retry.hidden = true;
  const discard = button(L('draftDiscard'), 'outline-btn compact-btn', () => void discardDraft());
  const tools = element('div', 'listing-draft-tools');
  tools.append(status, warning, retry, discard);
  if (reference) shell.append(tools);

  const previous = button(L('draftPrevious'), 'outline-btn', () => showStep(step - 1));
  const next = button(L('draftNext'), 'primary-btn', advance);
  previous.dataset.wizardAction = 'previous';
  next.dataset.wizardAction = 'next';
  const actions = element('div', 'listing-wizard-actions');
  actions.append(previous, next, submit);
  shell.append(note, actions);
  submitRow.remove();
  form.append(shell);
  const restoreValidation = form.noValidate;
  form.noValidate = true;

  function persist() {
    if (!reference) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ remote, pending }));
      localSaved = true;
    } catch {
      localSaved = false;
    }
  }

  function restore(fields) {
    if (!active()) return;
    for (const field of controls) field.value = defaults[field.name];
    for (const field of controls) {
      const value = fields[field.name];
      if (typeof value !== 'string') continue;
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value)) continue;
      field.value = value;
    }
    form.elements.namedItem('fuel')?.dispatchEvent(new Event('change'));
    onRestored(fields);
    if (step === 3) renderPreview();
  }

  function clearPhotos() {
    photoInput.value = '';
    photoInput.dispatchEvent(new Event('change'));
  }

  function setStatus(key) {
    if (!active()) return;
    status.textContent = key ? L(key === 'draftOffline' && !localSaved ? 'draftRetry' : key) : '';
    warning.hidden = !conflict;
    retry.hidden = key !== 'draftOffline' || !pending || conflict;
    discard.hidden = conflict || (!pending && remote?.state !== 'open');
    for (const control of [keep, load, retry, discard, previous, next]) control.disabled = isBusy();
    for (const { pane } of panes) pane.inert = isBusy();
  }

  function reconcile(incoming) {
    const changed = draftVersion(remote) !== draftVersion(incoming);
    const differentDraft = remote?.draftId !== incoming?.draftId || incoming?.state !== 'open';
    remote = incoming;
    if (pending) {
      conflict = pending.base !== draftVersion(remote);
      if (conflict && remote?.state === 'open' && remote.draftId === pending.draftId &&
            sameFields(pending.fields, remote.fields)) {
        pending = null;
        conflict = false;
      }
      if (conflict) setStatus(remote?.state === 'published' ? 'draftPublishedElsewhere' : '');
      else if (pending) schedule();
      else setStatus('draftSynced');
    } else if (changed) {
      if (active() && differentDraft && photoInput.files.length) {
        clearPhotos();
        showStep(0, false);
      }
      restore(remote?.state === 'open' ? remote.fields : {});
      setStatus(remote?.state === 'open' ? 'draftSynced' : remote?.state === 'published' ? 'draftPublishedElsewhere' : '');
    }
    persist();
  }

  function processDeferred(previousVersion) {
    if (deferredRemote === undefined || saving || isBusy()) return;
    const incoming = deferredRemote;
    deferredRemote = undefined;
    if (draftVersion(incoming) !== previousVersion || draftVersion(remote) === previousVersion) {
      reconcile(incoming);
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!conflict && active() && !isBusy()) timer = setTimeout(() => void save(), 650);
  }

  function queueEdit() {
    if (!reference || !active() || isBusy()) return;
    const fields = draftFields(form);
    const previousFields = pending?.fields ?? remote?.fields;
    if (previousFields && sameFields(fields, previousFields)) return;
    pending = {
      base: pending?.base ?? draftVersion(remote),
      draftId: pending?.draftId ?? (remote?.state === 'open' ? remote.draftId : crypto.randomUUID()),
      fields,
    };
    persist();
    if (!conflict) setStatus('draftSaving');
    schedule();
  }

  function save() {
    clearTimeout(timer);
    if (saving) return saving;
    if (!reference || !pending || conflict || !belongsToAccount()) return Promise.resolve(!pending);
    const work = pending;
    setStatus('draftSaving');
    saving = modules.runTransaction(service.db, async transaction => {
      const current = (await transaction.get(reference)).data() ?? null;
      if (draftVersion(current) !== work.base) throw new DraftConflict(current);
      const revision = current?.state === 'open' && current.draftId === work.draftId ? current.revision + 1 : 1;
      const record = { draftId: work.draftId, revision, state: 'open', fields: work.fields };
      transaction.set(reference, { ...record, updatedAt: modules.serverTimestamp() });
      return record;
    }).then(record => {
      remote = record;
      if (pending === work) pending = null;
      else if (pending?.base === work.base) pending = { ...pending, base: draftVersion(record) };
      persist();
      setStatus(pending ? 'draftSaving' : 'draftSynced');
      return !pending;
    }).catch(error => {
      if (error.code === 'listing-draft-conflict') reconcile(error.remote);
      else setStatus('draftOffline');
      return false;
    }).finally(() => {
      saving = undefined;
      processDeferred(work.base);
      if (pending && pending !== work && !conflict) schedule();
    });
    return saving;
  }

  async function discardDraft() {
    if (isBusy() || conflict || !confirm(L('draftDiscardConfirm'))) return;
    discarding = true;
    clearTimeout(timer);
    setStatus('draftSaving');
    let previousVersion;
    let failed = false;
    try {
      if (saving) await saving;
      if (!belongsToAccount() || conflict) return;
      previousVersion = draftVersion(remote);
      if (remote?.state === 'open') {
        remote = await modules.runTransaction(service.db, async transaction => {
          const current = (await transaction.get(reference)).data() ?? null;
          if (draftVersion(current) !== previousVersion) throw new DraftConflict(current);
          const marker = { draftId: current.draftId, revision: current.revision + 1, state: 'discarded' };
          transaction.set(reference, { ...marker, updatedAt: modules.serverTimestamp() });
          return marker;
        });
      }
      pending = null;
      persist();
      clearPhotos();
      restore({});
      showStep(0);
    } catch (error) {
      if (error.code === 'listing-draft-conflict') reconcile(error.remote);
      else failed = true;
    } finally {
      discarding = false;
      processDeferred(previousVersion);
      setStatus((failed || pending) && !conflict ? 'draftOffline' : '');
    }
  }

  function renderPreview() {
    summary.replaceChildren();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = '';
    const fields = draftFields(form);
    const file = photoInput.files[0];
    if (file) {
      photoUrl = URL.createObjectURL(file);
      const image = element('img');
      image.alt = [fields.make, fields.model].filter(Boolean).join(' ');
      image.src = photoUrl;
      summary.append(image);
    }
    const title = [fields.make, fields.model, fields.modelExtension].filter(Boolean).join(' ');
    summary.append(element('h4', '', title));
    if (fields.price) {
      const currency = new Intl.NumberFormat(state.locale === 'cnr' ? 'sr-Latn' : state.locale, {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
      });
      summary.append(element('strong', '', currency.format(Number(fields.price))));
    }
    summary.append(element('p', '', [fields.year, fields.fuel && T(fields.fuel), fields.city].filter(Boolean).join(' · ')));
    summary.append(element('p', '', fields.description));
  }

  function showStep(index, focus = true) {
    step = index;
    panes.forEach(({ pane }, position) => { pane.hidden = position !== step; });
    progress.forEach((item, position) => {
      if (position === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    previous.hidden = step === 0;
    next.hidden = step === 3;
    submit.hidden = step !== 3;
    note.textContent = '';
    if (step === 3) renderPreview();
    if (focus) panes[step].heading.focus();
  }

  function validateStep(index) {
    if (index === 1) {
      const files = [...photoInput.files];
      const maxSize = preview ? 800000 : 5 * 1024 * 1024;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      const invalid = files.length > (preview ? 1 : 6) || files.some(file => file.size > maxSize || !allowed.includes(file.type));
      photoInput.setCustomValidity(invalid ? T('fileError') : '');
    }
    if (index === 2) {
      const description = form.elements.namedItem('description');
      const short = description.value.trim() && description.value.trim().length < description.minLength;
      description.setCustomValidity(short ? L('draftDescriptionTooShort') : '');
    }
    const invalid = inputSteps[index].find(input => input.willValidate && !input.checkValidity());
    if (!invalid) return true;
    if (step !== index) showStep(index);
    invalid.reportValidity();
    return false;
  }

  function advance() {
    if (step < 3 && !isBusy() && validateStep(step)) showStep(step + 1);
  }

  function onSubmit(event) {
    if (step === 3 && !isBusy() && [0, 1, 2].every(validateStep)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (step < 3 && !isBusy()) advance();
  }

  function onEdit(event) {
    if (event.target === photoInput || event.target.name === 'description') event.target.setCustomValidity('');
    if (Object.hasOwn(fieldLimits, event.target.name)) queueEdit();
  }

  function onOnline() {
    if (pending) schedule();
  }

  form.addEventListener('submit', onSubmit, true);
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  if (reference) window.addEventListener('online', onOnline);
  if (pending || remote?.state === 'open') restore(pending?.fields ?? remote.fields);
  showStep(0, false);
  setStatus(pending ? 'draftSaving' : remote?.state === 'open' ? 'draftSynced' : '');
  const unsubscribe = reference && modules.onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
    if (!active() || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
    const incoming = snapshot.data() ?? null;
    if (saving || isBusy()) deferredRemote = incoming;
    else reconcile(incoming);
  }, () => setStatus('draftOffline'));
  if (pending) schedule();

  return {
    async preparePublish() {
      if (!reference) return null;
      if (!belongsToAccount() || isBusy()) throw new Error(L('draftOffline'));
      if (conflict) throw new DraftConflict(remote);
      if (!pending && (remote?.state !== 'open' || !sameFields(remote.fields, draftFields(form)))) queueEdit();
      preparing = true;
      setStatus('draftSaving');
      if (saving) await saving;
      if (pending && !conflict) await save();
      if (conflict) throw new DraftConflict(remote);
      if (pending || !belongsToAccount() || remote?.state !== 'open') throw new Error(L('draftOffline'));
      preparing = false;
      publishing = true;
      publishingVersion = draftVersion(remote);
      return { draftId: remote.draftId, revision: remote.revision };
    },
    async markPublished(transaction, expected, listingId) {
      const current = (await transaction.get(reference)).data() ?? null;
      if (!belongsToAccount() || !current || current.state !== 'open' ||
          current.draftId !== expected.draftId || current.revision !== expected.revision) {
        throw new DraftConflict(current);
      }
      transaction.set(reference, {
        draftId: expected.draftId, revision: expected.revision + 1,
        state: 'published', listingId, updatedAt: modules.serverTimestamp(),
      });
    },
    acceptPublished(expected, listingId) {
      if (!expected) return;
      const cached = readCache();
      if (cached.remote?.draftId && cached.remote.draftId !== expected.draftId) return;
      remote = { draftId: expected.draftId, revision: expected.revision + 1, state: 'published', listingId };
      pending = null;
      persist();
    },
    async commitStatus(expected, listingId) {
      if (!expected || !listingId || !belongsToAccount()) return 'unknown';
      try {
        const current = (await modules.getDocFromServer(reference)).data();
        if (current?.draftId === expected.draftId && current.state === 'published' && current.listingId === listingId) return 'published';
        if (current?.draftId === expected.draftId && current.state !== 'published') return 'open';
        const listing = (await modules.getDocFromServer(modules.doc(service.db, 'listings', listingId))).data();
        return listing?.uid === uid ? 'published' : 'unknown';
      } catch {
        return 'unknown';
      }
    },
    releasePublish(error) {
      preparing = false;
      publishing = false;
      if (error?.code === 'listing-draft-conflict') {
        pending ??= {
          base: draftVersion(remote), draftId: remote?.draftId ?? crypto.randomUUID(), fields: draftFields(form),
        };
        remote = error.remote;
        conflict = true;
        persist();
      }
      processDeferred(publishingVersion);
      publishingVersion = undefined;
      setStatus(conflict ? '' : pending ? 'draftOffline' : remote?.state === 'open' ? 'draftSynced' : '');
    },
    destroy() {
      clearTimeout(timer);
      unsubscribe?.();
      destroyed = true;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      form.noValidate = restoreValidation;
      form.removeEventListener('submit', onSubmit, true);
      form.removeEventListener('input', onEdit);
      form.removeEventListener('change', onEdit);
      window.removeEventListener('online', onOnline);
      if (pending && !isBusy()) void save();
    },
  };
}
