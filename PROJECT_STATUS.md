# PROJECT_STATUS – Computer Shop Tycoon (Phase 3)

Stand: 25.10.2026. Grundlage war der entpackte Ordner `computer-shop-tycoon-phase2` (kein ZIP; die Originaldateien liegen unverändert in
`backup-original-phase2.zip`). Alle Änderungen wurden direkt im bestehenden Projekt gemacht (gleiche Architektur: eigener WebGL2-Renderer,
reines JavaScript/HTML/CSS, keine externen Bibliotheken).

## Zusammenfassung

Der zentrale Spielablauf ist vollständig spielbar und automatisch getestet:
Hardware bei Lieferanten bestellen → Lieferzeit abwarten (Kunden bedienen, Aufträge) → Lager verwalten → PC mit Kompatibilitätsprüfung
zusammenbauen → starten, diagnostizieren, Benchmark → PC verkaufen oder Kundenauftrag (Neubau, Reparatur, Aufrüstung, Vorbestellung,
Garantiefall) erledigen → Geld und Ruf verdienen → Lager, Werkstatt und Laden ausbauen → neue Lieferanten, Kunden und Aufträge.
Die gesamte Oberfläche und alle Spieltexte sind auf Deutsch.

**Nicht auf einem echten iPhone getestet** (kein Gerät vorhanden). Alle Browser-Tests laufen in Headless-Chrome mit Software-Rendering
und iPhone-ähnlicher Bildschirmgröße/Touch-Emulation. Siehe „Bekannte Einschränkungen“.

## Umgesetzte Funktionen (nach Aufgabenbereich)

**A. Lieferanten, Einkauf, Lieferungen** (`suppliers.js`, `ui-shop.js`)
- 5 erfundene Lieferanten (Eckhardt Computerhandel, NordComp Großhandel, BitWelt Distribution, BlitzVersand Express, Premium Parts AG) mit
  unterschiedlichen Preisen, Versandkosten, Lieferzeiten, Sortimentsstufen, Tagesvorräten (manche Produkte sind an einzelnen Tagen ausverkauft),
  Mindestbestellwert und Freischaltung nach Ladenstufe.
- Warenkorb je Lieferant, fertige Teile-Sets, Preisvergleich aller Lieferanten je Produkt, Sortieren/Filtern (Kategorie, Hersteller, Preis, Leistung,
  Name, Verfügbarkeit, „nur lieferbar“).
- Bestellung bucht sofort ab (alles oder nichts), Status bestellt → unterwegs → geliefert (oder storniert / wartet auf Lagerplatz),
  Fortschrittsanzeige, Stornierung vor dem Versand (Versand wird nicht erstattet). Doppelte Lieferung und doppelte Abbuchung sind ausgeschlossen
  (Statuswechsel vor dem Einlagern, Buchungskennungen).
- Klare Fehlermeldungen: zu wenig Geld, ausverkauft, nicht im Sortiment, Lager voll, Mindestbestellwert, gesperrter Lieferant.

**B. Lager** (`inventory.js`): Lagerkapazität (Ausbau), Reservierungen (Vorbestellungen), freier Bestand getrennt vom reservierten, nie negativ,
Anzeige von Bestand/reserviert/unterwegs/Wert.

**C. Kunden** (`customers.js`, `ui-counter.js`): 7 Kundentypen (nach Ladenstufe), laufen als animierte Figuren durch den Laden (Eingang → Stöbern →
Schlange → Kasse → Ausgang), Wünsche: konkretes Teil, Beratung (Budget + Leistungsstufe), fertiger PC, Aufträge. Kaufentscheidung hängt von Preis
im Vergleich zum Listenpreis, Budget, passendem Produkt/Alternative, Wartezeit, Ladenstufe, Ausbau und eingeschalteten Ausstellungs-PCs ab.
Der Preis wird per Regler gewählt; die Kaufchance und der Gewinn werden angezeigt. Kunden können kaufen, ablehnen, gehen (Geduld, voller Laden)
und hinterlassen Bewertungen, die den Ruf verändern. Vorbestellung mit 20 % Anzahlung, wenn das Teil nicht vorrätig ist.
Rückkehrer: Kunden, denen ein PC verkauft wurde, kommen später für Aufrüstung oder Garantiefall wieder.

