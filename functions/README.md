# Limba 1.5 Functions – sicherer Rollout

Node 22, Functions v2, Zürich (`europe-west6`). Vor Aktivierung in der Firebase Console `appConfig/marketplace` mit `chat:false, offers:false, reviews:false, push:false, requireAppCheck:false` erstellen. Nach Emulator- und Zwei-Konten-Prüfung Funktionen einzeln freigeben. `requireAppCheck` erst nach erfolgreicher Web-/APK-Registrierung aktivieren.

Kein Zahlungseinzug. E-Mail- und verknüpfte Telefonbestätigung werden anhand Firebase Auth ID Token Claims geprüft. Clients dürfen keinerlei Trust-Aggregate schreiben. First admin: über einen separaten privilegierten Administrationsprozess Firebase Auth Custom Claim `admin:true` setzen – niemals im Client.

Aufruf-Beispiele: `createConversation({listingId})`, `sendMessage({conversationId,text})`, `createOffer({conversationId,amountEur,validUntil: new Date(...).toISOString()})`, `respondToOffer({offerId,action:'accept'})`, `confirmHandover({transactionId})`, `confirmPurchase({transactionId})`, `submitReview({transactionId,stars,tags,comment})`.

`offerId` ist die von `createOffer` gelieferte zusammengesetzte ID `conversationId~offerDocumentId`. Verkäufer-/Käuferbewertungen werden über `revieweeRole` getrennt gezählt. Der asynchrone Trigger `closeOtherOffers` schliesst übrige Angebote; zweite Annahmen sind bereits synchron durch den Listing-Status gesperrt.

Lokal: `cd functions && npm install && npm run check`; Emulatoren über Firebase CLI im Repo-Stamm. Deployment nur auf das bestätigte `limba-auto`-Projekt, ausdrücklich mit Auswahl der Functions und nach Sicherheitsprüfungen.

Noch nicht live: Telefonnummern-Länderkonfiguration, SMS-Billing/Quoten, App Check Enforcement, VAPID und Android Release-Zertifikat sowie Datenschutztexte.
