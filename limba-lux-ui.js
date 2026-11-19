export const createLimbaExperiences=function createLimbaExperiences(api){
 const {el,state,filtered,carCard,price,number,flag,countryLabel,h,safeURL,T,F,X,L,isDemo,openDetails,modal,toast} = api;
 const selected=new Set();
 function passport(car){
  const detail=key=>h(car[key]||X('noInfo'));
  return `<section class="limba-passport"><div class="lux-heading"><span class="lux-symbol">✦</span><div><h3>${h(X('vehiclePass'))}</h3><small>${h(X('sellerClaims'))}</small></div></div><div class="passport-facts"><div><strong>${h(X('serviceHistory'))}</strong><p>${detail('serviceHistory')}</p></div><div><strong>${h(X('tuningDetails'))}</strong><p>${detail('modificationNotes')}</p></div><div><strong>${h(X('documentNotes'))}</strong><p>${detail('documentNotes')}</p></div></div><p class="lux-disclaimer">${h(X('notVerified'))}</p></section>`;
 }
 function garageCards(cars){
  for(const id of [...selected])if(!cars.some(car=>car.id===id))selected.delete(id);
  if(!cars.length)return `<div class="empty-panel"><h3>${h(X('noGarage'))}</h3></div>`;
  return cars.map(car=>`<div class="garage-item">${carCard(car)}<label class="garage-pick"><input type="checkbox" data-garage-pick="${h(car.id)}" ${selected.has(car.id)?'checked':''}><span>${h(X('compare'))}</span></label></div>`).join('');
 }
 function compare(){
  const pair=[...selected].map(id=>state.listings.find(car=>car.id===id)).filter(Boolean);
  if(pair.length!==2){toast(X('selectTwo'));return;}
  const data=[
   ['make',car=>car.make],['model',car=>[car.model,car.modelExtension].filter(Boolean).join(' ')],
   ['firstReg',car=>car.year],['mileage',car=>`${number(car.mileage)} ${T('kmUnit')}`],
   ['power',car=>`${number(car.power)} ${T('powerUnit')}`],['fuel',car=>T(car.fuel)],
   ['transmission',car=>T(car.transmission)],['serviceHistory',car=>car.serviceHistory||X('noInfo')],
   ['tuningDetails',car=>car.modificationNotes||X('noInfo')]];
  modal(`<h2 id="modalTitle">${h(X('compare'))}</h2><div class="compare-table" role="table"><div class="compare-row compare-names"><span></span>${pair.map(car=>`<strong>${h(car.title)}<br>${price(car.price)}</strong>`).join('')}</div>${data.map(([k,fn])=>`<div class="compare-row"><span>${h(X(k)!==k?X(k):T(k))}</span>${pair.map(car=>`<strong>${h(fn(car))}</strong>`).join('')}</div>`).join('')}</div><p class="lux-disclaimer">${h(X('sellerClaims'))}</p>`);
 }
 function render(){
  const arr=filtered(),spot=el('showroomSpotlight');
  if(spot){
   const car=arr.find(x=>!isDemo(x))||arr[0];
   spot.classList.toggle('hidden',!car);
   if(car)spot.innerHTML=`<div class="showroom-picture"><img loading="lazy" src="${h(safeURL(car.image))}" alt="${h(car.title)}"><span class="showroom-label">${h(X('showroomBadge'))}</span></div><div class="showroom-copy"><p class="showroom-eyebrow">LIMBA SHOWROOM</p><h2>${h(car.title)}</h2><p>${flag(car.country)} ${h(car.city)} · ${number(car.mileage)} ${h(T('kmUnit'))}</p><strong>${price(car.price)}</strong><p>${h(X('showroomDesc'))}</p>${isDemo(car)?`<small>${h(F('previewOnly'))}</small>`:''}<button type="button" class="white-btn" data-open="${h(car.id)}">${h(X('openShowroom'))}</button></div>`;
  }
  const performance=el('performanceGrid');
  if(performance){
   const cars=arr.filter(car=>String(car.modelExtension||'').trim()||String(car.modificationNotes||'').trim());
   performance.innerHTML=cars.length?cars.map(carCard).join(''):`<div class="empty-panel"><h3>${h(X('noPerformance'))}</h3><p>${h(X('performanceDesc'))}</p></div>`;
  }
  const summary=el('garageComparison');
  if(summary)summary.innerHTML=`<div class="garage-toolbar"><p>${h(X('garageDesc'))}</p><div><button type="button" class="outline-btn" data-compare-clear>${h(X('clearCompare'))}</button><button type="button" class="primary-btn" data-compare-open ${selected.size===2?'':'disabled'}>${h(X('compare'))} (${selected.size}/2)</button></div></div>`;
 }
 document.addEventListener('change',event=>{
  const check=event.target.closest?.('[data-garage-pick]');if(!check)return;
  const id=check.dataset.garagePick;
  if(check.checked){if(selected.size>=2){check.checked=false;toast(X('compareTooMany'));return;}selected.add(id)}
  else selected.delete(id);
  render();
 });
 document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-compare-clear]')){selected.clear();render();}
  if(event.target.closest?.('[data-compare-open]'))compare();
 });
 return {passport,garageCards,render,clearSelection:id=>{selected.delete(id)}};
};
