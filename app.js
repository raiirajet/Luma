import {LANGS,tr,GTR_COPY} from './cars-i18n.js';
import {icon} from './icons.js';
import {ft} from './feature-i18n.js';
import {mvpText} from './mvp-i18n.js';
import {CAR_MAKES,normalizeMake,resolveCarMake,validCarMake,modelSuggestions} from './car-brands.js';

const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COUNTRIES=[['AL','🇦🇱','Albania'],['TR','🇹🇷','Türkiye'],['GR','🇬🇷','Greece'],['RS','🇷🇸','Serbia'],['SI','🇸🇮','Slovenia'],['XK','🇽🇰','Kosovo'],['MK','🇲🇰','North Macedonia'],['HR','🇭🇷','Croatia'],['BA','🇧🇦','Bosnia and Herzegovina'],['ME','🇲🇪','Montenegro'],['BG','🇧🇬','Bulgaria'],['RO','🇷🇴','Romania']];
// One fictional sample listing. Photo shows a real black Nissan GT-R, but does not
// document this sample's year, equipment, mileage, service history or asking price.
// Photo: Joshua Spence, CC BY-SA 4.0, Wikimedia Commons.
const GTR_PHOTO='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Nissan_GT-R_R35_Black_Edition.JPG/1280px-Nissan_GT-R_R35_Black_Edition.JPG';
const GTR_PHOTO_PAGE='https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG';
const DEMO=[{
 id:'demo-nissan-gtr',category:'vehicles',status:'active',make:'Nissan',model:'GT-R',
 title:'Nissan GT-R R35 Black Edition',year:2013,mileage:49500,fuel:'petrol',
 transmission:'automatic',body:'coupe',power:550,price:68900,country:'HR',city:'Zagreb',
 sellerType:'privateSeller',condition:'used',accidentStatus:'unknown',conditionNote:'',color:'black',image:GTR_PHOTO,images:[GTR_PHOTO],
 description:'',uid:null,contactEmail:'',createdAt:Date.now(),isDemo:true
}];
const key=k=>`luma_auto_${k}`;
function restore(name,fallback){try{const raw=localStorage.getItem(key(name));if(raw!==null)return JSON.parse(raw)??fallback;const legacy={language:'locale',countries:'preferredCountries',favorites:'favorites',searches:'searches',swipeSeen:'swipeTutorialSeen'}[name];if(legacy){const previous=localStorage.getItem('luma_'+legacy);if(previous!==null)return JSON.parse(previous)??fallback}return fallback}catch{return fallback}}
function persist(name,val){try{localStorage.setItem(key(name),JSON.stringify(val))}catch{}}
const state={locale:restore('language','de'),view:'home',filters:{keyword:'',make:'',model:'',priceTo:'',yearFrom:'',mileageTo:'',fuel:'',transmission:'',body:'',sellerType:'',priceFrom:'',yearTo:''},countries:restore('countries',[]),favorites:restore('favorites',[]).filter(id=>!String(id).startsWith('demo-')||id==='demo-nissan-gtr'),searches:restore('searches',[]),listings:[...restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id),...DEMO],swipeIndex:0,user:null,firebaseReady:false,fb:null,photoIndex:0,swipeSeen:restore('swipeSeen',false)};
const previewSession=restore('previewSession',null);if(previewSession?.username){const username=previewSession.username;state.user={uid:'preview-'+username,email:username,isPreview:true,emailVerified:true};state.favorites=restore('user:'+state.user.uid+':favorites',[]);state.searches=restore('user:'+state.user.uid+':searches',[]);state.countries=restore('user:'+state.user.uid+':countries',[])}
if(!LANGS.some(([c])=>c===state.locale))state.locale='de';
const T=k=>tr(k,state.locale);
const F=k=>ft(k,state.locale);
const W=k=>mvpText(k,state.locale);
function persistAccount(name,value){
 const uid=state.user?.uid;
 persist(uid?'user:'+uid+':'+name:name,value);
}
function switchAccount(user){
 state.user=user;
 const suffix=user?.uid?'user:'+user.uid+':':'';
 state.favorites=restore(suffix+'favorites',[]).filter(x=>!String(x).startsWith('demo-')||x==='demo-nissan-gtr');
 state.searches=restore(suffix+'searches',[]);
 state.countries=restore(suffix+'countries',[]);
}
let serverActive=[],serverOwned=[],unsubscribeOwned=null;
function mergeListings(){
 const local=restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id);
 const combined=new Map([...DEMO,...local,...serverActive,...serverOwned].map(car=>[car.id,car]));
 state.listings=Array.from(combined.values());
 renderAll();
}

