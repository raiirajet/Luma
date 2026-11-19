# Limba Auto · Autoverkaufsportal für Südosteuropa

## Limba 1.4.1 · gemeinsames Firebase-MVP für Website und Android

**Produktionsprojekt:** Website und Android sind mit Firebase `limba-auto` verbunden. Authentication, Firestore und Cloud Storage sind eingerichtet; die Website wird unter [limba-auto.web.app](https://limba-auto.web.app) veröffentlicht. Der genaue Betriebsstand steht in [FIREBASE_LIMBA_SETUP.md](FIREBASE_LIMBA_SETUP.md).

- **Anmeldung:** Die produktive Website und die Release-APK verwenden E-Mail und Passwort über Firebase. Die herunterladbare Browser-Vorschau unterstützt eigene lokale Testkonten.
- **Firebase mit Konfiguration:** gemeinsames Auth-System mit E-Mail-Verifizierung und Passwort-Reset; synchronisierte öffentliche Fahrzeuge und Favoriten; Eigentümeransicht für aktive, pausierte und verkaufte Inserate.
- **Native Android-App:** echte Firebase-SDKs, Kamera-/Galerie-Auswahl über das Android-Dokument-Auswahlsystem, Upload bis 6 Bilder, Bearbeiten, Statuswechsel, Löschen und Fahrzeugmeldungen.
- **Web:** Bearbeiten, Verkauft/Pausiert/Reaktivieren, separater Kontospeicher und Meldungen. Kontakt-E-Mails werden nicht öffentlich gespeichert.
- **Sicherheit:** gehärtete Firestore-/Storage-Regeln mit Eigentümer-, Verifizierungs-, Schema-, Größen- und Bildpfadprüfung; erweiterte Emulator-Angriffstests und Web-/APK-CI.
- **GitHub Actions:** Die öffentlichen Firebase-Clientwerte sind reproduzierbar im Quellcode enthalten. Eine Release-APK wird nur mit den vier privaten Keystore-Secrets veröffentlicht; ohne sie entsteht ausschließlich ein Debug-Testartefakt.
- **Sprachen & Marken:** 14 Sprachversionen und die bestehende Markenliste bleiben erhalten.

**Wichtige Betriebsgrenzen:** Der Blaze-Tarif und Cloud Storage in Zürich sind aktiv; Eigentümer-Upload, öffentliches Lesen, Fremdzugriffsschutz und Löschung wurden live mit zwei temporären Konten geprüft. Vor öffentlicher Veröffentlichung bleiben ein realer Website-/Android-Gerätetest, Datenschutz-/Rechtsprüfung und Anti-Spam-Maßnahmen erforderlich. Die aktuelle Firestore-Suche lädt maximal 300 aktive Inserate; serverseitige Pagination und ein Moderator-Dashboard sind weiterhin geplant.


Luma wurde von einem allgemeinen Kleinanzeigenmarkt in einen **reinen Personenwagen-Marktplatz** umgestaltet. Das Design ist eigenständig und orientiert sich bei den Suchabläufen an gängigen Fahrzeugbörsen, ohne Branding oder Gestaltung eines konkreten Wettbewerbers zu kopieren.

## Funktionen

- Responsive Auto-Startseite mit **Marke, Modell, Preis, Erstzulassung, Kilometer, Kraftstoff, Getriebe, Karosserie, Verkäuferart**.
- **435 kuratierte Automarken** (aktiv, historisch, regional, Luxus, Elektro und Kleinserien) in einem **durchsuchbaren Vorschlagsverzeichnis** (`car-brands.js`), inklusive türkischer und südosteuropäischer Hersteller. Modellvorschläge für häufige Marken; fehlende Marken und Modelle können frei eingegeben werden. Unterschiedliche Schreibweisen/Akzente werden beim Suchen normalisiert (z. B. Skoda → Škoda, VW → Volkswagen beim Inserieren). Die Liste erhebt keinen Anspruch auf jede jemals verwendete Marke; sie ist erweiterbar und benötigt keine Fremd-API.
- 12 Suchländer im Nutzer-Dashboard (lokal für Gäste; Firebase-Profil für eingeloggte Nutzer).
- 14 Sprachen: Deutsch, Englisch, Albanisch, Türkisch, Griechisch, Serbisch Latein/Kyrillisch, Slowenisch, Kroatisch, Mazedonisch, Bosnisch, Montenegrinisch, Bulgarisch, Rumänisch.
- EUR-Preise, Filter, Sortierung, gespeicherte Suchen, Favoriten, Detailansicht mit technischen Daten und Bildernavigation.
- Vollbild-Fahrzeug-Swipe mit Home oben rechts, Favorit unten rechts und einmaliger Einführung.
- Firebase Email/Password und Bestätigungs-E-Mail, Fahrzeug-Inserate und Fotouploads, Verwaltung und Löschung eigener Inserate. Funktionen sind gesperrt, solange Firebase nicht eingerichtet ist.
- **Ein einziges Musterfahrzeug:** schwarzer **Nissan GT-R R35 Black Edition (Beispieljahr 2013)** mit einer ausführlichen, in allen 14 Sprachen übersetzten Beschreibung und einer echten, passenden Fahrzeugaufnahme. **Preis, Kilometerstand, Ort und Zustand sind erfundene Testangaben**, kein Angebot und kein Verkäufer. Echte Nutzerfahrzeuge bleiben erhalten, falls Firebase aktiviert wird.
- **Rücknavigation:** Swipe → Hoch-/Rechtswischen → Fahrzeugdetails → «Zurück zum Swipe», Schliessen oder Browser-Zurück. Die Swipe-Infohilfe verfügt über «Zurück zum Fahrzeug». **Home** oben rechts verlässt Swipe; das **Herz** unten rechts speichert Favoriten. Bei nur einem Treffer werden links/abwärts keine endlosen Wiederholungen mehr ausgelöst.
- Die Gestenerkennung verhindert unbeabsichtigte Browser-Scroll-Abbrüche bei vertikalen Swipes. Tastaturpfeile sind zusätzlich als Alternative verfügbar.
- Eine angemeldete Person kann nach Bestätigung der E-Mail-Adresse im Kontodialog den Verifizierungsstatus erneut laden, damit der Inserat-Upload anschliessend möglich wird.

## Firebase aktivieren

1. Firebase-Projekt `limba-auto`, Web-App und Android-App sind bereits angelegt; die **öffentliche** Client-Konfiguration ist eingecheckt. Keine Service-Account-Schlüssel einchecken.
2. Firebase Authentication mit E-Mail/Passwort und Firestore `(default)` in Zürich sind bereits aktiviert.
3. Cloud Storage ist im Blaze-Tarif regional in Zürich provisioniert; `storage.rules` sind produktiv deployt.
4. **Wichtig:** Firestore-Regeln schränken neue Anzeigen auf Kategorie `vehicles` und Fahrzeugdaten ein. Bestehende Nicht-Auto-Anzeigen aus älteren Luma-Versionen werden in der neuen Oberfläche ausgefiltert. Daten werden nicht gelöscht.
5. Erst nach Moderation, Rechts- und Datenschutzprüfung sowie Schutz gegen Betrug öffentlich zum Handel freigeben.

Der [Limba-Betriebsleitfaden](docs/LIMBA_SECURITY_OPERATIONS.md) beschreibt Regelvergleich, App Check und die Reihenfolge für Firebase-Deployments. Die separate GitHub-Pages-Veröffentlichung wird durch einen Push nach `main` ausgelöst.

## Lokal starten

```bash
python3 -m http.server 8080
# http://localhost:8080/
```

Diese Web-App verwendet ES-Module und benötigt daher einen lokalen HTTP-Server. Die separate `preview.html` ist als einzelne Datei auch direkt im Browser aufrufbar. Sie kann mit `python3 build_preview.py` aus den aktuellen Quelldateien neu erzeugt werden.

## Regressionstests

Die Skripte `qa_regression.py` und `test_swipe_pointer.py` prüfen die lokalen Oberflächen mit Playwright/Chromium bei 1440 px und 390 px. Geprüft wurden unter anderem:

- genau ein Demoauto und dessen ausführliche Beschreibung in allen 14 Sprachen
- Marke/Modell/Preisfilter, Reset, Suchländer, gespeicherte Suchen, Merkliste
- Swipe-Einführung, Infohilfe mit Zurück, Gesten in alle vier Richtungen, Klick auf Favorit, Home
- Zurück aus Detailansichten mit Button, Escape und Browser-Verlauf
- Gast-Authentifizierungsdialog (Firebase noch nicht eingerichtet) und JavaScript-Laufzeitfehler

Tests laufen ohne Zugriff auf externe Bilder; Bilddarstellung und echte Firebase-Backend-Interaktionen müssen zusätzlich nach dem produktiven Einrichten geprüft werden.

```bash
python3 build_preview.py
python3 qa_regression.py
python3 test_swipe_pointer.py
```

## Bild und Datenherkunft

Die Beispielaufnahme zeigt einen echten schwarzen GT-R: [Joshua Spence / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Nissan_GT-R_R35_Black_Edition.JPG), **CC BY-SA 4.0**. Die Urheberangabe und die Lizenz sind aus der Fahrzeugdetailansicht verlinkt. Angaben zum Modellantrieb, V6-Biturbo und zur Black Edition sind mit dem [2013 Nissan GT-R Press Kit](https://usa.nissannews.com/en-US/releases/2013-nissan-gt-r-press-kit) gegengeprüft; die Verkaufsdaten sind ausdrücklich fiktiv.

## Grenzen

- Registrierung, Firestore und Cloud Storage sind produktiv konfiguriert; Foto-Uploads sind für verifizierte Eigentümer freigeschaltet.
- Keine echte Händlerprüfung, Finanzierung, Zahlungsabwicklung, Fahrzeughistorie oder automatische Angebotsübersetzung. Für diese Funktionen sind Dienste und Rechtsprüfung notwendig.
- Suche basiert aktuell auf den geladenen Inseraten (bis 300 Firestore-Dokumente); für Produktion werden serverseitige Pagination, Suche und Anti-Spam-Moderation benötigt.
- Originaltexte von Nutzern sind bewusst unverändert; ein Übersetzungsdienst wäre eine zukünftige Option.

## Markenverzeichnis aktualisieren

`car-brands.js` enthält die lokalen Marken- und Modellvorschläge. Eine Automarke wird nicht blockiert, nur weil sie noch nicht auf der Liste steht: Marken können bei der Inseratserstellung unter Beachtung der Länge/Zeichenvalidierung selbst eingetragen werden. Suchen akzeptieren Teilnamen und Akzentvarianten. Für verlässliche Datenqualität sind künftig Moderation und Marken-Alias-Prüfungen sinnvoll.

## Limba Designsystem (November 2026)

Das Markendesign verwendet die 18 vom Betreiber gelieferten transparenten 3D-PNG-Funktionsicons plus Wortmarke, Symbol und App-Icon. Text- und Bedienoberflächen tragen den Namen **Limba**. Die GitHub-Repository-URL und die Android-App-ID `ch.luma.auto` bleiben bewusst bestehen, damit die bestehende Installation / Web-URL erhalten bleiben; ohne hinterlegte Release-Signing-Secrets bleibt die APK eine debug-signierte Vorabversion.

## Floating Plus und Fahrzeug-Steckbrief

- Dezent sichtbarer Floating-Plus-Button für die Fahrzeuginserierung auf Desktop/Mobilgeräten; Swipe bleibt ungestört.
- Lokale Testkonten lassen sich in der Browser-Vorschau registrieren und mit PBKDF2-SHA256-Prüfwert wieder anmelden; die Daten bleiben **nur im Browser**. Es werden keine Klartextpasswörter gespeichert. Diese Konten funktionieren in der eigenständigen Browser-Vorschau.
- Echte E-Mail-Registrierung, Verifizierungs-E-Mail, Passwort-Zurücksetzen, Inseratserstellung und Fotoupload sind produktiv mit Firebase `limba-auto` verbunden. Die öffentlichen Client-Konfigurationen sind eingecheckt; Administrator- und Signing-Schlüssel bleiben außerhalb des Repositorys.
- Die eigenständige Browser-Vorschau kann lokale Testinserate und ein kleines Foto im Browser speichern.
- Das Formular zeigt einen strukturierten Fahrzeug-Steckbrief mit Unfallfahrzeug (Ja/Nein/Keine Angabe), kurzer Zustandsnotiz, freier Beschreibung und technischen Daten.
- Das vorgeschlagene Backend-Schema `firestore.rules` wurde um `accidentStatus` und `conditionNote` erweitert, die Regeln müssen **gesondert getestet und deployed** werden. Neue Datensätze nach diesen Regeln müssen beide Felder liefern; bisherige veröffentlichte Fahrzeuge bleiben lesbar.
- Alle neuen UI-Texte sind über `feature-i18n.js` in sämtlichen 14 UI-Sprachen hinterlegt. Die Android-Version enthält dieselben übersetzten Strings in `android/app/src/main/assets/i18n.json`.
