// Scrollable, accessible type-ahead menus backed by the bundled car catalogue.
import {normalizeMake} from './car-brands.js';
let pickerSerial=0;
export function attachSearchPicker({input,getOptions,onChoose,getLabel}) {
  if(!input || typeof getOptions!=='function')throw Error('Search picker input missing');
  const host=input.closest('.search-field');
  if(!host)throw Error('Search field wrapper missing');
  const list=document.createElement('div');
  list.className='catalogue-dropdown hidden';
  list.setAttribute('role','listbox');
  list.id='limba-catalogue-'+(++pickerSerial);
  host.appendChild(list);
  input.setAttribute('role','combobox');
  input.setAttribute('aria-controls',list.id);
  input.setAttribute('aria-haspopup','listbox');
  input.setAttribute('aria-expanded','false');
  input.setAttribute('aria-autocomplete','list');
  // Keep the static datalist in the HTML as a no-JS fallback only.
  input.removeAttribute('list');
  let activeIndex=-1,choices=[];
  const close=()=>{
    list.classList.add('hidden');
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    activeIndex=-1;
  };
  const choose=index=>{
    const selected=choices[index];
    if(!selected)return;
    input.value=selected;
    onChoose(selected);
    close();
  };
  const open=all=>{
    const source=getOptions().filter(x=>typeof x==='string'&&x.trim());
    const term=all?'':normalizeMake(input.value);
    choices=(term?source.filter(x=>normalizeMake(x).includes(term)):source).slice(0,500);
    activeIndex=-1;
    const title=document.createElement('div');
    title.className='catalogue-dropdown-head';
    title.textContent=(getLabel?getLabel():'Auswählen')+' · '+choices.length;
    list.replaceChildren(title);
    if(!choices.length){
      const empty=document.createElement('div');
      empty.className='catalogue-dropdown-empty';
      empty.textContent='Keine passenden Einträge';
      list.append(empty);
    }
    choices.forEach((name,index)=>{
      const item=document.createElement('button');
      item.type='button';
      item.className='catalogue-option';
      item.setAttribute('role','option');
      item.setAttribute('aria-selected','false');
      item.id=list.id+'-option-'+index;
      item.textContent=name;
      item.addEventListener('pointerdown',e=>e.preventDefault());
      item.addEventListener('click',e=>{e.preventDefault();choose(index)});
      list.append(item);
    });
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded','true');
    input.removeAttribute('aria-activedescendant');
  };
  const highlight=index=>{
    if(!choices.length)return;
    activeIndex=Math.max(0,Math.min(choices.length-1,index));
    list.querySelectorAll('[role="option"]').forEach((element,n)=>{
      element.classList.toggle('is-highlighted',n===activeIndex);
      element.setAttribute('aria-selected',String(n===activeIndex));
    });
    const item=document.getElementById(list.id+'-option-'+activeIndex);
    if(item){input.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'})}
  };
  input.addEventListener('focus',()=>open(true));
  input.addEventListener('click',()=>open(true));
  input.addEventListener('input',()=>open(false));
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!list.classList.contains('hidden')){e.preventDefault();close();return}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      if(list.classList.contains('hidden'))open(true);
      highlight(activeIndex<0?(e.key==='ArrowDown'?0:choices.length-1):activeIndex+(e.key==='ArrowDown'?1:-1));
    }else if(e.key==='Enter'&&!list.classList.contains('hidden')&&activeIndex>=0){
      e.preventDefault();choose(activeIndex);
    }else if(e.key==='Tab')close();
  });
  input.addEventListener('blur',()=>queueMicrotask(()=>{
    if(!host.contains(document.activeElement))close();
  }));
  document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))close()});
  return {close,open};
}