const D=k=>(GTR_COPY[state.locale]||GTR_COPY.de)[k]||GTR_COPY.de[k]||k;
const price=x=>new Intl.NumberFormat(state.locale==='cnr'?'sr-Latn':state.locale,{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(x)||0);
const number=x=>new Intl.NumberFormat(state.locale==='cnr'?'sr-Latn':state.locale).format(Number(x)||0);
const flag=c=>COUNTRIES.find(x=>x[0]===c)?.[1]||'🌐';
const countryLabel=c=>{if(c==='XK')return ({de:'Kosovo',en:'Kosovo',sq:'Kosovë',tr:'Kosova',el:'Κόσοβο','sr-Cyrl':'Косово',mk:'Косово',bg:'Косово'})[state.locale]||'Kosovo';try{return new Intl.DisplayNames([state.locale==='cnr'?'sr-Latn':state.locale],{type:'region'}).of(c)||c}catch{return COUNTRIES.find(x=>x[0]===c)?.[2]||c}};
const safeURL=v=>{const s=String(v||'');if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{1,1400000}$/.test(s))return s;if(s==='assets/limba/icons/car.png')return s;try{const x=new URL(s);return x.protocol==='https:'?x.href:''}catch{return ''}};
const labelFor=(field,v)=>T(v||field);
const isSample=x=>x?.id==='demo-nissan-gtr';
const isDemo=x=>Boolean(x?.isDemo||x?.isPreview||String(x?.id||'').startsWith('demo-'));
const toast=(msg)=>{$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3200)};
function applyTranslations(){document.documentElement.lang=state.locale;document.title=`Limba Auto · ${T('heroTitle1')}`;document.querySelector('meta[name="description"]').content=T('footerCar');document.querySelector('meta[property="og:title"]').content=document.title;document.querySelector('meta[property="og:description"]').content=T('heroDescription');document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=T(el.dataset.i18n)});document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',T(el.dataset.i18nAria)));document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=T(el.dataset.i18nPlaceholder));$('loginText').textContent=state.user?(state.user.email?.split('@')[0]||T('logout')):T('login');$('loginBtn').setAttribute('aria-label',$('loginText').textContent);$('accountStatus').textContent=state.user?.isPreview?F('previewMode'):T(state.user?'profileSync':'guestSync');$('fabAdd').setAttribute('aria-label',F('addVehicle'));$('fabAdd').title=F('addVehicle');$('fabAddLabel').textContent=F('addVehicle');$('settingsLanguageLabel').textContent=F('chooseLanguage');$('accountSettingsBtn').textContent=state.user?F('accountLogin')+' · '+state.user.email:F('accountLogin');$('swipeHelp').setAttribute('aria-label',T('learnSwipeAgain'));$('swipeHome').setAttribute('aria-label',T('backToMarket'));$('swipeFavorite').setAttribute('aria-label',T('saveFavourites'));$('modalClose').setAttribute('aria-label',T('cancel'));$('swipeTutorialBack').querySelector('span').textContent=D('backToCar');document.querySelector('.swipe-photo').setAttribute('aria-label',T('swipeTitle'));renderInputs();renderAll()}
function opts(items,first,chosen){return `<option value="">${h(T(first))}</option>`+items.map(v=>`<option value="${h(v)}" ${chosen===v?'selected':''}>${h(T(v))}</option>`).join('')}
function renderModelOptions(){const f=state.filters;const models=f.make?modelSuggestions(f.make,state.listings):[...new Set(state.listings.map(x=>x.model).filter(Boolean))].sort();$('modelOptions').innerHTML=models.map(v=>`<option value="${h(v)}"></option>`).join('')}
function renderInputs(){const f=state.filters;$('makeOptions').innerHTML=CAR_MAKES.map(v=>`<option value="${h(v)}"></option>`).join('');renderModelOptions();['fuel','transmission','body','sellerType'].forEach(field=>{const values={fuel:['petrol','diesel','hybrid','electric'],transmission:['manual','automatic'],body:['suv','sedan','wagon','hatchback','coupe'],sellerType:['privateSeller','dealer']}[field];const first={fuel:'allFuel',transmission:'allTransmission',body:'allBody',sellerType:'allSeller'}[field];$(field).innerHTML=opts(values,first,f[field])});
 const yearOptions=Array.from({length:new Date().getFullYear()-1949},(_,i)=>new Date().getFullYear()+1-i);['yearFrom','yearTo'].forEach(field=>{$(field).innerHTML=`<option value="">${h(T('allYear'))}</option>`+yearOptions.map(y=>`<option value="${y}">${y}</option>`).join('')});$('mileageTo').innerHTML=`<option value="">${h(T('allMileage'))}</option>`+[10000,20000,30000,50000,75000,100000,125000,150000,200000,300000].map(v=>`<option value="${v}">${number(v)} ${T('kmUnit')}</option>`).join('');$('sort').innerHTML=[['latest','newest'],['priceLow','priceLow'],['priceHigh','priceHigh']].map(([v,l])=>`<option value="${v}">${h(T(l))}</option>`).join('');for(const id of Object.keys(f))if($(id))$(id).value=f[id];$('sort').value=state.sort||'latest'}
function setFilter(field,val){state.filters[field]=val;if(field==='make')state.filters.model='';if(field==='body')document.querySelectorAll('[data-body]').forEach(b=>b.classList.toggle('is-selected',b.dataset.body===val));if(field==='make'){state.filters.model='';$('model').value='';renderModelOptions()}renderAll()}
function filtered(){const f=state.filters;const term=f.keyword.trim().toLocaleLowerCase(state.locale);let items=state.listings.filter(x=>{
 if(x.category!=='vehicles'||(x.status&&x.status!=='active'))return false;
 if(x.isPreview&&(!state.user?.isPreview||x.uid!==state.user.uid))return false;
 if(state.countries.length&&!state.countries.includes(x.country))return false;
 if(term&&!`${x.title} ${x.make} ${x.model} ${x.city} ${x.description}`.toLocaleLowerCase(state.locale).includes(term))return false;
 if(f.make&&!normalizeMake(x.make).includes(normalizeMake(resolveCarMake(f.make))))return false;if(f.model&&!normalizeMake(x.model).includes(normalizeMake(f.model)))return false;
 if(f.body&&x.body!==f.body)return false;if(f.fuel&&x.fuel!==f.fuel)return false;if(f.transmission&&x.transmission!==f.transmission)return false;if(f.sellerType&&x.sellerType!==f.sellerType)return false;
 if(f.priceFrom&&Number(x.price)<Number(f.priceFrom))return false;if(f.priceTo&&Number(x.price)>Number(f.priceTo))return false;
 if(f.yearFrom&&Number(x.year)<Number(f.yearFrom))return false;if(f.yearTo&&Number(x.year)>Number(f.yearTo))return false;
 if(f.mileageTo&&Number(x.mileage)>Number(f.mileageTo))return false;return true});
 if(state.sort==='priceLow')items.sort((a,b)=>a.price-b.price);else if(state.sort==='priceHigh')items.sort((a,b)=>b.price-a.price);else items.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));return items}
