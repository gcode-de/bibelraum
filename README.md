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

## Docker Hub und Portainer

Das Repository enthält ein mehrstufiges, nicht als `root` laufendes Docker-Image
und eine GitHub-Actions-Pipeline. Das Bibelarchiv ist bewusst nicht Bestandteil
des Images: Es wird auf dem Homelab-Server schreibgeschützt eingebunden, während
die importierte Datenbank in einem Docker-Volume erhalten bleibt.

### 1. Docker Hub vorbereiten

Auf Docker Hub ein Repository namens `bibelraum` erstellen und unter
**Account settings → Personal access tokens** einen Token mit Schreibzugriff
anlegen.

Im GitHub-Repository unter **Settings → Secrets and variables → Actions** diese
Repository-Secrets hinterlegen:

- `DOCKERHUB_USERNAME`: Docker-Hub-Benutzername
- `DOCKERHUB_TOKEN`: der gerade erzeugte Access Token

Ein Push auf `master`, ein Tag wie `v1.0.0` oder ein manueller Start unter
**Actions → Docker image → Run workflow** baut und veröffentlicht das Image.

### 2. Archiv auf dem Docker-Host ablegen

```bash
sudo mkdir -p /opt/bibelraum
sudo cp OpenLP-Bibeln-DE-2026-09-07.zip /opt/bibelraum/
sudo chmod 644 /opt/bibelraum/OpenLP-Bibeln-DE-2026-09-07.zip
```

### 3. Stack in Portainer anlegen

Unter **Stacks → Add stack** den Inhalt der Datei `docker-compose.yml` verwenden
und mindestens diese Umgebungsvariable setzen:

```text
DOCKERHUB_USERNAME=mein-dockerhub-name
```

Optional lassen sich Pfad, Port und Image-Tag anpassen:

```text
BIBLE_ARCHIVE_PATH=/opt/bibelraum/OpenLP-Bibeln-DE-2026-09-07.zip
BIBELRAUM_PORT=4174
BIBELRAUM_TAG=latest
```

Nach **Deploy the stack** ist die Anwendung unter
`http://IP-DES-DOCKER-HOSTS:4174` erreichbar. Bei einem privaten Docker-Hub-
Repository müssen die Docker-Hub-Zugangsdaten zusätzlich unter **Registries**
in Portainer hinterlegt werden.

Für ein Update zuerst die GitHub Action durchlaufen lassen und anschließend in
Portainer beim Stack **Pull latest image** und **Update the stack** wählen.

### Lokaler Container-Build

Vom Wurzelverzeichnis des Git-Repositories aus:

```bash
docker build -f webapp/Dockerfile -t bibelraum:local .
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
