# ERPsim Cockpit

Geschützte deutschsprachige Webanwendung für **Manufacturing Extended**. Sechs Arbeitsbereiche bündeln Sales, Marketing und Liquidität, Marktpreise, Bestände und Finanzen, Einkauf und Produktion.

## Aktueller Stand

Die vollständige Oberfläche, nachrechenbare Auswertungen, persönliche D1-Entwürfe, Quellenstatus und API-Zugriffsschutz sind implementiert. Das Cockpit zeigt **ausschließlich bestätigte SAP-Daten**. Ohne erfolgreiche Verbindung bleiben Kennzahlen und Tabellen leer; der konkrete Ladehinweis bleibt sichtbar. Bei späteren Ausfällen bleibt nur der letzte echte SAP-Datenstand mit Warnung erhalten. Beispieldaten und der bisherige Rückfallmodus wurden vollständig aus der Anwendung entfernt.

Die authentifizierte Prüfung am 08.10.2026 war erfolgreich: `https://r75p.ucc.cloud/odata/708/` liefert HTTP 200 und 18 EntitySets. Unternehmenscode **K6** ist anhand der Materialstammdaten dem Präfix **KK** zugeordnet. Sales, Marktpreise, aktuelle Preise, historische und aktuelle Bestände, Finanzbuchungen, Lieferantenangebote sowie Produktions- und Einkaufsaufträge sind geprüft. Die Live-Konfiguration wird ausschließlich serverseitig hinterlegt.

**Noch keine vollständige Live-Abnahme:** Aktueller Marketingplan, offizieller Liquiditätsplan und Reservierungen benötigen zusätzliche verifizierte Quellen. Lagerkapazitäten stammen aus den aktuellen Spielregeln. Alle 18 EntitySets sind im Katalog als nicht anlegbar, nicht änderbar und nicht löschbar markiert. Schreibadapter für Marketing, Kanalpreise und direkte Zusatzbestellungen sind noch nicht registriert. Das Aktionssystem ist vorbereitet und getestet; es sendet derzeit keine Buchungen nach SAP. Teamfreigaben müssen nach Benennung der Mitglieder eingerichtet werden. Die veröffentlichte Site bleibt zunächst nur für den Eigentümer zugänglich.

## Bedienung

- **Cockpit:** Umsatz, Absatz oder Rohertrag wählen; Produkt, Region, Vertriebskanal und Zeitraum filtern. Bestätigte Tageswerte, Mittelwert, vorläufiger Tag und Prognose unterscheiden sich. Steigung und Upside stehen unter dem Diagramm.
- **Marketing & Liquidität:** Tagesbudgets nach Produkt und Region bearbeiten; ausgewählte Produktzeilen mit einem Betrag befüllen. Szenario und Periodenplanung reagieren unmittelbar. `0` ist eine bewusste Streichung. „Entwurf speichern“ speichert persönlich; „Änderungen prüfen“ öffnet die Übertragungsprüfung.
- **Markt & Preise:** Kanäle nebeneinander bearbeiten. „Alle Kanäle“ kopiert den ersten Kanalpreis des Produkts. Produktzeile aufklappen für regionale Marktpreise. Der letzte abgeschlossene Marktbericht bleibt beim Neuladen erhalten.
- **Bestände & Finanzen:** Lagerort und Kategorie filtern; Verlauf, Reservierungen, Reichweite und erwartete Zugänge prüfen. Der Finanzreiter zeigt Bilanz, GuV und Buchungszeilen. Es werden keine Finanzbuchungen ausgelöst.
- **Einkauf:** Mehrere Positionen mit exakten **zusätzlichen** Mengen vorbereiten. Der Bestand reduziert diese Eingabe nicht. Angebote bestimmen Material, Lieferant, Einheit und Preis. Bestellung und Wareneingang haben getrennte Bedeutung.
- **Produktion:** Auftragszeitplan, Restmengen und erklärbare Fehlmengenvorschläge ansehen. Maschinenkapazität und Komponenten sind ohne bestätigte Quellen ungeprüft. Die Freigabe bleibt gesondert in SAP.

Entwürfe bleiben bei Lade- und Speicherfehlern im Formular erhalten. Bei Versionskonflikten wird kein neuerer Entwurf überschrieben. „Zurücksetzen“ entfernt lokale Änderungen; anschließend speichern, um auch den gespeicherten Entwurf zu leeren. Ungespeicherte Änderungen werden beim Verlassen einer Arbeitsansicht bewusst bestätigt.

## Lokal starten

Node.js **24** und Git verwenden. Abhängigkeiten sind im Lockfile fixiert.

```sh
npm run install:ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_striped_champions.sql
npm run dev
```

