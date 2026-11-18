# Limba 1.5: Showroom / Vehicle Pass / Borderless / Performance / Garage

Showroom: responsive highlighted vehicles and direct detail/gallery access on both web and Android.
Vehicle pass: optional seller-provided service history (max 500 chars), modifications (500 chars), document description (240 chars). All entries are unverified statements. Limba does not validate service invoices, identity, VIN or tuning claims and does not store uploaded proof in this feature.
Borderless: manually configured cost estimator for destination, transport, customs %, tax/VAT %, and registration fees. Customs are calculated on asking price + transport; VAT is calculated on asking price + transport + customs. This is a simplified estimate, not official taxation or a vehicle registration quote. Country-specific rates and rules must be independently confirmed.
Performance: search of listings with a nonempty modelExtension or modificationNotes field. Appearance in Performance is not an authenticity certification.
Garage: private saved favorites and two-vehicle side-by-side comparison. Existing saved favorites backend is reused; local demo data is stored only locally.
Firestore rules allow three optional seller-data fields with strict types and maximum lengths. GitHub Actions validates rules with emulators. Production deploy requires LIMBA_FIREBASE_SERVICE_ACCOUNT_B64 secret; otherwise deployment is skipped and live saving of new fields will be blocked.
All 14 languages use explicit translations in limba-lux.js and native i18n.json.
Android release signing uses existing signing secrets when available; otherwise an unsigned-for-release debug package is produced.
