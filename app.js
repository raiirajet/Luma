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
const state={locale:restore('language','de'),view:'home',filters:{keyword:'',make:'',model:'',priceTo:'',yearFrom:'',mileageTo:'',fuel:'',transmission:'',body:'',sellerType:'',priceFrom:'',yearTo:'',mileageFrom:'',powerFrom:'',powerTo:'',engineTerm:'',capacityFrom:'',capacityTo:''},countries:restore('countries',[]),favorites:restore('favorites',[]).filter(id=>!String(id).startsWith('demo-')||(offlinePreview&&id==='demo-nissan-gtr')),searches:restore('searches',[]),listings:[...(offlinePreview?restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id):[]),...DEMO],swipeIndex:0,user:null,firebaseReady:false,fb:null,photoIndex:0,swipeSeen:restore('swipeSeen',false)};
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
function switchAccount(user){
 if(state.user?.uid!==user?.uid&&($('marketThreads')||$('marketMessageList')||$('marketNotifications')))closeModal();
 state.user=user;
 marketUI.connectAccount(user);
 dealerUI.connectAccount(user);
 const suffix=user?.uid?'user:'+user.uid+':':'';
 state.favorites=restore(suffix+'favorites',[]).filter(x=>!String(x).startsWith('demo-')||(offlinePreview&&x==='demo-nissan-gtr'));
 state.searches=restore(suffix+'searches',[]);
 state.countries=restore(suffix+'countries',[]);
}
let serverActive=[],serverOwned=[],unsubscribeOwned=null,unsubscribeSearches=null,accountLoad=0;
function mergeListings(){
 const local=offlinePreview?restore('previewCars',[]).filter(x=>x?.isPreview&&x?.id):[];
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
const luxUI=createLimbaExperiences({el:$,state,filtered:()=>filtered(),carCard:x=>carCard(x),price,number,flag,countryLabel,h,safeURL,T,F,X,L,isDemo,openDetails:(id)=>showDetails(id),modal,toast});
const marketUI=createLimbaMarketplace({el:$,state,h,price,number,L,T,F,W,X,modal,toast,openAuth,openListing,renderSavedSearches});
const dealerUI=createDealerAccountUI({el:$,state,h,L,T,modal,toast,openAuth});
function applyTranslations(){document.documentElement.lang=state.locale;document.title=`Limba Auto · ${T('heroTitle1')}`;document.querySelector('meta[name="description"]').content=T('footerCar');document.querySelector('meta[property="og:title"]').content=document.title;document.querySelector('meta[property="og:description"]').content=T('heroDescription');document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=T(el.dataset.i18n)});document.querySelectorAll('[data-release]').forEach(el=>{el.textContent=L(el.dataset.release)});marketUI.updateInboxButton();document.querySelectorAll('[data-lux]').forEach(el=>{el.textContent=X(el.dataset.lux)});document.querySelectorAll('[data-filter]').forEach(el=>{el.textContent=S(el.dataset.filter)});document.querySelectorAll('[data-filter-aria]').forEach(el=>{el.setAttribute('aria-label',S(el.dataset.filterAria))});document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',T(el.dataset.i18nAria)));document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=T(el.dataset.i18nPlaceholder));$('loginText').textContent=state.user?(state.user.email?.split('@')[0]||T('logout')):T('login');$('loginBtn').setAttribute('aria-label',$('loginText').textContent);$('accountStatus').textContent=state.user?.isPreview?F('previewMode'):T(state.user?'profileSync':'guestSync');$('fabAdd').setAttribute('aria-label',F('addVehicle'));$('fabAdd').title=F('addVehicle');$('fabAddLabel').textContent=F('addVehicle');$('settingsLanguageLabel').textContent=F('chooseLanguage');$('swipeHelp').setAttribute('aria-label',T('learnSwipeAgain'));$('swipeHome').setAttribute('aria-label',T('backToMarket'));$('swipeFavorite').setAttribute('aria-label',T('saveFavourites'));$('modalClose').setAttribute('aria-label',T('cancel'));$('swipeTutorialBack').querySelector('span').textContent=D('backToCar');document.querySelector('.swipe-photo').setAttribute('aria-label',T('swipeTitle'));renderInputs();renderAll()}
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
function setFilter(field,val){state.filters[field]=val;if(field==='make')state.filters.model='';if(field==='body')document.querySelectorAll('[data-body]').forEach(b=>b.classList.toggle('is-selected',b.dataset.body===val));if(field==='make'){state.filters.model='';$('model').value='';renderModelOptions()}renderAll()}
function filtered(){const f=state.filters;const term=f.keyword.trim().toLocaleLowerCase(state.locale);let items=state.listings.filter(x=>{
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
function carCard(x){const liked=state.favorites.includes(x.id);return `<article class="car-card" data-open="${h(x.id)}" tabindex="0"><div class="car-img"><img loading="lazy" src="${h(safeURL(x.image)||'assets/limba/icons/car.png')}" alt="${h(x.title)}"/><span class="car-tag">${h(isDemo(x)?F('previewOnly'):T(x.sellerType||'privateSeller'))}</span><button class="card-heart ${liked?'active':''}" data-like="${h(x.id)}" aria-label="${h(T('saveFavourites'))}">${icon('heart')}</button></div><div class="card-body"><strong class="car-price car-price-overview">${price(x.price)}</strong><h3 class="car-title">${h(x.title)}</h3><p class="car-sub">${h(T(x.fuel||'petrol'))} · ${h(T(x.transmission||'manual'))}${x.engineName?' · '+h(x.engineName):''}</p><div class="car-specs"><span>${h(String(x.year||'—'))}</span><span>${number(x.mileage)} ${h(T('kmUnit'))}</span><span>${number(x.power)} ${h(T('powerUnit'))}</span></div><div class="car-bottom"><div class="car-location">${icon('location')} ${flag(x.country)} ${h(x.city)}<br>${h(countryLabel(x.country))}</div></div></div></article>`}
function renderAll(){const arr=filtered();$('carGrid').innerHTML=arr.map(carCard).join('');$('emptyResults').classList.toggle('hidden',arr.length!==0);$('resultCount').textContent=`${number(arr.length)} ${T('searchResultCount')}`;$('heroCount').textContent=number(arr.length);document.querySelectorAll('[data-body]').forEach(b=>b.classList.toggle('is-selected',b.dataset.body===state.filters.body));
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
 luxUI.render();renderSwipe()}
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

 const container=$('activeFilters');
 container.setAttribute('aria-label',L('activeFilters'));
 container.classList.toggle('hidden',!chips.length);
 container.innerHTML=chips.map(({key,label})=>`<button type="button" data-filter-remove="${h(key)}"
  aria-label="${h(L('removeFilter')+': '+label)}">${h(label)}<span aria-hidden="true">×</span></button>`).join('');
}
function renderSearchCountries(){
 const label=state.countries.length?(state.countries.length<=2?state.countries.map(c=>flag(c)+' '+countryLabel(c)).join(', '):state.countries.length+' '+L('filterCountry')):L('allCountries');
 $('searchCountryToggle').innerHTML='<span>'+h(label)+'</span>';
 $('searchCountryToggle').setAttribute('aria-label',L('filterCountry')+': '+label);
 $('countryChoices').innerHTML=COUNTRIES.map(([c,fl])=>'<label class="country-choice '+(state.countries.includes(c)?'is-active':'')+'"><input type="checkbox" value="'+h(c)+'" '+(state.countries.includes(c)?'checked':'')+'><span>'+fl+' '+h(countryLabel(c))+'</span></label>').join('');
}
function closeSearchCountries(){
 $('searchCountryPanel').classList.add('hidden');
 $('searchCountryToggle').setAttribute('aria-expanded','false');
}
function closeAccountMenu(){
 $('accountMenu').classList.add('hidden');$('loginBtn').setAttribute('aria-expanded','false');
}
function toggleAccountMenu(){
 const opening=$('accountMenu').classList.contains('hidden');
 $('accountMenu').classList.toggle('hidden',!opening);$('loginBtn').setAttribute('aria-expanded',String(opening));
 if(opening)$('accountOpenBtn').focus();
}
function showView(view,{fromHistory=false}={}){
 closeAccountMenu();closeSearchCountries();
 const views=['home','swipe','favorites','performance','mine','settings'];if(!views.includes(view))return;
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
function renderSwipe(){const arr=filtered();if(!arr.length){$('swipeCard').innerHTML=`<div class="empty-panel swipe-empty"><h3>${h(T('emptyCars'))}</h3></div>`;$('swipeFavorite').classList.remove('active');return}state.swipeIndex=((state.swipeIndex%arr.length)+arr.length)%arr.length;const x=arr[state.swipeIndex];$('swipeCard').innerHTML=`<img src="${h(safeURL(x.image))}" alt="${h(x.title)}" draggable="false"><div class="swipe-shade"></div><div class="swipe-details"><span class="swipe-demo-badge">${h(isDemo(x)?F('previewOnly'):T('carsNav'))} · ${state.swipeIndex+1}/${arr.length}</span><h2>${h(x.title)}</h2><strong>${price(x.price)}</strong><p>${flag(x.country)} ${h(x.city)} · ${number(x.mileage)} ${h(T('kmUnit'))} · ${h(String(x.year))}</p></div>`;$('swipeFavorite').innerHTML=icon('heart');$('swipeFavorite').classList.toggle('active',state.favorites.includes(x.id))}
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
let modalReturnFocus=null,detailModalOpening=false;
function modal(content){
 const wasClosed=$('modal').classList.contains('hidden');
 marketUI.stopPanel();$('modal').querySelector('.modal-panel').classList.remove('market-detail');
 if(wasClosed)modalReturnFocus=document.activeElement;
 $('modalContent').innerHTML=content;$('modal').classList.remove('hidden');$('modalClose').focus();
 if(wasClosed&&!detailModalOpening)history.pushState({lumaView:state.view,lumaModal:true},'',location.pathname+location.search);
}
function closeModal({fromHistory=false,replaceHistory=false}={}){
 marketUI.stopPanel();
 const wasOpen=!$('modal').classList.contains('hidden');
 $('modal').classList.add('hidden');$('modalContent').innerHTML='';sellCatalogChooser?.destroy();sellCatalogChooser=null;
 if(wasOpen){const target=modalReturnFocus?.isConnected?modalReturnFocus:(state.view==='swipe'?$('swipeCard'):null);try{target?.focus?.({preventScroll:true})}catch{}modalReturnFocus=null}
 if(wasOpen&&!fromHistory&&(history.state?.lumaDetail||history.state?.lumaModal)){
  if(replaceHistory)history.replaceState({lumaView:state.view},'',location.pathname+location.search);
  else history.back();
 }
}
const detailPair=(name,val)=>`<div><small>${h(F(name)!==name?F(name):T(name)!==name?T(name):S(name))}</small><strong>${h(val)}</strong></div>`;
function showDetails(id,{focusSpecs=false,fromHistory=false,listing=null}={}){const x=listing||state.listings.find(v=>v.id===id);if(!x)return;state.photoIndex=0;const returnTo=state.view;
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
 modal(`<button type="button" class="detail-back outline-btn" id="detailBack">${icon('arrow_left')} ${h(D(returnTo==='swipe'?'backToSwipe':'backToListing'))}</button><div class="detail-head"><div><span class="overline">${h(T('vehicleDetails'))}</span><h2 id="modalTitle">${h(x.title)}</h2><p>${flag(x.country)} ${h(x.city)}, ${h(countryLabel(x.country))}</p></div><div class="detail-price">${price(x.price)}</div></div>${gallery}<div class="detail-actions" id="photoControls"><button class="outline-btn" id="photoPrev" aria-label="${h(T('photoPrevious'))}">${icon('arrow_left')}</button><button class="outline-btn" id="photoNext" aria-label="${h(T('photoNext'))}">${icon('arrow_right')}</button><button class="outline-btn" id="detailLike">${icon('heart')} ${h(T('saved'))}</button></div><h3 id="specsHeading">${h(T('technicalData'))}</h3><div class="spec-table">${detailPair('make',x.make)}${detailPair('model',x.model)}${x.modelExtension?detailPair('modelExtension',x.modelExtension):''}${detailPair('firstReg',String(x.year))}${detailPair('mileage',`${number(x.mileage)} ${T('kmUnit')}`)}${detailPair('fuel',T(x.fuel))}${detailPair('transmission',T(x.transmission))}${detailPair('body',T(x.body))}${detailPair('power',`${number(x.power)} ${T('powerUnit')}`)}${x.engineName?detailPair('engineName',x.engineName):''}${x.engineCapacity!==undefined&&x.engineCapacity!==null?detailPair('engineCapacity',String(x.engineCapacity)+' cm³'):''}${detailPair('sellerType',T(x.sellerType))}${detailPair('carCondition',T(x.condition==='new'?'conditionNew':'conditionUsed'))}${detailPair('accidentHistory',F(x.accidentStatus==='yes'?'accidentYes':x.accidentStatus==='no'?'accidentNo':'accidentUnknown'))}${x.conditionNote?detailPair('conditionShort',x.conditionNote):''}${isSample(x)?`${detailPair('color',D('black'))}${detailPair('engine','VR38DETT · 3.8 l V6 Bi-Turbo')}${detailPair('drive',D('awd'))}${detailPair('seats',D('fourSeats'))}`:''}</div>${luxUI.passport(x)}${marketUI.batteryReport(x)}${isDemo(x)?'':`<section class="market-listing-section"><h3>${h(L('priceHistory'))}</h3><div id="listingPriceHistory"><p>${h(L('loading'))}</p></div></section>`}<h3>${h(T('vehicleDescription'))}</h3><p class="vehicle-description">${h(isSample(x)?D('description'):(x.description||'—'))}</p>${isSample(x)?`<div class="sample-note">${h(D('singleDemoNotice'))}</div><p class="photo-credit">${h(D('photoCredit'))} <a href="${h(GTR_PHOTO_PAGE)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons · Joshua Spence · CC BY-SA 4.0</a></p>`:''}${legacyEmail?`<a class="outline-btn" href="mailto:${h(encodeURIComponent(x.contactEmail))}?subject=${h(encodeURIComponent(x.title))}">${h(T('askSeller'))}</a>`:''}${contactBar}`);
 detailModalOpening=false;
 $('modal').querySelector('.modal-panel').classList.add('market-detail');
 marketUI.loadPrices(x);
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
 $('detailShare').addEventListener('click',async()=>{const url=location.origin+location.pathname+'#ad='+encodeURIComponent(x.id);try{await navigator.clipboard.writeText(url);toast(T('linkCopied'))}catch{toast(url)}});
}
async function openListing(id,{guard=()=>true,fromHistory=false}={}){
 if(!id||typeof id!=='string'||id.includes('/'))return;
 if(state.listings.some(car=>car.id===id)){if(guard())showDetails(id,{fromHistory});return}
 if(!state.fb)return;
 const m=state.fb.modules;
 try{
  const snapshot=await m.getDoc(m.doc(state.fb.db,'listings',id));
  if(!guard())return;
  const data=snapshot.data();
  if(!data||data.category!=='vehicles')throw Error('Listing unavailable');
  showDetails(id,{fromHistory,listing:{...data,id}});
 }catch{if(guard())toast(L('listingUnavailable'))}
}
async function toggleFavorite(id){state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];if(!state.favorites.includes(id))luxUI.clearSelection(id);persistAccount('favorites',state.favorites);renderAll();if(state.user&&state.fb){const {db,modules:m}=state.fb;try{const r=m.doc(db,'users',state.user.uid,'favorites',id);if(state.favorites.includes(id))await m.setDoc(r,{createdAt:m.serverTimestamp()});else await m.deleteDoc(r)}catch(e){console.warn('favorite sync',e)}}}
const searchIdentity=item=>savedSearchKey(item,Object.keys(state.filters));
async function saveSearch(){
 const filters={...state.filters};
 const name=([filters.make,filters.model,filters.keyword].filter(Boolean).join(' ')||T('yourSavedSearch')).slice(0,120);
 const item={name,filters,countries:[...state.countries]};
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
 persistAccount('countries',countries);renderAll();
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
function resetFilters(){state.filters=Object.fromEntries(Object.keys(state.filters).map(k=>[k,'']));state.sort='latest';renderInputs();renderAll()}
async function hashPreviewPassword(password,salt){const encoded=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoded.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoded.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function loginPreview(username){const label=username.trim().toLowerCase();switchAccount({uid:'preview-'+label,email:label,isPreview:true,emailVerified:true});persist('previewSession',{username:label});closeModal();applyTranslations();toast(F('welcomePreview'))}
function openAuth(){
 if(state.user){const preview=Boolean(state.user.isPreview);modal(`<h2 id="modalTitle">${icon('user')} ${h(state.user.email||'')}</h2>${preview?`<div class="sample-note">${h(F('previewMode'))} · ${h(F('previewNotSynced'))}</div>`:`<p>${h(T(state.user.emailVerified?'verifiedBadge':'notVerified'))}</p>`}<div class="detail-actions"><button id="logout" class="outline-btn">${h(F('signOut'))}</button>${!preview&&!state.user.emailVerified?`<button id="verification" class="primary-btn">${h(T('sendVerification'))}</button><button id="verificationRefresh" class="outline-btn">${h(D('refreshVerification'))}</button>`:''}</div>${preview?'':`<section id="dealerAccountPanel"></section>`}`);
  if(!preview){dealerUI.renderAccount();void dealerUI.refreshReviewer()}
  $('logout').addEventListener('click',async()=>{if(preview){switchAccount(null);persist('previewSession',null);closeModal();applyTranslations()}else if(state.fb){await state.fb.modules.signOut(state.fb.auth);closeModal()}});
  if(!preview&&!state.user.emailVerified){$('verification').addEventListener('click',async()=>{try{await state.fb.modules.sendEmailVerification(state.user);toast(T('checkEmail'))}catch{toast(T('authFailure'))}});$('verificationRefresh').addEventListener('click',async()=>{try{await state.user.reload();await state.user.getIdToken(true);await dealerUI.submitVerified(state.user);applyTranslations();openAuth()}catch{toast(T('authFailure'))}})}return;
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
   if(submit.isConnected)closeModal();
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
 modal(`<h2 id="modalTitle">${icon('add_car')} ${h(F('vehicleProfile'))}</h2><p class="sample-note">${h(state.user.isPreview?F('previewMode'):T('uploadPhotoNote'))}</p><form id="sellForm" class="form-grid"><div class="sell-catalog-label"><label for="sellMake">${h(T('make'))}</label><div class="catalog-select"><input id="sellMake" name="make" maxlength="35" required autocomplete="off" placeholder="${h(T('makeExample'))}" role="combobox" aria-controls="sellMakeDropdown" aria-expanded="false" aria-autocomplete="list"><button type="button" class="catalog-trigger" data-catalog-toggle="sellMake" aria-label="${h(S('showMakes'))}">▾</button><div id="sellMakeDropdown" class="catalog-options hidden" role="listbox"></div></div><datalist id="sellMakeOptions">${mk}</datalist></div><div class="sell-catalog-label"><label for="sellModel">${h(T('model'))}</label><div class="catalog-select"><input id="sellModel" name="model" maxlength="65" required autocomplete="off" role="combobox" aria-controls="sellModelDropdown" aria-expanded="false" aria-autocomplete="list"><button type="button" class="catalog-trigger" data-catalog-toggle="sellModel" aria-label="${h(S('showModels'))}">▾</button><div id="sellModelDropdown" class="catalog-options hidden" role="listbox"></div></div><datalist id="sellModelOptions"></datalist></div><label>${h(F('modelExtension'))}<input name="modelExtension" maxlength="40" autocomplete="off" placeholder="${h(F('modelExtensionHint'))}"></label><label>${h(T('firstReg'))}<select name="year" required>${y}</select></label><label>${h(T('mileage'))}<input name="mileage" type="number" min="0" max="1500000" required></label>${chooser('fuel',['petrol','diesel','hybrid','electric'])}${chooser('transmission',['manual','automatic'])}${chooser('body',['suv','sedan','wagon','hatchback','coupe'])}<label>${h(T('power'))} (${h(T('powerUnit'))})<input name="power" type="number" min="1" max="2000" required></label><label>${h(S('engineName'))}<input name="engineName" maxlength="80" autocomplete="off" placeholder="${h(S('engineInfo'))}"></label><label>${h(S('engineCapacity'))}<input name="engineCapacity" type="number" min="0" max="12000" inputmode="numeric" placeholder="cm³"></label><label>${h(T('price'))} (€)<input name="price" type="number" min="1" max="999999999" required></label>${chooser('sellerType',dealerApproved?['privateSeller','dealer']:['privateSeller'])}${!dealerApproved&&!state.user.isPreview?`<p class="helper">${h(L('dealerListingHint'))}</p>`:''}<label>${h(T('country'))}<select name="country" required>${cs}</select></label><label>${h(T('location'))}<input name="city" maxlength="90" required></label><label>${h(T('carCondition'))}<select name="condition"><option value="used">${h(T('conditionUsed'))}</option><option value="new">${h(T('conditionNew'))}</option></select></label><label>${h(F('accidentCar'))}<select name="accidentStatus" required><option value="unknown">${h(F('accidentUnknown'))}</option><option value="no">${h(F('accidentNo'))}</option><option value="yes">${h(F('accidentYes'))}</option></select></label><label class="full-span">${h(F('conditionShort'))}<input name="conditionNote" maxlength="240" placeholder="${h(F('conditionShortHint'))}"></label><label class="full-span">${h(X('serviceHistory'))}<textarea name="serviceHistory" maxlength="500" rows="3" placeholder="${h(X('sellerClaims'))}"></textarea></label><label class="full-span">${h(X('tuningDetails'))}<textarea name="modificationNotes" maxlength="500" rows="3" placeholder="${h(X('sellerClaims'))}"></textarea></label><label class="full-span">${h(X('documentNotes'))}<textarea name="documentNotes" maxlength="240" rows="2" placeholder="${h(X('notVerified'))}"></textarea></label><label class="full-span">${h(T('vehicleDescription'))}<textarea name="description" required minlength="15" maxlength="3000"></textarea></label><label class="full-span">${icon('camera')} ${h(state.user.isPreview?F('optionalPhoto'):T('listingPhotos'))}<input id="sellImages" name="images" type="file" accept="image/jpeg,image/png,image/webp" ${state.user.isPreview||editing?'':'required'} multiple></label><fieldset class="market-listing-section full-span"><legend>${h(L('photoDetails'))}</legend><p>${h(L('photoGuide'))}</p><div class="market-photo-fields" id="marketPhotoFields"></div></fieldset>${marketUI.batteryFields(existing?.batteryReport||{})}<div class="full-span"><p class="helper" id="sellNote" role="status"></p><button id="sellSubmit" type="submit" class="primary-btn full-width">${h(state.user.isPreview?F('savePreviewCar'):T('publish'))}</button></div></form>`);const form=$('sellForm');
 if(!editing&&dealerApproved)form.elements.sellerType.value='dealer';
 if(existing){
  for(const name of ['make','model','modelExtension','year','mileage','power','engineName','engineCapacity','price','fuel','transmission','body','sellerType','country','city','condition','accidentStatus','conditionNote','serviceHistory','modificationNotes','documentNotes','description']){
   const el=form.elements.namedItem(name);if(el&&existing[name]!==undefined&&(name!=='sellerType'||existing.sellerType!=='dealer'||dealerApproved))el.value=String(existing[name]);
  }
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
 const updateSellModels=()=>{$('sellModelOptions').innerHTML=modelSuggestions($('sellMake').value,state.listings).map(v=>`<option value="${h(v)}"></option>`).join('');sellCatalogChooser?.refresh('sellModel')};$('sellMake').addEventListener('input',updateSellModels);updateSellModels();sellCatalogChooser?.destroy();sellCatalogChooser=setupCatalogChooser(['sellMake','sellModel']);form.dataset.editId=existing?.id||'';form.addEventListener('submit',publishCar)}
async function publishCar(e){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const editing=Boolean(form.dataset.editId);const existing=editing?state.listings.find(x=>x.id===form.dataset.editId):null;
 const files=Array.from(form.elements.images.files||[]);const allowed=['image/jpeg','image/png','image/webp'];if((!state.user?.isPreview&&!editing&&!files.length)||files.length>(state.user?.isPreview?1:6)||files.some(x=>!allowed.includes(x.type)||x.size>(state.user?.isPreview?800000:5*1024*1024))){return $('sellNote').textContent=T('fileError')}
 const attachmentCount=existing?.images?.length||(existing?.image?1:0);
 const photoDetails=listingPhotoDetailsFromForm(fd,editing?attachmentCount:files.length);
 const batteryReport=listingBatteryFromForm(fd);
 if(batteryReport===false)return $('sellNote').textContent=L('batteryInvalid');
 const extras={...(Object.keys(photoDetails).length?{photoDetails}:{}),...(batteryReport?{batteryReport}:{})};
 const make=resolveCarMake(fd.get('make'));const model=String(fd.get('model')||'').trim();const modelExtension=String(fd.get('modelExtension')||'').trim().replace(/\s+/g,' ');const fullTitle=[make,model,modelExtension].filter(Boolean).join(' ');if(!validCarMake(make)||!model||model.length>65||modelExtension.length>40||fullTitle.length>110){return $('sellNote').textContent=T('brandRequired')}const priceValue=Number(fd.get('price'));const year=Number(fd.get('year'));const mileage=Number(fd.get('mileage'));const power=Number(fd.get('power'));const engineName=String(fd.get('engineName')||'').trim();const rawCapacity=String(fd.get('engineCapacity')||'').trim();const engineCapacity=rawCapacity===''?null:Number(rawCapacity);if(engineName.length>80||(engineCapacity!==null&&(!Number.isInteger(engineCapacity)||engineCapacity<0||engineCapacity>12000)))return $('sellNote').textContent=T('invalidPrice');if(!Number.isInteger(priceValue)||priceValue<1||priceValue>999999999||!Number.isInteger(mileage)||mileage<0||mileage>1500000||!Number.isInteger(power)||power<1||power>2000||year<1950||year>new Date().getFullYear()+1)return $('sellNote').textContent=T('invalidPrice');const passportFields=Object.fromEntries(['serviceHistory','modificationNotes','documentNotes'].map(k=>[k,String(fd.get(k)||'').trim()]));const engineFields={engineName,engineCapacity};const submit=$('sellSubmit');submit.disabled=true;submit.textContent='…';const uploadedRefs=[];try{
 if(state.user.isPreview){const photo=files[0]?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(files[0])}):(existing?.image||'assets/limba/icons/car.png');const item={id:existing?.id||'preview-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),category:'vehicles',uid:state.user.uid,isPreview:true,isDemo:true,status:'active',createdAt:Date.now(),title:fullTitle,description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),condition:String(fd.get('condition')),contactEmail:'',image:photo,images:[photo],make,model,modelExtension,year,mileage,power,...engineFields,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim(),...passportFields,...extras};state.listings=state.listings.filter(x=>x.id!==item.id);state.listings.unshift(item);
 persist('previewCars',state.listings.filter(x=>x.isPreview));closeModal({replaceHistory:true});toast(F('previewSaved'));showView('mine');return}
 const {db,storage,modules:m}=state.fb;
 const fields={title:fullTitle,description:String(fd.get('description')).trim(),price:priceValue,country:String(fd.get('country')),city:String(fd.get('city')).trim(),condition:String(fd.get('condition')),contactEmail:'',make,model,modelExtension,year,mileage,power,...engineFields,fuel:String(fd.get('fuel')),transmission:String(fd.get('transmission')),body:String(fd.get('body')),sellerType:String(fd.get('sellerType')),accidentStatus:String(fd.get('accidentStatus')),conditionNote:String(fd.get('conditionNote')||'').trim(),...passportFields,...extras};
 // Existing production rules do not yet allow this optional new field.
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
 const uid=state.user.uid;
 const secure=await useSecureMarketplace();
 let document, images;
 if(secure){
  const {listingId}=await callSecureMarketplace('reserveListingUpload',{count:files.length});
  document=m.doc(db,'listings',listingId);
  for(const [slot,file] of files.entries()){
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
  document=m.doc(m.collection(db,'listings'));
  images=[];
  for(const [slot,file] of files.entries()){
   const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
   const ref=m.ref(storage,`listings/${uid}/${document.id}/${slot}.${extension}`);
   await m.uploadBytes(ref,file,{contentType:file.type});
   uploadedRefs.push(ref);
   images.push(await m.getDownloadURL(ref));
  }
 }
 const data={category:'vehicles',uid,status:'active',createdAt:m.serverTimestamp(),...fields,image:images[0],images};
 if(secure){
  const batch=m.writeBatch(db);
  batch.set(document,data);
  batch.update(m.doc(db,'listingUploads',document.id),{used:true});
  await batch.commit();
 }else await m.setDoc(document,data);
 state.listings.unshift({...data,id:document.id,createdAt:Date.now()});
 renderAll();closeModal({replaceHistory:true});toast(T('carPublished'));showView('mine')

 }catch(err){console.error('post failed',err);
 if(uploadedRefs.length){await Promise.all(uploadedRefs.map(ref=>state.fb.modules.deleteObject(ref).catch(e=>console.warn('cleanup',e))))}
 if(form.isConnected)form.querySelector('#sellNote').textContent=T('uploadFailed')}finally{submit.disabled=false;submit.textContent=editing?W('editAd'):T('publish')}}
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
  if(user){
   try{await user.reload()}catch{}
   if(generation!==accountLoad||state.user?.uid!==user.uid)return;
   void dealerUI.submitVerified(user);
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
  mergeListings();applyTranslations();
 });
 const collection=db.collection(state.fb.db,'listings');
 const query=db.query(collection,db.where('status','==','active'),db.limit(300));
 db.onSnapshot(query,snapshot=>{
  serverActive=snapshot.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toMillis?.()||0})).filter(x=>x.category==='vehicles'&&x.make&&x.model);
  mergeListings();
  const adHash=new URLSearchParams(location.hash.slice(1)).get('ad');
  if(adHash&&$('modal').classList.contains('hidden'))
   void openListing(adHash,{fromHistory:true,guard:()=>$('modal').classList.contains('hidden')&&new URLSearchParams(location.hash.slice(1)).get('ad')===adHash});
 },error=>{console.error('cars fetch',error);toast(T('loadFailed'))});
 return true;
 }catch(e){console.error('firebase init',e);state.firebaseReady=false;toast(T('firebaseFailed'));return false}}
function wireMarketplace(){
 $('inboxBtn').addEventListener('click',()=>{closeAccountMenu();marketUI.openInbox()});

 $('activeFilters').addEventListener('click',event=>{
  const button=event.target.closest('[data-filter-remove]');
  if(!button)return;
  const key=button.dataset.filterRemove;
  if($(key))$(key).value='';
   setFilter(key,'');
  ($('activeFilters').firstElementChild||$('searchForm').querySelector('#keyword')).focus();
 });
 $('savedSearchesList').addEventListener('click',event=>{
  const toggle=event.target.closest('[data-alert]');
  if(toggle)marketUI.toggleAlert(Number(toggle.dataset.alert));
  const orphan=event.target.closest('[data-orphan-alert]');
  if(orphan)marketUI.toggleAlert(Number(orphan.dataset.orphanAlert),true);
 });
}
function wire(){
 document.querySelectorAll('[data-seller-segment]').forEach(button=>button.addEventListener('click',()=>{
  $('sellerType').value=button.dataset.sellerSegment;
  setFilter('sellerType',button.dataset.sellerSegment);
 }));
wireMarketplace();catalogChooser=setupCatalogChooser();const language=$('language');language.innerHTML=LANGS.map(([c,label])=>`<option value="${h(c)}">${h(label)}</option>`).join('');language.value=state.locale;language.addEventListener('change',e=>{state.locale=e.target.value;persist('language',state.locale);$('settingsLanguage').value=state.locale;applyTranslations()});document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));$('brandBtn').addEventListener('click',()=>showView('home'));$('loginBtn').addEventListener('click',toggleAccountMenu);$('accountOpenBtn').addEventListener('click',()=>{closeAccountMenu();openAuth()});$('accountPreferencesBtn').addEventListener('click',()=>showView('settings'));document.addEventListener('click',e=>{if(!e.target.closest('#accountArea'))closeAccountMenu();if(!e.target.closest('#searchCountryField'))closeSearchCountries()});$('searchCountryToggle').addEventListener('click',()=>{const expanded=!$('searchCountryPanel').classList.toggle('hidden');$('searchCountryToggle').setAttribute('aria-expanded',String(expanded))});$('searchCountryField').addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearchCountries();$('searchCountryToggle').focus();e.stopPropagation()}});$('fabAdd').addEventListener('click',openSell);$('settingsLanguage').innerHTML=LANGS.map(([c,l])=>`<option value="${h(c)}">${h(l)}</option>`).join('');$('settingsLanguage').value=state.locale;$('settingsLanguage').addEventListener('change',e=>{state.locale=e.target.value;$('language').value=state.locale;persist('language',state.locale);applyTranslations()});$('saveSearchBtn').addEventListener('click',saveSearch);$('searchForm').addEventListener('submit',e=>{e.preventDefault();renderAll();$('resultsSection').scrollIntoView({behavior:'smooth'})});$('advancedToggle').addEventListener('click',()=>{$('advancedFilters').classList.toggle('hidden');$('filterChevron').classList.toggle('rotated',!$('advancedFilters').classList.contains('hidden'));$('advancedToggle').setAttribute('aria-expanded',String(!$('advancedFilters').classList.contains('hidden')))});['clearAll','resetEmpty'].forEach(id=>$(id).addEventListener('click',resetFilters));$('sort').addEventListener('change',e=>{state.sort=e.target.value;renderAll()});Object.keys(state.filters).forEach(id=>$(id)?.addEventListener(['keyword','priceTo','priceFrom','mileageFrom','mileageTo','powerFrom','powerTo','engineTerm','capacityFrom','capacityTo','make','model'].includes(id)?'input':'change',e=>setFilter(id,e.target.value)));document.querySelectorAll('[data-body]').forEach(btn=>btn.addEventListener('click',()=>setFilter('body',btn.dataset.body)));
 document.addEventListener('click',e=>{const heart=e.target.closest('[data-like]');if(heart){e.preventDefault();e.stopPropagation();return toggleFavorite(heart.dataset.like)}const card=e.target.closest('[data-open]');if(card)return showDetails(card.dataset.open);const edit=e.target.closest('[data-edit]');if(edit)return openSell(edit.dataset.edit);
 const status=e.target.closest('[data-status-id]');if(status)return updateListingStatus(status.dataset.statusId,status.dataset.status);
 const del=e.target.closest('[data-delete]');if(del)return removeListing(del.dataset.delete);const apply=e.target.closest('[data-apply]');if(apply){const item=state.searches[Number(apply.dataset.apply)];if(item){state.filters={...state.filters,...item.filters};state.countries=item.countries||[];void saveCountries({notify:false});renderInputs();showView('home');$('resultsSection').scrollIntoView({behavior:'smooth'})}return}const drop=e.target.closest('[data-drop]');if(drop){drop.disabled=true;void dropSearch(Number(drop.dataset.drop))}});
 document.addEventListener('keydown',e=>{const card=e.target.closest?.('[data-open]');if(card&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a,input,select,textarea')){e.preventDefault();showDetails(card.dataset.open)}});
 $('countryChoices').addEventListener('change',e=>{if(e.target.matches('input[type=checkbox]')){const code=e.target.value;state.countries=e.target.checked?[...new Set([...state.countries,code])]:state.countries.filter(x=>x!==code);void saveCountries({notify:false})}});$('allCountries').addEventListener('click',()=>{state.countries=[];void saveCountries({notify:false})});
 $('swipeHome').addEventListener('click',()=>showView('home'));$('swipeFavorite').addEventListener('click',()=>{const arr=filtered();if(arr.length)toggleFavorite(arr[state.swipeIndex].id)});$('swipeHelp').addEventListener('click',showTutorial);$('swipeDone').addEventListener('click',dismissTutorial);$('swipeTutorialBack').addEventListener('click',hideTutorial);
 let pointer=null;const swipe=$('swipeCard');swipe.addEventListener('pointerdown',e=>{if(!$('swipeTutorial').classList.contains('hidden'))return;e.preventDefault();pointer={x:e.clientX,y:e.clientY};swipe.setPointerCapture(e.pointerId)});swipe.addEventListener('pointerup',e=>{if(!pointer)return;e.preventDefault();const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))<48)return;swipeAction(Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down')});
 swipe.addEventListener('pointercancel',()=>{pointer=null});
 swipe.addEventListener('lostpointercapture',()=>{pointer=null});
 swipe.addEventListener('click',e=>{if(e.detail===0&&state.view==='swipe'&&$('swipeTutorial').classList.contains('hidden')){const arr=filtered();if(arr.length)showDetails(arr[state.swipeIndex].id)}});document.addEventListener('keydown',e=>{if(state.view==='swipe'&&$('modal').classList.contains('hidden')&&$('swipeTutorial').classList.contains('hidden')){const move={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(move){e.preventDefault();swipeAction(move)}}if(e.key==='Escape'){if(!$('accountMenu').classList.contains('hidden'))closeAccountMenu();else if(!$('modal').classList.contains('hidden'))closeModal();else if(state.view==='swipe'&&!$('swipeTutorial').classList.contains('hidden'))hideTutorial();else if(state.view==='swipe')showView('home')}});$('modalClose').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target.dataset.close==='true')closeModal()});$('footerSafety').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('security')} ${h(T('safeTrading'))}</h2><p>${h(T('safeCarAdvice'))}</p>`));$('footerPrivacy').addEventListener('click',()=>modal(`<h2 id="modalTitle">${icon('lock')} ${h(T('privacy'))}</h2><p>${h(T('privacyDemo'))}</p>`));
 const initialAd=new URLSearchParams(location.hash.slice(1)).get('ad');history.replaceState({lumaView:'home'},'',location.pathname+location.search);
 window.addEventListener('popstate',e=>{
  closeAccountMenu();if(!$('modal').classList.contains('hidden'))closeModal({fromHistory:true});
  if(e.state?.lumaDetail){showView(e.state.lumaView||'home',{fromHistory:true});void openListing(e.state.lumaDetail,{fromHistory:true,guard:()=>history.state?.lumaDetail===e.state.lumaDetail});return}
  showView(e.state?.lumaView||'home',{fromHistory:true});
 });
 applyTranslations();if(initialAd)setTimeout(()=>void openListing(initialAd),150)}
wire();connectFirebase();
