/**
 * Luma Auto's curated global passenger-car marque index.
 * Includes active, historical, electric, low-volume and regional badges.
 * This is a local suggestion list, not an assertion that every marque ever made exists here.
 * Users can enter a missing brand without waiting for a catalogue update.
 * No third-party API, logo assets, scraping or personal information is involved.
 */
const RAW_MAKES = `
A: Abarth|Abbott-Detroit|AC Cars|Acura|Adler|Aeolus|Aion|Aiways|Aixam|Alfa Romeo|Allard|Alpina|Alpine|Alvis|AMC|AM General|Anadol|Ankai|Apollo|Aptera|Arcfox|Ariel|Arash|Arrinera|Artega|Ascari|Aspark|Aston Martin|Auburn|Audi|Audi Sport|Austin|Austin-Healey|Aurus|Auto Union|Autobianchi|Automobili Pininfarina|Avatr|AvtoVAZ
B: BAC|BAIC|Baojun|Bentley|Berkeley|Bertone|Bitter|Bizzarrini|BMW|Borgward|Brabus|Brilliance|Bristol|Brooke|Buick|Bugatti|BYD|BMC|Bufori
C: Cadillac|Callaway|Canoo|Caterham|Changan|Changhe|Chery|Chevrolet|Chrysler|Cisitalia|Citroën|Cizeta|Continental|Corvette|Cupra|Czinger|CMC|Coda|Corre La Licorne
D: Dacia|Daewoo|Daihatsu|Daimler|Datsun|De Tomaso|Delage|DeLorean|Denza|Detroit Electric|DFSK|Dodge|Donkervoort|Dongfeng|DS Automobiles|Duesenberg|DOK-ING|DR Automobiles|Dutton
E: Eagle|Elfin|Elva|ELVO|Emgrand|Englon|Enovate|ERF|Eterniti|Excalibur|Exeed|Evolute|Everus|Eunos|Elio Motors
F: Facel Vega|Faraday Future|FAW|FAP|Ferrari|Fiat|Fisker|Ford|Force Motors|Forthing|Foton|Frazer|FSO|Fuldamobil|Fudi
G: GAC|GAZ|Geely|Genesis|Geo|Ginetta|GMC|Gordon Murray Automotive|Great Wall|GWM|Grecav|Gumpert|Gurgel|GAC Aion|Trumpchi
H: Hafei|Haima|Haval|Hennessey|Hindustan Motors|Hispano-Suiza|Holden|Honda|Hongqi|Horch|Hummer|Hyundai|Hyptec|Hupmobile|Hawtai|Humber
I: IAME|ICML|IKCO|IM Motors|Ineos|Infiniti|Innocenti|Innoson|Invicta|Isdera|Iso|Isuzu|Italdesign|IVECO|IKCO Samand|Intermeccanica
J: JAC|Jaguar|Jeep|Jetta|Jinbei|JMC|Jonway|Jowett|JMEV|Jetour|Jiyue|Jaecoo
K: Karma|Karsan|KGM|Kia|Koenigsegg|Korres|KTM|Kaiyi|Kandi|Karmann|Keating|Kenguru|King Long|Knight|Keraboss
L: Lada|Lagonda|Lamborghini|Lancia|Land Rover|Landwind|Leapmotor|LEVC|Lexus|Li Auto|Lifan|Lincoln|Lister|Lloyd|Lobini|Lotus|Lucid|Luxgen|Lynk & Co|Lunaz|LTI
M: Mahindra|MAN|Marcos|Maruti Suzuki|Maserati|Matra|Maybach|Mazda|McLaren|Mega|Mercedes-Benz|Mercury|MG|Microcar|Mini|Mitsubishi|Mitsuoka|Morgan|Morris|Moskvitch|Moskvich|Mullen|Mahindra Electric|Maxus|Mazzanti|Mastretta|MELKUS|Merkur|Monteverdi|MVM
N: NAMCO|Nash|Neta|NEVS|NIO|Nissan|Noble|NSU|Nysa|Naza|Nextev|Nikola|Nobe|Nanjing
O: Omoda|Oldsmobile|Opel|Ora|Osca|Otokar|Overland|Oltcit|OSCA|Oullim|Oshan
P: Packard|Pagani|Panther|Panoz|Perodua|Peugeot|Pininfarina|Plymouth|Polestar|Pontiac|Porsche|Praga|Premier|Proton|Puch|Puritalia|Pyeonghwa|PGO|Piaggio|Puma|Polski Fiat
Q: Qiantu|Qoros|Quantum|Qvale
R: RAM|Rambler|Reliant|Renault|Rimac|Rinspeed|Rivian|Roewe|Rolls-Royce|Rover|Ruf|Radical|Ranz|Ravon|REVA|Riley|Rinspeed|Rezvani|Rongcheng
S: Saab|Saipa|Saleen|Saturn|Scion|SEAT|Seres|Shelby|Škoda|Skywell|Smart|Soueast|SsangYong|Subaru|Suzuki|SWM|SAIC|Santana|Sbarro|Simca|Singer|Sisu|Sokon|Spyker|Studebaker|Sunbeam|Saba|Steyr|Scuderia Cameron Glickenhaus|SRT|SAIC Maxus|Speranza|Suda
T: Talbot|Tata|Tatra|Tesla|Think|Togg|Tofaş|Toyota|Trabant|Triumph|Troller|TVR|Tushek|Tank|TECHART|TEMSA|Thai Rung|Traum|Trion|Trident|Tucker|Tazzari
U: UAZ|Ultima|Uniti|Unimog|UMM|UQM|UD Trucks|Ural|Uro|Unicar
V: Vauxhall|Vector|Venturi|VinFast|Volkswagen|Volvo|Voyah|Vencer|VLF|VPG|Vortex|Vanden Plas|Veritas|Vega
W: Wanderer|Wartburg|Weltmeister|Wey|Wiesmann|Willys|Wolseley|Wuling|W Motors|WM Motor|Westfield|Willys-Overland|Wuling Motors
X: Xiaomi|XPeng|Xinkai|Xiali|XEV|Xcite
Y: Yema|Yugo|Yulon|Yutong|Yusheng|Yenko|Youngman
Z: Zastava|ZAZ|Zedriv|Zeekr|Zenvo|Zenos|Zhonghua|Zinoro|Zotye|Zündapp|Zastava Automobili
`;