function carCard(x){const liked=state.favorites.includes(x.id);return `<article class="car-card" data-open="${h(x.id)}" tabindex="0"><div class="car-img"><img loading="lazy" src="${h(safeURL(x.image))}" alt="${h(x.title)}"/><span class="car-tag">${h(isDemo(x)?F('previewOnly'):T(x.sellerType||'privateSeller'))}</span><button class="card-heart ${liked?'active':''}" data-like="${h(x.id)}" aria-label="${h(T('saveFavourites'))}">${icon('heart')}</button></div><div class="card-body"><h3 class="car-title">${h(x.title)}</h3><p class="car-sub">${h(T(x.fuel||'petrol'))} · ${h(T(x.transmission||'manual'))}</p><div class="car-specs"><span>${h(String(x.year||'—'))}</span><span>${number(x.mileage)} ${h(T('kmUnit'))}</span><span>${number(x.power)} ${h(T('powerUnit'))}</span></div><div class="car-bottom"><strong class="car-price">${price(x.price)}</strong><div class="car-location">${icon('location')} ${flag(x.country)} ${h(x.city)}<br>${h(countryLabel(x.country))}</div></div></div></article>`}
function renderAll(){const arr=filtered();$('carGrid').innerHTML=arr.map(carCard).join('');$('emptyResults').classList.toggle('hidden',arr.length!==0);$('resultCount').textContent=`${number(arr.length)} ${T('searchResultCount')}`;$('heroCount').textContent=number(arr.length);document.querySelectorAll('[data-body]').forEach(b=>b.classList.toggle('is-selected',b.dataset.body===state.filters.body));
 const fav=state.listings.filter(x=>state.favorites.includes(x.id)&&x.category==='vehicles');$('favoritesGrid').innerHTML=fav.length?fav.map(carCard).join(''):`<div class="empty-panel"><h3>${h(T('noCarsSaved'))}</h3></div>`;
 const mine=state.listings.filter(x=>state.user&&x.uid===state.user.uid&&x.category==='vehicles');
 $('mineGrid').innerHTML=mine.length?mine.map(x=>{
  const status=x.status||'active';
  const actions=['active','paused','sold'].filter(v=>v!==status).map(v=>'<button class="outline-btn" data-status="'+h(v)+'" data-status-id="'+h(x.id)+'">'+h(W('status'+v[0].toUpperCase()+v.slice(1)))+'</button>').join('');
  return '<div class="my-car-item">'+carCard(x)+'<div class="mine-actions"><span class="status-pill">'+h(W('statusLabel'))+': '+h(W('status'+status[0].toUpperCase()+status.slice(1)))+'</span><button class="outline-btn" data-edit="'+h(x.id)+'">'+h(W('editAd'))+'</button>'+actions+'<button class="outline-btn" data-delete="'+h(x.id)+'">'+h(T('removeAd'))+'</button></div></div>';
 }).join(''):`<div class="empty-panel"><h3>${h(T('noOwnCars'))}</h3></div>`;
 $('countryChoices').innerHTML=COUNTRIES.map(([c,fl])=>`<label class="country-choice ${state.countries.includes(c)?'is-active':''}"><input type="checkbox" value="${c}" ${state.countries.includes(c)?'checked':''}><span>${fl} ${h(countryLabel(c))}</span></label>`).join('');$('savedSearchesList').innerHTML=state.searches.length?state.searches.map((x,i)=>`<div class="saved-search-row"><span>${h(x.name||T('yourSavedSearch'))}</span><button data-apply="${i}">${h(T('repeatSearch'))}</button><button data-drop="${i}" aria-label="${h(T('delete'))}">${icon('close')}</button></div>`).join(''):`<p class="muted-copy">${h(T('noSearches'))}</p>`;
 renderSwipe()}
