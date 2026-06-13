"use strict";

(function () {
  const params = new URLSearchParams(window.location.search);
  const IS_HERMES_EMBED = params.get("embed") === "hermes";
  const INITIAL_PLUGIN_ROUTE = String(params.get("pluginRoute") || params.get("route") || params.get("pluginActionId") || "").trim().toLowerCase();
  const VISUAL_PROBE = params.get("finance_ui_probe") || "";
  const VISUAL_PROBE_KEYBOARD_BOTTOM = Math.max(0, Math.min(640, Math.round(Number(params.get("finance_ui_keyboard_bottom") || 0) || 0)));
  const HOST_APPEARANCE = window.__FINANCE_PLUGIN_APPEARANCE__ || {};
  const HERMES_EVENTS = {
    navigation: "finance.plugin.navigation",
    back: "hermes.plugin.back",
    backResult: "finance.plugin.back_result",
    refreshRequired: "finance.plugin.refresh_required",
    viewport: "hermes.plugin.viewport",
  };
  const ROOT_VIEW = "home";
  const TRANSACTION_PAGE_SIZE = 30;
  const TRANSACTION_LIST_CAP = 200;
  const ENTRY_DRAFT_VERSION = 1;
  const ENTRY_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const ENTRY_DRAFT_STORAGE_PREFIX = "finance.entryDraft.v1";
  const state = {
    activeView: ROOT_VIEW,
    previousView: ROOT_VIEW,
    entryType: "expense",
    entryMode: "expense",
    overview: null,
    transactionRows: [],
    transactionPageOffset: 0,
    transactionHasMore: false,
    transactionLoadingMore: false,
    transactionSearchQuery: "",
    transactionSearchRows: [],
    transactionSearchLoading: false,
    transactionSearchTimer: 0,
    transactionSearchCommitAt: 0,
    transactionSearchCommitValue: "",
    recurringRules: [],
    ownerAssetSummary: null,
    ownerStockSummary: null,
    selectedOwnerAssetYear: 0,
    selectedOwnerStockDate: "",
    recurringDraft: null,
    ledgers: [],
    activeLedgerId: localStorage.getItem("financeActiveLedgerId") || "",
    selectedTransaction: null,
    entryAction: "create",
    editingTransaction: null,
    reportPeriod: "all",
    reportCurrency: "CNY",
    reportDimension: "category",
    reportRows: [],
    reportBreakdownRows: [],
    selectedReportItem: null,
    selectedReportDimension: "category",
    reportDetailTransactions: [],
    reportAnchorDate: new Date().toISOString(),
    reportCustomStartDate: "",
    reportCustomEndDate: "",
    selectedEntryCategory: "",
    entryCategories: [],
    entryTags: [],
    selectedEntryTags: [],
    copyAmountPristine: false,
    categoryPickerQuery: "",
    categoryPickerExpandedParents: [],
    pendingAttachments: [],
    attachmentTargetTransactionId: "",
    touchStartX: 0,
    touchStartY: 0,
    touchBackCandidate: false,
    swipeRow: null,
    swipeStartX: 0,
    swipeStartY: 0,
    swipeCandidate: false,
    swipeHorizontalIntent: false,
    swipeAxis: "idle",
    swipeMaxLeft: 0,
    lastKeypadHandledAt: 0,
    lastKeypadHandledKey: "",
    lastKeypadHandledType: "",
    divideNext: false,
    stayOnEntryAfterSubmit: false,
    uiProbeTimer: 0,
    visualProbeApplied: false,
    refreshNoticeAt: 0,
    pendingClientVersion: "",
    hermesHostViewport: null,
    entryNoteViewportPinTimer: 0,
    pluginRouteApplied: false,
    entryDraftStartupChecked: false,
    entryDraftSaveTimer: 0,
    entryDraftSuppressSave: false,
    entryDraftDirty: false,
    entryDraftRestoredAt: 0,
    entryDraftRestoredClean: false,
  };

  const REPORT_DIMENSIONS = {
    trend: "趋势",
    category: "大类",
    subcategory: "小类",
    member: "成员",
    account: "账户",
    merchant: "商家",
    tag: "标签",
  };

  const REPORT_PERIODS = {
    all: "全部",
    year: "年",
    quarter: "季",
    month: "月",
    more: "更多",
    custom: "自定义",
  };

  const REPORT_COLORS = ["#2fc8b6", "#2fb7e8", "#628df3", "#7367f0", "#ff9b2f", "#ffc32d", "#74cf64", "#58c3dc"];
  const CURRENCY_LABELS = { CNY: "人民币", HKD: "港币", USD: "美元", EUR: "欧元", JPY: "日元" };
  const CURRENCY_ORDER = ["CNY", "HKD", "USD", "EUR", "JPY"];
  const ACCOUNT_TYPE_LABELS = {
    bank: "银行卡",
    cash: "现金账户",
    credit_card: "信用卡",
    payable: "应付",
  };
  const QUICK_CATEGORY_ORDER = [
    "早餐", "午餐", "晚餐", "夜宵",
    "医疗药品",
    "电子数码", "正版软件", "快递邮政", "健康有机",
    "服饰鞋包", "养生保健", "家庭开销", "牛奶",
    "大家电", "生活用品", "酒", "水",
    "电脑宽带", "新风",
  ];
  const CATEGORY_ICON_KEYS = new Map([
    ["早餐", "food-breakfast"],
    ["午餐", "food-lunch"],
    ["晚餐", "food-dinner"],
    ["夜宵", "food-dinner"],
    ["医疗药品", "medical-pill"],
    ["电子数码", "digital-headphone"],
    ["养生保健", "health-bottle"],
    ["生活用品", "home-supplies"],
    ["正版软件", "software-briefcase"],
    ["大家电", "home-appliance"],
    ["服饰", "clothing-shirt"],
    ["服饰鞋包", "clothing-shirt"],
    ["酒", "drink-bowl"],
    ["牛奶", "drink-milk"],
    ["水", "utility-water"],
    ["健康有机", "health-organic"],
    ["电脑宽带", "digital-router"],
    ["新风", "home-ventilation"],
    ["居家", "home-house"],
    ["人情", "gift-money"],
    ["家庭支出", "family-bill"],
    ["家庭开销", "family-bill"],
    ["投资", "investment"],
    ["音像", "media"],
    ["快递邮政", "shipping"],
    ["交通", "transport"],
    ["工资薪水", "income-salary"],
    ["奖金", "income-bonus"],
    ["退款", "income-refund"],
  ]);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function rect(selector) {
    const node = $(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      top: Math.round(r.top * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      bottom: Math.round(r.bottom * 100) / 100,
      left: Math.round(r.left * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
    };
  }

  function roundRectValue(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function assetVersion() {
    const script = $("script[src*='app-finance-ui.js']");
    const style = $("link[href*='styles.css']");
    const parse = (value) => {
      try {
        return new URL(value, window.location.href).searchParams.get("v") || "";
      } catch {
        return "";
      }
    };
    return {
      script: script ? parse(script.getAttribute("src")) : "",
      style: style ? parse(style.getAttribute("href")) : "",
      serviceWorker: "finance-mcp-pwa-v140",
    };
  }

  function safeAreaProbe() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const value = {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();
    return value;
  }

  function categoryRowsProbe() {
    const rows = [];
    for (const node of $$("[data-category-quick]")) {
      const r = node.getBoundingClientRect();
      let row = rows.find((item) => Math.abs(item.top - r.top) < 3);
      if (!row) {
        row = {
          top: Math.round(r.top * 100) / 100,
          bottom: Math.round(r.bottom * 100) / 100,
          count: 0,
        };
        rows.push(row);
      }
      row.count += 1;
      row.bottom = Math.round(Math.max(row.bottom, r.bottom) * 100) / 100;
    }
    rows.sort((a, b) => a.top - b.top);
    const noteTop = rect(".wacai-entry-meta")?.top ?? window.innerHeight;
    return {
      rows,
      fullRowsBeforeNote: rows.filter((row) => row.bottom <= noteTop - 4).length,
    };
  }

  function collectUiProbe(reason = "timer") {
    const vv = window.visualViewport;
    const categories = categoryRowsProbe();
    return {
      reason,
      activeView: state.activeView,
      entryMode: state.entryMode,
      capturedAt: new Date().toISOString(),
      assetVersion: assetVersion(),
      displayMode: {
        standalone: window.matchMedia?.("(display-mode: standalone)")?.matches || false,
        fullscreen: window.matchMedia?.("(display-mode: fullscreen)")?.matches || false,
        browser: window.matchMedia?.("(display-mode: browser)")?.matches || false,
        navigatorStandalone: Boolean(navigator.standalone),
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
        screenWidth: window.screen?.width || 0,
        screenHeight: window.screen?.height || 0,
        visualWidth: vv?.width || null,
        visualHeight: vv?.height || null,
        visualOffsetTop: vv?.offsetTop || 0,
        visualOffsetLeft: vv?.offsetLeft || 0,
      },
      safeArea: safeAreaProbe(),
      focus: {
        activeTag: document.activeElement?.tagName || "",
        activeName: document.activeElement?.getAttribute?.("name") || "",
        entryNoteFocus: document.documentElement.classList.contains("finance-entry-note-focus"),
        keyboardOpen: document.documentElement.classList.contains("finance-keyboard-open"),
        nativeKeyboardVisible: document.documentElement.classList.contains("finance-native-keyboard-visible"),
        appTop: getComputedStyle(document.documentElement).getPropertyValue("--finance-app-top").trim() || "0px",
        appHeight: getComputedStyle(document.documentElement).getPropertyValue("--finance-app-height").trim() || "",
        keyboardBottom: getComputedStyle(document.documentElement).getPropertyValue("--finance-keyboard-bottom").trim() || "0px",
        visualBottom: getComputedStyle(document.documentElement).getPropertyValue("--finance-visual-bottom").trim() || "100dvh",
        noteBottomEdge: getComputedStyle(document.documentElement).getPropertyValue("--finance-note-bottom-edge").trim() || "100dvh",
      },
      rects: {
        topbar: rect(".finance-topbar"),
        bottomNav: rect(".finance-bottom-nav"),
        entryHero: rect(".wacai-entry-hero"),
        entryTypes: rect(".wacai-entry-types"),
        currentCategory: rect(".finance-entry-category-current"),
        categoryGrid: rect(".finance-entry-category-grid"),
        noteButton: rect("[data-entry-note-label]"),
        noteOverlay: rect(".finance-entry-note-sheet"),
        metaRow: rect(".wacai-entry-meta"),
        cameraButton: rect(".wacai-camera-button"),
        metaControls: $$(".wacai-entry-meta input, .wacai-entry-meta select, .wacai-entry-meta button").map((node) => {
          const r = node.getBoundingClientRect();
          return { tag: node.tagName, className: node.className, top: roundRectValue(r.top), bottom: roundRectValue(r.bottom), height: roundRectValue(r.height) };
        }).filter((item) => item.height > 1),
        keypad: rect(".wacai-keypad"),
        reportFilter: rect(".wacai-report-filter"),
        reportDonut: rect(".wacai-report-card"),
      },
      categoryRows: categories.rows,
      fullCategoryRowsBeforeNote: categories.fullRowsBeforeNote,
    };
  }

  function scheduleUiProbe(reason = "change") {
    window.clearTimeout(state.uiProbeTimer);
    state.uiProbeTimer = window.setTimeout(() => {
      postUiProbe(reason, { preferBeacon: true }).catch(() => {});
    }, 350);
  }

  async function postUiProbe(reason = "change", options = {}) {
    const payload = collectUiProbe(reason);
    const body = JSON.stringify(payload);
    if (options.preferBeacon && navigator.sendBeacon) {
      const ok = navigator.sendBeacon("/api/finance/ui-probe", new Blob([body], { type: "application/json" }));
      if (ok) return payload;
    }
    await fetch("/api/finance/ui-probe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: options.keepalive !== false,
    });
    return payload;
  }

  function sanitizeRoute(route = {}) {
    const clean = {
      name: String(route.name || "ledger").slice(0, 96),
      depth: Math.max(0, Math.min(4, Math.trunc(Number(route.depth || 0)))),
    };
    if (route.itemId !== undefined && route.itemId !== null) clean.itemId = String(route.itemId).slice(0, 96);
    return clean;
  }

  function currentHermesRoute() {
    if (state.activeView === "transaction-detail") {
      return sanitizeRoute({ name: "ledger-detail", depth: 1, itemId: state.selectedTransaction?.id });
    }
    if (["report-trend", "report-breakdown", "report-detail"].includes(state.activeView)) {
      return sanitizeRoute({ name: state.activeView.replace("report-", "report-"), depth: 1 });
    }
    return sanitizeRoute({ name: state.activeView === "home" ? "ledger" : state.activeView, depth: state.activeView === "home" ? 0 : 1 });
  }

  function currentCanGoBack() {
    const settings = $("[data-settings-overlay]");
    const reportActions = $("[data-report-action-overlay]");
    const reportPicker = $("[data-report-picker-overlay]");
    const attachmentOverlay = $("[data-attachment-overlay]");
    const ledgerOverlay = $("[data-ledger-overlay]");
    const categoryPickerOverlay = $("[data-category-picker-overlay]");
    const entryChoiceOverlay = $("[data-entry-choice-overlay]");
    const entryNoteOverlay = $("[data-entry-note-overlay]");
    const entryDateOverlay = $("[data-entry-date-overlay]");
    const recurringOverlay = $("[data-recurring-overlay]");
    const swipeOpen = $(".finance-swipe-row.actions-open");
    return Boolean(
      isBackableView()
      || state.activeView === "transactions"
      || (settings && !settings.classList.contains("hidden"))
      || (reportActions && !reportActions.classList.contains("hidden"))
      || (reportPicker && !reportPicker.classList.contains("hidden"))
      || (attachmentOverlay && !attachmentOverlay.classList.contains("hidden"))
      || (ledgerOverlay && !ledgerOverlay.classList.contains("hidden"))
      || (categoryPickerOverlay && !categoryPickerOverlay.classList.contains("hidden"))
      || (entryChoiceOverlay && !entryChoiceOverlay.classList.contains("hidden"))
      || (entryNoteOverlay && !entryNoteOverlay.classList.contains("hidden"))
      || (entryDateOverlay && !entryDateOverlay.classList.contains("hidden"))
      || (recurringOverlay && !recurringOverlay.classList.contains("hidden"))
      || swipeOpen,
    );
  }

  function postHermesMessage(type, payload = {}) {
    if (!IS_HERMES_EMBED || window.parent === window) return;
    window.parent.postMessage({ type, ...payload }, "*");
  }

  function postHermesNavigation() {
    postHermesMessage(HERMES_EVENTS.navigation, {
      canGoBack: currentCanGoBack(),
      route: currentHermesRoute(),
    });
  }

  function refreshOverlayLock() {
    const open = $$("[data-settings-overlay], [data-report-action-overlay], [data-report-picker-overlay], [data-attachment-overlay], [data-ledger-overlay], [data-category-picker-overlay], [data-entry-choice-overlay], [data-entry-note-overlay], [data-entry-date-overlay], [data-recurring-overlay]")
      .some((overlay) => !overlay.classList.contains("hidden"));
    document.documentElement.classList.toggle("finance-overlay-open", open);
    document.body.classList.toggle("finance-overlay-open", open);
  }

  function showOverlay(overlay) {
    if (!overlay) return;
    overlay.hidden = false;
    overlay.className = overlay.className.split(/\s+/).filter((name) => name && name !== "hidden").join(" ");
    refreshOverlayLock();
  }

  function hideOverlay(overlay) {
    if (!overlay) return;
    overlay.hidden = true;
    if (!overlay.className.split(/\s+/).includes("hidden")) overlay.className = `${overlay.className} hidden`.trim();
    refreshOverlayLock();
  }

  function postHermesBackResult(handled) {
    postHermesMessage(HERMES_EVENTS.backResult, {
      handled: Boolean(handled),
      ...(handled ? { route: currentHermesRoute() } : {}),
    });
  }

  function postBackState(handled) {
    postHermesBackResult(handled);
    postHermesNavigation();
  }

  function shouldCaptureEdgeBack() {
    return currentCanGoBack() || IS_HERMES_EMBED;
  }

  function requestHermesRefresh(reason = "state_changed") {
    const now = Date.now();
    if (now - state.refreshNoticeAt < 30000) return;
    state.refreshNoticeAt = now;
    postHermesMessage(HERMES_EVENTS.refreshRequired, {
      reason: String(reason || "state_changed").slice(0, 64),
      route: currentHermesRoute(),
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  async function api(path, options = {}) {
    const requestPath = withActiveLedger(path);
    const response = await fetch(requestPath, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "request_failed");
    return payload;
  }

  function withActiveLedger(path) {
    if (!state.activeLedgerId || !String(path).startsWith("/api/finance/")) return path;
    if (String(path).startsWith("/api/finance/client-version") || String(path).startsWith("/api/finance/ui-probe")) return path;
    const url = new URL(path, window.location.origin);
    if (!url.searchParams.get("ledger_id")) url.searchParams.set("ledger_id", state.activeLedgerId);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function entryDraftLedgerId() {
    return String(currentLedger()?.id || state.activeLedgerId || "default").trim() || "default";
  }

  function entryDraftStorageKey() {
    const mode = IS_HERMES_EMBED ? "embedded" : "standalone";
    return `${ENTRY_DRAFT_STORAGE_PREFIX}:${mode}:${entryDraftLedgerId()}`;
  }

  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function safeLocalStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function selectValue(selector) {
    return $(selector)?.value || "";
  }

  function currentEntryDraft() {
    const form = $("[data-entry-form]");
    if (!form || state.entryAction !== "create") return null;
    return {
      version: ENTRY_DRAFT_VERSION,
      savedAt: Date.now(),
      ledgerId: entryDraftLedgerId(),
      mode: state.entryMode || "expense",
      type: state.entryType || "expense",
      amount: normalizeEntryAmount(selectValue("[data-entry-amount]")),
      categoryHint: selectValue("[data-category-select]") || state.selectedEntryCategory || "",
      currency: selectValue("[data-currency-select]"),
      accountHint: selectValue("[data-account-select]"),
      targetAccountHint: selectValue("[data-target-account-select]"),
      memberHint: selectValue("[data-member-select]"),
      tags: state.selectedEntryTags.slice(0, 20),
      note: selectValue("[data-entry-note-value]"),
      merchant: form.elements.merchant?.value || "",
      occurredAt: form.elements.occurred_at?.value || "",
      stayOnEntryAfterSubmit: Boolean(state.stayOnEntryAfterSubmit),
    };
  }

  function entryDraftAmountHasUserContent(value) {
    const amount = normalizeEntryAmount(value);
    return /[1-9]/.test(amount);
  }

  function entryDraftHasUserContent(draft) {
    return Boolean(
      draft
      && (
        entryDraftAmountHasUserContent(draft.amount)
        || draft.note
        || draft.merchant
        || (Array.isArray(draft.tags) && draft.tags.length)
      )
    );
  }

  function saveEntryDraftNow() {
    if (state.entryDraftSuppressSave || state.entryAction !== "create") return;
    if (!state.entryDraftDirty) return;
    const draft = currentEntryDraft();
    const key = entryDraftStorageKey();
    if (!entryDraftHasUserContent(draft)) {
      safeLocalStorageRemove(key);
      return;
    }
    safeLocalStorageSet(key, JSON.stringify(draft));
  }

  function handleEntryDraftPageExit() {
    const draft = currentEntryDraft();
    if (state.entryDraftRestoredClean && state.entryAction === "create") {
      clearEntryDraft();
      state.entryDraftRestoredClean = false;
      setView(ROOT_VIEW);
      return;
    }
    if (state.activeView === "entry" && state.entryAction === "create" && !entryDraftHasUserContent(draft)) {
      clearEntryDraft();
      setView(ROOT_VIEW);
      return;
    }
    saveEntryDraftNow();
  }

  function scheduleEntryDraftSave() {
    if (state.entryDraftSuppressSave || state.entryAction !== "create") return;
    state.entryDraftRestoredClean = false;
    state.entryDraftDirty = true;
    window.clearTimeout(state.entryDraftSaveTimer);
    state.entryDraftSaveTimer = window.setTimeout(saveEntryDraftNow, 80);
  }

  function clearEntryDraft() {
    window.clearTimeout(state.entryDraftSaveTimer);
    state.entryDraftSaveTimer = 0;
    state.entryDraftDirty = false;
    state.entryDraftRestoredClean = false;
    safeLocalStorageRemove(entryDraftStorageKey());
  }

  function loadEntryDraft() {
    const key = entryDraftStorageKey();
    let raw = "";
    try {
      raw = localStorage.getItem(key) || "";
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      const savedAt = Number(draft?.savedAt || 0);
      if (draft?.version !== ENTRY_DRAFT_VERSION || !savedAt || Date.now() - savedAt > ENTRY_DRAFT_TTL_MS) {
        safeLocalStorageRemove(key);
        return null;
      }
      if (String(draft.ledgerId || "") !== entryDraftLedgerId()) return null;
      return entryDraftHasUserContent(draft) ? draft : null;
    } catch (_) {
      safeLocalStorageRemove(key);
      return null;
    }
  }

  function setEntryFormValue(selector, value) {
    const node = $(selector);
    if (node) node.value = String(value || "");
  }

  function restoreEntryDraft(draft = loadEntryDraft()) {
    if (!draft || state.entryAction !== "create") return false;
    state.entryDraftSuppressSave = true;
    try {
      setEntryType(draft.mode || draft.type || "expense");
      setEntryFormValue("[data-currency-select]", draft.currency);
      setEntryFormValue("[data-account-select]", draft.accountHint);
      setEntryFormValue("[data-target-account-select]", draft.targetAccountHint);
      setEntryFormValue("[data-member-select]", draft.memberHint);
      setEntryCategory(draft.categoryHint || "");
      setEntryAmount(draft.amount || "");
      setEntryNote(draft.note || "");
      setEntryTags(Array.isArray(draft.tags) ? draft.tags : []);
      const form = $("[data-entry-form]");
      if (form?.elements.merchant) form.elements.merchant.value = draft.merchant || "";
      if (form?.elements.occurred_at) form.elements.occurred_at.value = draft.occurredAt || "";
      setStayOnEntryAfterSubmit(Boolean(draft.stayOnEntryAfterSubmit));
      syncEntryCurrencyFromAccount();
      syncEntryMemberLabel();
      state.entryDraftRestoredAt = Date.now();
      state.entryDraftRestoredClean = true;
      state.entryDraftDirty = false;
    } finally {
      state.entryDraftSuppressSave = false;
    }
    return true;
  }

  function restoreEntryDraftOnStartup() {
    if (state.entryDraftStartupChecked) return false;
    state.entryDraftStartupChecked = true;
    if (state.activeView !== ROOT_VIEW) return false;
    const draft = loadEntryDraft();
    if (!draft) return false;
    openNewEntry(draft.mode || draft.type || "expense", { restoreDraft: true });
    return true;
  }

  function attachmentStatusText() {
    const count = state.pendingAttachments.length;
    if (!count) {
      if (state.stayOnEntryAfterSubmit) return "保存后继续记下一笔";
      return state.entryAction === "edit" ? "正在编辑原账目" : state.entryAction === "copy" ? "复制后保存为新账目" : "";
    }
    return `已选择 ${count} 个附件`;
  }

  function setEntryStatus(message = "") {
    const status = $("[data-entry-status]");
    if (status) status.textContent = message || attachmentStatusText();
  }

  function updateEntryAgainButton() {
    const button = $("[data-keypad-action='again']");
    if (!button) return;
    button.classList.toggle("active", Boolean(state.stayOnEntryAfterSubmit));
    button.setAttribute("aria-pressed", state.stayOnEntryAfterSubmit ? "true" : "false");
  }

  function setStayOnEntryAfterSubmit(value = false) {
    state.stayOnEntryAfterSubmit = Boolean(value);
    updateEntryAgainButton();
    setEntryStatus();
    scheduleEntryDraftSave();
  }

  function resetAttachmentFileInputs() {
    for (const input of $$("[data-attachment-camera], [data-attachment-photo], [data-attachment-file]")) input.value = "";
  }

  function resetPendingAttachments() {
    state.pendingAttachments = [];
    resetAttachmentFileInputs();
    setEntryStatus();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("attachment_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  function queueAttachmentFiles(files = []) {
    const selected = Array.from(files).filter(Boolean);
    if (!selected.length) return;
    state.pendingAttachments.push(...selected);
    setEntryStatus(attachmentStatusText());
  }

  async function uploadAttachmentFiles(transactionId, files = []) {
    const selected = Array.from(files).filter(Boolean);
    if (!transactionId || !selected.length) return [];
    const uploaded = [];
    for (const file of selected) {
      const dataUrl = await fileToDataUrl(file);
      const payload = await api("/api/finance/attachments", {
        method: "POST",
        body: JSON.stringify({
          transaction_id: transactionId,
          file_name: file.name || "attachment.bin",
          mime_type: file.type || "application/octet-stream",
          data_url: dataUrl,
        }),
      });
      uploaded.push(payload.result);
    }
    return uploaded;
  }

  async function uploadPendingAttachments(transactionId) {
    const files = state.pendingAttachments.slice();
    if (!transactionId || !files.length) return [];
    const uploaded = await uploadAttachmentFiles(transactionId, files);
    resetPendingAttachments();
    return uploaded;
  }

  function setDetailAttachmentStatus(message = "") {
    const count = $("[data-detail-attachment-count]");
    if (count && message) count.textContent = message;
  }

  async function uploadDetailAttachmentFiles(transactionId, files = []) {
    const selected = Array.from(files).filter(Boolean);
    if (!transactionId || !selected.length) return [];
    setDetailAttachmentStatus(`上传 ${selected.length} 个附件中`);
    try {
      const uploaded = await uploadAttachmentFiles(transactionId, selected);
      resetAttachmentFileInputs();
      await loadOverview();
      const updated = findTransaction(transactionId);
      if (updated) state.selectedTransaction = updated;
      await loadTransactionDetailAttachments(transactionId);
      return uploaded;
    } catch (err) {
      setDetailAttachmentStatus("附件上传失败");
      throw err;
    } finally {
      state.attachmentTargetTransactionId = "";
      resetAttachmentFileInputs();
    }
  }

  async function handleAttachmentFiles(files = []) {
    const selected = Array.from(files).filter(Boolean);
    if (!selected.length) return;
    const targetTransactionId = state.attachmentTargetTransactionId;
    if (targetTransactionId) {
      await uploadDetailAttachmentFiles(targetTransactionId, selected);
      return;
    }
    queueAttachmentFiles(selected);
  }

  function closeAttachmentMenu(options = {}) {
    if (!options.preserveTarget) state.attachmentTargetTransactionId = "";
    hideOverlay($("[data-attachment-overlay]"));
    postHermesNavigation();
  }

  function isImageAttachment(row = {}) {
    return Boolean(row.isImage) || String(row.mimeType || row.mime_type || "").toLowerCase().startsWith("image/");
  }

  function openAttachmentPreview(url, label = "附件图片") {
    const overlay = $("[data-attachment-overlay]");
    if (!overlay || !url) return;
    overlay.innerHTML = `
      <section class="finance-attachment-preview" data-attachment-preview>
        <button type="button" class="finance-attachment-preview-close" data-attachment-preview-close aria-label="关闭">×</button>
        <img src="${escapeHtml(url)}" alt="${escapeHtml(label || "附件图片")}">
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function openAttachmentMenu(transactionId = "") {
    state.attachmentTargetTransactionId = String(transactionId || "");
    const overlay = $("[data-attachment-overlay]");
    if (!overlay) return;
    overlay.innerHTML = `
      <section class="finance-action-sheet finance-attachment-sheet">
        <div class="finance-action-title">附件</div>
        <button type="button" data-attachment-action="camera">拍照</button>
        <button type="button" data-attachment-action="photo">上传照片</button>
        <button type="button" data-attachment-action="file">上传文件</button>
        <button type="button" data-attachment-action="cancel">取消</button>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function triggerAttachmentInput(action) {
    const selector = action === "camera"
      ? "[data-attachment-camera]"
      : action === "photo"
        ? "[data-attachment-photo]"
        : "[data-attachment-file]";
    closeAttachmentMenu({ preserveTarget: true });
    $(selector)?.click();
  }

  function currentLedger() {
    return (state.ledgers || []).find((row) => row.id === state.activeLedgerId) || state.overview?.currentLedger || null;
  }

  function setActiveLedger(ledger) {
    if (!ledger?.id) return;
    state.activeLedgerId = ledger.id;
    localStorage.setItem("financeActiveLedgerId", ledger.id);
    const title = $("[data-ledger-name]");
    if (title) title.textContent = ledger.name || "日常账本";
    const entryTitle = $("[data-entry-title]");
    if (entryTitle && state.entryAction === "create") entryTitle.textContent = ledger.name || "日常账本";
  }

  function renderLedgerMenu() {
    const overlay = $("[data-ledger-overlay]");
    if (!overlay) return;
    const ledgers = state.ledgers || [];
    overlay.innerHTML = `
      <section class="finance-action-sheet finance-ledger-sheet">
        <div class="finance-action-title">账本</div>
        <div class="finance-ledger-list">
          ${ledgers.map((ledger) => `
            <button type="button" class="finance-ledger-option ${ledger.id === state.activeLedgerId ? "active" : ""}" data-ledger-select="${escapeHtml(ledger.id)}">
              <strong>${escapeHtml(ledger.name || ledger.id)}</strong>
              <span>${Number(ledger.transaction_count || 0).toLocaleString("zh-CN")}笔 · ${Number(ledger.account_count || 0)}个账户</span>
            </button>
          `).join("")}
        </div>
        <form class="finance-ledger-create" data-ledger-create-form>
          <input name="name" autocomplete="off" placeholder="新账本名称">
          <button type="submit">新建</button>
        </form>
        <button type="button" data-ledger-cancel>取消</button>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function closeLedgerMenu() {
    hideOverlay($("[data-ledger-overlay]"));
    postHermesNavigation();
  }

  async function createLedgerFromForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = await api("/api/finance/ledgers", {
      method: "POST",
      body: JSON.stringify({ name: data.name }),
    });
    setActiveLedger(payload.result.ledger);
    closeLedgerMenu();
    await loadOverview();
  }

  function currencyLabel(code) {
    return CURRENCY_LABELS[String(code || "").toUpperCase()] || code || "";
  }

  function reportCurrencyRows() {
    const rows = (state.overview?.currencies || [])
      .map((row) => ({
        code: String(row.code || "").toUpperCase(),
        label: row.display_name || currencyLabel(row.code),
        symbol: row.symbol || "",
      }))
      .filter((row) => row.code);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const ordered = [];
    const push = (code) => {
      const clean = String(code || "").toUpperCase();
      if (!clean || ordered.some((row) => row.code === clean)) return;
      ordered.push(byCode.get(clean) || { code: clean, label: currencyLabel(clean) || clean, symbol: "" });
    };
    CURRENCY_ORDER.forEach(push);
    rows.forEach((row) => push(row.code));
    if (!ordered.length) push("CNY");
    return ordered;
  }

  function syncReportCurrencyButton() {
    const current = reportCurrencyRows().find((row) => row.code === state.reportCurrency);
    $$("[data-report-currency-button], [data-home-currency-button]").forEach((button) => {
      button.textContent = current?.label || currencyLabel(state.reportCurrency) || state.reportCurrency;
      button.dataset.reportCurrency = state.reportCurrency;
    });
  }

  function currencySortIndex(code) {
    const index = CURRENCY_ORDER.indexOf(String(code || "").toUpperCase());
    return index === -1 ? CURRENCY_ORDER.length : index;
  }

  function sortedAccounts(rows = []) {
    return rows.slice().sort((a, b) => {
      const currencyDiff = currencySortIndex(a.currency) - currencySortIndex(b.currency);
      if (currencyDiff) return currencyDiff;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
    });
  }

  function accountTypeLabel(type) {
    return ACCOUNT_TYPE_LABELS[String(type || "")] || type || "账户";
  }

  function accountOptionLabel(row) {
    return row.name;
  }

  function groupMoneyWholeDigits(value = "0") {
    const text = String(value || "0").replace(/^0+(?=\d)/, "") || "0";
    return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatMoney(value, options = {}) {
    const scale = Number.isInteger(options.scale) ? Math.max(0, options.scale) : 2;
    const raw = String(value ?? "0").trim().replaceAll(",", "");
    if (!raw) return "0";
    const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (match) {
      const [, sign, whole, fraction = ""] = match;
      if (!scale) return `${sign}${groupMoneyWholeDigits(whole)}`;
      const visibleFraction = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
      return Number(visibleFraction || 0) > 0
        ? `${sign}${groupMoneyWholeDigits(whole)}.${visibleFraction}`
        : `${sign}${groupMoneyWholeDigits(whole)}`;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return "0";
    return formatMinorMoney(Math.round(numeric * (10 ** scale)), scale);
  }

  function formatMinorMoney(value, scale = 2) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return "0";
    const cleanScale = Number.isInteger(scale) ? Math.max(0, scale) : 2;
    const sign = numeric < 0 ? "-" : "";
    const minor = BigInt(Math.abs(Math.round(numeric)));
    const base = 10n ** BigInt(cleanScale);
    const whole = minor / base;
    if (!cleanScale) return `${sign}${groupMoneyWholeDigits(whole.toString())}`;
    const fractionMinor = minor % base;
    if (fractionMinor === 0n) return `${sign}${groupMoneyWholeDigits(whole.toString())}`;
    const fraction = fractionMinor.toString().padStart(cleanScale, "0");
    return `${sign}${groupMoneyWholeDigits(whole.toString())}.${fraction}`;
  }

  function formatCnyMinor(value) {
    return `¥${formatMinorMoney(value, 2)}`;
  }

  function formatCurrencyMinor(value, currency = "CNY", scale = 2) {
    const code = String(currency || "CNY").toUpperCase();
    const prefix = code === "CNY" ? "¥" : code === "USD" ? "$" : code === "HKD" ? "HK$" : "";
    const suffix = prefix ? "" : ` ${escapeHtml(code)}`;
    return `${prefix}${formatMinorMoney(value, scale)}${suffix}`;
  }

  function assetComponentAmount(row = {}) {
    const currency = String(row.currency || "CNY").toUpperCase();
    if (currency === "CNY") return `${formatMinorMoney(row.amount_cny_minor, 2)} CNY`;
    return `${formatMinorMoney(row.amount_minor, 2)} ${escapeHtml(currency)}`;
  }

  function stockPositionPrice(row = {}, field = "current_price_minor") {
    return formatCurrencyMinor(row[field], row.currency || "USD", row.scale || 2);
  }

  function stockQuantityText(row = {}) {
    const wan = Number(row.quantity_wan || 0);
    if (!Number.isFinite(wan)) return "0万股";
    return `${wan.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}万股`;
  }

  function formatBps(value, suffix = "%") {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return `0${suffix}`;
    const percent = num / 100;
    return `${percent.toFixed(Math.abs(percent) >= 10 ? 1 : 2)}${suffix}`;
  }

  function formatMultipleBps(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0x";
    return `${(num / 10000).toFixed(2)}x`;
  }

  function moneyScale(row = {}, fallback = 2) {
    const scale = Number(row?.scale);
    return Number.isInteger(scale) && scale >= 0 ? scale : fallback;
  }

  function hasAmountValue(value) {
    return value !== undefined && value !== null && value !== "";
  }

  function displayMoneyAmount(row = {}, fallback = "") {
    const scale = moneyScale(row);
    if (hasAmountValue(row.amount)) return formatMoney(row.amount, { scale });
    if (hasAmountValue(row.amountMinor)) return formatMinorMoney(Number(row.amountMinor || 0), scale);
    return fallback;
  }

  function displayAbsoluteMoneyAmount(row = {}, fallback = "0") {
    const scale = moneyScale(row);
    if (hasAmountValue(row.amount)) return formatMoney(String(row.amount).replace(/^-/, ""), { scale });
    if (hasAmountValue(row.amountMinor)) return formatMinorMoney(Math.abs(Number(row.amountMinor || 0)), scale);
    return fallback;
  }

  function recurringFrequencyLabel(row = {}) {
    const interval = Number(row.intervalCount || 1);
    const prefix = interval > 1 ? `每${interval}` : "每";
    if (row.frequency === "daily") return `${prefix}天`;
    if (row.frequency === "weekly") return `${prefix}周`;
    if (row.frequency === "monthly") return `${prefix}月`;
    if (row.frequency === "yearly") return `${prefix}年`;
    return "周期";
  }

  function recurringStatusLabel(status = "") {
    if (status === "active") return "执行中";
    if (status === "paused") return "已暂停";
    if (status === "completed") return "已结束";
    return "已删除";
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function safeDate(value = state.reportAnchorDate) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date("2025-12-31T12:00:00") : date;
  }

  function reportDateText(date) {
    return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
  }

  function dateInputText(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function entryDateParts(value = "") {
    const now = new Date();
    const text = String(value || "").trim();
    const parsed = parseDate(text);
    const date = parsed || now;
    const dateText = /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : dateInputText(date);
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    const timeText = timeMatch ? `${pad2(timeMatch[1])}:${pad2(timeMatch[2])}` : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    return { dateText, timeText };
  }

  function setEntryDateValue(dateText, timeText) {
    const input = $("[name='occurred_at']");
    if (!input) return;
    const date = dateText || dateInputText(new Date());
    const time = timeText || "12:00";
    input.value = `${date} ${time}`;
    scheduleEntryDraftSave();
  }

  function closeEntryDatePicker() {
    const overlay = $("[data-entry-date-overlay]");
    if (overlay) delete overlay.dataset.entryDateVariant;
    hideOverlay(overlay);
    postHermesNavigation();
  }

  function shiftEntryDatePicker(step = "") {
    const overlay = $("[data-entry-date-overlay]");
    const dateInput = overlay?.querySelector("[name='entry_date']");
    const timeInput = overlay?.querySelector("[name='entry_time']");
    if (!dateInput || !timeInput) return;
    if (step === "date-up" || step === "date-down") {
      const date = dateFromInput(dateInput.value, new Date());
      date.setDate(date.getDate() + (step === "date-up" ? 1 : -1));
      dateInput.value = dateInputText(date);
    }
    if (step === "time-up" || step === "time-down") {
      const current = entryDateParts(`${dateInput.value} ${timeInput.value}`);
      const [hour, minute] = current.timeText.split(":").map((part) => Number(part));
      const date = new Date(`${current.dateText}T${pad2(hour)}:${pad2(minute)}:00`);
      date.setMinutes(date.getMinutes() + (step === "time-up" ? 30 : -30));
      timeInput.value = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
  }

  function openEntryDatePicker() {
    const overlay = $("[data-entry-date-overlay]");
    if (!overlay) return;
    const current = entryDateParts($("[name='occurred_at']")?.value || "");
    overlay.dataset.entryDateVariant = "wacai";
    overlay.innerHTML = `
      <section class="finance-entry-date-sheet" role="dialog" aria-modal="true" aria-label="日期">
        <header class="finance-entry-date-header">
          <button type="button" data-entry-date-close aria-label="关闭">‹</button>
          <strong>日期</strong>
          <button type="button" data-entry-date-save>保存</button>
        </header>
        <form class="finance-entry-date-form" data-entry-date-form>
          <div class="finance-entry-date-spacer" aria-hidden="true"></div>
          <div class="finance-date-wheel-card">
            <div class="finance-date-wheel-actions" aria-label="日期调整">
              <button type="button" data-entry-date-step="date-up" aria-label="后一天"><span class="finance-date-chevron up"></span></button>
              <button type="button" data-entry-date-step="date-down" aria-label="前一天"><span class="finance-date-chevron down"></span></button>
              <button type="button" data-entry-date-save aria-label="保存日期"><span class="finance-date-check"></span></button>
            </div>
            <div class="finance-entry-date-fields">
              <label><span>日期</span><input type="date" name="entry_date" value="${escapeHtml(current.dateText)}"></label>
              <label><span>时间</span><input type="time" name="entry_time" value="${escapeHtml(current.timeText)}"></label>
            </div>
            <div class="finance-date-time-actions" aria-label="时间调整">
              <button type="button" data-entry-date-step="time-up">时间 +30</button>
              <button type="button" data-entry-date-step="time-down">时间 -30</button>
            </div>
            <button type="button" class="finance-date-recurring-pill" data-date-save-recurring>保存为周期账</button>
          </div>
        </form>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function applyEntryDatePicker({ saveRecurring = false } = {}) {
    const overlay = $("[data-entry-date-overlay]");
    const dateText = overlay?.querySelector("[name='entry_date']")?.value || dateInputText(new Date());
    const timeText = overlay?.querySelector("[name='entry_time']")?.value || "12:00";
    setEntryDateValue(dateText, timeText);
    closeEntryDatePicker();
    if (saveRecurring) {
      openRecurringEditor({
        ...entryRecurringDraft(),
        startAt: dateText,
        timeOfDay: timeText,
        dayOfMonth: Number(dateText.slice(8, 10)),
        monthOfYear: Number(dateText.slice(5, 7)),
      });
    }
  }

  function dateFromInput(value, fallback = new Date()) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return safeDate(fallback);
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? safeDate(fallback) : date;
  }

  function monthInputText(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  function dateToApiStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).toISOString();
  }

  function dateToApiEnd(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();
  }

  function reportDateRange() {
    const anchor = safeDate();
    if (state.reportPeriod === "custom") {
      const fallbackStart = dateFromInput("2005-12-31");
      const fallbackEnd = dateFromInput("2026-11-25");
      const start = dateFromInput(state.reportCustomStartDate, fallbackStart);
      const end = dateFromInput(state.reportCustomEndDate, fallbackEnd);
      return start <= end
        ? { start, end }
        : { start: end, end: start };
    }
    if (state.reportPeriod === "year") {
      return {
        start: new Date(anchor.getFullYear(), 0, 1, 0, 0, 0),
        end: new Date(anchor.getFullYear(), 11, 31, 23, 59, 59),
      };
    }
    if (state.reportPeriod === "quarter") {
      const startMonth = Math.floor(anchor.getMonth() / 3) * 3;
      return {
        start: new Date(anchor.getFullYear(), startMonth, 1, 0, 0, 0),
        end: new Date(anchor.getFullYear(), startMonth + 3, 0, 23, 59, 59),
      };
    }
    if (state.reportPeriod === "month") {
      return {
        start: new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0),
        end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59),
      };
    }
    return { start: null, end: null };
  }

  function updateReportDateControls(report = state.overview?.report) {
    const startButton = $("[data-report-date-start]");
    const endButton = $("[data-report-date-end]");
    const prevButton = $("[data-report-prev]");
    const nextButton = $("[data-report-next]");
    const active = state.reportPeriod === "year" || state.reportPeriod === "quarter" || state.reportPeriod === "month";
    if (prevButton) prevButton.hidden = !active;
    if (nextButton) nextButton.hidden = !active;
    const prevLabel = state.reportPeriod === "year" ? "上一年" : state.reportPeriod === "quarter" ? "上一季" : "上一月";
    const nextLabel = state.reportPeriod === "year" ? "下一年" : state.reportPeriod === "quarter" ? "下一季" : "下一月";
    if (prevButton) prevButton.setAttribute("aria-label", prevLabel);
    if (nextButton) nextButton.setAttribute("aria-label", nextLabel);
    const range = reportDateRange();
    syncReportPeriodButtons();
    syncReportCurrencyButton();
    if (state.reportPeriod === "custom" && range.start && range.end) {
      if (startButton) startButton.textContent = reportDateText(range.start);
      if (endButton) endButton.textContent = reportDateText(range.end);
      return;
    }
    if (active && range.start && range.end) {
      if (startButton) startButton.textContent = reportDateText(range.start);
      if (endButton) endButton.textContent = reportDateText(range.end);
      return;
    }
    if (startButton) startButton.textContent = report?.periodStart ? reportDateText(new Date(report.periodStart)) : "2005/12/31";
    if (endButton) endButton.textContent = report?.periodEnd ? reportDateText(new Date(report.periodEnd)) : "2026/11/25";
  }

  function shiftReportPeriod(delta) {
    if (state.reportPeriod !== "year" && state.reportPeriod !== "quarter" && state.reportPeriod !== "month") return;
    const anchor = safeDate();
    if (state.reportPeriod === "year") anchor.setFullYear(anchor.getFullYear() + delta);
    if (state.reportPeriod === "quarter") anchor.setMonth(anchor.getMonth() + delta * 3);
    if (state.reportPeriod === "month") anchor.setMonth(anchor.getMonth() + delta);
    state.reportAnchorDate = anchor.toISOString();
    updateReportDateControls();
    loadReport().catch(showError);
  }

  function resetReportAnchorToCurrent(period) {
    if (period === "year" || period === "quarter" || period === "month") {
      state.reportAnchorDate = new Date().toISOString();
    }
  }

  function activeReportDateParams() {
    if (state.reportPeriod === "custom") {
      const range = reportDateRange();
      return {
        startDate: dateToApiStart(range.start),
        endDate: dateToApiEnd(range.end),
      };
    }
    if (state.reportPeriod !== "year" && state.reportPeriod !== "quarter" && state.reportPeriod !== "month") return {};
    return { date: state.reportAnchorDate };
  }

  function activeTransactionDateParams() {
    if (state.reportPeriod !== "year" && state.reportPeriod !== "quarter" && state.reportPeriod !== "month" && state.reportPeriod !== "custom") return {};
    const range = reportDateRange();
    return {
      startDate: range.start ? dateToApiStart(range.start) : "",
      endDate: range.end ? dateToApiEnd(range.end) : "",
    };
  }

  function formatWacaiDate(value) {
    const date = parseDate(value);
    if (!date) return "未定日期";
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${weekdays[date.getDay()]}`;
  }

  function formatWacaiTime(value) {
    const date = parseDate(value);
    if (!date) return "";
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function formatTransactionRowDateTime(value) {
    const date = parseDate(value);
    if (!date) return "";
    return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${formatWacaiTime(value)}`;
  }

  function formatFullDate(value) {
    const date = parseDate(value);
    if (!date) return "未定日期";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${formatWacaiTime(value)}`;
  }

  function dateKey(value) {
    const date = parseDate(value);
    if (!date) return "unknown";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function typeLabel(type) {
    if (type === "income") return "收入";
    if (type === "transfer") return "转账";
    return "支出";
  }

  function amountText(row, withCurrency = false) {
    const sign = row.type === "expense" ? "-" : "";
    const suffix = withCurrency && row.currency && row.currency !== "CNY" ? ` ${currencyLabel(row.currency)}` : "";
    return `${sign}${displayAbsoluteMoneyAmount(row, "0")}${suffix}`;
  }

  function categoryIconKey(name = "") {
    const clean = String(name || "").trim();
    const aliases = new Map([
      ["家庭开销", "family-bill"],
      ["税费手续费", "tax-fee"],
      ["家政服务", "home-service"],
      ["物业", "property"],
      ["停车费", "parking"],
      ["电费", "utility-power"],
      ["水费", "utility-water"],
      ["话费", "phone-bill"],
      ["牙科", "medical-dental"],
      ["医疗药品", "medical-pill"],
      ["电子数码", "digital-headphone"],
      ["生活其他", "home-supplies"],
      ["正版软件", "software-briefcase"],
      ["服饰", "clothing-shirt"],
      ["软装家具", "home-house"],
      ["微信红包", "gift-money"],
      ["投资其他", "investment"],
    ]);
    if (aliases.has(clean)) return aliases.get(clean);
    if (CATEGORY_ICON_KEYS.has(clean)) return CATEGORY_ICON_KEYS.get(clean);
    for (const [key, icon] of aliases.entries()) {
      if (clean.includes(key) || key.includes(clean)) return icon;
    }
    for (const [key, icon] of CATEGORY_ICON_KEYS.entries()) {
      if (clean.includes(key) || key.includes(clean)) return icon;
    }
    return "category-generic";
  }

  function categoryIconSvg(key) {
    const icons = {
      "food-breakfast": "<svg viewBox=\"0 0 32 32\"><path class=\"fill\" d=\"M9 10c0-3 2-5 7-5s7 2 7 5v12c0 3-3 5-7 5s-7-2-7-5V10Z\"/><circle class=\"cutout\" cx=\"16\" cy=\"18\" r=\"3.2\"/></svg>",
      "food-lunch": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 17h16v2a8 8 0 0 1-16 0v-2Z\"/><path d=\"M12 14c0-3 2-4 4-4s4 1 4 4\"/><path d=\"M6 17h20\"/></svg>",
      "food-dinner": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 19h16v1a8 8 0 0 1-16 0v-1Z\"/><path d=\"M16 8v4\"/><path d=\"M12 11h8\"/><path d=\"M7 19h18\"/></svg>",
      "medical-pill": "<svg viewBox=\"0 0 32 32\"><rect x=\"6\" y=\"12\" width=\"20\" height=\"10\" rx=\"5\" transform=\"rotate(-38 16 17)\"/><path d=\"M15 11.5 20.5 18\"/></svg>",
      "medical-dental": "<svg viewBox=\"0 0 32 32\"><path class=\"fill\" d=\"M11 7c2 0 3 1 5 1s3-1 5-1c3 0 5 3 5 7 0 6-3 13-6 13-2 0-1-6-4-6s-2 6-4 6c-3 0-6-7-6-13 0-4 2-7 5-7Z\"/><path class=\"cutout\" d=\"M12 11c2 1 5 1 8 0\"/></svg>",
      "clothing-shirt": "<svg viewBox=\"0 0 32 32\"><path class=\"fill\" d=\"M8 9 13 6c1 2 5 2 6 0l5 3 3 5-4 2-1 10H10L9 16l-4-2 3-5Z\"/></svg>",
      "shipping": "<svg viewBox=\"0 0 32 32\"><path d=\"M7 12h18v11H7z\"/><path d=\"M11 12V9h10v3\"/><path d=\"M7 17h18\"/></svg>",
      "health-organic": "<svg viewBox=\"0 0 32 32\"><path d=\"M16 23c7-5 8-13 3-16-4 2-6 5-3 16Z\"/><path d=\"M16 23c-7-5-8-13-3-16 4 2 6 5 3 16Z\"/><path d=\"M16 23v4\"/></svg>",
      "software-briefcase": "<svg viewBox=\"0 0 32 32\"><path d=\"M7 13h18v12H7z\"/><path d=\"M12 13v-3h8v3\"/><path d=\"M7 17h18\"/><path d=\"M15 19h2\"/></svg>",
      "digital-headphone": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 20v-4a8 8 0 0 1 16 0v4\"/><path d=\"M8 20v5h4v-7H9a1 1 0 0 0-1 1Z\"/><path d=\"M24 20v5h-4v-7h3a1 1 0 0 1 1 1Z\"/></svg>",
      "health-bottle": "<svg viewBox=\"0 0 32 32\"><path d=\"M13 10h6l1 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V13l1-3Z\"/><path d=\"M14 6h4v4h-4z\"/><path d=\"M13 18h6\"/></svg>",
      "home-house": "<svg viewBox=\"0 0 32 32\"><path d=\"M6 16 16 7l10 9\"/><path d=\"M9 15v11h14V15\"/><path d=\"M14 26v-6h4v6\"/></svg>",
      "home-appliance": "<svg viewBox=\"0 0 32 32\"><rect x=\"9\" y=\"7\" width=\"14\" height=\"20\" rx=\"2\"/><circle cx=\"16\" cy=\"22\" r=\"2\"/><path d=\"M12 12h8\"/></svg>",
      "home-ventilation": "<svg viewBox=\"0 0 32 32\"><path d=\"M9 20c4-8 10-8 14 0\"/><path d=\"M7 24h18\"/><path d=\"M12 24v3\"/><path d=\"M20 24v3\"/></svg>",
      "drink-bowl": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 17h16v2a8 8 0 0 1-16 0v-2Z\"/><path d=\"M11 12h10\"/><path d=\"M13 9h6\"/></svg>",
      "drink-milk": "<svg viewBox=\"0 0 32 32\"><path d=\"M11 8h10l-1 19h-8L11 8Z\"/><path d=\"M12 14h8\"/><path d=\"M13 5h6\"/></svg>",
      "digital-router": "<svg viewBox=\"0 0 32 32\"><rect x=\"8\" y=\"15\" width=\"16\" height=\"9\" rx=\"2\"/><path d=\"M12 15v-4\"/><path d=\"M20 15v-4\"/><path d=\"M12 20h1\"/><path d=\"M17 20h3\"/></svg>",
      "family-bill": "<svg viewBox=\"0 0 32 32\"><path d=\"M10 6h12v20l-3-2-3 2-3-2-3 2V6Z\"/><path d=\"M13 12h6\"/><path d=\"M13 17h6\"/></svg>",
      "tax-fee": "<svg viewBox=\"0 0 32 32\"><path d=\"M9 7h14v18H9z\"/><path d=\"M12 12h8\"/><path d=\"M12 17h8\"/><path d=\"M12 22h4\"/><path d=\"M20 22l3-3\"/><path d=\"M23 22l-3-3\"/></svg>",
      "home-service": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 15h16\"/><path d=\"M16 8v17\"/><path d=\"M11 25h10\"/><path d=\"M10 15l2-7h8l2 7\"/><path d=\"M10 18l-2 7\"/><path d=\"M22 18l2 7\"/></svg>",
      "property": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 25V10l8-5 8 5v15\"/><path d=\"M12 25v-8h8v8\"/><path d=\"M11 12h2\"/><path d=\"M19 12h2\"/></svg>",
      "parking": "<svg viewBox=\"0 0 32 32\"><rect x=\"8\" y=\"6\" width=\"16\" height=\"20\" rx=\"3\"/><path d=\"M13 23V10h5a4 4 0 0 1 0 8h-5\"/></svg>",
      "utility-power": "<svg viewBox=\"0 0 32 32\"><path class=\"fill\" d=\"M18 4 9 18h6l-1 10 9-15h-6l1-9Z\"/></svg>",
      "phone-bill": "<svg viewBox=\"0 0 32 32\"><rect x=\"10\" y=\"5\" width=\"12\" height=\"22\" rx=\"3\"/><path d=\"M14 9h4\"/><path d=\"M16 23h.1\"/></svg>",
      "gift-money": "<svg viewBox=\"0 0 32 32\"><rect x=\"7\" y=\"11\" width=\"18\" height=\"15\" rx=\"2\"/><path d=\"M7 16h18\"/><path d=\"M16 11v15\"/><path d=\"M11 11c-3-3 2-6 5 0\"/><path d=\"M21 11c3-3-2-6-5 0\"/></svg>",
      "investment": "<svg viewBox=\"0 0 32 32\"><path d=\"M7 23 13 17l4 4 8-11\"/><path d=\"M20 10h5v5\"/></svg>",
      "media": "<svg viewBox=\"0 0 32 32\"><rect x=\"7\" y=\"9\" width=\"18\" height=\"14\" rx=\"3\"/><path class=\"fill\" d=\"M14 13v6l5-3-5-3Z\"/></svg>",
      "transport": "<svg viewBox=\"0 0 32 32\"><path d=\"M8 19h16l-2-7H10l-2 7Z\"/><path d=\"M7 19v5h4\"/><path d=\"M25 19v5h-4\"/><circle cx=\"11\" cy=\"22\" r=\"1\"/><circle cx=\"21\" cy=\"22\" r=\"1\"/></svg>",
      "income-salary": "<svg viewBox=\"0 0 32 32\"><rect x=\"7\" y=\"10\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M10 15h12\"/><path d=\"M16 13v8\"/><path d=\"M13 16l3 3 3-3\"/></svg>",
      "income-bonus": "<svg viewBox=\"0 0 32 32\"><path d=\"M16 6v20\"/><path d=\"M10 11c0-3 4-3 6 0 2-3 6-3 6 0 0 5-6 5-6 5s-6 0-6-5Z\"/><path d=\"M8 18h16v8H8z\"/></svg>",
      "income-refund": "<svg viewBox=\"0 0 32 32\"><path d=\"M21 10H11a5 5 0 0 0 0 10h10\"/><path d=\"M14 7 10 10l4 3\"/><path d=\"M18 16h6v8h-6z\"/></svg>",
      "category-generic": "<svg viewBox=\"0 0 32 32\"><circle cx=\"16\" cy=\"16\" r=\"8\"/><path d=\"M16 8v16\"/><path d=\"M8 16h16\"/></svg>",
    };
    return icons[key] || icons["category-generic"];
  }

  function iconSpan(name, extraClass = "") {
    const key = categoryIconKey(name);
    return `<span class="finance-category-symbol svg-icon icon-${key} ${extraClass}" aria-hidden="true">${categoryIconSvg(key)}</span>`;
  }

  function setView(view) {
    if (view !== state.activeView) state.previousView = state.activeView;
    state.activeView = view;
    document.body.dataset.financeView = view;
    document.documentElement.classList.toggle("finance-entry-open", view === "entry");
    $$("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
    $$("[data-nav-view]").forEach((button) => button.classList.toggle("active", button.dataset.navView === view));
    if (view === "entry") setEntryType(state.entryType || "expense");
    updateTopbar();
    scheduleUiProbe(`view:${view}`);
    postHermesNavigation();
    if (view === "stocks") refreshOwnerStocksLive();
    if (view === ROOT_VIEW) applyPendingClientReload();
  }

  async function refreshOwnerStocksLive() {
    const nav = $("[data-owner-stocks-nav]");
    if (!nav || nav.hidden) return;
    const status = $("[data-stock-status]");
    if (status) status.textContent = "刷新中";
    try {
      const payload = await api("/api/finance/owner-stocks/summary?live=1");
      renderOwnerStocks(payload.result || null);
    } catch (err) {
      if (status) status.textContent = "实时刷新失败";
    }
  }

  function isSecondaryView(view = state.activeView) {
    return ["transactions", "transaction-detail", "report-trend", "report-breakdown", "report-detail"].includes(view);
  }

  function isBackableView(view = state.activeView) {
    return Boolean(view && view !== ROOT_VIEW);
  }

  function updateTopbar() {
    const button = $("[data-topbar-left]");
    const glyph = button ? $(".finance-glyph", button) : null;
    if (!button || !glyph) return;
    const secondary = isSecondaryView();
    button.hidden = false;
    button.disabled = !secondary;
    button.classList.toggle("is-spacer", !secondary);
    button.toggleAttribute("data-open-settings", false);
    button.toggleAttribute("data-back", secondary);
    button.setAttribute("aria-label", isSecondaryView() ? "返回" : "设置");
    glyph.classList.toggle("finance-glyph-settings", false);
    glyph.classList.toggle("finance-glyph-back", secondary);
  }

  function closeTopOverlay() {
    const settings = $("[data-settings-overlay]");
    if (settings && !settings.classList.contains("hidden")) {
      hideOverlay(settings);
      return true;
    }
    const reportActions = $("[data-report-action-overlay]");
    if (reportActions && !reportActions.classList.contains("hidden")) {
      hideOverlay(reportActions);
      return true;
    }
    const reportPicker = $("[data-report-picker-overlay]");
    if (reportPicker && !reportPicker.classList.contains("hidden")) {
      hideOverlay(reportPicker);
      return true;
    }
    const attachmentOverlay = $("[data-attachment-overlay]");
    if (attachmentOverlay && !attachmentOverlay.classList.contains("hidden")) {
      hideOverlay(attachmentOverlay);
      return true;
    }
    const ledgerOverlay = $("[data-ledger-overlay]");
    if (ledgerOverlay && !ledgerOverlay.classList.contains("hidden")) {
      hideOverlay(ledgerOverlay);
      return true;
    }
    const categoryPickerOverlay = $("[data-category-picker-overlay]");
    if (categoryPickerOverlay && !categoryPickerOverlay.classList.contains("hidden")) {
      hideOverlay(categoryPickerOverlay);
      return true;
    }
    const entryChoiceOverlay = $("[data-entry-choice-overlay]");
    if (entryChoiceOverlay && !entryChoiceOverlay.classList.contains("hidden")) {
      hideOverlay(entryChoiceOverlay);
      return true;
    }
    const entryNoteOverlay = $("[data-entry-note-overlay]");
    if (entryNoteOverlay && !entryNoteOverlay.classList.contains("hidden")) {
      closeEntryNoteOverlay();
      return true;
    }
    const entryDateOverlay = $("[data-entry-date-overlay]");
    if (entryDateOverlay && !entryDateOverlay.classList.contains("hidden")) {
      closeEntryDatePicker();
      return true;
    }
    const recurringOverlay = $("[data-recurring-overlay]");
    if (recurringOverlay && !recurringOverlay.classList.contains("hidden")) {
      hideOverlay(recurringOverlay);
      postHermesNavigation();
      return true;
    }
    return false;
  }

  function goBack() {
    if (closeTopOverlay()) return true;
    if (closeSwipeRows()) return true;
    if (state.activeView === "transaction-detail") {
      setView(state.previousView === "transaction-detail" ? "transactions" : state.previousView || "transactions");
      return true;
    }
    if (["report-trend", "report-breakdown", "report-detail"].includes(state.activeView)) {
      setView("reports");
      return true;
    }
    if (state.activeView === "transactions") {
      setView(ROOT_VIEW);
      return true;
    }
    if (state.activeView === "entry") {
      resetPendingAttachments();
      clearEntryDraft();
      setEntryAction("create", null);
    }
    if (state.activeView !== ROOT_VIEW) {
      setView(ROOT_VIEW);
      return true;
    }
    return false;
  }

  function groupTransactionsByDate(rows = []) {
    const groups = [];
    const byKey = new Map();
    for (const row of rows) {
      const key = dateKey(row.occurredAt);
      if (!byKey.has(key)) {
        const group = { key, label: formatWacaiDate(row.occurredAt), income: 0, expense: 0, rows: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      const group = byKey.get(key);
      const amount = Math.abs(Number(row.amountMinor || 0));
      if (row.type === "income") group.income += amount;
      if (row.type === "expense") group.expense += amount;
      group.rows.push(row);
    }
    return groups;
  }

  function swipeActionButtons(id) {
    const safeId = escapeHtml(id);
    return `
      <button type="button" class="edit" data-transaction-action="edit" data-action-transaction-id="${safeId}">编辑</button>
      <button type="button" class="copy" data-transaction-action="copy" data-action-transaction-id="${safeId}">复制</button>
      <button type="button" class="delete" data-transaction-action="delete" data-action-transaction-id="${safeId}">删除</button>
    `;
  }

  function transactionRow(row) {
    const title = row.categoryName || typeLabel(row.type);
    const detailLine = [row.note, row.merchantName].filter(Boolean).join(" · ");
    const dateLine = [formatTransactionRowDateTime(row.occurredAt), row.accountName, row.memberName].filter(Boolean).join(" · ");
    const hasImage = Number(row.imageAttachmentCount || 0) > 0 || Boolean(row.firstImageUrl);
    const attachmentCount = Number(row.attachmentCount || 0);
    const attachmentBadge = hasImage
      ? `<span class="finance-row-attachment image" aria-label="有图片附件"></span>`
      : attachmentCount > 0
        ? `<span class="finance-row-attachment" aria-label="有附件"></span>`
        : "";
    return `
      <div class="finance-swipe-row" data-swipe-transaction-id="${escapeHtml(row.id)}">
        <div class="finance-swipe-actions" aria-hidden="true" data-swipe-actions></div>
        <button type="button" class="finance-row finance-row-button" data-transaction-id="${escapeHtml(row.id)}">
          ${iconSpan(title, "finance-row-icon")}
          <div class="finance-row-body">
            <div class="finance-row-title">${escapeHtml(title)}</div>
            ${detailLine ? `<div class="finance-row-detail">${escapeHtml(detailLine)}</div>` : ""}
            <div class="finance-row-meta">${escapeHtml(dateLine)}</div>
          </div>
          <div class="finance-row-amount ${escapeHtml(row.type)}">${attachmentBadge}${escapeHtml(amountText(row, true))}</div>
        </button>
      </div>
    `;
  }

  function transactionGroupsHtml(rows = []) {
    if (!rows.length) return "";
    return groupTransactionsByDate(rows).map((group) => `
      <section class="finance-date-group">
        <div class="finance-date-header">
          <strong>${escapeHtml(group.label)}</strong>
          <span>鏀?${formatMinorMoney(group.income)} 鏀?${formatMinorMoney(group.expense)}</span>
        </div>
        ${group.rows.map(transactionRow).join("")}
      </section>
    `).join("");
  }

  function renderAllTransactionsList(rows = state.transactionRows) {
    const allTarget = $("[data-all-transaction-list]");
    if (!allTarget) return;
    const searching = Boolean(state.transactionSearchQuery);
    const resultRows = searching ? state.transactionSearchRows : rows;
    if (!resultRows.length) {
      allTarget.innerHTML = `<div class="finance-empty">${searching ? "没有匹配账单" : "暂无明细，通过记账页新增第一笔账。"}</div>`;
      return;
    }
    allTarget.innerHTML = transactionGroupsHtml(resultRows);
  }

  function updateTransactionSearchStatus() {
    const target = $("[data-transaction-search-status]");
    if (!target) return;
    if (!state.transactionSearchQuery) {
      target.textContent = "";
      return;
    }
    target.textContent = state.transactionSearchLoading
      ? "搜索中"
      : `找到 ${Number(state.transactionSearchRows.length).toLocaleString("zh-CN")} 笔，可左滑复制`;
  }

  function renderTransactions(rows = []) {
    const target = $("[data-transaction-list]");
    const allTarget = $("[data-all-transaction-list]");
    if (!target && !allTarget) return;
    if (!rows.length) {
      const empty = `<div class="finance-empty">暂无明细，通过记账页新增第一笔账。</div>`;
      if (target) target.innerHTML = empty;
      if (allTarget) renderAllTransactionsList(rows);
      updateTransactionSearchStatus();
      return;
    }
    const html = groupTransactionsByDate(rows).map((group) => `
      <section class="finance-date-group">
        <div class="finance-date-header">
          <strong>${escapeHtml(group.label)}</strong>
          <span>收 ${formatMinorMoney(group.income)} 支 ${formatMinorMoney(group.expense)}</span>
        </div>
        ${group.rows.map(transactionRow).join("")}
      </section>
    `).join("");
    if (target) target.innerHTML = html;
    if (allTarget) renderAllTransactionsList(rows);
    updateTransactionSearchStatus();
  }

  function resetTransactionPagination(rows = []) {
    state.transactionRows = rows.slice();
    state.transactionPageOffset = state.transactionRows.length;
    state.transactionHasMore = rows.length >= TRANSACTION_PAGE_SIZE;
    state.transactionLoadingMore = false;
  }

  function appendTransactionRows(rows = []) {
    const knownIds = new Set(state.transactionRows.map((row) => row.id));
    const freshRows = rows.filter((row) => !knownIds.has(row.id));
    state.transactionRows = state.transactionRows.concat(freshRows);
    return freshRows.length;
  }

  async function loadMoreTransactions() {
    if (state.transactionLoadingMore || !state.transactionHasMore) return;
    state.transactionLoadingMore = true;
    try {
      const requestOffset = state.transactionPageOffset;
      let payload = await api(`/api/finance/transactions?${queryString({
        limit: TRANSACTION_PAGE_SIZE,
        offset: requestOffset,
      })}`);
      let rows = payload.transactions || [];
      let appended = appendTransactionRows(rows);
      if (appended === 0 && rows.length >= TRANSACTION_PAGE_SIZE && requestOffset > 0) {
        const fallbackLimit = Math.min(requestOffset + TRANSACTION_PAGE_SIZE, TRANSACTION_LIST_CAP);
        payload = await api(`/api/finance/transactions?${queryString({ limit: fallbackLimit })}`);
        rows = payload.transactions || [];
        appended = appendTransactionRows(rows);
      }
      state.transactionPageOffset = state.transactionRows.length;
      state.transactionHasMore = rows.length >= TRANSACTION_PAGE_SIZE && state.transactionRows.length < TRANSACTION_LIST_CAP;
      if (state.overview) state.overview.transactions = state.transactionRows;
      renderTransactions(state.transactionRows);
    } finally {
      state.transactionLoadingMore = false;
    }
  }

  function maybeLoadMoreTransactions() {
    if (state.activeView !== ROOT_VIEW && state.activeView !== "transactions") return;
    if (!state.transactionHasMore || state.transactionLoadingMore) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const fullHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (fullHeight - (scrollTop + viewportHeight) <= 160) loadMoreTransactions().catch(showError);
  }

  function scheduleTransactionPaginationCheck() {
    window.setTimeout(maybeLoadMoreTransactions, 0);
  }

  function findTransaction(id) {
    return state.transactionRows.find((row) => row.id === id)
      || state.transactionSearchRows.find((row) => row.id === id)
      || (state.overview?.transactions || []).find((row) => row.id === id)
      || state.reportDetailTransactions.find((row) => row.id === id)
      || (state.selectedTransaction?.id === id ? state.selectedTransaction : null)
      || null;
  }

  async function runTransactionSearch() {
    const query = String(state.transactionSearchQuery || "").trim();
    if (!query) {
      state.transactionSearchRows = [];
      state.transactionSearchLoading = false;
      renderAllTransactionsList(state.transactionRows);
      updateTransactionSearchStatus();
      return;
    }
    state.transactionSearchLoading = true;
    updateTransactionSearchStatus();
    try {
      const payload = await api(`/api/finance/transactions?${queryString({
        limit: 100,
        offset: 0,
        search: query,
      })}`);
      if (query !== String(state.transactionSearchQuery || "").trim()) return;
      state.transactionSearchRows = payload.transactions || [];
      renderAllTransactionsList(state.transactionRows);
    } finally {
      state.transactionSearchLoading = false;
      updateTransactionSearchStatus();
    }
  }

  function scheduleTransactionSearch(value) {
    state.transactionSearchQuery = String(value || "").trim();
    window.clearTimeout(state.transactionSearchTimer);
    state.transactionSearchTimer = window.setTimeout(() => {
      runTransactionSearch().catch(showError);
    }, 180);
    if (!state.transactionSearchQuery) {
      state.transactionSearchRows = [];
      renderAllTransactionsList(state.transactionRows);
      updateTransactionSearchStatus();
    } else {
      state.transactionSearchLoading = true;
      updateTransactionSearchStatus();
    }
  }

  function commitTransactionSearch(input = $("[data-transaction-search]")) {
    const value = String(input?.value || "").trim();
    const now = Date.now();
    window.clearTimeout(state.transactionSearchTimer);
    state.transactionSearchQuery = value;
    if (input?.blur) {
      input.blur();
      window.setTimeout(refreshInputFocusState, 0);
    }
    if (state.transactionSearchCommitValue === value && now - state.transactionSearchCommitAt < 250) return;
    state.transactionSearchCommitValue = value;
    state.transactionSearchCommitAt = now;
    runTransactionSearch().catch(showError);
  }

  function openBillSearch() {
    setView("transactions");
    focusTransactionSearchInput();
    window.setTimeout(focusTransactionSearchInput, 60);
    window.setTimeout(focusTransactionSearchInput, 180);
  }

  function focusTransactionSearchInput() {
    const input = $("[data-transaction-search]");
    if (!input) return;
    input.focus({ preventScroll: true });
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }

  function refreshInputFocusState() {
    const active = document.activeElement;
    const focused = Boolean(active && active.matches?.("input, textarea, select, [contenteditable='true']"));
    const noteFocused = Boolean(active && active.matches?.("[data-entry-note-editor]")) || entryNoteOverlayActive();
    document.documentElement.classList.toggle("finance-input-focus", focused || noteFocused);
    document.documentElement.classList.toggle("finance-entry-note-focus", noteFocused);
    updateFinanceViewportVars();
    updateKeyboardViewportOffset({ noteFocused });
  }

  function entryNoteOverlayActive() {
    const overlay = $("[data-entry-note-overlay]");
    return Boolean(overlay && !overlay.classList.contains("hidden") && overlay.dataset.entryNoteActive === "true");
  }

  function financeViewportState() {
    const visualHeight = Math.max(0, Number(window.visualViewport?.height || 0) || 0);
    const visualOffsetTop = Math.max(0, Number(window.visualViewport?.offsetTop || 0) || 0);
    const localScrollTop = Math.max(
      0,
      Number(window.scrollY || 0) || 0,
      Number(document.documentElement?.scrollTop || 0) || 0,
      Number(document.body?.scrollTop || 0) || 0,
    );
    const localVisibleTop = Math.max(visualOffsetTop, localScrollTop);
    const visualBottom = visualHeight ? visualHeight + visualOffsetTop : 0;
    const layout = Math.max(
      0,
      Number(window.innerHeight || 0) || 0,
      Number(document.documentElement?.clientHeight || 0) || 0,
    );
    const active = document.activeElement;
    const keyboardEditable = Boolean(active && active.matches?.("input:not([type='hidden']):not([readonly]), textarea, [contenteditable='true']")) || entryNoteOverlayActive();
    const childKeyboardShrunk = Boolean(visualHeight && layout && visualHeight < layout - 120);
    const offsetKeyboardShrunk = Boolean(keyboardEditable && visualOffsetTop > 40);
    const scrollKeyboardShifted = Boolean(keyboardEditable && localScrollTop > 40);
    const keyboardShrunk = Boolean(keyboardEditable && (childKeyboardShrunk || offsetKeyboardShrunk || scrollKeyboardShifted));
    const effectiveLayout = Math.max(layout, visualBottom || 0, localVisibleTop + (visualHeight || 0));
    const localVisualHeight = Math.max(0, Math.round(visualHeight || (visualBottom ? visualBottom - visualOffsetTop : 0) || 0));
    const effectiveTop = keyboardShrunk ? Math.max(0, Math.round(localVisibleTop || 0)) : 0;
    const effectiveHeight = keyboardShrunk
      ? Math.max(IS_HERMES_EMBED ? 240 : 320, localVisualHeight || layout || 0)
      : Math.max(IS_HERMES_EMBED ? 240 : 320, effectiveLayout || layout || 0);
    const effectiveVisualBottom = keyboardShrunk
      ? effectiveTop + effectiveHeight
      : Math.round(effectiveLayout || layout || 0);
    const keyboardBottom = keyboardShrunk
      ? Math.max(0, Math.round((layout || effectiveLayout || 0) - effectiveVisualBottom))
      : 0;
    return {
      top: effectiveTop,
      height: Math.max(IS_HERMES_EMBED ? 240 : 320, Math.round(effectiveHeight)),
      visualBottom: Math.round(effectiveVisualBottom || effectiveLayout || 0),
      layout: Math.round(effectiveLayout || 0),
      keyboardBottom,
      keyboardShrunk,
    };
  }

  function updateFinanceViewportVars() {
    const viewport = financeViewportState();
    if (viewport.keyboardShrunk || IS_HERMES_EMBED) {
      document.documentElement.style.setProperty("--finance-app-top", `${Math.max(0, Math.round(viewport.top || 0))}px`);
      document.documentElement.style.setProperty("--finance-app-height", `${viewport.height}px`);
    } else {
      document.documentElement.style.removeProperty("--finance-app-top");
      document.documentElement.style.removeProperty("--finance-app-height");
    }
    document.documentElement.classList.toggle("finance-keyboard-open", viewport.keyboardShrunk);
    return viewport;
  }

  function updateKeyboardViewportOffset(options = {}) {
    const active = document.activeElement;
    const noteFocused = typeof options.noteFocused === "boolean"
      ? options.noteFocused
      : Boolean(active && active.matches?.("[data-entry-note-editor]")) || entryNoteOverlayActive();
    const viewport = updateFinanceViewportVars();
    if (!noteFocused) {
      document.documentElement.style.setProperty("--finance-keyboard-bottom", "0px");
      document.documentElement.style.setProperty("--finance-visual-bottom", `${viewport.visualBottom || Math.round(window.innerHeight)}px`);
      document.documentElement.style.setProperty("--finance-note-bottom-edge", `${viewport.visualBottom || Math.round(window.innerHeight)}px`);
      document.documentElement.classList.remove("finance-native-keyboard-visible");
      return;
    }
    const visual = window.visualViewport;
    const keyboard = Math.max(0, viewport.keyboardBottom || (visual ? window.innerHeight - visual.height - visual.offsetTop : 0));
    const visualBottom = viewport.visualBottom || (visual ? Math.max(0, visual.offsetTop + visual.height) : window.innerHeight);
    const rounded = Math.round(keyboard);
    document.documentElement.style.setProperty("--finance-keyboard-bottom", `${rounded}px`);
    document.documentElement.style.setProperty("--finance-visual-bottom", `${Math.round(visualBottom)}px`);
    document.documentElement.style.setProperty("--finance-note-bottom-edge", `${noteBottomEdgeFromViewport(visualBottom, keyboard)}px`);
    syncEntryNoteSheetMetrics();
    resetEntryNoteScrollPosition();
    document.documentElement.classList.toggle("finance-native-keyboard-visible", rounded > 80);
  }

  function resetEntryNoteScrollPosition() {
    const overlay = $("[data-entry-note-overlay]");
    if (!overlay || overlay.classList.contains("hidden")) return;
    overlay.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }

  function pinEntryNoteViewport() {
    if (!entryNoteOverlayActive()) return;
    updateKeyboardViewportOffset({ noteFocused: true });
    resetEntryNoteScrollPosition();
  }

  function pinEntryNoteViewportSoon(delay = 0) {
    if (!entryNoteOverlayActive()) return;
    window.clearTimeout(state.entryNoteViewportPinTimer);
    state.entryNoteViewportPinTimer = window.setTimeout(pinEntryNoteViewport, Math.max(0, delay));
  }

  function scheduleEntryNoteViewportPinning() {
    [0, 50, 120, 220, 360, 560, 840, 1200, 1800, 2600, 3600].forEach((delay) => {
      window.setTimeout(pinEntryNoteViewport, delay);
    });
  }

  function syncEntryNoteSheetMetrics() {
    const sheet = $(".finance-entry-note-sheet");
    if (!sheet) return;
    const height = Math.max(160, Math.round(sheet.getBoundingClientRect().height || 0));
    document.documentElement.style.setProperty("--finance-note-sheet-height", `${height}px`);
  }

  function noteBottomEdgeFromViewport(visualBottom, keyboard) {
    const layoutHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
    const base = Math.max(0, Math.round(visualBottom || layoutHeight));
    if (keyboard <= 80) return Math.min(layoutHeight, base);
    const cappedKeyboard = Math.min(Math.round(keyboard), Math.round(layoutHeight * 0.42));
    const keyboardTopEstimate = layoutHeight - cappedKeyboard;
    const readableFloor = Math.round(layoutHeight * 0.58);
    return Math.min(layoutHeight, Math.max(base, keyboardTopEstimate, readableFloor));
  }

  function forceEntryNoteVisualProbe() {
    openEntryNoteOverlay();
    const input = $("[data-entry-note-editor]");
    if (!input) return;
    input.focus({ preventScroll: true });
    document.documentElement.classList.add("finance-input-focus", "finance-entry-note-focus");
    if (VISUAL_PROBE_KEYBOARD_BOTTOM > 0) {
      const visualBottom = Math.max(0, Math.round(window.innerHeight - VISUAL_PROBE_KEYBOARD_BOTTOM));
      document.documentElement.style.setProperty("--finance-keyboard-bottom", `${VISUAL_PROBE_KEYBOARD_BOTTOM}px`);
      document.documentElement.style.setProperty("--finance-app-height", `${visualBottom}px`);
      document.documentElement.style.setProperty("--finance-visual-bottom", `${visualBottom}px`);
      document.documentElement.style.setProperty("--finance-note-bottom-edge", `${noteBottomEdgeFromViewport(visualBottom, VISUAL_PROBE_KEYBOARD_BOTTOM)}px`);
      document.documentElement.classList.add("finance-keyboard-open", "finance-native-keyboard-visible");
    } else {
      updateKeyboardViewportOffset({ noteFocused: true });
    }
    postUiProbe("visual-probe:entry-note", { preferBeacon: false }).catch(() => {});
    scheduleUiProbe("visual-probe:entry-note");
  }

  function applyVisualProbeIfRequested() {
    if (state.visualProbeApplied || !VISUAL_PROBE) return;
    if (VISUAL_PROBE !== "entry" && VISUAL_PROBE !== "entry-note") return;
    state.visualProbeApplied = true;
    openNewEntry("expense");
    if (VISUAL_PROBE === "entry-note") {
      window.setTimeout(forceEntryNoteVisualProbe, 160);
    } else {
      postUiProbe("visual-probe:entry", { preferBeacon: false }).catch(() => {});
      scheduleUiProbe("visual-probe:entry");
    }
  }

  function detailRow(label, value) {
    return `
      <div class="finance-detail-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "未填写")}</strong>
      </div>
    `;
  }

  function tagNamesText(row = {}) {
    return (Array.isArray(row.tags) ? row.tags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .join("、");
  }

  function attachmentThumb(row = {}) {
    const label = row.fileName || row.id || "附件";
    if (isImageAttachment(row)) {
      const previewUrl = row.url || row.thumbnailUrl || "";
      const thumbUrl = row.thumbnailUrl || row.url || "";
      return `
        <button type="button" class="finance-attachment-thumb" data-attachment-preview-url="${escapeHtml(previewUrl)}" data-attachment-preview-label="${escapeHtml(label)}">
          <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(label)}">
        </button>
      `;
    }
    return `<a class="finance-attachment-file" href="${escapeHtml(row.url || "#")}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }

  function renderDetailAttachments(rows = []) {
    const target = $("[data-detail-attachments]");
    const count = $("[data-detail-attachment-count]");
    if (!target) return;
    if (state.selectedTransaction) {
      state.selectedTransaction = {
        ...state.selectedTransaction,
        attachmentCount: rows.length,
        imageAttachmentCount: rows.filter(isImageAttachment).length,
      };
    }
    if (count) count.textContent = rows.length ? `${rows.length} 个附件` : "无附件";
    target.innerHTML = rows.length
      ? rows.map(attachmentThumb).join("")
      : `<div class="finance-empty">暂无附件</div>`;
  }

  async function loadTransactionDetailAttachments(transactionId) {
    if (!transactionId) return;
    const target = $("[data-detail-attachments]");
    if (target) target.innerHTML = `<div class="finance-empty">正在加载附件...</div>`;
    const payload = await api(`/api/finance/transactions/${encodeURIComponent(transactionId)}/attachments`);
    renderDetailAttachments(payload.attachments || []);
  }

  function renderTransactionDetail(row) {
    if (!row) return;
    state.selectedTransaction = row;
    const target = $("[data-transaction-detail]");
    const status = $("[data-detail-status]");
    if (status) status.textContent = typeLabel(row.type);
    if (target) {
      target.innerHTML = [
        `<div class="finance-detail-actions">
          <button type="button" data-transaction-action="edit" data-action-transaction-id="${escapeHtml(row.id)}">编辑</button>
          <button type="button" data-transaction-action="copy" data-action-transaction-id="${escapeHtml(row.id)}">复制</button>
          <button type="button" class="danger" data-transaction-action="delete" data-action-transaction-id="${escapeHtml(row.id)}">删除</button>
        </div>`,
        detailRow("金额", `${amountText(row, false)} ${currencyLabel(row.currency)}`),
        detailRow("时间", formatFullDate(row.occurredAt)),
        detailRow("类别", row.categoryName),
        detailRow("账户", row.accountName),
        detailRow("转入", row.type === "transfer" ? row.targetAccountName : ""),
        detailRow("成员", row.memberName),
        detailRow("标签", tagNamesText(row)),
        detailRow("商家", row.merchantName),
        detailRow("备注", row.note),
        detailRow("来源", row.source || "local"),
        detailRow("记录 ID", row.id),
        `<section class="finance-detail-attachments">
          <div class="finance-detail-attachment-header">
            <div class="finance-detail-attachment-title">
              <strong>附件</strong>
              <span data-detail-attachment-count>${Number(row.attachmentCount || 0) ? `${Number(row.attachmentCount || 0)} 个附件` : "加载中"}</span>
            </div>
            <button type="button" class="finance-detail-attachment-add" data-detail-attachment-add="${escapeHtml(row.id)}">添加</button>
          </div>
          <div class="finance-attachment-grid" data-detail-attachments></div>
        </section>`,
      ].join("");
    }
  }

  function openTransactionDetail(id) {
    const row = findTransaction(id);
    if (!row) return;
    renderTransactionDetail(row);
    setView("transaction-detail");
    loadTransactionDetailAttachments(row.id).catch(showError);
  }

  function renderAccounts(rows = []) {
    const target = $("[data-account-list]");
    if (!target) return;
    const groups = new Map();
    for (const row of sortedAccounts(rows)) {
      const currency = String(row.currency || "CNY").toUpperCase();
      if (!groups.has(currency)) groups.set(currency, []);
      groups.get(currency).push(row);
    }
    target.innerHTML = [...groups.entries()].map(([currency, items]) => `
      <section class="finance-account-group">
        <div class="finance-account-group-title">
          <span>${escapeHtml(currencyLabel(currency) || currency)}</span>
          <span>${escapeHtml(currency)}</span>
        </div>
        ${items.map((row) => `
          <div class="finance-row static">
            ${iconSpan(row.type === "payable" ? "家庭支出" : "账户", "finance-row-icon")}
            <div>
              <div class="finance-row-title">${escapeHtml(row.name)}</div>
              <div class="finance-row-meta">${escapeHtml(accountTypeLabel(row.type))} · ${escapeHtml(currencyLabel(row.currency))}</div>
            </div>
            <div class="finance-row-amount">${formatMinorMoney(row.current_balance_minor)} <span>${escapeHtml(row.currency || "")}</span></div>
          </div>
        `).join("")}
      </section>
    `).join("") || `<div class="finance-empty">暂无账户</div>`;
  }

  function renderRecurringRules(rows = state.recurringRules || []) {
    const target = $("[data-recurring-list]");
    const status = $("[data-recurring-status]");
    if (status) status.textContent = rows.length ? `${rows.length} 条规则` : "";
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = `<div class="finance-empty">暂无周期账，可从记账页日期页面保存为周期账。</div>`;
      return;
    }
    target.innerHTML = rows.map((row) => `
      <div class="finance-row static finance-recurring-row">
        ${iconSpan(row.categoryName || row.title || "周期账", "finance-row-icon")}
        <div>
          <div class="finance-row-title">${escapeHtml(row.title || "周期账")}</div>
          <div class="finance-row-meta">${escapeHtml(recurringFrequencyLabel(row))} · ${escapeHtml(recurringStatusLabel(row.status))} · 下次 ${escapeHtml(formatFullDate(row.nextDueAt))}</div>
        </div>
        <div class="finance-row-amount">${escapeHtml(displayAbsoluteMoneyAmount(row, "0"))} <span>${escapeHtml(row.currency || "CNY")}</span></div>
        <div class="finance-recurring-actions">
          <button type="button" data-recurring-toggle="${escapeHtml(row.id)}">${row.status === "active" ? "暂停" : "开启"}</button>
          <button type="button" data-recurring-delete="${escapeHtml(row.id)}">删除</button>
        </div>
      </div>
    `).join("");
  }

  function renderOwnerAssets(summary = state.ownerAssetSummary) {
    state.ownerAssetSummary = summary || null;
    const snapshots = Array.isArray(summary?.snapshots) && summary.snapshots.length
      ? [...summary.snapshots].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
      : summary?.latest ? [summary.latest] : [];
    const enabled = Boolean(summary?.latest || snapshots.length);
    document.body.classList.toggle("finance-owner-assets-enabled", enabled);
    const nav = $("[data-owner-assets-nav]");
    if (nav) nav.hidden = !enabled;
    const status = $("[data-asset-status]");
    const summaryTarget = $("[data-asset-summary]");
    const historyTarget = $("[data-asset-history]");
    const latest = summary?.latest || snapshots[0] || null;
    if (enabled && (!state.selectedOwnerAssetYear || !snapshots.some((row) => Number(row.year) === Number(state.selectedOwnerAssetYear)))) {
      state.selectedOwnerAssetYear = Number(latest?.year || snapshots[0]?.year || 0) || 0;
    }
    const selected = snapshots.find((row) => Number(row.year) === Number(state.selectedOwnerAssetYear)) || latest;
    if (status) status.textContent = enabled ? `${summary.history_count || snapshots.length || 0}年 · ${selected?.year || latest?.year || ""}` : "Owner";
    if (!summaryTarget || !historyTarget) return;
    if (!enabled) {
      state.selectedOwnerAssetYear = 0;
      summaryTarget.innerHTML = `<div class="finance-empty">暂无资产快照</div>`;
      historyTarget.innerHTML = "";
      return;
    }
    const components = selected.components || [];
    summaryTarget.innerHTML = `
      <div class="finance-asset-year-list" data-asset-year-list aria-label="资产年度">
        ${snapshots.map((row) => `
          <button type="button" data-asset-year="${escapeHtml(row.year)}" class="${Number(row.year) === Number(selected.year) ? "active" : ""}" aria-pressed="${Number(row.year) === Number(selected.year) ? "true" : "false"}">${escapeHtml(row.year)}</button>
        `).join("")}
      </div>
      <div class="finance-asset-total-tabs">
        <div class="finance-asset-total-tab">
          <span>${escapeHtml(selected.year)} 人民币总资产</span>
          <strong>${formatCnyMinor(selected.total_assets_cny_minor)}</strong>
        </div>
        <div class="finance-asset-total-tab">
          <span>美元总资产</span>
          <strong>${selected.current_total_assets_usd_minor ? formatCurrencyMinor(selected.current_total_assets_usd_minor, "USD", 2) : "刷新中"}</strong>
        </div>
      </div>
      <div class="finance-asset-metrics">
        <div><span>复合增长率</span><strong>${formatBps(selected.usd_cagr_bps)}</strong></div>
        <div><span>年度回报</span><strong>${formatBps(selected.usd_annual_return_bps)}</strong></div>
        <div><span>总回报倍数</span><strong>${formatMultipleBps(selected.usd_total_return_multiple_bps)}</strong></div>
      </div>
      <div class="finance-asset-live-rate">当前汇率 USD/CNY ${escapeHtml(selected.current_usd_cny_rate || summary.current_fx_error || "刷新中")}</div>
    `;
    historyTarget.innerHTML = `
      <section class="finance-account-group">
        <div class="finance-account-group-title">
          <span>资产构成</span>
          <span>${escapeHtml(selected.as_of_date || selected.year)}</span>
        </div>
        ${components.map((row) => `
          <div class="finance-row static finance-asset-row">
            ${iconSpan(row.component_key === "usd_account" ? "投资" : "账户", "finance-row-icon")}
            <div>
              <div class="finance-row-title">${escapeHtml(row.label || row.component_key)}</div>
              <div class="finance-row-meta">${escapeHtml(row.currency || "CNY")}</div>
            </div>
            <div class="finance-row-amount">${assetComponentAmount(row)}</div>
          </div>
        `).join("")}
      </section>
    `;
    window.requestAnimationFrame?.(() => {
      const activeYear = $("[data-asset-year-list] button.active");
      activeYear?.scrollIntoView({ block: "nearest", inline: "center" });
    });
  }

  function renderOwnerStocks(summary = state.ownerStockSummary) {
    state.ownerStockSummary = summary || null;
    const snapshots = Array.isArray(summary?.snapshots) && summary.snapshots.length
      ? [...summary.snapshots].sort((a, b) => String(b.as_of_date || "").localeCompare(String(a.as_of_date || "")))
      : summary?.latest ? [summary.latest] : [];
    const enabled = Boolean(summary?.latest || snapshots.length);
    document.body.classList.toggle("finance-owner-stocks-enabled", enabled);
    const nav = $("[data-owner-stocks-nav]");
    if (nav) nav.hidden = !enabled;
    const status = $("[data-stock-status]");
    const summaryTarget = $("[data-stock-summary]");
    const historyTarget = $("[data-stock-history]");
    const latest = summary?.latest || snapshots[0] || null;
    if (enabled && (!state.selectedOwnerStockDate || !snapshots.some((row) => String(row.as_of_date) === String(state.selectedOwnerStockDate)))) {
      state.selectedOwnerStockDate = String(latest?.as_of_date || snapshots[0]?.as_of_date || "");
    }
    const selected = snapshots.find((row) => String(row.as_of_date) === String(state.selectedOwnerStockDate)) || latest;
    if (status) status.textContent = enabled ? `${summary.snapshot_count || snapshots.length || 0}期 · ${selected?.as_of_date || latest?.as_of_date || ""}` : "Owner";
    if (!summaryTarget || !historyTarget) return;
    if (!enabled) {
      state.selectedOwnerStockDate = "";
      summaryTarget.innerHTML = `<div class="finance-empty">暂无股票快照</div>`;
      historyTarget.innerHTML = "";
      return;
    }
    const positions = selected.positions || [];
    summaryTarget.innerHTML = `
      <div class="finance-asset-year-list" data-stock-date-list aria-label="股票快照日期">
        ${snapshots.map((row) => `
          <button type="button" data-stock-date="${escapeHtml(row.as_of_date)}" class="${String(row.as_of_date) === String(selected.as_of_date) ? "active" : ""}" aria-pressed="${String(row.as_of_date) === String(selected.as_of_date) ? "true" : "false"}">${escapeHtml(row.as_of_date)}</button>
        `).join("")}
      </div>
      <div class="finance-asset-hero finance-stock-hero">
        <span>${escapeHtml(selected.as_of_date)} 股票组合市值</span>
        <strong>${formatCurrencyMinor(selected.total_market_value_minor, selected.base_currency || "USD", selected.base_scale || 2)}</strong>
        <small>价格/汇率 ${escapeHtml(selected.price_as_of || selected.as_of_date || "")}</small>
      </div>
      <div class="finance-asset-metrics">
        <div><span>当年变动</span><strong>${formatBps(selected.annual_change_bps)}</strong></div>
        <div><span>累计盈亏</span><strong>${formatCurrencyMinor(selected.total_unrealized_gain_minor, selected.base_currency || "USD", selected.base_scale || 2)}</strong></div>
        <div><span>持仓数量</span><strong>${positions.length}</strong></div>
      </div>
    `;
    historyTarget.innerHTML = `
      <section class="finance-account-group">
        <div class="finance-account-group-title">
          <span>持仓明细</span>
          <span>${escapeHtml(selected.base_currency || "USD")}</span>
        </div>
        ${positions.map((row) => `
          <div class="finance-row static finance-asset-row finance-stock-row">
            ${iconSpan("股票", "finance-row-icon")}
            <div class="finance-row-body">
              <div class="finance-row-title">${escapeHtml(row.label || row.ticker || row.position_key)}</div>
              <div class="finance-row-meta">${escapeHtml([row.ticker || "", stockQuantityText(row)].filter(Boolean).join(" · "))}</div>
              <div class="finance-stock-price"><span>当前价格</span><strong>${escapeHtml(stockPositionPrice(row))}</strong></div>
            </div>
            <div class="finance-row-amount">
              ${formatCurrencyMinor(row.market_value_base_minor, selected.base_currency || "USD", selected.base_scale || 2)}
              <span>${formatBps(row.allocation_bps)}</span>
            </div>
          </div>
        `).join("")}
      </section>
    `;
    window.requestAnimationFrame?.(() => {
      const activeDate = $("[data-stock-date-list] button.active");
      activeDate?.scrollIntoView({ block: "nearest", inline: "center" });
    });
  }

  function recurringFormDefaults() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    return {
      title: "",
      frequency: "monthly",
      intervalCount: 1,
      startAt: date,
      endAt: "",
      timeOfDay: "09:00",
      dayOfMonth: Number(date.slice(8, 10)),
      monthOfYear: Number(date.slice(5, 7)),
    };
  }

  function entryRecurringDraft() {
    computeEntryAmount();
    const form = $("[data-entry-form]");
    const data = form ? Object.fromEntries(new FormData(form).entries()) : {};
    const title = data.note || $("[data-entry-selected-category]")?.textContent || "周期账";
    return {
      ...recurringFormDefaults(),
      ...data,
      title,
      type: state.entryType,
      ledger_id: state.activeLedgerId || undefined,
      category_hint: $("[data-category-select]")?.value || data.category_hint || undefined,
    };
  }

  function recurringErrorText(error) {
    const message = error?.message || String(error || "");
    const map = {
      amount_must_be_positive: "金额必须大于 0",
      account_required: "请选择账户",
      account_not_in_ledger: "账户不属于当前账本",
      target_account_not_in_ledger: "目标账户不属于当前账本",
      invalid_transfer_accounts: "转账周期账需要不同的目标账户",
      category_not_in_ledger: "类别不属于当前账本",
      member_not_in_ledger: "成员不属于当前账本",
      invalid_recurring_frequency: "周期设置无效",
      invalid_time_of_day: "时间设置无效",
      invalid_date: "日期设置无效",
    };
    return map[message] || message || "保存失败";
  }

  function setRecurringFormStatus(message = "", variant = "") {
    const target = $("[data-recurring-form-status]");
    if (!target) return;
    target.textContent = message;
    target.dataset.statusVariant = variant;
  }

  function syncRecurringEndMode(form, mode = "") {
    if (!form) return;
    const selected = mode || form.querySelector("[name='end_mode']")?.value || "forever";
    const normalized = selected === "date" ? "date" : "forever";
    const hidden = form.querySelector("[name='end_mode']");
    const endDate = form.querySelector("[name='end_at']");
    if (hidden) hidden.value = normalized;
    if (endDate) {
      endDate.disabled = normalized === "forever";
      if (normalized === "forever") endDate.value = "";
      else if (!endDate.value) endDate.value = form.querySelector("[name='start_at']")?.value || dateInputText(new Date());
    }
    $$("[data-recurring-end-mode]", form).forEach((button) => {
      const active = button.dataset.recurringEndMode === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncRecurringTypeFields(form) {
    if (!form) return;
    const type = form.querySelector("[name='type']")?.value || "expense";
    const targetField = form.querySelector("[data-recurring-target-field]");
    const targetSelect = targetField?.querySelector("[name='target_account_hint']");
    if (!targetField || !targetSelect) return;
    const isTransfer = type === "transfer";
    targetField.hidden = !isTransfer;
    targetSelect.disabled = !isTransfer;
  }

  function openRecurringEditor(draft = {}) {
    const overlay = $("[data-recurring-overlay]");
    if (!overlay) return;
    const next = { ...recurringFormDefaults(), ...draft };
    const categoryTitle = next.title || $("[data-entry-selected-category]")?.textContent || "周期账";
    const amountText = next.amount || $("[data-entry-amount]")?.value || "0";
    const start = String(next.startAt || recurringFormDefaults().startAt).slice(0, 10);
    const time = next.timeOfDay || entryDateParts(`${start} ${next.occurred_at || ""}`).timeText || "09:00";
    const endAt = String(next.endAt || "").slice(0, 10);
    const endMode = endAt ? "date" : "forever";
    overlay.dataset.recurringVariant = "entry-mode";
    overlay.innerHTML = `
      <section class="finance-recurring-entry-mode" role="dialog" aria-modal="true" aria-label="周期账">
        <div class="finance-recurring-entry-card">
          <span class="finance-recurring-badge">周期账</span>
          <button type="button" class="finance-recurring-close" data-recurring-close>关闭</button>
          <div class="finance-recurring-entry-summary">
            ${iconSpan(categoryTitle, "finance-row-icon")}
            <strong>${escapeHtml(categoryTitle)}</strong>
            <b>${escapeHtml(amountText || "0")}</b>
          </div>
        </div>
        <form class="finance-recurring-entry-form" data-recurring-form>
          <label class="finance-recurring-field"><span>名称</span><input name="title" value="${escapeHtml(categoryTitle)}" required></label>
          <label class="finance-recurring-field"><span>金额</span><input name="amount" inputmode="decimal" value="${escapeHtml(amountText)}" required></label>
          <label class="finance-recurring-field"><span>类型</span><select name="type">
            <option value="expense" ${next.type === "expense" ? "selected" : ""}>支出</option>
            <option value="income" ${next.type === "income" ? "selected" : ""}>收入</option>
            <option value="transfer" ${next.type === "transfer" ? "selected" : ""}>转账</option>
          </select></label>
          <label class="finance-recurring-field"><span>周期</span><select name="frequency">
            <option value="daily" ${next.frequency === "daily" ? "selected" : ""}>每天</option>
            <option value="weekly" ${next.frequency === "weekly" ? "selected" : ""}>每周</option>
            <option value="monthly" ${next.frequency === "monthly" ? "selected" : ""}>每月</option>
            <option value="yearly" ${next.frequency === "yearly" ? "selected" : ""}>每年</option>
          </select></label>
          <label class="finance-recurring-field"><span>间隔</span><input name="interval_count" inputmode="numeric" value="${escapeHtml(next.intervalCount || 1)}"></label>
          <label class="finance-recurring-field"><span>开始</span><input type="date" name="start_at" value="${escapeHtml(start)}" required></label>
          <label class="finance-recurring-field finance-recurring-end-field"><span>结束</span>
            <div class="finance-recurring-end-controls">
              <input type="hidden" name="end_mode" value="${escapeHtml(endMode)}">
              <div class="finance-recurring-end-toggle" role="group" aria-label="结束时间">
                <button type="button" data-recurring-end-mode="forever">永续</button>
                <button type="button" data-recurring-end-mode="date">指定日期</button>
              </div>
              <input type="date" name="end_at" value="${escapeHtml(endAt)}">
            </div>
          </label>
          <label class="finance-recurring-field"><span>时间</span><input type="time" name="time_of_day" value="${escapeHtml(time)}"></label>
          <label class="finance-recurring-field"><span>账户</span><select name="account_hint">${accountOptions(state.overview?.accounts || [])}</select></label>
          <label class="finance-recurring-field" data-recurring-target-field hidden><span>目标</span><select name="target_account_hint">${accountOptions(state.overview?.accounts || [])}</select></label>
          <label class="finance-recurring-field"><span>成员</span><select name="member_hint">${optionList(state.overview?.members || [], "display_name")}</select></label>
          <input type="hidden" name="currency" value="${escapeHtml(next.currency || "CNY")}">
          <input type="hidden" name="category_hint" value="${escapeHtml(next.category_hint || next.categoryHint || "")}">
          <input type="hidden" name="ledger_id" value="${escapeHtml(next.ledger_id || state.activeLedgerId || "")}">
          <input type="hidden" name="note" value="${escapeHtml(next.note || "")}">
          <div class="finance-recurring-form-status" data-recurring-form-status aria-live="polite"></div>
          <button type="submit" class="finance-recurring-save" data-recurring-save>保存周期账</button>
        </form>
      </section>
    `;
    const account = overlay.querySelector("[name='account_hint']");
    const targetAccount = overlay.querySelector("[name='target_account_hint']");
    const member = overlay.querySelector("[name='member_hint']");
    if (account && next.account_hint) account.value = next.account_hint;
    if (targetAccount && next.target_account_hint) targetAccount.value = next.target_account_hint;
    if (member && next.member_hint) member.value = next.member_hint;
    syncRecurringEndMode(overlay.querySelector("[data-recurring-form]"), endMode);
    syncRecurringTypeFields(overlay.querySelector("[data-recurring-form]"));
    showOverlay(overlay);
    postHermesNavigation();
  }

  async function submitRecurringForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const saveButton = form.querySelector("[data-recurring-save]");
    setRecurringFormStatus("保存中");
    if (saveButton) saveButton.disabled = true;
    const start = String(data.start_at || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      data.day_of_month = Number(start.slice(8, 10));
      data.month_of_year = Number(start.slice(5, 7));
    }
    if (data.end_mode === "forever") delete data.end_at;
    delete data.end_mode;
    for (const key of ["ledger_id", "category_hint", "account_hint", "member_hint", "end_at", "note"]) {
      if (data[key] === "") delete data[key];
    }
    try {
      const payload = await api("/api/finance/recurring-rules", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setRecurringFormStatus("已保存", "success");
      state.recurringRules = [payload.result.rule, ...state.recurringRules.filter((row) => row.id !== payload.result.rule.id)];
      renderRecurringRules(state.recurringRules);
      const overlay = $("[data-recurring-overlay]");
      if (overlay) delete overlay.dataset.recurringVariant;
      hideOverlay(overlay);
      setView("plan");
    } catch (error) {
      setRecurringFormStatus(recurringErrorText(error), "error");
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function loadRecurringRules() {
    const payload = await api("/api/finance/recurring-rules");
    state.recurringRules = payload.rules || [];
    renderRecurringRules(state.recurringRules);
  }

  function renderDonutLabels(items = []) {
    const target = $("[data-report-donut-labels]");
    if (!target) return;
    target.innerHTML = items.slice(0, 6).map((item, index) => {
      const pct = item.percentageBasisPoints !== undefined ? (Number(item.percentageBasisPoints || 0) / 100).toFixed(2) : "0.00";
      return `<span class="label-${index + 1}">${escapeHtml(item.label)} ${pct}%</span>`;
    }).join("");
  }

  function renderReportRows(target, items = [], options = {}) {
    if (!target) return;
    const { interactive = false, indexAttribute = "data-report-index", amountFallback = false } = options;
    const total = items.reduce((sum, item) => sum + Math.abs(Number(item.amountMinor || 0)), 0);
    const max = Math.max(...items.map((item) => Math.abs(Number(item.amountMinor || 0))), 1);
    if (!items.length) {
      target.innerHTML = `<div class="finance-empty">暂无统计，支出记录会在这里形成排行。</div>`;
      return;
    }
    target.innerHTML = items.map((item, index) => {
      const percent = item.percentageBasisPoints !== undefined
        ? (Number(item.percentageBasisPoints || 0) / 100).toFixed(2)
        : total ? (Math.abs(Number(item.amountMinor || 0)) / total * 100).toFixed(2) : "0.00";
      const width = Math.max(2, (Math.abs(Number(item.amountMinor || 0)) / max) * 100);
      const color = REPORT_COLORS[index % REPORT_COLORS.length];
      const tag = interactive ? "button" : "div";
      const attrs = interactive
        ? `type="button" class="finance-report-row finance-report-row-button" ${indexAttribute}="${index}"`
        : `class="finance-report-row"`;
      const amount = displayMoneyAmount(item, amountFallback ? "0" : "");
      return `
        <${tag} ${attrs}>
          ${iconSpan(item.label, "finance-report-icon").replace("aria-hidden=\"true\"", `style="--item-color:${color}" aria-hidden="true"`)}
          <div class="finance-report-main">
            <div class="finance-report-line">
              <strong>${escapeHtml(item.label)}</strong>
              <b>${escapeHtml(amount)}</b>
            </div>
            <div class="finance-report-bar"><span style="width:${width.toFixed(2)}%;background:${color}"></span></div>
            <div class="finance-report-meta"><span>${escapeHtml(item.count || 0)}笔</span><span>${percent}%</span></div>
          </div>
        </${tag}>
      `;
    }).join("");
  }

  function renderReport(items = []) {
    const target = $("[data-report-list]");
    if (!target) return;
    state.reportRows = items;
    const total = items.reduce((sum, item) => sum + Math.abs(Number(item.amountMinor || 0)), 0);
    const title = $("[data-report-title]");
    const totalNode = $("[data-report-total]");
    const donut = $("[data-report-donut]");
    if (title) title.textContent = `${REPORT_DIMENSIONS[state.reportDimension] || "分类"}支出`;
    if (totalNode) totalNode.textContent = formatMinorMoney(state.overview?.report?.totals?.expenseMinor || total);
    if (donut) {
      let cursor = 0;
      const segments = items.map((item, index) => {
        const pct = total ? (Math.abs(Number(item.amountMinor || 0)) / total) * 100 : 0;
        const start = cursor;
        cursor += pct;
        return `${REPORT_COLORS[index % REPORT_COLORS.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      });
      donut.style.setProperty("--donut", segments.length ? segments.join(", ") : "rgba(255,255,255,0.08) 0 100%");
    }
    renderDonutLabels(items);
    updateReportDateControls(state.overview?.report);
    renderReportRows(target, items, { interactive: true });
  }

  function reportFilterForItem(item = state.selectedReportItem, dimension = state.selectedReportDimension || state.reportDimension) {
    if (!item || !item.key) return {};
    if (dimension === "category") return { category_parent_id: item.key };
    if (dimension === "subcategory") return { category_id: item.key };
    if (dimension === "member") return { member_id: item.key };
    if (dimension === "account") return { account_id: item.key };
    if (dimension === "merchant") return { merchant_id: item.key };
    if (dimension === "tag") return { tag_id: item.key };
    return {};
  }

  function queryString(params) {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
  }

  function reportUsesOriginalCurrency(dimension = state.reportDimension, filters = {}, currency = state.reportCurrency) {
    return !currency && (dimension === "account" || Boolean(filters.account_id || filters.accountId));
  }

  function reportQuery(dimension, filters = {}) {
    const params = { period: state.reportPeriod, ...activeReportDateParams(), metric: "expense", dimension, ...filters };
    if (!reportUsesOriginalCurrency(dimension, filters, state.reportCurrency)) params.currency = state.reportCurrency;
    return queryString(params);
  }

  function syncReportPeriodButtons() {
    $$("[data-report-period]").forEach((button) => {
      const period = button.dataset.reportPeriod;
      const active = period === state.reportPeriod || (period === "more" && state.reportPeriod === "custom");
      button.classList.toggle("active", active);
    });
  }

  function closeReportPicker() {
    const overlay = $("[data-report-picker-overlay]");
    hideOverlay(overlay);
    postHermesNavigation();
  }

  function openReportCurrencyPicker(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const overlay = $("[data-report-picker-overlay]");
    if (!overlay) return;
    overlay.dataset.reportPickerMode = "currency";
    overlay.dataset.reportPickerVariant = "sheet";
    overlay.innerHTML = `
      <section class="finance-report-picker-sheet" role="dialog" aria-modal="true" aria-label="币种">
        <header>
          <button type="button" data-report-picker-close>取消</button>
          <strong>币种</strong>
          <span></span>
        </header>
        <div class="finance-report-currency-list">
          ${reportCurrencyRows().map((row) => `
            <button type="button" class="${row.code === state.reportCurrency ? "active" : ""}" data-report-picker-currency="${escapeHtml(row.code)}">
              <span>${escapeHtml(row.label || row.code)}</span>
              <small>${escapeHtml(row.code)}</small>
            </button>
          `).join("")}
        </div>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  async function applyReportCurrency(code) {
    const clean = String(code || "").toUpperCase();
    if (!clean) return;
    state.reportCurrency = clean;
    closeReportPicker();
    updateReportDateControls();
    await loadCurrencyOverview();
    if (state.activeView === "reports") await loadReport();
  }

  function reportPickerYears() {
    const anchor = safeDate();
    const years = new Set([anchor.getFullYear(), 2025, 2026]);
    for (let year = anchor.getFullYear() - 3; year <= anchor.getFullYear() + 1; year += 1) years.add(year);
    return [...years].sort((a, b) => b - a);
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function wrapValue(value, min, max) {
    const size = max - min + 1;
    return ((((value - min) % size) + size) % size) + min;
  }

  function normalizePickerDate(year, month, day) {
    const normalizedMonth = wrapValue(month, 1, 12);
    return new Date(year, normalizedMonth - 1, Math.min(day, daysInMonth(year, normalizedMonth)), 12, 0, 0);
  }

  function reportPickerRange() {
    const range = reportDateRange();
    return {
      start: range.start || dateFromInput("2005-12-31"),
      end: range.end || dateFromInput("2026-11-25"),
    };
  }

  function pickerDate(overlay, side) {
    const fallback = reportPickerRange()[side === "end" ? "end" : "start"];
    return dateFromInput(overlay.dataset[side === "end" ? "pickerEnd" : "pickerStart"], fallback);
  }

  function pickerWheelRows(type, selected) {
    const rows = [];
    for (let offset = -3; offset <= 3; offset += 1) {
      let value;
      let text;
      if (type === "year") {
        value = selected.getFullYear() + offset;
        text = `${value}年`;
      } else if (type === "month") {
        value = wrapValue(selected.getMonth() + 1 + offset, 1, 12);
        text = `${value}月`;
      } else {
        value = wrapValue(selected.getDate() + offset, 1, daysInMonth(selected.getFullYear(), selected.getMonth() + 1));
        text = `${value}日`;
      }
      const distance = Math.abs(offset);
      rows.push(`<button type="button" class="${offset === 0 ? "selected" : distance >= 3 ? "edge" : ""}" data-report-wheel-type="${type}" data-report-wheel-value="${value}">${text}</button>`);
    }
    return rows.join("");
  }

  function pickerColumnType(target) {
    const column = target.closest(".wacai-picker-column");
    if (!column || !column.parentElement) return "";
    const index = [...column.parentElement.children].indexOf(column);
    return ["year", "month", "day"][index] || "";
  }

  function setReportWheelValue(overlay, type, value) {
    const side = overlay.dataset.pickerSide === "end" ? "end" : "start";
    const current = pickerDate(overlay, side);
    let next = current;
    if (type === "year") next = normalizePickerDate(value, current.getMonth() + 1, current.getDate());
    if (type === "month") next = normalizePickerDate(current.getFullYear(), value, current.getDate());
    if (type === "day") next = normalizePickerDate(current.getFullYear(), current.getMonth() + 1, value);
    overlay.dataset[side === "end" ? "pickerEnd" : "pickerStart"] = dateInputText(next);
    renderReportDateWheel(overlay);
  }

  function shiftReportWheelValue(overlay, type, delta) {
    const side = overlay.dataset.pickerSide === "end" ? "end" : "start";
    const current = pickerDate(overlay, side);
    if (type === "year") setReportWheelValue(overlay, type, current.getFullYear() + delta);
    if (type === "month") setReportWheelValue(overlay, type, current.getMonth() + 1 + delta);
    if (type === "day") {
      const nextDay = wrapValue(current.getDate() + delta, 1, daysInMonth(current.getFullYear(), current.getMonth() + 1));
      setReportWheelValue(overlay, type, nextDay);
    }
  }

  function renderReportDateWheel(overlay) {
    const side = overlay.dataset.pickerSide === "end" ? "end" : "start";
    const start = pickerDate(overlay, "start");
    const end = pickerDate(overlay, "end");
    const selected = pickerDate(overlay, side);
    overlay.innerHTML = `
      <section class="wacai-date-picker-panel" role="dialog" aria-modal="true" aria-label="日期选择">
        <div class="wacai-picker-period-tabs" aria-label="统计周期">
          <button type="button" class="${state.reportPeriod === "all" ? "active" : ""}" data-report-picker-period="all">全部</button>
          <button type="button" class="${state.reportPeriod === "year" ? "active" : ""}" data-report-picker-period="year">年</button>
          <button type="button" class="${state.reportPeriod === "quarter" ? "active" : ""}" data-report-picker-period="quarter">季</button>
          <button type="button" class="${state.reportPeriod === "month" ? "active" : ""}" data-report-picker-period="month">月</button>
          <button type="button" class="${state.reportPeriod === "custom" ? "active" : ""}" data-report-picker-period="custom">更多</button>
        </div>
        <div class="wacai-picker-date-row">
          <button type="button" class="${side === "start" ? "active" : ""}" data-report-picker-side="start">${reportDateText(start)}</button>
          <span>~</span>
          <button type="button" class="${side === "end" ? "active" : ""}" data-report-picker-side="end">${reportDateText(end)}</button>
          <i class="wacai-filter-glyph" aria-hidden="true"></i>
        </div>
        <div class="wacai-picker-wheel" aria-label="日期滚轮">
          <div class="wacai-picker-column">${pickerWheelRows("year", selected)}</div>
          <div class="wacai-picker-column">${pickerWheelRows("month", selected)}</div>
          <div class="wacai-picker-column">${pickerWheelRows("day", selected)}</div>
        </div>
        <button type="button" class="wacai-picker-confirm" data-report-picker-apply>确定</button>
      </section>
    `;
  }

  function openReportPeriodPicker() {
    const overlay = $("[data-report-picker-overlay]");
    if (!overlay) return;
    const range = reportDateRange();
    overlay.dataset.reportPickerVariant = "sheet";
    overlay.innerHTML = `
      <section class="finance-report-picker-sheet" role="dialog" aria-modal="true" aria-label="统计周期">
        <header>
          <button type="button" data-report-picker-close>取消</button>
          <strong>统计周期</strong>
          <button type="button" data-report-picker-apply>完成</button>
        </header>
        <div class="finance-report-picker-presets">
          <button type="button" class="${state.reportPeriod === "all" ? "active" : ""}" data-report-picker-period="all">全部</button>
          <button type="button" class="${state.reportPeriod === "year" ? "active" : ""}" data-report-picker-period="year">按年</button>
          <button type="button" class="${state.reportPeriod === "quarter" ? "active" : ""}" data-report-picker-period="quarter">按季</button>
          <button type="button" class="${state.reportPeriod === "month" ? "active" : ""}" data-report-picker-period="month">按月</button>
          <button type="button" class="${state.reportPeriod === "custom" ? "active" : ""}" data-report-picker-period="custom">自定义</button>
        </div>
        <div class="finance-report-picker-fields">
          <label>年份<select data-report-picker-year>${reportPickerYears().map((year) => `<option value="${year}" ${safeDate().getFullYear() === year ? "selected" : ""}>${year}</option>`).join("")}</select></label>
          <label>月份<input type="month" data-report-picker-month value="${monthInputText(safeDate())}"></label>
          <label>开始<input type="date" data-report-picker-start value="${dateInputText(range.start || dateFromInput("2005-12-31"))}"></label>
          <label>结束<input type="date" data-report-picker-end value="${dateInputText(range.end || dateFromInput("2026-11-25"))}"></label>
        </div>
      </section>
    `;
    overlay.dataset.reportPickerMode = state.reportPeriod === "custom" ? "custom" : "period";
    showOverlay(overlay);
    postHermesNavigation();
  }

  function openReportDatePicker(which = "start") {
    const overlay = $("[data-report-picker-overlay]");
    if (!overlay) return;
    const range = reportDateRange();
    overlay.dataset.reportPickerMode = "date-wheel";
    overlay.dataset.reportPickerVariant = "date-wheel";
    overlay.dataset.pickerSide = which === "end" ? "end" : "start";
    overlay.dataset.pickerStart = dateInputText(range.start || dateFromInput("2005-12-31"));
    overlay.dataset.pickerEnd = dateInputText(range.end || dateFromInput("2026-11-25"));
    renderReportDateWheel(overlay);
    showOverlay(overlay);
    postHermesNavigation();
  }

  function applyReportDateWheel(overlay) {
    const side = overlay.dataset.pickerSide === "end" ? "end" : "start";
    const selectedPeriod = $("[data-report-picker-period].active", overlay)?.dataset.reportPickerPeriod;
    const selected = pickerDate(overlay, side);

    if (selectedPeriod === "year") {
      state.reportPeriod = "year";
      state.reportAnchorDate = new Date(selected.getFullYear(), 6, 1, 12, 0, 0).toISOString();
    } else if (selectedPeriod === "quarter") {
      state.reportPeriod = "quarter";
      state.reportAnchorDate = new Date(selected.getFullYear(), selected.getMonth(), 15, 12, 0, 0).toISOString();
    } else if (selectedPeriod === "month") {
      state.reportPeriod = "month";
      state.reportAnchorDate = new Date(selected.getFullYear(), selected.getMonth(), 15, 12, 0, 0).toISOString();
    } else if (selectedPeriod === "all") {
      state.reportPeriod = "all";
    } else {
      state.reportPeriod = "custom";
      const start = pickerDate(overlay, "start");
      const end = pickerDate(overlay, "end");
      state.reportCustomStartDate = dateInputText(start <= end ? start : end);
      state.reportCustomEndDate = dateInputText(start <= end ? end : start);
    }
  }

  function updateReportDateWheel(event) {
    const overlay = event.currentTarget;
    const sideButton = event.target.closest("[data-report-picker-side]");
    if (sideButton) {
      overlay.dataset.pickerSide = sideButton.dataset.reportPickerSide === "end" ? "end" : "start";
      renderReportDateWheel(overlay);
      return true;
    }
    const wheelButton = event.target.closest("[data-report-wheel-type]");
    if (!wheelButton) return false;
    const type = wheelButton.dataset.reportWheelType;
    const value = Number(wheelButton.dataset.reportWheelValue);
    setReportWheelValue(overlay, type, value);
    return true;
  }

  function handleReportWheelScroll(event) {
    const overlay = event.currentTarget;
    if (overlay.dataset.reportPickerMode !== "date-wheel") return;
    const type = pickerColumnType(event.target);
    if (!type) return;
    event.preventDefault();
    shiftReportWheelValue(overlay, type, event.deltaY > 0 ? 1 : -1);
  }

  function startReportWheelDrag(event) {
    const overlay = event.currentTarget;
    if (overlay.dataset.reportPickerMode !== "date-wheel") return;
    const point = event.touches?.[0] || event;
    const type = pickerColumnType(point.target || event.target);
    if (!type) return;
    overlay.dataset.pickerDragType = type;
    overlay.dataset.pickerDragStartY = String(point.clientY || 0);
  }

  function finishReportWheelDrag(event) {
    const overlay = event.currentTarget;
    if (overlay.dataset.reportPickerMode !== "date-wheel" || !overlay.dataset.pickerDragType) return;
    const point = event.changedTouches?.[0] || event;
    const startY = Number(overlay.dataset.pickerDragStartY || 0);
    const deltaY = Number(point.clientY || 0) - startY;
    const type = overlay.dataset.pickerDragType;
    overlay.dataset.pickerDragType = "";
    overlay.dataset.pickerDragStartY = "";
    if (Math.abs(deltaY) < 18) return;
    event.preventDefault();
    shiftReportWheelValue(overlay, type, deltaY > 0 ? -1 : 1);
  }

  function applyReportPicker() {
    const overlay = $("[data-report-picker-overlay]");
    if (!overlay) return;
    if (overlay.dataset.reportPickerMode === "date-wheel") {
      applyReportDateWheel(overlay);
      closeReportPicker();
      updateReportDateControls();
      loadReport().catch(showError);
      return;
    }
    const selectedPeriod = $("[data-report-picker-period].active", overlay)?.dataset.reportPickerPeriod;
    const mode = overlay.dataset.reportPickerMode || "";
    const year = Number($("[data-report-picker-year]", overlay)?.value || safeDate().getFullYear());
    const monthValue = $("[data-report-picker-month]", overlay)?.value || monthInputText(safeDate());
    const startValue = $("[data-report-picker-start]", overlay)?.value || "2005-12-31";
    const endValue = $("[data-report-picker-end]", overlay)?.value || "2026-11-25";
    const period = selectedPeriod || (mode === "period" ? state.reportPeriod : "");

    if (period === "all") {
      state.reportPeriod = "all";
    } else if (period === "year" || ((mode === "start" || mode === "end") && state.reportPeriod === "year")) {
      state.reportPeriod = "year";
      state.reportAnchorDate = new Date(year, 6, 1, 12, 0, 0).toISOString();
    } else if (period === "quarter" || ((mode === "start" || mode === "end") && state.reportPeriod === "quarter")) {
      const [y, m] = monthValue.split("-").map(Number);
      state.reportPeriod = "quarter";
      state.reportAnchorDate = new Date(y, (m || 1) - 1, 15, 12, 0, 0).toISOString();
    } else if (period === "month" || ((mode === "start" || mode === "end") && state.reportPeriod === "month")) {
      const [y, m] = monthValue.split("-").map(Number);
      state.reportPeriod = "month";
      state.reportAnchorDate = new Date(y, (m || 1) - 1, 15, 12, 0, 0).toISOString();
    } else {
      state.reportPeriod = "custom";
      const start = dateFromInput(startValue);
      const end = dateFromInput(endValue);
      state.reportCustomStartDate = dateInputText(start <= end ? start : end);
      state.reportCustomEndDate = dateInputText(start <= end ? end : start);
    }

    closeReportPicker();
    updateReportDateControls();
    loadReport().catch(showError);
  }

  function closeReportActions() {
    const overlay = $("[data-report-action-overlay]");
    hideOverlay(overlay);
    postHermesNavigation();
  }

  function openReportActions(index, rows = state.reportRows, dimension = state.reportDimension) {
    const item = rows[Number(index)];
    if (!item) return;
    state.selectedReportItem = item;
    state.selectedReportDimension = dimension;
    const overlay = $("[data-report-action-overlay]");
    if (!overlay) return;
    const breakdownAction = dimension === "category" ? `<button type="button" data-report-action="breakdown">小类报表</button>` : "";
    overlay.innerHTML = `
      <section class="finance-action-sheet">
        <div class="finance-action-title">${escapeHtml(item.label)}</div>
        <button type="button" data-report-action="trend">趋势统计</button>
        ${breakdownAction}
        <button type="button" data-report-action="detail">账单明细</button>
        <button type="button" data-report-action="cancel">取消</button>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function closeSwipeRows(except = null) {
    let closed = false;
    $$(".finance-swipe-row.actions-open").forEach((row) => {
      if (row === except) return;
      row.classList.remove("actions-open");
      const actions = $("[data-swipe-actions]", row);
      if (actions) actions.innerHTML = "";
      closed = true;
    });
    return closed;
  }

  function openSwipeRow(row) {
    if (!row) return;
    const actions = $("[data-swipe-actions]", row);
    if (actions) actions.innerHTML = swipeActionButtons(row.dataset.swipeTransactionId || "");
    closeSwipeRows(row);
    row.classList.add("actions-open");
  }

  function closeSwipeRow(row) {
    if (!row) return;
    row.classList.remove("actions-open");
    const actions = $("[data-swipe-actions]", row);
    if (actions) actions.innerHTML = "";
  }

  function cancelRowSwipe() {
    state.swipeCandidate = false;
    state.swipeRow = null;
    state.swipeHorizontalIntent = false;
    state.swipeAxis = "idle";
    state.swipeMaxLeft = 0;
  }

  function isIntentionalRowSwipe(dx, dy) {
    return state.swipeAxis === "horizontal" && state.swipeMaxLeft >= 104 && dx < -88 && dy < 34 && Math.abs(dx) > dy * 3;
  }

  function isIntentionalRowCloseSwipe(dx, dy) {
    return state.swipeAxis === "horizontal" && dx > 56 && dy < 34 && dx > dy * 2.4;
  }

  function entryModeFromTransaction(row) {
    if (row?.type === "income") return "income";
    if (row?.type === "transfer") return "transfer";
    return "expense";
  }

  function entryAmountFromTransaction(row) {
    return displayAbsoluteMoneyAmount(row, "0").replaceAll(",", "");
  }

  function setEntryAction(action = "create", row = null) {
    state.entryAction = action;
    state.editingTransaction = action === "edit" ? row : null;
    const title = $("[data-entry-title]");
    const save = $("[data-entry-save]");
    if (title) title.textContent = action === "edit" ? "编辑账目" : action === "copy" ? "复制账目" : currentLedger()?.name || "日常账本";
    if (save) save.textContent = action === "edit" ? "保存" : "保存";
    setEntryStatus(action === "edit" ? "正在编辑原账目" : action === "copy" ? "复制后保存为新账目" : "");
  }

  function setSelectValue(selector, value) {
    const select = $(selector);
    if (!select) return;
    const clean = String(value || "").trim();
    if (!clean) return;
    const option = [...select.options].find((item) => item.value === clean || item.textContent === clean);
    if (option) select.value = option.value;
  }

  function syncEntryMemberLabel() {
    const select = $("[data-member-select]");
    const label = $("[data-entry-member-label]");
    if (!label) return;
    const text = select?.selectedOptions?.[0]?.textContent || select?.value || "成员";
    label.textContent = text || "成员";
  }

  function syncEntryTagLabel() {
    const label = $("[data-entry-tag-label]");
    if (!label) return;
    const count = state.selectedEntryTags.length;
    label.textContent = count ? `标签 ${count}` : "标签";
  }

  function setEntryTags(tags = []) {
    const seen = new Set();
    state.selectedEntryTags = tags.map((tag) => String(tag || "").trim()).filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
    syncEntryTagLabel();
    scheduleEntryDraftSave();
  }

  function setEntryNote(value = "") {
    const input = $("[data-entry-note-value]");
    if (input) input.value = String(value || "");
    const button = $("[data-entry-note-label]");
    if (button) {
      const hasNote = Boolean(String(value || "").trim());
      button.textContent = "备注";
      button.classList.toggle("has-note", hasNote);
      button.setAttribute("aria-label", hasNote ? "备注，已填写" : "备注");
    }
    scheduleEntryDraftSave();
  }

  function closeEntryNoteOverlay() {
    const overlay = $("[data-entry-note-overlay]");
    if (overlay?.contains(document.activeElement)) document.activeElement.blur();
    if (overlay) delete overlay.dataset.entryNoteActive;
    hideOverlay(overlay);
    window.setTimeout(refreshInputFocusState, 0);
    postHermesNavigation();
  }

  function openEntryNoteOverlay() {
    const overlay = $("[data-entry-note-overlay]");
    if (!overlay) return;
    const value = $("[data-entry-note-value]")?.value || "";
    overlay.innerHTML = `
      <section class="finance-action-sheet finance-entry-note-sheet" role="dialog" aria-modal="true" aria-label="备注">
        <header class="finance-entry-note-header">
          <button type="button" data-entry-note-close>取消</button>
          <strong>备注</strong>
          <button type="button" data-entry-note-apply>完成</button>
        </header>
        <textarea data-entry-note-editor rows="4" autocomplete="off" enterkeyhint="done" placeholder="输入备注...">${escapeHtml(value)}</textarea>
      </section>
    `;
    overlay.dataset.entryNoteActive = "true";
    showOverlay(overlay);
    syncEntryNoteSheetMetrics();
    postHermesNavigation();
    window.setTimeout(() => {
      const editor = $("[data-entry-note-editor]", overlay);
      if (!editor || overlay.classList.contains("hidden")) return;
      editor.focus({ preventScroll: true });
      const length = editor.value.length;
      editor.setSelectionRange(length, length);
      syncEntryNoteSheetMetrics();
      scheduleEntryNoteViewportPinning();
    }, 60);
  }

  function applyEntryNoteOverlay() {
    const overlay = $("[data-entry-note-overlay]");
    const editor = $("[data-entry-note-editor]", overlay);
    setEntryNote(editor?.value || "");
    closeEntryNoteOverlay();
  }

  function closeEntryChoicePicker() {
    const overlay = $("[data-entry-choice-overlay]");
    if (overlay) delete overlay.dataset.entryChoiceMode;
    hideOverlay(overlay);
    postHermesNavigation();
  }

  function entryChoiceRows(kind) {
    if (kind === "member") {
      const select = $("[data-member-select]");
      return [...(select?.options || [])].map((option) => ({
        key: option.value,
        label: option.textContent || option.value,
        active: option.selected,
      }));
    }
    return state.entryTags.map((tag) => ({
      key: tag.name || tag.id,
      label: tag.name || tag.id,
      active: state.selectedEntryTags.includes(tag.name || tag.id),
    }));
  }

  function openEntryChoicePicker(kind = "member") {
    const overlay = $("[data-entry-choice-overlay]");
    if (!overlay) return;
    const rows = entryChoiceRows(kind);
    overlay.dataset.entryChoiceMode = kind;
    overlay.innerHTML = `
      <section class="finance-action-sheet finance-entry-choice-sheet">
        <div class="finance-entry-choice-header">
          <button type="button" data-entry-choice-close>取消</button>
          <strong>${kind === "tag" ? "标签" : "成员"}</strong>
          <button type="button" data-entry-choice-apply>${kind === "tag" ? "完成" : "确定"}</button>
        </div>
        <div class="finance-entry-choice-list">
          ${rows.map((row) => `
            <button type="button" class="finance-entry-choice-row${row.active ? " active" : ""}" data-entry-choice-value="${escapeHtml(row.key)}">
              <span>${escapeHtml(row.label)}</span>
              <b></b>
            </button>
          `).join("") || `<div class="finance-empty">暂无可选${kind === "tag" ? "标签" : "成员"}</div>`}
        </div>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function applyEntryChoiceValue(value, button = null) {
    const overlay = $("[data-entry-choice-overlay]");
    const kind = overlay?.dataset.entryChoiceMode || "";
    if (kind === "member") {
      const select = $("[data-member-select]");
      if (select) select.value = value;
      syncEntryMemberLabel();
      closeEntryChoicePicker();
      return;
    }
    if (kind === "tag") {
      const clean = String(value || "").trim();
      if (!clean) return;
      setEntryTags(state.selectedEntryTags.includes(clean)
        ? state.selectedEntryTags.filter((tag) => tag !== clean)
        : [...state.selectedEntryTags, clean]);
      button?.classList.toggle("active", state.selectedEntryTags.includes(clean));
    }
  }

  function openNewEntry(type = "expense", options = {}) {
    const form = $("[data-entry-form]");
    if (form) form.reset();
    resetPendingAttachments();
    setEntryAction("create", null);
    state.entryDraftSuppressSave = true;
    try {
      state.copyAmountPristine = false;
      setStayOnEntryAfterSubmit(false);
      setEntryType(type);
      setEntryAmount("");
      setEntryNote("");
      setEntryTags([]);
      syncEntryMemberLabel();
    } finally {
      state.entryDraftSuppressSave = false;
    }
    if (options.restoreDraft !== false) restoreEntryDraft();
    setView("entry");
  }

  function openEntryFromTransaction(row, action) {
    if (!row) return;
    const form = $("[data-entry-form]");
    if (form) form.reset();
    resetPendingAttachments();
    setEntryType(entryModeFromTransaction(row));
    setEntryAction(action, row);
    state.copyAmountPristine = action === "copy";
    closeSwipeRows();
    closeReportActions();
    setView("entry");
    setEntryAmount(entryAmountFromTransaction(row));
    setEntryCategory(row.categoryName || "");
    setSelectValue("[data-currency-select]", row.currency || "CNY");
    setSelectValue("[data-account-select]", row.accountName || "");
    setSelectValue("[data-target-account-select]", row.targetAccountName || "");
    setSelectValue("[data-member-select]", row.memberName || "");
    syncEntryMemberLabel();
    setEntryTags(action === "copy" ? (row.tags || []) : (row.tags || []));
    setEntryNote(row.note || "");
    if (form?.elements.merchant) form.elements.merchant.value = row.merchantName || "";
    if (form?.elements.occurred_at) {
      if (action === "copy") {
        const now = new Date();
        setEntryDateValue(dateInputText(now), `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
      } else {
        form.elements.occurred_at.value = row.occurredAt || "";
      }
    }
  }

  function openTransactionDeleteConfirm(row) {
    if (!row) return;
    state.selectedTransaction = row;
    closeSwipeRows();
    const overlay = $("[data-report-action-overlay]");
    if (!overlay) return;
    const title = row.categoryName || typeLabel(row.type);
    overlay.innerHTML = `
      <section class="finance-action-sheet finance-delete-sheet">
        <div class="finance-action-title">${escapeHtml(title)}</div>
        <p>删除后账目会作废并保留审计记录，账户余额会同步回滚。</p>
        <button type="button" class="danger" data-transaction-delete-confirm>删除</button>
        <button type="button" data-transaction-delete-cancel>取消</button>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  async function deleteSelectedTransaction() {
    const row = state.selectedTransaction;
    if (!row?.id) return;
    await api(`/api/finance/transactions/${encodeURIComponent(row.id)}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: "local-ui-swipe-delete" }),
    });
    closeReportActions();
    state.selectedTransaction = null;
    await loadOverview();
    if (state.activeView === "transaction-detail" || state.activeView === "report-detail") setView(ROOT_VIEW);
  }

  function handleTransactionAction(action, id) {
    const row = findTransaction(id);
    if (!row) return;
    if (action === "edit" || action === "copy") {
      openEntryFromTransaction(row, action);
      return;
    }
    if (action === "delete") openTransactionDeleteConfirm(row);
  }

  function groupSeriesByYear(series = []) {
    const groups = new Map();
    for (const row of series) {
      const key = String(row.key || row.label || "").slice(0, 4) || "未分组";
      const existing = groups.get(key) || { key, label: `${key}年`, amountMinor: 0, count: 0 };
      existing.amountMinor += Math.abs(Number(row.amountMinor || 0));
      existing.count += Number(row.count || 0);
      groups.set(key, existing);
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  function renderTrendChart(rows = []) {
    const target = $("[data-report-trend-chart]");
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = `<div class="finance-empty">暂无趋势数据</div>`;
      return;
    }
    const width = 320;
    const height = 168;
    const pad = 18;
    const max = Math.max(...rows.map((row) => Math.abs(Number(row.amountMinor || 0))), 1);
    const points = rows.map((row, index) => {
      const x = rows.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (rows.length - 1);
      const y = height - pad - (Math.abs(Number(row.amountMinor || 0)) / max) * (height - pad * 2);
      return { x, y };
    });
    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="trend">
        <polygon points="${area}" class="finance-trend-area"></polygon>
        <polyline points="${line}" class="finance-trend-line"></polyline>
        ${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5"></circle>`).join("")}
      </svg>
    `;
  }

  function renderCompactReportList(target, rows = []) {
    if (!target) return;
    const total = rows.reduce((sum, item) => sum + Math.abs(Number(item.amountMinor || 0)), 0);
    const max = Math.max(...rows.map((item) => Math.abs(Number(item.amountMinor || 0))), 1);
    target.innerHTML = rows.map((item, index) => {
      const width = Math.max(2, (Math.abs(Number(item.amountMinor || 0)) / max) * 100);
      const pct = total ? (Math.abs(Number(item.amountMinor || 0)) / total * 100).toFixed(2) : "0.00";
      return `
        <div class="finance-report-row">
          <span class="finance-report-rank">${index + 1}</span>
          <div class="finance-report-main">
            <div class="finance-report-line">
              <strong>${escapeHtml(item.label)}</strong>
              <b>${escapeHtml(displayMoneyAmount(item, "0"))}</b>
            </div>
            <div class="finance-report-bar"><span style="width:${width.toFixed(2)}%"></span></div>
            <div class="finance-report-meta"><span>${escapeHtml(item.count || 0)}笔</span><span>${pct}%</span></div>
          </div>
        </div>
      `;
    }).join("") || `<div class="finance-empty">暂无统计</div>`;
  }

  async function openReportTrend() {
    closeReportActions();
    const item = state.selectedReportItem;
    if (!item) return;
    const payload = await api(`/api/finance/report?${reportQuery("trend", reportFilterForItem(item))}`);
    const rows = groupSeriesByYear(payload.report.series || []);
    const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.amountMinor || 0)), 0);
    const title = $("[data-report-trend-title]");
    const status = $("[data-report-trend-status]");
    const summary = $("[data-report-trend-summary]");
    if (title) title.textContent = `${item.label}趋势`;
    if (status) status.textContent = REPORT_PERIODS[state.reportPeriod] || "全部";
    if (summary) summary.textContent = `${payload.report.periodStart || "全部"} ~ ${payload.report.periodEnd || "现在"}，${item.label}共计${rows.reduce((sum, row) => sum + Number(row.count || 0), 0)}笔，总支出${formatMinorMoney(total)}`;
    renderTrendChart(rows);
    renderCompactReportList($("[data-report-trend-list]"), rows.slice().sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor)));
    setView("report-trend");
  }

  async function openReportBreakdown() {
    closeReportActions();
    const item = state.selectedReportItem;
    if (!item) return;
    const payload = await api(`/api/finance/report?${reportQuery("subcategory", reportFilterForItem(item, "category"))}`);
    const rows = payload.report.breakdown || [];
    state.reportBreakdownRows = rows;
    const title = $("[data-report-breakdown-title]");
    const status = $("[data-report-breakdown-status]");
    const totalNode = $("[data-report-breakdown-total]");
    const donut = $("[data-report-breakdown-donut]");
    const total = rows.reduce((sum, row) => sum + Math.abs(Number(row.amountMinor || 0)), 0);
    if (title) title.textContent = `${item.label}小类报表`;
    if (status) status.textContent = REPORT_PERIODS[state.reportPeriod] || "全部";
    if (totalNode) totalNode.textContent = formatMinorMoney(total);
    if (donut) {
      let cursor = 0;
      const segments = rows.map((row, index) => {
        const pct = total ? (Math.abs(Number(row.amountMinor || 0)) / total) * 100 : 0;
        const start = cursor;
        cursor += pct;
        return `${REPORT_COLORS[index % REPORT_COLORS.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      });
      donut.style.setProperty("--donut", segments.length ? segments.join(", ") : "rgba(255,255,255,0.08) 0 100%");
    }
    renderReportRows($("[data-report-breakdown-list]"), rows, {
      interactive: true,
      indexAttribute: "data-report-breakdown-index",
      amountFallback: true,
    });
    setView("report-breakdown");
  }

  async function openReportDetail() {
    closeReportActions();
    const item = state.selectedReportItem;
    if (!item) return;
    const filters = reportFilterForItem(item);
    const detailQuery = {
      type: "expense",
      limit: 200,
      ...activeTransactionDateParams(),
      ...filters,
    };
    if (!reportUsesOriginalCurrency(state.selectedReportDimension || state.reportDimension, filters, state.reportCurrency)) {
      detailQuery.currency = state.reportCurrency;
    }
    const payload = await api(`/api/finance/transactions?${queryString(detailQuery)}`);
    state.reportDetailTransactions = payload.transactions || [];
    const title = $("[data-report-detail-title]");
    const status = $("[data-report-detail-status]");
    const target = $("[data-report-detail-list]");
    if (title) title.textContent = item.label;
    if (status) status.textContent = `${state.reportDetailTransactions.length}笔`;
    if (target) {
      target.innerHTML = state.reportDetailTransactions.map(transactionRow).join("") || `<div class="finance-empty">暂无明细</div>`;
    }
    setView("report-detail");
  }

  function optionList(rows, labelKey = "name") {
    return rows.map((row) => `<option value="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</option>`).join("");
  }

  function accountOptions(rows = []) {
    return sortedAccounts(rows).map((row) => `<option value="${escapeHtml(row.name)}" data-currency="${escapeHtml(row.currency || "CNY")}">${escapeHtml(accountOptionLabel(row))}</option>`).join("");
  }

  function currencyOptions(rows) {
    return rows.map((row) => `<option value="${escapeHtml(row.code)}">${escapeHtml(currencyLabel(row.code) || row.display_name || row.code)}</option>`).join("");
  }

  function syncEntryCurrencyFromAccount() {
    const account = $("[data-account-select]");
    const currency = $("[data-currency-select]");
    const selected = account?.selectedOptions?.[0];
    if (currency && selected?.dataset.currency) currency.value = selected.dataset.currency;
  }

  function categoryUsageCount(row) {
    const usage = state.overview?.categoryUsage || [];
    const found = usage.find((item) => {
      const sameType = !item.type || item.type === row.type;
      return sameType && (item.category_id === row.id || item.categoryName === row.name || item.category_name === row.name);
    });
    return Number(found?.transaction_count || found?.transactionCount || 0);
  }

  function sortedEntryCategories(categories = []) {
    return categories.slice().sort((a, b) => {
      const usageDiff = categoryUsageCount(b) - categoryUsageCount(a);
      if (usageDiff) return usageDiff;
      const ai = QUICK_CATEGORY_ORDER.indexOf(a.name);
      const bi = QUICK_CATEGORY_ORDER.indexOf(b.name);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
    });
  }

  function setEntryCategory(value) {
    const select = $("[data-category-select]");
    if (!select) return;
    const clean = String(value || select.value || "").trim();
    if (clean && [...select.options].some((item) => item.value === clean)) select.value = clean;
    const selected = clean || select.value || select.options[0]?.value || "";
    state.selectedEntryCategory = selected;
    const label = $("[data-entry-selected-category]");
    const icon = $("[data-entry-category-icon]");
    if (label) label.textContent = selected || "类别";
    if (icon) {
      const key = categoryIconKey(selected);
      icon.className = `finance-category-symbol svg-icon icon-${key}`;
      icon.innerHTML = categoryIconSvg(key);
    }
    $$("[data-category-quick]").forEach((button) => {
      button.classList.toggle("active", button.dataset.categoryQuick === selected);
    });
    scheduleEntryDraftSave();
  }

  function normalizeEntryAmount(value) {
    const raw = String(value || "")
      .replaceAll("?", "*")
      .replaceAll("?", "/")
      .replaceAll("?", "-")
      .replace(/[^\d+\-*/.]/g, "");
    let result = "";
    let hasDecimal = false;
    let fractionCount = 0;
    for (const char of raw) {
      if (/\d/.test(char)) {
        if (hasDecimal && fractionCount >= 2) continue;
        result += char;
        if (hasDecimal) fractionCount += 1;
        continue;
      }
      if (char === ".") {
        if (hasDecimal) continue;
        if (!result || /[+\-*/]$/.test(result)) result += "0";
        result += ".";
        hasDecimal = true;
        fractionCount = 0;
        continue;
      }
      result += char;
      hasDecimal = false;
      fractionCount = 0;
    }
    return result;
  }

  function setEntryAmount(value) {
    const input = $("[data-entry-amount]");
    if (!input) return;
    input.value = normalizeEntryAmount(value);
    scheduleEntryDraftSave();
  }

  function consumeCopyAmountIfNeeded(token = "") {
    const current = normalizeEntryAmount($("[data-entry-amount]")?.value || "");
    if (!state.copyAmountPristine) return current;
    if (!/^[\d.]$/.test(String(token || "")) && token !== "00") {
      state.copyAmountPristine = false;
      return current;
    }
    state.copyAmountPristine = false;
    return "";
  }

  function preventAmountNativeKeyboard(event) {
    const input = event?.currentTarget || $("[data-entry-amount]");
    if (!input) return;
    if (event?.type === "pointerdown" || event?.type === "touchstart") event.preventDefault();
    input.blur();
    document.documentElement.classList.remove("finance-input-focus");
  }

  function appendEntryAmount(token) {
    const input = $("[data-entry-amount]");
    if (!input) return;
    const value = consumeCopyAmountIfNeeded(token);
    if (token === ".") {
      const segment = value.split(/[+\-*/]/).at(-1) || "";
      if (segment.includes(".")) return;
      setEntryAmount(value + (value && !/[+\-*/]$/.test(value) ? "." : "0."));
      return;
    }
    if (/^[+*/]$/.test(token) && (!value || /[+\-*/]$/.test(value))) return;
    if (token === "-" && /[+\-*/]$/.test(value)) return;
    setEntryAmount(value + token);
  }

  function formatComputedEntryAmount(value) {
    const rounded = Math.round(Math.max(0, value) * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function pushEntryAmountToken(tokens, numberText) {
    if (!numberText || numberText === "-") return false;
    if (!/^-?\d+(?:\.\d{0,2})?$/.test(numberText)) return false;
    const value = Number(numberText);
    if (!Number.isFinite(value)) return false;
    tokens.push(value);
    return true;
  }

  function tokenizeEntryAmountExpression(value) {
    const normalized = normalizeEntryAmount(value);
    const tokens = [];
    let numberText = "";
    let expectingNumber = true;
    for (const char of normalized) {
      if (/\d|\./.test(char)) {
        numberText += char;
        expectingNumber = false;
        continue;
      }
      if (!/[+\-*/]/.test(char)) return null;
      if (char === "-" && expectingNumber && !numberText) {
        numberText = "-";
        continue;
      }
      if (expectingNumber || !pushEntryAmountToken(tokens, numberText)) return null;
      tokens.push(char);
      numberText = "";
      expectingNumber = true;
    }
    if (expectingNumber || !pushEntryAmountToken(tokens, numberText)) return null;
    return tokens;
  }

  function applyEntryAmountOperator(left, operator, right) {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (operator === "/") return right === 0 ? NaN : left / right;
    return NaN;
  }

  function evaluateEntryAmountExpression(value) {
    const tokens = tokenizeEntryAmountExpression(value);
    if (!tokens || tokens.length < 3) return null;
    const terms = [];
    let current = tokens[0];
    for (let index = 1; index < tokens.length; index += 2) {
      const operator = tokens[index];
      const next = tokens[index + 1];
      if (operator === "*" || operator === "/") {
        current = applyEntryAmountOperator(current, operator, next);
        if (!Number.isFinite(current)) return null;
      } else {
        terms.push(current, operator);
        current = next;
      }
    }
    terms.push(current);
    let result = terms[0];
    for (let index = 1; index < terms.length; index += 2) {
      result = applyEntryAmountOperator(result, terms[index], terms[index + 1]);
      if (!Number.isFinite(result)) return null;
    }
    return result;
  }

  function computeEntryAmount() {
    const input = $("[data-entry-amount]");
    if (!input) return;
    const value = normalizeEntryAmount(input.value);
    if (!/[+\-*/]/.test(value.slice(1))) return;
    const result = evaluateEntryAmountExpression(value);
    if (Number.isFinite(result)) {
      input.value = formatComputedEntryAmount(result);
      scheduleEntryDraftSave();
    } else {
      input.focus();
    }
  }

  function handleKeypad(event) {
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const key = target?.closest?.("[data-keypad-value],[data-keypad-action]");
    if (!key) return;
    const handledKey = key.dataset.keypadAction || key.dataset.keypadValue || "";
    const now = Date.now();
    const eventType = event.type || "";
    const duplicateWindowMs = eventType === "click" ? 500 : 80;
    if (state.lastKeypadHandledKey === handledKey && now - state.lastKeypadHandledAt < duplicateWindowMs) return;
    state.lastKeypadHandledKey = handledKey;
    state.lastKeypadHandledAt = now;
    state.lastKeypadHandledType = eventType;
    event.preventDefault?.();
    const action = key.dataset.keypadAction;
    if (action === "backspace") {
      const input = $("[data-entry-amount]");
      if (input) {
        if (state.copyAmountPristine) {
          state.copyAmountPristine = false;
          input.value = "";
        } else {
          input.value = input.value.slice(0, -1);
        }
      }
      scheduleEntryDraftSave();
      return;
    }
    if (action === "equals") {
      computeEntryAmount();
      scheduleEntryDraftSave();
      return;
    }
    if (action === "again") {
      if (state.entryAction !== "create") return;
      setStayOnEntryAfterSubmit(!state.stayOnEntryAfterSubmit);
      return;
    }
    if (action === "multiply-divide") {
      state.copyAmountPristine = false;
      appendEntryAmount(state.divideNext ? "/" : "*");
      state.divideNext = !state.divideNext;
      return;
    }
    appendEntryAmount(key.dataset.keypadValue || "");
  }

  function renderCategoryShortcuts(categories = []) {
    const target = $("[data-category-quick-list]");
    if (!target) return;
    const sortedCategories = sortedEntryCategories(categories);
    const quickCategories = sortedCategories.slice(0, 16);
    target.innerHTML = quickCategories.map((row) => `
      <button type="button" class="finance-category-chip" data-category-quick="${escapeHtml(row.name)}">
        ${iconSpan(row.name)}
        <strong>${escapeHtml(row.name)}</strong>
      </button>
    `).join("") + `
      <button type="button" class="finance-category-chip finance-category-more-chip" data-open-category-picker>
        <span class="finance-category-symbol svg-icon icon-category-generic" aria-hidden="true">${categoryIconSvg("category-generic")}</span>
        <strong>更多</strong>
      </button>
    `;
    const names = quickCategories.map((item) => item.name);
    const allNames = sortedCategories.map((item) => item.name);
    const preferred = preferredEntryCategory(allNames);
    const current = allNames.includes(state.selectedEntryCategory) ? state.selectedEntryCategory : "";
    setEntryCategory(current || preferred || quickCategories[0]?.name || "");
  }

  function entryCategoriesForPicker() {
    const categories = Array.isArray(state.entryCategories) ? state.entryCategories : [];
    return categories.filter((row) => row && row.name);
  }

  function closeCategoryPicker() {
    hideOverlay($("[data-category-picker-overlay]"));
    postHermesNavigation();
  }

  function categoryPickerTree(categories = []) {
    const byId = new Map(categories.map((row) => [row.id, row]));
    const childrenByParent = new Map();
    for (const row of categories) {
      if (!row.parent_id || !byId.has(row.parent_id)) continue;
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, []);
      childrenByParent.get(row.parent_id).push(row);
    }
    const usedChildIds = new Set([...childrenByParent.values()].flat().map((row) => row.id));
    return categories
      .filter((row) => !usedChildIds.has(row.id))
      .map((row) => ({ parent: row, children: childrenByParent.get(row.id) || [] }));
  }

  function categoryPickerButton(row) {
    const selected = row.name === state.selectedEntryCategory ? " active" : "";
    return `
      <button type="button" class="finance-category-picker-item${selected}" data-category-picker-select="${escapeHtml(row.name)}">
        ${iconSpan(row.name)}
        <strong>${escapeHtml(row.name)}</strong>
      </button>
    `;
  }

  function selectedCategoryParentId(categories = []) {
    const selected = categories.find((row) => row.name === state.selectedEntryCategory);
    return selected?.parent_id || selected?.id || "";
  }

  function focusCategoryPickerParent(parentId) {
    if (!parentId) return;
    const overlay = $("[data-category-picker-overlay]");
    const body = $(".finance-category-picker-body", overlay);
    const target = $$("[data-category-picker-parent]", overlay)
      .find((node) => node.dataset.categoryPickerParent === parentId);
    if (!body || !target) return;
    window.requestAnimationFrame(() => {
      const bodyTop = body.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      body.scrollTop += targetTop - bodyTop - 10;
    });
  }

  function toggleCategoryPickerParent(parentId) {
    if (!parentId) return;
    const expanded = new Set(state.categoryPickerExpandedParents || []);
    if (expanded.has(parentId)) expanded.delete(parentId);
    else expanded.add(parentId);
    state.categoryPickerExpandedParents = [...expanded];
    renderCategoryPicker({ focusParentId: parentId });
  }

  function categoryMatchesQuery(row, query) {
    if (!query) return true;
    return String(row.name || "").toLocaleLowerCase("zh-CN").includes(query);
  }

  function renderCategoryPicker(options = {}) {
    const overlay = $("[data-category-picker-overlay]");
    if (!overlay || overlay.classList.contains("hidden")) return;
    const categories = entryCategoriesForPicker();
    const query = String(state.categoryPickerQuery || "").trim().toLocaleLowerCase("zh-CN");
    const tree = categoryPickerTree(categories);
    const expanded = new Set(state.categoryPickerExpandedParents || []);
    const matchedRows = query ? categories.filter((row) => categoryMatchesQuery(row, query)) : [];
    const title = state.entryMode === "income" ? "选择收入类目" : state.entryMode === "transfer" ? "选择转账类目" : "选择支出类目";
    overlay.innerHTML = `
      <section class="finance-category-picker-sheet">
        <header>
          <button type="button" data-category-picker-close>取消</button>
          <strong>${escapeHtml(title)}</strong>
          <span>${Number(categories.length).toLocaleString("zh-CN")}项</span>
        </header>
        <div class="finance-category-picker-search">
          <input type="search" placeholder="搜索类目" value="${escapeHtml(state.categoryPickerQuery || "")}" data-category-picker-search>
        </div>
        <div class="finance-category-picker-body">
          ${query ? `
            <section class="finance-category-picker-section">
              <h3>搜索结果</h3>
              <div class="finance-category-picker-grid">
                ${matchedRows.map(categoryPickerButton).join("") || `<div class="finance-empty">暂无匹配类目</div>`}
              </div>
            </section>
          ` : tree.map((section) => {
            const open = expanded.has(section.parent.id);
            const hasChildren = section.children.length > 0;
            const active = section.parent.name === state.selectedEntryCategory || section.children.some((row) => row.name === state.selectedEntryCategory);
            return `
              <section class="finance-category-picker-section">
                <button type="button" class="finance-category-picker-parent${open ? " expanded" : ""}${active ? " active" : ""}" ${hasChildren ? `data-category-picker-parent="${escapeHtml(section.parent.id)}"` : `data-category-picker-select="${escapeHtml(section.parent.name)}"`}>
                  ${iconSpan(section.parent.name)}
                  <strong>${escapeHtml(section.parent.name)}</strong>
                  <span>${hasChildren ? `${section.children.length}项` : "选择"}</span>
                </button>
                ${hasChildren && open ? `
                  <div class="finance-category-picker-grid">
                    ${section.children.map(categoryPickerButton).join("")}
                  </div>
                ` : ""}
              </section>
            `;
          }).join("") || `<div class="finance-empty">暂无类目</div>`}
        </div>
      </section>
    `;
    focusCategoryPickerParent(options.focusParentId);
  }

  function openCategoryPicker() {
    const overlay = $("[data-category-picker-overlay]");
    if (!overlay) return;
    const pickerCategories = entryCategoriesForPicker();
    const parentId = selectedCategoryParentId(pickerCategories);
    state.categoryPickerQuery = "";
    state.categoryPickerExpandedParents = parentId ? [parentId] : [];
    overlay.innerHTML = "";
    showOverlay(overlay);
    renderCategoryPicker({ focusParentId: parentId });
    postHermesNavigation();
    return;
    const categories = entryCategoriesForPicker();
    const sections = categoryPickerSectionRows(categories);
    const title = state.entryMode === "income" ? "选择收入类目" : state.entryMode === "transfer" ? "选择转账类目" : "选择支出类目";
    overlay.innerHTML = `
      <section class="finance-category-picker-sheet">
        <header>
          <button type="button" data-category-picker-close>取消</button>
          <strong>${escapeHtml(title)}</strong>
          <span>${Number(categories.length).toLocaleString("zh-CN")}项</span>
        </header>
        <div class="finance-category-picker-body">
          ${sections.map((section) => `
            <section class="finance-category-picker-section">
              ${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ""}
              <div class="finance-category-picker-grid">
                ${section.rows.map(categoryPickerButton).join("")}
              </div>
            </section>
          `).join("") || `<div class="finance-empty">暂无类目</div>`}
        </div>
      </section>
    `;
    showOverlay(overlay);
    postHermesNavigation();
  }

  function preferredMealCategories(now = new Date()) {
    const hour = now.getHours();
    if (hour >= 5 && hour < 10) return ["早餐", "午餐", "晚餐", "夜宵"];
    if (hour >= 10 && hour < 15) return ["午餐", "早餐", "晚餐", "夜宵"];
    if (hour >= 15 && hour < 21) return ["晚餐", "午餐", "夜宵", "早餐"];
    return ["夜宵", "晚餐", "早餐", "午餐"];
  }

  function preferredEntryCategory(names = [], now = new Date()) {
    if (state.entryType !== "expense") return names[0] || "";
    const candidates = preferredMealCategories(now);
    return candidates.find((name) => names.includes(name)) || names[0] || "";
  }

  function renderEntryOptions(data) {
    const accounts = data.accounts || [];
    const currencies = data.currencies || [];
    const members = data.members || [];
    state.entryTags = data.tags || [];
    const categories = (data.categories || []).filter((row) => row.type === state.entryType || (state.entryType === "transfer" && row.type === "expense"));
    state.entryCategories = sortedEntryCategories(categories);
    $("[data-account-select]").innerHTML = accountOptions(accounts);
    $("[data-target-account-select]").innerHTML = accountOptions(accounts);
    $("[data-currency-select]").innerHTML = currencyOptions(currencies);
    $("[data-category-select]").innerHTML = optionList(state.entryCategories);
    $("[data-member-select]").innerHTML = optionList(members, "display_name");
    $("[data-target-account-field]").hidden = state.entryType !== "transfer";
    syncEntryCurrencyFromAccount();
    syncEntryMemberLabel();
    syncEntryTagLabel();
    renderCategoryShortcuts(categories);
    scheduleUiProbe("entry-options");
  }

  function renderOverview(data) {
    state.overview = data;
    state.ledgers = data.ledgers || state.ledgers || [];
    if (data.currentLedger) setActiveLedger(data.currentLedger);
    $("[data-ledger-status]").textContent = "";
    renderOverviewTotals(data);
    resetTransactionPagination(data.transactions || []);
    renderTransactions(state.transactionRows);
    scheduleTransactionPaginationCheck();
    renderAccounts(data.accounts || []);
    state.recurringRules = data.recurringRules || state.recurringRules || [];
    renderRecurringRules(state.recurringRules);
    renderOwnerAssets(data.ownerAssetSummary || null);
    renderOwnerStocks(data.ownerStockSummary || null);
    renderEntryOptions(data);
    applyVisualProbeIfRequested();
  }

  function renderOverviewTotals(data = state.overview || {}) {
    const homeSummary = data.yearSummary || data.summary;
    if (!homeSummary?.totals) return;
    const summaryLabel = $("[data-summary-label]");
    if (summaryLabel) summaryLabel.textContent = homeSummary === data.yearSummary ? "本年支出" : "本月支出";
    $("[data-summary-income]").textContent = formatMoney(homeSummary.totals.income);
    $("[data-summary-expense]").textContent = formatMoney(homeSummary.totals.expense);
    $("[data-summary-net]").textContent = formatMoney(homeSummary.totals.net);
    renderReport(data.report?.breakdown || []);
  }

  async function loadCurrencyOverview() {
    const payload = await api(`/api/finance/overview?${queryString({ limit: TRANSACTION_PAGE_SIZE, currency: state.reportCurrency, summary_only: 1 })}`);
    renderOverview(payload);
    updateReportDateControls(payload.report);
  }

  async function loadOverview() {
    try {
      const payload = await api(`/api/finance/overview?${queryString({ limit: TRANSACTION_PAGE_SIZE, currency: state.reportCurrency })}`);
      renderOverview(payload);
      await applyStartupNavigation();
    } catch (err) {
      if (state.activeLedgerId && /finance_ledger_(not_found|access_denied)/.test(err.message || "")) {
        localStorage.removeItem("financeActiveLedgerId");
        state.activeLedgerId = "";
        const payload = await api(`/api/finance/overview?${queryString({ limit: TRANSACTION_PAGE_SIZE })}`);
        renderOverview(payload);
        await applyStartupNavigation();
        return;
      }
      throw err;
    }
  }

  async function applyStartupNavigation() {
    if (restoreEntryDraftOnStartup()) {
      state.pluginRouteApplied = true;
      return;
    }
    await applyInitialPluginRoute();
  }

  async function applyInitialPluginRoute() {
    if (!INITIAL_PLUGIN_ROUTE || state.pluginRouteApplied) return;
    state.pluginRouteApplied = true;
    if (INITIAL_PLUGIN_ROUTE === "record" || INITIAL_PLUGIN_ROUTE === "voice_record") {
      openNewEntry("expense");
      return;
    }
    if (INITIAL_PLUGIN_ROUTE === "transactions") {
      setView("transactions");
      return;
    }
    if (INITIAL_PLUGIN_ROUTE === "assets") {
      setView("assets");
      return;
    }
    if (INITIAL_PLUGIN_ROUTE === "stocks") {
      setView("stocks");
      return;
    }
    if (INITIAL_PLUGIN_ROUTE === "budget") {
      setView("plan");
      return;
    }
    if (INITIAL_PLUGIN_ROUTE === "month_stats" || INITIAL_PLUGIN_ROUTE === "year_stats") {
      state.reportPeriod = INITIAL_PLUGIN_ROUTE === "year_stats" ? "year" : "month";
      updateReportDateControls();
      await loadReport();
      setView("reports");
    }
  }

  async function loadReport() {
    const payload = await api(`/api/finance/report?${reportQuery(state.reportDimension)}`);
    state.overview = { ...(state.overview || {}), report: payload.report };
    renderReport(payload.report.breakdown || []);
  }

  async function checkClientVersion() {
    const payload = await api("/api/finance/client-version");
    const key = "financeClientVersion";
    const previous = localStorage.getItem(key);
    if (!payload.version) return;
    if (!previous) {
      localStorage.setItem(key, payload.version);
      return;
    }
    if (previous !== payload.version) {
      requestClientReload(payload.version);
    }
  }

  function requestClientReload(version) {
    if (!version) return;
    state.pendingClientVersion = version;
    requestHermesRefresh("static_assets_changed");
    applyPendingClientReload();
  }

  function applyPendingClientReload() {
    if (!state.pendingClientVersion) return;
    if (state.activeView !== ROOT_VIEW || currentCanGoBack()) return;
    localStorage.setItem("financeClientVersion", state.pendingClientVersion);
    state.pendingClientVersion = "";
    window.location.reload();
  }

  async function submitEntry(event) {
    event.preventDefault();
    computeEntryAmount();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const isEdit = state.entryAction === "edit" && state.editingTransaction?.id;
    setEntryStatus(isEdit ? "更新中" : "保存中");
    const payload = {
      ...data,
      type: state.entryType,
      ledger_id: state.activeLedgerId || undefined,
      tags: state.selectedEntryTags,
    };
    for (const key of ["amount", "currency", "category_hint", "account_hint", "target_account_hint", "member_hint", "occurred_at"]) {
      if (payload[key] === "") delete payload[key];
    }
    try {
      const response = isEdit
        ? await api(`/api/finance/transactions/${encodeURIComponent(state.editingTransaction.id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api("/api/finance/transactions", {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              idempotency_key: `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              source: state.entryAction === "copy" ? "local-ui-copy" : "local-ui",
            }),
          });
      const transactionId = response?.result?.transaction?.id || state.editingTransaction?.id || "";
      if (state.pendingAttachments.length) {
        setEntryStatus("上传附件中");
        await uploadPendingAttachments(transactionId);
      }
      clearEntryDraft();
      const keepEntry = state.stayOnEntryAfterSubmit;
      const selectedCategory = $("[data-category-select]")?.value || "";
      const account = $("[data-account-select]")?.value || "";
      const member = $("[data-member-select]")?.value || "";
      state.entryDraftSuppressSave = true;
      try {
        setStayOnEntryAfterSubmit(false);
        form.reset();
        if (account) $("[data-account-select]").value = account;
        if (member) $("[data-member-select]").value = member;
        setEntryCategory(selectedCategory);
        setEntryNote("");
        setEntryTags([]);
        syncEntryMemberLabel();
      } finally {
        state.entryDraftSuppressSave = false;
      }
      clearEntryDraft();
      setEntryStatus(isEdit ? "已更新" : "已保存");
      await loadOverview();
      if (response?.result?.transaction && !keepEntry) {
        renderTransactionDetail(response.result.transaction);
        setEntryAction("create", null);
        setView("transaction-detail");
        state.previousView = ROOT_VIEW;
        return;
      }
      setEntryAction("create", null);
      if (!keepEntry) setView(ROOT_VIEW);
    } catch (err) {
      setStayOnEntryAfterSubmit(false);
      setEntryStatus(err.message || String(err));
    }
  }

  function applyTheme(mode) {
    const value = ["system", "light", "dark"].includes(mode) ? mode : "dark";
    document.documentElement.dataset.theme = value;
    if (!IS_HERMES_EMBED || !HOST_APPEARANCE.theme) localStorage.setItem("hermesWebTheme", value);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const systemLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
      const effectiveLight = value === "light" || (value === "system" && systemLight);
      metaTheme.setAttribute("content", effectiveLight ? "#f2f2f5" : "#000000");
    }
    $$("[data-theme-option]").forEach((button) => button.classList.toggle("active", button.dataset.themeOption === value));
  }

  function applyPluginFontSize(size) {
    const value = ["compact", "normal", "large", "xlarge"].includes(size) ? size : "normal";
    document.documentElement.dataset.pluginFontSize = value;
    if (!IS_HERMES_EMBED || !HOST_APPEARANCE.fontSize) localStorage.setItem("financePluginFontSize", value);
  }

  function initialTheme() {
    return HOST_APPEARANCE.theme || localStorage.getItem("hermesWebTheme") || "dark";
  }

  function initialPluginFontSize() {
    return HOST_APPEARANCE.fontSize || localStorage.getItem("financePluginFontSize") || "normal";
  }

  function renderSettings() {
    const overlay = $("[data-settings-overlay]");
    if (!overlay) return;
    overlay.innerHTML = `
      <section class="finance-settings-sheet">
        <header>
          <h2>我的</h2>
          <button type="button" data-close-settings>完成</button>
        </header>
        <div class="finance-settings-row">
          <div><strong>本位币</strong><span>人民币 CNY</span></div>
        </div>
        <div class="finance-settings-row">
          <div><strong>界面</strong><span>挖财复刻深色优先</span></div>
          <div class="theme-options">
            <button type="button" data-theme-option="dark">深色</button>
            <button type="button" data-theme-option="light">浅色</button>
            <button type="button" data-theme-option="system">系统</button>
          </div>
        </div>
      </section>
    `;
    showOverlay(overlay);
    applyTheme(initialTheme());
    applyPluginFontSize(initialPluginFontSize());
    postHermesNavigation();
  }

  function setupEvents() {
    document.addEventListener("focusin", refreshInputFocusState);
    document.addEventListener("focusout", () => window.setTimeout(refreshInputFocusState, 0));
    window.visualViewport?.addEventListener("resize", updateKeyboardViewportOffset);
    window.visualViewport?.addEventListener("scroll", updateKeyboardViewportOffset);
    document.addEventListener("click", (event) => {
      const transactionAction = event.target.closest("[data-transaction-action]");
      if (transactionAction) {
        event.preventDefault();
        handleTransactionAction(transactionAction.dataset.transactionAction, transactionAction.dataset.actionTransactionId);
        return;
      }
      if (!event.target.closest(".finance-swipe-row") && closeSwipeRows()) postHermesNavigation();
      const assetYear = event.target.closest("[data-asset-year]");
      if (assetYear) {
        state.selectedOwnerAssetYear = Number(assetYear.dataset.assetYear || 0) || 0;
        renderOwnerAssets();
        return;
      }
      const stockDate = event.target.closest("[data-stock-date]");
      if (stockDate) {
        state.selectedOwnerStockDate = String(stockDate.dataset.stockDate || "");
        renderOwnerStocks();
        return;
      }
      const nav = event.target.closest("[data-nav-view]");
      if (nav) {
        if (nav.dataset.navView === "entry") openNewEntry(state.entryMode || "expense");
        else setView(nav.dataset.navView);
        return;
      }
      const switcher = event.target.closest("[data-switch-view]");
      if (switcher) {
        setView(switcher.dataset.switchView);
        return;
      }
      const back = event.target.closest("[data-back]");
      if (back) {
        goBack();
        return;
      }
      const attachmentPreview = event.target.closest("[data-attachment-preview-url]");
      if (attachmentPreview) {
        event.preventDefault();
        openAttachmentPreview(attachmentPreview.dataset.attachmentPreviewUrl, attachmentPreview.dataset.attachmentPreviewLabel);
        return;
      }
      const detailAttachmentAdd = event.target.closest("[data-detail-attachment-add]");
      if (detailAttachmentAdd) {
        event.preventDefault();
        openAttachmentMenu(detailAttachmentAdd.dataset.detailAttachmentAdd);
        return;
      }
      const transaction = event.target.closest("[data-transaction-id]");
      if (transaction) {
        openTransactionDetail(transaction.dataset.transactionId);
        return;
      }
      const category = event.target.closest("[data-category-quick]");
      if (category) setEntryCategory(category.dataset.categoryQuick);
      const openCategory = event.target.closest("[data-open-category-picker]");
      if (openCategory) {
        event.preventDefault();
        openCategoryPicker();
        return;
      }
      const entryDate = event.target.closest("[data-open-entry-date]");
      if (entryDate) {
        event.preventDefault();
        openEntryDatePicker();
        return;
      }
      const memberPicker = event.target.closest("[data-open-member-picker]");
      if (memberPicker) {
        event.preventDefault();
        openEntryChoicePicker("member");
        return;
      }
      const tagPicker = event.target.closest("[data-open-tag-picker]");
      if (tagPicker) {
        event.preventDefault();
        openEntryChoicePicker("tag");
        return;
      }
      const noteInput = event.target.closest("[data-open-note-input]");
      if (noteInput) {
        event.preventDefault();
        openEntryNoteOverlay();
        return;
      }
    });

    $("[data-category-select]")?.addEventListener("change", (event) => setEntryCategory(event.target.value));
    const transactionSearchInput = $("[data-transaction-search]");
    transactionSearchInput?.addEventListener("input", (event) => scheduleTransactionSearch(event.target.value));
    transactionSearchInput?.addEventListener("search", (event) => commitTransactionSearch(event.currentTarget));
    transactionSearchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitTransactionSearch(event.currentTarget);
    });
    $("[data-open-recurring-create]")?.addEventListener("click", () => openRecurringEditor(recurringFormDefaults()));
    $("[data-generate-recurring-due]")?.addEventListener("click", async () => {
      const status = $("[data-recurring-status]");
      if (status) status.textContent = "入账中";
      const payload = await api("/api/finance/recurring-rules/generate-due", {
        method: "POST",
        body: JSON.stringify({ through_at: new Date().toISOString() }),
      });
      if (status) status.textContent = `生成 ${payload.result.count || 0} 笔`;
      await loadOverview();
    });
    $("[data-recurring-list]")?.addEventListener("click", async (event) => {
      const toggle = event.target.closest("[data-recurring-toggle]");
      if (toggle) {
        const row = state.recurringRules.find((item) => item.id === toggle.dataset.recurringToggle);
        const action = row?.status === "active" ? "pause" : "resume";
        await api(`/api/finance/recurring-rules/${encodeURIComponent(toggle.dataset.recurringToggle)}/${action}`, { method: "POST", body: "{}" });
        await loadRecurringRules();
        return;
      }
      const del = event.target.closest("[data-recurring-delete]");
      if (del && window.confirm("删除周期账？已生成账单默认保留。")) {
        await api(`/api/finance/recurring-rules/${encodeURIComponent(del.dataset.recurringDelete)}`, { method: "DELETE", body: JSON.stringify({ void_generated: false }) });
        await loadRecurringRules();
      }
    });
    $("[data-recurring-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-recurring-close]")) {
        delete event.currentTarget.dataset.recurringVariant;
        hideOverlay(event.currentTarget);
        postHermesNavigation();
        return;
      }
      const endMode = event.target.closest("[data-recurring-end-mode]");
      if (endMode) {
        syncRecurringEndMode(event.currentTarget.querySelector("[data-recurring-form]"), endMode.dataset.recurringEndMode);
      }
    });
    $("[data-recurring-overlay]")?.addEventListener("change", (event) => {
      const form = event.target.closest("[data-recurring-form]");
      if (!form) return;
      if (event.target.matches("[name='type']")) syncRecurringTypeFields(form);
      if (event.target.matches("[name='start_at']") && form.querySelector("[name='end_mode']")?.value === "date") {
        const endDate = form.querySelector("[name='end_at']");
        if (endDate && !endDate.value) endDate.value = event.target.value;
      }
    });
    $("[data-recurring-overlay]")?.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-recurring-form]")) return;
      event.preventDefault();
      submitRecurringForm(event.target).catch((error) => setRecurringFormStatus(recurringErrorText(error), "error"));
    });
    $("[data-account-select]")?.addEventListener("change", () => {
      syncEntryCurrencyFromAccount();
      scheduleEntryDraftSave();
    });
    $("[data-target-account-select]")?.addEventListener("change", scheduleEntryDraftSave);
    $("[data-currency-select]")?.addEventListener("change", scheduleEntryDraftSave);
    $("[data-member-select]")?.addEventListener("change", () => {
      syncEntryMemberLabel();
      scheduleEntryDraftSave();
    });
    $("[data-entry-back]")?.addEventListener("click", () => {
      resetPendingAttachments();
      clearEntryDraft();
      setEntryAction("create", null);
      setStayOnEntryAfterSubmit(false);
      setView(ROOT_VIEW);
    });
    $("[data-entry-amount]")?.addEventListener("pointerdown", preventAmountNativeKeyboard);
    $("[data-entry-amount]")?.addEventListener("touchstart", preventAmountNativeKeyboard, { passive: false });
    $("[data-entry-amount]")?.addEventListener("focus", preventAmountNativeKeyboard);
    $("[data-entry-amount]")?.addEventListener("input", (event) => setEntryAmount(event.target.value));
    $("[data-entry-form]")?.addEventListener("click", handleKeypad);
    $(".wacai-keypad")?.addEventListener("pointerup", handleKeypad);
    $(".wacai-keypad")?.addEventListener("touchend", handleKeypad, { passive: false });
    $("[data-entry-form]")?.addEventListener("input", (event) => {
      if (event.target.matches("[data-entry-amount]")) return;
      scheduleEntryDraftSave();
    });
    $("[data-entry-form]")?.addEventListener("change", (event) => {
      if (event.target.matches("[data-entry-amount]")) return;
      scheduleEntryDraftSave();
    });
    $("[data-entry-form]")?.addEventListener("submit", submitEntry);
    $(".wacai-camera-button")?.addEventListener("click", () => openAttachmentMenu());
    $("[data-attachment-camera]")?.addEventListener("change", (event) => handleAttachmentFiles(event.target.files).catch(showError));
    $("[data-attachment-photo]")?.addEventListener("change", (event) => handleAttachmentFiles(event.target.files).catch(showError));
    $("[data-attachment-file]")?.addEventListener("change", (event) => handleAttachmentFiles(event.target.files).catch(showError));
    $("[data-attachment-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-attachment-preview-close]")) {
        closeAttachmentMenu();
        return;
      }
      const action = event.target.closest("[data-attachment-action]")?.dataset.attachmentAction;
      if (!action) return;
      if (action === "cancel") closeAttachmentMenu();
      else triggerAttachmentInput(action);
    });
    $("[data-category-picker-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-category-picker-close]")) {
        closeCategoryPicker();
        return;
      }
      const parent = event.target.closest("[data-category-picker-parent]");
      if (parent) {
        toggleCategoryPickerParent(parent.dataset.categoryPickerParent);
        return;
      }
      const selected = event.target.closest("[data-category-picker-select]");
      if (!selected) return;
      setEntryCategory(selected.dataset.categoryPickerSelect);
      closeCategoryPicker();
    });
    $("[data-category-picker-overlay]")?.addEventListener("input", (event) => {
      const search = event.target.closest("[data-category-picker-search]");
      if (!search) return;
      state.categoryPickerQuery = search.value || "";
      renderCategoryPicker();
    });
    $("[data-entry-choice-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-entry-choice-close]")) {
        closeEntryChoicePicker();
        return;
      }
      if (event.target.closest("[data-entry-choice-apply]")) {
        closeEntryChoicePicker();
        return;
      }
      const choice = event.target.closest("[data-entry-choice-value]");
      if (!choice) return;
      applyEntryChoiceValue(choice.dataset.entryChoiceValue, choice);
    });
    $("[data-entry-note-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-entry-note-close]")) {
        closeEntryNoteOverlay();
        return;
      }
      if (event.target.closest("[data-entry-note-apply]")) {
        applyEntryNoteOverlay();
      }
    });
    $("[data-entry-date-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-entry-date-close]")) {
        closeEntryDatePicker();
        return;
      }
      const step = event.target.closest("[data-entry-date-step]")?.dataset.entryDateStep;
      if (step) {
        shiftEntryDatePicker(step);
        return;
      }
      if (event.target.closest("[data-entry-date-save]")) {
        applyEntryDatePicker();
        return;
      }
      if (event.target.closest("[data-date-save-recurring]")) {
        applyEntryDatePicker({ saveRecurring: true });
      }
    });
    $("[data-entry-date-overlay]")?.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-entry-date-form]")) return;
      event.preventDefault();
      applyEntryDatePicker();
    });
    $("[data-open-ledger]")?.addEventListener("click", renderLedgerMenu);
    $("[data-ledger-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-ledger-cancel]")) {
        closeLedgerMenu();
        return;
      }
      const selected = event.target.closest("[data-ledger-select]");
      if (selected) {
        const ledger = (state.ledgers || []).find((row) => row.id === selected.dataset.ledgerSelect);
        if (ledger) {
          setActiveLedger(ledger);
          closeLedgerMenu();
          loadOverview().catch(showError);
        }
      }
    });
    $("[data-ledger-overlay]")?.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-ledger-create-form]")) return;
      event.preventDefault();
      createLedgerFromForm(event.target).catch(showError);
    });
    $$("[data-refresh]").forEach((button) => {
      button.setAttribute("aria-label", "搜索账单");
      button.addEventListener("click", openBillSearch);
    });
    $$("[data-open-settings]").forEach((button) => button.addEventListener("click", renderSettings));
    $("[data-settings-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-close-settings]")) {
        hideOverlay(event.currentTarget);
        postHermesNavigation();
      }
      const theme = event.target.closest("[data-theme-option]");
      if (theme) applyTheme(theme.dataset.themeOption);
    });

    $$("[data-open-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        openNewEntry(button.dataset.openEntry);
      });
    });
    $$("[data-entry-type]").forEach((button) => {
      button.addEventListener("click", () => setEntryType(button.dataset.entryType));
    });
    $$("[data-report-period]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.reportPeriod === "more") {
          openReportPeriodPicker();
          return;
        }
        state.reportPeriod = button.dataset.reportPeriod || "all";
        resetReportAnchorToCurrent(state.reportPeriod);
        syncReportPeriodButtons();
        updateReportDateControls();
        loadReport().catch(showError);
      });
    });
    $("[data-report-prev]")?.addEventListener("click", () => shiftReportPeriod(-1));
    $("[data-report-next]")?.addEventListener("click", () => shiftReportPeriod(1));
    $("[data-report-date-start]")?.addEventListener("click", () => openReportDatePicker("start"));
    $("[data-report-date-end]")?.addEventListener("click", () => openReportDatePicker("end"));
    $("[data-report-currency-button]")?.addEventListener("click", openReportCurrencyPicker);
    $("[data-home-currency-button]")?.addEventListener("click", openReportCurrencyPicker);
    $(".wacai-filter-button")?.addEventListener("click", openReportPeriodPicker);
    const reportPickerOverlay = $("[data-report-picker-overlay]");
    reportPickerOverlay?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("[data-report-picker-close]")) {
        event.preventDefault();
        event.stopPropagation();
        closeReportPicker();
        return;
      }
      if (event.currentTarget.dataset.reportPickerMode === "date-wheel" && updateReportDateWheel(event)) return;
      const currency = event.target.closest("[data-report-picker-currency]");
      if (currency) {
        event.preventDefault();
        event.stopPropagation();
        applyReportCurrency(currency.dataset.reportPickerCurrency).catch(showError);
        return;
      }
      const period = event.target.closest("[data-report-picker-period]");
      if (period) {
        $$("[data-report-picker-period]", event.currentTarget).forEach((node) => node.classList.toggle("active", node === period));
      }
      if (event.target.closest("[data-report-picker-apply]")) applyReportPicker();
    });
    reportPickerOverlay?.addEventListener("wheel", handleReportWheelScroll, { passive: false });
    reportPickerOverlay?.addEventListener("pointerdown", startReportWheelDrag);
    reportPickerOverlay?.addEventListener("pointerup", finishReportWheelDrag);
    reportPickerOverlay?.addEventListener("touchstart", startReportWheelDrag, { passive: true });
    reportPickerOverlay?.addEventListener("touchend", finishReportWheelDrag, { passive: false });
    $$("[data-report-dimension]").forEach((button) => {
      button.addEventListener("click", () => {
        state.reportDimension = button.dataset.reportDimension || "category";
        $$("[data-report-dimension]").forEach((node) => node.classList.toggle("active", node === button));
        loadReport().catch(showError);
      });
    });
    $("[data-report-list]")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-report-index]");
      if (row) openReportActions(row.dataset.reportIndex);
    });
    $("[data-report-breakdown-list]")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-report-breakdown-index]");
      if (row) openReportActions(row.dataset.reportBreakdownIndex, state.reportBreakdownRows, "subcategory");
    });
    $("[data-report-action-overlay]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeReportActions();
      if (event.target.closest("[data-transaction-delete-cancel]")) closeReportActions();
      if (event.target.closest("[data-transaction-delete-confirm]")) deleteSelectedTransaction().catch(showError);
      const action = event.target.closest("[data-report-action]");
      if (action?.dataset.reportAction === "cancel") closeReportActions();
      if (action?.dataset.reportAction === "trend") openReportTrend().catch(showError);
      if (action?.dataset.reportAction === "breakdown") openReportBreakdown().catch(showError);
      if (action?.dataset.reportAction === "detail") openReportDetail().catch(showError);
    });
    $("[data-open-report-detail]")?.addEventListener("click", () => openReportDetail().catch(showError));

    document.addEventListener("touchstart", (event) => {
      state.swipeCandidate = false;
      state.swipeRow = null;
      state.swipeHorizontalIntent = false;
      state.swipeAxis = "pending";
      state.swipeMaxLeft = 0;
      const row = event.target.closest(".finance-swipe-row");
      if (!row || event.touches.length !== 1) return;
      state.swipeRow = row;
      state.swipeStartX = event.touches[0].clientX;
      state.swipeStartY = event.touches[0].clientY;
      state.swipeCandidate = true;
    }, { passive: true });
    document.addEventListener("touchmove", (event) => {
      if (!state.swipeCandidate || !state.swipeRow || !event.touches.length) return;
      const dx = event.touches[0].clientX - state.swipeStartX;
      const dy = Math.abs(event.touches[0].clientY - state.swipeStartY);
      const ax = Math.abs(dx);
      state.swipeMaxLeft = Math.max(state.swipeMaxLeft, Math.max(0, -dx));
      if (state.swipeAxis === "vertical") return;
      if (state.swipeAxis === "pending") {
        if (dy >= 10 && dy >= ax * 0.65) {
          state.swipeAxis = "vertical";
          state.swipeHorizontalIntent = false;
          return;
        }
        if (ax >= 48 && ax > dy * 2.8 && dy <= 18) {
          state.swipeAxis = "horizontal";
          state.swipeHorizontalIntent = true;
          event.preventDefault();
        }
        return;
      }
      if (state.swipeAxis === "horizontal") {
        event.preventDefault();
      }
    }, { passive: false });
    document.addEventListener("touchend", (event) => {
      if (!state.swipeCandidate || !state.swipeRow || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - state.swipeStartX;
      const dy = Math.abs(event.changedTouches[0].clientY - state.swipeStartY);
      const row = state.swipeRow;
      if (isIntentionalRowSwipe(dx, dy)) {
        cancelRowSwipe();
        openSwipeRow(row);
        postHermesNavigation();
        event.preventDefault();
      } else if (isIntentionalRowCloseSwipe(dx, dy)) {
        cancelRowSwipe();
        closeSwipeRow(row);
        postHermesNavigation();
        event.preventDefault();
      } else {
        cancelRowSwipe();
      }
    }, { passive: false });

    document.addEventListener("touchstart", (event) => {
      state.touchBackCandidate = false;
      if (!shouldCaptureEdgeBack() || event.touches.length !== 1) return;
      state.touchStartX = event.touches[0].clientX;
      state.touchStartY = event.touches[0].clientY;
      state.touchBackCandidate = state.touchStartX < 36;
    }, { passive: true });
    document.addEventListener("touchmove", (event) => {
      if (!state.touchBackCandidate || !shouldCaptureEdgeBack() || !event.touches.length) return;
      const dx = event.touches[0].clientX - state.touchStartX;
      const dy = Math.abs(event.touches[0].clientY - state.touchStartY);
      if (dx > 16 && dx > dy * 1.2) event.preventDefault();
    }, { passive: false });
    document.addEventListener("touchend", (event) => {
      if (!state.touchBackCandidate || !shouldCaptureEdgeBack() || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - state.touchStartX;
      const dy = Math.abs(event.changedTouches[0].clientY - state.touchStartY);
      state.touchBackCandidate = false;
      if (state.touchStartX < 36 && dx > 72 && dy < 48) {
        event.preventDefault();
        const handled = goBack();
        if (IS_HERMES_EMBED) postBackState(handled);
        else if (handled) postHermesNavigation();
      }
    }, { passive: false });
  }

  function setEntryType(type) {
    const mode = type || "expense";
    const changed = state.entryMode !== mode;
    state.entryMode = mode;
    state.entryType = mode === "loan" ? "expense" : mode;
    if (changed) state.selectedEntryCategory = "";
    const form = $("[data-entry-form]");
    if (form) form.dataset.entryMode = mode;
    $$("[data-entry-type]").forEach((button) => button.classList.toggle("active", button.dataset.entryType === mode));
    if (state.overview) renderEntryOptions(state.overview);
    if (changed) scheduleEntryDraftSave();
  }

  function showError(err) {
    const target = $("[data-ledger-status]");
    if (target) target.textContent = err.message || String(err);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
      navigator.serviceWorker.register("/service-worker.js").catch(function () {});
    });
  }

  function handleHermesMessage(event) {
    const data = event.data || {};
    if (!data) return;
    if (data.type === HERMES_EVENTS.viewport) {
      if (data.pluginId && data.pluginId !== "finance") return;
      state.hermesHostViewport = Object.assign({}, data, { receivedAt: Date.now() });
      if (!entryNoteOverlayActive()) updateKeyboardViewportOffset();
      scheduleUiProbe("hermes-host-viewport");
      return;
    }
    if (data.type !== HERMES_EVENTS.back) return;
    const handled = goBack();
    postBackState(handled);
  }

  if (IS_HERMES_EMBED) document.body.classList.add("finance-embed");
  window.addEventListener("resize", () => scheduleUiProbe("resize"));
  window.addEventListener("scroll", () => {
    maybeLoadMoreTransactions();
    pinEntryNoteViewportSoon(0);
  }, { passive: true });
  window.addEventListener("touchend", scheduleTransactionPaginationCheck, { passive: true });
  window.addEventListener("wheel", scheduleTransactionPaginationCheck, { passive: true });
  window.addEventListener("message", handleHermesMessage);
  window.addEventListener("pagehide", handleEntryDraftPageExit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handleEntryDraftPageExit();
  });
  window.visualViewport?.addEventListener("resize", () => {
    scheduleUiProbe("visual-viewport-resize");
    pinEntryNoteViewportSoon(0);
  });
  window.visualViewport?.addEventListener("scroll", () => {
    scheduleUiProbe("visual-viewport-scroll");
    maybeLoadMoreTransactions();
    pinEntryNoteViewportSoon(0);
  });
  window.__financeCollectUiProbe = collectUiProbe;
  window.__financePostUiProbe = postUiProbe;
  window.__financeHermesPlugin = {
    route: currentHermesRoute,
    requestRefresh: requestHermesRefresh,
    handleBack: () => {
      const handled = goBack();
      postBackState(handled);
      return handled;
    },
  };

  setupEvents();
  applyTheme(initialTheme());
  applyPluginFontSize(initialPluginFontSize());
  setView(ROOT_VIEW);
  registerServiceWorker();
  loadOverview().catch(showError);
  checkClientVersion().catch(() => {});
  setInterval(() => checkClientVersion().catch(() => {}), 30000);
  setInterval(() => scheduleUiProbe("interval"), 15000);
})();