**D. Hardware-Datenbank** (`data-*.json`): 62 Produkte (Phase 2: 51; 11 neu), u. a. NVIDIA RTX 3060/4060/4070/4070 Super/4080 Super/4090,
AMD RX 7600/7700 XT/7800 XT/7900 XTX, Intel Core i3/i5/i7/i9, AMD Ryzen 5/7/9, Mainboards ASUS/MSI/Gigabyte/ASRock, RAM Corsair Vengeance/Kingston Fury,
SSDs Samsung 990 PRO/WD_BLACK SN850X/Crucial/Kingston, Netzteile Corsair/be quiet!/Seasonic, Kühler Noctua/Arctic/Thermalright/DeepCool,
Gehäuse NZXT/Fractal/Lian Li/Corsair, Lüfter. Datenstatus: **10 geprüft, 9 teilweise, 43 ungeprüft** (Phase 2: 10/9/32). Die neuen Produkte sind
ausdrücklich als ungeprüft (allgemeines Herstellerwissen) gekennzeichnet; unsichere Felder stehen in `unsure`. Preise und Leistungswerte sind Spielwerte.

**E. PC-Zusammenbau** (`builder.js`, `ui-bench.js`): 9 Plätze (Gehäuse, Mainboard, CPU, Kühler, RAM, GPU, bis 3 SSDs, Netzteil, bis 4 Zusatzlüfter).
Geprüft werden: Sockel, Speichertyp/-menge/-plätze, Formfaktor, GPU-Länge, Kühlerhöhe/Radiatorplatz/Sockel, Netzteil (PCIe-8-Pin, EPS, SATA, Leistung),
M.2-/SATA-Plätze. Unverträgliche Teile sind in der Auswahl gesperrt und erklärt; Warnungen für knappes Netzteil, schwache Kühlung, wenig RAM.
Vorschlagsfunktion „Passende Teile aus dem Lager“. Der Werkbank-PC im 3D-Laden zeigt die gewählten Teile (Gehäusefarbe, Mainboard, RAM-Riegel,
GPU-Länge, Luft-/AiO-Kühler, Lüfter, RGB-Beleuchtung beim Betrieb).

**F. Start, Diagnose, Benchmark** (`sim.js`): animierter Startvorgang mit Schritten, Erkennung fehlender Teile, Defekte (defekt/locker/verstaubt),
BIOS-Update-Regel (Spielregel für H610 + Intel 14. Generation), Benchmark mit Gaming-/Büro-Wert, geschätzten FPS, Temperaturen, Drosselung,
Stromverbrauch, Absturz bei zu schwachem Netzteil, Hinweise. Mit dem Diagnose-Messgerät (Ausbau) werden alle Fehler aufgelistet.
Alle Werte sind als „Spielsimulation“ gekennzeichnet.

**G. Aufträge** (`jobs.js`): PC-Neubau (6 Vorlagen nach Ladenstufe, Budget, Mindestleistung/RAM/Speicher, Marke, RGB, Pflichtgrafikkarte),
Reparatur (1–2 Defekte, Ersatzteile werden zum Verkaufspreis bis zu einer Obergrenze berechnet), Aufrüstung (Ziel garantiert mit bezahlbarer Grafikkarte
erreichbar), Garantiefall, Vorbestellung. Fristen, Auftragsplätze (Ausbau/Ladenstufe), Bewertung (4–5 ★), Ruf-Strafen bei Fristablauf/Abbruch.

**H. Wirtschaft** (`economy.js`, `progression.js`): Startgeld 2.500 €, ein Spieltag = 5 Minuten, tägliche Miete (steigt mit Ladenstufe und Ausbau),
Rückstand mit Ruf-Strafe, Notfall-Kleinkredit und einmalige Familienhilfe in echter Notlage (gegen Sackgassen), Tagesabschluss, Finanzübersicht (Tageswerte, 7-Tage-Diagramm, Aufschlüsselung nach
Kategorie, Verkaufsverlauf, Buchungen), Tagesereignisse (Preisaktion, Knappheit, Kundenansturm, Regen, Streik, Gamer-/Schüler-Tag), 12 Ausbauten
(Lager, Werbung, Werkzeug, zweite Kasse, Zusatzregale, Messgerät, Ambiente, Online-Shop, Werkstatt, Ladenerweiterung; teils sichtbar im 3D-Laden).

