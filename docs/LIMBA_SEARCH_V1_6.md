# Limba Auto 1.6 — restored vehicle catalog and extended search

All previous 1.5 experiences (Showroom, Vehicle Pass, Borderless, Performance, Garage) remain present.

## Brand/model selection
- Website search and listing forms now use visible, keyboard-accessible dropdowns. Clicking a field or the chevron opens a scrollable list before typing; typing narrows items in real time. Brand options come from the bundled vehicle make catalogue, model options from the selected make and live listing additions. Direct manual entry is preserved for missing brands/models.
- Native Android uses 0-character threshold AutoCompleteTextView with on-focus/on-tap dropdown and text filtering. Home list results also update in place while entering a search, keeping the keyboard open.

## Filter ranges
- Mileage (km): exact minimum and maximum rather than rounded mileage levels.
- First registration: from and to year.
- Asking price from and to, engine horsepower (PS) from and to.
- Engine name/code text search and displacement (cm³) from and to.
- Fuel, transmission, body style and seller type remain supported.
- Saved search maps extend with optional keys; earlier saved searches remain valid.
- Listings optionally store engineName (<=80 characters) and engineCapacity (0–12000 cc). If a listing does not specify displacement, displacement filters exclude it instead of inventing a capacity.

## Deployment constraints
- Firestore rule amendments must be deployed to production before new online listing motor fields and fully synchronized advanced searches are accepted. GitHub Actions tests rules locally and only deploys live with LIMBA_FIREBASE_SERVICE_ACCOUNT_B64 secret configured.
- Website saved-search sync retries the legacy 12-field schema when server rules reject the extended schema; extended fields remain in local storage in that scenario and do not fully sync between devices.
- Native Android release signing only if signing secrets exist; otherwise debug-signed APK.
