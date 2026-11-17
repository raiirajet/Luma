# Limba Android 1.4.1

- Paketname `ch.luma.auto`, `versionCode 6`, `versionName 1.4.1`.
- Dieselbe Firebase-Produktionskonfiguration wie die Website (`limba-auto`).
- E-Mail-/Passwort-Anmeldung, Registrierung, E-Mail-Verifizierung und Passwort-Reset.
- Synchronisierte Inserate, Favoriten, Eigentümeransicht, Meldungen und Statuswechsel.
- Auswahl, Komprimierung und Upload von 1 bis 6 Bildern, sobald Cloud Storage nach der notwendigen Blaze-Freigabe provisioniert wurde.
- Der lokale Zugang `limba/demo` bleibt strikt vom produktiven Firebase-Datenbestand getrennt.
- Verkäufer-E-Mail-Adressen werden nicht öffentlich im Inserat gespeichert.
- Debug-APKs sind Testartefakte. Ein GitHub Release wird nur mit dem dauerhaft gesicherten privaten Release-Keystore erzeugt.

Die öffentliche Firebase-Clientkonfiguration liegt in `app/src/main/assets/firebase-config.json`. Sie enthält keine Administrator- oder Service-Account-Zugangsdaten.
