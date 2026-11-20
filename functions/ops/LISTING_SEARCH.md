# Limba-Inseratesuche im Staging prüfen

Die Firebase-Callable `searchListings` nutzt Firestore als Quelle für Inserate und den aktuellen Veröffentlichungsstatus. Elasticsearch hält einen separaten Index mit öffentlichen Suchfeldern und Ortsmittelpunkten. Der Ortskatalog und die Standortsuche laufen lokal in Firebase. [Ortsdaten und Lizenz](../data/README.md)

## Staging einrichten

1. Ein separates Firebase-Staging-Projekt und einen eigenen Elasticsearch-Serverless-Index in GCP Frankfurt verwenden. Der Staging-Index und die Testkonten enthalten synthetische Daten. [Elastic-Regionen](https://www.elastic.co/docs/deploy-manage/deploy/elastic-cloud/serverless/regions)
2. Das aktuelle Mapping aus dem Projekt erzeugen und damit einen versionierten konkreten Index anlegen. Einen eindeutigen Alias auf diesen Index setzen und das Schreibziel explizit markieren. [Elastic-Mappings](https://www.elastic.co/docs/manage-data/data-store/mapping) · [Elastic-Aliasse](https://www.elastic.co/docs/manage-data/data-store/aliases)

   ```sh
   node -e 'console.log(JSON.stringify({ mappings: require("./functions/listing-search").listingSearchMappings }, null, 2))'
   ```

3. `LIMBA_ELASTIC_URL` mit dem Elasticsearch-HTTPS-Endpunkt in der Shell und in der Firebase-Umgebung setzen und `LIMBA_ELASTIC_ALIAS` mit dem Alias konfigurieren. Der Standardalias lautet `limba-listings`. In Firebase Secret Manager `LIMBA_ELASTIC_READER_KEY` mit `read` und `LIMBA_ELASTIC_WRITER_KEY` mit `read` und `index` für den Alias hinterlegen. `LIMBA_SEARCH_CURSOR_KEY` ist ein eigener Zufallswert mit mindestens 32 Bytes. [Elastic-Indexrechte](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/elasticsearch-privileges) · [Firebase-Funktionssecrets](https://firebase.google.com/docs/functions/config-env#secret-manager)
4. `searchListings`, `syncListingSearch` und `reconcileListingSearch` für das Staging-Ziel bereitstellen. Die erste Synchronisierung läuft in Batches von 150 Firestore-Dokumenten. In `listingSearchState/<alias>` protokolliert `sourceAfter` die aktuelle Position und steht nach einem vollständigen Durchlauf auf `null`. Der Indexabgleich prüft zusätzlich sichtbare Suchtreffer auf inzwischen entfernte Firestore-Dokumente.
5. Für das Staging `marketplaceRelease/v1_9.searchEnabled` aktivieren und den untenstehenden Lauf ausführen. Treffer, Umkreise, Cursorablauf und zurückgezogene Inserate auch auf Web und der signierten Android-Testversion prüfen. Mit den freigegebenen Zugangsdaten kann die Produktion später über den manuellen Workflow-Schritt `deploy-search` vorbereitet werden. Das Such-Flag wird erst nach geprüftem Index und Abnahme gesetzt.

Bei geändertem Mapping oder aktualisiertem Ortskatalog einen neuen konkreten Index mit eigener Staging-Alias-ID füllen und prüfen. Beim Umschalten zeigt der öffentliche Alias auf genau einen Index. [`search_after` und Point-in-Time](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)

Ändert sich der Preis eines Inserats während einer Preissortierung, erscheint es mit seiner neuen Position bei der nächsten Suche. Zurückgezogene Inserate werden bei jeder geladenen Seite ausgeblendet. Die App bietet bei abgelaufenem Cursor eine neue Suche an.

## Lastlauf und Kosten

Der lokale Lauf prüft mit 1’000 synthetischen Inseraten und 100 Suchsitzungen die komplette Seitennavigation und vier typische Kombinationen aus Teilstring, Zahlenfiltern, Sortierung und Radius. Er meldet vollständige Trefferabdeckung, Latenz und Durchsatz für die lokale Implementierung mit Testdaten im Speicher.

```sh
node functions/ops/benchmark-listing-search.cjs
```

Für einen lokalen Lauf am echten Suchindex einen isolierten Elasticsearch-Knoten auf `127.0.0.1` starten. `--loopback` legt einen temporären Index an, lädt die Daten mit demselben Mapping wie Staging und löscht diesen Index am Ende. Der Lauf verwendet dabei Firestore-Testdaten im Arbeitsspeicher. Falls der lokale Knoten API-Key-Authentifizierung nutzt, `LIMBA_BENCHMARK_LOOPBACK_API_KEY` in einer sicheren lokalen Umgebung bereitstellen.

```sh
LIMBA_BENCHMARK_ELASTIC_PORT=9200 node functions/ops/benchmark-listing-search.cjs --loopback
```

Der Staging-Lauf legt 1’000 öffentliche synthetische Inserate in einem frischen, eindeutigen Namensbereich an und entfernt genau diese neu geschriebenen Dokumente am Ende. Ein isoliertes Projekt mit `-staging` im Projektnamen, auf dieses Projekt beschränkte Application Default Credentials und ein gültiges App-Check-Token der Staging-App sind erforderlich. Sessionzahl und parallele Worker lassen sich über `LIMBA_BENCHMARK_SESSIONS` und `LIMBA_BENCHMARK_WORKERS` anpassen.

```sh
LIMBA_BENCHMARK_STAGING_PROJECT=limba-search-staging \
  node functions/ops/benchmark-listing-search.cjs --staging
```

`LIMBA_BENCHMARK_APP_CHECK_TOKEN` vorab aus einer sicheren lokalen Umgebung bereitstellen. Der Lauf nutzt die Zürich-Callable und erfasst die Zeit bis zur vollständigen Trefferabdeckung nach dem Schreiben, p50, p95, Maximum und Durchsatz. Verzögerte Indexierung kann zusätzliche Abfragen auslösen. Den Lauf durch einen zweiten Test für öffentlich sichtbare Daten, Cursorablauf und Rückzug während laufender Seiten ergänzen.

Für eine Kostenschätzung zuerst die Basislast des Staging-Index messen. Anschliessend Beginn und Ende des Lastlaufs sowie Anzahl Suchaufrufe, Inseratsänderungen und geschriebene Daten erfassen. Im Elastic-Bericht Search- und Ingest-VCU-Stunden, Indexgrösse und ausgehenden Traffic ablesen. Im Google-Cloud-Bericht Firestore-Lese- und Schreibvorgänge, Functions-Aufrufe und Laufzeit sowie ausgehenden Traffic einbeziehen. Mit der erwarteten Monatslast und den Preisen der Zielregion hochrechnen. Volumen über mehrere repräsentative Zeitfenster messen, da Schreiblast, Kurzanfragen, Tiefe der Seitennavigation und regionaler Datentransfer die Rechnung beeinflussen. [Elastic-Serverless-Preise](https://www.elastic.co/pricing/serverless-search/) · [Firebase-Preise](https://firebase.google.com/pricing)
