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
| `gdrive-sync.js` | **Optional** Google Drive cloud backup/sync module (see below) |
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

## Cloud backup (Google Drive) — optional

The app still works **entirely offline with zero setup**. Google Drive backup
is an optional extra you can turn on later. Local storage on the device is
always the primary, authoritative database; Google Drive is only ever used
as a backup/sync target.

**Architecture**

```
Local browser storage (source of truth, always works)
        ↓
Commissioning Checklist Pro (offline-first PWA)
        ↓  (optional, only if connected)
Google Drive Sync module (gdrive-sync.js)
        ↓
Your Google Drive → "Commissioning Checklist Pro" folder
```

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Create a new project (or pick an existing one).
3. In the left menu, go to **APIs & Services → Library**.
4. Enable:
   - **Google Drive API**
   - **Google Picker API** *(only needed if you want the one-time
     folder-authorization step — recommended; see scope note below)*

### 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (or **Internal** if you're on Google Workspace and
   all users are in your org).
3. Fill in app name ("Commissioning Checklist Pro"), support email, and your
   GitHub Pages domain under "Authorized domains" (e.g. `github.io` won't
   work as a full authorized domain if you're on a subpath like
   `esp046-cyber.github.io` — use `github.io` as the authorized domain, or
   your own custom domain if you have one).
4. Add scopes: `.../auth/drive.file`, `email`, `profile`, `openid`.
5. Add your own Google account under **Test users** while the app is in
   "Testing" publishing status (this avoids needing Google's app-verification
   review while you're the only user; verification is only required before
   general public use).

### 3. Create OAuth credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** — add the exact origin your GitHub Pages
   site is served from, with no trailing slash, e.g.:
   `https://esp046-cyber.github.io`
   (If you ever move it under a custom domain, add that origin too.)
4. No redirect URI is needed for this app (it uses Google Identity Services'
   token flow, not a redirect-based flow).
5. Copy the generated **Client ID** (ends in `.apps.googleusercontent.com`).

### 4. Create an API key (optional, enables the folder picker)

1. **APIs & Services → Credentials → Create Credentials → API key**.
2. Restrict it: **Application restrictions → HTTP referrers**, add your
   GitHub Pages origin; **API restrictions** → restrict to **Google Picker
   API**.
3. Copy the key.

### 5. Enter your configuration

Open `gdrive-sync.js` and edit the top of the file:

```js
var GOOGLE_CLIENT_ID = "123456789-abc...apps.googleusercontent.com";
var GOOGLE_API_KEY   = "AIza...";           // optional — leave "" to skip the picker step
var DRIVE_FOLDER_ID  = "1bbI_8XV-MoIqZUJ04gYsdwgnvaJ0lzxK"; // already set to your folder
```

If `GOOGLE_CLIENT_ID` is left as the placeholder, the app shows
**"Google Drive: Not configured"** under **Reports → Cloud backup** and
everything else keeps working normally — nothing breaks.

### 6. About the Drive permission (scope)

This app requests the **minimum Google Drive scope**:
`https://www.googleapis.com/auth/drive.file` — it can only see files it
creates itself, or files/folders you explicitly grant it access to. Because
your target folder already exists and wasn't created by the app, the very
first time you connect, a **Google Drive folder picker** opens (if you
configured an API key) pointing at your folder — click **Select** on that
folder to grant this one folder to the app. This keeps the permission as
narrow as possible while still letting the app write into your existing
folder. If you don't configure an API key, the app will tell you it can't
access the folder yet and ask you to either share the folder explicitly with
your Google account or add the API key.

"Sign in with Google" and "Connect Google Drive" are combined into a single
**Connect Google Drive** action — it signs you in and requests Drive access
in one consent step, so you're not prompted twice for the same account.

### 7. Testing it

1. Deploy the updated files (see below) and open the site.
2. Go to **Reports → Cloud backup → Connect Google Drive**.
3. Sign in, grant folder access when prompted.
4. Tap **Backup Now** — check the Drive folder for
   `commissioning-checklist-pro-backup.json` (or
   `commissioning-checklist-pro-<project-id>.json` once you've set a Project
   ID).
5. Edit something locally, tap **Sync Now** — it should upload the change.
6. On another device/browser profile, connect the same account and tap
   **Restore** to pull the data down.
7. Turn on airplane mode / disconnect Wi-Fi and confirm the app keeps working
   normally (checklist, punch list, etc. all still save locally) and shows an
   "Offline" sync status instead of erroring.

### 8. Deploying the update

```bash
git add index.html app.js style.css service-worker.js gdrive-sync.js README.md
git commit -m "Add optional Google Drive cloud backup/sync"
git push origin main
```

GitHub Pages redeploys automatically after the push (usually within a
minute). Because the service worker's cache version was bumped, existing
installed users will pick up the update automatically on next load.

### 9. What runs where

| Runs locally, always | Uses Google Drive, only if connected |
|---|---|
| Project setup, checklist, FAT/SAT, punch list, daily log, all reports/exports | Sign-in and Drive authorization (Google Identity Services) |
| Saving/reading data (localStorage) | Uploading/downloading the JSON backup file |
| PWA install & offline caching | Listing/restoring backup files, conflict resolution |

No traditional backend server is used anywhere — this remains a static PWA
that talks directly to Google's APIs from the browser when you choose to
sync.

## Notes on scope

This tool intentionally has **no** integration with PLCs, SCADA, historians,
or any live plant system — it is a checklist, test-record and punch-list
companion for engineers in the field, not a control or monitoring system.
