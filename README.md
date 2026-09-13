# Das Wort

Das Wort ist eine vollständig lokale Leseoberfläche für die deutschen
OpenLP-Bibelmodule aus `OpenLP-Bibeln-DE-2026-09-07.zip` und dem optionalen
Erweiterungsarchiv `Bibeln-und-Studienkommentare-OpenLP.zip`. Die Originaldateien
bleiben unverändert. Beim ersten Start werden alle Übersetzungen in eine
gemeinsame, für die Web-App optimierte SQLite-Datenbank importiert.

## Funktionen

- 66 Bücher mit Buch- und Kapitelauswahl
- 13 deutsche Übersetzungen, einschließlich BdF und dem veröffentlichten Umfang der NGÜ
- Parallelansicht für bis zu drei Übersetzungen
- Suche innerhalb der gewählten Übersetzung
- Navigation zum vorherigen und nächsten Kapitel, auch mit den Pfeiltasten
- direkte, kopierbare Stellen-URLs
- installierbare Progressive Web App mit Startseite und eigenem App-Icon
- bereits geöffnete Kapitel bleiben über den Offline-Cache verfügbar
- responsive Oberfläche für Desktop, Tablet und Smartphone
- optionaler Dark Mode, dessen Auswahl lokal gespeichert wird
- anpassbare Schriftart, Schriftgröße und Zeilenhöhe mit lokaler Speicherung
- fünf Kommentarwerke mit Quellenprofil und versbezogenem Schnellzugriff
- zuschaltbare Kommentarspalte mit Werkauswahl in der Expertenansicht
- keine Cloud, kein Konto und keine Veränderung der Quelldateien

## Schnellstart

Voraussetzung ist Node.js 22.5 oder neuer. Lege das ZIP-Archiv standardmäßig
direkt in diesem Projektordner ab; es wird von Git ignoriert.

```bash
npm install
npm run build
npm start
```

Danach ist Das Wort unter [http://localhost:4174](http://localhost:4174)
erreichbar. Der erste Start dauert einige Sekunden, weil die App das Archiv
einmalig einliest. Die erzeugte Datei liegt unter `data/das-wort.sqlite`
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
STUDY_ARCHIVE="/pfad/MacArthur-Studienbibel-SLT2000-OpenLP-2026-09-12.zip" \
EXTENDED_ARCHIVE="/pfad/Bibeln-und-Studienkommentare-OpenLP.zip" \
BIBLE_DB="/pfad/das-wort.sqlite" \
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

Ein Push auf `main`, ein Tag wie `v1.0.0` oder ein manueller Start unter
**Actions → Docker image → Run workflow** baut und veröffentlicht das Image.

### 2. Archiv auf dem Docker-Host ablegen

```bash
sudo mkdir -p /opt/bibelraum
sudo cp OpenLP-Bibeln-DE-2026-09-07.zip /opt/bibelraum/
sudo cp MacArthur-Studienbibel-SLT2000-OpenLP-2026-09-12.zip /opt/bibelraum/
sudo cp Bibeln-und-Studienkommentare-OpenLP.zip /opt/bibelraum/
sudo chmod 644 /opt/bibelraum/OpenLP-Bibeln-DE-2026-09-07.zip
sudo chmod 644 /opt/bibelraum/MacArthur-Studienbibel-SLT2000-OpenLP-2026-09-12.zip
sudo chmod 644 /opt/bibelraum/Bibeln-und-Studienkommentare-OpenLP.zip
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
STUDY_ARCHIVE_PATH=/opt/bibelraum/MacArthur-Studienbibel-SLT2000-OpenLP-2026-09-12.zip
EXTENDED_ARCHIVE_PATH=/opt/bibelraum/Bibeln-und-Studienkommentare-OpenLP.zip
BIBELRAUM_PORT=4174
BIBELRAUM_TAG=latest
```

Nach **Deploy the stack** ist die Anwendung unter
`http://IP-DES-DOCKER-HOSTS:4174` erreichbar. Bei einem privaten Docker-Hub-
Repository müssen die Docker-Hub-Zugangsdaten zusätzlich unter **Registries**
in Portainer hinterlegt werden.

Für ein Update zuerst die GitHub Action durchlaufen lassen und anschließend in
Portainer beim Stack **Pull latest image** und **Update the stack** wählen.

### Podman mit systemd/Quadlet

Für einen reinen Podman-Host liegen unter `deploy/podman` passende Quadlet-Dateien.
Nach dem Kopieren nach `/etc/containers/systemd/` werden sie mit
`systemctl daemon-reload` und `systemctl start bibelraum.service` aktiviert.
Der Generator hängt den Dienst über den `[Install]`-Abschnitt automatisch in
`multi-user.target` ein. Das Image wird beim Start aus Docker Hub bezogen; automatische
Registry-Updates können über `podman-auto-update.timer` eingeschaltet werden.

### Lokaler Container-Build

Vom Wurzelverzeichnis des Git-Repositories aus:

```bash
docker build -t bibelraum:local .
```

## Projektstruktur

```text
.
├── server/          Node.js-/Express-API und SQLite-Import
├── src/             React-Oberfläche
├── data/            lokal erzeugte App-Datenbank (von Git ignoriert)
├── Dockerfile
├── docker-compose.yml
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

Das MacArthur-Paket wird ebenfalls nur lokal eingebunden und nicht in das Image
oder Repository aufgenommen. Laut Pakethinweis ist es ausschließlich im Rahmen
der vorhandenen Nutzungsrechte zu verwenden und darf nicht ohne ausdrückliche
Genehmigung veröffentlicht oder weiterverbreitet werden.
