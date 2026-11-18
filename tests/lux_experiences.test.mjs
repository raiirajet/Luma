import assert from 'node:assert/strict';
import {LUX,lux,estimateImport} from '../limba-lux.js';
for (const lang of ['de','en','sq','tr','el','sr-Latn','sr-Cyrl','sl','hr','mk','bs','cnr','bg','ro']) {
 assert.ok(LUX[lang],lang);
 assert.equal(Object.keys(LUX[lang]).length,Object.keys(LUX.de).length);
 for(const k of Object.keys(LUX.de))assert.ok(LUX[lang][k]?.trim(),lang+' '+k);
 assert.ok(lux('vehiclePass',lang));
}
const result=estimateImport({price:30000,transport:1000,customs:10,vat:19,registration:500});
assert.equal(result.duty,3100);
assert.equal(result.tax,6479);
assert.equal(result.total,41079);
assert.equal(estimateImport({price:100,transport:-4,customs:0,vat:0}).total,100);
assert.equal(estimateImport({price:100,customs:999}).duty,100);
console.log('PASS Limba experiences: translations, safe input handling, estimate arithmetic');
