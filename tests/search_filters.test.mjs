import assert from 'node:assert/strict';
import {SEARCH_TEXT,searchLabel} from '../search-filters-i18n.js';
for(const code of ['de','en','sq','tr','el','sr-Latn','sr-Cyrl','sl','hr','mk','bs','cnr','bg','ro']){
 const fields=SEARCH_TEXT[code]; assert.ok(fields,code);
 assert.equal(Object.keys(fields).length,20,code);
 for(const [key,label] of Object.entries(fields)) assert.ok(label.trim(),code+' '+key);
 assert.ok(searchLabel('mileageFrom',code));
}
assert.equal(searchLabel('capacityFrom','de'),'Hubraum ab (cm³)');
console.log('PASS 14 locale filter labels');
