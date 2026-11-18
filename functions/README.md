# Limba 1.5 Functions – sicherer Rollout

Node 22, Functions v2, Zürich (`europe-west6`). Vor Aktivierung in der Firebase Console `appConfig/marketplace` mit `chat:false, offers:false, reviews:false, push:false, requireAppCheck:false` erstellen. Nach Emulator- und Zwei-Konten-Prüfung Funktionen einzeln freigeben. `requireAppCheck` erst nach erfolgreicher Web-/APK-Registrierung aktivieren.

Kein Zahlungseinzug. E-Mail- und verknüpfte Telefonbestätigung werden anhand Firebase Auth ID Token Claims geprüft. Clients dürfen keinerlei Trust-Aggregate schreiben. First admin: über einen separaten privilegierten Administrationsprozess Firebase Auth Custom Claim `admin:true` setzen – niemals im Client.

Aufruf-Beispiele: `createConversation({listingId})`, `sendMessage({conversationId,text})`, `createOffer({conversationId,amountEur,validUntil: new Date(...).toISOString()})`, `respondToOffer({offerId,action:'accept'})`, `confirmHandover({transactionId})`, `confirmPurchase({transactionId})`, `submitReview({transactionId,stars,tags,comment})`.

`offerId` ist die von `createOffer` gelieferte zusammengesetzte ID `conversationId~offerDocumentId`. Verkäufer-/Käuferbewertungen werden über `revieweeRole` getrennt gezählt. Der asynchrone Trigger `closeOtherOffers` schliesst übrige Angebote; zweite Annahmen sind bereits synchron durch den Listing-Status gesperrt.

Lokal: `cd functions && npm install && npm run check`; Emulatoren über Firebase CLI im Repo-Stamm. Deployment nur auf das bestätigte `limba-auto`-Projekt, ausdrücklich mit Auswahl der Functions und nach Sicherheitsprüfungen.

Noch nicht live: Telefonnummern-Länderkonfiguration, SMS-Billing/Quoten, App Check Enforcement, VAPID und Android Release-Zertifikat sowie Datenschutztexte.

### Price-offer anti-spam quota (Limba 1.5)
`createOffer` is callable only by the buyer (verified email + linked phone); maximum **3 successful offers per buyer per Europe/Zurich calendar day** across all listings. A Firestore transaction atomically increments `offerQuotas/{uid}_{YYYYMMDD}`; rejected, failed and duplicate open offers do not consume quota. `getOfferQuota` returns the remaining allowance to authenticated clients, while Firestore rules deny direct counter reads/writes. Only the seller may accept/reject offers. Automatic rollover uses a new daily document, never client-side timestamps. Each quota document has an optional `expiresAt` field (configure Firestore TTL policy separately on `offerQuotas.expiresAt` after rollout).

### Seller offer toggle and price-watch notifications
A listing's `allowOffers` boolean defaults to **true for legacy listings**. Only its authenticated owner can change it via the strictly validated Firestore listing schema; `createOffer` enforces false regardless of client UI. `getPriceAlert` and `setPriceAlert` use authenticated, verified callables with server-held `priceAlerts` records. `recordInitialListingPrice` and `recordListingPriceChange` write immutable-to-clients history records. Only changed prices trigger alerts, and only when `appConfig/marketplace.push=true` and the watcher has a registered FCM device token. Deploy both Functions and Firestore rules, and verify Firestore indexes for the subscription query, before enabling push. Initial history exists only for listings created after the trigger is deployed; do not backfill unknown historical prices.
