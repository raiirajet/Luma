# Limba Auto 1.4.1 – Firebase-Betriebsstand

Website und native Android-App verwenden dasselbe Firebase-Projekt. Firebase-App-IDs und API-Schlüssel in diesem Repository sind öffentliche Client-Konfiguration. Service-Account-Dateien, private Schlüssel und Zugangstokens dürfen niemals eingecheckt werden.

## Bereits eingerichtet

| Bereich | Wert / Status |
|---|---|
| Firebase-Projekt | `limba-auto` (Anzeigename **Limba**) |
| Projekt-Nummer | `190623494655` |
| Hosting | `https://limba-auto.web.app` |
| Web-App | `1:190623494655:web:92f21575e57de7a4a077ca` |
| Android-App | `1:190623494655:android:f0b231d0bdd196d1a077ca` |
| Android-Paket | `ch.luma.auto` |
| Authentication | E-Mail/Passwort aktiviert |
| Firestore | `(default)`, Standard Edition, Native Mode, `europe-west6` (Zürich) |
| Abrechnung | Blaze-Tarif aktiv und Cloud-Billing-Konto verknüpft |
| Cloud Storage | `limba-auto.firebasestorage.app`, regional, `europe-west6` (Zürich) |
| Löschschutz | aktiviert |
| Client-Konfiguration | `config.js` und `android/app/src/main/assets/firebase-config.json` |

Die gewünschte globale Hosting-ID `limba` ist bereits von einem anderen Firebase-Projekt reserviert. Sie kann nicht in dieses Projekt übertragen werden. Die verfügbare Produktionsadresse ist deshalb `limba-auto.web.app`.

## Cloud Storage produktiv aktiviert

Cloud Storage ist seit dem 17. November 2026 produktiv eingerichtet. Der Blaze-Tarif wurde live bestätigt, der Standard-Bucket `limba-auto.firebasestorage.app` bewusst regional in `europe-west6` (Zürich) provisioniert und ausschließlich `storage.rules` deployt (Deployment-Job `1794930781377`).

Erfolgreich geprüft wurden:

- unverifizierte Eigentümer können nicht hochladen;
- verifizierte Eigentümer können gültige JPEG-, PNG- und WebP-Dateien unter ihrem eigenen Pfad hochladen und löschen;
- fremde Benutzer können Dateien weder überschreiben noch löschen;
- ungültige Inhaltstypen und nicht definierte Pfade werden abgelehnt;
- freigegebene Inseratsbilder sind öffentlich lesbar;
- Testdateien und temporäre Testkonten wurden nach der Prüfung vollständig entfernt.

Die Sicherheitsumstellung und der Abgleich mit den aktiven Regeln stehen im [Betriebshandbuch](docs/LIMBA_SECURITY_OPERATIONS.md). Der Schritt `lock-storage` sperrt Client-Schreibzugriffe und erfolgt nach dem Wechsel auf die serverseitige Fotoverarbeitung.

## Regeln lokal prüfen

```bash
npm ci --prefix functions
npm install --no-save firebase@12.6.0 @firebase/rules-unit-testing@5.0.0
npx -y firebase-tools@15.37.0 emulators:exec --project demo-limba --only firestore,storage "node tests/firebase_rules.test.mjs && npm test --prefix functions"
```

Die Regeln erzwingen unter anderem:

- öffentliche Lesezugriffe nur auf aktive Inserate;
- verifizierte Eigentümer für Erstellen, Bearbeiten, Statuswechsel und Löschen;
- vollständige Typ-, Feld-, Größen-, Status- und Bildpfadvalidierung bei Create und Update;
- keine öffentlich lesbare Kontakt-E-Mail im Inserat;
- strikt benutzergetrennte Favoriten, Suchfilter und Ländereinstellungen;
- genau eine unveränderliche Meldung pro Benutzer und Inserat;
- standardmäßig gesperrte, nicht definierte Collections und Storage-Pfade.

## Dauerhaft signierte Android-Releases

Für updatefähige Produktions-APKs einmalig einen privaten Android-Release-Keystore erstellen, offline sichern und als GitHub-Actions-Secrets hinterlegen:

- `LIMBA_RELEASE_KEYSTORE_B64`
- `LIMBA_KEYSTORE_PASSWORD`
- `LIMBA_KEY_ALIAS`
- `LIMBA_KEY_PASSWORD`

Der Workflow veröffentlicht ohne diese vier Werte keine GitHub Release-APK mehr. Ein Debug-Build wird nur als kurzlebiges Workflow-Artefakt bereitgestellt. Den privaten Keystore niemals in Git oder in ein öffentliches Ticket laden.

## Abnahme vor Marktstart

- Mit zwei real verifizierten Konten Website und Android gegeneinander testen.
- Inserat mit 1 bis 6 Fotos erstellen, bearbeiten, pausieren, verkaufen, reaktivieren und löschen.
- Fremdzugriff auf Inserat, Favoriten, Suchdaten und Fotos muss abgelehnt werden.
- Passwort-Reset und Bestätigungs-E-Mail auf realen Postfächern prüfen.
- Alle 14 Sprachen auf kleinem und großem Bildschirm kontrollieren.
- App Check, Spam-/Rate-Limits, Moderationswerkzeug, Monitoring und rechtliche Texte vor einem offenen Marktstart ergänzen bzw. freigeben.

Kontakt-E-Mails werden nicht mehr öffentlich im Inserat gespeichert. Für direkte Käufer-Verkäufer-Kommunikation ist später ein geschützter interner Nachrichtenkanal vorgesehen.
