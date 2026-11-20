import {createDealerAccountUI} from './limba-dealer-ui.js';
import {releaseText} from './release-i18n.js';
import {createLimbaMarketplace,listingPhotoDetail,listingPhotoDetailsFromForm,listingBatteryFromForm,savedSearchKey} from './limba-market-ui.js';
import {LANGS,tr,GTR_COPY} from './cars-i18n.js';
import {icon} from './icons.js';
import {ft} from './feature-i18n.js';
import {mvpText} from './mvp-i18n.js';
import {lux} from './limba-lux.js';
import {createLimbaExperiences} from './limba-lux-ui.js';
import {searchLabel} from './search-filters-i18n.js';
import {CAR_MAKES,normalizeMake,resolveCarMake,validCarMake,modelSuggestions} from './car-brands.js';
import {createWebMarketplaceSearch} from './limba-web-search.js';
import {mountListingWizard} from './limba-drafts.js';
import {listingBadges} from './functions/listing-badges.mjs';

const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COUNTRIES=[['AL','🇦🇱','Albania'],['TR','🇹🇷','Türkiye'],['GR','🇬🇷','Greece'],['RS','🇷🇸','Serbia'],['SI','🇸🇮','Slovenia'],['XK','🇽🇰','Kosovo'],['MK','🇲🇰','North Macedonia'],['HR','🇭🇷','Croatia'],['BA','🇧🇦','Bosnia and Herzegovina'],['ME','🇲🇪','Montenegro'],['BG','🇧🇬','Bulgaria'],['RO','🇷🇴','Romania']];
// One fictional sample listing. Photo shows a real black Nissan GT-R, but does not
// document this sample's year, equipment, mileage, service history or asking price.
// Photo: Joshua Spence, CC BY-SA 4.0, Wikimedia Commons.
const GTR_PHOTO='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Nissan_GT-R_R35_Black_Edition.JPG/1280px-Nissan_GT-R_R35_Black_Edition.JPG';
const GTR_PHOTO_PAGE='https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG';
const offlinePreview=window.LIMBA_OFFLINE_PREVIEW===true;
const DEMO=offlinePreview?[{
 id:'demo-nissan-gtr',category:'vehicles',status:'active',make:'Nissan',model:'GT-R',
 title:'Nissan GT-R R35 Black Edition',year:2013,mileage:49500,fuel:'petrol',
 transmission:'automatic',body:'coupe',power:550,engineName:'3.8 V6 Bi-Turbo VR38DETT',engineCapacity:3800,price:68900,country:'HR',city:'Zagreb',
 sellerType:'privateSeller',condition:'used',accidentStatus:'unknown',conditionNote:'',color:'black',image:GTR_PHOTO,images:[GTR_PHOTO],
 description:'',uid:null,contactEmail:'',createdAt:Date.now(),isDemo:true
}]:[];
const key=k=>`luma_auto_${k}`;
function restore(name,fallback){try{const raw=localStorage.getItem(key(name));if(raw!==null)return JSON.parse(raw)??fallback;const legacy={language:'locale',countries:'preferredCountries',favorites:'favorites',searches:'searches',swipeSeen:'swipeTutorialSeen'}[name];if(legacy){const previous=localStorage.getItem('luma_'+legacy);if(previous!==null)return JSON.parse(previous)??fallback}return fallback}catch{return fallback}}
function persist(name,val){try{localStorage.setItem(key(name),JSON.stringify(val))}catch{}}
const blankFilters={keyword:'',make:'',model:'',priceTo:'',yearFrom:'',mileageTo:'',fuel:'',transmission:'',body:'',sellerType:'',priceFrom:'',yearTo:'',mileageFrom:'',powerFrom:'',powerTo:'',engineTerm:'',capacityFrom:'',capacityTo:''};
const state={locale:restore('language','de'),view:'home',filters:{...blankFilters},sort:'latest',radius:null,radiusName:'',countries:restore('countries',[]),favorites:restore('favorites',[]).filter(id=>!String(id).startsWith('demo-')||(offlinePreview&&id==='demo-nissan-gtr')),searches:restore('searches',[]),listings:[...(offlinePreview?restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id):[]),...DEMO],swipeIndex:0,user:null,firebaseReady:false,fb:null,photoIndex:0,swipeSeen:restore('swipeSeen',false)};
const previewSession=offlinePreview?restore('previewSession',null):null;if(previewSession?.username&&previewSession.username!=='limba'){const username=previewSession.username;state.user={uid:'preview-'+username,email:username,isPreview:true,emailVerified:true};state.favorites=restore('user:'+state.user.uid+':favorites',[]);state.searches=restore('user:'+state.user.uid+':searches',[]);state.countries=restore('user:'+state.user.uid+':countries',[])}
if(!LANGS.some(([c])=>c===state.locale))state.locale='de';
const T=k=>tr(k,state.locale);
const F=k=>ft(k,state.locale);
const W=k=>mvpText(k,state.locale);
const X=k=>lux(k,state.locale);
const S=k=>searchLabel(k,state.locale);
const L=k=>releaseText(state.locale,k);
function persistAccount(name,value){
 const uid=state.user?.uid;
 persist(uid?'user:'+uid+':'+name:name,value);
}
function validRadius(value){
 return /^gn-\d{1,10}$/.test(value?.placeId||'')&&[25,50,100,250].includes(value?.km);
}
function loadSearchState(uid){
 const stored=restore((uid?'user:'+uid+':':'')+'currentSearch',{});
 state.filters=Object.fromEntries(Object.keys(blankFilters).map(field=>[field,typeof stored?.filters?.[field]==='string'?stored.filters[field]:'']));
 state.sort=['priceLow','priceHigh'].includes(stored.sort)?stored.sort:'latest';
 state.radius=validRadius(stored.radius)?stored.radius:null;
 state.radiusName=state.radius&&typeof stored.radiusName==='string'?stored.radiusName:'';
}
loadSearchState(state.user?.uid);
function searchChanged(){
 persistAccount('currentSearch',{filters:state.filters,sort:state.sort,radius:state.radius,radiusName:state.radiusName});
 marketplaceSearch.refresh();
 renderAll();
}
function switchAccount(user){
 const previousUid=state.user?.uid;
 if(previousUid!==user?.uid&&($('marketThreads')||$('marketMessageList')||$('marketNotifications')))closeModal();
 state.user=user;
 if(previousUid!==user?.uid){
  loadSearchState(user?.uid);
  if(!pendingContact||previousUid)searchAnchor=null;
  if(previousUid||pendingContact?.uid&&pendingContact.uid!==user?.uid)clearContact();
  else if(pendingContact&&user)savePendingContact({...pendingContact,uid:user.uid});
  favoriteCars.clear();
 }
 marketUI.connectAccount(user);
 dealerUI.connectAccount(user);
 const suffix=user?.uid?'user:'+user.uid+':':'';
 state.favorites=restore(suffix+'favorites',[]).filter(x=>!String(x).startsWith('demo-')||(offlinePreview&&x==='demo-nissan-gtr'));
 state.searches=restore(suffix+'searches',[]);
 state.countries=restore(suffix+'countries',[]);
}
let serverActive=[],serverOwned=[],unsubscribeOwned=null,unsubscribeSearches=null,accountLoad=0;
const favoriteCars=new Map();
let listingLoad = offlinePreview ? 'ready' : 'loading';
let legacyRetry;
let legacyDeadline;
let advanceSwipeAfterPage = false;

function beginListingLoad() {
 listingLoad = 'loading';
 clearTimeout(legacyDeadline);
 legacyDeadline = setTimeout(() => {
  if (listingLoad === 'loading' && !marketplaceSearch.enabled) {
   listingLoad = 'failed';
   renderAll();
  }
 }, 12000);
}

async function retryListingLoad() {
 if (legacyRetry) return legacyRetry();
 beginListingLoad();
 renderAll();
 if (!await connectFirebase()) {
  listingLoad = 'failed';
  renderAll();
 }
}
const marketplaceSearch=createWebMarketplaceSearch({request:callSecureMarketplace,
 criteria:()=>({filters:state.filters,countries:state.countries,sort:state.sort==='latest'?'recent':state.sort,
  ...(state.radius?{radius:state.radius}:{})}),update:mergeListings});
function mergeListings(){
 const local=offlinePreview?restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id):[];
 const active=marketplaceSearch.enabled?marketplaceSearch.items:serverActive;
 const combined=new Map([...DEMO,...local,...active,...favoriteCars.values(),...serverOwned].map(car=>[car.id,car]));
 state.listings=Array.from(combined.values());
 renderAll();
}

