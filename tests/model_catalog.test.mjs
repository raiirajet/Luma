import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAR_MAKES,CAR_MODELS,modelSuggestions} from '../car-brands.js';
const native=JSON.parse(readFileSync('android/app/src/main/assets/brands.json','utf8'));
const web=CAR_MODELS;
assert.ok(native.makes.length>=600,'native makes');
assert.ok(CAR_MAKES.length>=600,'web makes');
assert.ok(Object.keys(native.models).length>=380,'model coverage');
assert.ok(Object.values(native.models).reduce((sum,a)=>sum+a.length,0)>=6600,'model count');
for(const make of ['Audi','Volkswagen','Toyota','Škoda','BMW','Mercedes-Benz']){
 assert.ok(native.models[make]?.length>=10,'native suggestions '+make);
 assert.ok(web[make]?.length>=10,'web suggestions '+make);
}
assert.ok(modelSuggestions('Audi').includes('RS6'),'Audi RS6 exists');
assert.ok(modelSuggestions('Audi').includes('RS e-tron GT'),'Audi RS e-tron GT exists');
assert.ok(modelSuggestions('BMW').includes('M5'),'BMW M5 exists');
assert.ok(modelSuggestions('Škoda').includes('Octavia'),'Škoda Octavia exists');
assert.equal(native.sources.version,'2026.11.12');
assert.match(readFileSync('app.js','utf8'),/name="modelExtension"/);
assert.match(readFileSync('firestore.rules','utf8'),/modelExtension/);
assert.match(readFileSync('android/app/src/main/java/ch/luma/auto/MainActivity.kt','utf8'),/modelExtension/);
console.log('PASS: offline car model catalogue, Android/web consistency and independent model-extension field');