Die Migration genau einmal auf eine neue lokale Datenbank anwenden. Keine bereits angewendeten Migrationen ändern. Der Entwicklungsserver zeigt seine lokale URL an. Die lokale Sites-Anmeldung ist ausschließlich ein Preview-Mock und wird nicht als Produktionsanmeldung ausgeliefert. Die Produktionsversion nutzt die private Sites-Zugriffskontrolle und ChatGPT-Anmeldung.

Für Projekte ohne Sites-Werkzeuge funktioniert `npm run build` direkt. Beim Bearbeiten und Veröffentlichen mit Sites die zugehörigen Setup-, Build- und Workflow-Helfer verwenden. `.sites-runtime/` bleibt lokal und ignoriert.

## SAP sicher einrichten

SAP-Zugangsdaten ausschließlich als **Server-Geheimnisse** in den Site-Einstellungen setzen: entweder `SAP_USERNAME` + `SAP_PASSWORD` oder `SAP_TOKEN`. Keine Passwörter in Chat, Browser-Code, Git, Konfigurationsdateien oder Screenshots eintragen. Anschließend dieselbe Site neu bereitstellen, damit die neue Umgebungsrevision aktiv wird.

Weitere Serverkonfiguration:

| Variable            | Bedeutung                                                                          |
| ------------------- | ---------------------------------------------------------------------------------- |
| `SAP_SERVICE_URL`   | Standard: `https://r75p.ucc.cloud/odata/708/`                                      |
| `SAP_ALLOWED_HOSTS` | Standard: `r75p.ucc.cloud`; explizite Host-Freigabe bei einem Systemwechsel        |
| `SAP_READ_CONFIG`   | JSON-Konfiguration für die tatsächlich geprüften EntitySets und Unternehmensfilter |
| `TEAM_EMAILS`       | Optionale kommagetrennte E-Mail-Freigabe zusätzlich zur privaten Site-Freigabe     |

`config/sap-read-config.example.json` ist **eine Vorlage**, kein Nachweis verfügbarer EntitySets. Entitynamen, Organisationscodes, Rundenlänge, Materialeinheiten und Lagerorte gegen `$metadata` und SAP prüfen. Mit dem Verbindungsdialog kann das Backend den echten Katalog lesen. Keine Frontend-Einstellung kann Schreibfunktionen freischalten.

Die Lesestrecke unterstützt Sales, Inventory, Current_Inventory, Current_Game_Rules, Market, Current_Pricing_Conditions, Current_Suppliers_Prices, Production_Orders, Purchase_Orders und Financial_Postings. Unternehmensfilter sind je Quelle erforderlich. SAP-Paginierung bleibt auf dem freigegebenen Host und Dienstpfad; Umleitungen mit Zugangsdaten werden abgewiesen. Daten verschiedener Spielinstanzen erhalten getrennte Schlüssel. Bei einem Simulationsneustart muss ein neuer eindeutiger `game`-Schlüssel eingerichtet werden; System und Mandant allein identifizieren keinen Spieldurchlauf.

Die aggregierte Verkaufsansicht erwartet derzeit **EUR und ST**. Andere oder gemischte Datenräume werden mit einer verständlichen Fehlermeldung abgewiesen, statt Einheiten oder Währungen falsch zusammenzurechnen. Rohstoffe und Verpackung behalten ihre jeweiligen Einheiten. Die R12-Lieferantenansicht enthält keine dokumentierte Einheit; diese muss in verifizierten Materialstammdaten ergänzt werden.

`Marketing_Expenses` ist ein sparsamer historischer Ausgabenverlauf. Aus einer fehlenden Zeile wird kein bestätigtes Nullbudget und aus historischen Ausgaben kein aktueller Marketingplan. Forderungen/Verbindlichkeiten ersetzen nicht den offiziellen Liquiditätsplan. `Current_Inventory.STOCK` ergänzt die aktuellen Mengen, historische Öffnungsbestände bleiben im Verlauf erhalten. `RESTRICTED` bezeichnet keinen bestätigten Reservierungsbestand. Finanzabschlüsse werden nicht ohne Quellenkennzeichnung behauptet. Die verifizierte Finanzzuordnung verwendet `SIM_ROUND`, `SIM_STEP` und `FS_LEVEL_1`; GuV-Vorzeichen und Bankkonto sind gegen `Company_Valuation` abgeglichen. Marktperioden sind im aktuellen Mandanten global (`marketPeriod: "global"`), nicht je Runde neu beginnend.

## Berechnungen