function showView(view,{fromHistory=false}={}){
 const views=['home','swipe','favorites','mine','settings'];if(!views.includes(view))return;
 const changed=state.view!==view;
 if(changed&&!fromHistory)history.pushState({lumaView:view},'',location.pathname+location.search);
 state.view=view;
 views.forEach(v=>$(v==='home'?'homeView':`${v}View`).classList.toggle('hidden',v!==view));
 document.querySelectorAll('.nav-link,.mobile-nav [data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
 document.body.style.overflow=view==='swipe'?'hidden':'';
 if(view!=='swipe')$('swipeTutorial').classList.add('hidden');
 window.scrollTo(0,0);
 if(view==='swipe'&&!state.swipeSeen)showTutorial();renderAll()
}
function showTutorial(){$('swipeTutorial').classList.remove('hidden')}
function dismissTutorial(){$('swipeTutorial').classList.add('hidden');state.swipeSeen=true;persist('swipeSeen',true)}
function hideTutorial(){$('swipeTutorial').classList.add('hidden')}
function renderSwipe(){const arr=filtered();if(!arr.length){$('swipeCard').innerHTML=`<div class="empty-panel" style="margin:25vh auto;max-width:480px"><h3>${h(T('emptyCars'))}</h3></div>`;$('swipeFavorite').classList.remove('active');return}state.swipeIndex=((state.swipeIndex%arr.length)+arr.length)%arr.length;const x=arr[state.swipeIndex];$('swipeCard').innerHTML=`<img src="${h(safeURL(x.image))}" alt="${h(x.title)}" draggable="false"><div class="swipe-shade"></div><div class="swipe-details"><span class="swipe-demo-badge">${h(isDemo(x)?F('previewOnly'):T('carsNav'))} · ${state.swipeIndex+1}/${arr.length}</span><h2>${h(x.title)}</h2><strong>${price(x.price)}</strong><p>${flag(x.country)} ${h(x.city)} · ${number(x.mileage)} ${h(T('kmUnit'))} · ${h(String(x.year))}</p></div>`;$('swipeFavorite').innerHTML=icon('heart');$('swipeFavorite').classList.toggle('active',state.favorites.includes(x.id))}
function swipeAction(dir){
 const arr=filtered();if(!arr.length)return;
 const x=arr[state.swipeIndex];
 if(dir==='right')return showDetails(x.id);
 if(dir==='up')return showDetails(x.id,{focusSpecs:true});
 if(dir==='left'){
  if(state.swipeIndex===arr.length-1){toast(D('onlyCar'));return}
  state.swipeIndex++;
 }
 if(dir==='down'){
  const n=arr.findIndex((z,i)=>i!==state.swipeIndex&&z.make===x.make);
  if(n<0){toast(D('noSimilar'));return}
  state.swipeIndex=n;
 }
 renderSwipe()
}
let modalReturnFocus=null;
function modal(content){if($('modal').classList.contains('hidden'))modalReturnFocus=document.activeElement;$('modalContent').innerHTML=content;$('modal').classList.remove('hidden');$('modalClose').focus()}
function closeModal({fromHistory=false}={}){
 const wasOpen=!$('modal').classList.contains('hidden');
 $('modal').classList.add('hidden');$('modalContent').innerHTML='';
 if(wasOpen){const target=modalReturnFocus?.isConnected?modalReturnFocus:(state.view==='swipe'?$('swipeCard'):null);try{target?.focus?.({preventScroll:true})}catch{}modalReturnFocus=null}
 if(wasOpen&&!fromHistory&&history.state?.lumaDetail)history.back();
}
const detailPair=(name,val)=>`<div><small>${h(F(name)!==name?F(name):T(name))}</small><strong>${h(val)}</strong></div>`;
function showDetails(id,{focusSpecs=false,fromHistory=false}={}){const x=state.listings.find(v=>v.id===id);if(!x)return;state.photoIndex=0;const returnTo=state.view==='swipe'?'swipe':'home';
 const images=(x.images||[x.image]).map(safeURL).filter(Boolean);const src=images[0]||safeURL(x.image);
 modal(`<button type="button" class="detail-back outline-btn" id="detailBack">${icon('arrow_left')} ${h(D(returnTo==='swipe'?'backToSwipe':'backToListing'))}</button><div class="detail-head"><div><span class="overline">${h(T('vehicleDetails'))}</span><h2 id="modalTitle">${h(x.title)}</h2><p>${flag(x.country)} ${h(x.city)}, ${h(countryLabel(x.country))}</p></div><div class="detail-price">${price(x.price)}</div></div><img class="details-image" id="detailImage" src="${h(src)}" alt="${h(x.title)}"/><div class="detail-actions" id="photoControls"><button class="outline-btn" id="photoPrev" aria-label="${h(T('photoPrevious'))}">${icon('arrow_left')}</button><button class="outline-btn" id="photoNext" aria-label="${h(T('photoNext'))}">${icon('arrow_right')}</button><button class="outline-btn" id="detailLike">${icon('heart')} ${h(T('saved'))}</button></div><h3 id="specsHeading">${h(T('technicalData'))}</h3><div class="spec-table">${detailPair('make',x.make)}${detailPair('model',x.model)}${detailPair('firstReg',String(x.year))}${detailPair('mileage',`${number(x.mileage)} ${T('kmUnit')}`)}${detailPair('fuel',T(x.fuel))}${detailPair('transmission',T(x.transmission))}${detailPair('body',T(x.body))}${detailPair('power',`${number(x.power)} ${T('powerUnit')}`)}${detailPair('sellerType',T(x.sellerType))}${detailPair('carCondition',T(x.condition==='new'?'conditionNew':'conditionUsed'))}${detailPair('accidentHistory',F(x.accidentStatus==='yes'?'accidentYes':x.accidentStatus==='no'?'accidentNo':'accidentUnknown'))}${x.conditionNote?detailPair('conditionShort',x.conditionNote):''}${isSample(x)?`${detailPair('color',D('black'))}${detailPair('engine','VR38DETT · 3.8 l V6 Bi-Turbo')}${detailPair('drive',D('awd'))}${detailPair('seats',D('fourSeats'))}`:''}</div><h3>${h(T('vehicleDescription'))}</h3><p class="vehicle-description">${h(isSample(x)?D('description'):(x.description||'—'))}</p>${isSample(x)?`<div class="sample-note">${h(D('singleDemoNotice'))}</div><p class="photo-credit">${h(D('photoCredit'))} <a href="${h(GTR_PHOTO_PAGE)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons · Joshua Spence · CC BY-SA 4.0</a></p>`:''}<div class="detail-actions"><button class="primary-btn" id="detailContact">${icon('messages')} ${h(T('askSeller'))}</button><button class="outline-btn" id="detailShare">${icon('share')} ${h(T('shareCar'))}</button></div>`);
 if(!isDemo(x)){
  const panel=document.createElement('div');panel.className='listing-report';
  const select=document.createElement('select');select.id='reportReason';select.setAttribute('aria-label',W('reportCar'));
  for(const reason of ['fraud','duplicate','inappropriate','other']){
   const option=document.createElement('option');option.value=reason;
   option.textContent=W({fraud:'reportFraud',duplicate:'reportDuplicate',inappropriate:'reportInappropriate',other:'reportOther'}[reason]);
   select.appendChild(option);
  }
  const button=document.createElement('button');button.className='outline-btn';button.type='button';
  button.textContent=W('reportCar');
  button.addEventListener('click',async()=>{
   if(!state.user||!state.fb){openAuth();return}
   if(!state.user.emailVerified){toast(W('verifiedRequired'));return}
   button.disabled=true;
   try{
    const m=state.fb.modules;
    await m.addDoc(m.collection(state.fb.db,'reports'),{listingId:x.id,reporterUid:state.user.uid,reason:select.value,createdAt:m.serverTimestamp()});
    toast(W('reportSent'));
   }catch(e){console.error('report failed',e);toast(T('uploadFailed'))}
   finally{button.disabled=false}
  });
  panel.append(select,button);$('detailShare').parentElement.insertAdjacentElement('afterend',panel);
 }
 if(!fromHistory)history.pushState({lumaView:state.view,lumaDetail:x.id},'',`#ad=${encodeURIComponent(x.id)}`);
 $('detailBack').addEventListener('click',()=>closeModal());
 if(focusSpecs)requestAnimationFrame(()=>$('specsHeading')?.scrollIntoView({block:'start',behavior:'smooth'}));
 if(images.length<=1){$('photoPrev').disabled=true;$('photoNext').disabled=true;$('photoControls').classList.add('single-photo')}
 let picIndex=0;const updatePic=()=>{$('detailImage').src=images[picIndex]||src};$('photoPrev').addEventListener('click',()=>{picIndex=(picIndex-1+images.length)%images.length;updatePic()});$('photoNext').addEventListener('click',()=>{picIndex=(picIndex+1)%images.length;updatePic()});$('detailLike').addEventListener('click',()=>{toggleFavorite(x.id);$('detailLike').innerHTML=icon('heart')+' '+h(T('saved'))});$('detailContact').addEventListener('click',()=>{if(isDemo(x)||!x.contactEmail){toast(F('contactPreview'));return}if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.contactEmail))window.location.href=`mailto:${encodeURIComponent(x.contactEmail)}?subject=${encodeURIComponent(x.title)}`});$('detailShare').addEventListener('click',async()=>{const url=location.origin+location.pathname+'#ad='+encodeURIComponent(x.id);try{await navigator.clipboard.writeText(url);toast(T('linkCopied'))}catch{toast(url)}})}
