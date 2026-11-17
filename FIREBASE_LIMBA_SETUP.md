# Limba Auto 1.4 – Firebase verbinden

Die Website und die native Android-App verwenden **dasselbe** Firestore-Projekt. Ohne Konfiguration laufen beide weiterhin als **lokale Demo**. Die Anmeldung `limba/demo` ist keine produktive Identität. Öffentliche Firebase-App-IDs und API-Schlüssel sind **Client-Konfiguration**, keine Administrator-Zugangsdaten. Niemals Service-Account-JSON, private Schlüssel oder Zugangstokens einchecken.

## 1. Firebase-Projekt Limba erstellen

1. In [Firebase Console](https://console.firebase.google.com/) ein neues Projekt anlegen, Anzeigename **Limba**. Die automatisch vergebene `projectId` notieren.
2. **Authentication** > **Sign-in method** > **Email/Password** aktivieren. E-Mail-Bestätigung verwenden. Unter **Settings > Authorized domains** `raiirajet.github.io` eintragen; weitere eigene Domains erst nach Einrichtung hinzufügen.
3. **Firestore Database** in der gewünschten Region erstellen (Standarddatenbank **(default)**). Die Region vorab bewusst wählen; Änderungen sind später aufwendig.
4. **Cloud Storage** für dasselbe Projekt aktivieren, ebenso die erforderliche Abrechnung, falls Firebase sie verlangt. Nur nach Tests die im Repository vorbereiteten Regeln deployen.
5. Unter **Project settings > Your apps** eine **Web-App** registrieren. Den öffentlichen `firebaseConfig`-Block als reines JSON in eine lokale Datei `limba-web.json` kopieren.
6. Eine **Android-App** registrieren mit Paketname **`ch.luma.auto`** (unbedingt beibehalten, wenn bestehende Apps Updates erhalten sollen). `google-services.json` herunterladen. Ein Google-Services-Gradle-Plugin ist hier nicht nötig, da Limba FirebaseOptions aus sicheren Client-Settings aufbaut.

## 2. Beide Apps mit einem einzigen Hilfsskript vorbereiten

Im geklonten Repository:

```bash
python3 scripts/prepare_config.py limba-web.json google-services.json
```

Das Programm validiert, dass beide Apps dieselbe `projectId` besitzen, und erzeugt:

- `config.js` – öffentliche Firebase-Konfiguration für die Website.
- `android/app/src/main/assets/firebase-config.json` – öffentliche Konfiguration für die native APK (durch `.gitignore` ausgeschlossen).
- Zwei **Base64-Werte** für GitHub-Repository-Secrets: `LIMBA_WEB_CONFIG_B64` und `LIMBA_ANDROID_CONFIG_B64`.

Unter GitHub > Repository > **Settings > Secrets and variables > Actions > New repository secret** beide Werte hinterlegen. Beim nächsten automatischen Deployment baut GitHub Pages die Web-Konfiguration ein; der Android-Build integriert die passende native Konfiguration. Änderungen an Secrets lösen selbst keinen Build aus: über **Actions > Deploy Limba website > Run workflow** und **Build Limba Android APK > Run workflow** neu veröffentlichen.

**Wichtig:** Eine bereits installierte Debug-APK aus einer anderen GitHub-Actions-Session ist unter Umständen nicht updatefähig. Für dauerhafte Updates muss die App mit demselben privaten Release-Keystore signiert werden.

## 3. Release-APK dauerhaft signieren (optional, vor öffentlicher Veröffentlichung verpflichtend)

Einmalig einen **privaten** Android-Release-Schlüssel erstellen und sicher offline aufbewahren. In GitHub folgende Secrets hinterlegen:

- `LIMBA_RELEASE_KEYSTORE_B64` – Base64 des vollständigen Keystore-Binärinhalts
- `LIMBA_KEYSTORE_PASSWORD` – Keystore-Passwort
- `LIMBA_KEY_ALIAS` – Schlüsselalias
- `LIMBA_KEY_PASSWORD` – Schlüsselpasswort

Der Build erzeugt dann auf `main` eine signierte Release-APK. **Den privaten Keystore niemals ins Repository laden.** Die erste Migration von einer anders signierten Debug-APK kann eine Deinstallation benötigen.

## 4. Regeln testen und Firebase aktivieren

Firebase CLI installieren und anmelden:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
# Limba / deine projectId auswählen
firebase emulators:start --only firestore,auth,storage
```

Im Emulator zunächst Registrierung, Verifizierung, Inserat erstellen/bearbeiten/verkaufen/löschen, Foto-Uploads und gesperrte Fremdzugriffe prüfen. **Erst danach**:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Dieser Deploy ändert **nur die Regeln und Indexdefinitionen** im ausgewählten Projekt, keine bestehenden Datensätze. Die Regeln müssen zur tatsächlich eingesetzten Firebase-Datenbank passen. Nicht versehentlich auf ein anderes Projekt oder eine zweite Datenbank deployen.

## 5. Funktionsabnahme nach Einrichtung

- Gleiche E-Mail auf Website und Android nutzen; Anmeldung, Verifizierungs-E-Mail und Passwort-Reset prüfen.
- Ein Foto-Inserat auf Android erstellen und auf der Website anzeigen, dann umgekehrt.
- Als Eigentümer bearbeiten, pausieren, verkaufen, reaktivieren und löschen.
- Mit einem zweiten Konto versuchen, fremde Inserate/Fotos/Favoriten zu ändern: **Zugriff muss abgelehnt werden**.
- Jede der 14 Sprachen auf kleinem und grossem Bildschirm testen. Echte Android-App-Geräte inklusive Statusleiste, Gestennavigation und Rotationswechsel prüfen.
- Optionalen Kontakt-E-Mail-Hinweis beachten: Wer eine E-Mail angibt, veröffentlicht diese im öffentlichen Inserat.
- Reports im Firebase-Admin-Bereich beobachten. Eine geschützte Moderationsoberfläche ist noch nicht enthalten.

## Grenzen der Vorbereitung

Diese Schritte **erstellen kein Firebase-Projekt automatisch**, aktivieren keine Abrechnung und ersetzen keine Rechteprüfung, rechtliche Freigabe oder Server-seitige Moderation. Die GitHub-Secrets können nur von einem Repository-Administrator gesetzt werden. Die aktuellen Regeln, Indexe und Client-Konfiguration liegen aber vollständig als Quellcode vor.
