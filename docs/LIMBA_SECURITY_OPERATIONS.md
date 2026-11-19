# Limba Auto sicher ausrollen und betreiben

Produktion ist das Firebase-Projekt `limba-auto` mit Firestore `(default)` und dem Bucket `limba-auto.firebasestorage.app` in Zürich. Web und Android verwenden neue Upload- und Meldefunktionen in `europe-west6`. Die bestehenden Chat- und Suchfunktionen bleiben in `europe-west1`.

## Produktionsstand am 19. November 2026

- Firestore-Regeln, Indizes und fünf Marktplatzfunktionen sind in Zürich produktiv. Der Marktplatz läuft im Pilotmodus. Die Website nutzt serverseitig geprüfte Bilder. Ältere Android-Versionen können vorläufig weiterhin den bisherigen Uploadpfad verwenden.
- Firebase Hosting liefert die CSP. Web App Check stellt auf der Produktionsdomain Tokens aus. Die Erfassung von App-Check-Metriken ist für Firestore, Storage und Authentication aktiv. Die Erzwingung folgt nach der Abnahme der signierten Android-App.
- Für die Registrierung gilt befristet ein Limit von 20 neuen Konten pro IP und Stunde. Die Ausnahme gilt vom 19. bis zum 26. November 2026. E-Mail und Passwort werden zusätzlich im reCAPTCHA-Audit-Modus beobachtet.
- Firestore sichert täglich mit 14 Tagen Aufbewahrung. Point-in-Time Recovery ist aktiviert. Die siebentägige Wiederherstellung gelöschter Storage-Objekte wurde mit einer Testdatei geprüft.
- Das bestehende Monatsbudget von CHF 10 warnt bei 50, 90 und 100 Prozent sowie bei prognostizierten 100 Prozent. Cloud Monitoring erfasst Spitzen bei Quoten und meldet Bereinigungsfehler in der Konsole.
- Die Einrichtung der GitHub-Umgebung und der OIDC-Verbindung erfordert Repository-Administrationsrechte.

## GitHub und Google Cloud verbinden

1. In GitHub die Umgebung `firebase-production` anlegen und Deployments auf `main` beschränken. Für das Repository Branch-Schutz und die Firebase- und Web-Prüfungen als erforderliche Checks konfigurieren.
2. In Google Cloud Workload Identity Federation für `https://token.actions.githubusercontent.com` konfigurieren. `google.subject` auf `assertion.sub` und das Attribut `repository_id` auf `assertion.repository_id` abbilden. Die Zulassung an die IDs, den Branch und die Umgebung binden:

   ```text
   assertion.repository_id == '1461110920' &&
   assertion.repository_owner_id == '250725630' &&
   assertion.ref == 'refs/heads/main' &&
   assertion.sub == 'repo:raiirajet/Luma:environment:firebase-production'
   ```

3. Dem Repository-Prinzipal im Workload-Identity-Pool `roles/iam.workloadIdentityUser` für den Deploy-Service-Account geben. Dieses Konto benötigt Zugriff auf die Firebase Rules API, Firestore-Regeln und -Indizes, Firebase Hosting und Cloud Functions Gen 2. Für `lock-storage` benötigt es zusätzlich lesenden und schreibenden Zugriff auf die Rollout-Konfiguration in Firestore. Das Deployment-Konto benötigt `iam.serviceAccounts.actAs` für die verwendeten Functions-Laufzeitidentitäten. Die Laufzeitidentität der Marktplatzfunktionen braucht Firestore-Datenzugriff und Objektzugriff im Limba-Fotobucket.
4. In GitHub die Umgebungsvariablen `LIMBA_GCP_WORKLOAD_IDENTITY_PROVIDER` (vollständiger Provider-Pfad) und `LIMBA_GCP_DEPLOY_SERVICE_ACCOUNT` (E-Mail des Deploy-Kontos) hinterlegen. Das Workflow-Konto meldet sich per OIDC an. Nach dem erfolgreichen Wechsel kann der bisherige Deploy-Schlüssel ausser Betrieb genommen werden.

## Rollout