const D=k=>(GTR_COPY[state.locale]||GTR_COPY.de)[k]||GTR_COPY.de[k]||k;
const price=x=>new Intl.NumberFormat(state.locale==='cnr'?'sr-Latn':state.locale,{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(x)||0);
const displayCurrencies = ['EUR', 'MKD', 'ALL', 'RSD', 'CHF'];
const cachedRates = restore('displayRates', {});
let rateTable = {};
let currency = 'EUR';
let currencyRequest;
let currencyError = false;
function validRate(row) {
 const age = Date.now() - Date.parse(row?.date);
 return Number.isFinite(row?.rate) && row.rate > 0 && age > -86400000 && age <= 7 * 86400000;
}
function displayPrice(amount) {
 const quote = rateTable[currency];
 if (currency === 'EUR' || !validRate(quote)) return price(amount);
 return '≈ ' + new Intl.NumberFormat(state.locale === 'cnr' ? 'sr-Latn' : state.locale, {
  style: 'currency', currency, maximumFractionDigits: 0,
 }).format((Number(amount) || 0) * quote.rate);
}
async function changeCurrency(value) {
 if (!displayCurrencies.includes(value)) return;
 currency = value;
 currencyError = false;
 persist('displayCurrency', value);
 renderAll();
 if (value === 'EUR' || validRate(rateTable[value])) return;
 rateTable = Object.fromEntries(displayCurrencies.filter(code => validRate(cachedRates?.[code]))
  .map(code => [code, cachedRates[code]]));
 if (validRate(rateTable[value])) renderAll();
 try {
  currencyRequest ??= fetch('https://api.frankfurter.dev/v2/rates?base=EUR&quotes=MKD,ALL,RSD,CHF', {
   referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6500),
  }).then(response => {
   if (!response.ok) throw new Error('Reference rates unavailable');
   return response.json();
  }).then(rows => {
   for (const row of rows) {
    if (row.base === 'EUR' && displayCurrencies.includes(row.quote) && validRate(row)) {
     rateTable[row.quote] = { rate: row.rate, date: row.date };
    }
   }
   persist('displayRates', rateTable);
  }).finally(() => { currencyRequest = null; });
  await currencyRequest;
 } catch {
  // A valid cached rate is still usable with its quotation date.
 }
 currencyError = currency !== 'EUR' && !validRate(rateTable[currency]);
 renderAll();
}
function renderCurrencyStatus() {
 const rate = rateTable[currency];
 $('exchangeRateStatus').textContent = currency === 'EUR' ? '' : validRate(rate) ?
  L('rateReference') + ' ' + rate.date + ' · Frankfurter' : L(currencyError ? 'rateUnavailable' : 'loading');
}
function customsLabel(listing) {
 if (listing.customsCountry !== listing.country) return L('customsUnknown');
 return L(({cleared: 'customsCleared', importRequired: 'customsRequired'})[listing.customsStatus] || 'customsUnknown');
}
const number=x=>new Intl.NumberFormat(state.locale==='cnr'?'sr-Latn':state.locale).format(Number(x)||0);
const flag=c=>COUNTRIES.find(x=>x[0]===c)?.[1]||'🌐';
const countryLabel=c=>{if(c==='XK')return ({de:'Kosovo',en:'Kosovo',sq:'Kosovë',tr:'Kosova',el:'Κόσοβο','sr-Cyrl':'Косово',mk:'Косово',bg:'Косово'})[state.locale]||'Kosovo';try{return new Intl.DisplayNames([state.locale==='cnr'?'sr-Latn':state.locale],{type:'region'}).of(c)||c}catch{return COUNTRIES.find(x=>x[0]===c)?.[2]||c}};
const safeURL=v=>{const s=String(v||'');if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{1,1400000}$/.test(s))return s;if(s==='assets/limba/icons/car.png')return s;try{const x=new URL(s);return x.protocol==='https:'?x.href:''}catch{return ''}};
const labelFor=(field,v)=>T(v||field);
const isSample=x=>x?.id==='demo-nissan-gtr';
const isDemo=x=>Boolean(x?.isDemo||x?.isPreview||String(x?.id||'').startsWith('demo-'));
const toast=(msg)=>{$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3200)};
const luxUI=createLimbaExperiences({el:$,state,filtered:()=>filtered(),carCard,price,number,flag,countryLabel,h,safeURL,T,F,X,L,isDemo,openDetails:openListing,modal,toast});
const marketUI=createLimbaMarketplace({el:$,state,h,price,number,L,T,F,W,X,modal,toast,openAuth,openListing,renderSavedSearches,queueContact});
const dealerUI=createDealerAccountUI({el:$,state,h,L,T,modal,toast,openAuth,carCard,openListing,countryLabel,COUNTRIES,number,callSecureMarketplace});
let searchAnchor, restoreAnchorPending=false, lastResultMarkup;
let pendingContact;
try{
 const item=JSON.parse(sessionStorage.getItem(key('pendingContact')));
 if(typeof item?.id==='string'&&Date.now()-item.since<30*60*1000)pendingContact=item;
}catch{}
function savePendingContact(item){
 pendingContact=item;
 try{
  if(item)sessionStorage.setItem(key('pendingContact'),JSON.stringify(item));else sessionStorage.removeItem(key('pendingContact'));
 }catch{}
}
function clearContact(){savePendingContact(null)}
function queueContact(id){
 savePendingContact({id,uid:state.user?.uid||null,since:Date.now()});
 openAuth();
}
async function resumeContact(){
 const action=pendingContact, user=state.user;
 if(!action||!user||user.isPreview||action.uid&&action.uid!==user.uid)return;
 if(Date.now()-action.since>=30*60*1000){clearContact();return}
 if(!user.emailVerified){openAuth();return}
 if(action.inFlight)return;
 action.inFlight=true;
 const guard=()=>pendingContact===action&&state.user?.uid===user.uid;
 try{
  const listing=await fetchListing(action.id,{fresh:true});
  if(!guard())return;
  if(!listing||listing.status!=='active')throw new Error('Inactive listing');
  if(listing.uid===user.uid){clearContact();marketUI.openInbox();return}
  showDetails(listing.id,{listing,fromHistory:history.state?.lumaDetail===listing.id});
  clearContact();
  void marketUI.startChat(listing,$('detailContact'));
 }catch{
  if(guard()){clearContact();closeModal();toast(L('listingUnavailable'))}
 }
}
function applyTranslations(){document.documentElement.lang=state.locale;document.title=`Limba Auto · ${T('heroTitle1')}`;document.querySelector('meta[name="description"]').content=T('footerCar');document.querySelector('meta[property="og:title"]').content=document.title;document.querySelector('meta[property="og:description"]').content=T('heroDescription');document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=T(el.dataset.i18n)});document.querySelectorAll('[data-release]').forEach(el=>{el.textContent=L(el.dataset.release)});marketUI.updateInboxButton();document.querySelectorAll('[data-lux]').forEach(el=>{el.textContent=X(el.dataset.lux)});document.querySelectorAll('[data-filter]').forEach(el=>{el.textContent=S(el.dataset.filter)});document.querySelectorAll('[data-filter-aria]').forEach(el=>{el.setAttribute('aria-label',S(el.dataset.filterAria))});document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',T(el.dataset.i18nAria)));document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=T(el.dataset.i18nPlaceholder));$('loginText').textContent=state.user?(state.user.email?.split('@')[0]||T('logout')):T('login');$('loginBtn').setAttribute('aria-label',$('loginText').textContent);$('accountSignIn').textContent=state.user?L('accountNav'):T('login');$('accountOpenBtn').querySelector('span').textContent=$('accountSignIn').textContent;$('accountStatus').textContent=state.user?.isPreview?F('previewMode'):T(state.user?'profileSync':'guestSync');$('settingsLanguageLabel').textContent=F('chooseLanguage');$('swipeHelp').setAttribute('aria-label',T('learnSwipeAgain'));$('swipeHome').setAttribute('aria-label',T('backToMarket'));$('swipeFavorite').setAttribute('aria-label',T('saveFavourites'));$('modalClose').setAttribute('aria-label',T('cancel'));$('swipeTutorialBack').querySelector('span').textContent=D('backToCar');document.querySelector('.swipe-photo').setAttribute('aria-label',T('swipeTitle'));renderInputs();renderAll()}
function opts(items,first,chosen){return `<option value="">${h(T(first))}</option>`+items.map(v=>`<option value="${h(v)}" ${chosen===v?'selected':''}>${h(T(v))}</option>`).join('')}
let catalogChooser=null;
function setupCatalogChooser(ids=['make','model']){const controller=new AbortController();
 const closers={};
 function listFor(id){
  if(id===ids[0])return CAR_MAKES;
  if(!$(ids[0]).value.trim())return [];
  return modelSuggestions($(ids[0]).value,state.listings);
 }
 function close(id){$(id+'Dropdown').classList.add('hidden');$(id).setAttribute('aria-expanded','false');closers[id].active=-1;}
 function paint(id,all=false){
  const input=$(id),box=$(id+'Dropdown'),term=all?'':normalizeMake(input.value);
  const raw=listFor(id),items=term?raw.filter(s=>normalizeMake(s).includes(term)):raw;
  const current=closers[id];current.items=items;current.active=-1;
  let html=`<p class="catalog-count">${items.length} ${S('catalogCount')}</p>`;
  if(!raw.length&&id===ids[1])html+=`<p class="catalog-hint">${h(S('chooseMake'))}</p>`;
  else if(!items.length)html+=`<p class="catalog-hint">${h(S('catalogEmpty'))}</p>`;
  else html+=`<button type="button" class="catalog-option catalog-clear" data-catalog-option="${id}" data-catalog-choice="">${h(id===ids[0]?T('allMakes'):T('allModels'))}</button>`+items.map((name,i)=>`<button type="button" class="catalog-option" id="${id}Item${i}" role="option" data-catalog-option="${id}" data-catalog-choice="${h(name)}">${h(name)}</button>`).join('');
  box.innerHTML=html;
 }
 function open(id,all=false){
  for(const other of Object.keys(closers))if(other!==id)close(other);
  paint(id,all);$(id+'Dropdown').classList.remove('hidden');$(id).setAttribute('aria-expanded','true');
 }
 function choose(id,value){const input=$(id),previous=input.value;input.value=value;if(id===ids[0]&&previous!==value&&$(ids[1]).value){$(ids[1]).value='';$(ids[1]).dispatchEvent(new Event('input',{bubbles:true}))}input.dispatchEvent(new Event('input',{bubbles:true}));close(id);input.blur()}
 for(const id of ids){
  closers[id]={items:[],active:-1};
  const input=$(id),button=document.querySelector(`[data-catalog-toggle="${id}"]`);
  input.addEventListener('focus',()=>open(id));
  input.addEventListener('click',()=>open(id));
  input.addEventListener('input',()=>{if(!$(id+'Dropdown').classList.contains('hidden'))paint(id)});
  button.addEventListener('click',()=>{const expanded=input.getAttribute('aria-expanded')==='true';if(expanded){close(id);input.blur()}else{input.focus();open(id,true)}});
  input.addEventListener('keydown',e=>{
   const isOpen=input.getAttribute('aria-expanded')==='true';
   if(e.key==='Escape'&&isOpen){e.preventDefault();e.stopPropagation();close(id);return}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();if(!isOpen)open(id);
    const choices=[...$(id+'Dropdown').querySelectorAll('.catalog-option:not(.catalog-clear)')];
    if(!choices.length)return;
    const next=e.key==='ArrowDown'?Math.min(choices.length-1,closers[id].active+1):Math.max(0,closers[id].active-1);
    closers[id].active=next;
    choices.forEach((opt,i)=>opt.classList.toggle('is-active',i===next));
    choices[next].scrollIntoView({block:'nearest'});input.setAttribute('aria-activedescendant',choices[next].id);
   }else if(e.key==='Enter'&&isOpen&&closers[id].active>=0){
    e.preventDefault();choose(id,closers[id].items[closers[id].active]);
   }
  });
 }
 document.addEventListener('pointerdown',e=>{
  for(const id of ids)if(!e.target.closest('.catalog-select')?.contains($(id))){close(id)}
 },{signal:controller.signal});
 document.addEventListener('click',e=>{const opt=e.target.closest('[data-catalog-option]');if(opt&&ids.includes(opt.dataset.catalogOption))choose(opt.dataset.catalogOption,opt.dataset.catalogChoice)},{signal:controller.signal});
 return {close,refresh:id=>{if($(id)?.getAttribute('aria-expanded')==='true')paint(id)},destroy:()=>controller.abort()};
}
function renderModelOptions(){const f=state.filters;const models=f.make?modelSuggestions(f.make,state.listings):[...new Set(state.listings.map(x=>x.model).filter(Boolean))].sort();$('modelOptions').innerHTML=models.map(v=>`<option value="${h(v)}"></option>`).join('');catalogChooser?.refresh('model')}
function renderInputs(){const f=state.filters;$('makeOptions').innerHTML=CAR_MAKES.map(v=>`<option value="${h(v)}"></option>`).join('');renderModelOptions();['fuel','transmission','body','sellerType'].forEach(field=>{const values={fuel:['petrol','diesel','hybrid','electric'],transmission:['manual','automatic'],body:['suv','sedan','wagon','hatchback','coupe'],sellerType:['privateSeller','dealer']}[field];const first={fuel:'allFuel',transmission:'allTransmission',body:'allBody',sellerType:'allSeller'}[field];$(field).innerHTML=opts(values,first,f[field])});
 const yearOptions=Array.from({length:new Date().getFullYear()-1949},(_,i)=>new Date().getFullYear()+1-i);['yearFrom','yearTo'].forEach(field=>{$(field).innerHTML=`<option value="">${h(T('allYear'))}</option>`+yearOptions.map(y=>`<option value="${y}">${y}</option>`).join('')});$('mileageTo').placeholder=S('maxKm');$('mileageFrom').placeholder=S('minKm');$('powerFrom').placeholder=S('minHp');$('powerTo').placeholder=S('maxHp');$('engineTerm').placeholder=S('engineInfo');$('sort').innerHTML=[['latest','newest'],['priceLow','priceLow'],['priceHigh','priceHigh']].map(([v,l])=>`<option value="${v}">${h(T(l))}</option>`).join('');for(const id of Object.keys(f))if($(id))$(id).value=f[id];$('sort').value=state.sort||'latest'}
function setFilter(field,val){state.filters[field]=val;if(field==='make'){state.filters.model='';$('model').value='';renderModelOptions()}searchChanged()}
function filtered(){if(marketplaceSearch.enabled)return marketplaceSearch.items;
 const f=state.filters;const term=f.keyword.trim().toLocaleLowerCase(state.locale);
 const pool=offlinePreview?state.listings:[...new Map([...serverActive,...serverOwned].map(car=>[car.id,car])).values()];
 let items=pool.filter(x=>{
 if(x.category!=='vehicles'||(x.status&&x.status!=='active'))return false;
 if(x.isPreview&&(!state.user?.isPreview||x.uid!==state.user.uid))return false;
 if(state.countries.length&&!state.countries.includes(x.country))return false;
 if(term&&!`${x.title} ${x.make} ${x.model} ${x.modelExtension||''} ${x.city} ${x.description} ${x.serviceHistory||''} ${x.modificationNotes||''}`.toLocaleLowerCase(state.locale).includes(term))return false;
 if(f.make&&!normalizeMake(resolveCarMake(x.make)).includes(normalizeMake(resolveCarMake(f.make))))return false;if(f.model&&!normalizeMake(x.model).includes(normalizeMake(f.model)))return false;
 if(f.body&&x.body!==f.body)return false;if(f.fuel&&x.fuel!==f.fuel)return false;if(f.transmission&&x.transmission!==f.transmission)return false;if(f.sellerType&&x.sellerType!==f.sellerType)return false;
 if(f.priceFrom&&Number(x.price)<Number(f.priceFrom))return false;if(f.priceTo&&Number(x.price)>Number(f.priceTo))return false;
 if(f.yearFrom&&Number(x.year)<Number(f.yearFrom))return false;if(f.yearTo&&Number(x.year)>Number(f.yearTo))return false;
 if(f.mileageTo&&Number(x.mileage)>Number(f.mileageTo))return false;
 if(f.mileageFrom&&Number(x.mileage)<Number(f.mileageFrom))return false;
 if(f.powerFrom&&Number(x.power)<Number(f.powerFrom))return false;
 if(f.powerTo&&Number(x.power)>Number(f.powerTo))return false;
 if(f.engineTerm&&!String(x.engineName||'').toLocaleLowerCase(state.locale).includes(f.engineTerm.toLocaleLowerCase(state.locale).trim()))return false;
 if(f.capacityFrom&&(!Number.isFinite(Number(x.engineCapacity))||!x.engineCapacity||Number(x.engineCapacity)<Number(f.capacityFrom)))return false;
 if(f.capacityTo&&(!Number.isFinite(Number(x.engineCapacity))||!x.engineCapacity||Number(x.engineCapacity)>Number(f.capacityTo)))return false;return true});
 if(state.sort==='priceLow')items.sort((a,b)=>a.price-b.price);else if(state.sort==='priceHigh')items.sort((a,b)=>b.price-a.price);else items.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));return items}
