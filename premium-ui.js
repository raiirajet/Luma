// Limba premium interactions: no extra client writes to protected marketplace fields.
import {mt} from './marketplace-i18n.js';
export function createPremiumUI({state,getUser,getFirebase,openAuth,openPhone,modal,closeModal,renderAll,showDetails,setFilter,renderInputs,formatPrice,escape:esc,T,notify}) {
  const $=id=>document.getElementById(id);
  const L=key=>mt(key,state.locale);
  const STORAGE='luma_auto_compare_v15';
  let compares=[];
  try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');compares=Array.isArray(saved)?saved.filter(x=>typeof x==='string').slice(0,3):[]}catch{}
  const hasCompare=id=>compares.includes(id);
  let galleryImages=[],galleryIndex=0,galleryFocus=null;
  let activeAlertId=null,activeAlert=false;
  let themeChoice=localStorage.getItem('luma_auto_theme')||'system';
  const mobile=()=>window.matchMedia('(max-width:760px)').matches;
  const advanced=$('advancedFilters');
  const filterParent=advanced.parentElement;
  const storeCompare=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(compares))}catch{}};
  const validCompare=()=>compares.map(id=>state.listings.find(x=>x.id===id)).filter(x=>x&&x.category==='vehicles');
  const filterLabels={
    keyword:'searchTerms',make:'make',model:'model',priceTo:'priceTo',priceFrom:'priceFrom',
    yearFrom:'yearFrom',yearTo:'yearTo',mileageTo:'mileageTo',fuel:'fuel',
    transmission:'transmission',body:'body',sellerType:'sellerType'
  };
  function renderChips() {
    const chips=$('activeFilterChips');if(!chips)return;
    const active=Object.entries(state.filters).filter(([key,value])=>value!==''&&value!==null&&value!==undefined);
    chips.innerHTML=active.map(([k,v])=>'<button type="button" class="filter-chip" data-clear-filter="'+esc(k)+'" aria-label="'+esc(L('removeFilter'))+' '+esc(T(filterLabels[k]||k))+'">'+esc(T(filterLabels[k]||k))+': '+esc(T(String(v))!==String(v)?T(String(v)):v)+' <span aria-hidden="true">×</span></button>').join('');
    if(active.length)chips.innerHTML+='<button type="button" class="filter-chip filter-clear" data-clear-filter="__all">'+esc(T('resetFilters'))+'</button>';
  }
  function renderCompare() {
    const dock=$('compareDock');if(!dock)return;
    const cars=validCompare();
    dock.classList.toggle('hidden',!cars.length||state.view==='swipe');
    if(!cars.length)return;
    dock.innerHTML='<span>'+esc(L('compare'))+' · '+cars.length+'/3</span>'+
      '<button class="outline-btn" type="button" id="compareOpen">'+esc(L('compareNow'))+'</button>'+
      '<button type="button" class="compare-clear" id="compareClear" aria-label="'+esc(L('clearCompare'))+'">×</button>';
  }
  function render() {
    renderChips();renderCompare();
    const label=$('themeLabel');if(label)label.textContent=L('themeTitle');
    const picker=$('themeSelect');
    if(picker){
      const current=picker.value||themeChoice;
      picker.innerHTML=['system','light','dark'].map(x=>'<option value="'+x+'">'+esc(L('theme'+x[0].toUpperCase()+x.slice(1)))+'</option>').join('');
      picker.value=themeChoice;
    }
  }
  function toggleCompare(id) {
    if(compares.includes(id))compares=compares.filter(x=>x!==id);
    else if(compares.length>=3){notify(L('compareLimit'));return}
    else compares.push(id);
    storeCompare();renderAll();
  }
  function showCompare() {
    const cars=validCompare();
    if(cars.length<2){notify(L('compareNeedTwo'));return}
    const rows=[
      ['price',x=>formatPrice(x.price)],
      ['firstReg',x=>String(x.year||'—')],
      ['mileage',x=>(x.mileage??'—')+' km'],
      ['power',x=>(x.power??'—')+' PS'],
      ['fuel',x=>T(x.fuel||'—')],
      ['transmission',x=>T(x.transmission||'—')],
      ['accidentHistory',x=>L(x.accidentStatus==='no'?'accidentNo':x.accidentStatus==='yes'?'accidentYes':'accidentUnknown')],
      ['country',x=>x.country+' · '+x.city]
    ];
    const table='<div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col">'+esc(L('compareFeature'))+'</th>'+
      cars.map(x=>'<th scope="col"><img loading="lazy" alt="" src="'+esc(x.image||'assets/limba/icons/car.png')+'"><span>'+esc(x.title)+'</span><button type="button" class="compare-remove" data-compare-remove="'+esc(x.id)+'">'+esc(L('removeFromCompare'))+'</button></th>').join('')+'</tr></thead><tbody>'+
      rows.map(([key,extract])=>'<tr><th scope="row">'+esc(T(key)!==key?T(key):L(key))+'</th>'+cars.map(x=>'<td>'+esc(extract(x))+'</td>').join('')+'</tr>').join('')+
      '</tbody></table></div>';
    modal('<h2 id="modalTitle">'+esc(L('compareTitle'))+'</h2><p>'+esc(L('compareHint'))+'</p>'+table);
  }
  function switchTheme() {
    const system=window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme=(themeChoice==='system'?(system?'dark':'light'):themeChoice);
    document.documentElement.style.colorScheme=document.documentElement.dataset.theme;
  }
  function closeDrawer() {
    advanced.classList.add('hidden');
    advanced.removeAttribute('data-filter-drawer');
    filterParent.appendChild(advanced);
    $('advancedToggle').setAttribute('aria-expanded','false');
    $('filterChevron')?.classList.remove('rotated');
    $('filterShade')?.classList.add('hidden');
    document.body.classList.remove('filter-sheet-open');
  }
  function updateDrawer() {
    if(mobile()&&!advanced.classList.contains('hidden')){
      document.body.appendChild(advanced);
      advanced.setAttribute('data-filter-drawer','true');
      advanced.setAttribute('role','dialog');
      advanced.setAttribute('aria-modal','true');
      advanced.setAttribute('aria-label',L('moreFilters'));
      $('filterShade').classList.remove('hidden');
      document.body.classList.add('filter-sheet-open');
    }else{
      advanced.removeAttribute('data-filter-drawer');
      advanced.removeAttribute('role');advanced.removeAttribute('aria-modal');
      filterParent.appendChild(advanced);
      $('filterShade').classList.add('hidden');
      document.body.classList.remove('filter-sheet-open');
    }
  }
  async function loadPriceHistory(car,area) {
    const fb=getFirebase();if(!fb||car.isDemo||car.isPreview){area.textContent=L('historyEmpty');return}
    try{
      const m=fb.modules;
      const query=m.query(m.collection(fb.db,'listingPriceHistory',car.id,'entries'),m.orderBy('createdAt','desc'),m.limit(12));
      const records=await m.getDocs(query);
      if(!area.isConnected)return;
      if(records.empty){area.textContent=L('historyEmpty');return}
      area.innerHTML='<ol class="price-history-list">'+records.docs.map(doc=>{
        const d=doc.data();const date=d.createdAt?.toDate?.();
        const stamp=date?date.toLocaleDateString(state.locale==='cnr'?'sr-Latn':state.locale):'—';
        const difference=typeof d.oldPriceEur==='number'?d.newPriceEur-d.oldPriceEur:0;
        return '<li><span>'+esc(stamp)+'</span><strong>'+esc(formatPrice(d.newPriceEur))+'</strong>'+
          (d.kind==='changed'?'<small class="'+(difference<0?'price-down':'')+'">'+(difference<0?'↓ ':'')+esc(formatPrice(difference))+'</small>':'<small>'+esc(L('initialPrice'))+'</small>')+'</li>';
      }).join('')+'</ol>';
    }catch(e){if(area.isConnected)area.textContent=L('historyUnavailable')}
  }
  async function readAlert(car,button) {
    const fb=getFirebase(),user=getUser();
    if(!fb||!user||user.isPreview||user.uid===car.uid)return;
    activeAlertId=car.id;
    try{
      const result=await fb.modules.httpsCallable(fb.functions,'getPriceAlert')({listingId:car.id});
      if(!button.isConnected||activeAlertId!==car.id)return;
      activeAlert=result.data?.enabled===true;
      button.textContent=activeAlert?L('priceAlertOn'):L('priceAlert');
      button.setAttribute('aria-pressed',String(activeAlert));
    }catch{button.textContent=L('priceAlert')}
  }
  async function toggleAlert(car,button) {
    const user=getUser();
    if(!user||user.isPreview){openAuth();return}
    if(!user.emailVerified){notify(T('verifiedRequired'));return}
    if(user.uid===car.uid){notify(L('alertOwn'));return}
    if(!user.phoneNumber){openPhone();return}
    const fb=getFirebase();if(!fb){notify(L('offline'));return}
    button.disabled=true;
    try{
      const result=await fb.modules.httpsCallable(fb.functions,'setPriceAlert')({listingId:car.id,enabled:!activeAlert});
      activeAlert=result.data?.enabled===true;
      button.textContent=activeAlert?L('priceAlertOn'):L('priceAlert');
      button.setAttribute('aria-pressed',String(activeAlert));
      notify(activeAlert?L('priceAlertSaved'):L('priceAlertRemoved'));
    }catch(e){notify(e?.message||L('historyUnavailable'))}finally{button.disabled=false}
  }
  function decorateDetail(car) {
    const images=(car.images?.length?car.images:[car.image]).filter(Boolean);
    const controls=$('photoControls'),img=$('detailImage');
    if(controls&&img){
      const counter=document.createElement('span');
      counter.className='photo-counter';
      controls.appendChild(counter);
      const expand=document.createElement('button');
      expand.type='button';expand.className='outline-btn photo-fullscreen';
      expand.textContent=L('fullscreenPhoto');
      controls.appendChild(expand);
      const current=()=>Math.max(0,images.findIndex(url=>new URL(url,document.baseURI).href===img.src));
      const updateThumbs=()=>{
        const idx=current();
        counter.textContent=(idx+1)+' / '+images.length;
        controls.parentElement.querySelectorAll('[data-thumb-index]').forEach(b=>{
          b.classList.toggle('is-current',Number(b.dataset.thumbIndex)===idx);
          b.setAttribute('aria-current',String(Number(b.dataset.thumbIndex)===idx));
        });
      };
      const thumbs=document.createElement('div');thumbs.className='detail-thumbnails';
      thumbs.innerHTML=images.map((url,i)=>'<button type="button" data-thumb-index="'+i+'" aria-label="'+esc(L('photo')+' '+(i+1))+'"><img loading="lazy" alt="" src="'+esc(url)+'"></button>').join('');
      controls.insertAdjacentElement('afterend',thumbs);
      thumbs.addEventListener('click',event=>{
        const b=event.target.closest('[data-thumb-index]');if(b){img.src=images[Number(b.dataset.thumbIndex)];updateThumbs()}
      });
      img.addEventListener('load',updateThumbs);
      img.addEventListener('click',()=>showGallery(images,current(),car.title));
      expand.addEventListener('click',()=>showGallery(images,current(),car.title));
      updateThumbs();
    }
    if(car.isDemo||car.isPreview||!car.uid)return;
    const zone=document.createElement('section');zone.className='price-watch-panel';
    zone.innerHTML='<div class="price-watch-header"><h3>'+esc(L('priceHistory'))+'</h3>'+
      '<button type="button" class="outline-btn" id="priceWatchButton" aria-pressed="false">'+esc(L('priceAlert'))+'</button></div>'+
      '<p class="muted-copy">'+esc(L('priceAlertHint'))+'</p>'+
      '<div id="historyContent" class="price-history-body">'+esc(L('loading'))+'</div>';
    const insert=$('photoControls')||$('detailShare');
    insert?.insertAdjacentElement('afterend',zone);
    loadPriceHistory(car,zone.querySelector('#historyContent'));
    const button=zone.querySelector('#priceWatchButton');
    if(getUser()?.uid===car.uid)button.classList.add('hidden');
    else{
      activeAlert=false;readAlert(car,button);
      button.addEventListener('click',()=>toggleAlert(car,button));
    }
  }
  function showGallery(images,idx,title) {
    if(!images.length)return;
    galleryImages=images;galleryIndex=Math.max(0,idx);galleryFocus=document.activeElement;
    $('galleryOverlay').classList.remove('hidden');
    $('galleryOverlay').setAttribute('aria-label',title);
    updateGallery();
    $('galleryClose').focus();
  }
  function updateGallery(){
    if(!galleryImages.length)return;
    $('galleryImage').src=galleryImages[galleryIndex];
    $('galleryCounter').textContent=(galleryIndex+1)+' / '+galleryImages.length;
  }
  function closeGallery(){
    $('galleryOverlay').classList.add('hidden');
    galleryFocus?.focus?.({preventScroll:true});
  }
  function bind() {
    const picker=$('themeSelect');
    if(picker)picker.addEventListener('change',()=>{themeChoice=picker.value;localStorage.setItem('luma_auto_theme',themeChoice);switchTheme()});
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(themeChoice==='system')switchTheme()});
    $('advancedToggle')?.addEventListener('click',updateDrawer);
    $('filterShade')?.addEventListener('click',closeDrawer);
    const footer=document.createElement('button');footer.type='button';footer.id='filterApplyBtn';
    footer.className='primary-btn filter-apply';footer.textContent=L('showResults');
    footer.addEventListener('click',()=>{closeDrawer();$('resultsSection')?.scrollIntoView({behavior:'smooth'})});
    advanced.appendChild(footer);
    window.addEventListener('resize',()=>{
      if(!mobile()&&advanced.hasAttribute('data-filter-drawer')){
        advanced.removeAttribute('data-filter-drawer');
        filterParent.appendChild(advanced);
        $('filterShade').classList.add('hidden');
        document.body.classList.remove('filter-sheet-open');
      }
    });
    document.addEventListener('click',e=>{
      const comp=e.target.closest('[data-compare-id]');
      if(comp){e.preventDefault();e.stopPropagation();toggleCompare(comp.dataset.compareId);return}
      const del=e.target.closest('[data-compare-remove]');
      if(del){e.preventDefault();e.stopPropagation();compares=compares.filter(id=>id!==del.dataset.compareRemove);storeCompare();closeModal();renderAll();showCompare();return}
      const chip=e.target.closest('[data-clear-filter]');
      if(chip){e.preventDefault();e.stopPropagation();
        if(chip.dataset.clearFilter==='__all'){
          Object.keys(state.filters).forEach(k=>state.filters[k]='');
          renderInputs();renderAll();
        }else{
          const key=chip.dataset.clearFilter;
          $(key).value='';setFilter(key,'');renderInputs();
        }
        return;
      }
      if(e.target.closest('#compareOpen')){e.preventDefault();e.stopPropagation();showCompare();return}
      if(e.target.closest('#compareClear')){e.preventDefault();e.stopPropagation();compares=[];storeCompare();renderAll();return}
    },true);
    $('galleryClose')?.addEventListener('click',closeGallery);
    $('galleryPrev')?.addEventListener('click',()=>{galleryIndex=(galleryIndex-1+galleryImages.length)%galleryImages.length;updateGallery()});
    $('galleryNext')?.addEventListener('click',()=>{galleryIndex=(galleryIndex+1)%galleryImages.length;updateGallery()});
    document.addEventListener('keydown',e=>{
      if(!$('galleryOverlay').classList.contains('hidden')){
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeGallery()}
        if(e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();galleryIndex=(galleryIndex+1)%galleryImages.length;updateGallery()}
        if(e.key==='ArrowLeft'){e.preventDefault();e.stopImmediatePropagation();galleryIndex=(galleryIndex-1+galleryImages.length)%galleryImages.length;updateGallery()}
      } else if(e.key==='Escape' && advanced.hasAttribute('data-filter-drawer')){
        e.preventDefault();e.stopImmediatePropagation();closeDrawer();
      }
    },true);
    switchTheme();render();
  }
  return {bind,render,decorateDetail,hasCompare};
}
