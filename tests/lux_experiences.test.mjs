import assert from 'node:assert/strict';
import {LUX,lux} from '../limba-lux.js';
import {createLimbaMarketplace} from '../limba-market-ui.js';
for (const lang of ['de','en','sq','tr','el','sr-Latn','sr-Cyrl','sl','hr','mk','bs','cnr','bg','ro']) {
 assert.ok(LUX[lang],lang);
 assert.equal(Object.keys(LUX[lang]).length,Object.keys(LUX.de).length);
 for(const k of Object.keys(LUX.de))assert.ok(LUX[lang][k]?.trim(),lang+' '+k);
 assert.ok(lux('vehiclePass',lang));
}
assert.equal(lux('borderless','de'),'borderless');

const savedSearch = {name:'Nissan', filters:{make:'Nissan',model:''}, countries:['BA','AL']};
const matchingAlert = {name:'Nissan', filters:{make:' Nissan '}, countries:['AL','BA']};
const deviceAlert = {name:'Alfa Romeo', filters:{make:'Alfa Romeo',model:''}, countries:['ME']};
const listeners = new Map();
const calls = [];
const state = {
 user:{uid:'buyer', emailVerified:true}, searches:[savedSearch], filters:{make:'', model:''},
 fb:{functions:{}, modules:{
  collection:(_db,...path)=>path.join('/'), query:path=>path, orderBy:()=>null, limit:()=>null,
  onSnapshot:(path,callback)=>{listeners.set(path,callback);return ()=>listeners.delete(path)},
  httpsCallable:(_instance,name)=>async data=>{calls.push({name,data});return {data:{enabled:data.enabled}}}
 }}
};
const marketplace=createLimbaMarketplace({el:()=>null,state,h:String,L:String,toast:()=>{},renderSavedSearches:()=>{}});
marketplace.connectAccount(state.user);
listeners.get('users/buyer/searchAlerts')({docs:[matchingAlert,deviceAlert].map(value=>({data:()=>value}))});
assert.deepEqual(marketplace.orphanedAlerts(),[deviceAlert]);
assert.match(marketplace.savedAlertButton(deviceAlert,0,true),/data-orphan-alert="0" aria-pressed="true"/);
await marketplace.toggleAlert(0,true);
assert.deepEqual(calls,[{name:'setSavedSearchAlert',data:{...deviceAlert,enabled:false}}]);
assert.deepEqual(marketplace.orphanedAlerts(),[]);
assert.equal(marketplace.hasAlert(savedSearch),true);
console.log('PASS Limba experiences: translations and saved search alerts');