**I. Fortschritt**: 5 Ladenstufen (Ruf), neue Lieferanten/Kundentypen/Auftragsarten je Stufe, 20 Ziele mit kleinen Prämien, Tutorial mit 7 Schritten.

**J. Grafik/Atmosphäre** (`engine.js`, `world.js`, `audio.js`): Deckenlampen als Punktlichter, farbige Zusatzlichter (RGB-PC, Bildschirme),
Glanzlichter, prozedurale Muster (Fliesen, Teppich, Holz, Metall, Wandpaneele), weiche Abblendung, Raumabschattung, einfache Schatten unter Kunden,
Beschilderung (Textschilder aus Canvas), Lieferstapel nach Lieferungen, animierte Kunden, ausbauabhängige Dekoration. Klänge per Web Audio
(Klick, Kauf, Verkauf, Lieferung, Türglocke, Start-/Fehlertöne, Lüfterrauschen), Lautstärke/Ein-Aus einstellbar. Grafikqualität steuert Auflösung
und Anzahl der Lichter. Keine externen Modelle/Texturen/Sounds (nichts zu lizenzieren).

**K. Oberfläche**: Hauptmenü, Pause, Einstellungen, Spielanleitung, Büro (Einkauf, Lager, Bestellungen, Aufträge, Finanzen, Ausbau, Ziele),
Werkbank, Kasse, Tagesabschluss. Große Touch-Ziele, Hoch- und Querformat, Tabs als Raster auf schmalen Bildschirmen.

**L. iPhone/Browser**: Touch-Joystick und Wischen (unverändert), Pause und Speichern beim App-Wechsel, Schutz vor Zoom-Gesten, Wiederherstellung nach
Verlust der WebGL-Grafik (Speichern + Neuladen), Service Worker (Offline-Start, getestet), Start unter Unterpfad (getestet).

**M. Speichern**: Version 3; Migration von Version 1 und 2 getestet; Bereinigung beschädigter Werte in jedem Modul; Sicherungskopie;
Export/Import als Text; Buchungskennungen gegen doppelte Buchungen; Spielstart wartet auf geladene Hardwaredaten (sonst gingen Teile verloren).

## Tests (Stand der letzten Ausführung)

Aufruf: `node tests/run-all.js --browser` (siehe `README.md`).

| Test | Art | Ergebnis |
| --- | --- | --- |
| `tests/core.test.js` – Geld, Lager, Lieferanten, Zusammenbau, Simulation, Ausbau | automatisch (Node) | 35 / 35 |
| `tests/game.test.js` – Kunden, Aufträge, Verkauf, Zufalls-Invarianten (1000 Aktionen) | automatisch (Node) | 24 / 24 |
| `tests/save.test.js` – Migration, Sicherung, Runde Speichern/Laden | automatisch (Node) | 11 / 11 |
| `tests/extra.test.js` – Ereignisse, Ziele, Beratung, Garantie, Auftrags-Lösbarkeit, Auto-Auswahl, Notlage | automatisch (Node) | 22 / 22 |
| `tests/assets.test.js` – Dateireferenzen, Groß-/Kleinschreibung, Offline-Cache | automatisch (Node) | 7 / 7 |
| `tests/localization.test.js` – Suche nach englischen Texten (HTML, Code, Produktdaten) | automatisch (Node) | keine Funde (Texte zusätzlich von Hand durchgesehen) |
| `tests/sim-bot.js` – Wirtschaftssimulation mit Bot (25–40 Tage) | automatisch (Node) | Invarianten halten; Bot ist schwächer als ein Mensch |
| `tests/browser/smoke.js` | Headless-Chrome | bestanden, keine Konsolenfehler |
| `tests/browser/flow.js` – kompletter Spieldurchlauf über die Oberfläche (Hoch-/Querformat) | Headless-Chrome | je 32 / 32 |
| `tests/browser/flow2.js` – Teileverkauf mit Preisregler, Vorbestellung, Neubau-Auftrag, Reparatur an der Werkbank, Stornierung, Kleinkredit, Ziele | Headless-Chrome | 26 / 26 |
| `tests/browser/regression.js` – Steuerung (Tastatur, Touch), Interaktionen, Migration v1/v2, Sicherung, Unterpfad, Neues Spiel, Grafikverlust, Offline | Headless-Chrome | 32 / 32 |
| `tests/browser/soak.js` – 12 Spieltage im Browser | Headless-Chrome | bestanden (Logik ~0,07 ms je Spielsekunde) |
| `tests/browser/menus.js` – Menüs in 3 Bildschirmgrößen | Headless-Chrome | bestanden |

