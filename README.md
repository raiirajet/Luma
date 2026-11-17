# Luma Auto · Autoverkaufsportal für Südosteuropa

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

1. Firebase-Projekt und Web-App anlegen. Die **öffentliche** Konfiguration in `config.js` eintragen. Keine Service-Account-Schlüssel einchecken.
2. Firebase Authentication → E-Mail/Passwort aktivieren, E-Mail-Verifizierung einstellen und die GitHub-Pages-Domain autorisieren.
3. Firestore und Storage aufsetzen und Regeln `firestore.rules` und `storage.rules` nach Emulator-Tests anwenden.
4. **Wichtig:** Firestore-Regeln schränken neue Anzeigen auf Kategorie `vehicles` und Fahrzeugdaten ein. Bestehende Nicht-Auto-Anzeigen aus älteren Luma-Versionen werden in der neuen Oberfläche ausgefiltert. Daten werden nicht gelöscht.
5. Erst nach Moderation, Rechts- und Datenschutzprüfung sowie Schutz gegen Betrug öffentlich zum Handel freigeben.

**CLI zum späteren Aktivieren der Sicherheitsregeln:**

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

Mit GitHub Actions ist das statische Frontend für GitHub Pages konfiguriert (`.github/workflows/pages.yml`). Ein Push nach `main` löst die Veröffentlichung aus.

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

- Keine funktionierende Benutzerregistrierung und keine realen Uploads, solange `config.js` ohne Firebase-Konfiguration bleibt.
- Keine echte Händlerprüfung, Finanzierung, Zahlungsabwicklung, Fahrzeughistorie oder automatische Angebotsübersetzung. Für diese Funktionen sind Dienste und Rechtsprüfung notwendig.
- Suche basiert aktuell auf den geladenen Inseraten (bis 300 Firestore-Dokumente); für Produktion werden serverseitige Pagination, Suche und Anti-Spam-Moderation benötigt.
- Originaltexte von Nutzern sind bewusst unverändert; ein Übersetzungsdienst wäre eine zukünftige Option.

## Markenverzeichnis aktualisieren

`car-brands.js` enthält die lokalen Marken- und Modellvorschläge. Eine Automarke wird nicht blockiert, nur weil sie noch nicht auf der Liste steht: Marken können bei der Inseratserstellung unter Beachtung der Länge/Zeichenvalidierung selbst eingetragen werden. Suchen akzeptieren Teilnamen und Akzentvarianten. Für verlässliche Datenqualität sind künftig Moderation und Marken-Alias-Prüfungen sinnvoll.