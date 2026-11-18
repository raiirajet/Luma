const marketPhotoKinds = ['exterior', 'interior', 'odometer', 'damage', 'other'];
const marketPhotoLabels = {
 exterior: 'photoExterior', interior: 'photoInterior', odometer: 'photoOdometer',
 damage: 'photoDamage', other: 'photoOther'
};

export function listingPhotoDetail(car, index) {
 const detail = car.photoDetails?.[index];
 return marketPhotoKinds.includes(detail?.kind) ? detail : null;
}

export function listingReportLink(value) {
 try {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
 } catch {
  return '';
 }
}

export function listingPhotoDetailsFromForm(form, count) {
 const details = {};
 for (let index = 0; index < Math.min(count, 6); index++) {
  const kind = String(form.get('photoKind' + index) || '');
  const note = String(form.get('photoNote' + index) || '').trim().slice(0, 160);
  if (marketPhotoKinds.includes(kind) || note) details[index] = {kind: marketPhotoKinds.includes(kind) ? kind : 'other', note};
 }
 return details;
}

export function listingBatteryFromForm(form) {
 if (form.get('fuel') !== 'electric') return null;
 const rawHealth = String(form.get('batteryHealth') || '').trim();
 const measuredAt = String(form.get('batteryMeasuredAt') || '');
 const issuer = String(form.get('batteryIssuer') || '').trim();
 const rawUrl = String(form.get('batteryUrl') || '').trim();
 if (![rawHealth, measuredAt, issuer, rawUrl].some(Boolean)) return null;
 const health = Number(rawHealth);
 const url = rawUrl && listingReportLink(rawUrl);
 const date = new Date(measuredAt);
 const validDate = /^\d{4}-\d{2}-\d{2}$/.test(measuredAt)
  && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === measuredAt
  && measuredAt <= new Date().toISOString().slice(0, 10);
 if (!rawHealth || !Number.isFinite(health) || health < 0 || health > 100
   || !validDate || !issuer || issuer.length > 120 || (rawUrl && (!url || url.length > 500))) return false;
 return {health, measuredAt, issuer, ...(url ? {url} : {})};
}

export function savedSearchKey(item, keys) {
 const filters = keys.map(key => String(item.filters?.[key] ?? '').trim());
 const countries = [...new Set(item.countries || [])].sort();
 return JSON.stringify([String(item.name || '').trim(), filters, countries]);
}