Die Tests der Phase 2 (32 Logik-, 46 Browser-Tests) lagen nicht im hochgeladenen Ordner und konnten daher nicht erneut ausgeführt werden; ihre Prüfungen (Geld, Lager, Speichern, Menüs, Steuerung, Unterpfad-Start, Offline) sind in den neuen Tests abgedeckt.

Zusätzlich wurden Screenshots aller wichtigen Bildschirme (Hoch- und Querformat) angesehen (`tests/browser/states.js`, `visuals.js`).
**Nicht** getestet: echtes iPhone/Safari, Tonausgabe (Headless-Chrome läuft stumm), Dauerleistung auf Mobilgeräten.

## Bekannte Einschränkungen und Fehler

- Keine Prüfung auf echter iPhone-Hardware: Bildrate, Speicher, Hitze, Safari-spezifische Eigenheiten sind unbekannt. Die Grafik (viele Lichter pro Pixel) ist
  über „Grafikqualität“ skalierbar (Niedrig = 3 Lampen, keine Zusatzlichter, geringere Auflösung).
- Töne sind nur programmiert, aber nicht gehört/abgestimmt. Auf dem iPhone beginnt der Ton erst nach der ersten Berührung (Start-Knopf).
- Die 3D-Grafik besteht aus Quadern; es gibt keine echten Schatten oder Spiegelungen (nur Glanzlichter und einfache Bodenschatten bei Kunden).
- Kompatibilitätsregeln beruhen nur auf den vorhandenen Datenfeldern. Nicht modelliert: 16-Pin-Stromanschluss (Daten fehlen), Netzteil-Formfaktor,
  Laufwerksschächte, geteilte M.2-/SATA-Anschlüsse, Speicherkompatibilitätslisten, echte BIOS-Versionen (die BIOS-Regel für H610 + 14. Generation ist
  eine Spielregel, kein geprüftes Datum).
- 43 von 62 Produkten sind „ungeprüft“ (Daten aus allgemeinem Herstellerwissen). Preise und Leistungswerte sind Spielwerte.
- Kunden weichen einander und dem Spieler nicht aus (feste Wegpunkte). Kunden werden nicht gespeichert (Aufträge, Anzahlungen und Vorbestellungen schon).
- Spieltexte stehen weiterhin in den jeweiligen Modulen (zentrale Begriffe in `Builder.SLOT_NAMES`, `HardwareDB.CATEGORY_NAMES`, `Procurement.STATUS_TEXT`,
  `Economy.CATEGORY_NAMES`); es gibt keine eigene Übersetzungsdatei, weil es nur eine Sprache gibt.
- Die Phase-1-Funktion „Beleuchtung des Test-PCs an/aus“ an der Werkbank ist entfallen (die Werkbank öffnet jetzt die Werkstatt); der Test-PC
  zeigt weiterhin den Demo-Aufbau, solange kein eigener PC gewählt ist. Die Ausstellungs-PCs lassen sich weiter ein-/ausschalten.
- Service Worker (Offline) funktionieren nur über HTTPS oder `localhost`.

## Offene Ideen / nächste Schritte

1. Test auf echten iPhones (Bildrate, Touch-Gefühl, Ton, Speicherverbrauch) und danach Feinabstimmung von Qualitätsstufen.
2. Geprüfte Produktdaten für die 43 „ungeprüften“ Einträge (Quellen) und Ergänzung des 16-Pin-Anschlusses.
3. Echte Schatten (Schattenkarte) oder gebackene Beleuchtung; Modelle/Texturen, falls lizenzfreie Quellen vorliegen.
4. Kunden-Ausweichverhalten, mehr Kundendialoge, weitere Auftragsarten (z. B. Firmenkunden mit mehreren PCs).
5. Feineinstellung der Wirtschaft nach Rückmeldungen von Spielern (Miete, Preise, Ruf-Gewinne sind zentral in `progression.js`, `suppliers.js`, `customers.js`).

## Wichtige Dateien

`README.md` (Start/Tests), `PROJECT_STATUS.md` (dieses Dokument), `tests/` (alle Tests), `sw.js` (bei Dateiänderungen `VERSION` erhöhen).