| Reihenfolge | Aktion | Abnahme |
|---|---|---|
| 1 | `compare-rules` im Workflow **Limba Firebase production** ausführen | Aktive Firestore- und Storage-Releases vergleichen und ihre Regelversionen für den Rollback festhalten. Eine angezeigte Abweichung vor dem Ersetzen prüfen. |
| 2 | `deploy-backend` mit `LIMBA_ENFORCE_MARKETPLACE_APP_CHECK=false` | Emulatorprüfungen bestehen. Functions deployen zuerst, gefolgt von Firestore-Regeln und Indizes. Der Workflow vergleicht danach die aktiven Firestore-Regeln erneut. Die bisherigen Storage-Regeln bleiben bis Schritt 5 aktiv. |
| 3 | App Check registrieren und `deploy-web` ausführen. Android-Workflow im Modus `signed` starten. | Firebase Hosting liefert die CSP aus. GitHub Pages erhält dieselbe CSP im HTML ohne `frame-ancestors`. Die APK-Signatur stimmt mit dem registrierten Zertifikat überein. |
| 4 | Marktplatz-Modus `pilot` setzen | Neue Web- und Android-Clients verwenden die Prüfstrecke. Mit zwei verifizierten Testkonten Inserate mit sechs Fotos erstellen, bearbeiten, pausieren, reaktivieren, melden und löschen. Gastzugriff sowie Trennung von Inseraten und privaten Daten prüfen. |
| 5 | Nach Abnahme Modus `required` setzen und `lock-storage` ausführen | Firestore verlangt die serverseitige Fotoreservierung und lehnt direkte Meldungen ab. Storage lehnt Client-Schreibzugriffe ab. Der Workflow prüft die aktiven Storage-Regeln und aktiviert die Bereinigung älterer verwaister Bilder. Ältere App-Versionen brauchen ab diesem Schritt ein Update zum Inserieren und Melden. |
| 6 | App Check pro Dienst erzwingen | Nach Sichtprüfung der App-Check-Metriken Firestore, Storage und bei Unterstützung Authentication aktivieren. Für die Callables die Variable `LIMBA_ENFORCE_MARKETPLACE_APP_CHECK=true` setzen und `deploy-backend` erneut ausführen. |

Die Marktplatzmodi und Moderation verwenden die Application Default Credentials eines autorisierten Google-Kontos:

```bash
npm ci --prefix functions
node functions/ops/marketplace.cjs status
node functions/ops/marketplace.cjs mode pilot
node functions/ops/marketplace.cjs mode required
```

Bei einem Problem während des Piloten auf `legacy` zurückschalten. Nach dem Storage-Wechsel zuerst die zuvor erfassten Storage-Regeln wiederherstellen und dann den Marktplatz-Modus zurückschalten. Einen Hosting-Rollback über den Firebase-Hosting-Veröffentlichungsverlauf durchführen. App-Check-Erzwingung pro Dienst und für die Callables getrennt zurücknehmen.

## App Check und Android-Signierung

- In Firebase die Web-App mit reCAPTCHA Enterprise registrieren und die Hosting-Domains für Firebase Hosting und GitHub Pages erlauben. Der öffentliche Website-Schlüssel für Limba ist in `config.js` hinterlegt. Die GitHub-Variable `LIMBA_RECAPTCHA_ENTERPRISE_SITE_KEY` kann ihn in beiden Web-Deployments überschreiben.
- Für `ch.luma.auto` das SHA-256-Release-Zertifikat in Firebase hinterlegen und das Play-Integrity-Projekt verknüpfen. Für einen ausschliesslich ausserhalb von Google Play verteilten APK-Build `Device integrity` als Mindeststufe wählen. Firebase dokumentiert die passenden Einstellungen für kombinierte Verteilung und Google Play.
- Den vorhandenen Release-Keystore für Update-Kompatibilität verwenden und offline sichern. In GitHub `LIMBA_RELEASE_KEYSTORE_B64`, `LIMBA_KEYSTORE_PASSWORD`, `LIMBA_KEY_ALIAS` und `LIMBA_KEY_PASSWORD` als Secrets sowie den erwarteten Fingerabdruck `LIMBA_ANDROID_RELEASE_SHA256` als Variable hinterlegen. Der Workflow vergleicht das APK-Zertifikat vor jeder Veröffentlichung.
- Auf einem unterstützten physischen Android-Gerät die signierte APK samt Anmeldung, Fotos und Meldungen testen. Auf einem autorisierten Testgerät ohne ausreichenden Integritätsnachweis die Ablehnung in Firebase prüfen. Botschutz und normale Nutzung im Browser ebenfalls nach Aktivierung testen. Erst nach der Abnahme den Modus `publish` verwenden.

