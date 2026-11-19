export function createDealerAccountUI({ el, state, h, L, T, modal, toast, openAuth }) {
  let application;
  let canReview = false;
  let stopApplication;
  let reviewingUid = null;
  let loadingVerification = false;

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
      ${canReview ? `<button type="button" id="dealerReview" class="primary-btn">${h(L('dealerReview'))}</button>` : ''}
      </div>`;
    el('dealerApply')?.addEventListener('click', openApplication);
    el('dealerReview')?.addEventListener('click', showReview);
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
    approved: () => application?.status === 'approved',
  };
}
