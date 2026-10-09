# Verbindliche Integrationsübersicht

Stand 08.10.2026. Authentifizierter Zugriff auf r75p / Mandant 708 bestätigt (HTTP 200). Alle 18 EntitySets sind laut aktuellem Katalog nur lesbar. Organisationscode K6 und Materialpräfix KK wurden anhand der Spielregeln und gefilterten Daten verifiziert. Zugangsdaten liegen ausschließlich als geschützte Server-Geheimnisse vor.

| Funktion                   | Vorbereitete Implementierung                                             | Noch erforderlicher Nachweis                                                  |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Sales, Markt, Bestände     | Authentifiziert geprüft: 351 Sales-Zeilen, globale Marktperiode 16 (T76–80), 22 Lagerpositionen, 24 Preise | Laufender Simulationsbetrieb und Wechsel der Spielinstanz |
| Finanzbuchungen            | 920 Buchungen; SIM_ROUND/STEP und FS_LEVEL_1 geprüft; Bank und GuV gegen Company_Valuation abgeglichen | Eindeutige Kennzeichnung von Abschlussbuchungen |
| Lieferantenangebote        | Zehn Angebote; PRICE, Einheit und Lagerort gegen aktuelle Stammdaten geprüft | Bestellberechtigung und Verarbeitung über einen Schreibendpunkt |
| Produktionsaufträge        | 38 Aufträge mit Beginn, Ende, Zielmenge und bestätigter Menge gelesen | Material- und Kapazitätsprüfung für verbindliche Empfehlungen |
| Bestellverfolgung          | 48 gelieferte Positionen gelesen; ROW_ID bleibt eindeutig; gelieferte Positionen sind keine offenen Zugänge | Teilwareneingänge und neue Bestellung bis zum Eingang durchgängig prüfen |
| Marketingplan              | Matrix, Entwürfe und Differenzberechnung                                 | Aktueller vollständiger Plan, Wirksamkeitstag, Schreib- und Abgleichendpunkt  |
| Liquiditätsplanung         | Resttage, kumulierte Differenz und Szenario                              | Offizielle vollständige Planquelle, Periodengrenzen und enthaltenes Marketing |
| Kanalpreise schreiben      | Gleichzeitige Entwürfe und Sammelprüfung                                 | Schreibvertrag, CSRF/Session, Versionsschutz und Rücklesen                    |
| Zusatzbestellung           | Exakte zusätzliche Eingabe, Kosten, Prüfung, sichere Aktionslogik        | Endpunkt, Zusatzmengenbedeutung, ERPsim-Verarbeitung, SAP-Beleg und Lieferung |
| Reservierungen/Kapazitäten | Kapazitäten aus Current_Game_Rules; Kategorien und Einheiten gegen Current_Inventory geprüft | Reservierungsquelle fehlt; RESTRICTED wird nicht als reserviert interpretiert |
| Teamversion                | Private Site und serverseitige Authentifizierung                         | Gewünschte Teammitglieder und Einladung/Freigabe                              |

## Abnahme einer Schreibfunktion

Die aktuelle Marktperiode ist global nummeriert: Runde 4 / Periode 16 bedeutet T76–80. Die Rundenlänge 20 wurde aus `SIM_ELAPSED_STEPS`, `SIM_ROUND` und `SIM_STEP` abgeglichen. Im aktuellen Katalog verwenden Finanzbuchungen `SIM_ROUND/STEP` statt der alten `SIMULATION_*`-Feldnamen; Lieferantenangebote verwenden `PRICE`. Diese Unterschiede sind ausdrücklich konfiguriert beziehungsweise rückwärtskompatibel berücksichtigt.

1. Tatsächlichen Endpunkt und Berechtigung im aktuellen Mandanten nachweisen.
2. Stammdaten, Payload, Pflichtfelder, CSRF, Sitzung und Versionsprüfung dokumentieren.
3. Bei Einkauf mit einer ausdrücklich vereinbarten Testmenge nachweisen: Eingabe = zusätzliche SAP-Bestellmenge. Keine automatische MRP-Verrechnung. ERPsim muss die Bestellung verarbeiten.
4. SAP-Referenz und Ergebnis jeder Position auswerten. Teilerfolge nicht als Gesamterfolg anzeigen.
5. Übertragungsunterbrechung testen: Status bleibt unklar bis zum Lesen und Zuordnen des vorhandenen Belegs. Kein blindes Wiederholen.
6. Bei Marketing die neue Basis erneut laden und bestätigte Entwurfsfelder abgleichen. Bereits enthaltenes Marketing nicht doppelt abziehen.
7. Erst danach Adapter registrieren, Fähigkeit serverseitig freischalten und durchgängige Abnahme durchführen. Die aktuelle Fähigkeitsermittlung muss dann die registrierten Nachweise verwenden.

## SAP-Helfer

Ein Browser- oder Desktop-Helfer könnte vorhandene SAP-Dialoge bedienen. Dafür wären eine aktive Sitzung und ein laufender Rechner oder Browserdienst nötig; Oberflächenänderungen, Sitzungsablauf und unklare Speicherergebnisse müssten zusätzlich beherrscht werden. Diese Anwendung ergänzt keinen solchen Helfer. Eine geprüfte serverseitige SAP-API vermeidet den dauerhaft laufenden Team-PC. Der OData-Lesedienst allein ersetzt nicht die fehlenden Schreibfunktionen.