- **Mittelwert:** letzte fünf vollständig verfügbare abgeschlossene Tageswerte; Zahl der Beobachtungen sichtbar.
- **Trend:** lineare Regression mit realen Tagesabständen aus maximal zehn echten abgeschlossenen Tageswerten. Mindestens drei Beobachtungen; andernfalls Mittelwertprognose.
- **Prognose:** fünf Spieltage, negative Werte auf null begrenzt. Vorläufige und interpolierte Werte sind keine Regressionsbeobachtungen.
- **Upside:** `max(0, Summe der 5 Trendprognosen − 5 × Tagesmittel)`.
- **Marktpreis:** `Summe NET_VALUE / Summe QUANTITY` der letzten abgeschlossenen Marktperiode, je Produkt/Kanal/Region und passender Einheit/Währung.
- **Liquidität:** tägliches neues Marketingbudget minus bisheriges Budget, multipliziert mit den betroffenen Resttagen jeder Periode. Diese Differenz wird kumuliert vom offiziellen Schlussbestand abgezogen. Nach bestätigtem Speichern muss der neue SAP-Plan die Basis ersetzen und der bestätigte Entwurf abgeglichen werden.
- **Reichweite:** vorhandener Bestand / durchschnittlicher eigener Tagesabsatz. Bei fehlenden Verbrauchsdaten unbekannt.
- **Produktionsvorschlag:** erwarteter eigener Fünf-Tage-Bedarf minus bekannter Bestand minus rechtzeitige passende Zugänge. Marktmenge ist Kontext, kein eigener Absatz. Die Betrachtung ersetzt keine tagesgenaue Material- und Kapazitätsplanung.

Spielzeit ist `(Runde − 1) × Rundenlänge + Spieltag`. Inventar, Preise und Marketing tragen teilweise den Folgetag; Verkäufe und Marktberichte bleiben zeitlich getrennt. Historische Lager- und Auftragsstände werden nicht über Zeit summiert. Fehlende Werte bleiben von bestätigten Nullen unterscheidbar.

## Änderungen und API

API-Routen unter `/api` prüfen Anmeldung, Teamfreigabe und bei schreibenden Requests den gleichen Ursprung sowie JSON-Inhalte. Persönliche Entwürfe sind nach Nutzer, Spielinstanz und Art getrennt. Versionierte SQL-Updates verhindern verlorene Änderungen. Die Oberfläche fordert Daten alle 15 Sekunden an; D1-Cache und eine serverseitige Synchronisationssperre bündeln Team-Anfragen. Bei Ausfällen bleibt der letzte vollständige gültige Stand erhalten.

| Route                       | Zweck                                                |
| --------------------------- | ---------------------------------------------------- |
| `GET /api/dashboard`        | Gemeinsamer Datenstand und Ladehinweis               |
| `POST /api/connection`      | Authentifizierten SAP-Katalog prüfen                 |
| `GET/PUT /api/drafts/:kind` | Persönliche Marketing-, Preis- oder Einkaufsentwürfe |
| `GET/POST /api/actions`     | Aktionsprotokoll / geprüften Aktionsauftrag anlegen  |
| `GET /api/actions/:id`      | Status und positionsweise Rückmeldungen              |

`lib/action-engine.ts` behandelt Idempotenz, Basisversionsprüfung, Unternehmenssperre, Teilerfolg und unklare Ergebnisse. Ein unklarer Ausgang bleibt `unknown` und sperrt weitere Unternehmensschreibvorgänge bis zum belegten Abgleich. Bestellungen werden nie blind erneut gesendet. Ein neuer Adapter braucht einen nachgewiesenen Ausführungs- **und Abgleichvertrag**; er wird in `lib/sap-actions.ts` registriert. Aktuell ist dieses Register leer. Noch kein Warteschlangen-Worker und kein Live-Schreibadapter sind freigegeben.

## Prüfung und Bereitstellung

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests prüfen Zahlenlogik, Rundenwechsel, Datenlücken, Nullwerte, gemischte Einheiten/Währungen, Snapshot-Deduplizierung, Versionskonflikte, Idempotenz, Teilerfolge und Abgleich nach unklarem SAP-Ergebnis. SAP-Schreibtests verwenden ausschließlich Testadapter; sie sind kein Live-Nachweis. Browserprüfungen decken Filter, gemeinsame Budgetvorschau, Entwurfsspeicherung, Kanalpreisübernahme und responsive Navigation ab.

Die GitHub-Prüfung führt Tests, Typecheck, Lint und Build aus. Sites stellt die Anwendung privat bereit und verwaltet D1. Das Hostingmanifest enthält nur logische Bindungen und Projektkennung. Ein laufender Team-PC ist für die gehostete Serveranbindung nicht erforderlich. Teamfreigaben bewusst in Sites einrichten; optional zusätzlich `TEAM_EMAILS` setzen. Niemals für eine Vorschau öffentlich schalten.

## Referenzen

- `OData_Reference_Guide_Simulation_Service_R12.pdf`, Revision 12, Stand 18.09.2025.
- `DHBW-HN-WorkshopFertigungsplanung-Mai2026-ODATAservices.pdf`.
- Vom Nutzer bereitgestellte SAP-Screenshots.

Die Originale und das übergeordnete `sources/` bleiben unverändert und werden nicht in dieses Repository kopiert. Projektentscheidungen werden in der zugehörigen salt.md-Projektseite dokumentiert.