async function toggleFavorite(id){state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];persistAccount('favorites',state.favorites);renderAll();if(state.user&&state.fb){const {db,modules:m}=state.fb;try{const r=m.doc(db,'users',state.user.uid,'favorites',id);if(state.favorites.includes(id))await m.setDoc(r,{createdAt:m.serverTimestamp()});else await m.deleteDoc(r)}catch(e){console.warn('favorite sync',e)}}}
async function saveSearch(){const f={...state.filters};const name=[f.make,f.model,f.keyword].filter(Boolean).join(' ')||T('yourSavedSearch');state.searches=[{name,filters:f,countries:[...state.countries]},...state.searches].slice(0,20);persistAccount('searches',state.searches);await syncSearches();renderAll();toast(T('searchSaved'))}
async function syncSearches(){if(!state.user||!state.fb)return;try{const {db,modules:m}=state.fb;await m.setDoc(m.doc(db,'users',state.user.uid,'data','searches'),{items:state.searches})}catch(e){console.warn(e)}}
async function saveCountries(){persistAccount('countries',state.countries);if(state.user&&state.fb){try{const {db,modules:m}=state.fb;await m.setDoc(m.doc(db,'users',state.user.uid,'data','preferences'),{countries:state.countries})}catch(e){console.warn(e)}}$('prefsStatus').textContent=T(state.user?'profileSync':'guestSync');toast(T('settingsSaved'));renderAll()}
function resetFilters(){state.filters=Object.fromEntries(Object.keys(state.filters).map(k=>[k,'']));state.sort='latest';renderInputs();renderAll()}
async function hashPreviewPassword(password,salt){const encoded=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoded.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoded.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function loginPreview(username){const label=username.trim().toLowerCase();switchAccount({uid:'preview-'+label,email:label,isPreview:true,emailVerified:true});persist('previewSession',{username:label});closeModal();applyTranslations();toast(F('welcomePreview'))}
function openAuth(){
 if(state.user){const preview=Boolean(state.user.isPreview);modal(`<h2 id="modalTitle">${icon('user')} ${h(state.user.email||'')}</h2>${preview?`<div class="sample-note">${h(F('previewMode'))} · ${h(F('previewNotSynced'))}</div>`:`<p>${h(T(state.user.emailVerified?'verifiedBadge':'notVerified'))}</p>`}<div class="detail-actions"><button id="logout" class="outline-btn">${h(F('signOut'))}</button>${!preview&&!state.user.emailVerified?`<button id="verification" class="primary-btn">${h(T('sendVerification'))}</button><button id="verificationRefresh" class="outline-btn">${h(D('refreshVerification'))}</button>`:''}</div>`);
  $('logout').addEventListener('click',async()=>{if(preview){switchAccount(null);persist('previewSession',null);closeModal();applyTranslations()}else if(state.fb){await state.fb.modules.signOut(state.fb.auth);closeModal()}});
  if(!preview&&!state.user.emailVerified){$('verification').addEventListener('click',async()=>{try{await state.fb.modules.sendEmailVerification(state.user);toast(T('checkEmail'))}catch{toast(T('authFailure'))}});$('verificationRefresh').addEventListener('click',async()=>{try{await state.user.reload();await state.user.getIdToken(true);applyTranslations();openAuth()}catch{toast(T('authFailure'))}})}return;
 }
 modal(`<h2 id="modalTitle">${icon('lock')} ${h(F('accountLogin'))}</h2><div class="sample-note">${h(F('demoAccess'))} · ${h(F('previewNotSynced'))}</div><form id="authForm" class="form-stack"><label>${h(F('usernameOrEmail'))}<input id="authEmail" type="text" required autocomplete="username" maxlength="150" placeholder="limba"></label><label>${h(T('password'))}<input id="authPassword" type="password" required autocomplete="current-password" minlength="4"></label><label id="confirmWrap" class="hidden">${h(F('confirmPassword'))}<input id="authConfirm" type="password" autocomplete="new-password"></label><label><input id="registerCheck" type="checkbox"> ${h(state.firebaseReady?T('register'):F('localRegister'))}</label><button id="authSubmit" class="primary-btn" type="submit">${h(T('login'))}</button><button type="button" id="demoQuick" class="outline-btn">${icon('user')} ${h(F('signInDemo'))}</button>${state.firebaseReady?`<button type="button" id="passwordReset" class="outline-btn">${h(T('forgotPassword'))}</button>`:''}<p id="authNote" class="helper"></p></form>${!state.firebaseReady?`<p class="helper">${h(F('previewMode'))} · ${h(T('authUnavailable'))}</p>`:''}`);
 $('registerCheck').addEventListener('change',()=>{$('confirmWrap').classList.toggle('hidden',!$('registerCheck').checked);$('authSubmit').textContent=$('registerCheck').checked?(state.firebaseReady?T('register'):F('localRegister')):T('login')});
 $('demoQuick').addEventListener('click',()=>loginPreview('limba'));
 $('authForm').addEventListener('submit',async e=>{e.preventDefault();const username=$('authEmail').value.trim().toLowerCase(),pw=$('authPassword').value,register=$('registerCheck').checked;const note=$('authNote');note.textContent='';try{
   if(!register&&username==='limba'&&pw==='demo'){loginPreview('limba');return}
   if(state.firebaseReady&&username.includes('@')){if(register){if(pw.length<8){note.textContent=F('minPassword');return}const c=await state.fb.modules.createUserWithEmailAndPassword(state.fb.auth,username,pw);await state.fb.modules.sendEmailVerification(c.user);toast(T('checkEmail'))}else await state.fb.modules.signInWithEmailAndPassword(state.fb.auth,username,pw);closeModal();return}
   if(!/^[a-z0-9._-]{3,32}$/.test(username)||username==='limba'){note.textContent=F('requiredFields');return}
   const accounts=restore('previewAccounts',{});if(register){if(pw.length<6){note.textContent=F('minPassword');return}if(pw!==$('authConfirm').value){note.textContent=F('passwordsMismatch');return}if(accounts[username]){note.textContent=F('accountExists');return}const salt=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('');accounts[username]={salt,hash:await hashPreviewPassword(pw,salt)};persist('previewAccounts',accounts);toast(F('previewRegistered'));loginPreview(username);return}
   if(!accounts[username]||(await hashPreviewPassword(pw,accounts[username].salt))!==accounts[username].hash){note.textContent=F('loginInvalid');return}loginPreview(username);
  }catch(err){console.warn('login failed',err);note.textContent=F('loginInvalid')}});
 $('passwordReset')?.addEventListener('click',async()=>{const email=$('authEmail').value.trim();if(!email.includes('@')){toast(T('email'));return}try{await state.fb.modules.sendPasswordResetEmail(state.fb.auth,email);toast(T('checkEmail'))}catch{$('authNote').textContent=T('authFailure')}});
}
function openSell(id=null){if(typeof id!=='string')id=null;const existing=id?state.listings.find(x=>x.id===id&&x.uid===state.user?.uid):null;const editing=!!existing;if(id&&!editing)return;
 if(!state.user){openAuth();return}if(!state.user.isPreview&&!state.firebaseReady){openAuth();return}if(!state.user.emailVerified){toast(T('verifiedRequired'));openAuth();return}
 const mk=CAR_MAKES.map(v=>`<option value="${h(v)}"></option>`).join('');const y=Array.from({length:new Date().getFullYear()-1949},(_,i)=>new Date().getFullYear()+1-i).map(v=>`<option value="${v}">${v}</option>`).join('');const cs=COUNTRIES.map(([c,fl])=>`<option value="${c}">${fl} ${h(countryLabel(c))}</option>`).join('');const chooser=(name,values)=>`<label>${h(T(name))}<select name="${name}" required>${values.map(v=>`<option value="${v}">${h(T(v))}</option>`).join('')}</select></label>`;
 modal(`<h2 id="modalTitle">${icon('add_car')} ${h(F('vehicleProfile'))}</h2><p class="sample-note">${h(state.user.isPreview?F('previewMode'):T('uploadPhotoNote'))}</p><form id="sellForm" class="form-grid"><label>${h(T('make'))}<input id="sellMake" name="make" list="sellMakeOptions" maxlength="35" required autocomplete="off" placeholder="${h(T('makeExample'))}"><datalist id="sellMakeOptions">${mk}</datalist></label><label>${h(T('model'))}<input id="sellModel" name="model" list="sellModelOptions" maxlength="65" required><datalist id="sellModelOptions"></datalist></label><label>${h(T('firstReg'))}<select name="year" required>${y}</select></label><label>${h(T('mileage'))}<input name="mileage" type="number" min="0" max="1500000" required></label>${chooser('fuel',['petrol','diesel','hybrid','electric'])}${chooser('transmission',['manual','automatic'])}${chooser('body',['suv','sedan','wagon','hatchback','coupe'])}<label>${h(T('power'))} (${h(T('powerUnit'))})<input name="power" type="number" min="1" max="2000" required></label><label>${h(T('price'))} (€)<input name="price" type="number" min="1" max="999999999" required></label>${chooser('sellerType',['privateSeller','dealer'])}<label>${h(T('country'))}<select name="country" required>${cs}</select></label><label>${h(T('location'))}<input name="city" maxlength="90" required></label><label>${h(T('contactEmail'))}<input name="contactEmail" type="email" maxlength="180"></label><label class="full-span"><input type="checkbox" name="contactConsent" value="yes"> ${h(W('contactPublic'))}</label><label>${h(T('carCondition'))}<select name="condition"><option value="used">${h(T('conditionUsed'))}</option><option value="new">${h(T('conditionNew'))}</option></select></label><label>${h(F('accidentCar'))}<select name="accidentStatus" required><option value="unknown">${h(F('accidentUnknown'))}</option><option value="no">${h(F('accidentNo'))}</option><option value="yes">${h(F('accidentYes'))}</option></select></label><label class="full-span">${h(F('conditionShort'))}<input name="conditionNote" maxlength="240" placeholder="${h(F('conditionShortHint'))}"></label><label class="full-span">${h(T('vehicleDescription'))}<textarea name="description" required minlength="15" maxlength="3000"></textarea></label><label class="full-span">${icon('camera')} ${h(state.user.isPreview?F('optionalPhoto'):T('listingPhotos'))}<input id="sellImages" name="images" type="file" accept="image/jpeg,image/png,image/webp" ${state.user.isPreview||editing?'':'required'} multiple></label><div class="full-span"><p class="helper" id="sellNote"></p><button id="sellSubmit" type="submit" class="primary-btn full-width">${h(state.user.isPreview?F('savePreviewCar'):T('publish'))}</button></div></form>`);const form=$('sellForm');
 if(existing){
  for(const name of ['make','model','year','mileage','power','price','fuel','transmission','body','sellerType','country','city','contactEmail','condition','accidentStatus','conditionNote','description']){
   const el=form.elements.namedItem(name);if(el&&existing[name]!==undefined)el.value=String(existing[name]);
  }
  $('sellImages').required=false;
  $('sellImages').closest('label').classList.add('hidden'); // Photos remain unchanged when editing.
  $('sellSubmit').textContent=W('editAd');
  if(form.elements.contactConsent)form.elements.contactConsent.checked=Boolean(existing.contactEmail);
 }
 const updateSellModels=()=>{$('sellModelOptions').innerHTML=modelSuggestions($('sellMake').value,state.listings).map(v=>`<option value="${h(v)}"></option>`).join('')};$('sellMake').addEventListener('input',updateSellModels);updateSellModels();form.dataset.editId=existing?.id||'';form.addEventListener('submit',publishCar)}
async function publishCar(e){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const editing=Boolean(form.dataset.editId);const existing=editing?state.listings.find(x=>x.id===form.dataset.editId):null;
 const files=Array.from(form.elements.images.files||[]);const allowed=['image/jpeg','image/png','image/webp'];if((!state.user?.isPreview&&!editing&&!files.length)||files.length>(state.user?.isPreview?1:6)||files.some(x=>!allowed.includes(x.type)||x.size>(state.user?.isPreview?800000:5*1024*1024))){return $('sellNote').textContent=T('fileError')}
 if(String(fd.get('contactEmail')||'').trim() && fd.get('contactConsent')!=='yes'){
  $('sellNote').textContent=W('contactPublic');return;
 }
 const make=resolveCarMake(fd.get('make'));const model=String(fd.get('model')||'').trim();if(!validCarMake(make)||!model||model.length>65){return $('sellNote').textContent=T('brandRequired')}const priceValue=Number(fd.get('price'));const year=Number(fd.get('year'));const mileage=Number(fd.get('mileage'));const power=Number(fd.get('power'));if(!Number.isInteger(priceValue)||priceValue<1||priceValue>999999999||!Number.isInteger(mileage)||mileage<0||mileage>1500000||!Number.isInteger(power)||power<1||power>2000||year<1950||year>new Date().getFullYear()+1)return $('sellNote').textContent=T('invalidPrice');const submit=$('sellSubmit');submit.disabled=true;submit.textContent='…';let id=null;const uploadedRefs=[];try{
 if(state.user.isPreview){const photo=files[0]?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(files[0])}):(existing?.image||'assets/limba/icons/car.png');const item={id:existing?.id||'preview-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),category:'vehicles',uid:state.user.uid,isPreview:true,isDemo:true,status:'active',createdAt:Date.now(),title:`${make} ${model}`.slice(0,110),description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),condition:String(fd.get('condition')),contactEmail:'',image:photo,images:[photo],make,model,year,mileage,power,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim()};state.listings=state.listings.filter(x=>x.id!==item.id);state.listings.unshift(item);
 persist('previewCars',state.listings.filter(x=>x.isPreview));closeModal();toast(F('previewSaved'));showView('mine');return}
 const {db,storage,modules:m}=state.fb;
 const fields={title:`${make} ${model}`.slice(0,110),description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),condition:String(fd.get('condition')),contactEmail:String(fd.get('contactEmail')||'').trim(),make,model,year,mileage,power,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim()};
 if(existing){
  if(existing.uid!==state.user.uid)throw Error('Not listing owner');
  await m.updateDoc(m.doc(db,'listings',existing.id),fields);
  Object.assign(existing,fields);renderAll();closeModal();toast(W('editAd'));showView('mine');return;
 }
 const doc=m.doc(m.collection(db,'listings'));id=doc.id;const images=[];for(let i=0;i<files.length;i++){const file=files[i];const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const ref=m.ref(storage,`listings/${state.user.uid}/${id}/${i}.${ext}`);await m.uploadBytes(ref,file,{contentType:file.type});uploadedRefs.push(ref);images.push(await m.getDownloadURL(ref))}
 const data={category:'vehicles',uid:state.user.uid,status:'active',createdAt:m.serverTimestamp(),...fields,image:images[0],images};await m.setDoc(doc,data);state.listings.unshift({...data,id,createdAt:Date.now()});renderAll();closeModal();toast(T('carPublished'));showView('mine')
 }catch(err){console.error('post failed',err);
 if(uploadedRefs.length){await Promise.all(uploadedRefs.map(ref=>state.fb.modules.deleteObject(ref).catch(e=>console.warn('cleanup',e))))}
 $('sellNote').textContent=T('uploadFailed')}finally{submit.disabled=false;submit.textContent=editing?W('editAd'):T('publish')}}