export function createLimbaMarketplace(api) {
 const {el, state, h, price, number, L, F, W, X, modal, toast, openAuth, openListing, renderSavedSearches} = api;
 let accountStops = [];
 let panelStops = [];
 let alerts = null;
 let notifications = null;
 let notificationsFailed = false;
 let accountGeneration = 0;
 let busyAlertKeys = new Set();

 const collection = (...path) => state.fb.modules.collection(state.fb.db, ...path);
 const documentRef = (...path) => state.fb.modules.doc(state.fb.db, ...path);
 const call = async (name, data) => (await state.fb.modules.httpsCallable(state.fb.functions, name)(data)).data;
 const canUseAccount = () => Boolean(state.user && !state.user.isPreview && state.fb?.functions);
 const filterKeys = () => Object.keys(state.filters);
 const searchKey = item => savedSearchKey(item, filterKeys());
 const hasAlert = item => !!alerts?.some(alert => searchKey(alert) === searchKey(item));
 const dateText = timestamp => {
  const date = timestamp?.toDate?.() || (typeof timestamp === 'string' ? new Date(timestamp + 'T00:00:00Z') : null);
  return date && Number.isFinite(date.getTime())
   ? new Intl.DateTimeFormat(state.locale === 'cnr' ? 'sr-Latn' : state.locale, {
     dateStyle: 'medium', ...(typeof timestamp === 'string' ? {timeZone: 'UTC'} : {timeStyle: 'short'})
    }).format(date)
   : '';
 };

 function stopPanel() {
  panelStops.forEach(stop => stop());
  panelStops = [];
 }

 function connectAccount(user) {
  const generation = ++accountGeneration;
  accountStops.forEach(stop => stop());
  accountStops = [];
  alerts = null;
  notifications = null;
  notificationsFailed = false;
  busyAlertKeys = new Set();
  updateInboxButton();
  if (!user || user.isPreview || !state.fb) return;
  const m = state.fb.modules;
  accountStops.push(m.onSnapshot(m.query(collection('users', user.uid, 'searchAlerts'), m.limit(20)), snapshot => {
   if (generation !== accountGeneration) return;
   alerts = snapshot.docs.map(doc => doc.data());
   renderSavedSearches();
  }, () => {
   if (generation !== accountGeneration) return;
   alerts = null;
   renderSavedSearches();
  }));
  accountStops.push(m.onSnapshot(m.query(collection('users', user.uid, 'notifications'),
   m.orderBy('createdAt', 'desc'), m.limit(50)), snapshot => {
   if (generation !== accountGeneration) return;
   notificationsFailed = false;
   notifications = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
   updateInboxButton();
   renderNotifications();
  }, () => {
   if (generation !== accountGeneration) return;
   notifications = null;
   notificationsFailed = true;
   updateInboxButton();
   renderNotifications();
  }));
 }

 function updateInboxButton() {
  const unread = notifications?.filter(item => !item.read).length || 0;
  const badge = el('inboxCount');
  if (!badge) return;
  badge.classList.toggle('hidden', !unread);
  badge.textContent = unread ? number(unread) : '';
  el('inboxBtn').setAttribute('aria-label', unread ? L('notifications') + ' (' + number(unread) + ')' : L('messages'));
  el('inboxBtn').title = L('messages');
 }

 function orphanedAlerts() {
  if (!alerts) return [];
  const savedKeys = new Set(state.searches.map(searchKey));
  return alerts.filter(alert => !savedKeys.has(searchKey(alert)));
 }

 function savedAlertButton(item, index, orphaned = false) {
  if (!canUseAccount() || !state.user.emailVerified) return '';
  const enabled = orphaned || hasAlert(item);
  const attribute = orphaned ? 'data-orphan-alert' : 'data-alert';
  return `<button type="button" ${attribute}="${index}" aria-pressed="${enabled}"
    ${!alerts || busyAlertKeys.has(searchKey(item)) ? 'disabled' : ''}>
    ${h(L(enabled ? 'searchAlertDisable' : 'searchAlertEnable'))}</button>`;
 }

 async function setAlert(item, enabled) {
  const key = searchKey(item);
  const generation = accountGeneration;
  if (!canUseAccount() || !alerts || busyAlertKeys.has(key)) return false;
  busyAlertKeys.add(key);
  renderSavedSearches();
  try {
   await call('setSavedSearchAlert', {
    name: item.name, filters: item.filters, countries: item.countries || [], enabled
   });
   if (accountGeneration !== generation) return false;
   // The snapshot can arrive before the callable resolves. Apply the same
   // change locally so the control stays consistent while it is in flight.
   if (alerts) alerts = enabled
    ? [...alerts.filter(alert => searchKey(alert) !== key), item]
    : alerts.filter(alert => searchKey(alert) !== key);
   toast(L(enabled ? 'searchAlertOn' : 'searchAlertOff'));
   return true;
  } catch {
   if (accountGeneration === generation) toast(L('featureUnavailable'));
   return false;
  } finally {
   if (accountGeneration === generation) {
    busyAlertKeys.delete(key);
    renderSavedSearches();
   }
  }
 }

 function toggleAlert(index, orphaned = false) {
  const item = (orphaned ? orphanedAlerts() : state.searches)[index];
  if (item) return setAlert(item, !orphaned && !hasAlert(item));
 }

 function openInbox(tab = 'messages') {
  if (!state.user || state.user.isPreview) { openAuth(); return; }
  if (!canUseAccount()) { toast(L('featureUnavailable')); return; }
  modal(`<h2 id="modalTitle">${h(L(tab))}</h2>
   <div class="market-tabs">
    <button type="button" class="${tab === 'messages' ? 'primary-btn' : 'outline-btn'}" id="marketChatTab">${h(L('messages'))}</button>
    <button type="button" class="${tab === 'notifications' ? 'primary-btn' : 'outline-btn'}" id="marketNotificationsTab">${h(L('notifications'))}</button>
   </div>
   <div class="market-list" id="${tab === 'messages' ? 'marketThreads' : 'marketNotifications'}" aria-live="polite"><p>${h(L('loading'))}</p></div>`);
  el('marketChatTab').addEventListener('click', () => openInbox('messages'));
  el('marketNotificationsTab').addEventListener('click', () => openInbox('notifications'));
  if (tab === 'notifications') {
   renderNotifications();
   return;
  }
  const m = state.fb.modules;
  const target = el('marketThreads');
  const query = m.query(collection('chatThreads'), m.where('participants', 'array-contains', state.user.uid),
   m.orderBy('updatedAt', 'desc'), m.limit(50));
  panelStops.push(m.onSnapshot(query, snapshot => {
   if (!target.isConnected) return;
   target.innerHTML = snapshot.empty ? `<p>${h(L('chatEmpty'))}</p>` : snapshot.docs.map(doc => {
    const thread = doc.data();
    return `<button type="button" class="market-list-row" data-thread="${h(doc.id)}">
     <strong>${h(thread.listingTitle)}</strong><span>${h(thread.lastMessage || '')}</span>
     <small>${h(dateText(thread.updatedAt))}</small></button>`;
   }).join('');
  }, () => { if (target.isConnected) target.textContent = L('featureUnavailable'); }));
  target.addEventListener('click', event => {
   const row = event.target.closest('[data-thread]');
   if (row) openThread(row.dataset.thread);
  });
 }

 function renderNotifications() {
  const target = el('marketNotifications');
  if (!target) return;
  if (notificationsFailed) { target.textContent = L('featureUnavailable'); return; }
  if (!notifications) return;
  target.innerHTML = notifications.length ? notifications.map(item =>
   `<button type="button" class="market-list-row ${item.read ? '' : 'market-unread'}" data-notice="${h(item.id)}">
    <strong>${h(item.listingTitle)}</strong><span>${h(item.searchName)}</span>
    <small>${h(dateText(item.createdAt))}</small></button>`).join('') : `<p>${h(L('notificationsEmpty'))}</p>`;
  target.onclick = async event => {
   const row = event.target.closest('[data-notice]');
   if (!row) return;
   const item = notifications.find(notice => notice.id === row.dataset.notice);
   if (!item) return;
   row.disabled = true;
   if (!item.read) {
    try {
     await state.fb.modules.updateDoc(documentRef('users', state.user.uid, 'notifications', item.id), {read: true});
    } catch {
     if (target.isConnected) toast(L('featureUnavailable'));
    }
   }
   if (target.isConnected) await openListing(item.listingId, {guard: () => target.isConnected});
   row.disabled = false;
  };
 }

 async function startChat(car, button) {
  if (car.isDemo || car.isPreview) { toast(F('contactPreview')); return; }
  if (!state.user || state.user.isPreview) { openAuth(); return; }
  if (!canUseAccount()) { toast(L('featureUnavailable')); return; }
  if (car.uid === state.user.uid) { openInbox(); return; }
  if (!state.user.emailVerified) { toast(W('verifiedRequired')); openAuth(); return; }
  button.disabled = true;
  try {
   const {threadId} = await call('startListingChat', {listingId: car.id});
   if (button.isConnected) openThread(threadId);
  } catch {
   if (button.isConnected) toast(L('featureUnavailable'));
  } finally {
   button.disabled = false;
  }
 }

 function openThread(threadId) {
  const uid = state.user?.uid;
  if (!canUseAccount() || !uid) return;
  const verified = state.user.emailVerified;
  modal(`<button type="button" class="detail-back outline-btn" id="marketChatBack">${h(L('chatBack'))}</button>
   <h2 id="modalTitle">${h(L('messages'))}</h2>
   <div id="marketMessageList" class="market-messages" role="log" aria-label="${h(L('messages'))}"><p>${h(L('loading'))}</p></div>
   <p id="marketChatStatus" role="status"></p>
   <form id="marketChatForm" class="market-compose">
    <div class="market-quick-replies">${['chatAvailableQuestion', 'chatTestDriveQuestion'].map(key =>
     `<button type="button" class="outline-btn" data-quick="${key}">${h(L(key))}</button>`).join('')}</div>
    <label for="marketMessage">${h(L('chatMessage'))}</label>
    <textarea id="marketMessage" maxlength="2000" required rows="2" disabled></textarea>
    <button type="submit" class="primary-btn" disabled>${h(L('chatSend'))}</button>
   </form>
   <div class="market-chat-actions">
    <button type="button" class="outline-btn" id="marketChatBlock" disabled>${h(L('chatBlock'))}</button>
    <button type="button" class="outline-btn" id="marketChatReport" disabled>${h(L('chatReport'))}</button>
   </div>
   <form id="marketReportForm" class="market-report-form hidden">
    <label for="marketReportReason">${h(L('chatReportReason'))}</label>
    <textarea id="marketReportReason" required maxlength="160" rows="2"></textarea>
    <button type="submit" class="outline-btn">${h(L('chatReport'))}</button>
   </form>`);
  const target = el('marketMessageList');
  const form = el('marketChatForm');
  const input = el('marketMessage');
  const submit = form.querySelector('[type=submit]');
  const blockButton = el('marketChatBlock');
  const reportButton = el('marketChatReport');
  const reportForm = el('marketReportForm');
  const status = el('marketChatStatus');
  const m = state.fb.modules;
  let thread = null;
  let sending = false;
  let blocking = false;
  let pending = null;

  function refreshThreadControls() {
   const blocked = !!thread?.blockedBy?.length;
   const blockedBySelf = thread?.blockedBy?.includes(uid);
   const canSend = verified && !!thread && !blocked && !sending;
   input.disabled = submit.disabled = !canSend;
   for (const button of form.querySelectorAll('[data-quick]')) button.disabled = !canSend;
   blockButton.disabled = !verified || !thread || blocking;
   reportButton.disabled = !verified || !thread;
   blockButton.textContent = L(blockedBySelf ? 'chatUnblock' : 'chatBlock');
   status.textContent = !verified ? W('verifiedRequired') : blocked ? L('chatBlocked') : '';
  }
  refreshThreadControls();
  let messagesStarted = false;
  function subscribeMessages() {
   const query = m.query(collection('chatThreads', threadId, 'messages'), m.orderBy('createdAt', 'desc'), m.limit(50));
   panelStops.push(m.onSnapshot(query, snapshot => {
    if (!target.isConnected) return;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 45;
    target.innerHTML = snapshot.empty ? `<p>${h(L('chatEmpty'))}</p>` : snapshot.docs.slice().reverse().map(doc => {
     const message = doc.data();
     return `<div class="market-message ${message.senderUid === uid ? 'mine' : ''}">
      <p>${h(message.text)}</p><small>${h(dateText(message.createdAt))}</small></div>`;
    }).join('');
    if (nearBottom) target.scrollTop = target.scrollHeight;
   }, () => { if (target.isConnected) target.textContent = L('featureUnavailable'); }));
  }
  panelStops.push(m.onSnapshot(documentRef('chatThreads', threadId), snapshot => {
   if (!target.isConnected) return;
   thread = snapshot.exists() ? snapshot.data() : null;
   if (thread) el('modalTitle').textContent = thread.listingTitle;
   else target.textContent = L('featureUnavailable');
   refreshThreadControls();
   if (thread && !messagesStarted) { messagesStarted = true; subscribeMessages(); }
  }, () => { if (target.isConnected) target.textContent = L('featureUnavailable'); }));

  el('marketChatBack').addEventListener('click', () => openInbox());
  form.querySelectorAll('[data-quick]').forEach(button => button.addEventListener('click', () => {
   input.value = L(button.dataset.quick);
   input.focus();
  }));
  form.addEventListener('submit', async event => {
   event.preventDefault();
   const text = input.value.trim();
   if (!text || submit.disabled) return;
   if (pending?.text !== text) pending = {text, messageId: crypto.randomUUID()};
   sending = true;
   refreshThreadControls();
   try {
    await call('sendListingMessage', {threadId, ...pending});
    if (target.isConnected) { input.value = ''; pending = null; }
   } catch (error) {
    if (target.isConnected) {
     toast(error?.code === 'functions/failed-precondition' && !thread?.blockedBy?.length
      ? L('listingUnavailable') : L('featureUnavailable'));
    }
   } finally {
    sending = false;
    if (target.isConnected) { refreshThreadControls(); input.focus(); }
   }
  });
  blockButton.addEventListener('click', async () => {
   if (blockButton.disabled) return;
   const blocked = !thread.blockedBy?.includes(uid);
   blocking = true;
   refreshThreadControls();
   try {
    await call('setListingChatBlocked', {threadId, blocked});
   } catch {
    if (target.isConnected) toast(L('featureUnavailable'));
   } finally {
    blocking = false;
    if (target.isConnected) refreshThreadControls();
   }
  });
  reportButton.addEventListener('click', () => {
   reportForm.classList.toggle('hidden');
   if (!reportForm.classList.contains('hidden')) el('marketReportReason').focus();
  });
  reportForm.addEventListener('submit', async event => {
   event.preventDefault();
   const reason = el('marketReportReason').value.trim();
   const button = reportForm.querySelector('button[type=submit]');
   if (!reason || button.disabled) return;
   button.disabled = true;
   try {
    await call('reportListingChat', {threadId, reason});
    if (target.isConnected) {
     reportForm.reset();
     reportForm.classList.add('hidden');
     toast(L('chatReported'));
    }
   } catch {
    if (target.isConnected) toast(L('featureUnavailable'));
   } finally {
    button.disabled = false;
   }
  });
 }

 async function loadPrices(car) {
  const target = el('listingPriceHistory');
  if (!target || !state.fb || car.isDemo || car.isPreview) return;
  const m = state.fb.modules;
  try {
   const results = await m.getDocs(m.query(collection('listings', car.id, 'priceHistory'),
    m.orderBy('changedAt', 'desc'), m.limit(30)));
   if (!target.isConnected) return;
   target.innerHTML = results.empty ? `<p>${h(L('priceHistoryEmpty'))}</p>` :
    `<ol class="price-history-list">${results.docs.map(doc => {
     const entry = doc.data();
     return `<li><time>${h(dateText(entry.changedAt))}</time>
      <span>${h(L('pricePrevious'))} ${h(price(entry.previousPrice))}</span>
      <strong>${h(price(entry.price))}</strong></li>`;
    }).join('')}</ol>`;
  } catch {
   if (target.isConnected) target.textContent = L('featureUnavailable');
  }
 }

 function photoFields(count, car, names = []) {
  return Array.from({length: Math.min(count, 6)}, (_, index) => {
   const detail = listingPhotoDetail(car, index);
   return `<fieldset class="market-photo-slot"><legend>${h(L('photoNumber'))} ${index + 1}</legend>
    ${names[index] ? `<small>${h(names[index])}</small>` : ''}
    <label>${h(L('photoDetails'))}<select name="photoKind${index}">
     <option value="">—</option>${marketPhotoKinds.map(kind =>
      `<option value="${kind}" ${detail?.kind === kind ? 'selected' : ''}>${h(L(marketPhotoLabels[kind]))}</option>`).join('')}
    </select></label>
    <label>${h(L('photoNote'))}<input name="photoNote${index}" maxlength="160" value="${h(detail?.note || '')}"></label></fieldset>`;
  }).join('');
 }

 function photoSummary(detail) {
  if (!detail) return '';
  return [L(marketPhotoLabels[detail.kind]), detail.note].filter(Boolean).join(' · ');
 }

 function batteryFields(report = {}) {
  return `<fieldset class="market-listing-section full-span hidden" id="marketBatteryFields"><legend>${h(L('batteryReport'))}</legend>
   <div class="market-paired-fields">
    <label>${h(L('batteryHealth'))} (%)<input name="batteryHealth" type="number" min="0" max="100" step="any" inputmode="decimal" value="${h(report.health ?? '')}"></label>
    <label>${h(L('batteryMeasuredAt'))}<input name="batteryMeasuredAt" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${h(report.measuredAt || '')}"></label>
    <label>${h(L('batteryIssuer'))}<input name="batteryIssuer" maxlength="120" value="${h(report.issuer || '')}"></label>
    <label>${h(L('batteryUrl'))}<input name="batteryUrl" maxlength="500" type="url" value="${h(report.url || '')}"></label>
   </div></fieldset>`;
 }

 function batteryReport(car) {
  const report = car.fuel === 'electric' && car.batteryReport;
  if (!report || !Number.isFinite(report.health)) return '';
  const url = listingReportLink(report.url);
  return `<section class="market-listing-section market-battery">
   <h3>${h(L('batteryReport'))}</h3><p>${h(X('sellerClaims'))}</p>
   <dl><div><dt>${h(L('batteryHealth'))}</dt><dd>${h(number(report.health))} %</dd></div>
    <div><dt>${h(L('batteryMeasuredAt'))}</dt><dd>${h(dateText(report.measuredAt))}</dd></div>
    <div><dt>${h(L('batteryIssuer'))}</dt><dd>${h(report.issuer)}</dd></div></dl>
    ${url ? `<a class="outline-btn" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(L('batteryOpen'))}</a>` : ''}
  </section>`;
 }

 return {connectAccount, stopPanel, updateInboxButton, openInbox, savedAlertButton, orphanedAlerts, hasAlert, setAlert,
  toggleAlert, startChat, loadPrices, photoFields, photoSummary, batteryFields, batteryReport};
}