function carCard(car, {performance = false} = {}) {
 const liked = state.favorites.includes(car.id);
 const badges = performance ? listingBadges(car) : [];
 return `<article class="car-card" data-open="${h(car.id)}" tabindex="0" aria-label="${h(car.title)}">
  <div class="car-img"><img loading="lazy" src="${h(safeURL(car.image) || 'assets/limba/icons/car.png')}" alt="${h(car.title)}"></div>
  <div class="car-body">
   <div class="car-price-row">
    <strong class="car-price car-price-overview">${h(displayPrice(car.price))}</strong>
    <button class="card-heart ${liked ? 'active' : ''}" type="button" data-like="${h(car.id)}" aria-pressed="${liked}" aria-label="${h(T('saveFavourites'))}">${icon('heart')}</button>
   </div>
   <h3 class="car-title">${h(car.title)}</h3>
   <div class="car-specs">
    <span aria-label="${h(T('firstReg'))}">${h(car.year || '—')}</span><span>${number(car.mileage)} ${h(T('kmUnit'))}</span>
    ${Number(car.power) > 0 ? `<span>${number(car.power)} ${h(T('powerUnit'))}</span>` : ''}
   </div>
   <div class="car-location">${flag(car.country)} ${h(car.city)}, ${h(countryLabel(car.country))} · ${h(isDemo(car) ? F('previewOnly') : T(car.sellerType || 'privateSeller'))}${Number.isFinite(car.distanceKm) ? ' · ' + h(number(car.distanceKm)) + ' ' + h(T('kmUnit')) : ''}</div>
   <div class="card-badges"><span class="customs-badge">${h(customsLabel(car))}</span>
   ${badges.map(badge => `<span class="tuning-badge" title="${h(X('sellerClaims'))}">${h(L(badge))}</span>`).join('')}</div>
   <button type="button" class="outline-btn card-details">${icon('info')} ${h(T('vehicleDetails'))}</button>
  </div></article>`;
}

function skeletonCards(count = 4) {
 return '<div class="car-skeleton" aria-hidden="true"><div></div><span></span><span></span><span></span></div>'.repeat(count);
}
function renderAll(){
 const arr=filtered(), searching=marketplaceSearch.enabled;
 const pending = searching ? marketplaceSearch.pending : listingLoad === 'loading';
 const failed = searching ? marketplaceSearch.failed : listingLoad === 'failed';
 $('carGrid').setAttribute('aria-busy', String(pending));
 $('retryListings').classList.toggle('hidden', !failed || searching);
 renderCurrencyStatus();
 const focus=document.activeElement;
 const focusedGrid=$('carGrid').contains(focus)?focus.closest('[data-open]')?.dataset.open:null;
 const focusControl=focus.matches('[data-like]')?' [data-like]':focus.matches('.card-details')?' .card-details':'';
 const nextCards=arr.length ? arr.map(car=>carCard(car)).join('') : pending ? skeletonCards() : '';
 if(lastResultMarkup!==nextCards){
  $('carGrid').innerHTML=nextCards;
  lastResultMarkup=nextCards;
  if(focusedGrid)$('carGrid').querySelector(`[data-open="${CSS.escape(focusedGrid)}"]${focusControl}`)?.focus({preventScroll:true});
 }
 $('emptyResults').classList.toggle('hidden',arr.length!==0||pending||failed||marketplaceSearch.hasMore);
 const resultTotal=searching&&marketplaceSearch.hasMore?L('loadedResults'):T('searchResultCount');
 $('resultCount').textContent=arr.length||(!pending&&!failed)?`${number(arr.length)} ${resultTotal}`:'';
 $('searchProgress').textContent=failed?L('searchLoadError'):pending?L('loading'):'';
 $('searchProgress').classList.toggle('hidden',!pending&&!failed);
 $('loadMoreSearch').classList.toggle('hidden',!searching||(!marketplaceSearch.hasMore&&!failed));
 $('loadMoreSearch').disabled=pending;
 $('loadMoreSearch').textContent=L(failed?'retry':'loadMore');
 $('radiusControls').classList.toggle('hidden',!searching);
 document.querySelectorAll('[data-seller-segment]').forEach(button=>
  button.setAttribute('aria-pressed',String(button.dataset.sellerSegment===state.filters.sellerType)));
 renderActiveFilters();
 const fav=state.listings.filter(x=>state.favorites.includes(x.id)&&x.category==='vehicles');$('favoritesGrid').innerHTML=luxUI.garageCards(fav);
 const mine=state.listings.filter(x=>state.user&&x.uid===state.user.uid&&x.category==='vehicles');
 $('mineGrid').innerHTML=mine.length?mine.map(x=>{
  const status=x.status||'active';
  const actions=['active','paused','sold'].filter(v=>v!==status).map(v=>'<button class="outline-btn" data-status="'+h(v)+'" data-status-id="'+h(x.id)+'">'+h(W('status'+v[0].toUpperCase()+v.slice(1)))+'</button>').join('');
  return '<div class="my-car-item">'+carCard(x)+'<div class="mine-actions"><span class="status-pill">'+h(W('statusLabel'))+': '+h(W('status'+status[0].toUpperCase()+status.slice(1)))+'</span><button class="outline-btn" data-edit="'+h(x.id)+'">'+h(W('editAd'))+'</button>'+actions+'<button class="outline-btn" data-delete="'+h(x.id)+'">'+h(T('removeAd'))+'</button></div></div>';
 }).join(''):`<div class="empty-panel"><h3>${h(T('noOwnCars'))}</h3></div>`;
 renderSearchCountries();renderSavedSearches();
 luxUI.render();
 if (state.view === 'performance') {
  if (pending && !$('performanceGrid').querySelector('[data-open]')) $('performanceGrid').innerHTML = skeletonCards();
  $('loadMorePerformance').classList.toggle('hidden', !searching || (!marketplaceSearch.hasMore && !failed));
  $('loadMorePerformance').textContent=L(failed?'retry':'loadMore');
  $('loadMorePerformance').disabled=pending;
 }
 renderSwipe(pending);
 restoreSearchAnchor()}