const allNames=RAW_MAKES.trim().split('\n').flatMap(row => row.slice(row.indexOf(':')+1).trim().split('|'));
// Alphabetize by display name, preserving accents and each marque's recognizable spelling.
export const CAR_MAKES = Object.freeze([...new Set(allNames)].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})));
export const CAR_MODELS = Object.freeze({
  'Abarth':['500','595','695','Punto','124 Spider'],
  'Acura':['Integra','MDX','NSX','RDX','TLX'],
  'Alfa Romeo':['Giulia','Giulietta','Stelvio','Tonale','159','147','Brera','MiTo','Junior'],
  'Alpine':['A110','A290','A390'],
  'Aston Martin':['DB9','DB11','DB12','DBS','Vantage','Vanquish','DBX'],
  'Audi':['A1','A3','A4','A5','A6','A7','A8','Q2','Q3','Q4 e-tron','Q5','Q6 e-tron','Q7','Q8','TT','R8','e-tron GT'],
  'Bentley':['Bentayga','Continental GT','Flying Spur','Mulsanne'],
  'BMW':['1er','2er','3er','4er','5er','6er','7er','8er','X1','X2','X3','X4','X5','X6','X7','i3','i4','i5','i7','iX','M2','M3','M4','M5','Z4'],
  'BYD':['Atto 3','Dolphin','Seal','Seal U','Han','Tang','Song','Yuan','Shark'],
  'Cadillac':['Escalade','CT4','CT5','XT4','XT5','Lyriq'],
  'Chevrolet':['Camaro','Corvette','Cruze','Malibu','Spark','Tahoe','Suburban','Silverado','Equinox','Trax'],
  'Citroën':['C1','C2','C3','C4','C5','C5 Aircross','Berlingo','C3 Aircross','DS3','C-Elysée'],
  'Cupra':['Ateca','Born','Formentor','Leon','Tavascan','Terramar'],
  'Dacia':['Duster','Sandero','Jogger','Logan','Spring','Bigster'],
  'Daewoo':['Matiz','Lanos','Nubira','Espero','Lacetti'],
  'Daihatsu':['Sirion','Terios','Cuore','Copen','Rocky'],
  'Dodge':['Challenger','Charger','Durango','Ram','Journey'],
  'DS Automobiles':['DS 3','DS 4','DS 7','DS 9'],
  'Ferrari':['458','488','812','F8','Roma','Portofino','296','SF90','Purosangue','12Cilindri'],
  'Fiat':['500','500X','500e','Panda','Grande Panda','Tipo','Punto','Bravo','Doblo','Freemont','600'],
  'Ford':['Fiesta','Focus','Mondeo','Kuga','Puma','Mustang','Explorer','Edge','Ranger','Transit','S-MAX','Galaxy','Bronco','Capri'],
  'Genesis':['G70','G80','G90','GV60','GV70','GV80'],
  'Honda':['Jazz','Civic','Accord','CR-V','HR-V','ZR-V','e','NSX','Prelude'],
  'Hyundai':['i10','i20','i30','Bayon','Tucson','Kona','Santa Fe','Ioniq 5','Ioniq 6','Ioniq 9','Nexo'],
  'Infiniti':['Q30','Q50','Q60','QX30','QX50','QX60','QX80'],
  'Jaguar':['XE','XF','XJ','F-Pace','E-Pace','I-Pace','F-Type'],
  'Jeep':['Avenger','Renegade','Compass','Cherokee','Grand Cherokee','Wrangler','Gladiator'],
  'Kia':['Picanto','Rio','Ceed','ProCeed','XCeed','Stonic','Niro','Sportage','Sorento','EV3','EV4','EV5','EV6','EV9','Carnival'],
  'Lada':['Niva','Granta','Vesta','Kalina','Largus','Samara','2107','Priora'],
  'Lamborghini':['Aventador','Huracán','Revuelto','Urus','Gallardo','Murciélago','Temerario'],
  'Land Rover':['Defender','Discovery','Discovery Sport','Range Rover','Range Rover Sport','Range Rover Evoque','Range Rover Velar','Freelander'],
  'Lexus':['CT','ES','IS','LS','NX','RX','UX','LX','RC','LC','RZ','LBX'],
  'Lucid':['Air','Gravity'],
  'Maserati':['Ghibli','GranTurismo','GranCabrio','Levante','Grecale','Quattroporte','MC20'],
  'Mazda':['2','3','5','6','CX-3','CX-30','CX-5','CX-60','CX-80','MX-5','MX-30','RX-7','RX-8'],
  'McLaren':['540C','570S','600LT','720S','750S','765LT','Artura','GT','P1','Senna'],
  'Mercedes-Benz':['A-Klasse','B-Klasse','C-Klasse','E-Klasse','S-Klasse','CLA','CLS','GLA','GLB','GLC','GLE','GLS','G-Klasse','EQA','EQB','EQC','EQE','EQS','AMG GT','SL','V-Klasse','Sprinter'],
  'MG':['3','4','5','ZS','HS','Marvel R','Cyberster'],
  'Mini':['Cooper','Countryman','Clubman','Paceman','Aceman','Cabrio'],
  'Mitsubishi':['ASX','Colt','Eclipse Cross','Outlander','Lancer','Pajero','Space Star','L200'],
  'NIO':['ET5','ET7','EL6','EL7','EL8'],
  'Nissan':['GT-R','370Z','350Z','Z','Qashqai','Juke','X-Trail','Micra','Note','Leaf','Ariya','Navara','Patrol','Skyline','Primera'],
  'Opel':['Astra','Corsa','Insignia','Mokka','Grandland','Crossland','Adam','Zafira','Meriva','Vectra'],
  'Peugeot':['106','107','108','206','207','208','2008','307','308','3008','407','408','5008','508','Rifter','Partner'],
  'Polestar':['1','2','3','4','5'],
  'Porsche':['911','718 Boxster','718 Cayman','Cayenne','Macan','Panamera','Taycan','Boxster','Cayman','944','928'],
  'Renault':['Clio','Megane','Captur','Scenic','Arkana','Austral','Rafale','Espace','Twingo','Kangoo','Kadjar','Zoe','R5','Symbioz'],
  'Rimac':['Nevera','Concept_One'],
  'Rolls-Royce':['Ghost','Phantom','Cullinan','Spectre','Wraith','Dawn'],
  'Saab':['9-3','9-5','900','9000'],
  'SEAT':['Ibiza','Leon','Arona','Ateca','Tarraco','Alhambra','Toledo','Mii'],
  'Škoda':['Fabia','Octavia','Superb','Kodiaq','Karoq','Kamiq','Scala','Enyaq','Elroq','Rapid','Yeti'],
  'Smart':['fortwo','forfour','#1','#3','#5'],
  'Subaru':['Impreza','WRX','Legacy','Outback','Forester','XV','Crosstrek','BRZ','Solterra'],
  'Suzuki':['Swift','Vitara','S-Cross','Jimny','Ignis','Baleno','Across','Alto','SX4'],
  'Tesla':['Model S','Model 3','Model X','Model Y','Cybertruck','Roadster'],
  'Togg':['T10X','T10F'],
  'Toyota':['Yaris','Yaris Cross','Corolla','C-HR','RAV4','Camry','Aygo X','Prius','Land Cruiser','Hilux','Supra','bZ4X','Auris','Avensis','Proace'],
  'Volkswagen':['Polo','Golf','Passat','Tiguan','Touareg','T-Roc','T-Cross','Touran','Arteon','ID.3','ID.4','ID.5','ID.7','Up!','Caddy','Multivan'],
  'Volvo':['XC40','XC60','XC90','S60','S90','V40','V60','V90','EX30','EX40','EX90','EC40'],
  'XPeng':['G6','G9','P7','P7+','X9'],
  'Zeekr':['001','007','7X','009','X'],
  'Zastava':['10','101','128','750','Florida','Skala'],
  'Yugo':['45','55','65','Koral']
});

