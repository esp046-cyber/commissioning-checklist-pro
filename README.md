# Commissioning Checklist Pro

A lightweight, offline-first field tool for Testing & Commissioning engineers.
It supports pre-commissioning, FAT/SAT execution, PLC/SCADA testing, I/O and
loop checks, interlock/alarm/trip verification, punch-list tracking, progress
tracking, daily logs, and handover documentation.

**This is a documentation and workflow tool only.** It does not connect to,
read from, or control any PLC, SCADA system, valve, actuator or energized
equipment. Always follow your project's approved procedures, permit-to-work
requirements, site safety rules and authorized testing procedures.

All data is stored locally in the browser on the device you use (no server,
no account, no data leaves the device). Use **Export** regularly to back up
your work, especially before clearing browser data or switching devices.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell: dashboard, checklist, FAT/SAT, punch list, daily log, reports views |
| `style.css` | All styling — dark/light theme tokens, responsive layout, components |
| `app.js` | All application logic — state, rendering, CRUD, search/filter, export/import, PWA wiring |
| `manifest.json` | Web app manifest so the app can be installed as a PWA |
| `service-worker.js` | Cache-first offline shell with versioned-cache updates |
| `icons/` | App icons (192px, 512px, 512px maskable) |

## Running locally

No build step and no server-side code are required, but PWAs (service
workers) only run over `http://` or `https://`, not `file://`. Use any static
file server, for example:

```bash
# Python 3
cd commissioning-checklist-pro
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

or, with Node installed:

```bash
npx serve .
```

## Deploying to GitHub Pages

1. Create a new GitHub repository and push these files to it (they can sit at
   the repository root, or in a `/docs` folder — either works).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   choose your branch (e.g. `main`) and the folder (`/root` or `/docs`).
4. Save. GitHub will publish the site at
   `https://<your-username>.github.io/<repository-name>/`.
5. Open that URL once while online so the service worker installs and caches
   the app shell — after that it works offline.

Any static host works the same way (Netlify, Vercel, an internal web server,
etc.) — just upload the folder as-is.

## Installing on a phone

**Android (Chrome):**
1. Open the deployed URL in Chrome.
2. Tap the **⋮** menu → **Install app** (or you'll see an automatic "Add to
   Home screen" banner).
3. Confirm — the app icon appears on your home screen and launches full-screen.

**iPhone/iPad (Safari):**
1. Open the deployed URL in Safari (must be Safari, not Chrome, for iOS).
2. Tap the **Share** icon → **Add to Home Screen**.
3. Confirm — the app icon appears on your home screen and launches full-screen.

**Desktop (Chrome/Edge):**
1. Open the deployed URL.
2. Click the install icon in the address bar (or menu → "Install
   Commissioning Checklist Pro…").

Once installed, the app works fully offline after the first load — new data
you enter is saved to the device immediately and survives closing the app,
restarting the device, and losing signal on site.

## Data management

- **Export all project data (JSON)** — full backup of project, checklist,
  test records, punch list and daily logs. Keep this somewhere safe (email
  it to yourself, save to a shared drive, etc.).
- **Import JSON backup** — restores a previously exported backup, replacing
  current on-device data (you'll be asked to confirm first).
- **Export checklist (CSV)** / **Punch list (CSV)** — for opening in Excel or
  attaching to a report.
- **Delete all local data** — irreversible; always confirmed before running.

## Sample data

The app ships with a small sample project ("Water Treatment Automation
Upgrade") so you can see the UI populated immediately. Sample records are
marked with a **Sample** badge. Go to **Dashboard → Edit → Clear current
project**, or **Reports → Delete all local data**, to remove it and start
your own project.

## Notes on scope

This tool intentionally has **no** integration with PLCs, SCADA, historians,
or any live plant system — it is a checklist, test-record and punch-list
companion for engineers in the field, not a control or monitoring system.
