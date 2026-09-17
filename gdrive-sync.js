/* ==========================================================================
   Commissioning Checklist Pro — gdrive-sync.js
   OPTIONAL Google Drive cloud backup / synchronization module.

   This file is completely optional. If GOOGLE_CLIENT_ID below is left
   unconfigured, the app runs exactly as before (local-only) and simply
   shows "Google Drive: Not configured" in Settings → Cloud backup.

   Local storage (localStorage / IndexedDB via app.js) remains the primary
   working database at all times. This module only ever reads the local
   state through window.CCP and writes local state back through
   window.CCP.replaceState() — it never talks to the DOM of other views.

   SECURITY NOTES
   - No Google password is ever seen by this app (OAuth only).
   - No client secret is used or stored here (PKCE-less public-client
     "Google Identity Services" token flow — the modern replacement for
     the deprecated implicit flow; no secret exists to leak).
   - The OAuth access token lives ONLY in memory (a variable in this
     module). It is never written to localStorage, sessionStorage,
     exported backups, printable reports, logs, or console output.
   - Only a boolean "connected" flag + the connected account's email are
     kept in localStorage, purely for UI purposes.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 0. CONFIGURATION — edit these two values after setting up your
   *    Google Cloud project (see project README / deployment notes).
   * ------------------------------------------------------------------ */

  // OAuth 2.0 Client ID (Web application type) from Google Cloud Console.
  var GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

  // API key from Google Cloud Console. Only used client-side to open the
  // Google Picker so the signed-in user can explicitly grant this app
  // access to the ONE pre-existing Drive folder below, while keeping the
  // Drive permission scope at its minimum ("drive.file" — files the app
  // creates, or that the user explicitly picks). Leave blank and the app
  // will still work, but the one-time folder authorization step is
  // skipped in favor of a direct access check (see verifyFolderAccess).
  var GOOGLE_API_KEY = "";

  // The existing Google Drive folder that will store backups.
  // https://drive.google.com/drive/folders/1bbI_8XV-MoIqZUJ04gYsdwgnvaJ0lzxK
  var DRIVE_FOLDER_ID = "1bbI_8XV-MoIqZUJ04gYsdwgnvaJ0lzxK";
  var DRIVE_FOLDER_LABEL = "Commissioning Checklist Pro";

  // Minimum viable Drive scope: only files this app creates, or that the
  // user explicitly selects via the Picker. Combined with "email"/"profile"
  // purely so we can show which Google account is connected.
  var OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file email profile openid";

  var APP_TAG = "commissioning-checklist-pro";
  var APP_VERSION = "1.1.0";
  var BACKUP_SCHEMA_VERSION = 1;

  var LS_CONN_KEY = "ccp_gdrive_conn_v1";      // {connected, email, folderAuthorized}
  var LS_AUTOBK_KEY = "ccp_gdrive_autobk_v1";  // {enabled, freqMinutes}

  /* ------------------------------------------------------------------ *
   * 1. MODULE STATE (in-memory only, except where noted)
   * ------------------------------------------------------------------ */

  var tokenClient = null;
  var accessToken = null;        // never persisted
  var accessTokenExpiresAt = 0;  // epoch ms, in-memory only
  var gisLoaded = false;
  var gapiPickerLoaded = false;
  var busy = false;              // true while a sync/backup/restore is in flight
  var lastStatus = "idle";       // idle | synced | dirty | syncing | failed | offline | conflict
  var lastError = "";
  var pendingConflict = null;    // { local, remote, fileId, filename }
  var autoTimer = null;

  function clientIdConfigured() {
    return !!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.indexOf("YOUR_GOOGLE_CLIENT_ID") !== 0;
  }

  function getConn() {
    try {
      var raw = localStorage.getItem(LS_CONN_KEY);
      return raw ? JSON.parse(raw) : { connected: false, email: "", folderAuthorized: false };
    } catch (e) { return { connected: false, email: "", folderAuthorized: false }; }
  }
  function setConn(v) {
    try { localStorage.setItem(LS_CONN_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  function clearConn() {
    try { localStorage.removeItem(LS_CONN_KEY); } catch (e) { /* ignore */ }
  }
  function getAutoBk() {
    try {
      var raw = localStorage.getItem(LS_AUTOBK_KEY);
      return raw ? JSON.parse(raw) : { enabled: false, freqMinutes: 0 }; // Manual only by default
    } catch (e) { return { enabled: false, freqMinutes: 0 }; }
  }
  function setAutoBk(v) {
    try { localStorage.setItem(LS_AUTOBK_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }

  function esc(s) { return window.CCP ? window.CCP.esc(s) : String(s == null ? "" : s); }
  function toast(msg, kind) { if (window.CCP) window.CCP.toast(msg, kind); }
  function nowIso() { return window.CCP ? window.CCP.nowIso() : new Date().toISOString(); }

  /* ------------------------------------------------------------------ *
   * 2. SCRIPT LOADING (Google Identity Services + Picker)
   * ------------------------------------------------------------------ */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { existing.addEventListener("load", resolve); if (existing.dataset.loaded) resolve(); return; }
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = function () { s.dataset.loaded = "1"; resolve(); };
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureGis() {
    if (gisLoaded && window.google && window.google.accounts) return Promise.resolve();
    return loadScript("https://accounts.google.com/gsi/client").then(function () { gisLoaded = true; });
  }

  function ensureGapiPicker() {
    if (gapiPickerLoaded && window.google && window.google.picker) return Promise.resolve();
    if (!GOOGLE_API_KEY) return Promise.reject(new Error("no-api-key"));
    return loadScript("https://apis.google.com/js/api.js").then(function () {
      return new Promise(function (resolve, reject) {
        window.gapi.load("picker", { callback: function () { gapiPickerLoaded = true; resolve(); }, onerror: reject });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 3. AUTH
   * ------------------------------------------------------------------ */

  function ensureTokenClient() {
    return ensureGis().then(function () {
      if (tokenClient) return tokenClient;
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: OAUTH_SCOPE,
        callback: function () {} // overridden per-call below
      });
      return tokenClient;
    });
  }

  // Requests an access token. prompt: '' = silent (only works if the
  // browser session still has an active Google grant), 'consent' = show
  // the Google account/consent picker (first-time connect).
  function requestToken(promptMode) {
    return ensureTokenClient().then(function (client) {
      return new Promise(function (resolve, reject) {
        client.callback = function (resp) {
          if (resp && resp.error) { reject(new Error(resp.error)); return; }
          accessToken = resp.access_token;
          accessTokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
          resolve(accessToken);
        };
        try {
          client.requestAccessToken({ prompt: promptMode });
        } catch (e) { reject(e); }
      });
    });
  }

  function getValidToken(interactive) {
    if (accessToken && Date.now() < accessTokenExpiresAt) return Promise.resolve(accessToken);
    return requestToken(interactive ? "consent" : "").catch(function (err) {
      if (interactive) throw err;
      // Silent refresh failed (session expired / third-party cookies
      // blocked) — the user must reconnect explicitly.
      throw new Error("reauth_required");
    });
  }

  function fetchUserEmail(token) {
    return fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token }
    }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { return j.email || ""; })
      .catch(function () { return ""; });
  }

  /* ------------------------------------------------------------------ *
   * 4. DRIVE FOLDER ACCESS (via Google Picker — keeps scope minimal)
   * ------------------------------------------------------------------ */

  function authorizeFolderWithPicker(token) {
    return ensureGapiPicker().then(function () {
      return new Promise(function (resolve, reject) {
        var view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setParent(DRIVE_FOLDER_ID)
          .setSelectFolderEnabled(true)
          .setIncludeFolders(true);
        var picker = new google.picker.PickerBuilder()
          .setOAuthToken(token)
          .setDeveloperKey(GOOGLE_API_KEY)
          .addView(view)
          .setTitle("Confirm access to: " + DRIVE_FOLDER_LABEL)
          .setCallback(function (data) {
            if (data.action === google.picker.Action.PICKED) resolve(true);
            else if (data.action === google.picker.Action.CANCEL) resolve(false);
          })
          .build();
        picker.setVisible(true);
      });
    });
  }

  // Confirms the signed-in user/app can actually read the configured
  // folder. Used both right after connecting and before every sync.
  function verifyFolderAccess(token) {
    return fetch(
      "https://www.googleapis.com/drive/v3/files/" + DRIVE_FOLDER_ID + "?fields=id,name&supportsAllDrives=true",
      { headers: { Authorization: "Bearer " + token } }
    ).then(function (r) {
      if (r.status === 404 || r.status === 403) return false;
      if (!r.ok) throw new Error("drive_api_error");
      return true;
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. CONNECT / DISCONNECT
   * ------------------------------------------------------------------ */

  function connect() {
    if (!clientIdConfigured()) {
      toast("Google Drive is not configured yet. Add a Google Client ID first.", "error");
      return;
    }
    if (busy) return;
    busy = true; renderCloudCard();
    requestToken("consent").then(function (token) {
      return fetchUserEmail(token).then(function (email) {
        return verifyFolderAccess(token).then(function (hasAccess) {
          if (hasAccess) {
            setConn({ connected: true, email: email, folderAuthorized: true });
            busy = false; lastStatus = "idle";
            toast("Google Drive connected.", "success");
            renderCloudCard();
            return;
          }
          // No direct access yet — offer the one-time Picker authorization
          // (works even though our scope is the minimal "drive.file").
          if (!GOOGLE_API_KEY) {
            setConn({ connected: true, email: email, folderAuthorized: false });
            busy = false; lastStatus = "failed";
            lastError = "This app doesn't automatically have access to the configured folder yet. Ask the folder owner to share it with " + (email || "your Google account") + ", or configure a Google API key to enable the one-time folder-picker step.";
            toast(lastError, "error");
            renderCloudCard();
            return;
          }
          return authorizeFolderWithPicker(token).then(function (picked) {
            if (!picked) {
              setConn({ connected: true, email: email, folderAuthorized: false });
              lastStatus = "failed";
              lastError = "Google Drive is connected, but folder access wasn't granted. Tap 'Grant folder access' to finish setup.";
              toast(lastError, "error");
            } else {
              setConn({ connected: true, email: email, folderAuthorized: true });
              lastStatus = "idle";
              toast("Google Drive connected.", "success");
            }
            busy = false; renderCloudCard();
          });
        });
      });
    }).catch(function (err) {
      busy = false; lastStatus = "failed";
      if (err && (err.message === "popup_closed" || err.message === "access_denied")) {
        lastError = "Google sign-in was cancelled.";
      } else {
        lastError = "Google sign-in failed. Please try again.";
      }
      toast(lastError, "error");
      renderCloudCard();
    });
  }

  function grantFolderAccess() {
    if (busy) return;
    busy = true; renderCloudCard();
    getValidToken(true).then(function (token) {
      return authorizeFolderWithPicker(token).then(function (picked) {
        var conn = getConn();
        conn.folderAuthorized = !!picked;
        setConn(conn);
        busy = false; lastStatus = picked ? "idle" : "failed";
        toast(picked ? "Folder access granted." : "Folder access not granted.", picked ? "success" : "error");
        renderCloudCard();
      });
    }).catch(function () {
      busy = false; lastStatus = "failed";
      toast("Could not open the Google Drive folder picker.", "error");
      renderCloudCard();
    });
  }

  function disconnect() {
    if (window.CCP) {
      window.CCP.confirmDialog(
        "Disconnect Google Drive?",
        "This stops cloud backup on this device. Your local commissioning data is not affected.",
        doDisconnect
      );
    } else {
      doDisconnect();
    }
  }
  function doDisconnect() {
    stopAutoTimer();
    if (accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try { window.google.accounts.oauth2.revoke(accessToken, function () {}); } catch (e) { /* ignore */ }
    }
    accessToken = null; accessTokenExpiresAt = 0;
    clearConn();
    setAutoBk({ enabled: false, freqMinutes: 0 });
    lastStatus = "idle"; lastError = ""; pendingConflict = null;
    toast("Google Drive disconnected.", "success");
    renderCloudCard();
  }

  /* ------------------------------------------------------------------ *
   * 6. BACKUP PAYLOAD BUILD / RESTORE
   * ------------------------------------------------------------------ */

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function backupFileName() {
    var st = window.CCP.getState();
    var pid = st.project && st.project.projectId ? slug(st.project.projectId) : "";
    return pid ? ("commissioning-checklist-pro-" + pid + ".json") : "commissioning-checklist-pro-backup.json";
  }

  function buildBackupPayload() {
    var st = window.CCP.getState();
    return {
      appVersion: APP_VERSION,
      backupVersion: BACKUP_SCHEMA_VERSION,
      project: st.project,
      checklist: st.checklist,
      tests: st.tests,
      punch: st.punch,
      dailyLogs: st.dailyLogs,
      progress: window.CCP.computeStats(),
      meta: {
        lastModified: st.meta.lastModified,
        exportedAt: nowIso()
      }
    };
  }

  function applyRestoredPayload(payload, remoteModified) {
    var st = window.CCP.getState();
    var next = {
      project: payload.project || st.project,
      checklist: payload.checklist || st.checklist,
      tests: payload.tests || [],
      punch: payload.punch || [],
      dailyLogs: payload.dailyLogs || [],
      meta: st.meta || {}
    };
    next.meta.lastModified = (payload.meta && payload.meta.lastModified) || remoteModified || nowIso();
    next.meta.lastSyncedAt = nowIso();
    next.meta.lastKnownRemoteModified = remoteModified || (payload.meta && payload.meta.lastModified) || "";
    window.CCP.replaceState(next, { silent: true });
  }

  /* ------------------------------------------------------------------ *
   * 7. DRIVE FILE OPERATIONS
   * ------------------------------------------------------------------ */

  function driveFind(token, name) {
    var q = encodeURIComponent(
      "'" + DRIVE_FOLDER_ID + "' in parents and name = '" + name.replace(/'/g, "\\'") + "' and trashed = false"
    );
    return fetch(
      "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&spaces=drive",
      { headers: { Authorization: "Bearer " + token } }
    ).then(function (r) {
      if (!r.ok) throw new Error("drive_api_error");
      return r.json();
    }).then(function (j) { return (j.files && j.files[0]) || null; });
  }

  function driveList(token) {
    var q = encodeURIComponent(
      "'" + DRIVE_FOLDER_ID + "' in parents and trashed = false and appProperties has { key='app' and value='" + APP_TAG + "' }"
    );
    return fetch(
      "https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc&spaces=drive",
      { headers: { Authorization: "Bearer " + token } }
    ).then(function (r) {
      if (!r.ok) throw new Error("drive_api_error");
      return r.json();
    }).then(function (j) { return j.files || []; });
  }

  function driveDownload(token, fileId) {
    return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media", {
      headers: { Authorization: "Bearer " + token }
    }).then(function (r) {
      if (!r.ok) throw new Error("drive_download_failed");
      return r.text();
    }).then(function (text) {
      try { return JSON.parse(text); }
      catch (e) { throw new Error("corrupt_backup"); }
    });
  }

  function multipartBody(metadata, contentObj) {
    var boundary = "ccpsync" + Date.now();
    var body =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json\r\n\r\n" +
      JSON.stringify(contentObj) + "\r\n" +
      "--" + boundary + "--";
    return { body: body, boundary: boundary };
  }

  function driveCreate(token, name, contentObj) {
    var metadata = { name: name, parents: [DRIVE_FOLDER_ID], appProperties: { app: APP_TAG } };
    var mp = multipartBody(metadata, contentObj);
    return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + mp.boundary },
      body: mp.body
    }).then(function (r) { if (!r.ok) throw new Error("drive_upload_failed"); return r.json(); });
  }

  function driveUpdate(token, fileId, contentObj) {
    var metadata = { appProperties: { app: APP_TAG } };
    var mp = multipartBody(metadata, contentObj);
    return fetch("https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=multipart&fields=id,name,modifiedTime", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + mp.boundary },
      body: mp.body
    }).then(function (r) { if (!r.ok) throw new Error("drive_upload_failed"); return r.json(); });
  }

  function driveCopyTimestamped(token, fileId, baseName) {
    var stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    var newName = baseName.replace(/\.json$/, "") + "-backup-" + stamp + ".json";
    return fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "/copy?fields=id,name", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, parents: [DRIVE_FOLDER_ID], appProperties: { app: APP_TAG } })
    }).then(function (r) { if (!r.ok) throw new Error("drive_upload_failed"); return r.json(); });
  }

  /* ------------------------------------------------------------------ *
   * 8. SYNC ORCHESTRATION
   * ------------------------------------------------------------------ */

  function isDirty() {
    var st = window.CCP.getState();
    var m = st.meta || {};
    if (!m.lastSyncedAt) return true;
    return new Date(m.lastModified) > new Date(m.lastSyncedAt);
  }

  function markSynced(remoteModifiedIso) {
    var st = window.CCP.getState();
    st.meta.lastSyncedAt = nowIso();
    st.meta.lastKnownRemoteModified = remoteModifiedIso || st.meta.lastModified;
    window.CCP.saveState({ silent: true });
  }

  function friendlyError(err) {
    var msg = (err && err.message) || String(err);
    if (msg === "reauth_required") return "Google Drive authorization has expired. Please reconnect Google Drive.";
    if (msg === "drive_api_error" || msg === "drive_download_failed" || msg === "drive_upload_failed") {
      return "Google Drive sync failed. Your local commissioning data is safe. Try again when internet access is available.";
    }
    if (msg === "corrupt_backup") return "The backup file in Google Drive appears to be corrupted or invalid. Local data was not changed.";
    if (msg === "no_folder_access") return "This app can't access the configured Google Drive folder. Ask the folder owner for access, or grant folder access again.";
    if (!navigator.onLine) return "No internet connection. Your local commissioning data is safe and will sync when you're back online.";
    return "Google Drive sync failed. Your local commissioning data is safe. Try again when internet access is available.";
  }

  function withReadyDrive(interactive) {
    var conn = getConn();
    if (!navigator.onLine) return Promise.reject(new Error("offline"));
    if (!conn.connected) return Promise.reject(new Error("not_connected"));
    return getValidToken(interactive).then(function (token) {
      return verifyFolderAccess(token).then(function (ok) {
        if (!ok) throw new Error("no_folder_access");
        return token;
      });
    });
  }

  // Main "Sync Now" — safe two-way sync with conflict detection.
  function syncNow(quiet) {
    if (busy) return;
    if (!navigator.onLine) { lastStatus = "offline"; renderCloudCard(); if (!quiet) toast("You're offline. Local data is safe and will sync later.", "error"); return; }
    var conn = getConn();
    if (!conn.connected) { if (!quiet) toast("Connect Google Drive first.", "error"); return; }

    busy = true; lastStatus = "syncing"; renderCloudCard();
    var token, filename = backupFileName(), st = window.CCP.getState();

    withReadyDrive(false).then(function (t) {
      token = t;
      return driveFind(token, filename);
    }).then(function (remoteFile) {
      if (!remoteFile) {
        // Nothing in Drive yet — first upload.
        return driveCreate(token, filename, buildBackupPayload()).then(function (created) {
          markSynced(created.modifiedTime);
          busy = false; lastStatus = "synced"; pendingConflict = null;
          if (!quiet) toast("Backup created in Google Drive.", "success");
          renderCloudCard();
        });
      }
      return driveDownload(token, remoteFile.id).then(function (remoteJson) {
        var remoteModified = (remoteJson.meta && remoteJson.meta.lastModified) || remoteFile.modifiedTime;
        var localDirty = isDirty();
        var remoteChanged = remoteModified && remoteModified !== st.meta.lastKnownRemoteModified;

        if (!localDirty && !remoteChanged) {
          markSynced(remoteModified);
          busy = false; lastStatus = "synced"; pendingConflict = null;
          if (!quiet) toast("Already up to date.", "success");
          renderCloudCard();
          return;
        }
        if (localDirty && !remoteChanged) {
          return driveCopyTimestamped(token, remoteFile.id, filename).catch(function () { /* best-effort */ })
            .then(function () { return driveUpdate(token, remoteFile.id, buildBackupPayload()); })
            .then(function (updated) {
              markSynced(updated.modifiedTime);
              busy = false; lastStatus = "synced"; pendingConflict = null;
              if (!quiet) toast("Local changes backed up to Google Drive.", "success");
              renderCloudCard();
            });
        }
        if (!localDirty && remoteChanged) {
          applyRestoredPayload(remoteJson, remoteModified);
          busy = false; lastStatus = "synced"; pendingConflict = null;
          toast("Google Drive had newer data — updated this device.", "success");
          renderCloudCard();
          return;
        }
        // Both changed — never silently overwrite.
        busy = false; lastStatus = "conflict";
        pendingConflict = { fileId: remoteFile.id, filename: filename, remote: remoteJson, remoteModified: remoteModified };
        if (quiet) {
          toast("Sync conflict detected. Open Cloud backup to resolve.", "error");
          renderCloudCard();
        } else {
          renderCloudCard();
          openConflictSheet();
        }
      });
    }).catch(function (err) {
      busy = false; lastStatus = (err && err.message === "reauth_required") ? "failed" : "failed";
      lastError = friendlyError(err);
      if (!quiet) toast(lastError, "error");
      renderCloudCard();
    });
  }

  // "Backup Now" — explicit force-upload of local data (still protects the
  // existing remote copy with a timestamped snapshot first).
  function backupNow() {
    if (busy) return;
    var conn = getConn();
    if (!conn.connected) { toast("Connect Google Drive first.", "error"); return; }
    if (!navigator.onLine) { toast("No internet connection.", "error"); return; }

    busy = true; lastStatus = "syncing"; renderCloudCard();
    var token, filename = backupFileName();
    withReadyDrive(false).then(function (t) {
      token = t;
      return driveFind(token, filename);
    }).then(function (remoteFile) {
      if (!remoteFile) return driveCreate(token, filename, buildBackupPayload());
      return driveCopyTimestamped(token, remoteFile.id, filename).catch(function () {})
        .then(function () { return driveUpdate(token, remoteFile.id, buildBackupPayload()); });
    }).then(function (result) {
      markSynced(result.modifiedTime);
      busy = false; lastStatus = "synced"; pendingConflict = null;
      toast("Backup uploaded to Google Drive.", "success");
      renderCloudCard();
    }).catch(function (err) {
      busy = false; lastStatus = "failed"; lastError = friendlyError(err);
      toast(lastError, "error");
      renderCloudCard();
    });
  }

  function resolveConflict(choice) {
    if (!pendingConflict) return;
    var token, c = pendingConflict;
    busy = true; lastStatus = "syncing"; renderCloudCard();
    withReadyDrive(false).then(function (t) {
      token = t;
      if (choice === "local") {
        return driveCopyTimestamped(token, c.fileId, c.filename).catch(function () {})
          .then(function () { return driveUpdate(token, c.fileId, buildBackupPayload()); })
          .then(function (updated) { markSynced(updated.modifiedTime); });
      }
      if (choice === "drive") {
        applyRestoredPayload(c.remote, c.remoteModified);
        return Promise.resolve();
      }
      if (choice === "both") {
        return driveCopyTimestamped(token, c.fileId, c.filename)
          .then(function () { return driveUpdate(token, c.fileId, buildBackupPayload()); })
          .then(function (updated) { markSynced(updated.modifiedTime); });
      }
    }).then(function () {
      pendingConflict = null; busy = false; lastStatus = "synced";
      toast("Sync conflict resolved.", "success");
      if (window.CCP) window.CCP.closeSheet();
      renderCloudCard();
    }).catch(function (err) {
      busy = false; lastStatus = "failed"; lastError = friendlyError(err);
      toast(lastError, "error");
      renderCloudCard();
    });
  }

  /* ------------------------------------------------------------------ *
   * 9. RESTORE
   * ------------------------------------------------------------------ */

  function openRestoreSheet() {
    var conn = getConn();
    if (!conn.connected) { toast("Connect Google Drive first.", "error"); return; }
    if (!navigator.onLine) { toast("No internet connection.", "error"); return; }

    window.CCP.openSheet("Restore from Google Drive", '<p class="section-sub">Loading backups…</p>');
    withReadyDrive(false).then(function (token) {
      return driveList(token).then(function (files) {
        if (!files.length) {
          window.CCP.openSheet("Restore from Google Drive", '<p class="section-sub">No backup files found in this Drive folder yet.</p>');
          return;
        }
        var html = files.map(function (f) {
          var d = new Date(f.modifiedTime);
          return (
            '<div class="gdrive-restore-item">' +
              '<div class="gdrive-restore-item__title">' + esc(f.name) + '</div>' +
              '<div class="gdrive-restore-item__meta">Last modified: ' + esc(d.toLocaleString()) + '</div>' +
              '<button class="btn btn--sm btn--primary" data-restore-id="' + esc(f.id) + '" data-restore-name="' + esc(f.name) + '">Restore this file</button>' +
            '</div>'
          );
        }).join("");
        window.CCP.openSheet("Restore from Google Drive", html);
        document.querySelectorAll("[data-restore-id]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var fileId = btn.getAttribute("data-restore-id");
            var name = btn.getAttribute("data-restore-name");
            window.CCP.confirmDialog(
              "Restore \u201C" + name + "\u201D?",
              "This will replace the current local project data with the selected backup.",
              function () { doRestore(fileId); }
            );
          });
        });
      });
    }).catch(function (err) {
      toast(friendlyError(err), "error");
      window.CCP.closeSheet();
    });
  }

  function doRestore(fileId) {
    withReadyDrive(false).then(function (token) {
      return driveDownload(token, fileId).then(function (payload) {
        if (!payload || !payload.project || !payload.checklist) throw new Error("corrupt_backup");
        applyRestoredPayload(payload, payload.meta && payload.meta.lastModified);
        window.CCP.closeSheet();
        toast("Restore complete.", "success");
        renderCloudCard();
      });
    }).catch(function (err) {
      toast(friendlyError(err), "error");
    });
  }

  /* ------------------------------------------------------------------ *
   * 10. AUTOMATIC BACKGROUND BACKUP
   * ------------------------------------------------------------------ */

  function stopAutoTimer() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }
  function startAutoTimer() {
    stopAutoTimer();
    autoTimer = setInterval(autoTick, 30 * 1000); // check every 30s, act per configured frequency
  }
  var lastAutoRunAt = 0;
  function autoTick() {
    var cfg = getAutoBk();
    var conn = getConn();
    if (!cfg.enabled || !cfg.freqMinutes) return;
    if (!conn.connected || !conn.folderAuthorized) return;
    if (!navigator.onLine) return;
    if (!isDirty()) return;
    if (busy) return;
    var now = Date.now();
    if (now - lastAutoRunAt < cfg.freqMinutes * 60 * 1000) return;
    lastAutoRunAt = now;
    syncNow(true); // quiet: never pops the conflict sheet automatically
  }

  function setAutoBackup(enabled, freqMinutes) {
    setAutoBk({ enabled: !!enabled, freqMinutes: Number(freqMinutes) || 0 });
    if (enabled && freqMinutes) startAutoTimer(); else stopAutoTimer();
    renderCloudCard();
  }

  /* ------------------------------------------------------------------ *
   * 11. UI RENDERING
   * ------------------------------------------------------------------ */

  function statusPillHtml() {
    var map = {
      idle: ["", "Not synced yet"],
      synced: ["sync-status--synced", "\u25CF Synced"],
      dirty: ["sync-status--dirty", "\u25CB Local changes"],
      syncing: ["sync-status--syncing", "\u21BB Syncing\u2026"],
      failed: ["sync-status--failed", "\u26A0 Sync failed"],
      offline: ["sync-status--offline", "\u2601 Offline"],
      conflict: ["sync-status--conflict", "\u26A0 Sync conflict"]
    };
    var effective = lastStatus;
    if (effective === "idle" && isDirty() && getConn().connected) effective = "dirty";
    if (!navigator.onLine) effective = "offline";
    var m = map[effective] || map.idle;
    return '<span class="sync-status ' + m[0] + '">' + m[1] + '</span>';
  }

  function lastSyncedLabel() {
    var st = window.CCP.getState();
    var iso = st.meta && st.meta.lastSyncedAt;
    if (!iso) return "Never";
    var d = new Date(iso);
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderCloudCard() {
    var body = document.getElementById("cloudBackupBody");
    if (!body || !window.CCP) return;

    if (!clientIdConfigured()) {
      body.innerHTML =
        '<div class="gdrive-row"><div class="gdrive-conn"><span class="gdrive-conn__dot"></span>Google Drive: Not configured</div></div>' +
        '<p class="section-sub mt-0">Add a Google OAuth Client ID in gdrive-sync.js to enable optional cloud backup. The app works fully offline without it.</p>';
      return;
    }

    var conn = getConn();
    var autoCfg = getAutoBk();

    if (!conn.connected) {
      body.innerHTML =
        '<div class="gdrive-row"><div class="gdrive-conn"><span class="gdrive-conn__dot"></span>Not connected</div></div>' +
        '<p class="section-sub mt-0">Your commissioning data is stored locally on this device. If you connect Google Drive, backup files will be uploaded to your connected Google account, into the folder: <b>' + esc(DRIVE_FOLDER_LABEL) + '</b>.</p>' +
        '<button class="btn btn--primary btn--block" id="gdriveConnectBtn"' + (busy ? " disabled" : "") + '>' + (busy ? "Connecting\u2026" : "Connect Google Drive") + '</button>';
      var btn = document.getElementById("gdriveConnectBtn");
      if (btn) btn.addEventListener("click", connect);
      return;
    }

    var needsFolderGrant = !conn.folderAuthorized;
    var html = "";
    html += '<div class="gdrive-row">' +
      '<div class="gdrive-conn"><span class="gdrive-conn__dot is-connected"></span>Connected</div>' +
      statusPillHtml() +
      '</div>';
    html += '<div class="gdrive-detail-row"><span>Google account</span><b>' + esc(conn.email || "\u2014") + '</b></div>';
    html += '<div class="gdrive-detail-row"><span>Folder</span><b>' + esc(DRIVE_FOLDER_LABEL) + '</b></div>';
    html += '<div class="gdrive-detail-row"><span>Last synced</span><b>' + esc(lastSyncedLabel()) + '</b></div>';

    if (needsFolderGrant) {
      html += '<div class="gdrive-note">This app doesn\u2019t have access to the configured Drive folder yet. Grant access to enable backup.</div>';
      html += '<button class="btn btn--primary btn--block" id="gdriveGrantBtn"' + (busy ? " disabled" : "") + '>Grant folder access</button>';
    } else {
      html += '<div class="btn-row" style="margin:12px 0;">' +
        '<button class="btn btn--sm btn--primary" id="gdriveSyncBtn"' + (busy ? " disabled" : "") + '>Sync Now</button>' +
        '<button class="btn btn--sm" id="gdriveBackupBtn"' + (busy ? " disabled" : "") + '>Backup Now</button>' +
        '<button class="btn btn--sm" id="gdriveRestoreBtn"' + (busy ? " disabled" : "") + '>Restore</button>' +
        '</div>';
      if (lastStatus === "conflict" && pendingConflict) {
        html += '<button class="btn btn--sm btn--danger btn--block" id="gdriveResolveBtn" style="margin-bottom:10px;">Resolve sync conflict</button>';
      }
      html += '<div class="gdrive-freq-row">' +
        '<label style="display:flex;align-items:center;gap:8px;font-size:13px;">' +
        '<input type="checkbox" id="gdriveAutoEnabled"' + (autoCfg.enabled ? " checked" : "") + '> Automatic Google Drive backup' +
        '</label>' +
        '</div>';
      html += '<select id="gdriveAutoFreq" style="width:100%;background:var(--panel);border:1px solid var(--panel-border);color:var(--ink);border-radius:var(--radius-s);padding:9px;min-height:40px;">' +
        '<option value="0"' + (autoCfg.freqMinutes === 0 ? " selected" : "") + '>Manual only</option>' +
        '<option value="5"' + (autoCfg.freqMinutes === 5 ? " selected" : "") + '>Every 5 minutes</option>' +
        '<option value="15"' + (autoCfg.freqMinutes === 15 ? " selected" : "") + '>Every 15 minutes</option>' +
        '<option value="30"' + (autoCfg.freqMinutes === 30 ? " selected" : "") + '>Every 30 minutes</option>' +
        '</select>';
    }

    html += '<p class="gdrive-note" style="margin-top:12px;">Your commissioning data is stored locally on this device. If Google Drive backup is enabled, the app uploads your backup files to the connected Google Drive account and configured folder.</p>';
    html += '<button class="btn btn--block btn--danger" id="gdriveDisconnectBtn" style="margin-top:4px;">Disconnect</button>';

    body.innerHTML = html;

    var idMap = {
      gdriveGrantBtn: grantFolderAccess,
      gdriveSyncBtn: function () { syncNow(false); },
      gdriveBackupBtn: backupNow,
      gdriveRestoreBtn: openRestoreSheet,
      gdriveResolveBtn: openConflictSheet,
      gdriveDisconnectBtn: disconnect
    };
    Object.keys(idMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("click", idMap[id]);
    });
    var autoChk = document.getElementById("gdriveAutoEnabled");
    var autoFreq = document.getElementById("gdriveAutoFreq");
    if (autoChk && autoFreq) {
      var syncAuto = function () { setAutoBackup(autoChk.checked, autoFreq.value); };
      autoChk.addEventListener("change", syncAuto);
      autoFreq.addEventListener("change", syncAuto);
    }
  }

  function openConflictSheet() {
    if (!pendingConflict || !window.CCP) return;
    var st = window.CCP.getState();
    var localWhen = new Date(st.meta.lastModified).toLocaleString();
    var remoteWhen = new Date(pendingConflict.remoteModified).toLocaleString();
    var html =
      '<p class="section-sub mt-0">Both this device and Google Drive have changes. Choose which version to keep — nothing will be deleted; the version you don\u2019t choose is preserved automatically.</p>' +
      '<div class="conflict-panel">' +
        '<div class="conflict-panel__col"><b>Local version</b>Modified: ' + esc(localWhen) + '</div>' +
        '<div class="conflict-panel__col"><b>Google Drive version</b>Modified: ' + esc(remoteWhen) + '</div>' +
      '</div>' +
      '<div class="btn-row" style="flex-direction:column;">' +
        '<button class="btn btn--primary btn--block" id="conflictKeepLocal">Keep Local</button>' +
        '<button class="btn btn--block" id="conflictKeepDrive">Keep Google Drive</button>' +
        '<button class="btn btn--block" id="conflictBoth">Create Backup of Both</button>' +
      '</div>';
    window.CCP.openSheet("Sync conflict detected", html);
    var b1 = document.getElementById("conflictKeepLocal");
    var b2 = document.getElementById("conflictKeepDrive");
    var b3 = document.getElementById("conflictBoth");
    if (b1) b1.addEventListener("click", function () { resolveConflict("local"); });
    if (b2) b2.addEventListener("click", function () { resolveConflict("drive"); });
    if (b3) b3.addEventListener("click", function () { resolveConflict("both"); });
  }

  /* ------------------------------------------------------------------ *
   * 12. PUBLIC API / BOOTSTRAP
   * ------------------------------------------------------------------ */

  function onLocalChange() {
    // Local data just changed & was saved. Nothing to push here — the
    // auto-backup timer (if enabled) and manual Sync/Backup buttons pick
    // this up via isDirty(). We just refresh the status pill if visible.
    if (window.CCP && window.CCP.getCurrentView() === "reports") renderCloudCard();
  }

  function onConnectivityChange(online) {
    if (online) {
      var conn = getConn();
      if (conn.connected) toast("Internet connection restored. Cloud backup available.", "success");
    }
    renderCloudCard();
  }

  function init() {
    var autoCfg = getAutoBk();
    if (autoCfg.enabled && autoCfg.freqMinutes) startAutoTimer();
    renderCloudCard();
  }

  window.CCPSync = {
    init: init,
    onLocalChange: onLocalChange,
    onConnectivityChange: onConnectivityChange,
    renderCloudCard: renderCloudCard,
    connect: connect,
    disconnect: disconnect,
    grantFolderAccess: grantFolderAccess,
    syncNow: syncNow,
    backupNow: backupNow,
    openRestoreSheet: openRestoreSheet,
    setAutoBackup: setAutoBackup
  };
})();
