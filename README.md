# Interval Timer

Interval Timer fürs Workout am Handy – als installierbare Web-App (PWA), ohne Build-Schritt und
ohne Abhängigkeiten.

- Einstellbar: Arbeit, Pause, Übungen, Runden, Rundenpause
- Signaltöne: Pieptöne in den letzten 3 Sekunden jeder Phase, eigener Ton für Arbeit und Pause,
  Dreiklang am Ende
- Workouts speichern, laden, umbenennen, löschen (liegen im Browser-Speicher des Geräts)
- Offline nutzbar, Display bleibt während des Workouts an

## Ablauf

5 s Vorlauf → pro Runde `Übungen` × (Arbeit → Pause) → Rundenpause → nächste Runde. Die Pause nach
der letzten Übung einer Runde entfällt; Phasen mit 0 s werden übersprungen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Zustand, Ablaufsteuerung, Speicherung |
| `audio.js` | Töne (Web Audio API, auf der Audio-Uhr vorausgeplant) |
| `sw.js` | Service Worker für den Offline-Betrieb |

## Veröffentlichen

GitHub Pages aus dem Branch `main`, Ordner `/`. Nach Änderungen an der App die Versionsnummer in
`sw.js` (`CACHE`) erhöhen, sonst behalten installierte Geräte den alten Stand.

Am iPhone: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm".

## Grenzen

Bei gesperrtem Bildschirm oder App im Hintergrund hält iOS Web-Apps an. Der Timer rechnet nach
der Uhr und stimmt danach wieder, Töne gibt es in der Zeit aber nicht.
