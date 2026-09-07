# Bibelraum

Bibelraum ist eine vollständig lokale Leseoberfläche für die deutschen
OpenLP-Bibelmodule aus `OpenLP-Bibeln-DE-2026-09-07.zip`. Die Originaldateien im
Archiv bleiben unverändert. Beim ersten Start werden alle Übersetzungen in eine
gemeinsame, für die Web-App optimierte SQLite-Datenbank importiert.

## Funktionen

- 66 Bücher mit Buch- und Kapitelauswahl
- alle 11 enthaltenen deutschen Übersetzungen
- Parallelansicht für bis zu drei Übersetzungen
- Suche innerhalb der gewählten Übersetzung
- Navigation zum vorherigen und nächsten Kapitel, auch mit den Pfeiltasten
- direkte, kopierbare Stellen-URLs
- responsive Oberfläche für Desktop, Tablet und Smartphone
- optionaler Dark Mode, dessen Auswahl lokal gespeichert wird
- keine Cloud, kein Konto und keine Veränderung der Quelldateien

## Schnellstart

Voraussetzung ist Node.js 22.5 oder neuer. Das ZIP-Archiv liegt standardmäßig
direkt über diesem Ordner, so wie es in diesem Repository bereits der Fall ist.

```bash
cd webapp
npm install
npm run build
npm start
```

Danach ist Bibelraum unter [http://localhost:4174](http://localhost:4174)
erreichbar. Der erste Start dauert einige Sekunden, weil die App das Archiv
einmalig einliest. Die erzeugte Datei liegt unter `webapp/data/bibelraum.sqlite`
und wird nicht in Git aufgenommen. Ändert sich das Archiv, wird sie beim nächsten
Start automatisch neu aufgebaut.

Für die Entwicklung starten Frontend und API gemeinsam:

```bash
npm run dev
```

Die Entwicklungsoberfläche läuft dann unter
[http://localhost:5173](http://localhost:5173).

## Eigene Pfade verwenden

Archiv, Datenbank und Port können über Umgebungsvariablen gesetzt werden:

```bash
BIBLE_ARCHIVE="/pfad/meine-bibeln.zip" \
BIBLE_DB="/pfad/bibelraum.sqlite" \
PORT=8080 \
npm start
```

## Projektstruktur

```text
webapp/
├── server/          Node.js-/Express-API und SQLite-Import
├── src/             React-Oberfläche
├── data/            lokal erzeugte App-Datenbank (von Git ignoriert)
├── index.html
└── vite.config.ts
```

Nützliche Prüfungen:

```bash
npm test
npm run typecheck
npm run build
```

## Hinweise zu den Texten

Die Bibeltexte selbst werden nicht in diesem Git-Repository hinzugefügt. Für
Nutzung und Weitergabe gelten die Rechte und Vereinbarungen der jeweiligen
Herausgeber; siehe auch die Hinweise im Archiv.