function renderSavedSearches(){
 const saved=state.searches.map((item,index)=>`<div class="saved-search-row">
 <span>${h(item.name||T('yourSavedSearch'))}</span><button type="button" data-apply="${index}">${h(T('repeatSearch'))}</button>
 ${marketUI.savedAlertButton(item,index)}
 <button type="button" data-drop="${index}" aria-label="${h(T('delete'))}">${icon('close')}</button></div>`);
 const orphaned=state.user?.emailVerified?marketUI.orphanedAlerts().map((item,index)=>`<div class="saved-search-row">
 <span>${h(item.name||T('yourSavedSearch'))}</span>${marketUI.savedAlertButton(item,index,true)}</div>`):[];
 $('savedSearchesList').innerHTML=[...saved,...orphaned].join('')||`<p class="muted-copy">${h(T('noSearches'))}</p>`;
}
function searchFilterTitle(key){
 const translated=S(key);
 return translated!==key?translated:T(key==='keyword'?'searchTerms':key);
}
function renderActiveFilters(){
 const filterOptions=['fuel','transmission','body','sellerType'];
 const chips=Object.entries(state.filters).filter(([,value])=>String(value).trim()).map(([key,value])=>({
  key, label:`${searchFilterTitle(key)} · ${filterOptions.includes(key)?T(value):String(value)}`
 }));
 if(marketplaceSearch.enabled&&state.radius)chips.push({key:'radius',label:`${state.radiusName||L('radiusDistance')} · ${state.radius.km} km`});
 $('resultFilter').textContent=chips.length?`${L('filters')} (${chips.length})`:L('filters');

 const container=$('activeFilters');
 container.setAttribute('aria-label',L('activeFilters'));
 container.classList.toggle('hidden',!chips.length);
 container.innerHTML=chips.map(({key,label})=>`<button type="button" data-filter-remove="${h(key)}"
  aria-label="${h(L('removeFilter')+': '+label)}">${h(label)}<span aria-hidden="true">×</span></button>`).join('');
}
function renderSearchCountries(){
 const label=state.countries.length?(state.countries.length<=2?state.countries.map(code=>flag(code)+' '+countryLabel(code)).join(', '):state.countries.length+' '+L('filterCountry')):L('allCountries');
 $('searchCountryToggle').innerHTML='<span>'+h(label)+'</span>';
 $('searchCountryToggle').setAttribute('aria-label',L('filterCountry')+': '+label);
 const quick=$('countryQuick');
 const focused=quick.contains(document.activeElement)?document.activeElement.dataset.countryQuick:null;
 const order=['AL','RS','HR','BA','ME','SI','GR','BG','RO','TR'];
 quick.setAttribute('aria-label',L('filterCountry'));
 quick.innerHTML=order.map(code=>`<button type="button" data-country-quick="${code}" aria-pressed="${state.countries.includes(code)}"><span>${flag(code)} ${h(countryLabel(code))}</span></button>`).join('');
 if(focused)quick.querySelector(`[data-country-quick="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
 $('quickAllCountries').setAttribute('aria-pressed',String(!state.countries.length));
 if(!$('searchCountryPanel').open)renderCountryChoices();
}
function renderCountryChoices(){
 $('countryChoices').innerHTML=COUNTRIES.map(([code,emoji])=>`<label class="country-choice">
  <input type="checkbox" value="${code}" ${state.countries.includes(code)?'checked':''}><span>${emoji} ${h(countryLabel(code))}</span>
 </label>`).join('');
}
function openSearchCountries(trigger){
 const dialog=$('searchCountryPanel');
 if(dialog.open)return;
 renderCountryChoices();
 trigger.setAttribute('aria-expanded','true');
 dialog.showModal();
}
function closeSearchCountries(){
 const dialog=$('searchCountryPanel');
 if(dialog.open)dialog.close();
 for(const id of ['searchCountryToggle','resultCountries'])$(id).setAttribute('aria-expanded','false');
}
function closeAccountMenu(){
 $('accountMenu').classList.add('hidden');$('loginBtn').setAttribute('aria-expanded','false');
}
function toggleAccountMenu(){
 const opening=$('accountMenu').classList.contains('hidden');
 $('accountMenu').classList.toggle('hidden',!opening);$('loginBtn').setAttribute('aria-expanded',String(opening));
 if(opening)$('accountOpenBtn').focus();
}
function rememberSearchAnchor(){
 if(state.view!=='home'||$('homeView').classList.contains('hidden'))return;
 const top=$('siteHeader').getBoundingClientRect().bottom;
 const card=[...$('carGrid').children].find(element=>element.getBoundingClientRect().bottom>top);
 searchAnchor={id:card?.dataset.open,offset:card?.getBoundingClientRect().top,y:scrollY};
}
function restoreSearchAnchor(){
 if(!restoreAnchorPending||state.view!=='home'||!searchAnchor||marketplaceSearch.pending)return;
 restoreAnchorPending=false;
 requestAnimationFrame(()=>{
  if(state.view!=='home'||!searchAnchor)return;
  const card=searchAnchor.id&&$('carGrid').querySelector(`[data-open="${CSS.escape(searchAnchor.id)}"]`);
  window.scrollTo({top:card?scrollY+card.getBoundingClientRect().top-searchAnchor.offset:searchAnchor.y,behavior:'instant'});
 });
}
function showView(view,{fromHistory=false}={}){
 closeAccountMenu();closeSearchCountries();
 const views=['home','swipe','favorites','performance','mine','settings','account'];if(!views.includes(view))return;
 const changed=state.view!==view;
 if(changed&&state.view==='home')rememberSearchAnchor();
 if(changed&&view==='home')restoreAnchorPending=true;
 if(changed&&!fromHistory)history.pushState({lumaView:view},'',location.pathname+location.search);
 state.view=view;
 views.forEach(v=>$(v==='home'?'homeView':`${v}View`).classList.toggle('hidden',v!==view));
 document.querySelectorAll('.nav-link,.mobile-nav [data-view]').forEach(b=>{
  const active=b.dataset.view===view||(b.dataset.view==='account'&&['mine','favorites','settings'].includes(view));
  b.classList.toggle('is-active',active);
  if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });
 document.body.style.overflow=view==='swipe'?'hidden':'';
 if(view!=='swipe')hideTutorial();
 if(changed&&view!=='home')window.scrollTo({top:0,behavior:'instant'});
 if(changed&&view==='swipe') tutorialOffered=false;
 renderAll();
}
let tutorialOffered = false;
function showTutorial() {
 tutorialOffered = true;
 $('swipeTutorial').classList.remove('hidden');
 $('swipeActions').inert = true;
 $('swipeCard').inert = true;
 $('swipeDone').focus();
}
function dismissTutorial() {
 hideTutorial();
 state.swipeSeen = true;
 persist('swipeSeen', true);
}
function hideTutorial() {
 const wasOpen = !$('swipeTutorial').classList.contains('hidden');
 $('swipeTutorial').classList.add('hidden');
 $('swipeCard').inert = false;
 $('swipeActions').inert = false;
 if (wasOpen && state.view === 'swipe') $('swipeCard').focus({preventScroll:true});
}
function renderSwipe(pending = marketplaceSearch.pending) {
 if (state.view !== 'swipe') return;
 const cars = filtered();
 $('swipeActions').classList.toggle('hidden', !cars.length);
 $('swipeHelp').disabled = !cars.length;
 if (!cars.length) {
  hideTutorial();
  $('swipeCard').innerHTML = `<div class="swipe-status">${h(pending ? L('loading') : T('emptyCars'))}</div>`;
  return;
 }
 if (advanceSwipeAfterPage && !pending) {
  if (cars.length > state.swipeIndex + 1) state.swipeIndex++;
  advanceSwipeAfterPage = false;
 }
 state.swipeIndex = ((state.swipeIndex % cars.length) + cars.length) % cars.length;
 const car = cars[state.swipeIndex];
 $('swipeCard').innerHTML = `<img src="${h(safeURL(car.image) || 'assets/limba/icons/car.png')}" alt="${h(car.title)}" draggable="false">
  <div class="swipe-shade"></div><div class="swipe-details"><span class="swipe-demo-badge">${h(isDemo(car) ? F('previewOnly') : T('carsNav'))} · ${state.swipeIndex + 1}/${cars.length}</span>
  <h2>${h(car.title)}</h2><strong>${h(displayPrice(car.price))}</strong><p>${flag(car.country)} ${h(car.city)} · ${number(car.mileage)} ${h(T('kmUnit'))} · ${h(car.year)}</p></div>`;
 const liked = state.favorites.includes(car.id);
 const favorite = $('swipeFavorite');
 favorite.classList.toggle('active', liked);
 favorite.setAttribute('aria-pressed', String(liked));
 favorite.textContent = liked ? '♥' : '♡';
 if (!tutorialOffered && !state.swipeSeen && $('modal').classList.contains('hidden')) showTutorial();
}
function swipeAction(dir){
 const arr=filtered();if(!arr.length)return;
 const x=arr[state.swipeIndex];
 if(dir==='right')return openListing(x.id);
 if(dir==='up')return openListing(x.id,{focusSpecs:true});
 if(dir==='left'){
  if(state.swipeIndex===arr.length-1){
   if(marketplaceSearch.hasMore&&!marketplaceSearch.pending){
    advanceSwipeAfterPage=true;
    marketplaceSearch.more();
   } else if(!marketplaceSearch.pending) toast(D('onlyCar'));
   return;
  }
  state.swipeIndex++;
 }
 if(dir==='down'){
  const n=arr.findIndex((z,i)=>i!==state.swipeIndex&&z.make===x.make);
  if(n<0){toast(D('noSimilar'));return}
  state.swipeIndex=n;
 }
 renderSwipe()
}
let modalReturnFocus=null,detailModalOpening=false,listingWizard=null;
function modal(content){
 const wasClosed=$('modal').classList.contains('hidden');
 marketUI.stopPanel();$('modal').querySelector('.modal-panel').classList.remove('market-detail');
 listingWizard?.destroy();listingWizard=null;
 if(wasClosed)modalReturnFocus=document.activeElement;
 $('modalContent').innerHTML=content;$('modal').classList.remove('hidden');$('modalClose').focus();
 if(wasClosed&&!detailModalOpening)history.pushState({lumaView:state.view,lumaModal:true},'',location.pathname+location.search);
}
function closeModal({fromHistory=false,replaceHistory=false}={}){
 marketUI.stopPanel();
 const wasOpen=!$('modal').classList.contains('hidden');
 if(wasOpen&&pendingContact)clearContact();
 listingWizard?.destroy();listingWizard=null;
 $('modal').classList.add('hidden');$('modalContent').innerHTML='';sellCatalogChooser?.destroy();sellCatalogChooser=null;
 if(wasOpen){const target=modalReturnFocus?.isConnected?modalReturnFocus:(state.view==='swipe'?$('swipeCard'):null);try{target?.focus?.({preventScroll:true})}catch{}modalReturnFocus=null}
 if(wasOpen&&!fromHistory&&(history.state?.lumaDetail||history.state?.lumaModal)){
  if(replaceHistory)history.replaceState({lumaView:state.view},'',location.pathname+location.search);
  else history.back();
 }
}
const detailPair=(name,val)=>`<div><small>${h(F(name)!==name?F(name):T(name)!==name?T(name):S(name))}</small><strong>${h(val)}</strong></div>`;
function showDetails(id,{focusSpecs=false,fromHistory=false,listing=null}={}){const x=listing||state.listings.find(v=>v.id===id);if(!x)return;state.photoIndex=0;const returnTo=state.view;
 if(!fromHistory)rememberSearchAnchor();
 const images=(x.images||[x.image]).map((image,index)=>({src:safeURL(image),detail:listingPhotoDetail(x,index)})).filter(image=>image.src);
 if(!images.length)images.push({src:safeURL(x.image)||'assets/limba/icons/car.png',detail:null});
 const src=images[0].src;
 const legacyEmail=!isDemo(x)&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.contactEmail||'');
 const contactBar=`<div class="detail-contact-bar"><button class="primary-btn" id="detailContact" type="button">${icon('messages')} ${h(L('sellerMessage'))}</button>
 <button class="outline-btn" id="detailShare" type="button">${icon('share')} ${h(T('shareCar'))}</button></div>`;
 const gallery=`<figure class="detail-gallery"><img class="details-image" id="detailImage" src="${h(src)}" alt="${h(x.title)}"/>
 <figcaption class="detail-photo-caption" id="detailPhotoCaption" aria-live="polite"></figcaption>
 ${images.length>1?`<div class="detail-thumbnails">${images.map((image,index)=>`<button type="button" data-photo-index="${index}" aria-current="${index===0}" aria-label="${h(L('photoNumber')+' '+(index+1))}">
  <img loading="lazy" src="${h(image.src)}" alt="">${image.detail?`<span>${h(marketUI.photoSummary(image.detail))}</span>`:''}</button>`).join('')}</div>`:''}</figure>`;
 detailModalOpening=true;
 modal(`<button type="button" class="detail-back outline-btn" id="detailBack">${icon('arrow_left')} ${h(D(returnTo==='swipe'?'backToSwipe':'backToListing'))}</button><div class="detail-head"><div><span class="overline">${h(T('vehicleDetails'))}</span><h2 id="modalTitle">${h(x.title)}</h2><p>${flag(x.country)} ${h(x.city)}, ${h(countryLabel(x.country))}</p></div><div class="detail-price">${h(displayPrice(x.price))}</div></div>${gallery}<div class="detail-actions" id="photoControls"><button class="outline-btn" id="photoPrev" aria-label="${h(T('photoPrevious'))}">${icon('arrow_left')}</button><button class="outline-btn" id="photoNext" aria-label="${h(T('photoNext'))}">${icon('arrow_right')}</button><button class="outline-btn" id="detailLike">${icon('heart')} ${h(T('saved'))}</button></div><h3 id="specsHeading">${h(T('technicalData'))}</h3><div class="spec-table">${detailPair('make',x.make)}${detailPair('model',x.model)}${x.modelExtension?detailPair('modelExtension',x.modelExtension):''}${detailPair('firstReg',String(x.year))}${detailPair('mileage',`${number(x.mileage)} ${T('kmUnit')}`)}${detailPair('fuel',T(x.fuel))}${detailPair('transmission',T(x.transmission))}${detailPair('body',T(x.body))}${detailPair('power',`${number(x.power)} ${T('powerUnit')}`)}${x.engineName?detailPair('engineName',x.engineName):''}${x.engineCapacity!==undefined&&x.engineCapacity!==null?detailPair('engineCapacity',String(x.engineCapacity)+' cm³'):''}${detailPair('sellerType',T(x.sellerType))}<div><span>${h(L('customsInListingCountry'))}</span><strong>${h(customsLabel(x))}</strong></div>${detailPair('carCondition',T(x.condition==='new'?'conditionNew':'conditionUsed'))}${detailPair('accidentHistory',F(x.accidentStatus==='yes'?'accidentYes':x.accidentStatus==='no'?'accidentNo':'accidentUnknown'))}${x.conditionNote?detailPair('conditionShort',x.conditionNote):''}${isSample(x)?`${detailPair('color',D('black'))}${detailPair('engine','VR38DETT · 3.8 l V6 Bi-Turbo')}${detailPair('drive',D('awd'))}${detailPair('seats',D('fourSeats'))}`:''}</div>${luxUI.passport(x)}${marketUI.batteryReport(x)}${isDemo(x)?'':`<section class="market-listing-section"><h3>${h(L('priceHistory'))}</h3><div id="listingPriceHistory"><p>${h(L('loading'))}</p></div></section>`}<h3>${h(T('vehicleDescription'))}</h3><p class="vehicle-description">${h(isSample(x)?D('description'):(x.description||'—'))}</p>${isSample(x)?`<div class="sample-note">${h(D('singleDemoNotice'))}</div><p class="photo-credit">${h(D('photoCredit'))} <a href="${h(GTR_PHOTO_PAGE)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons · Joshua Spence · CC BY-SA 4.0</a></p>`:''}${legacyEmail?`<a class="outline-btn" href="mailto:${h(encodeURIComponent(x.contactEmail))}?subject=${h(encodeURIComponent(x.title))}">${h(T('askSeller'))}</a>`:''}${contactBar}`);
 detailModalOpening=false;
 $('modal').querySelector('.modal-panel').classList.add('market-detail');
 marketUI.loadPrices(x);
 if(x.sellerType==='dealer'&&!isDemo(x)&&x.status==='active'){
  const dealerPanel=document.createElement('div');
  dealerPanel.className='listing-dealer';
  $('detailShare').parentElement.insertAdjacentElement('beforebegin',dealerPanel);
  dealerUI.attachListing(x,dealerPanel);
 }
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
    if(await useSecureMarketplace()){
     await callSecureMarketplace('submitListingReport',{listingId:x.id,reason:select.value});
    }else{
     const reportId=`${state.user.uid}_${x.id}`;
     await m.setDoc(m.doc(state.fb.db,'reports',reportId),{listingId:x.id,reporterUid:state.user.uid,reason:select.value,createdAt:m.serverTimestamp()});
    }
    toast(W('reportSent'));
   }catch(e){console.error('report failed',e);toast(T('uploadFailed'))}
   finally{button.disabled=false}
  });
  panel.append(select,button);$('detailShare').parentElement.insertAdjacentElement('beforebegin',panel);
 }
 if(!fromHistory)history.pushState({lumaView:state.view,lumaDetail:x.id},'',`#ad=${encodeURIComponent(x.id)}`);
 $('detailBack').addEventListener('click',()=>closeModal());
 if(focusSpecs)requestAnimationFrame(()=>$('specsHeading')?.scrollIntoView({block:'start',behavior:'smooth'}));
 if(images.length<=1){$('photoPrev').disabled=true;$('photoNext').disabled=true;$('photoControls').classList.add('single-photo')}
 let picIndex=0;
 const updatePic=()=>{
  const image=images[picIndex];
  $('detailImage').src=image.src;
  $('detailPhotoCaption').textContent=marketUI.photoSummary(image.detail);
  $('detailPhotoCaption').classList.toggle('hidden',!image.detail);
  document.querySelectorAll('[data-photo-index]').forEach(button=>button.setAttribute('aria-current',String(Number(button.dataset.photoIndex)===picIndex)));
 };
 $('photoPrev').addEventListener('click',()=>{picIndex=(picIndex-1+images.length)%images.length;updatePic()});
 $('photoNext').addEventListener('click',()=>{picIndex=(picIndex+1)%images.length;updatePic()});
 for(const thumb of document.querySelectorAll('[data-photo-index]'))thumb.addEventListener('click',()=>{picIndex=Number(thumb.dataset.photoIndex);updatePic()});
 updatePic();
 $('detailLike').addEventListener('click',()=>{toggleFavorite(x.id);$('detailLike').innerHTML=icon('heart')+' '+h(T('saved'))});
 $('detailContact').addEventListener('click',event=>{if(isDemo(x))toast(F('contactPreview'));else marketUI.startChat(x,event.currentTarget)});
 $('detailShare').addEventListener('click',async()=>{
  const url=isDemo(x)?`${location.origin}${location.pathname}#ad=${encodeURIComponent(x.id)}`:`https://limba-auto.web.app/inserat/${encodeURIComponent(x.id)}`;
  try{
   if(typeof navigator.share==='function'){await navigator.share({title:x.title,url});return}
   await navigator.clipboard.writeText(url);toast(T('linkCopied'));
  }catch(error){if(error.name!=='AbortError')toast(url)}
 });
}
async function fetchListing(id,{fresh=false}={}){
 if(!id||typeof id!=='string'||id.includes('/')||id.length>1500)return null;
 if(!fresh){const local=state.listings.find(car=>car.id===id);if(local&&(local.uid||isDemo(local)))return local}
 if(!state.fb&&!(await connectFirebase()))return null;
 const {db,modules:m}=state.fb;
 const ref=m.doc(db,'listings',id),snapshot=await (fresh||marketplaceSearch.enabled?m.getDocFromServer(ref):m.getDoc(ref));
 const data=snapshot.data();
 return data?.category==='vehicles'?{...data,id,createdAt:data.createdAt?.toMillis?.()||0}:null;
}
async function openListing(id,{guard=()=>true,fromHistory=false,focusSpecs=false,fresh=false}={}){
 try{
  const listing=await fetchListing(id,{fresh});
  if(!guard())return;
  if(!listing)throw Error('Listing unavailable');
  showDetails(id,{fromHistory,listing,focusSpecs});
 }catch{if(guard())toast(L('listingUnavailable'))}
}
async function hydrateFavorites(generation){
 const ids=state.favorites.filter(id=>!favoriteCars.has(id));
 for(let offset=0;offset<ids.length&&generation===accountLoad;offset+=8){
  const cars=await Promise.allSettled(ids.slice(offset,offset+8).map(id=>fetchListing(id)));
  if(generation!==accountLoad)return;
  for(const result of cars)if(result.status==='fulfilled'&&result.value&&state.favorites.includes(result.value.id))favoriteCars.set(result.value.id,result.value);
 }
 if(generation===accountLoad)mergeListings();
}
async function toggleFavorite(id){
 const add=!state.favorites.includes(id);
 state.favorites=add?[...state.favorites,id]:state.favorites.filter(x=>x!==id);
 if(add){
  const car=state.listings.find(item=>item.id===id);
  if(car?.uid||isDemo(car))favoriteCars.set(id,car);
  else void hydrateFavorites(accountLoad);
 }
 else{favoriteCars.delete(id);luxUI.clearSelection(id)}
 persistAccount('favorites',state.favorites);renderAll();
 if(state.user&&!state.user.isPreview&&state.fb){
  const {db,modules:m}=state.fb;
  try{const ref=m.doc(db,'users',state.user.uid,'favorites',id);if(add)await m.setDoc(ref,{createdAt:m.serverTimestamp()});else await m.deleteDoc(ref)}
  catch(error){console.warn('favorite sync',error)}
 }
}
const searchIdentity=item=>savedSearchKey(item,Object.keys(state.filters));
async function saveSearch(){
 const filters={...state.filters};
 const name=([filters.make,filters.model,filters.keyword].filter(Boolean).join(' ')||T('yourSavedSearch')).slice(0,120);
 const item={name,filters,countries:[...state.countries],...(marketplaceSearch.enabled&&state.radius?{radius:state.radius}:{})};
 const removed=await mutateSearches(items=>[item,...items.filter(other=>searchIdentity(other)!==searchIdentity(item))].slice(0,20));
 for(const oldSearch of removed)if(marketUI.hasAlert(oldSearch))await marketUI.setAlert(oldSearch,false);
 toast(T('searchSaved'));
}
async function dropSearch(index){
 const item=state.searches[index];
 if(!item)return;
 const identity=searchIdentity(item);
 const removed=await mutateSearches(items=>{
  const found=items.findIndex(other=>searchIdentity(other)===identity);
  return items.filter((_,i)=>i!==found);
 });
 for(const oldSearch of removed)if(marketUI.hasAlert(oldSearch))await marketUI.setAlert(oldSearch,false);
}
async function mutateSearches(change){
 const before=state.searches;
 let next=change(before);
 const user=state.user;
 const fb=state.fb;
 if(user&&!user.isPreview&&fb){
  const {db,modules:m}=fb;
  const ref=m.doc(db,'users',user.uid,'data','searches');
  const persistChanges=async transform=>m.runTransaction(db,async tx=>{
   const snap=await tx.get(ref);
   const updated=change(snap.exists()&&Array.isArray(snap.data().items)?snap.data().items:before);
   tx.set(ref,{items:transform(updated)});
   return updated;
  });
  try{next=await persistChanges(items=>items)}
  catch(error){
   // Preserve advanced search filters locally if the older rules are still deployed.
   if(error.code==='permission-denied'){
    const legacyKeys=['keyword','make','model','priceTo','yearFrom','mileageTo','fuel','transmission','body','sellerType','priceFrom','yearTo'];
    try{await persistChanges(items=>items.map(item=>({...item,filters:Object.fromEntries(legacyKeys.map(key=>[key,String(item.filters?.[key]??'')]))})))}
    catch(err){console.warn('search sync denied',err)}
   }else console.warn('search sync error',error);
  }
 }
 if(user?.uid!==state.user?.uid)return [];
 state.searches=next;
 persistAccount('searches',next);
 renderSavedSearches();
 const nextKeys=new Set(next.map(searchIdentity));
 return before.filter(item=>!nextKeys.has(searchIdentity(item)));
}
let countryWriteQueue=Promise.resolve();
function saveCountries({notify=true}={}){
 const countries=[...new Set(state.countries)].filter(code=>COUNTRIES.some(item=>item[0]===code));
 persistAccount('countries',countries);searchChanged();
 const user=state.user,fb=state.fb;
 if(!user||user.isPreview||!fb){
  $('prefsStatus').textContent='Suchländer nur auf diesem Gerät gespeichert. Für Synchronisation anmelden.';
  if(notify)toast($('prefsStatus').textContent);
  return Promise.resolve(false);
 }
 countryWriteQueue=countryWriteQueue.catch(()=>{}).then(async()=>{
  try{
   const m=fb.modules;await m.setDoc(m.doc(fb.db,'users',user.uid,'data','preferences'),{countries});
   if(state.user?.uid===user.uid){
    $('prefsStatus').textContent='Suchländer im Benutzerkonto gespeichert und geräteübergreifend verfügbar.';
    if(notify)toast(T('settingsSaved'));
   }
   return true;
  }catch(error){
   console.warn('country preference sync',error);
   if(state.user?.uid===user.uid){
    $('prefsStatus').textContent='Synchronisation fehlgeschlagen. Die Auswahl bleibt lokal gespeichert.';
    if(notify)toast($('prefsStatus').textContent);
   }
   return false;
  }
 });
 return countryWriteQueue;
}
function resetFilters(){state.filters={...blankFilters};state.sort='latest';state.radius=null;state.radiusName='';renderInputs();renderRadius();searchChanged()}
function bindPlaces({input,results,status,country=()=>undefined,choose,changed,enabled=()=>marketplaceSearch.enabled}){
 let revision=0,timer;
 const close=()=>{results.replaceChildren();results.classList.add('hidden')};
 input.addEventListener('input',()=>{
  const query=input.value.trim(),current=++revision;
  clearTimeout(timer);close();changed();
  status.textContent='';
  if(query.length<2||!enabled())return;
  timer=setTimeout(async()=>{
   status.textContent=L('loading');
   try{
    const countryCode=country();
    const {places}=await callSecureMarketplace('lookupListingPlaces',{query,...(countryCode?{country:countryCode}:{})});
    if(current!==revision||!input.isConnected)return;
    status.textContent=places.length?'':L('placesEmpty');
    const buttons=places.map(place=>{
     const button=document.createElement('button');button.type='button';
     button.textContent=[place.name,place.region,countryLabel(place.country)].filter(Boolean).join(', ');
     button.addEventListener('click',()=>{input.value=place.name;choose(place);close();input.focus()});
     return button;
    });
    results.replaceChildren(...buttons);results.classList.toggle('hidden',!buttons.length);
   }catch{if(current===revision&&input.isConnected)status.textContent=L('placesUnavailable')}
  },280);
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!results.classList.contains('hidden')){event.stopPropagation();close();status.textContent=''}
  if(event.key==='ArrowDown'&&!results.classList.contains('hidden')){event.preventDefault();results.querySelector('button')?.focus()}
 });
 return ()=>{revision++;clearTimeout(timer);close();status.textContent=''};
}
let clearRadiusResults;
function renderRadius(){
 clearRadiusResults?.();
 $('radiusPlace').value=state.radiusName;
 if(state.radius&&[...$('radiusDistance').options].some(option=>Number(option.value)===state.radius.km))$('radiusDistance').value=String(state.radius.km);
 else $('radiusDistance').value='50';
 if(state.radius&&!state.radiusName)$('radiusStatus').textContent=L('radiusRestored');
}
function wireRadius(){
 clearRadiusResults=bindPlaces({input:$('radiusPlace'),results:$('radiusPlaces'),status:$('radiusStatus'),
  country:()=>state.countries.length===1?state.countries[0]:undefined,
  choose:place=>{
   state.radius={placeId:place.id,km:Number($('radiusDistance').value)};
   state.radiusName=place.name;
   searchChanged();
  },
  changed:()=>{if(state.radius){state.radius=null;state.radiusName='';searchChanged()}}});
 $('radiusDistance').addEventListener('change',()=>{
  if(!state.radius){$('radiusStatus').textContent=L('choosePlace');return}
  state.radius={...state.radius,km:Number($('radiusDistance').value)};
  searchChanged();
 });
}
function setTheme(value){
 if(value==='system')delete document.documentElement.dataset.theme;
 else document.documentElement.dataset.theme=value;
 $('settingsTheme').value=value;
 persist('theme',value);
}
async function hashPreviewPassword(password,salt){const encoded=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoded.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoded.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function loginPreview(username){const label=username.trim().toLowerCase();switchAccount({uid:'preview-'+label,email:label,isPreview:true,emailVerified:true});persist('previewSession',{username:label});closeModal();applyTranslations();toast(F('welcomePreview'))}
function openAuth(){
 if(state.user){const preview=Boolean(state.user.isPreview);modal(`<h2 id="modalTitle">${icon('user')} ${h(state.user.email||'')}</h2>${preview?`<div class="sample-note">${h(F('previewMode'))} · ${h(F('previewNotSynced'))}</div>`:`<p>${h(T(state.user.emailVerified?'verifiedBadge':'notVerified'))}</p>`}<div class="detail-actions"><button id="logout" class="outline-btn">${h(F('signOut'))}</button>${!preview&&!state.user.emailVerified?`<button id="verification" class="primary-btn">${h(T('sendVerification'))}</button><button id="verificationRefresh" class="outline-btn">${h(D('refreshVerification'))}</button>`:''}</div>${preview?'':`<section id="dealerAccountPanel"></section>`}`);
  if(!preview){dealerUI.renderAccount();void dealerUI.refreshReviewer()}
  $('logout').addEventListener('click',async()=>{if(preview){switchAccount(null);persist('previewSession',null);closeModal();applyTranslations()}else if(state.fb){await state.fb.modules.signOut(state.fb.auth);closeModal()}});
  if(!preview&&!state.user.emailVerified){$('verification').addEventListener('click',async()=>{try{await state.fb.modules.sendEmailVerification(state.user);toast(T('checkEmail'))}catch{toast(T('authFailure'))}});$('verificationRefresh').addEventListener('click',async()=>{try{await state.user.reload();await state.user.getIdToken(true);await dealerUI.submitVerified(state.user);applyTranslations();if(pendingContact&&state.user.emailVerified)void resumeContact();else openAuth()}catch{toast(T('authFailure'))}})}return;
 }
 if(offlinePreview){openPreviewAuth();return}
 modal(`<h2 id="modalTitle">${icon('lock')} ${h(F('accountLogin'))}</h2>
  <form id="authForm" class="form-stack">
   <label>${h(T('email'))}<input id="authEmail" type="email" required autocomplete="username" maxlength="254"></label>
   <label>${h(T('password'))}<input id="authPassword" type="password" required autocomplete="current-password"></label>
   <label id="confirmWrap" class="hidden">${h(F('confirmPassword'))}<input id="authConfirm" type="password" autocomplete="new-password"></label>
   <label><input id="registerCheck" type="checkbox"> ${h(T('register'))}</label>
   <fieldset id="accountTypeFields" class="form-stack hidden" disabled>
    <label>${h(L('accountType'))}<select id="registrationType"><option value="privateSeller">${h(T('privateSeller'))}</option><option value="dealer">${h(T('dealer'))}</option></select></label>
    <label id="registrationCompanyField" class="hidden">${h(L('dealerCompany'))}
      <input id="registrationCompany" minlength="2" maxlength="120" autocomplete="organization"></label>
   </fieldset>
   <button id="authSubmit" class="primary-btn" type="submit">${h(T('login'))}</button>
   <button type="button" id="passwordReset" class="outline-btn">${h(T('forgotPassword'))}</button>
   <p id="authNote" class="helper" role="status" aria-live="polite"></p>
  </form>`);
 const email=$('authEmail'), password=$('authPassword'), confirm=$('authConfirm');
 const register=$('registerCheck'), submit=$('authSubmit'), reset=$('passwordReset'), note=$('authNote');
 const typeFields=$('accountTypeFields'), type=$('registrationType'), company=$('registrationCompany');
 function syncAccountType(){
  const dealer=register.checked&&type.value==='dealer';
  typeFields.classList.toggle('hidden',!register.checked);
  typeFields.disabled=!register.checked;
  $('registrationCompanyField').classList.toggle('hidden',!dealer);
  company.required=dealer;
  company.disabled=!dealer;
 }
 type.addEventListener('change',syncAccountType);
 register.addEventListener('change',()=>{
  syncAccountType();
  $('confirmWrap').classList.toggle('hidden',!register.checked);
  confirm.required=register.checked;
  password.autocomplete=register.checked?'new-password':'current-password';
  submit.textContent=T(register.checked?'register':'login');
 });
 async function withAuth(action){
  submit.disabled=reset.disabled=register.disabled=true;
  note.textContent='';
  try{
   if(!(await connectFirebase())){note.textContent=T('authUnavailable');return}
   await action(state.fb);
  }catch(error){
   const invalid=['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'];
   note.textContent=invalid.includes(error.code)?F('loginInvalid'):
    error.code==='auth/email-already-in-use'?F('accountExists'):T('authFailure');
  }finally{submit.disabled=reset.disabled=register.disabled=false}
 }
 $('authForm').addEventListener('submit',event=>{
  event.preventDefault();
  const address=email.value.trim();
  const value=password.value;
  if(register.checked&&value.length<8){note.textContent=F('minPassword');return}
  if(register.checked&&confirm.value!==value){note.textContent=F('passwordsMismatch');return}
  const dealerName=register.checked&&type.value==='dealer'?company.value.trim():null;
  if(dealerName!==null&&dealerName.length<2){note.textContent=L('dealerCompany');return}
  void withAuth(async ({auth,modules})=>{
   if(register.checked){
    const credential=await modules.createUserWithEmailAndPassword(auth,address,value);
    const application=dealerName?dealerUI.saveApplication(credential.user,dealerName).then(()=>true,()=>false):Promise.resolve(true);
    await modules.sendEmailVerification(credential.user);
    toast(await application?T('checkEmail'):L('dealerSaveError'));
   }else await modules.signInWithEmailAndPassword(auth,address,value);
   if(submit.isConnected&&!pendingContact)closeModal();
  });
 });
 reset.addEventListener('click',()=>{
  if(!email.reportValidity())return;
  const address=email.value.trim();
  void withAuth(async ({auth,modules})=>{
   await modules.sendPasswordResetEmail(auth,address);
   toast(T('checkEmail'));
  });
 });
}
function openPreviewAuth(){
 modal(`<h2 id="modalTitle">${icon('lock')} ${h(F('accountLogin'))}</h2>
  <form id="authForm" class="form-stack">
   <label>${h(F('usernameOrEmail'))}<input id="authEmail" required autocomplete="username" maxlength="32"></label>
   <label>${h(T('password'))}<input id="authPassword" type="password" required autocomplete="current-password"></label>
   <label id="confirmWrap" class="hidden">${h(F('confirmPassword'))}<input id="authConfirm" type="password" autocomplete="new-password"></label>
   <label><input id="registerCheck" type="checkbox"> ${h(F('localRegister'))}</label>
   <button id="authSubmit" class="primary-btn" type="submit">${h(T('login'))}</button>
   <p id="authNote" class="helper" role="status"></p>
  </form>`);
 const register=$('registerCheck');
 register.addEventListener('change',()=>{
  $('confirmWrap').classList.toggle('hidden',!register.checked);
  $('authSubmit').textContent=register.checked?F('localRegister'):T('login');
 });
 $('authForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const username=$('authEmail').value.trim().toLowerCase();
  const password=$('authPassword').value;
  const note=$('authNote');
  note.textContent='';
  if(!/^[a-z0-9._-]{3,32}$/.test(username)||username==='limba'){note.textContent=F('requiredFields');return}
  const accounts=restore('previewAccounts',{});
  try{
   if(register.checked){
    if(password.length<6){note.textContent=F('minPassword');return}
    if(password!==$('authConfirm').value){note.textContent=F('passwordsMismatch');return}
    if(accounts[username]){note.textContent=F('accountExists');return}
    const salt=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('');
    accounts[username]={salt,hash:await hashPreviewPassword(password,salt)};
    persist('previewAccounts',accounts);
   }else if(!accounts[username]||await hashPreviewPassword(password,accounts[username].salt)!==accounts[username].hash){
    note.textContent=F('loginInvalid');return;
   }
   loginPreview(username);
  }catch{note.textContent=F('loginInvalid')}
 });
}