[Firebase App Check für Web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) · [Android Play Integrity](https://firebase.google.com/docs/app-check/android/play-integrity-provider) · [GitHub OIDC für Google Cloud](https://github.com/google-github-actions/auth)

## Spam und Betrieb

- Pro verifiziertem Konto gelten 6 Inserat-Reservierungen je Stunde und 20 je 24 Stunden, 48 Fotoanfragen je Stunde und 140 je 24 Stunden sowie 8 neue Inseratsmeldungen je Stunde und 25 je 24 Stunden. Fotoanfragen mit ungültigen Inhalten zählen mit. Wiederholte Anfragen für bereits verarbeitete Fotos oder Meldungen bleiben idempotent. Firestore räumt inaktive Zähler per TTL auf.
- Firebase Authentication hat standardmässig ein Registrierungs-Limit von 100 Konten pro IP und Stunde. `scripts/firebase_signup_limit.py` liest den aktiven Override und kann eine niedrigere IP-Quote befristet setzen. Bei anhaltendem Missbrauch reCAPTCHA-Schutz für E-Mail/Passwort in Identity Platform zunächst im Audit-Modus messen und reguläre Registrierungen testen.
- Cloud Logging auf `jsonPayload.message="Marketplace rate threshold reached"` und `jsonPayload.message="Marketplace upload cleanup failed"` überwachen. In Cloud Monitoring einen Alarm für wiederkehrende Fehler der Uploadbereinigung, erhöhte HTTP-5xx-Raten und Firebase-App-Check-Ablehnungen einrichten. Billing-Budget für `limba-auto` mit Warnungen bei 50, 80 und 100 Prozent sowie einem Prognosealarm setzen. Budgetwahl und Alarmempfänger am verbundenen Abrechnungskonto hinterlegen. Das Billing-Budget sendet Benachrichtigungen. Functions begrenzen gleichzeitig laufende Instanzen.
- Tägliche Firestore-Backups für `(default)` mit 14 Tagen Aufbewahrung und Wiederherstellung zu einem früheren Zeitpunkt aktivieren. Storage Soft Delete für sieben Tage prüfen. Einen Firestore-Backupstand in eine neue, zugriffsgeschützte Datenbank wiederherstellen und die Wiederherstellung eines gelöschten Testfotos aus Storage prüfen. Datum, Datenstand und Dauer der Wiederherstellung dokumentieren.

```bash
gcloud firestore backups schedules create --project=limba-auto --database='(default)' --recurrence=daily --retention=14d
gcloud firestore databases update --project=limba-auto --database='(default)' --enable-pitr
gcloud storage buckets describe gs://limba-auto.firebasestorage.app --format='value(soft_delete_policy.retention_duration_seconds)'
gcloud firestore backups list --project=limba-auto --location=europe-west6
```

[Firebase Auth-Limits](https://firebase.google.com/docs/auth/limits) · [Firestore-Backups](https://cloud.google.com/firestore/docs/backups) · [Cloud Billing-Budgets](https://cloud.google.com/billing/docs/how-to/budgets)

## Meldungen moderieren

```bash
node functions/ops/marketplace.cjs reports
node functions/ops/marketplace.cjs review REPORT_ID hold
node functions/ops/marketplace.cjs review REPORT_ID dismiss
node functions/ops/marketplace.cjs release-hold LISTING_ID
```

`hold` pausiert das Inserat und verhindert eine Reaktivierung durch den Verkäufer. Nach `release-hold` kann der Verkäufer es wieder aktivieren. Das CLI-Werkzeug mit einem Konto mit Firestore-IAM-Berechtigung ausführen und meldungsbezogene Daten vertraulich behandeln.
