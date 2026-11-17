// Limba 1.5 Web marketplace: Firebase is the source of truth; no local-only trust data.
import {mt} from './marketplace-i18n.js';

export function createMarketplace({getUser,getFirebase,popup,closePopup,notify,openAuth,escape:esc,
  formatPrice,onNavigate,rerender}) {
  const profiles=new Map(), loading=new Set();
  let activeListeners=[],inboxListener=null,currentChat=null;
  const $=id=>document.getElementById(id);
  const tr=k=>mt(k,document.documentElement.lang||'de');
  const current=()=>getFirebase()?.auth?.currentUser || null;
  const time=t=>t?.toDate?.()?.toLocaleString(document.documentElement.lang||'de')||'—';
  const error=e=>notify(e?.message?.replace(/^.*?: /,'')||tr('error'));
  const run=async (name,payload={})=>{
    const f=getFirebase();
    if(!f?.functions||!f.modules?.httpsCallable)throw new Error(tr('offline'));
    return (await f.modules.httpsCallable(f.functions,name)(payload)).data;
  };
  const stopStreams=()=>{for(const unsub of activeListeners)unsub();activeListeners=[];currentChat=null;};
  const trustFor=uid=>{
    if(!uid)return '<div class="trust-line"><span>◈</span> '+esc(tr('demo'))+'</div>';
    const p=profiles.get(uid);
    if(!p)return '<div class="trust-line"><span>◈</span> '+esc(tr('newSeller'))+'</div>';
    const n=Number(p.sellerRatingCount||0);
    return '<div class="trust-line"><span>★ '+esc(n?String(p.sellerRatingAverage||0):'—')+
      ' ('+esc(String(n))+')</span><span>'+esc(p.phoneVerified?'✓ '+tr('verified'):tr('notVerified'))+
      '</span><span>'+esc(p.alias||tr('member'))+'</span></div>';
  };
  const loadTrust=cars=>{
    const f=getFirebase();if(!f)return;
    for(const uid of new Set(cars.map(x=>x.uid).filter(Boolean))) {
      if(profiles.has(uid)||loading.has(uid))continue;
      loading.add(uid);
      f.modules.getDoc(f.modules.doc(f.db,'profiles',uid))
        .then(doc=>{profiles.set(uid,doc.exists()?doc.data():{});rerender()})
        .catch(()=>profiles.set(uid,{})).finally(()=>loading.delete(uid));
    }
  };
  async function requirePhone() {
    if(!current()||getUser()?.isPreview){openAuth();return false;}
    try{
      await current().reload();
      const token=await current().getIdTokenResult(true);
      if(!current().emailVerified){notify(tr('verifyEmail'));return false;}
      if(!token.claims.phone_number){openPhoneVerification();return false;}
      return true;
    }catch(e){error(e);return false;}
  }
  async function startConversation(listingId) {
    if(!(await requirePhone()))return;
    try{const res=await run('createConversation',{listingId});openChat(res.conversationId);}
    catch(e){error(e);}
  }
  function openPhoneVerification() {
    popup('<div class="market-panel"><h2 id="modalTitle">'+esc(tr('phoneTitle'))+'</h2>'+
      '<p>'+esc(tr('phoneNote'))+'</p><form id="phoneForm" class="market-form">'+
      '<label>'+esc(tr('phoneNumber'))+'<input id="phoneNumber" type="tel" autocomplete="tel" placeholder="+41…" required></label>'+
      '<div id="phoneCaptcha"></div><button class="primary-btn">'+esc(tr('sendCode'))+'</button></form>'+
      '<form id="codeForm" class="market-form hidden"><label>'+esc(tr('smsCode'))+
      '<input id="smsCode" inputmode="numeric" autocomplete="one-time-code" required></label>'+
      '<button class="primary-btn">'+esc(tr('verify'))+'</button></form></div>');
    let verifier,confirmation;
    $('phoneForm').addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        const f=getFirebase();const user=current();if(!user)throw Error(tr('login'));
        verifier=new f.modules.RecaptchaVerifier(f.auth,'phoneCaptcha',{size:'normal'});
        confirmation=await f.modules.linkWithPhoneNumber(user,$('phoneNumber').value.trim(),verifier);
        $('phoneForm').classList.add('hidden');$('codeForm').classList.remove('hidden');
      }catch(err){error(err);try{verifier?.clear()}catch{}}
    });
    $('codeForm').addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        await confirmation.confirm($('smsCode').value.trim());
        await current().getIdToken(true);
        await run('syncPublicProfile',{}).catch(()=>{});
        notify(tr('verified'));closePopup();
      }catch(err){error(err)}
    });
  }
  function decorateDetail(car) {
    if(!$('detailShare')||car.isDemo||car.isPreview||!car.uid)return;
    const container=document.createElement('section');container.className='seller-panel';
    container.innerHTML='<div class="seller-panel-head"><h3>'+esc(tr('sellerProfile'))+'</h3><span id="sellerTrust">'+trustFor(car.uid)+'</span></div>'+
      '<div class="detail-cta"><button id="marketMessage" class="primary-btn">'+esc(tr('message'))+'</button>'+
      '<button id="marketOffer" class="outline-btn">'+esc(tr('offer'))+'</button></div>'+
      '<div id="sellerReviews" class="review-list"></div>';
    $('detailShare').parentElement.insertAdjacentElement('afterend',container);
    $('marketMessage').addEventListener('click',()=>startConversation(car.id));
    $('marketOffer').addEventListener('click',()=>startConversation(car.id));
    loadSellerReviews(car.uid,container);
  }
  async function loadSellerReviews(uid,container) {
    const f=getFirebase();if(!f)return;
    try{
      const p=await f.modules.getDoc(f.modules.doc(f.db,'profiles',uid));
      if(!container.isConnected)return;
      const info=p.data()||{};
      container.querySelector('#sellerTrust').innerHTML=trustFor(uid);
      const average=Number(info.sellerRatingAverage||0),count=Number(info.sellerRatingCount||0);
      const header=document.createElement('p');header.className='muted-copy';
      header.textContent=(info.alias||tr('member'))+' · ★ '+(count?average.toFixed(2):'—')+' ('+count+')';
      container.querySelector('.seller-panel-head').after(header);
      const reviews=await f.modules.getDocs(f.modules.query(f.modules.collection(f.db,'reviews'),
        f.modules.where('revieweeUid','==',uid),f.modules.where('status','==','visible'),
        f.modules.orderBy('createdAt','desc'),f.modules.limit(5)));
      if(!container.isConnected)return;
      container.querySelector('#sellerReviews').innerHTML=reviews.docs
        .filter(d=>d.data().revieweeRole==='seller')
        .map(d=>'<div class="review-item"><strong>★ '+Number(d.data().stars)+'/5</strong><p>'+
          esc(d.data().comment||d.data().tags?.join(' · ')||'')+'</p></div>').join('');
    }catch(e){console.warn('reviews',e)}
  }
  function openChat(conversationId) {
    stopStreams();
    currentChat=conversationId;
    const f=getFirebase();if(!f){notify(tr('offline'));return;}
    popup('<div class="market-panel"><h2 id="modalTitle">'+esc(tr('chat'))+'</h2>'+
      '<div class="chat-frame" id="chatMessages" aria-live="polite">'+esc(tr('loading'))+'</div>'+
      '<div id="chatOffers" class="offer-stack"></div><div id="chatTransaction"></div>'+
      '<form id="chatForm" class="chat-form"><label class="sr-only" for="chatText">'+esc(tr('message'))+
      '</label><input id="chatText" maxlength="1000" required placeholder="'+esc(tr('writeMessage'))+'">'+
      '<button class="primary-btn">'+esc(tr('send'))+'</button></form>'+
      '<form id="offerForm" class="market-form offer-form"><label>'+esc(tr('offerAmount'))+
      '<input id="offerAmount" type="number" min="1" max="999999999" step="1" required></label>'+
      '<button class="outline-btn">'+esc(tr('submitOffer'))+'</button></form>'+
      '<p class="muted-copy">'+esc(tr('noPayment'))+'</p></div>');
    $('chatForm').addEventListener('submit',async e=>{
      e.preventDefault();const text=$('chatText').value.trim();if(!text)return;
      const button=e.submitter;button.disabled=true;
      try{await run('sendMessage',{conversationId,text});$('chatText').value=''}
      catch(err){error(err)}finally{button.disabled=false;}
    });
    $('offerForm').addEventListener('submit',async e=>{
      e.preventDefault();const amountEur=Number($('offerAmount').value);
      const button=e.submitter;button.disabled=true;
      try{await run('createOffer',{conversationId,amountEur,validUntil:new Date(Date.now()+86400000).toISOString()});
        $('offerAmount').value='';}
      catch(err){error(err)}finally{button.disabled=false;}
    });
    const c=f.modules.collection(f.db,'conversations',conversationId);
    activeListeners.push(f.modules.onSnapshot(
      f.modules.query(f.modules.collection(c,'messages'),f.modules.orderBy('createdAt','asc'),f.modules.limit(100)),
      snap=>{
        if(!currentChat||!$('chatMessages'))return;
        const uid=current()?.uid;
        $('chatMessages').innerHTML=snap.docs.length?snap.docs.map(d=>{
          const m=d.data();return '<div class="chat-bubble '+(m.senderUid===uid?'mine':'')+'">'+
            '<p>'+esc(m.text||'')+'</p><small>'+esc(time(m.createdAt))+'</small></div>';
        }).join(''):'<p>'+esc(tr('emptyMessages'))+'</p>';
        $('chatMessages').scrollTop=$('chatMessages').scrollHeight;
      },error));
    activeListeners.push(f.modules.onSnapshot(f.modules.collection(c,'offers'),snap=>{
      if(!currentChat||!$('chatOffers'))return;
      $('chatOffers').innerHTML=snap.docs.sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))
        .map(d=>{
          const o=d.data(),oid=conversationId+'~'+d.id,canRespond=o.creatorUid!==current()?.uid&&o.status==='open';
          return '<article class="offer-card"><strong>'+esc(formatPrice(o.amountEur))+'</strong> · '+
            esc(tr(o.status)||o.status)+'<p>'+esc(tr('expires'))+' '+esc(time(o.validUntil))+'</p>'+
            (canRespond?'<div><button class="primary-btn" data-offer-id="'+esc(oid)+'" data-answer="accept">'+esc(tr('accept'))+
            '</button> <button class="outline-btn" data-offer-id="'+esc(oid)+'" data-answer="reject">'+esc(tr('reject'))+'</button></div>':'')+
            '</article>';
        }).join('');
      $('chatOffers').querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',async()=>{
        b.disabled=true;try{await run('respondToOffer',{offerId:b.dataset.offerId,action:b.dataset.answer})}
        catch(err){error(err)}finally{b.disabled=false}
      }));
    },error));
    activeListeners.push(f.modules.onSnapshot(f.modules.doc(f.db,'transactions',conversationId),snapshot=>{
      if(!currentChat||!$('chatTransaction'))return;
      const t=snapshot.data();
      if(!t){$('chatTransaction').textContent='';return;}
      const uid=current()?.uid;
      const btn=t.status==='reserved'&&uid===t.sellerUid?['confirmHandover','handover']:
        t.status==='handover_confirmed'&&uid===t.buyerUid?['confirmPurchase','purchase']:
        t.status==='completed'?['review','review'] : null;
      $('chatTransaction').innerHTML='<div class="transaction-panel"><strong>'+esc(tr('transaction'))+
        ': '+esc(tr(t.status)||t.status)+'</strong><p>'+esc(formatPrice(t.agreedPriceEur))+'</p>'+
        (btn?'<button class="primary-btn" id="transactionAction">'+esc(tr(btn[1]))+'</button>':'')+'</div>';
      if(btn)$('transactionAction').addEventListener('click',async()=>{
        if(btn[0]==='review')return openReview(t);
        try{await run(btn[0],{transactionId:conversationId});notify(tr('saved'))}catch(err){error(err)}
      });
    },error));
  }
  function openReview(transaction) {
    const uid=current()?.uid;if(!uid)return;
    const f=getFirebase(),rid=transaction.conversationId+'_'+uid;
    f.modules.getDoc(f.modules.doc(f.db,'reviews',rid)).then(snap=>{
      const old=snap.data();
      const role=transaction.sellerUid===uid?'buyer':'seller';
      const allowed=role==='seller'?['descriptionAccurate','goodCommunication','reliable','goodHandover']:
        ['goodCommunication','punctual','reliable','smoothClosing'];
      popup('<div class="market-panel"><h2 id="modalTitle">'+esc(tr('review'))+'</h2>'+
        (old?.status==='withdrawn'?'<p>'+esc(tr('withdrawn'))+'</p>':
        '<form id="reviewForm" class="market-form"><label>'+esc(tr('stars'))+
        '<select id="reviewStars">'+[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(old?.stars===n?'selected':'')+'>'+n+' ★</option>').join('')+
        '</select></label><fieldset><legend>'+esc(tr('traits'))+'</legend>'+
        allowed.map(t=>'<label class="trait"><input type="checkbox" value="'+t+'" '+(old?.tags?.includes(t)?'checked':'')+'>'+esc(tr(t))+'</label>').join('')+
        '</fieldset><label>'+esc(tr('comment'))+'<textarea id="reviewComment" maxlength="500">'+esc(old?.comment||'')+'</textarea></label>'+
        '<button class="primary-btn">'+esc(tr('saveReview'))+'</button></form>'+
        (old?.status==='visible'?'<button class="outline-btn" id="withdrawReview">'+esc(tr('withdraw'))+'</button>':'')+
        '<p class="muted-copy">'+esc(tr('editWindow'))+'</p>')+'</div>');
      $('reviewForm')?.addEventListener('submit',async e=>{
        e.preventDefault();const selected=Array.from(document.querySelectorAll('.trait input:checked')).map(n=>n.value);
        if(selected.length>3){notify(tr('maxTags'));return;}
        const data={stars:Number($('reviewStars').value),tags:selected,comment:$('reviewComment').value};
        try{await run(old?'editReview':'submitReview',old?{reviewId:rid,...data}:{transactionId:transaction.conversationId,...data});
          notify(tr('saved'));closePopup();}
        catch(err){error(err)}
      });
      $('withdrawReview')?.addEventListener('click',async()=>{
        try{await run('withdrawReview',{reviewId:rid});notify(tr('withdrawn'));closePopup();}
        catch(err){error(err)}
      });
    }).catch(error);
  }
  function renderInbox() {
    const area=$('messageThreads'),f=getFirebase(),uid=current()?.uid;
    if(!area)return;
    if(inboxListener){inboxListener();inboxListener=null;}
    if(!f||!uid){area.innerHTML='<p>'+esc(tr('loginForChat'))+'</p><button id="chatLogin" class="primary-btn">'+
      esc(tr('login'))+'</button>';$('chatLogin').onclick=openAuth;return;}
    area.innerHTML='<p>'+esc(tr('loading'))+'</p>';
    inboxListener=f.modules.onSnapshot(f.modules.query(f.modules.collection(f.db,'conversations'),
      f.modules.where('participantUids','array-contains',uid),f.modules.orderBy('lastMessageAt','desc'),
      f.modules.limit(80)),snap=>{
      area.innerHTML=snap.empty?'<p>'+esc(tr('emptyMessages'))+'</p>':snap.docs.map(doc=>{
        const c=doc.data();
        return '<button class="thread-row" data-chat="'+esc(doc.id)+'"><b>'+esc(c.lastMessagePreview||tr('newConversation'))+
          '</b><small>'+esc(time(c.lastMessageAt))+'</small></button>';
      }).join('');
      area.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>openChat(b.dataset.chat));
    },error);
  }
  async function renderProfile() {
    const area=$('profileContent'),f=getFirebase(),uid=current()?.uid;
    if(!area)return;
    if(!f||!uid){area.innerHTML='<p>'+esc(tr('login'))+'</p>';return;}
    area.innerHTML='<p>'+esc(tr('loading'))+'</p>';
    try{
      const ref=f.modules.doc(f.db,'profiles',uid);
      const snapshot=await f.modules.getDoc(ref);
      let data=snapshot.data()||{};
      if(!snapshot.exists){
        await f.modules.setDoc(ref,{alias:current().email?.split('@')[0]?.slice(0,60)||'Mitglied',
          memberSince:f.modules.serverTimestamp()});
        data=(await f.modules.getDoc(ref)).data()||{};
      }
      profiles.set(uid,data);
      area.innerHTML='<div class="profile-hero"><div class="profile-avatar">'+esc((data.alias||'M').charAt(0).toUpperCase())+
        '</div><div><h3>'+esc(data.alias||tr('member'))+'</h3><p>'+esc(tr('memberSince'))+
        ' '+esc(time(data.memberSince))+'</p><p>'+esc(current().emailVerified?'✓ '+tr('emailVerified'):tr('verifyEmail'))+
        ' · '+esc(current().phoneNumber?'✓ '+tr('phoneVerified'):tr('notVerified'))+'</p></div></div>'+
        '<form id="aliasForm" class="market-form"><label>'+esc(tr('alias'))+
        '<input id="aliasValue" minlength="2" maxlength="60" value="'+esc(data.alias||'')+'" required></label>'+
        '<button class="outline-btn">'+esc(tr('save'))+'</button></form>'+
        '<div class="profile-scores"><div>★ '+esc(String(data.sellerRatingAverage||'—'))+
        '<small>'+esc(tr('asSeller'))+' · '+esc(String(data.sellerRatingCount||0))+'</small></div>'+
        '<div>★ '+esc(String(data.buyerRatingAverage||'—'))+
        '<small>'+esc(tr('asBuyer'))+' · '+esc(String(data.buyerRatingCount||0))+'</small></div></div>'+
        '<div class="profile-tools"><button class="outline-btn" id="profilePhone">'+esc(tr('phoneTitle'))+
        '</button><button class="outline-btn" id="profilePush">'+esc(tr('push'))+'</button></div>'+
        '<div class="profile-tabs"><button class="outline-btn" data-role="seller">'+esc(tr('asSeller'))+
        '</button><button class="outline-btn" data-role="buyer">'+esc(tr('asBuyer'))+'</button></div>'+
        '<div id="roleReviews" class="review-list"></div>';
      $('aliasForm').onsubmit=async e=>{e.preventDefault();try{
        await f.modules.updateDoc(ref,{alias:$('aliasValue').value.trim()});notify(tr('saved'));renderProfile();}
        catch(err){error(err)}};
      $('profilePhone').onclick=openPhoneVerification;
      $('profilePush').onclick=enablePush;
      area.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>showProfileReviews(uid,b.dataset.role));
      showProfileReviews(uid,'seller');
    }catch(e){error(e);area.textContent=tr('error');}
  }
  async function showProfileReviews(uid,role) {
    const f=getFirebase(),area=$('roleReviews');if(!f||!area)return;
    area.textContent=tr('loading');
    try{
      const snap=await f.modules.getDocs(f.modules.query(f.modules.collection(f.db,'reviews'),
        f.modules.where('revieweeUid','==',uid),f.modules.where('status','==','visible'),
        f.modules.orderBy('createdAt','desc'),f.modules.limit(50)));
      if(!area.isConnected)return;
      const entries=snap.docs.filter(d=>d.data().revieweeRole===role);
      area.innerHTML=entries.length?entries.map(d=>'<div class="review-item"><strong>★ '+
        esc(String(d.data().stars))+'/5</strong><p>'+esc(d.data().comment||'')+'</p></div>').join(''):
        '<p>'+esc(tr('noReviews'))+'</p>';
    }catch(e){error(e)}
  }
  async function enablePush() {
    if(!(await requirePhone()))return;
    try{
      const f=getFirebase(),key=window.LIMBA_VAPID_PUBLIC_KEY;
      if(!key)throw Error(tr('pushNotConfigured'));
      if(!('serviceWorker' in navigator)||!('Notification' in window))throw Error(tr('pushNotSupported'));
      const permission=await Notification.requestPermission();
      if(permission!=='granted')return notify(tr('pushDenied'));
      if(!f.modules.isSupported||!(await f.modules.isSupported()))throw Error(tr('pushNotSupported'));
      const serviceWorkerRegistration=await navigator.serviceWorker.register('firebase-messaging-sw.js');
      const token=await f.modules.getToken(f.modules.getMessaging(f.app),{vapidKey:key,serviceWorkerRegistration});
      await run('registerPushToken',{token,platform:'web',appVersion:'1.5.0'});
      notify(tr('pushEnabled'));
    }catch(e){error(e)}
  }
  function onAuth(user) {
    profiles.clear();if(inboxListener){inboxListener();inboxListener=null;}
    if(user && !user.isPreview)run('syncPublicProfile',{}).catch(()=>{});
    if($('profileView')&&!$('profileView').classList.contains('hidden'))renderProfile();
    if($('messagesView')&&!$('messagesView').classList.contains('hidden'))renderInbox();
  }
  return {startConversation,openChat,openReview,openPhoneVerification,decorateDetail,loadTrust,trustFor,
    renderInbox,renderProfile,stopStreams,onAuth,enablePush};
}