/** Match make variants and accentless search without changing original display names. */
export const normalizeMake = value => String(value ?? '').trim().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[\s._’'\-]+/g,' ').toLocaleLowerCase('en');
const alias = new Map([
  ['skoda','Škoda'],['citroen','Citroën'],['tofas','Tofaş'],
  ['mercedes','Mercedes-Benz'],['mercedes benz','Mercedes-Benz'],
  ['vw','Volkswagen'],['mini cooper','Mini'],['landrover','Land Rover'],
  ['gtr','Nissan'],['ssangyong','SsangYong'],['ssang yong','SsangYong']
]);
const canonical = new Map(CAR_MAKES.map(make=>[normalizeMake(make),make]));
export function resolveCarMake(value){const raw=String(value??'').trim().replace(/\s+/g,' ');return alias.get(normalizeMake(raw))||canonical.get(normalizeMake(raw))||raw}
export function validCarMake(value){const name=resolveCarMake(value);return name.length>=2&&name.length<=35&&/^[\p{L}\p{N}][\p{L}\p{N}\s.&+/'’()\-]{1,34}$/u.test(name)}
export function modelSuggestions(brand,listings=[]){const resolved=resolveCarMake(brand);const known=CAR_MODELS[resolved]||[];const live=listings.filter(x=>normalizeMake(x.make)===normalizeMake(resolved)).map(x=>x.model).filter(Boolean);return [...new Set([...known,...live])].sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'}))}