let sellCatalogChooser=null;
function openSell(id=null){if(typeof id!=='string')id=null;const existing=id?state.listings.find(x=>x.id===id&&x.uid===state.user?.uid):null;const editing=!!existing;if(id&&!editing)return;
 const dealerApproved=dealerUI.approved();
 if(!state.user){openAuth();return}if(!state.user.isPreview&&!state.firebaseReady){openAuth();return}if(!state.user.emailVerified){toast(T('verifiedRequired'));openAuth();return}
 const mk=CAR_MAKES.map(v=>`<option value="${h(v)}"></option>`).join('');const y=Array.from({length:new Date().getFullYear()-1949},(_,i)=>new Date().getFullYear()+1-i).map(v=>`<option value="${v}">${v}</option>`).join('');const cs=COUNTRIES.map(([c,fl])=>`<option value="${c}">${fl} ${h(countryLabel(c))}</option>`).join('');const chooser=(name,values)=>`<label>${h(T(name))}<select name="${name}" required>${values.map(v=>`<option value="${v}">${h(T(v))}</option>`).join('')}</select></label>`;
 modal(`<h2 id="modalTitle">${icon('add_car')} ${h(F('vehicleProfile'))}</h2><p class="sample-note">${h(state.user.isPreview?F('previewMode'):T('uploadPhotoNote'))}</p><form id="sellForm" class="form-grid"><div class="sell-catalog-label"><label for="sellMake">${h(T('make'))}</label><div class="catalog-select"><input id="sellMake" name="make" maxlength="35" required autocomplete="off" placeholder="${h(T('makeExample'))}" role="combobox" aria-controls="sellMakeDropdown" aria-expanded="false" aria-autocomplete="list"><button type="button" class="catalog-trigger" data-catalog-toggle="sellMake" aria-label="${h(S('showMakes'))}">▾</button><div id="sellMakeDropdown" class="catalog-options hidden" role="listbox"></div></div><datalist id="sellMakeOptions">${mk}</datalist></div><div class="sell-catalog-label"><label for="sellModel">${h(T('model'))}</label><div class="catalog-select"><input id="sellModel" name="model" maxlength="65" required autocomplete="off" role="combobox" aria-controls="sellModelDropdown" aria-expanded="false" aria-autocomplete="list"><button type="button" class="catalog-trigger" data-catalog-toggle="sellModel" aria-label="${h(S('showModels'))}">▾</button><div id="sellModelDropdown" class="catalog-options hidden" role="listbox"></div></div><datalist id="sellModelOptions"></datalist></div><label>${h(F('modelExtension'))}<input name="modelExtension" maxlength="40" autocomplete="off" placeholder="${h(F('modelExtensionHint'))}"></label><label>${h(T('firstReg'))}<select name="year" required>${y}</select></label><label>${h(T('mileage'))}<input name="mileage" type="number" min="0" max="1500000" required></label>${chooser('fuel',['petrol','diesel','hybrid','electric'])}${chooser('transmission',['manual','automatic'])}${chooser('body',['suv','sedan','wagon','hatchback','coupe'])}<label>${h(T('power'))} (${h(T('powerUnit'))})<input name="power" type="number" min="1" max="2000" required></label><label>${h(S('engineName'))}<input name="engineName" maxlength="80" autocomplete="off" placeholder="${h(S('engineInfo'))}"></label><label>${h(S('engineCapacity'))}<input name="engineCapacity" type="number" min="0" max="12000" inputmode="numeric" placeholder="cm³"></label><label>${h(T('price'))} (€)<input name="price" type="number" min="1" max="999999999" required></label>${chooser('sellerType',dealerApproved?['privateSeller','dealer']:['privateSeller'])}${!dealerApproved&&!state.user.isPreview?`<p class="helper">${h(L('dealerListingHint'))}</p>`:''}<label>${h(T('country'))}<select name="country" required>${cs}</select></label><div class="sell-place"><label for="sellCity">${h(T('location'))}</label><input id="sellCity" name="city" maxlength="90" autocomplete="off" required aria-describedby="sellPlaceStatus"><input name="placeId" type="hidden"><div id="sellPlaces" class="place-results hidden"></div><p id="sellPlaceStatus" class="helper" role="status"></p></div><label>${h(L('customsInListingCountry'))}<select name="customsStatus">
 <option value="unknown">${h(L('customsUnknown'))}</option><option value="cleared">${h(L('customsCleared'))}</option>
 <option value="importRequired">${h(L('customsRequired'))}</option></select></label><label>${h(T('carCondition'))}<select name="condition"><option value="used">${h(T('conditionUsed'))}</option><option value="new">${h(T('conditionNew'))}</option></select></label><label>${h(F('accidentCar'))}<select name="accidentStatus" required><option value="unknown">${h(F('accidentUnknown'))}</option><option value="no">${h(F('accidentNo'))}</option><option value="yes">${h(F('accidentYes'))}</option></select></label><label class="full-span">${h(F('conditionShort'))}<input name="conditionNote" maxlength="240" placeholder="${h(F('conditionShortHint'))}"></label><label class="full-span">${h(X('serviceHistory'))}<textarea name="serviceHistory" maxlength="500" rows="3" placeholder="${h(X('sellerClaims'))}"></textarea></label><label class="full-span">${h(X('tuningDetails'))}<textarea name="modificationNotes" maxlength="500" rows="3" placeholder="${h(X('sellerClaims'))}"></textarea></label><label class="full-span">${h(X('documentNotes'))}<textarea name="documentNotes" maxlength="240" rows="2" placeholder="${h(X('notVerified'))}"></textarea></label><label class="full-span">${h(T('vehicleDescription'))}<textarea name="description" required minlength="15" maxlength="3000"></textarea></label><label class="full-span">${icon('camera')} ${h(state.user.isPreview?F('optionalPhoto'):T('listingPhotos'))}<input id="sellImages" name="images" type="file" accept="image/jpeg,image/png,image/webp" ${state.user.isPreview||editing?'':'required'} multiple></label><fieldset class="market-listing-section full-span"><legend>${h(L('photoDetails'))}</legend><p>${h(L('photoGuide'))}</p><div class="market-photo-fields" id="marketPhotoFields"></div></fieldset>${marketUI.batteryFields(existing?.batteryReport||{})}<div class="full-span"><p class="helper" id="sellNote" role="status"></p><button id="sellSubmit" type="submit" class="primary-btn full-width">${h(state.user.isPreview?F('savePreviewCar'):T('publish'))}</button></div></form>`);const form=$('sellForm');
 if(!editing&&dealerApproved)form.elements.sellerType.value='dealer';
 if(existing){
  for(const name of ['make','model','modelExtension','year','mileage','power','engineName','engineCapacity','price','fuel','transmission','body','sellerType','country','city','placeId','customsStatus','condition','accidentStatus','conditionNote','serviceHistory','modificationNotes','documentNotes','description']){
   const el=form.elements.namedItem(name);if(el&&existing[name]!==undefined&&(name!=='sellerType'||existing.sellerType!=='dealer'||dealerApproved))el.value=String(existing[name]);
  }
  if(existing.customsCountry!==existing.country)form.elements.customsStatus.value='unknown';
  $('sellImages').required=false;
  $('sellImages').closest('label').classList.add('hidden'); // Photos remain unchanged when editing.
  $('sellSubmit').textContent=W('editAd');
 }
 const photos=$('sellImages');
 const attachmentCount=existing?.images?.length||(existing?.image?1:0);
 const photoFields=$('marketPhotoFields');
 if(existing)photoFields.innerHTML=marketUI.photoFields(attachmentCount,existing);
 else photos.addEventListener('change',()=>{
  const files=Array.from(photos.files||[]);
  photoFields.innerHTML=marketUI.photoFields(Math.min(files.length,state.user.isPreview?1:6),{},files.map(file=>file.name));
 });
 const fuel=form.elements.fuel;
 const report=$('marketBatteryFields');
 const refreshBattery=()=>{
  const electric=fuel.value==='electric';
  report.classList.toggle('hidden',!electric);
  report.disabled=!electric;
 };
 fuel.addEventListener('change',refreshBattery);refreshBattery();
 const updateSellModels=()=>{$('sellModelOptions').innerHTML=modelSuggestions($('sellMake').value,state.listings).map(v=>`<option value="${h(v)}"></option>`).join('');sellCatalogChooser?.refresh('sellModel')};$('sellMake').addEventListener('input',updateSellModels);updateSellModels();sellCatalogChooser?.destroy();sellCatalogChooser=setupCatalogChooser(['sellMake','sellModel']);form.dataset.editId=existing?.id||'';
 const place=form.elements.placeId;
 const setPlace=value=>{
  place.value=value;
  place.dispatchEvent(new Event('input',{bubbles:true}));
 };
 const clearChoices=bindPlaces({input:$('sellCity'),results:$('sellPlaces'),status:$('sellPlaceStatus'),
  country:()=>form.elements.country.value,choose:value=>setPlace(value.id),changed:()=>setPlace('')});
 form.elements.country.addEventListener('change',()=>{
  form.elements.customsStatus.value='unknown';
  setPlace('');clearChoices();
 });
 if(!editing)listingWizard=mountListingWizard(form,{state,L,T,preview:state.user.isPreview,onRestored:clearChoices});
 form.addEventListener('submit',publishCar);
}
async function publishCar(e){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form),wizard=listingWizard,user=state.user,fb=state.fb;const editing=Boolean(form.dataset.editId);const existing=editing?state.listings.find(x=>x.id===form.dataset.editId):null;
 const files=Array.from(form.elements.images.files||[]);const allowed=['image/jpeg','image/png','image/webp'];if((!state.user?.isPreview&&!editing&&!files.length)||files.length>(state.user?.isPreview?1:6)||files.some(x=>!allowed.includes(x.type)||x.size>(state.user?.isPreview?800000:5*1024*1024))){return $('sellNote').textContent=T('fileError')}
 const attachmentCount=existing?.images?.length||(existing?.image?1:0);
 const photoDetails=listingPhotoDetailsFromForm(fd,editing?attachmentCount:files.length);
 const batteryReport=listingBatteryFromForm(fd);
 if(batteryReport===false)return $('sellNote').textContent=L('batteryInvalid');
 const extras={...(Object.keys(photoDetails).length?{photoDetails}:{}),...(batteryReport?{batteryReport}:{})};
 const make=resolveCarMake(fd.get('make'));const model=String(fd.get('model')||'').trim();const modelExtension=String(fd.get('modelExtension')||'').trim().replace(/\s+/g,' ');const fullTitle=[make,model,modelExtension].filter(Boolean).join(' ');if(!validCarMake(make)||!model||model.length>65||modelExtension.length>40||fullTitle.length>110){return $('sellNote').textContent=T('brandRequired')}const priceValue=Number(fd.get('price'));const year=Number(fd.get('year'));const mileage=Number(fd.get('mileage'));const power=Number(fd.get('power'));const engineName=String(fd.get('engineName')||'').trim();const rawCapacity=String(fd.get('engineCapacity')||'').trim();const engineCapacity=rawCapacity===''?null:Number(rawCapacity);if(engineName.length>80||(engineCapacity!==null&&(!Number.isInteger(engineCapacity)||engineCapacity<0||engineCapacity>12000)))return $('sellNote').textContent=T('invalidPrice');if(!Number.isInteger(priceValue)||priceValue<1||priceValue>999999999||!Number.isInteger(mileage)||mileage<0||mileage>1500000||!Number.isInteger(power)||power<1||power>2000||year<1950||year>new Date().getFullYear()+1)return $('sellNote').textContent=T('invalidPrice');const passportFields=Object.fromEntries(['serviceHistory','modificationNotes','documentNotes'].map(k=>[k,String(fd.get(k)||'').trim()]));const engineFields={engineName,engineCapacity};const submit=$('sellSubmit');submit.disabled=true;submit.textContent='…';const uploadedRefs=[];let expected,listingDocument,listingData,commitAttempted=false,publishError;try{
 const requestedCustoms=String(fd.get('customsStatus')||'unknown');
 const customsStatus=['cleared','importRequired'].includes(requestedCustoms)?requestedCustoms:'unknown';
 if(state.user.isPreview){const photo=files[0]?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(files[0])}):(existing?.image||'assets/limba/icons/car.png');const item={id:existing?.id||'preview-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),category:'vehicles',uid:state.user.uid,isPreview:true,isDemo:true,status:'active',createdAt:Date.now(),title:fullTitle,description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),customsStatus,customsCountry:String(fd.get('country')),condition:String(fd.get('condition')),contactEmail:'',image:photo,images:[photo],make,model,modelExtension,year,mileage,power,...engineFields,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim(),...passportFields,...extras};state.listings=state.listings.filter(x=>x.id!==item.id);state.listings.unshift(item);
 persist('previewCars',state.listings.filter(x=>x.isPreview));closeModal({replaceHistory:true});toast(F('previewSaved'));showView('mine');return}
 const {db,storage,modules:m}=fb;
 const fields={title:fullTitle,description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),customsStatus,customsCountry:String(fd.get('country')),condition:String(fd.get('condition')),contactEmail:'',make,model,modelExtension,year,mileage,power,...engineFields,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim(),...passportFields,...extras};
 const placeId=String(fd.get('placeId')||'');
 if(/^gn-\d{1,10}$/.test(placeId))fields.placeId=placeId;
 else if(existing?.placeId)fields.placeId=m.deleteField();
 if(!modelExtension){
   if(existing?.modelExtension)fields.modelExtension=m.deleteField();
   else delete fields.modelExtension;
 }
 for(const k of ['serviceHistory','modificationNotes','documentNotes','engineName']){
  if(!(passportFields[k]||engineFields[k])){if(existing?.[k])fields[k]=m.deleteField();else delete fields[k]}
 }
 if(engineCapacity===null){if(existing?.engineCapacity!==undefined&&existing?.engineCapacity!==null)fields.engineCapacity=m.deleteField();else delete fields.engineCapacity}
 if(existing){
  if(existing.uid!==state.user.uid)throw Error('Not listing owner');
  if(existing.photoDetails&&!extras.photoDetails)fields.photoDetails=m.deleteField();
  if(existing.batteryReport&&!extras.batteryReport)fields.batteryReport=m.deleteField();
  await m.updateDoc(m.doc(db,'listings',existing.id),fields);
  Object.assign(existing,{...fields,modelExtension,...passportFields,...engineFields,...extras});
  if(!extras.photoDetails)delete existing.photoDetails;
  if(!extras.batteryReport)delete existing.batteryReport;renderAll();closeModal({replaceHistory:true});toast(W('editAd'));showView('mine');return;
 }
 const uid=user.uid;
 expected=await wizard.preparePublish();
 const secure=await useSecureMarketplace();
 if(state.user?.uid!==uid)throw new Error('Account changed');
 let images;
 if(secure){
  const {listingId}=await callSecureMarketplace('reserveListingUpload',{count:files.length});
  listingDocument=m.doc(db,'listings',listingId);
  for(const [slot,file] of files.entries()){
   if(state.user?.uid!==uid)throw new Error('Account changed');
   const base64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=reject;
    reader.readAsDataURL(file);
   });
   ({images}=await callSecureMarketplace('uploadListingPhoto',{listingId,slot,mimeType:file.type,base64}));
  }
  if(!Array.isArray(images)||images.length!==files.length)throw new Error('Photo validation incomplete');
 }else{
  listingDocument=m.doc(m.collection(db,'listings'));
  images=[];
  for(const [slot,file] of files.entries()){
   const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
   if(state.user?.uid!==uid)throw new Error('Account changed');
   const ref=m.ref(storage,`listings/${uid}/${listingDocument.id}/${slot}.${extension}`);
   await m.uploadBytes(ref,file,{contentType:file.type});
   uploadedRefs.push(ref);
   images.push(await m.getDownloadURL(ref));
  }
 }
 listingData={category:'vehicles',uid,status:'active',createdAt:m.serverTimestamp(),...fields,image:images[0],images};
 commitAttempted=true;
 await m.runTransaction(db,async transaction=>{
  await wizard.markPublished(transaction,expected,listingDocument.id);
  transaction.set(listingDocument,listingData);
  if(secure)transaction.update(m.doc(db,'listingUploads',listingDocument.id),{used:true});
 });
 finishPublication(form,wizard,expected,listingDocument.id,listingData);
 }catch(error){
  publishError=error;
  console.error('post failed',error);
  const outcome=commitAttempted?await wizard.commitStatus(expected,listingDocument.id):'open';
  if(outcome==='published'){
   publishError=null;
   finishPublication(form,wizard,expected,listingDocument.id,listingData);
  }else{
   if(outcome==='open')await Promise.allSettled(uploadedRefs.map(ref=>fb.modules.deleteObject(ref)));
   if(form.isConnected&&error.code!=='listing-draft-conflict'){
    form.querySelector('#sellNote').textContent=outcome==='unknown'?L('draftPublishUncertain'):expected?T('uploadFailed'):wizard?L('draftRetry'):T('uploadFailed');
   }
  }
 }finally{
  wizard?.releasePublish(publishError);
  submit.disabled=false;submit.textContent=editing?W('editAd'):T('publish');
 }
}
function finishPublication(form,wizard,expected,id,data){
 wizard.acceptPublished(expected,id);
 if(state.user?.uid!==data.uid)return;
 const listing={...data,id,createdAt:Date.now()};
 serverOwned=[listing,...serverOwned.filter(car=>car.id!==id)];
 mergeListings();
 marketplaceSearch.refresh({force:true});
 if(form.isConnected){
  closeModal({replaceHistory:true});
  toast(T('carPublished'));
  showView('mine');
 }
}
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
async function removeListing(id){const x=state.listings.find(y=>y.id===id);if(!x||!state.user||x.uid!==state.user.uid)return;if(!window.confirm(T('removeConfirm')))return;if(x.isPreview){state.listings=state.listings.filter(y=>y.id!==id);persist('previewCars',state.listings.filter(y=>y.isPreview));renderAll();toast(T('removedMessage'));return}if(!state.fb)return;try{const {db,storage,modules:m}=state.fb;await m.deleteDoc(m.doc(db,'listings',id));state.listings=state.listings.filter(y=>y.id!==id);renderAll();toast(T('removedMessage'));for(const u of (x.images||[])){try{await m.deleteObject(m.ref(storage,u))}catch(e){if(e.code!=='storage/unauthorized')console.warn('image cleanup',e)}}}catch(e){toast(T('uploadFailed'))}}
async function useSecureMarketplace(){
 const {db,modules}=state.fb;
 try{
  const snapshot=await modules.getDocFromServer(modules.doc(db,'marketplaceSecurity','enforcement'));
  const config=snapshot.data();
  return config?.pipelineEnabled===true||config?.requirePipeline===true;
 }catch(error){
  // GitHub Pages can update before the production rules expose this rollout document.
  if(error.code==='permission-denied')return false;
  throw error;
 }
}
async function callSecureMarketplace(name,data){
 const {secureFunctions,modules}=state.fb;
 if(!secureFunctions)throw new Error('Marketplace service unavailable');
 return (await modules.httpsCallable(secureFunctions,name,{timeout:130000})(data)).data;
}
let firebaseConnection=null;
function connectFirebase(){
 if(state.firebaseReady)return Promise.resolve(true);
 if(!firebaseConnection)firebaseConnection=startFirebase().finally(()=>{firebaseConnection=null});
 return firebaseConnection;
}
async function startFirebase(){const conf=window.LIMBA_FIREBASE_CONFIG || window.LUMA_FIREBASE_CONFIG;if(!conf?.apiKey||!conf?.projectId)return false;try{
 const base='https://www.gstatic.com/firebasejs/12.6.0/';
 const [app,auth,db,storage,functions]=await Promise.all([
  ...['firebase-app.js','firebase-auth.js','firebase-firestore.js','firebase-storage.js'].map(module=>import(base+module)),
  import(base+'firebase-functions.js').catch(()=>null)
 ]);
 const init=app.getApps().length?app.getApp():app.initializeApp(conf);
 if(conf.recaptchaEnterpriseSiteKey){
  try{
   const {initializeAppCheck,ReCaptchaEnterpriseProvider}=await import(base+'firebase-app-check.js');
   initializeAppCheck(init,{
    provider:new ReCaptchaEnterpriseProvider(conf.recaptchaEnterpriseSiteKey),
    isTokenAutoRefreshEnabled:true
   });
  }catch(error){console.warn('Firebase App Check initialization',error.code||error.name)}
 }
 const modules={...auth,...db,...storage,...functions};
 state.fb={auth:auth.getAuth(init),db:db.getFirestore(init),storage:storage.getStorage(init),
  functions:functions?.getFunctions(init,'europe-west1')||null,
  secureFunctions:functions?.getFunctions(init,'europe-west6')||null,modules};
 state.firebaseReady=true;
 auth.onAuthStateChanged(state.fb.auth,async user=>{
  if(!user&&state.user?.isPreview)return;
  const generation=++accountLoad;
  unsubscribeOwned?.();unsubscribeOwned=null;serverOwned=[];
  unsubscribeSearches?.();unsubscribeSearches=null;
  const guestCountries=!state.user?[...state.countries]:[];
  switchAccount(user);
  marketplaceSearch.refresh();
  if(user){
   try{await user.reload()}catch{}
   if(generation!==accountLoad||state.user?.uid!==user.uid)return;
   void dealerUI.submitVerified(user);
   if(pendingContact)void resumeContact();
   try{
    const [favoriteSnap,prefs]=await Promise.all([
     db.getDocs(db.collection(state.fb.db,'users',user.uid,'favorites')),
     db.getDoc(db.doc(state.fb.db,'users',user.uid,'data','preferences'))
    ]);
    if(generation!==accountLoad||state.user?.uid!==user.uid)return;
    state.favorites=favoriteSnap.docs.map(d=>d.id);
    if(prefs.exists()){
     state.countries=(prefs.data().countries||[]).filter(x=>COUNTRIES.some(c=>c[0]===x));
    }else{
     // Transfer guest selection only when no server-side preference exists.
     const initial=state.countries.length?state.countries:guestCountries;
     state.countries=[...new Set(initial)].filter(code=>COUNTRIES.some(([valid])=>valid===code));
     if(state.countries.length)await saveCountries({notify:false});
    }
   }catch(err){console.warn('account load',err)}
   if(generation!==accountLoad||state.user?.uid!==user.uid)return;
   persistAccount('favorites',state.favorites);persistAccount('countries',state.countries);
   unsubscribeSearches=db.onSnapshot(db.doc(state.fb.db,'users',user.uid,'data','searches'),snapshot=>{
    if(generation!==accountLoad||state.user?.uid!==user.uid||!snapshot.exists()||snapshot.metadata.hasPendingWrites)return;
    state.searches=snapshot.data().items||[];
    persistAccount('searches',state.searches);
    renderSavedSearches();
   },err=>console.warn('saved searches',err));
   const ownQuery=db.query(db.collection(state.fb.db,'listings'),db.where('uid','==',user.uid),db.limit(100));
   unsubscribeOwned=db.onSnapshot(ownQuery,snapshot=>{
    if(generation!==accountLoad||state.user?.uid!==user.uid)return;
    serverOwned=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.()||0})).filter(x=>x.category==='vehicles');
    mergeListings();
   },err=>console.warn('own listings',err));
  }
  marketplaceSearch.refresh();renderRadius();mergeListings();applyTranslations();void hydrateFavorites(generation);
 });
 const collection=db.collection(state.fb.db,'listings');
 legacyRetry=()=>{
  stopLegacySearch?.();stopLegacySearch=null;
  beginListingLoad();applySearchRelease(false);renderAll();
 };
 let stopLegacySearch;
 function applySearchRelease(enabled){
  if(enabled){
   stopLegacySearch?.();stopLegacySearch=null;serverActive=[];
   marketplaceSearch.setEnabled(true);
   return;
  }
  marketplaceSearch.setEnabled(false);
  if(stopLegacySearch)return;
  const query=db.query(collection,db.where('status','==','active'),db.limit(300));
  stopLegacySearch=db.onSnapshot(query,{includeMetadataChanges:true},snapshot=>{
   serverActive=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.()||0})).filter(x=>x.category==='vehicles'&&x.make&&x.model);
   if(snapshot.metadata.fromCache&&!serverActive.length)return;
   clearTimeout(legacyDeadline);listingLoad='ready';
   mergeListings();
  },error=>{console.error('cars fetch',error);listingLoad='failed';renderAll()});
 }
 applySearchRelease(false);
 db.onSnapshot(db.doc(state.fb.db,'marketplaceRelease','v1_9'),{includeMetadataChanges:true},snapshot=>{
  if(!snapshot.metadata.fromCache)applySearchRelease(snapshot.data()?.searchEnabled===true&&Boolean(state.fb.secureFunctions));
 },()=>applySearchRelease(false));
 return true;
 }catch(e){console.error('firebase init',e);state.firebaseReady=false;toast(T('firebaseFailed'));return false}}
