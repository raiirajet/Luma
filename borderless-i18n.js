const borderlessKeys = [
  'officialMode', 'manualMode', 'officialVerifiedOn', 'officialVatRate', 'officialVatSource',
  'officialCustomsSource', 'officialExtraSource', 'officialVatApplies', 'officialVatBasis',
  'officialVehicleTax', 'officialVehicleTaxBasis', 'officialVehicleTaxSource', 'officialOtherCharges',
  'officialEuCirculation', 'officialUnknown', 'officialYes', 'officialNo', 'officialSubtotal',
  'officialUnavailable', 'officialBasisHelp', 'officialNeedsInput', 'officialInvalid',
  'officialStandardScope', 'officialCustomsAmount', 'officialLocation', 'officialModeLabel',
  'officialCurrencyHelp', 'officialCustomsRate', 'officialCustomsBasis', 'officialUseCustomsRate',
  'officialFxSource', 'officialVatAmount'
];

const borderlessRows = {
  de: [
    'Amtliche Sätze', 'Manuell', 'Datenstand', 'Regulärer MWST-Satz', 'Amtliche MWST-Quelle',
    'Amtliche Zollquelle', 'Sonderabgaben und Importbedingungen', 'Fällt im Zielland MWST an?', 'MWST-Bemessungsgrundlage',
    'Automobilsteuer', 'Bemessungsgrundlage der Automobilsteuer', 'Amtliche Quelle zur Automobilsteuer', 'Weitere Abgaben',
    'Der Wagen ist im freien Verkehr der EU und wird innerhalb der EU verbracht.', 'Unklar', 'Ja', 'Nein', 'Zwischensumme',
    'Amtliche Daten gerade nicht verfügbar.', 'Übernimm die bestätigten Bemessungsgrundlagen. In der MWST-Grundlage können Zoll, Abgaben und Transport enthalten sein.',
    'Angabe nötig', 'Prüfe die eingegebenen Beträge.', 'Amtliche Standardsätze für reguläre Pkw-Fälle. Prüfe bei der Behörde, welche Sätze und Einfuhrbedingungen auf dein Fahrzeug zutreffen.',
    'Zollbetrag', 'Standort im Inserat', 'Berechnungsmodus', 'Alle Beträge in EUR eingeben. Für Fremdwährungen den amtlichen Kurs prüfen.',
    'Regelzollsatz', 'Zollwert', 'Der amtliche Regelzollsatz gilt für dieses Fahrzeug.', 'Amtliche Devisenkurse', 'Einfuhr-MWST'
  ],
  en: [
    'Official rates', 'Manual', 'Data checked on', 'Standard VAT rate', 'Official VAT source',
    'Official customs source', 'Additional taxes and import conditions', 'Does VAT apply in the destination country?', 'VAT taxable amount',
    'Vehicle tax', 'Vehicle tax basis', 'Official vehicle tax source', 'Other charges',
    'The car is in EU free circulation and is moving within the EU.', 'Unknown', 'Yes', 'No', 'Subtotal',
    'Official data is currently unavailable.', 'Use the confirmed taxable amounts. The VAT basis may include duties, taxes and transport.',
    'Input needed', 'Check the entered amounts.', 'Official standard passenger-car rates. Check with the authority which rates and import conditions apply to your vehicle.',
    'Customs duty amount', 'Location in listing', 'Calculation mode', 'Enter all amounts in EUR. Check the official rate for foreign currencies.',
    'Standard customs duty rate', 'Customs value', 'The official standard duty rate applies to this car.', 'Official exchange rates', 'Destination VAT amount'
  ],
  sq: [
    'Normat zyrtare', 'Me dorë', 'Të dhënat kontrolluar më', 'Norma standarde e TVSH-së', 'Burimi zyrtar i TVSH-së',
    'Burimi zyrtar doganor', 'Taksa shtesë dhe kushtet e importit', 'A zbatohet TVSH-ja në vendin e destinacionit?', 'Baza e tatueshme e TVSH-së',
    'Tatimi për automjetin', 'Baza e tatimit për automjetin', 'Burimi zyrtar i tatimit për automjetin', 'Detyrime të tjera',
    'Makina është në qarkullim të lirë në BE dhe transportohet brenda BE-së.', 'E paqartë', 'Po', 'Jo', 'Nëntotali',
    'Të dhënat zyrtare për momentin nuk janë të disponueshme.', 'Përdor bazat e konfirmuara. Baza e TVSH-së mund të përfshijë doganën, taksat dhe transportin.',
    'Kërkohet e dhëna', 'Kontrollo shumat e futura.', 'Norma standarde zyrtare për vetura. Kontrollo te autoriteti normat dhe kushtet e importit për makinën tënde.',
    'Shuma e doganës', 'Vendndodhja në shpallje', 'Mënyra e llogaritjes', 'Shëno të gjitha shumat në EUR. Për valutë të huaj kontrollo kursin zyrtar.',
    'Norma standarde doganore', 'Vlera doganore', 'Norma standarde zyrtare doganore për këtë veturë.', 'Kurset zyrtare të këmbimit', 'Shuma e TVSH-së'
  ],
  tr: [
    'Resmî oranlar', 'Elle giriş', 'Veri kontrol tarihi', 'Standart KDV oranı', 'Resmî KDV kaynağı',
    'Resmî gümrük kaynağı', 'Ek vergiler ve ithalat şartları', 'Varış ülkesinde KDV uygulanıyor mu?', 'KDV matrahı',
    'Otomobil vergisi', 'Otomobil vergisi matrahı', 'Resmî otomobil vergisi kaynağı', 'Diğer ücretler',
    'Araç AB’de serbest dolaşımda ve AB içinde taşınıyor.', 'Belirsiz', 'Evet', 'Hayır', 'Ara toplam',
    'Resmî veriler şu anda kullanılamıyor.', 'Onaylanmış matrahları kullanın. KDV matrahı gümrük vergisi, vergiler ve taşımayı içerebilir.',
    'Bilgi gerekli', 'Girilen tutarları kontrol edin.', 'Binek araçlar için resmî standart oranlar. Aracınıza uygulanan oran ve ithalat şartlarını yetkili kurumdan kontrol edin.',
    'Gümrük vergisi tutarı', 'İlandaki konum', 'Hesaplama modu', 'Tüm tutarları EUR olarak girin. Yabancı para için resmî kuru kontrol edin.',
    'Standart gümrük vergisi oranı', 'Gümrük kıymeti', 'Bu araç için resmî standart gümrük vergisi oranı geçerli.', 'Resmî döviz kurları', 'Varış ülkesindeki KDV tutarı'
  ],
  el: [
    'Επίσημοι συντελεστές', 'Χειροκίνητα', 'Ημερομηνία ελέγχου δεδομένων', 'Κανονικός συντελεστής ΦΠΑ', 'Επίσημη πηγή ΦΠΑ',
    'Επίσημη τελωνειακή πηγή', 'Πρόσθετοι φόροι και όροι εισαγωγής', 'Οφείλεται ΦΠΑ στη χώρα προορισμού;', 'Φορολογητέα αξία ΦΠΑ',
    'Φόρος αυτοκινήτου', 'Βάση φόρου αυτοκινήτου', 'Επίσημη πηγή φόρου αυτοκινήτου', 'Λοιπές επιβαρύνσεις',
    'Το όχημα είναι σε ελεύθερη κυκλοφορία στην ΕΕ και μεταφέρεται εντός ΕΕ.', 'Άγνωστο', 'Ναι', 'Όχι', 'Μερικό σύνολο',
    'Τα επίσημα στοιχεία είναι προσωρινά μη διαθέσιμα.', 'Χρησιμοποιήστε τις επιβεβαιωμένες φορολογητέες αξίες. Η βάση ΦΠΑ μπορεί να περιλαμβάνει δασμούς, φόρους και μεταφορά.',
    'Απαιτείται στοιχείο', 'Ελέγξτε τα ποσά που εισαγάγατε.', 'Επίσημοι κανονικοί συντελεστές για επιβατικά. Ελέγξτε στην αρχή τους συντελεστές και τους όρους εισαγωγής για το όχημά σας.',
    'Ποσό δασμού', 'Τοποθεσία στην αγγελία', 'Τρόπος υπολογισμού', 'Εισαγάγετε όλα τα ποσά σε EUR. Ελέγξτε την επίσημη ισοτιμία για ξένο νόμισμα.',
    'Κανονικός συντελεστής δασμού', 'Δασμολογητέα αξία', 'Ο επίσημος κανονικός συντελεστής δασμού ισχύει για το όχημα.', 'Επίσημες ισοτιμίες', 'Ποσό ΦΠΑ στον προορισμό'
  ],
  'sr-Latn': [
    'Zvanične stope', 'Ručni unos', 'Datum provere podataka', 'Standardna stopa PDV-a', 'Zvanični izvor za PDV',
    'Zvanični carinski izvor', 'Dodatni porezi i uslovi uvoza', 'Da li se PDV plaća u zemlji odredišta?', 'Osnovica za PDV',
    'Porez na vozilo', 'Osnovica poreza na vozilo', 'Zvanični izvor za porez na vozilo', 'Ostale dažbine',
    'Vozilo je u slobodnom prometu u EU i prevozi se unutar EU.', 'Nepoznato', 'Da', 'Ne', 'Međuzbir',
    'Zvanični podaci trenutno nisu dostupni.', 'Koristite potvrđene osnovice. Osnovica za PDV može obuhvatiti carinu, dažbine i prevoz.',
    'Potreban unos', 'Proverite unete iznose.', 'Zvanične standardne stope za putnička vozila. Kod nadležnog organa proverite stope i uslove uvoza za svoje vozilo.',
    'Iznos carine', 'Lokacija u oglasu', 'Način obračuna', 'Unesite sve iznose u EUR. Za stranu valutu proverite zvanični kurs.',
    'Standardna carinska stopa', 'Carinska vrednost', 'Za ovo vozilo važi zvanična standardna carinska stopa.', 'Zvanični devizni kursevi', 'Iznos PDV-a u odredištu'
  ],
  'sr-Cyrl': [
    'Званичне стопе', 'Ручни унос', 'Датум провере података', 'Стандардна стопа ПДВ-а', 'Званични извор за ПДВ',
    'Званични царински извор', 'Додатни порези и услови увоза', 'Да ли се ПДВ плаћа у земљи одредишта?', 'Основица за ПДВ',
    'Порез на возило', 'Основица пореза на возило', 'Званични извор за порез на возило', 'Остале дажбине',
    'Возило је у слободном промету у ЕУ и превози се унутар ЕУ.', 'Непознато', 'Да', 'Не', 'Међузбир',
    'Званични подаци тренутно нису доступни.', 'Користите потврђене основице. Основица за ПДВ може обухватити царину, дажбине и превоз.',
    'Потребан унос', 'Проверите унете износе.', 'Званичне стандардне стопе за путничка возила. Код надлежног органа проверите стопе и услове увоза за своје возило.',
    'Износ царине', 'Локација у огласу', 'Начин обрачуна', 'Унесите све износе у EUR. За страну валуту проверите званични курс.',
    'Стандардна царинска стопа', 'Царинска вредност', 'За ово возило важи званична стандардна царинска стопа.', 'Званични девизни курсеви', 'Износ ПДВ-а у одредишту'
  ],
  sl: [
    'Uradne stopnje', 'Ročni vnos', 'Datum preverjanja podatkov', 'Standardna stopnja DDV', 'Uradni vir DDV',
    'Uradni carinski vir', 'Dodatni davki in pogoji uvoza', 'Ali se v ciljni državi obračuna DDV?', 'Osnova za DDV',
    'Davek na vozilo', 'Davčna osnova za vozilo', 'Uradni vir davka na vozilo', 'Druge dajatve',
    'Vozilo je v prostem prometu v EU in se prevaža znotraj EU.', 'Neznano', 'Da', 'Ne', 'Vmesni seštevek',
    'Uradni podatki trenutno niso na voljo.', 'Uporabite potrjene davčne osnove. Osnova za DDV lahko vključuje carino, dajatve in prevoz.',
    'Potreben vnos', 'Preverite vnesene zneske.', 'Uradne standardne stopnje za osebna vozila. Pri organu preverite stopnje in pogoje uvoza za svoje vozilo.',
    'Znesek carine', 'Lokacija v oglasu', 'Način izračuna', 'Vnesite vse zneske v EUR. Za tujo valuto preverite uradni tečaj.',
    'Standardna carinska stopnja', 'Carinska vrednost', 'Za to vozilo velja uradna standardna carinska stopnja.', 'Uradni devizni tečaji', 'Znesek DDV v ciljni državi'
  ],
  hr: [
    'Službene stope', 'Ručni unos', 'Datum provjere podataka', 'Standardna stopa PDV-a', 'Službeni izvor za PDV',
    'Službeni carinski izvor', 'Dodatni porezi i uvjeti uvoza', 'Plaća li se PDV u zemlji odredišta?', 'Osnovica za PDV',
    'Porez na vozilo', 'Osnovica poreza na vozilo', 'Službeni izvor za porez na vozilo', 'Ostala davanja',
    'Vozilo je u slobodnom prometu u EU-u i prevozi se unutar EU-a.', 'Nepoznato', 'Da', 'Ne', 'Međuzbroj',
    'Službeni podaci trenutačno nisu dostupni.', 'Upotrijebite potvrđene osnovice. Osnovica za PDV može obuhvatiti carinu, davanja i prijevoz.',
    'Potreban unos', 'Provjerite unesene iznose.', 'Službene standardne stope za osobna vozila. Kod nadležnog tijela provjerite stope i uvjete uvoza za svoje vozilo.',
    'Iznos carine', 'Lokacija u oglasu', 'Način izračuna', 'Unesite sve iznose u EUR. Za strane valute provjerite službeni tečaj.',
    'Standardna carinska stopa', 'Carinska vrijednost', 'Za ovo vozilo vrijedi službena standardna carinska stopa.', 'Službeni devizni tečajevi', 'Iznos PDV-a u odredištu'
  ],
  mk: [
    'Официјални стапки', 'Рачен внес', 'Датум на проверка на податоците', 'Стандардна стапка на ДДВ', 'Официјален извор за ДДВ',
    'Официјален царински извор', 'Дополнителни даноци и услови за увоз', 'Дали се плаќа ДДВ во земјата на дестинација?', 'Даночна основа за ДДВ',
    'Данок на возило', 'Основица за данок на возило', 'Официјален извор за данок на возило', 'Други давачки',
    'Возилото е во слободен промет во ЕУ и се пренесува во рамките на ЕУ.', 'Непознато', 'Да', 'Не', 'Меѓузбир',
    'Официјалните податоци моментално не се достапни.', 'Користете ги потврдените основици. Основицата за ДДВ може да вклучува царина, давачки и превоз.',
    'Потребен е внес', 'Проверете ги внесените износи.', 'Официјални стандардни стапки за патнички возила. Проверете ги стапките и условите за увоз кај надлежниот орган.',
    'Износ на царина', 'Локација во огласот', 'Начин на пресметка', 'Внесете ги сите суми во EUR. За странска валута проверете го официјалниот курс.',
    'Стандардна царинска стапка', 'Царинска вредност', 'За ова возило важи официјалната стандардна царинска стапка.', 'Официјални девизни курсеви', 'Износ на ДДВ во дестинацијата'
  ],
  bs: [
    'Službene stope', 'Ručni unos', 'Datum provjere podataka', 'Standardna stopa PDV-a', 'Službeni izvor za PDV',
    'Službeni carinski izvor', 'Dodatni porezi i uslovi uvoza', 'Plaća li se PDV u zemlji odredišta?', 'Osnovica za PDV',
    'Porez na vozilo', 'Osnovica poreza na vozilo', 'Službeni izvor za porez na vozilo', 'Ostala davanja',
    'Vozilo je u slobodnom prometu u EU i prevozi se unutar EU.', 'Nepoznato', 'Da', 'Ne', 'Međuzbir',
    'Službeni podaci trenutno nisu dostupni.', 'Koristite potvrđene osnovice. Osnovica za PDV može obuhvatiti carinu, davanja i prijevoz.',
    'Potreban unos', 'Provjerite unesene iznose.', 'Službene standardne stope za putnička vozila. Kod nadležnog organa provjerite stope i uslove uvoza za svoje vozilo.',
    'Iznos carine', 'Lokacija u oglasu', 'Način obračuna', 'Unesite sve iznose u EUR. Za stranu valutu provjerite službeni kurs.',
    'Standardna carinska stopa', 'Carinska vrijednost', 'Za ovo vozilo važi službena standardna carinska stopa.', 'Službeni devizni kursevi', 'Iznos PDV-a u odredištu'
  ],
  cnr: [
    'Zvanične stope', 'Ručni unos', 'Datum provjere podataka', 'Standardna stopa PDV-a', 'Zvanični izvor za PDV',
    'Zvanični carinski izvor', 'Dodatni porezi i uslovi uvoza', 'Plaća li se PDV u zemlji odredišta?', 'Osnovica za PDV',
    'Porez na vozilo', 'Osnovica poreza na vozilo', 'Zvanični izvor za porez na vozilo', 'Ostale dažbine',
    'Vozilo je u slobodnom prometu u EU i prevozi se unutar EU.', 'Nepoznato', 'Da', 'Ne', 'Međuzbir',
    'Zvanični podaci trenutno nisu dostupni.', 'Koristite potvrđene osnovice. Osnovica za PDV može obuhvatiti carinu, dažbine i prevoz.',
    'Potreban unos', 'Provjerite unijete iznose.', 'Zvanične standardne stope za putnička vozila. Kod nadležnog organa provjerite stope i uslove uvoza za svoje vozilo.',
    'Iznos carine', 'Lokacija u oglasu', 'Način obračuna', 'Unesite sve iznose u EUR. Za stranu valutu provjerite zvanični kurs.',
    'Standardna carinska stopa', 'Carinska vrijednost', 'Za ovo vozilo važi zvanična standardna carinska stopa.', 'Zvanični devizni kursevi', 'Iznos PDV-a u odredištu'
  ],
  bg: [
    'Официални ставки', 'Ръчно въвеждане', 'Дата на проверката', 'Стандартна ставка на ДДС', 'Официален източник за ДДС',
    'Официален митнически източник', 'Допълнителни данъци и условия за внос', 'Дължи ли се ДДС в държавата на местоназначение?', 'Данъчна основа за ДДС',
    'Данък върху автомобила', 'Данъчна основа за автомобила', 'Официален източник за данъка върху автомобила', 'Други такси',
    'Автомобилът е в свободно обращение в ЕС и се превозва в рамките на ЕС.', 'Неизвестно', 'Да', 'Не', 'Междинна сума',
    'В момента официалните данни не са налични.', 'Използвайте потвърдените данъчни основи. Основата за ДДС може да включва мита, такси и транспорт.',
    'Необходима е стойност', 'Проверете въведените суми.', 'Официални стандартни ставки за леки автомобили. Проверете при компетентния орган приложимите ставки и условия за внос.',
    'Размер на митото', 'Местоположение в обявата', 'Начин на изчисление', 'Въведете всички суми в EUR. За чуждестранна валута проверете официалния курс.',
    'Стандартна митническа ставка', 'Митническа стойност', 'За този автомобил важи официалната стандартна митническа ставка.', 'Официални валутни курсове', 'Размер на ДДС в местоназначението'
  ],
  ro: [
    'Cote oficiale', 'Manual', 'Data verificării datelor', 'Cotă standard de TVA', 'Sursa oficială pentru TVA',
    'Sursa vamală oficială', 'Taxe suplimentare și condiții de import', 'Se datorează TVA în țara de destinație?', 'Baza de impozitare a TVA',
    'Taxă auto', 'Baza de calcul a taxei auto', 'Sursa oficială pentru taxa auto', 'Alte taxe',
    'Mașina se află în liberă circulație în UE și este transportată în interiorul UE.', 'Necunoscut', 'Da', 'Nu', 'Subtotal',
    'Datele oficiale nu sunt disponibile momentan.', 'Folosește bazele de impozitare confirmate. Baza TVA poate include taxele vamale, alte taxe și transportul.',
    'Valoare necesară', 'Verifică sumele introduse.', 'Cote oficiale standard pentru autoturisme. Verifică la autoritate cotele și condițiile de import pentru mașina ta.',
    'Valoarea taxei vamale', 'Locația din anunț', 'Mod de calcul', 'Introdu toate sumele în EUR. Pentru valută verifică cursul oficial.',
    'Cotă vamală standard', 'Valoare în vamă', 'Pentru acest autoturism se aplică cota vamală standard oficială.', 'Cursuri de schimb oficiale', 'Valoarea TVA în țara de destinație'
  ]
};

export const BORDERLESS_TRANSLATIONS = Object.fromEntries(
  Object.entries(borderlessRows).map(([locale, values]) => [
    locale, Object.fromEntries(borderlessKeys.map((key, index) => [key, values[index]]))
  ])
);
