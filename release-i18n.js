import {BORDERLESS_TRANSLATIONS} from './borderless-i18n.js';

const keys = [
  'messages', 'notifications', 'sellerMessage', 'chatEmpty', 'chatMessage', 'chatSend',
  'chatBack', 'chatAvailableQuestion', 'chatTestDriveQuestion', 'chatBlock', 'chatUnblock',
  'chatBlocked', 'chatReport', 'chatReportReason', 'chatReported', 'featureUnavailable', 'loading',
  'priceHistory', 'priceHistoryEmpty', 'pricePrevious', 'searchAlertOn', 'searchAlertOff',
  'searchAlertEnable', 'searchAlertDisable', 'notificationsEmpty', 'notificationRead', 'listingUnavailable',
  'photoDetails', 'photoGuide', 'photoNumber', 'photoNote', 'photoExterior', 'photoInterior',
  'photoOdometer', 'photoDamage', 'photoOther', 'batteryReport', 'batteryHealth', 'batteryMeasuredAt',
  'batteryIssuer', 'batteryUrl', 'batteryOpen', 'batteryInvalid', 'compareImport', 'activeFilters',
  'removeFilter', 'allCountries', 'filterCountry', 'prevPhoto', 'nextPhoto'
];

const translations = {
  de: [
    'Nachrichten', 'Benachrichtigungen', 'Verkäufer anschreiben', 'Noch keine Nachrichten', 'Nachricht', 'Senden',
    'Zurück zu Nachrichten', 'Ist das Auto noch verfügbar?', 'Ist eine Probefahrt möglich?', 'Blockieren', 'Blockierung aufheben',
    'Dieser Chat ist blockiert.', 'Chat melden', 'Grund der Meldung', 'Meldung erfasst', 'Gerade nicht verfügbar', 'Wird geladen …',
    'Preisverlauf', 'Noch keine erfassten Preisänderungen', 'Vorheriger Preis', 'Suchalarm aktiv', 'Suchalarm aus',
    'Suchalarm aktivieren', 'Suchalarm deaktivieren', 'Noch keine neuen Treffer', 'Als gelesen markieren', 'Inserat nicht verfügbar',
    'Zustandsfotos', 'Zeige Außenansicht, Innenraum, Tacho und sichtbare Mängel.', 'Foto', 'Notiz zum Foto',
    'Außenansicht', 'Innenraum', 'Kilometerstand', 'Mangel', 'Sonstiges', 'Batteriebericht', 'Batteriezustand (%)', 'Messdatum',
    'Prüfstelle', 'Link zum Bericht', 'Bericht öffnen', 'Prüfe Batteriezustand, Datum, Prüfstelle und Link.',
    'Importkosten vergleichen', 'Aktive Filter', 'Filter entfernen', 'Alle Länder', 'Land',
    'Vorheriges Foto', 'Nächstes Foto'
  ],
  en: [
    'Messages', 'Notifications', 'Message seller', 'No messages yet', 'Message', 'Send',
    'Back to messages', 'Is the car still available?', 'Can I arrange a test drive?', 'Block', 'Unblock',
    'This chat is blocked.', 'Report chat', 'Reason for report', 'Report received', 'Currently unavailable', 'Loading…',
    'Price history', 'No recorded price changes yet', 'Previous price', 'Search alert on', 'Search alert off',
    'Enable search alert', 'Disable search alert', 'No new matches yet', 'Mark as read', 'Listing unavailable',
    'Condition photos', 'Show the exterior, interior, odometer and visible defects.', 'Photo', 'Photo note',
    'Exterior', 'Interior', 'Odometer', 'Defect', 'Other', 'Battery report', 'Battery health (%)', 'Test date',
    'Test provider', 'Report link', 'Open report', 'Check the battery health, date, test provider and link.',
    'Compare import costs', 'Active filters', 'Remove filter', 'All countries', 'Country',
    'Previous photo', 'Next photo'
  ],
  sq: [
    'Mesazhet', 'Njoftimet', 'Shkruaji shitësit', 'Nuk ka ende mesazhe', 'Mesazhi', 'Dërgo',
    'Kthehu te mesazhet', 'A është ende në dispozicion makina?', 'A mund ta provoj makinën?', 'Blloko', 'Zhblloko',
    'Kjo bisedë është bllokuar.', 'Raporto bisedën', 'Arsyeja e raportimit', 'Raportimi u pranua', 'Për momentin e padisponueshme', 'Duke u ngarkuar…',
    'Historiku i çmimit', 'Nuk ka ende ndryshime të regjistruara të çmimit', 'Çmimi i mëparshëm', 'Njoftimet e kërkimit aktive', 'Njoftimet e kërkimit joaktive',
    'Aktivizo njoftimet e kërkimit', 'Çaktivizo njoftimet e kërkimit', 'Nuk ka ende rezultate të reja', 'Shëno si të lexuar', 'Shpallja nuk është e disponueshme',
    'Fotot e gjendjes', 'Trego pjesën e jashtme, brendësinë, kilometrat dhe defektet e dukshme.', 'Foto', 'Shënim për foton',
    'Pjesa e jashtme', 'Brendësia', 'Kilometrazhi', 'Defekt', 'Tjetër', 'Raporti i baterisë', 'Gjendja e baterisë (%)', 'Data e testit',
    'Qendra e testimit', 'Lidhja e raportit', 'Hap raportin', 'Kontrollo gjendjen e baterisë, datën, qendrën dhe lidhjen.',
    'Krahaso kostot e importit', 'Filtrat aktivë', 'Hiq filtrin', 'Të gjitha vendet', 'Vendi',
    'Fotoja e mëparshme', 'Fotoja tjetër'
  ],
  tr: [
    'Mesajlar', 'Bildirimler', 'Satıcıya yaz', 'Henüz mesaj yok', 'Mesaj', 'Gönder',
    'Mesajlara dön', 'Araç hâlâ satılık mı?', 'Test sürüşü yapabilir miyim?', 'Engelle', 'Engeli kaldır',
    'Bu sohbet engellendi.', 'Sohbeti bildir', 'Bildirim nedeni', 'Bildirim alındı', 'Şu anda kullanılamıyor', 'Yükleniyor…',
    'Fiyat geçmişi', 'Henüz kayıtlı fiyat değişikliği yok', 'Önceki fiyat', 'Arama bildirimi açık', 'Arama bildirimi kapalı',
    'Arama bildirimini aç', 'Arama bildirimini kapat', 'Henüz yeni eşleşme yok', 'Okundu olarak işaretle', 'İlan kullanılamıyor',
    'Araç durumu fotoğrafları', 'Dış görünümü, iç mekânı, kilometre sayacını ve görünür kusurları gösterin.', 'Fotoğraf', 'Fotoğraf notu',
    'Dış görünüm', 'İç mekân', 'Kilometre sayacı', 'Kusur', 'Diğer', 'Batarya raporu', 'Batarya sağlığı (%)', 'Test tarihi',
    'Test kuruluşu', 'Rapor bağlantısı', 'Raporu aç', 'Batarya sağlığını, tarihi, test kuruluşunu ve bağlantıyı kontrol edin.',
    'İthalat masraflarını karşılaştır', 'Etkin filtreler', 'Filtreyi kaldır', 'Tüm ülkeler', 'Ülke',
    'Önceki fotoğraf', 'Sonraki fotoğraf'
  ],
  el: [
    'Μηνύματα', 'Ειδοποιήσεις', 'Μήνυμα στον πωλητή', 'Δεν υπάρχουν ακόμη μηνύματα', 'Μήνυμα', 'Αποστολή',
    'Πίσω στα μηνύματα', 'Είναι ακόμη διαθέσιμο το αυτοκίνητο;', 'Μπορώ να κάνω δοκιμαστική οδήγηση;', 'Αποκλεισμός', 'Άρση αποκλεισμού',
    'Η συνομιλία έχει αποκλειστεί.', 'Αναφορά συνομιλίας', 'Λόγος αναφοράς', 'Η αναφορά καταχωρίστηκε', 'Προσωρινά μη διαθέσιμο', 'Φόρτωση…',
    'Ιστορικό τιμής', 'Δεν υπάρχουν ακόμη καταγεγραμμένες αλλαγές τιμής', 'Προηγούμενη τιμή', 'Ειδοποίηση αναζήτησης ενεργή', 'Ειδοποίηση αναζήτησης ανενεργή',
    'Ενεργοποίηση ειδοποίησης αναζήτησης', 'Απενεργοποίηση ειδοποίησης αναζήτησης', 'Δεν υπάρχουν ακόμη νέα αποτελέσματα', 'Σήμανση ως αναγνωσμένου', 'Η αγγελία δεν είναι διαθέσιμη',
    'Φωτογραφίες κατάστασης', 'Δείξτε το εξωτερικό, το εσωτερικό, το οδόμετρο και τις ορατές φθορές.', 'Φωτογραφία', 'Σημείωση φωτογραφίας',
    'Εξωτερικό', 'Εσωτερικό', 'Οδόμετρο', 'Φθορά', 'Άλλο', 'Έκθεση μπαταρίας', 'Υγεία μπαταρίας (%)', 'Ημερομηνία ελέγχου',
    'Φορέας ελέγχου', 'Σύνδεσμος έκθεσης', 'Άνοιγμα έκθεσης', 'Ελέγξτε την υγεία της μπαταρίας, την ημερομηνία, τον φορέα και τον σύνδεσμο.',
    'Σύγκριση κόστους εισαγωγής', 'Ενεργά φίλτρα', 'Κατάργηση φίλτρου', 'Όλες οι χώρες', 'Χώρα',
    'Προηγούμενη φωτογραφία', 'Επόμενη φωτογραφία'
  ],
  'sr-Latn': [
    'Poruke', 'Obaveštenja', 'Piši prodavcu', 'Još nema poruka', 'Poruka', 'Pošalji',
    'Nazad na poruke', 'Da li je automobil još dostupan?', 'Da li je moguća probna vožnja?', 'Blokiraj', 'Odblokiraj',
    'Ovaj razgovor je blokiran.', 'Prijavi razgovor', 'Razlog prijave', 'Prijava je primljena', 'Trenutno nedostupno', 'Učitavanje…',
    'Istorija cene', 'Još nema zabeleženih promena cene', 'Prethodna cena', 'Obaveštenja pretrage uključena', 'Obaveštenja pretrage isključena',
    'Uključi obaveštenja pretrage', 'Isključi obaveštenja pretrage', 'Još nema novih rezultata', 'Označi kao pročitano', 'Oglas nije dostupan',
    'Fotografije stanja', 'Prikažite spoljašnjost, unutrašnjost, kilometražu i vidljiva oštećenja.', 'Fotografija', 'Napomena uz fotografiju',
    'Spoljašnjost', 'Unutrašnjost', 'Kilometraža', 'Oštećenje', 'Ostalo', 'Izveštaj o bateriji', 'Stanje baterije (%)', 'Datum merenja',
    'Ispitni centar', 'Link do izveštaja', 'Otvori izveštaj', 'Proverite stanje baterije, datum, ispitni centar i link.',
    'Uporedi troškove uvoza', 'Aktivni filteri', 'Ukloni filter', 'Sve države', 'Država',
    'Prethodna fotografija', 'Sledeća fotografija'
  ],
  'sr-Cyrl': [
    'Поруке', 'Обавештења', 'Пиши продавцу', 'Још нема порука', 'Порука', 'Пошаљи',
    'Назад на поруке', 'Да ли је аутомобил још доступан?', 'Да ли је могућа пробна вожња?', 'Блокирај', 'Одблокирај',
    'Овај разговор је блокиран.', 'Пријави разговор', 'Разлог пријаве', 'Пријава је примљена', 'Тренутно недоступно', 'Учитавање…',
    'Историја цене', 'Још нема забележених промена цене', 'Претходна цена', 'Обавештења претраге укључена', 'Обавештења претраге искључена',
    'Укључи обавештења претраге', 'Искључи обавештења претраге', 'Још нема нових резултата', 'Означи као прочитано', 'Оглас није доступан',
    'Фотографије стања', 'Прикажите спољашњост, унутрашњост, километражу и видљива оштећења.', 'Фотографија', 'Напомена уз фотографију',
    'Спољашњост', 'Унутрашњост', 'Километража', 'Оштећење', 'Остало', 'Извештај о батерији', 'Стање батерије (%)', 'Датум мерења',
    'Испитни центар', 'Линк до извештаја', 'Отвори извештај', 'Проверите стање батерије, датум, испитни центар и линк.',
    'Упореди трошкове увоза', 'Активни филтери', 'Уклони филтер', 'Све државе', 'Држава',
    'Претходна фотографија', 'Следећа фотографија'
  ],
  sl: [
    'Sporočila', 'Obvestila', 'Piši prodajalcu', 'Ni še sporočil', 'Sporočilo', 'Pošlji',
    'Nazaj na sporočila', 'Ali je avto še na voljo?', 'Je možna testna vožnja?', 'Blokiraj', 'Odblokiraj',
    'Ta pogovor je blokiran.', 'Prijavi pogovor', 'Razlog prijave', 'Prijava je prejeta', 'Trenutno ni na voljo', 'Nalaganje…',
    'Zgodovina cen', 'Ni še zabeleženih sprememb cene', 'Prejšnja cena', 'Obvestila o iskanju vklopljena', 'Obvestila o iskanju izklopljena',
    'Vklopi obvestila o iskanju', 'Izklopi obvestila o iskanju', 'Ni še novih zadetkov', 'Označi kot prebrano', 'Oglas ni na voljo',
    'Fotografije stanja', 'Pokažite zunanjost, notranjost, števec kilometrov in vidne poškodbe.', 'Fotografija', 'Opomba k fotografiji',
    'Zunanjost', 'Notranjost', 'Števec kilometrov', 'Poškodba', 'Drugo', 'Poročilo o bateriji', 'Stanje baterije (%)', 'Datum meritve',
    'Izvajalec testa', 'Povezava do poročila', 'Odpri poročilo', 'Preverite stanje baterije, datum, izvajalca in povezavo.',
    'Primerjaj stroške uvoza', 'Aktivni filtri', 'Odstrani filter', 'Vse države', 'Država',
    'Prejšnja fotografija', 'Naslednja fotografija'
  ],
  hr: [
    'Poruke', 'Obavijesti', 'Piši prodavatelju', 'Još nema poruka', 'Poruka', 'Pošalji',
    'Natrag na poruke', 'Je li automobil još dostupan?', 'Je li moguća probna vožnja?', 'Blokiraj', 'Odblokiraj',
    'Ovaj je razgovor blokiran.', 'Prijavi razgovor', 'Razlog prijave', 'Prijava je zaprimljena', 'Trenutačno nedostupno', 'Učitavanje…',
    'Povijest cijene', 'Još nema zabilježenih promjena cijene', 'Prethodna cijena', 'Obavijesti pretrage uključene', 'Obavijesti pretrage isključene',
    'Uključi obavijesti pretrage', 'Isključi obavijesti pretrage', 'Još nema novih rezultata', 'Označi kao pročitano', 'Oglas nije dostupan',
    'Fotografije stanja', 'Prikažite vanjštinu, unutrašnjost, kilometražu i vidljiva oštećenja.', 'Fotografija', 'Napomena uz fotografiju',
    'Vanjština', 'Unutrašnjost', 'Kilometraža', 'Oštećenje', 'Ostalo', 'Izvješće o bateriji', 'Stanje baterije (%)', 'Datum mjerenja',
    'Ispitni centar', 'Poveznica na izvješće', 'Otvori izvješće', 'Provjerite stanje baterije, datum, ispitni centar i poveznicu.',
    'Usporedi troškove uvoza', 'Aktivni filtri', 'Ukloni filtar', 'Sve države', 'Država',
    'Prethodna fotografija', 'Sljedeća fotografija'
  ],
  mk: [
    'Пораки', 'Известувања', 'Пиши му на продавачот', 'Сè уште нема пораки', 'Порака', 'Испрати',
    'Назад на пораките', 'Дали автомобилот е сè уште достапен?', 'Дали е можно пробно возење?', 'Блокирај', 'Одблокирај',
    'Овој разговор е блокиран.', 'Пријави разговор', 'Причина за пријавата', 'Пријавата е примена', 'Моментално недостапно', 'Се вчитува…',
    'Историја на цената', 'Сè уште нема забележани промени на цената', 'Претходна цена', 'Известувањата за пребарување се вклучени', 'Известувањата за пребарување се исклучени',
    'Вклучи известувања за пребарување', 'Исклучи известувања за пребарување', 'Сè уште нема нови резултати', 'Означи како прочитано', 'Огласот не е достапен',
    'Фотографии на состојбата', 'Прикажете ги надворешноста, внатрешноста, километражата и видливите оштетувања.', 'Фотографија', 'Белешка за фотографијата',
    'Надворешност', 'Внатрешност', 'Километража', 'Оштетување', 'Друго', 'Извештај за батеријата', 'Состојба на батеријата (%)', 'Датум на мерење',
    'Центар за тестирање', 'Врска до извештајот', 'Отвори извештај', 'Проверете ги состојбата на батеријата, датумот, центарот и врската.',
    'Спореди трошоци за увоз', 'Активни филтри', 'Отстрани филтер', 'Сите земји', 'Земја',
    'Претходна фотографија', 'Следна фотографија'
  ],
  bs: [
    'Poruke', 'Obavijesti', 'Piši prodavaču', 'Još nema poruka', 'Poruka', 'Pošalji',
    'Nazad na poruke', 'Je li automobil još dostupan?', 'Je li moguća probna vožnja?', 'Blokiraj', 'Odblokiraj',
    'Ovaj razgovor je blokiran.', 'Prijavi razgovor', 'Razlog prijave', 'Prijava je primljena', 'Trenutno nedostupno', 'Učitavanje…',
    'Historija cijene', 'Još nema zabilježenih promjena cijene', 'Prethodna cijena', 'Obavijesti pretrage uključene', 'Obavijesti pretrage isključene',
    'Uključi obavijesti pretrage', 'Isključi obavijesti pretrage', 'Još nema novih rezultata', 'Označi kao pročitano', 'Oglas nije dostupan',
    'Fotografije stanja', 'Prikažite vanjštinu, unutrašnjost, kilometražu i vidljiva oštećenja.', 'Fotografija', 'Napomena uz fotografiju',
    'Vanjština', 'Unutrašnjost', 'Kilometraža', 'Oštećenje', 'Ostalo', 'Izvještaj o bateriji', 'Stanje baterije (%)', 'Datum mjerenja',
    'Ispitni centar', 'Link do izvještaja', 'Otvori izvještaj', 'Provjerite stanje baterije, datum, ispitni centar i link.',
    'Uporedi troškove uvoza', 'Aktivni filteri', 'Ukloni filter', 'Sve zemlje', 'Zemlja',
    'Prethodna fotografija', 'Sljedeća fotografija'
  ],
  cnr: [
    'Poruke', 'Obavještenja', 'Piši prodavcu', 'Još nema poruka', 'Poruka', 'Pošalji',
    'Nazad na poruke', 'Da li je automobil još dostupan?', 'Da li je moguća probna vožnja?', 'Blokiraj', 'Odblokiraj',
    'Ovaj razgovor je blokiran.', 'Prijavi razgovor', 'Razlog prijave', 'Prijava je primljena', 'Trenutno nedostupno', 'Učitavanje…',
    'Istorija cijene', 'Još nema zabilježenih promjena cijene', 'Prethodna cijena', 'Obavještenja pretrage uključena', 'Obavještenja pretrage isključena',
    'Uključi obavještenja pretrage', 'Isključi obavještenja pretrage', 'Još nema novih rezultata', 'Označi kao pročitano', 'Oglas nije dostupan',
    'Fotografije stanja', 'Prikažite spoljašnjost, unutrašnjost, kilometražu i vidljiva oštećenja.', 'Fotografija', 'Napomena uz fotografiju',
    'Spoljašnjost', 'Unutrašnjost', 'Kilometraža', 'Oštećenje', 'Ostalo', 'Izvještaj o bateriji', 'Stanje baterije (%)', 'Datum mjerenja',
    'Ispitni centar', 'Link do izvještaja', 'Otvori izvještaj', 'Provjerite stanje baterije, datum, ispitni centar i link.',
    'Uporedi troškove uvoza', 'Aktivni filteri', 'Ukloni filter', 'Sve države', 'Država',
    'Prethodna fotografija', 'Sljedeća fotografija'
  ],
  bg: [
    'Съобщения', 'Известия', 'Пиши на продавача', 'Все още няма съобщения', 'Съобщение', 'Изпрати',
    'Назад към съобщенията', 'Автомобилът все още ли е наличен?', 'Възможно ли е пробно шофиране?', 'Блокирай', 'Отблокирай',
    'Този разговор е блокиран.', 'Докладвай разговора', 'Причина за сигнала', 'Сигналът е получен', 'Временно недостъпно', 'Зареждане…',
    'История на цената', 'Все още няма записани промени в цената', 'Предишна цена', 'Известието за търсене е включено', 'Известието за търсене е изключено',
    'Включи известия за търсенето', 'Изключи известия за търсенето', 'Все още няма нови резултати', 'Маркирай като прочетено', 'Обявата е недостъпна',
    'Снимки на състоянието', 'Покажете външния вид, салона, километража и видимите повреди.', 'Снимка', 'Бележка към снимката',
    'Външен вид', 'Салон', 'Километраж', 'Повреда', 'Друго', 'Доклад за батерията', 'Състояние на батерията (%)', 'Дата на измерване',
    'Център за изпитване', 'Връзка към доклада', 'Отвори доклада', 'Проверете състоянието на батерията, датата, центъра и връзката.',
    'Сравни разходите за внос', 'Активни филтри', 'Премахни филтъра', 'Всички държави', 'Държава',
    'Предишна снимка', 'Следваща снимка'
  ],
  ro: [
    'Mesaje', 'Notificări', 'Scrie vânzătorului', 'Încă nu există mesaje', 'Mesaj', 'Trimite',
    'Înapoi la mesaje', 'Mașina mai este disponibilă?', 'Se poate face un test drive?', 'Blochează', 'Deblochează',
    'Această conversație este blocată.', 'Raportează conversația', 'Motivul raportării', 'Sesizarea a fost primită', 'Indisponibil momentan', 'Se încarcă…',
    'Istoricul prețului', 'Încă nu sunt înregistrate modificări de preț', 'Prețul anterior', 'Alertă de căutare activă', 'Alertă de căutare inactivă',
    'Activează alerta de căutare', 'Dezactivează alerta de căutare', 'Încă nu există rezultate noi', 'Marchează ca citit', 'Anunț indisponibil',
    'Fotografii cu starea mașinii', 'Arată exteriorul, interiorul, kilometrajul și defectele vizibile.', 'Fotografie', 'Notă pentru fotografie',
    'Exterior', 'Interior', 'Kilometraj', 'Defect', 'Altele', 'Raportul bateriei', 'Starea bateriei (%)', 'Data măsurării',
    'Centrul de testare', 'Link către raport', 'Deschide raportul', 'Verifică starea bateriei, data, centrul și linkul.',
    'Compară costurile de import', 'Filtre active', 'Elimină filtrul', 'Toate țările', 'Țară',
    'Fotografia anterioară', 'Fotografia următoare'
  ]
};

export const RELEASE_TRANSLATIONS = Object.fromEntries(
  Object.entries(translations).map(([locale, entries]) => [
    locale, { ...Object.fromEntries(keys.map((key, index) => [key, entries[index]])), ...BORDERLESS_TRANSLATIONS[locale] }
  ])
);

export const releaseText = (locale, key) =>
  RELEASE_TRANSLATIONS[locale]?.[key] ?? RELEASE_TRANSLATIONS.en[key];
