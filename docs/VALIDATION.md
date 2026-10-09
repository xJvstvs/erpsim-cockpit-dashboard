# Prüfstand am 09.10.2026

Die Anwendung enthält keine Beispieldaten mehr. Zusätzlich zu den folgenden 38 Auswertungstests prüfen fünf neue Tests den leeren Zustand beim ersten Verbindungsfehler, konkurrierende Synchronisation, den Erhalt ausschließlich echter SAP-Daten sowie erfolgreiche Speicherung. Insgesamt 43 Tests bestanden. Die produktive SAP-Verbindung wird anhand des echten Verbindungsdialogs und bereinigter Serverdiagnostik geprüft.

- 38 automatisierte Tests bestanden: Prognosen, reale Tagesabstände, Datenlücken, Nullwerte, Marketingdifferenzen, angebrochene Perioden, Rundenwechsel, Snapshot-Zuordnung, Idempotenz, Teilerfolge und unklare Bestellantworten. Zusätzlich: reale Finanzfeldnamen und Bankkonto, globale Marktperioden, aktuelle Mengen ohne erfundene Reservierungen, Kapazitäten mit passenden Einheiten, Lieferantenfeld PRICE und ältere offene Einkaufspositionen.
- 13 lokale API-Prüfungen bestanden: Anmeldung, abgefangene gefälschte Nutzerheader, Ursprungsschutz, JSON-Pflicht, persönliche Speicherung, Versionskonflikte, SAP-Anmeldestatus und Demo-Schreibsperre.
- TypeScript-Prüfung und ESLint ohne Fehler.
- Browser: Nullbudget gespeichert und nach Neuladen wiederhergestellt; Kanalpreis 4,10 gleichzeitig auf beide verfügbaren Kanäle kopiert; Finanzperiode gewechselt; 20.000 KG als exakte Zusatzmenge mit 4.400 EUR Positionswert geprüft.
- SAP-Übertragung im Beispielmodus ist gesperrt. Es wurden keine SAP-Buchungen ausgeführt.
- Desktop-Layout mit 1366 × 900 und Tablet-Layout mit 768 × 1024 geprüft. Ein gefundener Tablet-Überlauf wurde durch korrekte Verkleinerung des Inhaltsbereichs behoben. Tabellen scrollen innerhalb ihrer Container.
- WebMCP: Registrierungen, Schemas und Annotationen kontrolliert; Navigation und sichtbarer Zustand abgeglichen; ungültiger Bereich abgewiesen.

- Authentifizierte OData-Prüfung: 18 EntitySets, elf vollständig geladene Unternehmensquellen (jeweils HTTP 200); Organisationsfilter K6 bestätigt. 12 Verkaufsprodukte, 24 Kanalpreise, 22 Lagerpositionen, zehn Lieferantenangebote und 38 Produktionsaufträge erfolgreich normalisiert. Inventarstand R5/T1, letzter Verkaufstag R4/T20, Marktperiode 16 entspricht T76–80.
- Finanzabgleich mit Company_Valuation bis R4/T20: Bankguthaben 2.073.031,40 EUR und kumuliertes Ergebnis 1.810.177,46 EUR stimmen auf einen Cent überein. Lagerkapazitäten und Einheiten stammen aus Current_Game_Rules und Current_Inventory.
- Der Katalog belegt ausschließlich Lesezugriff. Keine SAP-Buchungen ausgeführt. Marketingplan, Liquiditätsplan, Reservierungen und Abschlusskennzeichnung bleiben als fehlende Quellen sichtbar.

Automatisierte Tests verwenden Beispieldaten und Testadapter. Der zusätzliche authentifizierte Leseabgleich ersetzt keine durchgängige Abnahme von Schreibfunktionen. GitHub-CI prüft neue Commits erneut. Produktionsbereitstellung wird über den Sites-Status geprüft; die produktive private Site wird für diese Abnahme nicht automatisiert aufgerufen.