async function updateListingStatus(id,status){
 const item=state.listings.find(x=>x.id===id);
 if(!item||!state.user||item.uid!==state.user.uid||!['active','paused','sold'].includes(status))return;
 if(item.isPreview){
  item.status=status;persist('previewCars',state.listings.filter(x=>x.isPreview));renderAll();return;
 }
 if(!state.fb)return;
 try{await state.fb.modules.updateDoc(state.fb.modules.doc(state.fb.db,'listings',id),{status});item.status=status;renderAll()}
 catch(e){console.error(e);toast(T('uploadFailed'))}
}
async function removeListing(id){const x=state.listings.find(y=>y.id===id);if(!x||!state.user||x.uid!==state.user.uid)return;if(!window.confirm(T('removeConfirm')))return;if(x.isPreview){state.listings=state.listings.filter(y=>y.id!==id);persist('previewCars',state.listings.filter(y=>y.isPreview));renderAll();toast(T('removedMessage'));return}if(!state.fb)return;try{const {db,storage,modules:m}=state.fb;await m.deleteDoc(m.doc(db,'listings',id));state.listings=state.listings.filter(y=>y.id!==id);renderAll();toast(T('removedMessage'));for(const u of (x.images||[])){try{await m.deleteObject(m.ref(storage,u))}catch(e){console.warn('image cleanup',e)}}}catch(e){toast(T('uploadFailed'))}}
async function connectFirebase(){const conf=window.LIMBA_FIREBASE_CONFIG || window.LUMA_FIREBASE_CONFIG;if(!conf?.apiKey||!conf?.projectId)return;try{
 const base='https://www.gstatic.com/firebasejs/12.6.0/';const [app,auth,db,storage]=await Promise.all(['firebase-app.js','firebase-auth.js','firebase-firestore.js','firebase-storage.js'].map(s=>import(base+s)));const init=app.initializeApp(conf);const modules={...auth,...db,...storage};state.fb={auth:auth.getAuth(init),db:db.getFirestore(init),storage:storage.getStorage(init),modules};state.firebaseReady=true;
 auth.onAuthStateChanged(state.fb.auth,async user=>{
  if(!user&&state.user?.isPreview)return;
  unsubscribeOwned?.();unsubscribeOwned=null;serverOwned=[];
  switchAccount(user);
  if(user){
   try{await user.reload()}catch{}
   try{
    const favoriteSnap=await db.getDocs(db.collection(state.fb.db,'users',user.uid,'favorites'));
    state.favorites=favoriteSnap.docs.map(d=>d.id);
    const searchSnap=await db.getDoc(db.doc(state.fb.db,'users',user.uid,'data','searches'));
    if(searchSnap.exists())state.searches=searchSnap.data().items||[];
    const prefs=await db.getDoc(db.doc(state.fb.db,'users',user.uid,'data','preferences'));
    if(prefs.exists())state.countries=(prefs.data().countries||[]).filter(x=>COUNTRIES.some(c=>c[0]===x));
   }catch(err){console.warn('account load',err)}
   persistAccount('favorites',state.favorites);persistAccount('searches',state.searches);persistAccount('countries',state.countries);
   const ownQuery=db.query(db.collection(state.fb.db,'listings'),db.where('uid','==',user.uid),db.limit(100));
   unsubscribeOwned=db.onSnapshot(ownQuery,snapshot=>{
    serverOwned=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.()||0})).filter(x=>x.category==='vehicles');
    mergeListings();
   },err=>console.warn('own listings',err));
  }
  mergeListings();applyTranslations();
 });
 const collection=db.collection(state.fb.db,'listings');
 const query=db.query(collection,db.where('status','==','active'),db.limit(300));
 db.onSnapshot(query,snapshot=>{
  serverActive=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.()||0})).filter(x=>x.category==='vehicles'&&x.make&&x.model);
  mergeListings();
  const adHash=new URLSearchParams(location.hash.slice(1)).get('ad');
  if(adHash&&$('modal').classList.contains('hidden')&&state.listings.some(x=>x.id===adHash))
   showDetails(adHash,{fromHistory:true});
 },error=>{console.error('cars fetch',error);toast(T('loadFailed'))});
 }catch(e){console.error('firebase init',e);state.firebaseReady=false;toast(T('firebaseFailed'))}}
