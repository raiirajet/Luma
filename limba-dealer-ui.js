export function createDealerAccountUI({ el, state, h, L, T, modal, toast, openAuth,
  carCard, openListing, countryLabel, COUNTRIES, number, callSecureMarketplace }) {
  let application;
  let canReview = false;
  let stopApplication;
  let reviewingUid = null;
  let loadingVerification = false;
  const dealerViews = new Set();

  function applicationRef(user) {
    const { db, modules } = state.fb;
    return modules.doc(db, 'dealerApplications', user.uid);
  }

  async function saveApplication(user, name) {
    const { modules } = state.fb;
    const reference = applicationRef(user);
    if (user.emailVerified) await user.getIdToken(true);
    const existing = await modules.getDocFromServer(reference);
    const data = {
      companyName: name.trim(),
      email: user.email,
      status: user.emailVerified ? 'pending' : 'verificationRequired',
      reviewerUid: '',
      updatedAt: modules.serverTimestamp(),
    };
    if (existing.exists()) {
      await modules.updateDoc(reference, data);
    } else {
      await modules.setDoc(reference, { ...data, createdAt: modules.serverTimestamp() });
    }
  }

  async function submitVerified(user) {
    if (!user?.emailVerified || user.uid !== state.user?.uid ||
        application?.status !== 'verificationRequired' || loadingVerification) return;
    loadingVerification = true;
    try {
      await user.getIdToken(true);
      const { modules } = state.fb;
      await modules.updateDoc(applicationRef(user), {
        email: user.email,
        status: 'pending',
        updatedAt: modules.serverTimestamp(),
      });
    } catch (error) {
      console.warn('dealer application verification', error.code);
    } finally {
      loadingVerification = false;
    }
  }

  function connectAccount(user) {
    stopApplication?.();
    stopApplication = undefined;
    application = undefined;
    canReview = false;
    reviewingUid = user?.uid ?? null;
    if (!state.fb || !user || user.isPreview) return;
    const { modules } = state.fb;
    stopApplication = modules.onSnapshot(applicationRef(user), snapshot => {
      if (state.user?.uid !== user.uid || snapshot.metadata.hasPendingWrites) return;
      application = snapshot.data() ?? null;
      renderAccount();
      void submitVerified(user);
    }, () => {
      if (state.user?.uid !== user.uid) return;
      const panel = el('dealerAccountPanel');
      if (panel) panel.textContent = L('dealerLoadError');
    });
  }

  async function refreshReviewer() {
    const user = state.user;
    if (!user || user.isPreview) return;
    const uid = user.uid;
    try {
      const token = await user.getIdTokenResult(true);
      if (reviewingUid !== uid || state.user?.uid !== uid) return;
      canReview = user.emailVerified && token.claims.limbaAdmin === true;
      renderAccount();
    } catch {
      // Firestore still enforces the reviewer claim for reads and decisions.
    }
  }

  const statusKeys = {
    verificationRequired: 'dealerVerificationRequired',
    pending: 'dealerPending',
    approved: 'dealerApproved',
    rejected: 'dealerRejected',
  };

  function renderAccount() {
    const panel = el('dealerAccountPanel');
    if (!panel || !state.user || state.user.isPreview) return;
    const status = application?.status;
    const label = application === undefined ? L('loading') : status ? L(statusKeys[status]) : T('privateSeller');
    const apply = application === null || status === 'rejected';
    panel.innerHTML = `<p role="status"><strong>${h(L('accountType'))}</strong> · ${h(label)}</p>
      <div class="detail-actions">
      ${apply ? `<button type="button" id="dealerApply" class="outline-btn">${h(L('dealerApply'))}</button>` : ''}
      ${status === 'approved' ? `<button type="button" id="dealerEditProfile" class="outline-btn">${h(L('dealerEditProfile'))}</button>
        <button type="button" id="dealerShowStatistics" class="outline-btn">${h(L('dealerStatistics'))}</button>` : ''}
      ${canReview ? `<button type="button" id="dealerReview" class="primary-btn">${h(L('dealerReview'))}</button>` : ''}
      </div>`;
    el('dealerApply')?.addEventListener('click', openApplication);
    el('dealerReview')?.addEventListener('click', showReview);
    el('dealerEditProfile')?.addEventListener('click', editProfile);
    el('dealerShowStatistics')?.addEventListener('click', showStatistics);
  }

  function profileRef(uid) {
    const { db, modules } = state.fb;
    return modules.doc(db, 'dealerProfiles', uid);
  }

  function validWebsite(value) {
    try {
      const url = new URL(value);
      return /^https:\/\/[A-Za-z0-9]+([.-][A-Za-z0-9]+)+(:[0-9]{1,5})?([/?#][^\s<>]*)?$/.test(url.href) && !url.username && !url.password && url.href.length <= 300 ? url.href : '';
    } catch {
      return '';
    }
  }

  async function editProfile() {
    const uid = state.user?.uid;
    const companyName = application?.companyName;
    if (!uid || application?.status !== 'approved' || !state.fb) return;
    modal(`<h2 id="modalTitle">${h(L('dealerEditProfile'))}</h2><p id="dealerProfileLoading" role="status">${h(L('loading'))}</p>`);
    const anchor = el('dealerProfileLoading');
    const { modules } = state.fb;
    try {
      const snapshot = await modules.getDocFromServer(profileRef(uid));
      if (!anchor.isConnected || state.user?.uid !== uid) return;
      const profile = snapshot.data() || {};
      const countries = COUNTRIES.map(([code]) => `<option value="${h(code)}" ${code === profile.country ? 'selected' : ''}>${h(countryLabel(code))}</option>`).join('');
      modal(`<h2 id="modalTitle">${h(L('dealerEditProfile'))}</h2>
        <form class="form-stack" id="dealerProfileForm">
         <p><strong>${h(companyName)}</strong> · ${h(L('dealerApprovedPublic'))}</p>
         <label>${h(T('country'))}<select name="country" required>${countries}</select></label>
         <label>${h(T('location'))}<input name="city" maxlength="90" required autocomplete="address-level2" value="${h(profile.city)}"></label>
         <label>${h(L('dealerWebsite'))}<input type="url" name="website" maxlength="300" placeholder="https://" value="${h(profile.website)}"></label>
         <label class="checkbox-label"><input type="checkbox" name="published" ${profile.published ? 'checked' : ''}> ${h(L('dealerPublishProfile'))}</label>
         <button type="submit" class="primary-btn">${h(L('saveChanges'))}</button>
         <button type="button" class="outline-btn" id="dealerSettingsBack">${h(L('accountNav'))}</button>
         <p class="helper" role="status"></p>
        </form>`);
      const form = el('dealerProfileForm');
      const status = form.querySelector('[role=status]');
      el('dealerSettingsBack').addEventListener('click', openAuth);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (state.user?.uid !== uid) return;
        const rawWebsite = form.elements.website.value.trim();
        const website = rawWebsite ? validWebsite(rawWebsite) : '';
        if (rawWebsite && !website) { status.textContent = L('dealerWebsiteInvalid'); return; }
        const city = form.elements.city.value.trim();
        if (!city) { status.textContent = L('dealerCityRequired'); return; }
        const submit = form.querySelector('[type=submit]');
        submit.disabled = true;
        status.textContent = L('loading');
        try {
          await modules.setDoc(profileRef(uid), {
            companyName, country: form.elements.country.value, city, website,
            published: form.elements.published.checked, updatedAt: modules.serverTimestamp(),
          });
          status.textContent = L('dealerProfileSaved');
        } catch {
          status.textContent = L('dealerProfileSaveError');
        } finally {
          submit.disabled = false;
        }
      });
    } catch {
      if (anchor.isConnected) anchor.textContent = L('dealerProfileUnavailable');
    }
  }

  async function showStatistics() {
    const uid = state.user?.uid;
    if (!uid || application?.status !== 'approved') return;
    modal(`<h2 id="modalTitle">${h(L('dealerStatistics'))}</h2>
      <p class="muted-copy">${h(L('dealerStatisticsNote'))}</p>
      <label for="dealerPeriod">${h(L('dealerStatisticsWindow'))}</label>
      <select id="dealerPeriod" class="settings-language-select"><option value="7">7 ${h(L('days'))}</option><option value="30" selected>30 ${h(L('days'))}</option></select>
      <div id="dealerStatisticsResult" role="status"></div>`);
    const windowSelect = el('dealerPeriod');
    const result = el('dealerStatisticsResult');
    let generation = 0;
    async function load() {
      const request = ++generation;
      result.textContent = L('loading');
      try {
        const data = await callSecureMarketplace('getDealerStatistics', { days: Number(windowSelect.value) });
        if (!result.isConnected || request !== generation || state.user?.uid !== uid) return;
        result.innerHTML = `<dl class="dealer-stats"><div><dt>${h(L('dealerListingViews'))}</dt><dd>${h(number(data.views))}</dd></div>
          <div><dt>${h(L('dealerInquiries'))}</dt><dd>${h(number(data.inquiries))}</dd></div></dl>`;
      } catch {
        if (request === generation && result.isConnected) result.textContent = L('featureUnavailable');
      }
    }
    windowSelect.addEventListener('change', load);
    void load();
  }

  async function openPublic(uid, fromAd = null) {
    if (!state.fb || !uid || uid.length > 128 || uid.includes('/')) return;
    modal(`<h2 id="modalTitle">${h(L('dealerProfile'))}</h2><p id="dealerPublicLoading" role="status">${h(L('loading'))}</p>`);
    const anchor = el('dealerPublicLoading');
    const { db, modules: m } = state.fb;
    let profile;
    try {
      profile = (await m.getDocFromServer(profileRef(uid))).data();
    } catch {
      // The authorization check also hides unpublished profiles from visitors.
    }
    if (!anchor.isConnected) return;
    if (!profile?.published) { anchor.textContent = L('dealerProfileUnavailable'); return; }
    const website = validWebsite(profile.website);
    modal(`${fromAd ? `<button type="button" class="detail-back outline-btn" id="dealerBackToListing">${h(L('backToAd'))}</button>` : ''}
      <h2 id="modalTitle">${h(profile.companyName)}</h2>
      <p class="dealer-badge">${h(L('dealerApprovedPublic'))}</p><p>${h(profile.city)}, ${h(countryLabel(profile.country))}</p>
      <div class="detail-actions">
       ${website ? `<a class="outline-btn" href="${h(website)}" target="_blank" rel="noopener noreferrer">${h(L('dealerWebsite'))}</a>` : ''}
       <button type="button" class="outline-btn" id="dealerShare">${h(T('shareCar'))}</button>
      </div>
      <h3>${h(L('dealerStock'))}</h3><div id="dealerStockGrid" class="car-grid dealer-stock-grid"></div>
      <p id="dealerStockStatus" role="status"></p><button type="button" id="dealerStockMore" class="outline-btn hidden">${h(L('loadMore'))}</button>`);
    el('dealerBackToListing')?.addEventListener('click', () => openListing(fromAd, { fromHistory: true }));
    el('dealerShare').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#dealer=${encodeURIComponent(uid)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(T('linkCopied'));
      } catch { toast(url); }
    });
    const grid = el('dealerStockGrid'), status = el('dealerStockStatus'), more = el('dealerStockMore');
    const pageSize = 12;
    let cursor;
    async function load() {
      more.disabled = true;
      more.textContent = L('loadMore');
      status.textContent = L('loading');
      try {
        const query = m.query(m.collection(db, 'listings'), m.where('uid', '==', uid), m.where('status', '==', 'active'),
          m.where('sellerType', '==', 'dealer'), m.orderBy(m.documentId()), ...(cursor ? [m.startAfter(cursor)] : []), m.limit(pageSize));
        const rows = await m.getDocsFromServer(query);
        if (!grid.isConnected) return;
        if (!rows.empty) cursor = rows.docs.at(-1);
        grid.insertAdjacentHTML('beforeend', rows.docs.filter(row => row.data().category === 'vehicles').map(row => carCard({ ...row.data(), id: row.id })).join(''));
        status.textContent = grid.children.length ? '' : L('dealerStockEmpty');
        more.classList.toggle('hidden', rows.size < pageSize);
      } catch {
        status.textContent = L('featureUnavailable');
        more.textContent = L('retry');
        more.classList.remove('hidden');
      } finally {
        more.disabled = false;
      }
    }
    more.addEventListener('click', load);
    await load();
  }

  function attachListing(listing, panel) {
    const uid = state.user?.uid;
    const viewKey = `${new Date().toISOString().slice(0, 10)}:${uid}:${listing.id}`;
    if (uid && state.user.emailVerified && !state.user.isPreview && listing.uid !== uid && !dealerViews.has(viewKey)) {
      dealerViews.add(viewKey);
      void callSecureMarketplace('recordDealerListingView', { listingId: listing.id }).catch(() => dealerViews.delete(viewKey));
    }
    if (!state.fb || !listing.uid) return;
    void state.fb.modules.getDocFromServer(profileRef(listing.uid)).then(snapshot => {
      const profile = snapshot.data();
      if (!panel.isConnected || !profile?.published) return;
      panel.innerHTML = `<button class="outline-btn" type="button">${h(profile.companyName)} · ${h(L('dealerApprovedPublic'))}</button>`;
      panel.querySelector('button').addEventListener('click', () => void openPublic(listing.uid, listing.id));
    }).catch(() => {});
  }

  function openApplication() {
    const user = state.user;
    if (!user || user.isPreview) return;
    modal(`<h2 id="modalTitle">${h(L('dealerApply'))}</h2>
      <form id="dealerForm" class="form-stack">
        <label>${h(L('dealerCompany'))}<input id="dealerCompany" required minlength="2" maxlength="120"
          autocomplete="organization" value="${h(application?.companyName ?? '')}"></label>
        <button class="primary-btn" type="submit">${h(L('dealerSend'))}</button>
        <p class="helper" role="status"></p>
      </form>`);
    const form = el('dealerForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = el('dealerCompany').value.trim();
      if (name.length < 2) {
        form.querySelector('[role=status]').textContent = L('dealerCompany');
        return;
      }
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await saveApplication(user, name);
        if (form.isConnected) openAuth();
      } catch {
        form.querySelector('[role=status]').textContent = L('dealerSaveError');
      } finally {
        button.disabled = false;
      }
    });
  }

  function showReview() {
    if (!canReview) return;
    modal(`<h2 id="modalTitle">${h(L('dealerReview'))}</h2><div id="dealerQueue" class="form-stack" aria-live="polite"></div>`);
    const panel = el('dealerQueue');
    const uid = state.user.uid;
    const { db, modules } = state.fb;
    async function loadQueue() {
      panel.textContent = L('loading');
      try {
        const rows = await modules.getDocs(modules.query(modules.collection(db, 'dealerApplications'),
          modules.where('status', '==', 'pending'), modules.limit(50)));
        if (!panel.isConnected || state.user?.uid !== uid) return;
        if (!rows.size) {
          panel.textContent = L('dealerQueueEmpty');
          return;
        }
        panel.replaceChildren(...rows.docs.map(row => {
          const { companyName, email } = row.data();
          const section = document.createElement('section');
          section.className = 'dealer-queue-item';
          section.innerHTML = `<strong>${h(companyName)}</strong><p>${h(email)}</p><div class="detail-actions">
            <button type="button" class="primary-btn" data-dealer-decision="approved">${h(L('dealerApprove'))}</button>
            <button type="button" class="outline-btn" data-dealer-decision="rejected">${h(L('dealerReject'))}</button></div>`;
          section.querySelectorAll('button').forEach(button => button.addEventListener('click', async () => {
            section.querySelectorAll('button').forEach(action => action.disabled = true);
            try {
              await modules.updateDoc(row.ref, {
                status: button.dataset.dealerDecision,
                reviewerUid: uid,
                updatedAt: modules.serverTimestamp(),
              });
              if (panel.isConnected) await loadQueue();
            } catch {
              toast(L('dealerSaveError'));
              if (panel.isConnected) await loadQueue();
            }
          }));
          return section;
        }));
      } catch {
        panel.textContent = L('dealerLoadError');
      }
    }
    void loadQueue();
  }

  return {
    connectAccount, renderAccount, refreshReviewer, saveApplication, submitVerified,
    openPublic, attachListing,
    approved: () => application?.status === 'approved',
  };
}
