/* ==========================================================================
   Commissioning Checklist Pro — app.js
   Vanilla JS, no build step, no framework, no backend.
   All data is persisted to localStorage on this device only.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 1. CONSTANTS & TEMPLATES
   * ------------------------------------------------------------------ */

  var STORAGE_KEY = "ccp_state_v1";

  var CHECKLIST_TEMPLATE = [
    { key: "A", label: "Documentation", items: [
      "Approved P&ID available", "Approved FDS available", "I/O list available",
      "Cause & Effect available", "Control narratives available", "Approved drawings available",
      "Test procedures available", "Latest document revisions confirmed"
    ]},
    { key: "B", label: "Panel / Control System", items: [
      "Panel visual inspection", "Panel identification", "Power supply verification",
      "Earthing verification", "Terminal inspection", "Wiring verification",
      "PLC hardware verification", "PLC communication verification",
      "SCADA communication verification", "Network/interface verification"
    ]},
    { key: "C", label: "Field Installation", items: [
      "Instrument installation verified", "Instrument tag verified", "Cable termination verified",
      "Cable identification verified", "Earthing verified",
      "Tubing/impulse line condition checked where applicable",
      "Valve installation verified", "Actuator installation verified"
    ]},
    { key: "D", label: "I/O Check", items: [
      "Digital inputs", "Digital outputs", "Analog inputs", "Analog outputs",
      "Signal scaling", "Engineering units", "PLC indication", "SCADA indication"
    ]},
    { key: "E", label: "Loop Check", items: [
      "Field device identified", "Tag verified", "Wiring checked", "Signal generated/applied",
      "PLC received signal", "SCADA displayed signal", "Correct engineering unit",
      "Correct range", "Loop result"
    ]},
    { key: "F", label: "Control Logic", items: [
      "Start/stop logic", "Auto/manual operation", "Permissives", "Interlocks",
      "Sequence logic", "Fail-safe behavior", "Reset logic", "Control response"
    ]},
    { key: "G", label: "Alarm / Trip", items: [
      "Alarm generated", "Alarm appears on SCADA", "Correct alarm message", "Correct priority",
      "Alarm acknowledgement", "Alarm reset", "Trip generated", "Trip indication",
      "Reset/recovery verified"
    ]},
    { key: "H", label: "FAT", items: [
      "FAT procedure approved", "FAT test cases completed", "PLC logic tested",
      "HMI/SCADA tested", "I/O simulated", "Alarms tested", "Interlocks tested",
      "Cause & Effect tested", "Defects recorded", "FAT punch items closed/accepted"
    ]},
    { key: "I", label: "SAT", items: [
      "Site readiness confirmed", "Power available", "Instruments available",
      "Field wiring verified", "Communications verified", "I/O tested", "Loops tested",
      "Alarms tested", "Interlocks tested", "Cause & Effect tested",
      "Functional operation verified", "Client witness completed", "SAT punch items recorded"
    ]},
    { key: "J", label: "Handover", items: [
      "Final punch list reviewed", "Outstanding items documented", "As-built drawings available",
      "Test records complete", "Commissioning report complete",
      "Client acceptance/sign-off recorded", "Handover package prepared"
    ]}
  ];

  var TEST_MODES = ["Pre-commissioning", "Loop Check", "FAT", "SAT", "Functional Test", "Handover"];
  var PUNCH_CATEGORIES = ["Documentation", "Panel/Control System", "Field Installation", "I/O", "Loop", "Control Logic", "Alarm/Trip", "FAT", "SAT", "Handover", "Other"];

  /* ------------------------------------------------------------------ *
   * 2. STATE / STORAGE
   * ------------------------------------------------------------------ */

  var state = null;

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowIso() { return new Date().toISOString(); }
  function todayDateStr() { return new Date().toISOString().slice(0, 10); }

  function emptyProject() {
    return {
      name: "", projectId: "", client: "", site: "", engineer: "",
      system: "", date: "", revision: "", phase: "Pre-commissioning", isSample: false
    };
  }

  function buildChecklistFromTemplate(isSample, tagMap) {
    var out = [];
    CHECKLIST_TEMPLATE.forEach(function (cat) {
      cat.items.forEach(function (text, idx) {
        var tag = "";
        if (tagMap && tagMap[cat.key] && tagMap[cat.key][idx] !== undefined) tag = tagMap[cat.key][idx];
        out.push({
          id: uid("chk"), category: cat.key, categoryLabel: cat.label, text: text,
          status: "pending", comment: "", datetime: "", person: "", tag: tag,
          testResult: "", attachment: "", isSample: !!isSample
        });
      });
    });
    return out;
  }

  function buildSampleState() {
    var s = {};
    s.project = {
      name: "Water Treatment Automation Upgrade", projectId: "WTAU-2026-014",
      client: "Metro Water Authority", site: "North Treatment Plant", engineer: "T&C Engineer",
      system: "PLC & SCADA", date: todayDateStr(), revision: "A", phase: "SAT", isSample: true
    };
    var tagMap = {
      D: ["FIT-101", "LIT-102", "PIT-103", "XV-101"],
      E: ["FIT-101", "FIT-101", "FIT-101", "FIT-101", "FIT-101", "FIT-101", "FIT-101", "FIT-101", "FIT-101"]
    };
    var checklist = buildChecklistFromTemplate(true, tagMap);
    var passSome = ["Approved P&ID available", "Approved FDS available", "I/O list available",
      "Panel visual inspection", "Panel identification", "Power supply verification",
      "Digital inputs", "Digital outputs", "Analog inputs",
      "Field device identified", "Tag verified", "Wiring checked", "Signal generated/applied"];
    checklist.forEach(function (it) {
      if (passSome.indexOf(it.text) > -1) {
        it.status = "pass"; it.datetime = nowIso(); it.person = "T&C Engineer";
      } else if (it.category === "B" && it.text === "Earthing verification") {
        it.status = "fail"; it.datetime = nowIso(); it.person = "T&C Engineer";
        it.comment = "Earth bar resistance out of tolerance, retest required.";
      }
    });
    s.checklist = checklist;

    s.tests = [
      { id: uid("tst"), testId: "SAT-001", mode: "SAT", description: "Verify FIT-101 4-20mA loop reads correctly on SCADA",
        expected: "Flow reading within +/-1% of injected signal", actual: "Reading within 0.4%", result: "pass",
        comment: "", witness: "Client rep - J. Alvarez", datetime: nowIso(), isSample: true },
      { id: uid("tst"), testId: "SAT-002", mode: "SAT", description: "Verify XV-101 open/close feedback and interlock with LIT-102 high level",
        expected: "Valve closes automatically on LIT-102 high alarm", actual: "Pending witness", result: "pending",
        comment: "Scheduled for tomorrow AM", witness: "", datetime: nowIso(), isSample: true }
    ];

    s.punch = [
      { id: uid("pun"), punchId: "PL-001", description: "Earth bar resistance at MCC-1 exceeds 1 ohm limit",
        category: "Panel/Control System", tag: "MCC-1", priority: "High", responsible: "Electrical Contractor",
        dateRaised: todayDateStr(), targetDate: "", status: "Open", resolution: "", closeDate: "", isSample: true },
      { id: uid("pun"), punchId: "PL-002", description: "Nameplate missing on PIT-103 transmitter",
        category: "Field Installation", tag: "PIT-103", priority: "Low", responsible: "Instrument Tech",
        dateRaised: todayDateStr(), targetDate: "", status: "In Progress", resolution: "", closeDate: "", isSample: true }
    ];

    s.dailyLogs = [
      { id: uid("log"), date: todayDateStr(), location: "North Treatment Plant - MCC Room",
        activities: "Completed panel inspection and power-up for MCC-1. Started I/O loop checks on flow transmitters.",
        problems: "Earth bar resistance reading above limit at MCC-1 (see PL-001).",
        remaining: "Complete loop checks for LIT-102, PIT-103, XV-101. Begin SAT witness testing.",
        manHours: "8", materials: "Loop calibrator, multimeter, earth tester",
        coordination: "Coordinated with electrical contractor for earth bar rework.",
        nextPlan: "SAT witness session with client at 09:00.", isSample: true }
    ];

    s.meta = { createdAt: nowIso(), collapsedCategories: {} };
    return s;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.project && parsed.checklist) return parsed;
      }
    } catch (e) { /* fall through */ }
    return buildSampleState();
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save data - device storage may be full.", "error"); }
  }

  /* ------------------------------------------------------------------ *
   * 3. DOM HELPERS
   * ------------------------------------------------------------------ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function downloadBlob(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* ------------------------------------------------------------------ *
   * 4. TOASTS
   * ------------------------------------------------------------------ */

  function toast(message, kind) {
    var stack = $("#toastStack");
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " toast--" + kind : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0"; el.style.transition = "opacity .2s ease";
      setTimeout(function () { el.remove(); }, 200);
    }, 2600);
  }

  /* ------------------------------------------------------------------ *
   * 5. CONFIRM DIALOG
   * ------------------------------------------------------------------ */

  function confirmDialog(title, body, onConfirm) {
    var overlay = $("#confirmOverlay");
    $("#confirmTitle").textContent = title;
    $("#confirmBody").textContent = body;
    overlay.classList.add("is-open");
    var okBtn = $("#confirmOkBtn");
    var cancelBtn = $("#confirmCancelBtn");
    function cleanup() {
      overlay.classList.remove("is-open");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
    }
    function onOk() { cleanup(); onConfirm(); }
    function onCancel() { cleanup(); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  }

  /* ------------------------------------------------------------------ *
   * 6. SHEET (MODAL) UTILITY
   * ------------------------------------------------------------------ */

  var sheetSubmitHandler = null;

  function openSheet(title, bodyHtml, onSubmit) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = bodyHtml;
    $("#sheetOverlay").classList.add("is-open");
    sheetSubmitHandler = onSubmit || null;
    var form = $("#sheetBody form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (sheetSubmitHandler) sheetSubmitHandler(form);
      });
    }
    var firstInput = $("#sheetBody input, #sheetBody select, #sheetBody textarea");
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
  }
  function closeSheet() {
    $("#sheetOverlay").classList.remove("is-open");
    $("#sheetBody").innerHTML = "";
    sheetSubmitHandler = null;
  }

  /* ------------------------------------------------------------------ *
   * 7. NAVIGATION
   * ------------------------------------------------------------------ */

  var currentView = "dashboard";

  function navigate(viewName) {
    currentView = viewName;
    $all(".view").forEach(function (v) { v.classList.remove("is-active"); });
    var target = $("#view-" + viewName);
    if (target) target.classList.add("is-active");
    $all(".bottomnav__item").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-nav") === viewName);
    });
    window.scrollTo(0, 0);
    renderCurrentView();
  }

  function renderCurrentView() {
    if (currentView === "dashboard") renderDashboard();
    else if (currentView === "setup") renderSetup();
    else if (currentView === "checklist") renderChecklist();
    else if (currentView === "fatsat") renderTestRecords();
    else if (currentView === "punchlist") renderPunchList();
    else if (currentView === "dailylog") renderDailyLog();
    updateTopbar();
  }

  function updateTopbar() {
    var p = state.project;
    $("#topbarTitle").textContent = p.name ? p.name : "Commissioning Checklist Pro";
    $("#topbarSubtitle").textContent = p.name ? (p.phase + (p.projectId ? " \u00b7 " + p.projectId : "")) : "No project loaded";
  }

  /* ------------------------------------------------------------------ *
   * 8. COMPUTED STATS
   * ------------------------------------------------------------------ */

  function computeStats() {
    var items = state.checklist;
    var total = items.length, pass = 0, fail = 0, pending = 0, na = 0, today = 0;
    var todayStr = todayDateStr();
    items.forEach(function (it) {
      if (it.status === "pass") pass++;
      else if (it.status === "fail") fail++;
      else if (it.status === "na") na++;
      else pending++;
      if (it.datetime && it.datetime.slice(0, 10) === todayStr && it.status !== "pending") today++;
    });
    var completed = pass + fail + na;
    var pct = total ? Math.round((completed / total) * 100) : 0;
    var punchOpen = state.punch.filter(function (p) { return p.status !== "Closed"; }).length;
    return { total: total, pass: pass, fail: fail, pending: pending, na: na, completed: completed, pct: pct, punchOpen: punchOpen, today: today };
  }

  function computeCategoryStats() {
    return CHECKLIST_TEMPLATE.map(function (cat) {
      var items = state.checklist.filter(function (it) { return it.category === cat.key; });
      var completed = items.filter(function (it) { return it.status !== "pending"; }).length;
      var pct = items.length ? Math.round((completed / items.length) * 100) : 0;
      return { key: cat.key, label: cat.label, pct: pct, completed: completed, total: items.length };
    });
  }

  /* ------------------------------------------------------------------ *
   * 9. DASHBOARD VIEW
   * ------------------------------------------------------------------ */

  function renderDashboard() {
    var p = state.project;
    $("#dashProjectName").textContent = p.name || "No project set up yet";
    var metaBits = [];
    if (p.client) metaBits.push("<span><b>Client</b> " + esc(p.client) + "</span>");
    if (p.site) metaBits.push("<span><b>Site</b> " + esc(p.site) + "</span>");
    if (p.engineer) metaBits.push("<span><b>Engineer</b> " + esc(p.engineer) + "</span>");
    if (p.system) metaBits.push("<span><b>System</b> " + esc(p.system) + "</span>");
    if (p.revision) metaBits.push("<span><b>Rev</b> " + esc(p.revision) + "</span>");
    if (p.isSample) metaBits.push('<span class="pill pill--sample">Sample data</span>');
    $("#dashProjectMeta").innerHTML = metaBits.join("") || '<span>Tap Edit to enter project details.</span>';

    var stats = computeStats();
    $("#dashPhaseLabel").textContent = p.phase || "\u2014";
    $("#dashProgressFill").style.width = stats.pct + "%";
    $("#dashProgressPct").textContent = stats.pct + "%";
    $("#dashProgressCount").textContent = stats.completed + " / " + stats.total + " items";
    $("#statPass").textContent = stats.pass;
    $("#statFail").textContent = stats.fail;
    $("#statPending").textContent = stats.pending;
    $("#statPunchOpen").textContent = stats.punchOpen;
    $("#statToday").textContent = stats.today;
    $("#statNA").textContent = stats.na;

    var catStats = computeCategoryStats();
    $("#dashCategoryBars").innerHTML = catStats.map(function (c) {
      return '<div class="category-bar-row">' +
        '<div class="category-bar-row__label">' + esc(c.key) + ' \u00b7 ' + esc(c.label) + '</div>' +
        '<div class="category-bar-row__track progress-track"><div class="progress-fill" style="width:' + c.pct + '%"></div></div>' +
        '<div class="category-bar-row__pct">' + c.pct + '%</div>' +
        '</div>';
    }).join("");
  }

  /* ------------------------------------------------------------------ *
   * 10. PROJECT SETUP VIEW
   * ------------------------------------------------------------------ */

  function renderSetup() {
    var p = state.project;
    var form = $("#projectForm");
    form.name.value = p.name || "";
    form.projectId.value = p.projectId || "";
    form.revision.value = p.revision || "";
    form.client.value = p.client || "";
    form.site.value = p.site || "";
    form.engineer.value = p.engineer || "";
    form.system.value = p.system || "";
    form.date.value = p.date || "";
    form.phase.value = p.phase || "Pre-commissioning";
  }

  function wireSetup() {
    $("#projectForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      state.project.name = f.name.value.trim();
      state.project.projectId = f.projectId.value.trim();
      state.project.revision = f.revision.value.trim();
      state.project.client = f.client.value.trim();
      state.project.site = f.site.value.trim();
      state.project.engineer = f.engineer.value.trim();
      state.project.system = f.system.value.trim();
      state.project.date = f.date.value;
      state.project.phase = f.phase.value;
      state.project.isSample = false;
      saveState();
      toast("Project saved.", "success");
      navigate("dashboard");
    });

    $("#clearProjectBtn").addEventListener("click", function () {
      confirmDialog("Clear current project?", "This removes the project details, checklist progress, test records, punch list and daily logs from this device. This cannot be undone.", function () {
        state.project = emptyProject();
        state.checklist = buildChecklistFromTemplate(false);
        state.tests = [];
        state.punch = [];
        state.dailyLogs = [];
        saveState();
        toast("Project cleared.", "success");
        navigate("dashboard");
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 11. CHECKLIST VIEW
   * ------------------------------------------------------------------ */

  var checklistSearchTerm = "";
  var checklistStatusFilterVal = "all";

  function renderChecklist() {
    var container = $("#checklistContainer");
    var term = checklistSearchTerm.trim().toLowerCase();
    var statusFilter = checklistStatusFilterVal;

    var html = CHECKLIST_TEMPLATE.map(function (cat) {
      var items = state.checklist.filter(function (it) {
        if (it.category !== cat.key) return false;
        if (statusFilter !== "all" && it.status !== statusFilter) return false;
        if (term) {
          var hay = (it.text + " " + it.tag + " " + it.comment + " " + it.person).toLowerCase();
          if (hay.indexOf(term) === -1) return false;
        }
        return true;
      });
      if (!items.length) return "";
      var collapsed = state.meta.collapsedCategories[cat.key] ? " is-collapsed" : "";
      var passCount = items.filter(function (i) { return i.status === "pass"; }).length;
      return '<div class="category-group' + collapsed + '" data-cat="' + cat.key + '">' +
        '<div class="category-group__head" data-toggle-cat="' + cat.key + '">' +
          '<h3>' + esc(cat.key) + ' \u00b7 ' + esc(cat.label) + '</h3>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span class="category-group__count">' + passCount + '/' + items.length + ' pass</span>' +
            '<svg class="category-group__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
        '</div>' +
        '<div class="category-group__items">' + items.map(renderChecklistItem).join("") + '</div>' +
      '</div>';
    }).join("");

    if (!html) {
      html = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/></svg>' +
        '<div class="empty-state__title">No matching items</div><div class="empty-state__sub">Try clearing the search or status filter.</div></div>';
    }
    container.innerHTML = html;
  }

  function renderChecklistItem(it) {
    var metaBits = [];
    if (it.tag) metaBits.push('<span class="tag-mono">' + esc(it.tag) + '</span>');
    if (it.person) metaBits.push(esc(it.person));
    if (it.datetime) metaBits.push(fmtDate(it.datetime));
    return '<div class="item-row" data-item-id="' + it.id + '">' +
      '<div class="item-row__top">' +
        '<div>' +
          '<div class="item-row__text">' + esc(it.text) + '</div>' +
          '<div class="item-row__meta">' + metaBits.map(function (m) { return "<span>" + m + "</span>"; }).join("") + '</div>' +
        '</div>' +
        '<div class="item-row__status-btns">' +
          statusBtn(it, "pass", "P") + statusBtn(it, "fail", "F") + statusBtn(it, "na", "N/A") +
        '</div>' +
      '</div>' +
      '<button class="item-row__toggle" data-toggle-item="' + it.id + '">' + (it.status === "pending" ? "Add details" : "Edit details") + '</button>' +
      '<div class="item-row__detail">' +
        '<div class="field-grid">' +
          '<div class="field"><label>Tag number</label><input type="text" data-field="tag" value="' + esc(it.tag) + '" placeholder="e.g. FIT-101"></div>' +
          '<div class="field"><label>Responsible person</label><input type="text" data-field="person" value="' + esc(it.person) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Test result</label><input type="text" data-field="testResult" value="' + esc(it.testResult) + '" placeholder="Reading / value observed"></div>' +
        '<div class="field"><label>Comment</label><textarea data-field="comment" placeholder="Notes, deviations, reference to punch item...">' + esc(it.comment) + '</textarea></div>' +
        '<div class="field"><label>Attachment reference</label><input type="text" data-field="attachment" value="' + esc(it.attachment) + '" placeholder="File name or drawing ref (optional)"></div>' +
        '<div class="btn-row"><button class="btn btn--sm btn--primary" data-save-item="' + it.id + '">Save details</button></div>' +
      '</div>' +
    '</div>';
  }

  function statusBtn(it, status, label) {
    var active = it.status === status ? " is-active" : "";
    return '<button class="status-btn' + active + '" data-status="' + status + '" data-set-status="' + it.id + '" aria-label="Mark ' + status + '">' + label + '</button>';
  }

  function findChecklistItem(id) {
    for (var i = 0; i < state.checklist.length; i++) if (state.checklist[i].id === id) return state.checklist[i];
    return null;
  }

  function wireChecklist() {
    $("#checklistSearch").addEventListener("input", function (e) {
      checklistSearchTerm = e.target.value; renderChecklist();
    });
    $("#checklistStatusFilter").addEventListener("change", function (e) {
      checklistStatusFilterVal = e.target.value; renderChecklist();
    });
    $("#checklistExpandBtn").addEventListener("click", function () {
      var anyCollapsed = Object.keys(state.meta.collapsedCategories).some(function (k) { return state.meta.collapsedCategories[k]; });
      CHECKLIST_TEMPLATE.forEach(function (c) { state.meta.collapsedCategories[c.key] = !anyCollapsed; });
      saveState(); renderChecklist();
      $("#checklistExpandBtn").textContent = anyCollapsed ? "Expand all" : "Collapse all";
    });
    $("#checklistResetBtn").addEventListener("click", function () {
      confirmDialog("Reset checklist?", "All statuses, comments and results will be cleared back to Pending. Tags are kept.", function () {
        state.checklist.forEach(function (it) {
          it.status = "pending"; it.comment = ""; it.datetime = ""; it.person = "";
          it.testResult = ""; it.attachment = ""; it.isSample = false;
        });
        state.project.isSample = false;
        saveState(); renderChecklist(); toast("Checklist reset.", "success");
      });
    });
    $("#checklistDuplicateBtn").addEventListener("click", function () {
      confirmDialog("Duplicate checklist?", "This adds a fresh copy of all checklist items (status Pending) alongside the existing ones - useful for a second package or skid.", function () {
        var extra = buildChecklistFromTemplate(false);
        state.checklist = state.checklist.concat(extra);
        saveState(); renderChecklist(); toast("Checklist duplicated.", "success");
      });
    });

    $("#checklistContainer").addEventListener("click", function (e) {
      var toggleCat = e.target.closest("[data-toggle-cat]");
      if (toggleCat) {
        var key = toggleCat.getAttribute("data-toggle-cat");
        state.meta.collapsedCategories[key] = !state.meta.collapsedCategories[key];
        saveState(); renderChecklist(); return;
      }
      var setStatus = e.target.closest("[data-set-status]");
      if (setStatus) {
        var id = setStatus.getAttribute("data-set-status");
        var status = setStatus.getAttribute("data-status");
        var item = findChecklistItem(id);
        if (item) {
          item.status = item.status === status ? "pending" : status;
          item.datetime = item.status === "pending" ? "" : nowIso();
          if (!item.person && item.status !== "pending") item.person = state.project.engineer || "";
          item.isSample = false;
          saveState(); renderChecklist(); renderDashboardIfNeeded();
        }
        return;
      }
      var toggleItem = e.target.closest("[data-toggle-item]");
      if (toggleItem) {
        var row = toggleItem.closest(".item-row");
        row.classList.toggle("is-open");
        return;
      }
      var saveItem = e.target.closest("[data-save-item]");
      if (saveItem) {
        var itemId = saveItem.getAttribute("data-save-item");
        var row2 = saveItem.closest(".item-row");
        var it = findChecklistItem(itemId);
        if (it) {
          it.tag = row2.querySelector('[data-field="tag"]').value.trim();
          it.person = row2.querySelector('[data-field="person"]').value.trim();
          it.testResult = row2.querySelector('[data-field="testResult"]').value.trim();
          it.comment = row2.querySelector('[data-field="comment"]').value.trim();
          it.attachment = row2.querySelector('[data-field="attachment"]').value.trim();
          it.isSample = false;
          saveState(); toast("Details saved.", "success"); renderChecklist();
        }
      }
    });
  }

  function renderDashboardIfNeeded() { if (currentView === "dashboard") renderDashboard(); }

  /* ------------------------------------------------------------------ *
   * 12. FAT / SAT TEST RECORDS VIEW
   * ------------------------------------------------------------------ */

  var testModeFilterVal = "all";

  function renderTestRecords() {
    var list = state.tests.filter(function (t) { return testModeFilterVal === "all" || t.mode === testModeFilterVal; });
    list = list.slice().sort(function (a, b) { return (b.datetime || "").localeCompare(a.datetime || ""); });
    var html = list.map(function (t) {
      return '<div class="card" data-test-id="' + t.id + '">' +
        '<div class="card__title-row"><span class="card__title">' + esc(t.mode) + ' \u00b7 ' + esc(t.testId || "") + '</span>' + pillFor(t.result) + '</div>' +
        '<p style="font-weight:600;">' + esc(t.description) + '</p>' +
        '<div class="two-col">' +
          '<div><div class="text-dim" style="font-size:11.5px;">Expected</div><div>' + esc(t.expected || "\u2014") + '</div></div>' +
          '<div><div class="text-dim" style="font-size:11.5px;">Actual</div><div>' + esc(t.actual || "\u2014") + '</div></div>' +
        '</div>' +
        (t.comment ? '<p class="text-dim" style="margin-top:8px;font-size:13px;">' + esc(t.comment) + '</p>' : '') +
        '<div class="item-row__meta" style="margin-top:8px;">' +
          (t.witness ? '<span>Witness: ' + esc(t.witness) + '</span>' : '') +
          '<span>' + fmtDate(t.datetime) + '</span>' +
          (t.isSample ? '<span class="pill pill--sample">Sample</span>' : '') +
        '</div>' +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn btn--sm" data-edit-test="' + t.id + '">Edit</button>' +
          '<button class="btn btn--sm btn--danger" data-delete-test="' + t.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join("");
    if (!html) html = emptyStateHtml("No test records yet", "Tap \u201c+ New test record\u201d to log a FAT, SAT or loop test.");
    $("#testRecordList").innerHTML = html;
  }

  function pillFor(result) {
    var map = { pass: "pass", fail: "fail", pending: "pending", na: "na" };
    var cls = map[result] || "pending";
    var label = result === "na" ? "N/A" : (result ? result.charAt(0).toUpperCase() + result.slice(1) : "Pending");
    return '<span class="pill pill--' + cls + '">' + label + '</span>';
  }

  function emptyStateHtml(title, sub) {
    return '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8" stroke-linecap="round"/></svg>' +
      '<div class="empty-state__title">' + esc(title) + '</div><div class="empty-state__sub">' + esc(sub) + '</div></div>';
  }

  function testFormHtml(t) {
    t = t || { mode: "SAT", result: "pending" };
    return '<form>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Mode</label><select name="mode">' + TEST_MODES.map(function (m) { return '<option' + (m === t.mode ? " selected" : "") + '>' + m + '</option>'; }).join("") + '</select></div>' +
        '<div class="field"><label>Test ID</label><input name="testId" value="' + esc(t.testId || "") + '" placeholder="e.g. SAT-003"></div>' +
      '</div>' +
      '<div class="field"><label>Test description</label><textarea name="description" required>' + esc(t.description || "") + '</textarea></div>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Expected result</label><textarea name="expected">' + esc(t.expected || "") + '</textarea></div>' +
        '<div class="field"><label>Actual result</label><textarea name="actual">' + esc(t.actual || "") + '</textarea></div>' +
      '</div>' +
      '<div class="field"><label>Result</label><select name="result">' +
        ['pending', 'pass', 'fail', 'na'].map(function (r) { return '<option value="' + r + '"' + (r === t.result ? " selected" : "") + '>' + (r === "na" ? "N/A" : r.charAt(0).toUpperCase() + r.slice(1)) + '</option>'; }).join("") +
      '</select></div>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Witness</label><input name="witness" value="' + esc(t.witness || "") + '"></div>' +
        '<div class="field"><label>Date/time</label><input name="datetime" type="datetime-local" value="' + (t.datetime ? toLocalInputValue(t.datetime) : toLocalInputValue(nowIso())) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Comment</label><textarea name="comment">' + esc(t.comment || "") + '</textarea></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn--primary btn--block">Save test record</button></div>' +
    '</form>';
  }

  function toLocalInputValue(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function wireTestRecords() {
    $("#testModeFilter").addEventListener("change", function (e) { testModeFilterVal = e.target.value; renderTestRecords(); });
    $("#newTestBtn").addEventListener("click", function () { openTestForm(null); });
    $("#testRecordList").addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-test]");
      if (editBtn) { openTestForm(editBtn.getAttribute("data-edit-test")); return; }
      var delBtn = e.target.closest("[data-delete-test]");
      if (delBtn) {
        var id = delBtn.getAttribute("data-delete-test");
        confirmDialog("Delete test record?", "This cannot be undone.", function () {
          state.tests = state.tests.filter(function (t) { return t.id !== id; });
          saveState(); renderTestRecords(); toast("Test record deleted.", "success");
        });
      }
    });
  }

  function openTestForm(id) {
    var existing = id ? state.tests.find(function (t) { return t.id === id; }) : null;
    openSheet(existing ? "Edit test record" : "New test record", testFormHtml(existing), function (form) {
      var dtVal = form.datetime.value ? new Date(form.datetime.value).toISOString() : nowIso();
      var data = {
        mode: form.mode.value, testId: form.testId.value.trim(), description: form.description.value.trim(),
        expected: form.expected.value.trim(), actual: form.actual.value.trim(), result: form.result.value,
        witness: form.witness.value.trim(), datetime: dtVal, comment: form.comment.value.trim(), isSample: false
      };
      if (existing) { Object.assign(existing, data); }
      else { data.id = uid("tst"); state.tests.push(data); }
      saveState(); closeSheet(); renderTestRecords(); toast("Test record saved.", "success");
    });
  }

  /* ------------------------------------------------------------------ *
   * 13. PUNCH LIST VIEW
   * ------------------------------------------------------------------ */

  var punchSearchTerm = "", punchStatusFilterVal = "all";

  function nextPunchId() {
    var n = state.punch.length + 1;
    var id;
    do { id = "PL-" + String(n).padStart(3, "0"); n++; } while (state.punch.some(function (p) { return p.punchId === id; }));
    return id;
  }

  function renderPunchList() {
    var term = punchSearchTerm.trim().toLowerCase();
    var list = state.punch.filter(function (p) {
      if (punchStatusFilterVal !== "all" && p.status !== punchStatusFilterVal) return false;
      if (term) {
        var hay = (p.punchId + " " + p.description + " " + p.tag + " " + p.category + " " + p.responsible).toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
    var html = list.map(function (p) {
      var statusCls = p.status === "Open" ? "open" : p.status === "In Progress" ? "progress" : "closed";
      var prCls = p.priority === "High" ? "priority-high" : p.priority === "Medium" ? "priority-medium" : "priority-low";
      return '<div class="card" data-punch-id="' + p.id + '">' +
        '<div class="card__title-row"><span class="card__title tag-mono">' + esc(p.punchId) + '</span>' +
          '<span class="pill pill--' + statusCls + '">' + esc(p.status) + '</span></div>' +
        '<p style="font-weight:600;">' + esc(p.description) + '</p>' +
        '<div class="chip-row" style="margin-bottom:8px;">' +
          '<span class="pill pill--' + prCls + '">' + esc(p.priority) + ' priority</span>' +
          (p.tag ? '<span class="chip tag-mono">' + esc(p.tag) + '</span>' : '') +
          '<span class="chip">' + esc(p.category) + '</span>' +
          (p.isSample ? '<span class="pill pill--sample">Sample</span>' : '') +
        '</div>' +
        '<div class="item-row__meta">' +
          '<span>Raised ' + esc(p.dateRaised || "\u2014") + '</span>' +
          (p.targetDate ? '<span>Target ' + esc(p.targetDate) + '</span>' : '') +
          (p.responsible ? '<span>' + esc(p.responsible) + '</span>' : '') +
        '</div>' +
        (p.resolution ? '<p class="text-dim" style="font-size:13px;margin-top:6px;">Resolution: ' + esc(p.resolution) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn btn--sm" data-edit-punch="' + p.id + '">Edit</button>' +
          '<button class="btn btn--sm btn--danger" data-delete-punch="' + p.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join("");
    if (!html) html = emptyStateHtml("No punch items", "Tap \u201c+ Add punch item\u201d to raise one.");
    $("#punchList").innerHTML = html;
  }

  function punchFormHtml(p) {
    p = p || { status: "Open", priority: "Medium", dateRaised: todayDateStr(), punchId: nextPunchId() };
    return '<form>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Punch ID</label><input name="punchId" value="' + esc(p.punchId) + '" required></div>' +
        '<div class="field"><label>Tag / equipment</label><input name="tag" value="' + esc(p.tag || "") + '"></div>' +
      '</div>' +
      '<div class="field"><label>Description</label><textarea name="description" required>' + esc(p.description || "") + '</textarea></div>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Category</label><select name="category">' + PUNCH_CATEGORIES.map(function (c) { return '<option' + (c === p.category ? " selected" : "") + '>' + c + '</option>'; }).join("") + '</select></div>' +
        '<div class="field"><label>Priority</label><select name="priority">' + ["High", "Medium", "Low"].map(function (c) { return '<option' + (c === p.priority ? " selected" : "") + '>' + c + '</option>'; }).join("") + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Responsible person</label><input name="responsible" value="' + esc(p.responsible || "") + '"></div>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Date raised</label><input type="date" name="dateRaised" value="' + esc(p.dateRaised || "") + '"></div>' +
        '<div class="field"><label>Target date</label><input type="date" name="targetDate" value="' + esc(p.targetDate || "") + '"></div>' +
      '</div>' +
      '<div class="field"><label>Status</label><select name="status">' + ["Open", "In Progress", "Closed"].map(function (c) { return '<option' + (c === p.status ? " selected" : "") + '>' + c + '</option>'; }).join("") + '</select></div>' +
      '<div class="field"><label>Resolution</label><textarea name="resolution">' + esc(p.resolution || "") + '</textarea></div>' +
      '<div class="field"><label>Close-out date</label><input type="date" name="closeDate" value="' + esc(p.closeDate || "") + '"></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn--primary btn--block">Save punch item</button></div>' +
    '</form>';
  }

  function wirePunchList() {
    $("#punchSearch").addEventListener("input", function (e) { punchSearchTerm = e.target.value; renderPunchList(); });
    $("#punchStatusFilter").addEventListener("change", function (e) { punchStatusFilterVal = e.target.value; renderPunchList(); });
    $("#newPunchBtn").addEventListener("click", function () { openPunchForm(null); });
    $("#punchList").addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-punch]");
      if (editBtn) { openPunchForm(editBtn.getAttribute("data-edit-punch")); return; }
      var delBtn = e.target.closest("[data-delete-punch]");
      if (delBtn) {
        var id = delBtn.getAttribute("data-delete-punch");
        confirmDialog("Delete punch item?", "This cannot be undone.", function () {
          state.punch = state.punch.filter(function (p) { return p.id !== id; });
          saveState(); renderPunchList(); renderDashboardIfNeeded(); toast("Punch item deleted.", "success");
        });
      }
    });
  }

  function openPunchForm(id) {
    var existing = id ? state.punch.find(function (p) { return p.id === id; }) : null;
    openSheet(existing ? "Edit punch item" : "New punch item", punchFormHtml(existing), function (form) {
      var data = {
        punchId: form.punchId.value.trim(), tag: form.tag.value.trim(), description: form.description.value.trim(),
        category: form.category.value, priority: form.priority.value, responsible: form.responsible.value.trim(),
        dateRaised: form.dateRaised.value, targetDate: form.targetDate.value, status: form.status.value,
        resolution: form.resolution.value.trim(), closeDate: form.closeDate.value, isSample: false
      };
      if (existing) { Object.assign(existing, data); }
      else { data.id = uid("pun"); state.punch.push(data); }
      saveState(); closeSheet(); renderPunchList(); renderDashboardIfNeeded(); toast("Punch item saved.", "success");
    });
  }

  /* ------------------------------------------------------------------ *
   * 14. DAILY LOG VIEW
   * ------------------------------------------------------------------ */

  function renderDailyLog() {
    var list = state.dailyLogs.slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var html = list.map(function (l) {
      return '<div class="card" data-log-id="' + l.id + '">' +
        '<div class="card__title-row"><span class="card__title">' + esc(l.date) + '</span>' + (l.isSample ? '<span class="pill pill--sample">Sample</span>' : '') + '</div>' +
        (l.location ? '<p class="text-dim" style="font-size:13px;">' + esc(l.location) + '</p>' : '') +
        '<p><b>Activities:</b> ' + esc(l.activities || "\u2014") + '</p>' +
        (l.problems ? '<p><b>Problems:</b> ' + esc(l.problems) + '</p>' : '') +
        (l.remaining ? '<p><b>Remaining:</b> ' + esc(l.remaining) + '</p>' : '') +
        '<div class="item-row__meta">' +
          (l.manHours ? '<span>' + esc(l.manHours) + ' man-hours</span>' : '') +
          (l.materials ? '<span>' + esc(l.materials) + '</span>' : '') +
        '</div>' +
        (l.nextPlan ? '<p class="text-dim" style="font-size:13px;margin-top:6px;">Next: ' + esc(l.nextPlan) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:10px;">' +
          '<button class="btn btn--sm" data-edit-log="' + l.id + '">Edit</button>' +
          '<button class="btn btn--sm btn--danger" data-delete-log="' + l.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join("");
    if (!html) html = emptyStateHtml("No daily log entries", "Tap \u201c+ New daily log entry\u201d to record today's progress.");
    $("#dailyLogList").innerHTML = html;
  }

  function dailyLogFormHtml(l) {
    l = l || { date: todayDateStr() };
    return '<form>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Date</label><input type="date" name="date" value="' + esc(l.date) + '" required></div>' +
        '<div class="field"><label>Location</label><input name="location" value="' + esc(l.location || "") + '"></div>' +
      '</div>' +
      '<div class="field"><label>Activities completed</label><textarea name="activities">' + esc(l.activities || "") + '</textarea></div>' +
      '<div class="field"><label>Problems encountered</label><textarea name="problems">' + esc(l.problems || "") + '</textarea></div>' +
      '<div class="field"><label>Work remaining</label><textarea name="remaining">' + esc(l.remaining || "") + '</textarea></div>' +
      '<div class="field-grid">' +
        '<div class="field"><label>Man-hours</label><input name="manHours" value="' + esc(l.manHours || "") + '"></div>' +
        '<div class="field"><label>Materials / tools required</label><input name="materials" value="' + esc(l.materials || "") + '"></div>' +
      '</div>' +
      '<div class="field"><label>Client/contractor coordination</label><textarea name="coordination">' + esc(l.coordination || "") + '</textarea></div>' +
      '<div class="field"><label>Next-day plan</label><textarea name="nextPlan">' + esc(l.nextPlan || "") + '</textarea></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn--primary btn--block">Save log entry</button></div>' +
    '</form>';
  }

  function wireDailyLog() {
    $("#newDailyBtn").addEventListener("click", function () { openDailyLogForm(null); });
    $("#dailyLogList").addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-log]");
      if (editBtn) { openDailyLogForm(editBtn.getAttribute("data-edit-log")); return; }
      var delBtn = e.target.closest("[data-delete-log]");
      if (delBtn) {
        var id = delBtn.getAttribute("data-delete-log");
        confirmDialog("Delete log entry?", "This cannot be undone.", function () {
          state.dailyLogs = state.dailyLogs.filter(function (l) { return l.id !== id; });
          saveState(); renderDailyLog(); toast("Log entry deleted.", "success");
        });
      }
    });
  }

  function openDailyLogForm(id) {
    var existing = id ? state.dailyLogs.find(function (l) { return l.id === id; }) : null;
    openSheet(existing ? "Edit daily log" : "New daily log entry", dailyLogFormHtml(existing), function (form) {
      var data = {
        date: form.date.value, location: form.location.value.trim(), activities: form.activities.value.trim(),
        problems: form.problems.value.trim(), remaining: form.remaining.value.trim(), manHours: form.manHours.value.trim(),
        materials: form.materials.value.trim(), coordination: form.coordination.value.trim(), nextPlan: form.nextPlan.value.trim(), isSample: false
      };
      if (existing) { Object.assign(existing, data); }
      else { data.id = uid("log"); state.dailyLogs.push(data); }
      saveState(); closeSheet(); renderDailyLog(); toast("Log entry saved.", "success");
    });
  }

  /* ------------------------------------------------------------------ *
   * 15. REPORTS / EXPORT / IMPORT
   * ------------------------------------------------------------------ */

  function reportShell(title, bodyHtml) {
    var p = state.project;
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;}h1{font-size:20px;margin-bottom:2px;}' +
      '.meta{color:#555;font-size:12.5px;margin-bottom:18px;}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:22px;}' +
      'th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top;}th{background:#f0f4f8;}' +
      'h2{font-size:14px;margin-top:26px;border-bottom:2px solid #0891B2;padding-bottom:4px;}' +
      '.disclaimer{font-size:11px;color:#666;border-left:3px solid #0891B2;padding:8px 10px;background:#f6fafd;margin-top:26px;}' +
      '@media print{body{margin:12mm;}}</style></head><body>' +
      '<h1>' + esc(title) + '</h1>' +
      '<div class="meta">' + esc(p.name || "Untitled project") + (p.projectId ? " \u00b7 " + esc(p.projectId) : "") +
        (p.client ? " \u00b7 Client: " + esc(p.client) : "") + (p.site ? " \u00b7 Site: " + esc(p.site) : "") +
        " \u00b7 Generated " + new Date().toLocaleString() + '</div>' +
      bodyHtml +
      '<div class="disclaimer">This report is for commissioning documentation purposes only. Always follow approved project procedures, permit-to-work requirements, site safety rules and authorized testing procedures.</div>' +
      '</body></html>';
  }

  function tableFromRows(headers, rows) {
    return '<table><thead><tr>' + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + '</tr></thead><tbody>' +
      rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table>';
  }

  function buildChecklistReport() {
    var body = CHECKLIST_TEMPLATE.map(function (cat) {
      var items = state.checklist.filter(function (i) { return i.category === cat.key; });
      if (!items.length) return "";
      return "<h2>" + esc(cat.key + " \u00b7 " + cat.label) + "</h2>" +
        tableFromRows(["Item", "Tag", "Status", "Result", "Person", "Date", "Comment"], items.map(function (i) {
          return [i.text, i.tag, i.status.toUpperCase(), i.testResult, i.person, i.datetime ? fmtDate(i.datetime) : "", i.comment];
        }));
    }).join("");
    return reportShell("Commissioning Checklist Report", body);
  }

  function buildTestReport(mode) {
    var items = state.tests.filter(function (t) { return t.mode === mode; });
    var body = tableFromRows(["Test ID", "Description", "Expected", "Actual", "Result", "Witness", "Date"], items.map(function (t) {
      return [t.testId, t.description, t.expected, t.actual, t.result.toUpperCase(), t.witness, fmtDate(t.datetime)];
    }));
    if (!items.length) body = "<p>No " + esc(mode) + " test records recorded yet.</p>";
    return reportShell(mode + " Test Report", body);
  }

  function buildDailyReport() {
    var body = state.dailyLogs.slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); }).map(function (l) {
      return "<h2>" + esc(l.date) + (l.location ? " \u2014 " + esc(l.location) : "") + "</h2>" +
        "<p><b>Activities:</b> " + esc(l.activities || "\u2014") + "</p>" +
        "<p><b>Problems:</b> " + esc(l.problems || "\u2014") + "</p>" +
        "<p><b>Remaining:</b> " + esc(l.remaining || "\u2014") + "</p>" +
        "<p><b>Man-hours:</b> " + esc(l.manHours || "\u2014") + " &nbsp; <b>Materials:</b> " + esc(l.materials || "\u2014") + "</p>" +
        "<p><b>Coordination:</b> " + esc(l.coordination || "\u2014") + "</p>" +
        "<p><b>Next-day plan:</b> " + esc(l.nextPlan || "\u2014") + "</p>";
    }).join("<hr>");
    return reportShell("Daily Commissioning Report", body || "<p>No daily log entries recorded yet.</p>");
  }

  function buildSummaryReport() {
    var stats = computeStats();
    var catStats = computeCategoryStats();
    var body = "<h2>Overall progress</h2>" +
      "<p>" + stats.pct + "% complete (" + stats.completed + " / " + stats.total + " items). Passed: " + stats.pass + ", Failed: " + stats.fail + ", Pending: " + stats.pending + ", N/A: " + stats.na + ". Open punch items: " + stats.punchOpen + ".</p>" +
      "<h2>Completion by category</h2>" +
      tableFromRows(["Category", "Completed", "Total", "% Complete"], catStats.map(function (c) { return [c.key + " - " + c.label, c.completed, c.total, c.pct + "%"]; })) +
      "<h2>Punch list summary</h2>" +
      tableFromRows(["ID", "Description", "Priority", "Status", "Responsible"], state.punch.map(function (p) { return [p.punchId, p.description, p.priority, p.status, p.responsible]; }));
    return reportShell("Project Summary Report", body);
  }

  function exportPunchCsv() {
    var headers = ["Punch ID", "Description", "Category", "Tag", "Priority", "Responsible", "Date Raised", "Target Date", "Status", "Resolution", "Close-out Date"];
    var rows = state.punch.map(function (p) {
      return [p.punchId, p.description, p.category, p.tag, p.priority, p.responsible, p.dateRaised, p.targetDate, p.status, p.resolution, p.closeDate];
    });
    var csv = headers.map(csvEscape).join(",") + "\n" + rows.map(function (r) { return r.map(csvEscape).join(","); }).join("\n");
    downloadBlob("punch-list.csv", csv, "text/csv");
  }

  function exportChecklistCsv() {
    var headers = ["Category", "Item", "Tag", "Status", "Result", "Person", "Date", "Comment"];
    var rows = state.checklist.map(function (i) {
      return [i.category + " - " + i.categoryLabel, i.text, i.tag, i.status, i.testResult, i.person, i.datetime, i.comment];
    });
    var csv = headers.map(csvEscape).join(",") + "\n" + rows.map(function (r) { return r.map(csvEscape).join(","); }).join("\n");
    downloadBlob("checklist.csv", csv, "text/csv");
  }

  function exportJson() {
    downloadBlob("commissioning-checklist-backup-" + todayDateStr() + ".json", JSON.stringify(state, null, 2), "application/json");
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !parsed.project || !parsed.checklist) throw new Error("bad shape");
        confirmDialog("Import backup?", "This replaces all current data on this device with the contents of the backup file.", function () {
          state = parsed;
          if (!state.meta) state.meta = { createdAt: nowIso(), collapsedCategories: {} };
          if (!state.tests) state.tests = [];
          if (!state.punch) state.punch = [];
          if (!state.dailyLogs) state.dailyLogs = [];
          saveState(); navigate("dashboard"); toast("Backup imported.", "success");
        });
      } catch (e) {
        toast("That file doesn't look like a valid backup.", "error");
      }
    };
    reader.readAsText(file);
  }

  function wireReports() {
    $all("[data-report]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var type = btn.getAttribute("data-report");
        if (type === "checklist") downloadBlob("checklist-report.html", buildChecklistReport(), "text/html");
        else if (type === "fat") downloadBlob("fat-report.html", buildTestReport("FAT"), "text/html");
        else if (type === "sat") downloadBlob("sat-report.html", buildTestReport("SAT"), "text/html");
        else if (type === "punch") exportPunchCsv();
        else if (type === "daily") downloadBlob("daily-commissioning-report.html", buildDailyReport(), "text/html");
        else if (type === "summary") downloadBlob("project-summary.html", buildSummaryReport(), "text/html");
        toast("Report downloaded.", "success");
      });
    });
    $("#exportJsonBtn").addEventListener("click", exportJson);
    $("#exportChecklistCsvBtn").addEventListener("click", exportChecklistCsv);
    $("#importJsonInput").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = "";
    });
    $("#deleteAllBtn").addEventListener("click", function () {
      confirmDialog("Delete all local data?", "This permanently erases the project, checklist, tests, punch list and daily logs stored on this device. This cannot be undone.", function () {
        localStorage.removeItem(STORAGE_KEY);
        state = buildSampleState();
        state.project = emptyProject();
        state.checklist = buildChecklistFromTemplate(false);
        saveState();
        navigate("dashboard");
        toast("All local data deleted.", "success");
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 16. QUICK ACTIONS / MISC WIRING
   * ------------------------------------------------------------------ */

  function wireQuickActions() {
    $all("[data-nav]").forEach(function (el) {
      el.addEventListener("click", function () { navigate(el.getAttribute("data-nav")); });
    });
    $("[data-action='open-loop-check']") && $("[data-action='open-loop-check']").addEventListener("click", function () {
      navigate("fatsat");
      setTimeout(function () {
        testModeFilterVal = "Loop Check"; $("#testModeFilter").value = "Loop Check"; renderTestRecords();
        openTestForm(null);
        $("#sheetBody select[name='mode']").value = "Loop Check";
      }, 30);
    });
    var punchQa = document.querySelector("[data-action='new-punch']");
    if (punchQa) punchQa.addEventListener("click", function () { setTimeout(function () { openPunchForm(null); }, 30); });
    var dailyQa = document.querySelector("[data-action='new-daily']");
    if (dailyQa) dailyQa.addEventListener("click", function () { setTimeout(function () { openDailyLogForm(null); }, 30); });
  }

  function wireSheetChrome() {
    $("#sheetCloseBtn").addEventListener("click", closeSheet);
    $("#sheetOverlay").addEventListener("click", function (e) { if (e.target.id === "sheetOverlay") closeSheet(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeSheet(); $("#confirmOverlay").classList.remove("is-open"); }
    });
  }

  /* ------------------------------------------------------------------ *
   * 17. THEME
   * ------------------------------------------------------------------ */

  function applyStoredTheme() {
    var t = localStorage.getItem("ccp_theme_v1");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  }
  function wireTheme() {
    $("#themeToggleBtn").addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      }
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("ccp_theme_v1", next);
    });
  }

  /* ------------------------------------------------------------------ *
   * 18. ONLINE / OFFLINE STATUS
   * ------------------------------------------------------------------ */

  function updateNetStatus() {
    var online = navigator.onLine;
    $("#netStatus").classList.toggle("is-offline", !online);
    $("#netStatusLabel").textContent = online ? "Online" : "Offline";
  }

  /* ------------------------------------------------------------------ *
   * 19. INIT
   * ------------------------------------------------------------------ */

  function init() {
    applyStoredTheme();
    state = loadState();
    if (!state.meta) state.meta = { createdAt: nowIso(), collapsedCategories: {} };
    if (!state.tests) state.tests = [];
    if (!state.punch) state.punch = [];
    if (!state.dailyLogs) state.dailyLogs = [];
    saveState();

    wireSetup(); wireChecklist(); wireTestRecords(); wirePunchList(); wireDailyLog();
    wireReports(); wireQuickActions(); wireSheetChrome(); wireTheme();

    updateNetStatus();
    window.addEventListener("online", updateNetStatus);
    window.addEventListener("offline", updateNetStatus);

    navigate("dashboard");

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("service-worker.js").catch(function () { /* offline-first still works without it */ });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
