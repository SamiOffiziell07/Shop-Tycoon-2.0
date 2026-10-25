# Computer Shop Tycoon

Ein begehbarer 3D-Computerladen im Browser (WebGL2, ohne Spiel-Engine und ohne externe Bibliotheken). Du bestellst Hardware bei
Lieferanten, verwaltest das Lager, baust PCs mit Kompatibilitätsprüfung zusammen, testest sie (Spielsimulation), bedienst Kunden,
erledigst Aufträge und baust deinen Laden aus. Die gesamte Oberfläche ist auf Deutsch.

## Starten

Voraussetzung: ein moderner Browser mit WebGL2 (iPhone Safari ab iOS 15, Chrome, Edge, Firefox). Das Spiel besteht nur aus
statischen Dateien; es braucht **keine Installation und keinen Build**. Die Dateien müssen aber über **HTTP(S)** ausgeliefert werden
(nicht per Doppelklick auf `index.html`), weil die Hardwaredaten (`data-*.json`) per `fetch` geladen werden.

**Am Computer** (Node.js ist dafür nicht nötig; irgendein statischer Webserver reicht), z. B. mit Python im Projektordner:

```
python -m http.server 8080
```

Danach `http://localhost:8080/` im Browser öffnen. Mit Node.js geht auch `npx serve` (lädt das Paket `serve` aus dem Internet).

**Auf dem iPhone:** Das Spiel auf einem Webserver bereitstellen (z. B. GitHub Pages; es funktioniert auch unter einem Unterpfad wie
`https://name.github.io/repo/`) und die Adresse in Safari öffnen. Mit „Teilen → Zum Home-Bildschirm“ wird es wie eine App gestartet.
Nach dem ersten Laden ist das Spiel offline startbar (Service Worker). Alternativ im selben WLAN: Server am Computer starten und
`http://<IP-Adresse-des-Computers>:8080/` in Safari öffnen (dann gibt es allerdings keinen Offline-Modus, weil Service Worker
auf dem iPhone eine sichere Verbindung (HTTPS) verlangen).

**Steuerung:** links wischen = gehen, rechts wischen = umsehen, blauer Knopf „E“ = benutzen. Tastatur: W A S D oder Pfeiltasten, E oder
Leertaste. Weitere Hinweise stehen im Spiel unter „Spielanleitung“.

## Tests

Die Tests brauchen Node.js und keine weiteren Pakete (Logik-Tests ab Version 18, Browser-Tests ab Version 22; entwickelt mit Version 24).

```
node tests/run-all.js            # alle Tests ohne Browser
node tests/run-all.js --browser  # zusätzlich die Browser-Tests (benötigt Google Chrome oder Microsoft Edge)
```

Einzelne Tests: `tests/core.test.js`, `tests/game.test.js`, `tests/save.test.js`, `tests/extra.test.js`, `tests/localization.test.js`,
`tests/sim-bot.js` (Wirtschaftssimulation, `node tests/sim-bot.js 25 7` gibt den Verlauf aus) sowie `tests/browser/*.js`
(Rauchtest, Spieldurchlauf, Regression, Dauertest, Screenshots). Die Browser-Tests starten selbst einen Webserver und Chrome/Edge
im Headless-Modus.

## Projektaufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css`, `shop.css`, `game.css` | Oberfläche |
| `engine.js`, `world.js` | WebGL2-Renderer (Licht, Muster, Schilder) und 3D-Laden |
| `controls.js` | Touch- und Tastatursteuerung |
| `game.js` | Spielschleife, Menüs, Verbindung aller Module |
| `economy.js`, `inventory.js`, `progression.js` | Geld, Lager (mit Reservierungen), Tage/Miete/Ausbau/Ruf/Ereignisse |
| `suppliers.js` | Lieferanten, Bestellungen, Lieferungen |
| `builder.js`, `sim.js` | PC-Zusammenbau, Kompatibilität, Start/Diagnose/Benchmark |
| `customers.js`, `jobs.js` | Kunden, Kaufentscheidung, Aufträge |
| `achievements.js`, `tutorial.js` | Ziele und Einführung |
| `ui-*.js`, `audio.js` | Oberflächen und Klänge |
| `storage.js` | Speichern (Version 3, Migration von Version 1 und 2) |
| `data-*.json`, `hardware.js` | Hardware-Datenbank (62 Produkte) |
| `sw.js`, `manifest.json` | Offline-Start (Service Worker) und App-Daten |

Wenn du Dateien änderst, erhöhe in `sw.js` die Zahl bei `VERSION`, damit sich das iPhone die neuen Dateien holt.

## Hinweise zu den Daten

Preise, Leistungswerte, Tests und Benchmarks sind Spielwerte. Technische Daten der Produkte sind teils geprüft, teils aus allgemeinem
Wissen übernommen und im Spiel je Produkt mit dem Datenstatus „geprüft“, „teilweise geprüft“ oder „ungeprüft“ gekennzeichnet.
Hersteller- und Produktnamen gehören ihren Inhabern; es besteht keine Partnerschaft. Die Lieferanten und Kunden sind frei erfunden.
