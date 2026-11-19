import {estimateImport} from './limba-lux.js';
import {estimateOfficialImport, loadOfficialImportData, officialDestination} from './borderless-official.js';
export const createLimbaExperiences=function createLimbaExperiences(api){
 const {el,state,filtered,carCard,price,number,flag,countryLabel,h,safeURL,T,F,X,L,isDemo,openDetails,modal,toast} = api;
 const selected=new Set();
 const listCountries=[['AL','🇦🇱','Albania'],['TR','🇹🇷','Türkiye'],['GR','🇬🇷','Greece'],['RS','🇷🇸','Serbia'],['SI','🇸🇮','Slovenia'],['XK','🇽🇰','Kosovo'],['MK','🇲🇰','North Macedonia'],['HR','🇭🇷','Croatia'],['BA','🇧🇦','Bosnia and Herzegovina'],['ME','🇲🇪','Montenegro'],['BG','🇧🇬','Bulgaria'],['RO','🇷🇴','Romania'],['CH','🇨🇭','Switzerland']];
 function passport(car){
  const detail=(key)=>h(car[key]||X('noInfo'));
  return `<section class="limba-passport"><div class="lux-heading"><span class="lux-symbol">✦</span><div><h3>${h(X('vehiclePass'))}</h3><small>${h(X('sellerClaims'))}</small></div></div><div class="passport-facts"><div><strong>${h(X('serviceHistory'))}</strong><p>${detail('serviceHistory')}</p></div><div><strong>${h(X('tuningDetails'))}</strong><p>${detail('modificationNotes')}</p></div><div><strong>${h(X('documentNotes'))}</strong><p>${detail('documentNotes')}</p></div></div><p class="lux-disclaimer">${h(X('notVerified'))}</p></section>`;
 }
 const countryOptions=excluded=>listCountries.filter(c=>c[0]!==excluded).map(([code,emoji])=>`<option value="${h(code)}">${emoji} ${h(countryLabel(code))}</option>`).join('');
 const importInputs=[
  ['transport','transport',1000000],['customs','customs',100],['vat','vat',100],['registration','registration',1000000]
 ];
 const importBreakdown=value=>[
  ['listedPrice',value.price],['transport',value.transport],['customs',value.duty],
  ['vat',value.tax],['registration',value.registration],['total',value.total]
 ];
 const officialInputs=[
  ['transport',()=>X('transport')],
  ['customs',()=>L('officialCustomsAmount')],
  ['customsBasis',()=>L('officialCustomsBasis')],
  ['vatBasis',()=>L('officialVatBasis')],
  ['vehicleTaxBasis',()=>L('officialVehicleTaxBasis')],
  ['otherCharges',()=>L('officialOtherCharges')],
  ['registration',()=>X('registration')]
 ];
 const moneyInput=(name,max,placeholder='')=>`<input name="${name}" type="number" min="0" max="${max}" step="0.01" inputmode="decimal" placeholder="${placeholder}">`;
 const importLocale=()=>state.locale==='cnr'?'sr-Latn':state.locale;
 const officialPrice=value=>value==null?L('officialNeedsInput'):
  new Intl.NumberFormat(importLocale(),{style:'currency',currency:'EUR'}).format(value);
 const percentage=value=>new Intl.NumberFormat(importLocale(),{style:'percent',maximumFractionDigits:2}).format(value/100);
 const formChoices=excluded=>`
  <label class="market-import-destination">${h(X('targetCountry'))}
   <select name="destination" required><option value="">—</option>${countryOptions(excluded)}</select></label>
  <label class="market-import-destination">${h(L('officialModeLabel'))}
   <select name="import-mode"><option value="official" selected>${h(L('officialMode'))}</option>
    <option value="manual">${h(L('manualMode'))}</option></select></label>`;
 const manualFields=suffix=>importInputs.map(([key,label,max])=>
  `<label>${h(X(label))}${moneyInput(key+suffix,max,'0')}</label>`).join('');
 const officialFields=(car,suffix)=>`
  <p class="borderless-location">${h(L('officialLocation'))} · ${h(countryLabel(car.country)||'—')}</p>
  <label>${h(L('officialVatApplies'))}<select name="official-vatApplicable${suffix}">
   <option value="">${h(L('officialUnknown'))}</option>
   <option value="yes">${h(L('officialYes'))}</option>
   <option value="no">${h(L('officialNo'))}</option>
  </select></label>
  <label class="borderless-check" data-official-option="euCirculation" hidden>
   <input type="checkbox" name="official-euCirculation${suffix}" disabled>
   <span>${h(L('officialEuCirculation'))}</span>
  </label>
  <label class="borderless-check" data-official-option="useCustomsRate" hidden>
   <input type="checkbox" name="official-useCustomsRate${suffix}" disabled>
   <span>${h(L('officialUseCustomsRate'))}</span>
  </label>
  ${officialInputs.map(([key,label])=>
   `<label data-official-option="${key}">${h(label())}${moneyInput('official-'+key+suffix,1000000000)}</label>`).join('')}`;
 const officialPane=(cars,compare)=>`
  <div class="borderless-official-pane" data-import-fields="official" hidden>
   <div class="borderless-sources" data-official-sources aria-live="polite"></div>
   <div data-official-inputs hidden>
    <p class="borderless-help">${h(L('officialCurrencyHelp'))} ${h(L('officialBasisHelp'))}</p>
    ${compare?`<div class="market-import-columns">${cars.map((car,index)=>
     `<fieldset data-official-vehicle><legend>${h(car.title)}</legend>${officialFields(car,'-'+index)}</fieldset>`).join('')}</div>`:
     `<div class="borderless-grid" data-official-vehicle>${officialFields(cars[0],'')}</div>`}
   </div>
  </div>`;
 const officialLines=(value,destination)=>[
  [X('listedPrice'),value.price],[X('transport'),value.transport],[L('officialCustomsAmount'),value.customs],
  ...(Number.isFinite(destination.vehicleTaxRate)?[[L('officialVehicleTax'),value.vehicleTax]]:[]),
  [L('officialVatAmount'),value.vat],[L('officialOtherCharges'),value.otherCharges],
  [X('registration'),value.registration],[value.complete?X('total'):L('officialSubtotal'),value.subtotal]
 ];
 function renderOfficialSources(target,record,verifiedOn){
  const date=verifiedOn?new Date(verifiedOn+'T00:00:00Z'):null;
  const sourceDate=date&&!Number.isNaN(date.valueOf())?
   `<time datetime="${h(verifiedOn)}">${h(new Intl.DateTimeFormat(importLocale(),{dateStyle:'medium',timeZone:'UTC'}).format(date))}</time>`:'';
  const rates=[
   [L('officialVatRate'),percentage(record.vatRate)],
   ...(Number.isFinite(record.customsStandardRate)?[[L('officialCustomsRate'),percentage(record.customsStandardRate)]]:[]),
   ...(record.customsZero?[[L('officialCustomsRate'),percentage(0)]]:[]),
   ...(Number.isFinite(record.vehicleTaxRate)?[[L('officialVehicleTax'),percentage(record.vehicleTaxRate)]]:[])
  ];
  const sourceLinks=[
   [L('officialVatSource'),record.vatSource],[L('officialCustomsSource'),record.customsSource],
   [L('officialVehicleTaxSource'),record.vehicleTaxSource],[L('officialExtraSource'),record.extraSource],
   [L('officialFxSource'),record.fxSource]
  ].filter(([,url])=>typeof url==='string'&&url.startsWith('https:')&&safeURL(url));
  const sources=new Map();
  for(const [label,url] of sourceLinks){
   sources.set(url,sources.has(url)?sources.get(url)+' · '+label:label);
  }
  target.innerHTML=`
   ${sourceDate?`<p><strong>${h(L('officialVerifiedOn'))}</strong> ${sourceDate}</p>`:''}
   <dl>${rates.map(([label,value])=>`<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>
   <ul>${Array.from(sources,([url,label])=>`<li><a href="${h(safeURL(url))}" target="_blank" rel="noopener noreferrer">${h(label)}</a></li>`).join('')}</ul>`;
 }
 function attachImportForm(form,result,cars,compare=false){
  const mode=form.elements.namedItem('import-mode');
  const destination=form.elements.namedItem('destination');
  const panes=Array.from(form.querySelectorAll('[data-import-fields]'));
  const sources=form.querySelector('[data-official-sources]');
  const officialControls=form.querySelector('[data-official-inputs]');
  const description=form.previousElementSibling?.querySelector('[data-import-description]')??form.previousElementSibling;
  const submit=form.querySelector('button[type="submit"]');
  const suffix=index=>compare?'-'+index:'';
  const field=(key,index)=>form.elements.namedItem('official-'+key+suffix(index));
  let officialData=null;
  let loading=false;
  let failed=false;
  let modePicked=false;
  let previousMode=mode.value;
  let previousDestination=destination.value;
  function setOption(key,index,visible){
   const input=field(key,index);
   input.disabled=!visible;
   input.closest('[data-official-option]').hidden=!visible;
  }
  function refresh(){
   const official=mode.value==='official';
   const record=official&&officialData?officialDestination(officialData,destination.value):null;
   if(description)description.textContent=official?L('officialStandardScope'):X('importDesc');
   for(const pane of panes){
    const visible=pane.dataset.importFields===mode.value;
    pane.hidden=!visible;
    for(const input of pane.querySelectorAll('input,select'))input.disabled=!visible;
   }
   submit.disabled=official&&!record;
   officialControls.hidden=!record;
   if(!official)return;
   if(!officialData&&!loading&&!failed){
    loading=true;
    loadOfficialImportData().then(data=>{
     officialData=data;
     failed=!data;
    }).catch(()=>{failed=true;}).finally(()=>{
     loading=false;
     if(!form.isConnected)return;
     if(failed&&!modePicked){
      mode.value='manual';
      previousMode=mode.value;
     }
     refresh();
    });
   }
   if(!record){
    sources.textContent=loading?L('loading'):
     failed||(officialData&&destination.value)?L('officialUnavailable'):X('targetCountry');
    return;
   }
   renderOfficialSources(sources,record,officialData.verifiedOn);
   cars.forEach((_,index)=>{
    const eu=record.isEu&&field('euCirculation',index).checked;
    const enterCustoms=!eu&&!record.customsZero;
    const useRate=enterCustoms&&Number.isFinite(record.customsStandardRate)&&!field('customs',index).value.trim();
    setOption('euCirculation',index,record.isEu);
    setOption('customs',index,enterCustoms);
    setOption('useCustomsRate',index,useRate);
    setOption('customsBasis',index,useRate&&field('useCustomsRate',index).checked);
    setOption('vatBasis',index,field('vatApplicable',index).value==='yes');
    setOption('vehicleTaxBasis',index,Number.isFinite(record.vehicleTaxRate));
   });
  }
  function clearOfficialInputs(){
   for(const input of officialControls.querySelectorAll('input,select')){
    if(input.type==='checkbox')input.checked=false;
    else input.value='';
   }
  }
  form.addEventListener('change',()=>{
   if(previousMode!==mode.value){
    modePicked=true;
    previousMode=mode.value;
    failed=false;
   }
   if(previousDestination!==destination.value){
    clearOfficialInputs();
    previousDestination=destination.value;
   }
   refresh();
   result.textContent=mode.value==='official'?'':compare?'':X('estimateMissing');
  });
  form.addEventListener('submit',event=>{
   event.preventDefault();
   const values=new FormData(form);
   const official=mode.value==='official';
   const record=official&&officialData?officialDestination(officialData,destination.value):null;
   if(official&&!record){result.textContent=L('officialUnavailable');return;}
   if(!official&&!compare&&!importInputs.some(([key])=>String(values.get(key)??'').trim())){
    result.textContent=X('estimateMissing');
    return;
   }
   const estimates=cars.map((car,index)=>{
    if(!official)return estimateImport({
     price:car.price,...Object.fromEntries(importInputs.map(([key])=>[key,values.get(key+suffix(index))]))
    });
    const read=key=>values.get('official-'+key+suffix(index));
    const vatChoice=read('vatApplicable');
    return estimateOfficialImport(record,{
     price:car.price,...Object.fromEntries(officialInputs.map(([key])=>[key,read(key)])),
     vatApplicable:vatChoice==='yes'?true:vatChoice==='no'?false:null,
     euCirculation:read('euCirculation')!==null,useCustomsRate:read('useCustomsRate')!==null
    });
   });
   const rows=estimates.map(value=>official?officialLines(value,record):importBreakdown(value).map(([key,amount])=>[X(key),amount]));
   const format=official?officialPrice:price;
   const last=rows[0].length-1;
   if(!compare){
    result.innerHTML=rows[0].map(([label,value],index)=>`<div class="${index===last?'import-total':''}">
     <span>${h(label)}</span><strong>${h(format(value))}</strong></div>`).join('');
    return;
   }
   result.innerHTML=`<div class="compare-table" role="table">
    <div class="compare-row compare-names"><span>${h(countryLabel(destination.value))}</span>
     ${cars.map(car=>`<strong>${h(car.title)}</strong>`).join('')}</div>
    ${rows[0].map(([label],index)=>{
     const summary=index===last;
     const rowLabel=official&&summary&&estimates.some(value=>!value.complete)?L('officialSubtotal'):label;
     return `<div class="compare-row ${summary?'import-total':''}"><span>${h(rowLabel)}</span>
      ${rows.map(row=>`<strong>${h(format(row[index][1]))}
       ${official&&summary&&row[index][0]!==rowLabel?`<small>${h(row[index][0])}</small>`:''}</strong>`).join('')}</div>`;
    }).join('')}</div>`;
  });
  refresh();
 }
 function calculatorMarkup(car){
  return `<section class="borderless-box">
   <div class="lux-heading"><span class="lux-symbol">◎</span><div><h3>${h(X('borderless'))}</h3>
    <small data-import-description>${h(X('importDesc'))}</small></div></div>
   <form class="borderless-grid" id="importForm">
    ${formChoices(car.country)}
    <div class="borderless-inline-fields" data-import-fields="manual">${manualFields('')}</div>
    ${officialPane([car],false)}
    <button type="submit" class="primary-btn">${h(X('calculate'))}</button>
   </form><div class="import-result" id="importResult" aria-live="polite"><p>${h(X('estimateMissing'))}</p></div>
   <p class="lux-disclaimer">${h(X('estimateOnly'))}</p>
  </section>`;
 }
 function attachCalculator(car){
  const form=el('importForm');
  if(form)attachImportForm(form,el('importResult'),[car]);
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
  const importMarkup=`<section class="market-listing-section">
   <h3>${h(L('compareImport'))}</h3><p>${h(X('importDesc'))}</p>
   <form class="market-import-form" id="compareImportForm">
    <div class="market-import-columns">${formChoices()}</div>
    <div class="market-import-columns" data-import-fields="manual">${pair.map((car,index)=>`<fieldset>
     <legend>${h(car.title)}</legend>${manualFields('-'+index)}
    </fieldset>`).join('')}</div>
    ${officialPane(pair,true)}
    <button class="primary-btn" type="submit">${h(X('calculate'))}</button>
   </form><div id="compareImportResult" class="market-import-result" aria-live="polite"></div>
   <p class="lux-disclaimer">${h(X('estimateOnly'))}</p>
  </section>`;

  modal(`<h2 id="modalTitle">${h(X('compare'))}</h2><div class="compare-table" role="table"><div class="compare-row compare-names"><span></span>${pair.map(car=>`<strong>${h(car.title)}<br>${price(car.price)}</strong>`).join('')}</div>${data.map(([k,fn])=>`<div class="compare-row"><span>${h(X(k)!==k?X(k):T(k))}</span>${pair.map(car=>`<strong>${h(fn(car))}</strong>`).join('')}</div>`).join('')}</div><p class="lux-disclaimer">${h(X('sellerClaims'))}</p>${importMarkup}`);
  attachImportForm(el('compareImportForm'),el('compareImportResult'),pair,true);
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
 return {passport,calculatorMarkup,attachCalculator,garageCards,render,clearSelection:id=>{selected.delete(id)}};
};
