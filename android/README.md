# Limba Android 1.8.2

- Paketname `ch.luma.auto`, Buildnummer 13.
- Dieselbe Firebase-Produktionskonfiguration wie die Website (`limba-auto`).
- E-Mail-/Passwort-Anmeldung, Registrierung, E-Mail-Verifizierung und Passwort-Reset.
- Synchronisierte Inserate, Favoriten, Eigentümeransicht, Meldungen und Statuswechsel.
- Auswahl, Komprimierung und produktiver Upload von 1 bis 6 Bildern über Cloud Storage in `europe-west6` (Zürich).
- Galerieauswahl über den Android-Fotowähler. Die App fragt Kamerazugriff erst beim Aufnehmen eines Inseratsfotos ab.
- Gerätebenachrichtigungen für neue Treffer gespeicherter Suchen können bei der Aktivierung einer Suchbenachrichtigung oder im Benachrichtigungsbereich erlaubt werden. Die App empfängt sie, solange sie im Hintergrund noch läuft.
- Verkäufer-E-Mail-Adressen werden nicht öffentlich im Inserat gespeichert.
- Debug-APKs sind Testartefakte. Ein GitHub Release wird nur mit dem dauerhaft gesicherten privaten Release-Keystore erzeugt.

Die öffentliche Firebase-Clientkonfiguration liegt in `app/src/main/assets/firebase-config.json`. Sie enthält keine Administrator- oder Service-Account-Zugangsdaten.

Der dauerhafte Release-Schlüssel ist im Secret Manager des Projekts `limba-auto` unter `limba-android-release-signing` gesichert. Geräte mit einer älteren Debug-APK müssen beim ersten Wechsel zur Release-Signatur die Debug-APK deinstallieren.