function wire(){const language=$('language');language.innerHTML=LANGS.map(([c,label])=>`<option value="${h(c)}">${h(label)}</option>`).join('');language.value=state.locale;language.addEventListener('change',e=>{state.locale=e.target.value;persist('language',state.locale);$('settingsLanguage').value=state.locale;applyTranslations()});document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));$('brandBtn').addEventListener('click',()=>showView('home'));$('settingsBtn').addEventListener('click',()=>showView('settings'));$('loginBtn').addEventListener('click',openAuth);$('accountSettingsBtn').addEventListener('click',openAuth);$('fabAdd').addEventListener('click',openSell);$('settingsLanguage').innerHTML=LANGS.map(([c,l])=>`<option value="${h(c)}">${h(l)}</option>`).join('');$('settingsLanguage').value=state.locale;$('settingsLanguage').addEventListener('change',e=>{state.locale=e.target.value;$('language').value=state.locale;persist('language',state.locale);applyTranslations()});$('sellBtn').addEventListener('click',openSell);$('mineSell').addEventListener('click',openSell);$('saveSearchBtn').addEventListener('click',saveSearch);$('searchForm').addEventListener('submit',e=>{e.preventDefault();renderAll();$('resultsSection').scrollIntoView({behavior:'smooth'})});$('advancedToggle').addEventListener('click',()=>{$('advancedFilters').classList.toggle('hidden');$('filterChevron').classList.toggle('rotated',!$('advancedFilters').classList.contains('hidden'))});['clearAll','resetEmpty'].forEach(id=>$(id).addEventListener('click',resetFilters));$('sort').addEventListener('change',e=>{state.sort=e.target.value;renderAll()});Object.keys(state.filters).forEach(id=>$(id)?.addEventListener(['keyword','priceTo','priceFrom','make','model'].includes(id)?'input':'change',e=>setFilter(id,e.target.value)));document.querySelectorAll('[data-body]').forEach(btn=>btn.addEventListener('click',()=>setFilter('body',btn.dataset.body)));
 document.addEventListener('click',e=>{const heart=e.target.closest('[data-like]');if(heart){e.preventDefault();e.stopPropagation();return toggleFavorite(heart.dataset.like)}const card=e.target.closest('[data-open]');if(card)return showDetails(card.dataset.open);const edit=e.target.closest('[data-edit]');if(edit)return openSell(edit.dataset.edit);
 const status=e.target.closest('[data-status-id]');if(status)return updateListingStatus(status.dataset.statusId,status.dataset.status);
 const del=e.target.closest('[data-delete]');if(del)return removeListing(del.dataset.delete);const apply=e.target.closest('[data-apply]');if(apply){const item=state.searches[Number(apply.dataset.apply)];if(item){state.filters={...state.filters,...item.filters};state.countries=item.countries||[];persistAccount('countries',state.countries);renderInputs();showView('home');$('resultsSection').scrollIntoView({behavior:'smooth'})}return}const drop=e.target.closest('[data-drop]');if(drop){state.searches.splice(Number(drop.dataset.drop),1);persistAccount('searches',state.searches);syncSearches();renderAll()}});
 document.addEventListener('keydown',e=>{const card=e.target.closest?.('[data-open]');if(card&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();showDetails(card.dataset.open)}});
 $('countryChoices').addEventListener('change',e=>{if(e.target.matches('input[type=checkbox]')){const code=e.target.value;state.countries=e.target.checked?[...new Set([...state.countries,code])]:state.countries.filter(x=>x!==code);renderAll()}});$('allCountries').addEventListener('click',()=>{state.countries=[];renderAll()});$('saveCountries').addEventListener('click',saveCountries);
 $('swipeHome').addEventListener('click',()=>showView('home'));$('swipeFavorite').addEventListener('click',()=>{const arr=filtered();if(arr.length)toggleFavorite(arr[state.swipeIndex].id)});$('swipeHelp').addEventListener('click',showTutorial);$('swipeDone').addEventListener('click',dismissTutorial);$('swipeTutorialBack').addEventListener('click',hideTutorial);
 let pointer=null;const swipe=$('swipeCard');swipe.addEventListener('pointerdown',e=>{if(!$('swipeTutorial').classList.contains('hidden'))return;e.preventDefault();pointer={x:e.clientX,y:e.clientY};swipe.setPointerCapture(e.pointerId)});swipe.addEventListener('pointerup',e=>{if(!pointer)return;e.preventDefault();const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))<48)return;swipeAction(Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down')});
 swipe.addEventListener('pointercancel',()=>{pointer=null});
 swipe.addEventListener('lostpointercapture',()=>{pointer=null});
 swipe.addEventListener('click',e=>{if(e.detail===0&&state.view==='swipe'&&$('swipeTutorial').classList.contains('hidden')){const arr=filtered();if(arr.length)showDetails(arr[state.swipeIndex].id)}});document.addEventListener('keydown',e=>{if(state.view==='swipe'&&$('modal').classList.contains('hidden')&&$('swipeTutorial').classList.contains('hidden')){const move={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(move){e.preventDefault();swipeAction(move)}}if(e.key==='Escape'){if(!$('modal').classList.contains('hidden'))closeModal();else if(state.view==='swipe'&&!$('swipeTutorial').classList.contains('hidden'))hideTutorial();else if(state.view==='swipe')showView('home')}});$('modalClose').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target.dataset.close==='true')closeModal()});$('footerSafety').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('security')} ${h(T('safeTrading'))}</h2><p>${h(T('safeCarAdvice'))}</p>`));$('footerPrivacy').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('lock')} ${h(T('privacy'))}</h2><p>${h(T('privacyDemo'))}</p>`));
 history.replaceState({lumaView:'home'},'',location.href);
 window.addEventListener('popstate',e=>{
  if(!$('modal').classList.contains('hidden'))closeModal({fromHistory:true});
  if(e.state?.lumaDetail){showView(e.state.lumaView||'home',{fromHistory:true});showDetails(e.state.lumaDetail,{fromHistory:true});return}
  showView(e.state?.lumaView||'home',{fromHistory:true});
 });
 applyTranslations();const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('ad'))setTimeout(()=>showDetails(hash.get('ad'),{fromHistory:true}),150)}
wire();connectFirebase();