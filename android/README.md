
## Version 1.3.0 (native Demo-Inserate)

- Floating-Plus-Schaltfläche mit originalem Limba-3D-Icon auf den regulären App-Seiten, unterhalb der Systemleisten und oberhalb der App-Navigation.
- Sprachauswahl beim ersten Start (14 Sprachen), später in den Einstellungen veränderbar.
- Testanmeldung `limba` / `demo`, zusätzlich **nur lokale** Testregistrierung mit gesalzenem PBKDF2-Prüfwert im privaten App-Speicher. Es gibt noch **keine produktive Firebase-Anbindung für Android**.
- Lokale Fahrzeugerfassung mit umfassendem Steckbrief inklusive Unfallstatus (`yes`, `no`, `unknown`), Zustandsnotiz und Fahrzeugbeschreibung. Private Testanzeigen erscheinen in Suche, «Meine Inserate» und Swipe und können gelöscht werden. Sie werden nicht ins Internet hochgeladen oder zwischen Geräten synchronisiert.
- Diese APK ist debug-signiert. Zur späteren echten Veröffentlichung sind Firebase-Android-Konfiguration, Authentifizierung, Storage und ein sicherer dauerhafter Release-Key notwendig.