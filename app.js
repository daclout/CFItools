// app.js -- CFI Endorsements web app
// Vanilla JS, no build step, no framework. Reads ENDORSEMENT_DATA / CATEGORY_ORDER /
// CATEGORY_DISPLAY / TRACK_DISPLAY from data.js (loaded before this file).

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function byId(id) {
    return ENDORSEMENT_DATA.find(function (e) { return e.id === id; });
  }

  function isVerbatimOrSecondary(templateSource) {
    if (!templateSource) return false;
    return templateSource.indexOf("Verbatim") === 0 || templateSource.indexOf("Reproduced") === 0;
  }

  function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function daysBetween(a, b) {
    var MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY);
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function addMonths(date, n) {
    var d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function computeDueDate(entry) {
    var endorsement = byId(entry.endorsementId);
    if (!endorsement) return null;
    var v = endorsement.validity;
    if (v.type === "days") return addDays(new Date(entry.dateIssued), v.value);
    if (v.type === "calendarMonths") return addMonths(new Date(entry.dateIssued), v.value);
    return null;
  }

  // ---------------------------------------------------------------------
  // Persistent log (localStorage)
  // ---------------------------------------------------------------------

  var LOG_STORAGE_KEY = "cfiEndorsements.log.v1";

  var LogStore = {
    entries: [],

    load: function () {
      try {
        var raw = window.localStorage.getItem(LOG_STORAGE_KEY);
        this.entries = raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.warn("Could not load log from localStorage:", err);
        this.entries = [];
      }
      this.sort();
    },

    save: function () {
      try {
        window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.entries));
      } catch (err) {
        console.warn("Could not save log to localStorage:", err);
      }
    },

    sort: function () {
      this.entries.sort(function (a, b) {
        return new Date(b.dateIssued) - new Date(a.dateIssued);
      });
    },

    add: function (entry) {
      entry.id = "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      this.entries.push(entry);
      this.sort();
      this.save();
    },

    remove: function (id) {
      this.entries = this.entries.filter(function (e) { return e.id !== id; });
      this.save();
    }
  };

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------

  var state = {
    tab: "helicopter",
    sfar: { model: "r22", role: "student" },
    library: { search: "", track: "" },
    modalEndorsementId: null,
    logFormEndorsementId: null, // set when "Log This Endorsement" opened the inline form
    expandedRatingId: null // which rating card is expanded in "Certification Requirements"
  };

  var SFAR_ROLES = [
    { key: "student", label: "Student pilot soloing" },
    { key: "ratedLowTime", label: "Rated pilot, low time in type" },
    { key: "ratedExperienced", label: "Rated pilot, meets 200/50-hr experience" },
    { key: "cfiSeekingAuth", label: "CFI seeking to instruct in type" },
    { key: "currentPICPassengers", label: "Current PIC wanting to carry passengers" }
  ];

  function sfarApplicableIds() {
    var model = state.sfar.model; // 'r22' | 'r44'
    var role = state.sfar.role;
    var ids = ["A.56"]; // ground training applies to everyone touching the controls

    var picId = model === "r22" ? "A.58" : "A.62";
    var soloId = model === "r22" ? "A.57" : "A.61";
    var cfiId = model === "r22" ? "A.59" : "A.63";
    var reviewId = model === "r22" ? "A.60" : "A.64";

    if (role === "student") {
      ids = ids.concat(["A.3", "A.4", soloId]);
    } else if (role === "ratedLowTime") {
      ids = ids.concat([picId]);
    } else if (role === "ratedExperienced") {
      ids = ids.concat(["SFAR-2d"]);
    } else if (role === "cfiSeekingAuth") {
      ids = ids.concat([cfiId]);
    } else if (role === "currentPICPassengers") {
      ids = ids.concat(["SFAR-2d", reviewId]);
    }
    return ids;
  }

  // ---------------------------------------------------------------------
  // Rendering: shared row/list helpers
  // ---------------------------------------------------------------------

  function rowHtml(e) {
    return (
      '<div class="row" data-open-detail="' + e.id + '">' +
        '<div class="row-icon">' + e.categorySymbol + "</div>" +
        '<div class="row-body">' +
          '<div class="row-title">' + escapeHtml(e.title) + "</div>" +
          '<div class="row-subtitle">' + escapeHtml(e.id) + " · " + escapeHtml(e.citation) + "</div>" +
        "</div>" +
        '<div class="row-chevron">&#8250;</div>' +
      "</div>"
    );
  }

  function sectionHtml(headerText, items) {
    if (!items.length) return "";
    return (
      '<div class="section">' +
        '<div class="section-header">' + escapeHtml(headerText) + "</div>" +
        '<div class="card-list">' + items.map(rowHtml).join("") + "</div>" +
      "</div>"
    );
  }

  function groupedGeneralSections(excludeCategories) {
    excludeCategories = excludeCategories || [];
    var html = "";
    CATEGORY_ORDER.forEach(function (catKey) {
      if (excludeCategories.indexOf(catKey) !== -1) return;
      var items = ENDORSEMENT_DATA.filter(function (e) {
        return e.trackKey === "general" && e.categoryKey === catKey;
      });
      html += sectionHtml(CATEGORY_DISPLAY[catKey], items);
    });
    return html;
  }

  // ---------------------------------------------------------------------
  // Helicopter tab
  // ---------------------------------------------------------------------

  function renderHelicopter() {
    var standard = ENDORSEMENT_DATA.filter(function (e) {
      return e.trackKey === "heli" && e.categoryKey !== "sfar73";
    });

    var applicable = sfarApplicableIds().map(byId).filter(Boolean);

    var html = "";
    html += '<div class="intro-card"><h2>Helicopter Endorsements</h2>' +
      "<p>Everything a helicopter CFI needs: SFAR 73 for Robinson R22/R44, standard " +
      "helicopter-specific endorsements, and the general endorsements every student " +
      "or pilot needs regardless of category.</p></div>";

    // --- SFAR 73 subcategory, with its own guided picker ---
    html += '<div class="section"><div class="section-header">SFAR 73 — Robinson R22/R44</div>';
    html += '<div class="callout">';
    html += "<p>Special Federal Aviation Regulation No. 73 covers anyone who manipulates the " +
      "controls, acts as PIC, provides training, or conducts a flight review in a Robinson " +
      "R22 or R44 — layered on top of standard Part 61 requirements. It expires August 22, " +
      "2029 unless revised or rescinded sooner.</p>";
    html += "</div>";

    html += '<div class="card-list" style="margin-bottom:12px; padding:14px;">';
    html += '<div class="section-header" style="padding:0 0 6px;">Aircraft</div>';
    html += '<div class="segmented" id="sfar-model-toggle">' +
      '<button data-model="r22" class="' + (state.sfar.model === "r22" ? "active" : "") + '">Robinson R22</button>' +
      '<button data-model="r44" class="' + (state.sfar.model === "r44" ? "active" : "") + '">Robinson R44</button>' +
      "</div>";
    html += '<div class="section-header" style="padding:14px 0 6px;">Pilot Scenario</div>';
    html += '<select id="sfar-role-select">' + SFAR_ROLES.map(function (r) {
      return '<option value="' + r.key + '"' + (r.key === state.sfar.role ? " selected" : "") + ">" + escapeHtml(r.label) + "</option>";
    }).join("") + "</select>";
    html += "</div>";

    html += '<div class="card-list">' + applicable.map(rowHtml).join("") + "</div>";

    if (state.sfar.role === "student") {
      var studentPicId = state.sfar.model === "r22" ? "A.58" : "A.62";
      var studentParagraph = state.sfar.model === "r22" ? "1" : "2";
      html += '<div class="callout" style="margin-top:12px;"><h3>What\'s Next</h3>' +
        "<p><strong>The solo endorsement above doesn't carry over.</strong> Once this student earns a " +
        "rotorcraft category and helicopter class rating, they'll need a separate SFAR 73 PIC " +
        "endorsement -- " + studentPicId + " for the " + (state.sfar.model === "r22" ? "Robinson R22" : "Robinson R44") +
        " -- before acting as pilot in command. It's a different requirement under § 2(b)(" + studentParagraph +
        ")(ii), not an extension of today's solo endorsement.</p></div>";
    }

    if (state.sfar.role === "ratedLowTime") {
      html += '<div class="callout" style="margin-top:12px;"><h3>12-Month Provisional Window</h3>' +
        "<p>A pilot who qualifies via the 10-hour add-on training pathway (rather than 200 total / " +
        "50 hours in type) loses PIC privileges 12 calendar months after that endorsement's date " +
        "unless a full SFAR flight review is completed in the specific model by then. Track the " +
        "10-hour endorsement's issue date in My Log to get ahead of this deadline.</p></div>";
    }
    html += "</div>"; // end SFAR 73 section

    html += renderRatingRequirementsSection();
    html += sectionHtml("Standard Helicopter Endorsements", standard);
    html += groupedGeneralSections();

    return html;
  }

  function ratingCardHtml(r) {
    var expanded = state.expandedRatingId === r.id;
    var html = '<div class="rating-card">';
    html += '<div class="rating-card-header" data-toggle-rating="' + r.id + '">';
    html += '<div class="rating-card-title-row">';
    html += '<div class="rating-card-name">' + escapeHtml(r.ratingName) + "</div>";
    html += '<div class="rating-card-chevron">' + (expanded ? "&#9660;" : "&#9654;") + "</div>";
    html += "</div>";
    html += '<div class="rating-card-citation">' + escapeHtml(r.citation) + "</div>";
    html += '<div class="rating-card-hours">' + escapeHtml(r.totalHoursLabel) + "</div>";
    html += "</div>";
    if (expanded) {
      html += '<div class="rating-card-body">';
      html += "<ul>" + r.breakdown.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") + "</ul>";
      if (r.notes) {
        html += '<div class="rating-card-notes">' + escapeHtml(r.notes) + "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderRatingRequirementsSection() {
    var html = '<div class="section"><div class="section-header">Certification Requirements</div>';
    html += '<div class="callout"><p>FAR Part 61 aeronautical experience (hour) requirements for each ' +
      "helicopter rating. Tap a rating to see the full breakdown.</p></div>";
    html += '<div class="rating-card-list">' + RATING_REQUIREMENTS.map(ratingCardHtml).join("") + "</div>";
    html += "</div>";
    return html;
  }

  function bindRatingRequirementsEvents(root) {
    root.querySelectorAll("[data-toggle-rating]").forEach(function (header) {
      header.addEventListener("click", function () {
        var id = header.getAttribute("data-toggle-rating");
        state.expandedRatingId = (state.expandedRatingId === id) ? null : id;
        renderApp();
      });
    });
  }

  function bindHelicopterEvents(root) {
    bindRatingRequirementsEvents(root);
    var toggle = root.querySelector("#sfar-model-toggle");
    if (toggle) {
      toggle.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.sfar.model = btn.getAttribute("data-model");
          renderApp();
        });
      });
    }
    var roleSelect = root.querySelector("#sfar-role-select");
    if (roleSelect) {
      roleSelect.addEventListener("change", function () {
        state.sfar.role = roleSelect.value;
        renderApp();
      });
    }
  }

  // ---------------------------------------------------------------------
  // Fixed Wing tab
  // ---------------------------------------------------------------------

  function renderFixedWing() {
    var fixedWing = ENDORSEMENT_DATA.filter(function (e) { return e.trackKey === "fixed"; });
    var html = "";
    html += '<div class="intro-card"><h2>Fixed Wing Endorsements</h2>' +
      "<p>Airplane-specific endorsements — complex, high-performance, high-altitude, tailwheel, " +
      "spin training, and enhanced flight vision systems — plus the general endorsements every " +
      "fixed-wing student or pilot also needs.</p></div>";
    html += sectionHtml("Fixed-Wing-Specific Endorsements", fixedWing);
    html += groupedGeneralSections();
    return html;
  }

  // ---------------------------------------------------------------------
  // Library tab
  // ---------------------------------------------------------------------

  function renderLibrary() {
    var q = state.library.search.trim().toLowerCase();
    var track = state.library.track;

    var filtered = ENDORSEMENT_DATA.filter(function (e) {
      if (track && e.trackKey !== track) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().indexOf(q) !== -1 ||
        e.id.toLowerCase().indexOf(q) !== -1 ||
        e.citation.toLowerCase().indexOf(q) !== -1 ||
        e.trigger.toLowerCase().indexOf(q) !== -1
      );
    });

    var html = "";
    html += '<div class="control-bar">';
    html += '<input type="search" class="search-box" id="library-search" placeholder="Search by title, citation, or ID" value="' + escapeHtml(state.library.search) + '">';
    html += '<select class="track-select" id="library-track">';
    html += '<option value=""' + (track === "" ? " selected" : "") + ">All Tracks</option>";
    Object.keys(TRACK_DISPLAY).forEach(function (k) {
      html += '<option value="' + k + '"' + (track === k ? " selected" : "") + ">" + escapeHtml(TRACK_DISPLAY[k]) + "</option>";
    });
    html += "</select>";
    html += "</div>";

    var any = false;
    CATEGORY_ORDER.forEach(function (catKey) {
      var items = filtered.filter(function (e) { return e.categoryKey === catKey; });
      if (items.length) any = true;
      html += sectionHtml(CATEGORY_DISPLAY[catKey], items);
    });

    if (!any) {
      html += '<div class="empty-state"><div class="emoji">🔍</div>No matching endorsements</div>';
    }
    return html;
  }

  function bindLibraryEvents(root) {
    var search = root.querySelector("#library-search");
    if (search) {
      search.addEventListener("input", function () {
        state.library.search = search.value;
        renderApp({ preserveFocus: "#library-search" });
      });
    }
    var trackSel = root.querySelector("#library-track");
    if (trackSel) {
      trackSel.addEventListener("change", function () {
        state.library.track = trackSel.value;
        renderApp();
      });
    }
  }

  // ---------------------------------------------------------------------
  // My Log tab
  // ---------------------------------------------------------------------

  function dueInfo(entry) {
    var due = computeDueDate(entry);
    if (!due) return { text: "", cls: "ok" };
    var days = daysBetween(new Date(), due);
    if (days < 0) return { text: "Past due since " + formatDate(due), cls: "past" };
    if (days <= 14) return { text: "Due " + formatDate(due) + " (" + days + " days)", cls: "soon" };
    return { text: "Due " + formatDate(due) + " (" + days + " days)", cls: "ok" };
  }

  function logEntryHtml(entry) {
    var endorsement = byId(entry.endorsementId);
    var info = dueInfo(entry);
    return (
      '<div class="log-entry">' +
        '<div class="log-entry-top">' +
          '<div class="log-entry-name">' + escapeHtml(entry.personName) + "</div>" +
          '<div class="log-entry-date">' + formatDate(new Date(entry.dateIssued)) + "</div>" +
        "</div>" +
        '<div class="log-entry-title">' + escapeHtml(endorsement ? endorsement.title : entry.endorsementId) + "</div>" +
        (entry.aircraft ? '<div class="log-entry-aircraft">' + escapeHtml(entry.aircraft) + "</div>" : "") +
        (info.text ? '<div class="log-entry-due ' + info.cls + '">' + escapeHtml(info.text) + "</div>" : "") +
        '<div class="log-entry-actions"><button class="btn-danger" data-remove-log="' + entry.id + '">Delete</button></div>' +
      "</div>"
    );
  }

  function csvEscape(val) {
    if (val == null) return "";
    var s = String(val);
    if (/["\r\n,]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildLogCsv() {
    var header = ["Person/Pilot Name", "Endorsement ID", "Endorsement Title", "Citation", "Aircraft", "Date Issued", "Due Date", "Notes"];
    var rows = [header];
    LogStore.entries.forEach(function (entry) {
      var endorsement = byId(entry.endorsementId);
      var due = computeDueDate(entry);
      rows.push([
        entry.personName,
        entry.endorsementId,
        endorsement ? endorsement.title : "",
        endorsement ? endorsement.citation : "",
        entry.aircraft || "",
        formatDate(new Date(entry.dateIssued)),
        due ? formatDate(due) : "",
        entry.notes || ""
      ]);
    });
    return rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\r\n");
  }

  function exportLogCsv() {
    var csv = buildLogCsv();
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      // Extremely old/unsupported browser -- fall back to a data: URI so the
      // download still works rather than silently doing nothing.
      var dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      window.open(dataUri);
      return;
    }
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "cfi-endorsement-log-" + today + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderLog() {
    var upcoming = LogStore.entries.filter(function (e) { return computeDueDate(e) !== null; })
      .slice()
      .sort(function (a, b) { return computeDueDate(a) - computeDueDate(b); });

    var html = "";
    html += '<div class="control-bar" style="justify-content: space-between;">';
    html += '<button class="btn-secondary" id="log-back-btn">&larr; Back to Helicopter</button>';
    html += '<button class="btn-secondary" id="log-export-btn"' + (LogStore.entries.length ? "" : " disabled") + '>Export Log (CSV)</button>';
    html += "</div>";

    if (upcoming.length) {
      html += '<div class="section"><div class="section-header">Coming Due</div>' +
        upcoming.map(logEntryHtml).join("") + "</div>";
    }
    html += '<div class="section"><div class="section-header">All Logged Endorsements</div>';
    if (!LogStore.entries.length) {
      html += '<div class="empty-state">Nothing logged yet. Open any endorsement and tap ' +
        '"Log This Endorsement" to track it here.</div>';
    } else {
      html += LogStore.entries.map(logEntryHtml).join("");
    }
    html += "</div>";
    return html;
  }

  function bindLogEvents(root) {
    root.querySelectorAll("[data-remove-log]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        LogStore.remove(btn.getAttribute("data-remove-log"));
        renderApp();
      });
    });

    var backBtn = root.querySelector("#log-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        state.tab = "helicopter";
        renderApp();
      });
    }

    var exportBtn = root.querySelector("#log-export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        if (LogStore.entries.length) exportLogCsv();
      });
    }
  }

  // ---------------------------------------------------------------------
  // About tab
  // ---------------------------------------------------------------------

  function renderAbout() {
    return (
      '<div class="intro-card"><h2>About This App</h2>' +
      "<p>CFI Endorsements helps flight instructors quickly determine which FAA logbook " +
      "endorsements a student or pilot needs -- from first solo through CFI/CFII -- and shows " +
      "the actual wording to write in the logbook. The Helicopter tab covers SFAR 73 for " +
      "Robinson R22/R44 helicopters as a nested subcategory, FAR Part 61 hour requirements " +
      "for each helicopter rating, plus standard helicopter endorsements like night vision " +
      "goggles. The Fixed Wing tab covers complex, high-performance, high-altitude, " +
      "tailwheel, spin training, and enhanced flight vision system endorsements.</p></div>" +

      '<div class="section"><div class="section-header">Sources</div><div class="card-list">' +
        '<div class="about-list-item">📄 14 CFR Part 61 (eCFR)</div>' +
        '<div class="about-list-item">📄 SFAR 73, Appendix to 14 CFR Part 61 (eCFR)</div>' +
        '<div class="about-list-item">📄 FAA Advisory Circular 61-65H, Appendix A (8/27/18)</div>' +
        '<div class="about-list-item" style="font-size:12px;color:var(--text-secondary);">' +
          "Content compiled from primary sources as of June 2026. SFAR 73 is currently set to " +
          "expire August 22, 2029 unless revised or rescinded sooner. Endorsement IDs (e.g. " +
          '"A.41") follow AC 61-65H\'s own Appendix A numbering, not a later revision\'s.' +
        "</div>" +
      "</div></div>" +

      '<div class="section"><div class="section-header">Logbook Wording Confidence</div><div class="card-list">' +
        '<div class="about-list-item">✅ <div><strong>Verbatim or reproduced from AC 61-65H.</strong> ' +
          "Read directly from the FAA's AC 61-65H PDF, or reproduced from a secondary source that " +
          "quotes the AC directly.</div></div>" +
        '<div class="about-list-item">⚠️ <div><strong>Suggested wording -- unconfirmed.</strong> ' +
          "This app's research could not independently confirm AC 61-65H's exact phrasing for that " +
          "item. The wording shown follows the AC's own sentence patterns but is not a verified " +
          "quotation -- verify against your own current copy of the AC before signing.</div></div>" +
      "</div></div>" +

      '<div class="callout"><h3>Important Disclaimer</h3>' +
      "<p>This app is a study and reference aid. It is not legal advice and is not a substitute " +
      "for the current regulatory text or the current edition of AC 61-65. Regulations and AC " +
      "revisions change — always verify citations, requirements, and exact logbook wording " +
      "against the current eCFR (ecfr.gov) and the current AC 61-65 revision before signing any " +
      "endorsement, especially for high-consequence items like SFAR 73 helicopter " +
      "endorsements.</p></div>" +

      '<div class="callout"><h3>Data Privacy</h3>' +
      '<p>Everything logged in "My Log" is stored only in this browser\'s local storage on this ' +
      "device. Nothing is uploaded or shared. Clearing your browser data/site data for this page " +
      "will erase it.</p></div>"
    );
  }

  // ---------------------------------------------------------------------
  // Detail modal
  // ---------------------------------------------------------------------

  function openDetail(id) {
    state.modalEndorsementId = id;
    state.logFormEndorsementId = null;
    renderModal();
  }

  function closeDetail() {
    state.modalEndorsementId = null;
    state.logFormEndorsementId = null;
    renderModal();
  }

  function renderModal() {
    var backdrop = document.getElementById("modal-backdrop");
    var sheet = document.getElementById("modal-sheet-body");
    if (!state.modalEndorsementId) {
      backdrop.classList.remove("active");
      sheet.innerHTML = "";
      return;
    }
    var e = byId(state.modalEndorsementId);
    if (!e) { backdrop.classList.remove("active"); return; }

    var html = "";
    html += '<div class="detail-title-row">';
    html += '<span class="detail-category">' + e.categorySymbol + " " + escapeHtml(e.category) + "</span>";
    if (e.trackKey !== "general") {
      html += '<span class="badge track-' + e.trackKey + '">' + escapeHtml(e.track) + "</span>";
    }
    html += "</div>";
    html += '<div class="detail-title">' + escapeHtml(e.title) + "</div>";

    function row(label, value, emphasize) {
      return '<div class="detail-row"><div class="detail-label">' + escapeHtml(label) + "</div>" +
        '<div class="detail-value' + (emphasize ? " emphasize" : "") + '">' + escapeHtml(value) + "</div></div>";
    }

    var acRef = (e.id === "SFAR-2d")
      ? "Not itemized in AC 61-65H Appendix A (currency requirement, not a signed endorsement)"
      : (e.id === "61.195h")
        ? "Not itemized in AC 61-65H Appendix A (discussed in the AC's body text only)"
        : "AC 61-65H, Appendix " + e.id;

    html += row("AC 61-65H Reference", acRef);
    html += row("Citation", e.citation);
    html += row("Who / Trigger", e.trigger);
    html += row("Requirements", e.requirements);
    html += row("Issued By", e.issuer);
    html += row("Validity", e.validity.display);
    if (e.notes) html += row("Notes", e.notes, true);

    if (e.templateText) {
      var ok = isVerbatimOrSecondary(e.templateSource);
      html += '<div class="detail-row"><div class="detail-label">Logbook Wording</div>';
      html += '<div class="template-box">' + escapeHtml(e.templateText) + "</div>";
      if (e.templateSource) {
        html += '<div class="confidence-line ' + (ok ? "ok" : "warn") + '">' +
          (ok ? "✅" : "⚠️") + " <span>" + escapeHtml(e.templateSource) + "</span></div>";
      }
      html += '<div class="footer-note">Fill in the bracketed fields. Every endorsement must also ' +
        "carry the instructor's signature, date, CFI certificate number, and RE date or " +
        "certificate expiration date, per AC 61-65H, Appendix A, p. A-6.</div>";
      html += "</div>";
    }

    if (state.logFormEndorsementId === e.id) {
      html += renderLogFormHtml(e);
    } else {
      html += '<button class="btn-primary" id="modal-log-btn">+ Log This Endorsement</button>';
    }

    sheet.innerHTML = html;
    backdrop.classList.add("active");

    var logBtn = document.getElementById("modal-log-btn");
    if (logBtn) {
      logBtn.addEventListener("click", function () {
        state.logFormEndorsementId = e.id;
        renderModal();
      });
    }
    bindLogFormEvents(e);
  }

  function renderLogFormHtml(e) {
    var today = new Date().toISOString().slice(0, 10);
    return (
      '<div class="field-list">' +
        "<label>Student / pilot name</label>" +
        '<input type="text" id="log-form-name" placeholder="Name">' +
        "<label>Aircraft make &amp; model (if applicable)</label>" +
        '<input type="text" id="log-form-aircraft" placeholder="e.g. Robinson R44 Raven II">' +
        "<label>Date issued</label>" +
        '<input type="date" id="log-form-date" value="' + today + '">' +
        "<label>Notes (optional)</label>" +
        '<input type="text" id="log-form-notes" placeholder="Notes">' +
      "</div>" +
      '<button class="btn-primary" id="log-form-save">Save to My Log</button>'
    );
  }

  function bindLogFormEvents(e) {
    var saveBtn = document.getElementById("log-form-save");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", function () {
      var name = (document.getElementById("log-form-name").value || "Unnamed").trim() || "Unnamed";
      var aircraft = document.getElementById("log-form-aircraft").value.trim();
      var dateVal = document.getElementById("log-form-date").value;
      var notes = document.getElementById("log-form-notes").value.trim();
      var dateIssued = dateVal ? new Date(dateVal + "T00:00:00") : new Date();
      LogStore.add({
        endorsementId: e.id,
        personName: name,
        aircraft: aircraft,
        dateIssued: dateIssued.toISOString(),
        notes: notes
      });
      closeDetail();
      if (state.tab !== "log") {
        state.tab = "log";
      }
      renderApp();
    });
  }

  // ---------------------------------------------------------------------
  // Tab bar / top-level render
  // ---------------------------------------------------------------------

  var TABS = [
    { key: "helicopter", label: "Helicopter", icon: "🚁", title: "Helicopter" },
    { key: "fixedwing", label: "Fixed Wing", icon: "✈️", title: "Fixed Wing" },
    { key: "library", label: "Library", icon: "📚", title: "Endorsement Library" },
    { key: "log", label: "My Log", icon: "🕘", title: "My Log" },
    { key: "about", label: "About", icon: "ℹ️", title: "About" }
  ];

  function tabBarHtml(containerClass) {
    return TABS.map(function (t) {
      return '<button class="tab-btn' + (state.tab === t.key ? " active" : "") + '" data-tab="' + t.key + '">' +
        '<span class="tab-icon">' + t.icon + "</span><span>" + escapeHtml(t.label) + "</span></button>";
    }).join("");
  }

  function currentTabTitle() {
    var t = TABS.find(function (t) { return t.key === state.tab; });
    return t ? t.title : "";
  }

  function renderApp(opts) {
    opts = opts || {};
    var main = document.getElementById("main-content");
    var topTitle = document.getElementById("top-bar-title");
    topTitle.textContent = currentTabTitle();

    var html;
    if (state.tab === "helicopter") html = renderHelicopter();
    else if (state.tab === "fixedwing") html = renderFixedWing();
    else if (state.tab === "library") html = renderLibrary();
    else if (state.tab === "log") html = renderLog();
    else html = renderAbout();

    main.innerHTML = html;

    // Bind per-tab interactive controls.
    if (state.tab === "helicopter") bindHelicopterEvents(main);
    if (state.tab === "library") bindLibraryEvents(main);
    if (state.tab === "log") bindLogEvents(main);

    // Bind row -> detail modal openers (shared across tabs).
    main.querySelectorAll("[data-open-detail]").forEach(function (row) {
      row.addEventListener("click", function () {
        openDetail(row.getAttribute("data-open-detail"));
      });
    });

    // Tab bar / desktop rail active states + bindings.
    document.querySelectorAll(".tab-bar .tab-btn, .desktop-rail .tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab);
    });

    if (opts.preserveFocus) {
      var el = document.querySelector(opts.preserveFocus);
      if (el) {
        el.focus();
        var v = el.value;
        el.value = "";
        el.value = v; // put cursor at end
      }
    }
  }

  function bindGlobalEvents() {
    document.querySelectorAll(".tab-bar .tab-btn, .desktop-rail .tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.tab = btn.getAttribute("data-tab");
        renderApp();
      });
    });
    document.getElementById("modal-backdrop").addEventListener("click", function (evt) {
      if (evt.target.id === "modal-backdrop") closeDetail();
    });
    document.getElementById("modal-close-btn").addEventListener("click", closeDetail);
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function init() {
    LogStore.load();
    bindGlobalEvents();
    renderApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed for the automated smoke test (test.js), not used by the app itself.
  window.__CFI_APP_TEST_HOOKS__ = {
    state: state,
    renderApp: renderApp,
    LogStore: LogStore,
    computeDueDate: computeDueDate,
    sfarApplicableIds: sfarApplicableIds,
    byId: byId,
    buildLogCsv: buildLogCsv
  };
})();
