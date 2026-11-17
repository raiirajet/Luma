# Luma Auto · Autoverkaufsportal für Südosteuropa

Luma wurde von einem allgemeinen Kleinanzeigenmarkt in einen **reinen Personenwagen-Marktplatz** umgestaltet. Das Design ist eigenständig und orientiert sich bei den Suchabläufen an gängigen Fahrzeugbörsen, ohne Branding oder Gestaltung eines konkreten Wettbewerbers zu kopieren.

## Funktionen

- Responsive Auto-Startseite mit **Marke, Modell, Preis, Erstzulassung, Kilometer, Kraftstoff, Getriebe, Karosserie, Verkäuferart**.
- 12 Suchländer im Nutzer-Dashboard (lokal für Gäste; Firebase-Profil für eingeloggte Nutzer).
- 14 Sprachen: Deutsch, Englisch, Albanisch, Türkisch, Griechisch, Serbisch Latein/Kyrillisch, Slowenisch, Kroatisch, Mazedonisch, Bosnisch, Montenegrinisch, Bulgarisch, Rumänisch.
- EUR-Preise, Filter, Sortierung, gespeicherte Suchen, Favoriten, Detailansicht mit technischen Daten und Bildernavigation.
- Vollbild-Fahrzeug-Swipe mit Home oben rechts, Favorit unten rechts und einmaliger Einführung.
- Firebase Email/Password und Bestätigungs-E-Mail, Fahrzeug-Inserate und Fotouploads, Verwaltung und Löschung eigener Inserate. Funktionen sind gesperrt, solange Firebase nicht eingerichtet ist.
- 12 klar als **Demos** gekennzeichnete Autos mit externen, echten Unsplash-Stockfotos. **Die Bilder stellen nicht die angegebenen Beispielmodelle dar.** Es handelt sich um keine echten Kaufangebote und keine aktuellen Marktpreise.

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

Diese Web-App verwendet ES-Module und benötigt daher einen lokalen HTTP-Server. Die separate `preview.html` ist als einzelne Datei auch direkt im Browser aufrufbar.

## Grenzen

- Keine funktionierende Benutzerregistrierung und keine realen Uploads, solange `config.js` ohne Firebase-Konfiguration bleibt.
- Keine echte Händlerprüfung, Finanzierung, Zahlungsabwicklung, Fahrzeughistorie oder automatische Angebotsübersetzung. Für diese Funktionen sind Dienste und Rechtsprüfung notwendig.
- Suche basiert aktuell auf den geladenen Inseraten (bis 300 Firestore-Dokumente); für Produktion werden serverseitige Pagination, Suche und Anti-Spam-Moderation benötigt.
- Originaltexte von Nutzern sind bewusst unverändert; ein Übersetzungsdienst wäre eine zukünftige Option.