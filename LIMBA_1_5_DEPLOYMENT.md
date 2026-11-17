# Limba 1.5 – technischer Rollout und Abnahme

Stand: 17.11.2026. **Entwicklungsbranch, kein Live-Deployment.** Referenzprojekt: \`limba-auto\`. Hosting bislang \`https://limba-auto.web.app\`, nicht \`limba.web.app\`.

## Vorbereitung ohne Produktionsänderung

1. Draft PR #2 prüfen; bestehende Limba-Listings, Favoriten und Suchabos unangetastet lassen. Erfolgreiche Checks für Web, Android, Firestore/Storage und **Firebase-Functions-Transaktions-Emulator** prüfen. Der Emulator bildet SMS-Versand, echte Push-Zustellung und Release-Attestierung nicht ab.
2. Firebase Console: Projekt \`limba-auto\` auswählen und die Standard-Firestore-Datenbank in \`europe-west6\` bestätigen. Keine andere Datenbank berühren.
3. Firebase Auth: E-Mail/Passwort und Phone aktivieren. SMS-Regionen für die 12 Märkte AL, TR, GR, RS, SI, XK, MK, HR, BA, ME, BG, RO sowie DE, AT, CH konfigurieren, soweit unterstützt; Unterstützung, SMS-Quoten, Gebühren und reale Zustellung **pro Land** überprüfen. Bestehende E-Mail-UIDs müssen per \`linkWithPhoneNumber\` (Web) bzw. \`linkWithCredential\` (Android) ihre Nummer verknüpfen. Testnummern dürfen nur in der Firebase-Testumgebung verwendet werden.
4. Web Auth: autorisierte Domains \`limba-auto.web.app\` und bestätigte Produktionsdomain registrieren. Für \`limba.web.app\` zuerst prüfen, wem diese Firebase Hosting-Site gehört, und die Domain der korrekten Site im korrekten Firebase-Projekt zuordnen. Keine bestehende Hosting-Site überschreiben.
5. Android: Produktions-Package-ID \`ch.luma.auto\` und **ursprüngliches** Signaturzertifikat behalten. SHA-1 und SHA-256 des Release-Zertifikats in Firebase hinterlegen. Sicherstellen, dass Android Phone Auth Play Integrity und reCAPTCHA-Fallback funktionieren. Debug-APK ist nicht die finale signierte APK.
6. App Check: Web reCAPTCHA-v3-Site-Key in \`config.js\` über \`window.LIMBA_APP_CHECK_SITE_KEY\` setzen; Android Play Integrity erst nach Provider-Registrierung mit \`appCheckEnabled: true\` in der APK-Firebase-Konfiguration aktivieren. Bei neuen Benutzern und beiden Plattformen im Monitoring auf gültige Tokens prüfen. Danach \`appConfig/marketplace.requireAppCheck=true\` für Callables setzen; eine sofortige Erzwingung ohne Client-Setup sperrt Funktionen.
7. Web Push: öffentlichen VAPID-Key als \`window.LIMBA_VAPID_PUBLIC_KEY\` bereitstellen, Berechtigung erfragen, Worker \`/firebase-messaging-sw.js\` ausliefern und HTTPS prüfen. Android Push-Service, Benachrichtigungskanal \`limba_updates\` und Android 13+ Runtime Permission testen. Nachrichteninhalte und PII dürfen nicht in Push-Nutzlasten erscheinen.
8. Erste Moderations-UID in einer **privilegierten Admin-Umgebung** per Firebase Auth Custom Claim \`admin:true\` vergeben, Token neu laden; nie eine Firestore-Profilflag als Adminbeweis akzeptieren, nie Service-Account-JSON ins Repo/Frontend/APK übernehmen.
9. Datenschutz und Nutzungsbedingungen juristisch finalisieren: Telefonverifizierung, Chat/Angebote, PII-Schutz, Push/Opt-out, Bewertungen, Missbrauchsmeldungen, Aufbewahrung, Auskunft/Löschung, grenzüberschreitende Nutzung. Keine Zahlungsmittel in Limba.

## Bereitstellung nur nach Freigabe

\`\`\`bash
firebase use limba-auto
cd functions && npm install && npm run check && cd ..
firebase emulators:exec --project demo-limba --only auth,firestore,functions \
  "cd functions && node --test tests/marketplace.e2e.test.mjs"
firebase deploy --project limba-auto --only firestore:rules,firestore:indexes,storage
firebase deploy --project limba-auto --only functions:marketplace
firebase deploy --project limba-auto --only hosting:limba-auto
\`\`\`

Vorab \`appConfig/marketplace\` serverseitig als Dokument mit \`chat:false\`, \`offers:false\`, \`reviews:false\`, \`push:false\`, \`requireAppCheck:false\` erstellen. Nach Abnahme die Flags **einzeln** aktivieren. Produktions-Billing, Cloud Functions v2 APIs/IAM/Quoten prüfen. Ein Firebase Hosting-Deploy ersetzt weder einen Functions-Deploy noch Auth-/SMS-/App-Check-Konfigurationen.

## Abnahmeprotokoll (ausführen und dokumentieren)

- Responsive 320/390/768/1440 px, Fokus-Tastatur, Screenreader, Kontrast und Safe-Area (Web und Android).
- Drei echte Konten: zwei mit bestätigter E-Mail und verknüpfter Telefonnummer, drittes unbeteiligt. Inserat → Chat → Angebot → Annahme \`reserved\` → Verkäuferübergabe → Käuferkauf \`sold\` → beidseitige Bewertungen.
- Unberechtigter Zugriff für dritte UID sowie Selbstbewertung, Doppelbewertung, Timeout nach 30 Tagen, Editierfrist 30 Minuten und korrekte Aggregate nach Rücknahme/Moderation.
- Messenger und Angebote mit Blockierung; Nachrichten-Limit, Gültigkeitsfrist und Offline-Bedingungen.
- Web Push Vorder-/Hintergrund, Android Push Vorder-/Hintergrund, Tokenlöschung, Telefon-SMS in allen freigeschalteten Ländern.
- Android mindestens API 26, signierte APK mit unverändertem ursprünglichem Release-Key, Installation/Update auf vorhandene Version ohne Deinstallation und SHA-Fingerabdruckkontrolle.
- **Getrennt festhalten:** Emulatorerfolg, reale Staging-Prüfung, Live-Smoke-Test, tatsächlich veröffentlichtes Hosting, echte signierte APK. Bei Fehlern Flags deaktivieren, nicht eigenmächtig Daten migrieren.

## Grenzen im aktuellen Pull Request

Implementiert sind Client-Code, Firestore/Storage-Regeln, Indizes und Cloud-Functions-Codebasis. Firebase Produktionsdeploy, Domain-Übernahme, produktive SMS und FCM/VAPID-Schlüssel, Auth-Verifikation auf echten Geräten, Rechtstexte und signierter Release-Build werden nur nach Zugang/Prüfung abgeschlossen. Bestehende verkaufte Fahrzeuge werden nicht rückwirkend bewertet.