function wireMarketplace(){
 $('inboxBtn').addEventListener('click',()=>{closeAccountMenu();marketUI.openInbox()});
 $('navInbox').addEventListener('click',()=>marketUI.openInbox());
 $('navSell').addEventListener('click',()=>openSell());
 for(const id of ['loadMoreSearch','loadMorePerformance']) $(id).addEventListener('click',marketplaceSearch.more);
 $('retryListings').addEventListener('click',retryListingLoad);
 $('headerSell').addEventListener('click',()=>openSell());
 for (const id of ['menuSavedSearches','mobileSavedSearches']) $(id).addEventListener('click',()=>{
  showView('settings');
  $('savedSearchesList').focus();
 });
 $('displayCurrency').addEventListener('change',event=>void changeCurrency(event.target.value));
 $('countryQuick').addEventListener('click',event=>{
  const button=event.target.closest('[data-country-quick]');
  if(!button)return;
  const code=button.dataset.countryQuick;
  state.countries=state.countries.includes(code)?state.countries.filter(value=>value!==code):[...state.countries,code];
  void saveCountries({notify:false});
 });
 for(const id of ['searchCountryToggle','resultCountries']){
  $(id).addEventListener('click',()=>openSearchCountries($(id)));
 }
 $('searchCountryPanel').addEventListener('cancel',event=>{event.preventDefault();closeSearchCountries()});
 $('searchCountryPanel').addEventListener('click',event=>{
  if(event.target===$('searchCountryPanel'))closeSearchCountries();
 });
 $('cancelCountries').addEventListener('click',closeSearchCountries);
 $('applyCountries').addEventListener('click',()=>{
  state.countries=[...$('countryChoices').querySelectorAll('input:checked')].map(input=>input.value);
  closeSearchCountries();
  void saveCountries({notify:false});
 });
 for(const id of ['allCountries','quickAllCountries'])$(id).addEventListener('click',()=>{
  state.countries=[];
  closeSearchCountries();
  void saveCountries({notify:false});
 });
 $('emptyResults').addEventListener('click',event=>{
  const performance=event.target.closest('#emptyPerformance');
  if(!performance&&!event.target.closest('#resetEmpty'))return;
  state.countries=[];
  resetFilters();
  void saveCountries({notify:false});
  if(performance)showView('performance');
 });
 for (const [id, direction] of [['swipeSkip','left'],['swipeInfo','up'],['swipeSimilar','down']]) {
  $(id).addEventListener('click',()=>swipeAction(direction));
 }
 $('swipeTutorial').querySelectorAll('[data-gesture]').forEach(button=>button.addEventListener('click',()=>{
  dismissTutorial();swipeAction(button.dataset.gesture);
 }));
 $('swipeTutorial').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...$('swipeTutorial').querySelectorAll('button')];
  if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus()}
  else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus()}
 });
 $('settingsTheme').addEventListener('change',event=>setTheme(event.target.value));
 const theme=restore('theme','system');
 setTheme(['light','dark'].includes(theme)?theme:'system');
 $('settingsNotifications').addEventListener('click',()=>marketUI.openInbox('notifications'));
 for(const id of ['accountSignIn','settingsAccount'])$(id).addEventListener('click',openAuth);
 $('settingsPrivacy').addEventListener('click',()=>$('footerPrivacy').click());
 $('settingsSafety').addEventListener('click',()=>$('footerSafety').click());
 $('settingsCountries').addEventListener('click',()=>{
  showView('home');
  requestAnimationFrame(()=>{$('searchCountryToggle').focus();$('searchCountryToggle').click()});
 });
 wireRadius();renderRadius();

 $('activeFilters').addEventListener('click',event=>{
  const button=event.target.closest('[data-filter-remove]');
  if(!button)return;
  const key=button.dataset.filterRemove;
  if(key==='radius'){
   state.radius=null;state.radiusName='';renderRadius();searchChanged();
  }else if($(key)){
   $(key).value='';setFilter(key,'');
  }
  ($('activeFilters').firstElementChild||$('searchForm').querySelector('#keyword')).focus();
 });
 $('savedSearchesList').addEventListener('click',event=>{
  const toggle=event.target.closest('[data-alert]');
  if(toggle)marketUI.toggleAlert(Number(toggle.dataset.alert));
  const orphan=event.target.closest('[data-orphan-alert]');
  if(orphan)marketUI.toggleAlert(Number(orphan.dataset.orphanAlert),true);
 });
}
function setAdvancedFilters(expanded){
 $('advancedFilters').classList.toggle('hidden',!expanded);
 $('filterChevron').classList.toggle('rotated',expanded);
 for(const id of ['advancedToggle','resultFilter'])$(id).setAttribute('aria-expanded',String(expanded));
}
function handleDeepLink(){
 const hash=new URLSearchParams(location.hash.slice(1));
 const listing=hash.get('ad'), dealer=hash.get('dealer');
 if(!listing&&!dealer)return;
 const original=location.hash;
 void connectFirebase().then(ready=>{
  if(location.hash!==original||(!ready&&!offlinePreview))return;
  history.replaceState({lumaView:'home'},'',location.pathname+location.search);
  if(listing)void openListing(listing,{fresh:!offlinePreview});
  else void dealerUI.openPublic(dealer);
 });
}
function wire(){
 document.querySelectorAll('[data-seller-segment]').forEach(button=>button.addEventListener('click',()=>{
  $('sellerType').value=button.dataset.sellerSegment;
  setFilter('sellerType',button.dataset.sellerSegment);
 }));
wireMarketplace();catalogChooser=setupCatalogChooser();const language=$('language');language.innerHTML=LANGS.map(([c,label])=>`<option value="${h(c)}">${h(label)}</option>`).join('');language.value=state.locale;language.addEventListener('change',e=>{state.locale=e.target.value;persist('language',state.locale);$('settingsLanguage').value=state.locale;applyTranslations()});document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));$('brandBtn').addEventListener('click',()=>showView('home'));$('loginBtn').addEventListener('click',toggleAccountMenu);$('accountOpenBtn').addEventListener('click',()=>{closeAccountMenu();openAuth()});$('accountPreferencesBtn').addEventListener('click',()=>showView('settings'));document.addEventListener('click',e=>{if(!e.target.closest('#accountArea'))closeAccountMenu()});$('settingsLanguage').innerHTML=LANGS.map(([c,l])=>`<option value="${h(c)}">${h(l)}</option>`).join('');$('settingsLanguage').value=state.locale;$('settingsLanguage').addEventListener('change',e=>{state.locale=e.target.value;$('language').value=state.locale;persist('language',state.locale);applyTranslations()});$('saveSearchBtn').addEventListener('click',saveSearch);$('searchForm').addEventListener('submit',e=>{e.preventDefault();renderAll();$('resultsSection').scrollIntoView({behavior:'smooth'})});$('advancedToggle').addEventListener('click',()=>setAdvancedFilters($('advancedFilters').classList.contains('hidden')));$('resultFilter').addEventListener('click',()=>{
 setAdvancedFilters(true);
 $('advancedToggle').focus({preventScroll:true});
 $('advancedToggle').scrollIntoView({behavior:'smooth',block:'center'});
});$('clearAll').addEventListener('click',resetFilters);$('sort').addEventListener('change',e=>{state.sort=e.target.value;searchChanged()});Object.keys(state.filters).forEach(id=>$(id)?.addEventListener(['keyword','priceTo','priceFrom','mileageFrom','mileageTo','powerFrom','powerTo','engineTerm','capacityFrom','capacityTo','make','model'].includes(id)?'input':'change',e=>setFilter(id,e.target.value)));
 document.addEventListener('click',e=>{const heart=e.target.closest('[data-like]');if(heart){e.preventDefault();e.stopPropagation();return toggleFavorite(heart.dataset.like)}const card=e.target.closest('[data-open]');if(card)return openListing(card.dataset.open,{guard:()=>card.isConnected});const edit=e.target.closest('[data-edit]');if(edit)return openSell(edit.dataset.edit);
 const status=e.target.closest('[data-status-id]');if(status)return updateListingStatus(status.dataset.statusId,status.dataset.status);
 const del=e.target.closest('[data-delete]');if(del)return removeListing(del.dataset.delete);const apply=e.target.closest('[data-apply]');if(apply){const item=state.searches[Number(apply.dataset.apply)];if(item){state.filters={...blankFilters,...item.filters};state.countries=item.countries||[];state.radius=validRadius(item.radius)?item.radius:null;state.radiusName='';void saveCountries({notify:false});renderInputs();renderRadius();showView('home');restoreAnchorPending=false;$('resultsSection').scrollIntoView({behavior:'smooth'})}return}const drop=e.target.closest('[data-drop]');if(drop){drop.disabled=true;void dropSearch(Number(drop.dataset.drop))}});
 document.addEventListener('keydown',e=>{const card=e.target.closest?.('[data-open]');if(card&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();void openListing(card.dataset.open,{guard:()=>card.isConnected})}});
 $('swipeHome').addEventListener('click',()=>showView('home'));$('swipeFavorite').addEventListener('click',()=>{const arr=filtered();if(arr.length)toggleFavorite(arr[state.swipeIndex].id)});$('swipeHelp').addEventListener('click',showTutorial);$('swipeDone').addEventListener('click',dismissTutorial);$('swipeTutorialBack').addEventListener('click',hideTutorial);
 let pointer=null;const swipe=$('swipeCard');swipe.addEventListener('pointerdown',e=>{if(!$('swipeTutorial').classList.contains('hidden'))return;e.preventDefault();pointer={x:e.clientX,y:e.clientY};swipe.setPointerCapture(e.pointerId)});swipe.addEventListener('pointerup',e=>{if(!pointer)return;e.preventDefault();const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))<48)return;swipeAction(Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down')});
 swipe.addEventListener('pointercancel',()=>{pointer=null});
 swipe.addEventListener('lostpointercapture',()=>{pointer=null});
 swipe.addEventListener('click',e=>{if(e.detail===0&&state.view==='swipe'&&$('swipeTutorial').classList.contains('hidden')){const arr=filtered();if(arr.length)void openListing(arr[state.swipeIndex].id)}});document.addEventListener('keydown',e=>{if(state.view==='swipe'&&$('modal').classList.contains('hidden')&&$('swipeTutorial').classList.contains('hidden')){const move={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(move){e.preventDefault();swipeAction(move)}}if(e.key==='Escape'){if(!$('accountMenu').classList.contains('hidden'))closeAccountMenu();else if(!$('modal').classList.contains('hidden'))closeModal();else if(state.view==='swipe'&&!$('swipeTutorial').classList.contains('hidden'))hideTutorial();else if(state.view==='swipe')showView('home')}});$('modalClose').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target.dataset.close==='true')closeModal()});$('footerSafety').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('security')} ${h(T('safeTrading'))}</h2><p>${h(T('safeCarAdvice'))}</p>`));$('footerPrivacy').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('lock')} ${h(T('privacy'))}</h2><p>${h(T('privacyDemo'))}</p>`));
 history.scrollRestoration='manual';
 if(!location.hash)history.replaceState({lumaView:'home'},'',location.pathname+location.search);
 window.addEventListener('popstate',event=>{
  closeAccountMenu();
  const closingDetail=!$('modal').classList.contains('hidden')&&Boolean(searchAnchor);
  if(!$('modal').classList.contains('hidden'))closeModal({fromHistory:true});
  if(event.state?.lumaDetail){
   showView(event.state.lumaView||'home',{fromHistory:true});
   void openListing(event.state.lumaDetail,{fromHistory:true,guard:()=>history.state?.lumaDetail===event.state.lumaDetail});
   return;
  }
  restoreAnchorPending=closingDetail||restoreAnchorPending;
  showView(event.state?.lumaView||'home',{fromHistory:true});
  if(location.hash)handleDeepLink();
 });
 $('modal').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...$('modal').querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')]
   .filter(element=>!element.disabled&&element.tabIndex>=0&&element.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 });
 applyTranslations();
 showView('home',{fromHistory:true});
 handleDeepLink();
}
wire();
const storedCurrency = restore('displayCurrency', 'EUR');
$('displayCurrency').value = displayCurrencies.includes(storedCurrency) ? storedCurrency : 'EUR';
if ($('displayCurrency').value !== 'EUR') void changeCurrency($('displayCurrency').value);
if (!offlinePreview) void retryListingLoad();
