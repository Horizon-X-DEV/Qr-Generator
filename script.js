/* ============================================================
   HorizonX QR — Application Logic
   Vanilla JavaScript. No backend, no frameworks.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const MAX_HISTORY = 5;
  const THEME_KEY = 'horizonx-qr-theme';
  const DEFAULT_OPTIONS = { size: 512, dark: '#000000', light: '#ffffff', ec: 'M' };

  /* ---------------- State ---------------- */
  const state = {
    activeTab: 'url',           // 'url' | 'text'
    current: null,              // { type: 'url' | 'text', content: string } | null
    history: [],                // [{ type, content, time }]
    options: { ...DEFAULT_OPTIONS }
  };

  /* ---------------- DOM references ---------------- */
  const $ = (sel) => document.querySelector(sel);

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

  // Inputs
  const urlInput = $('#urlInput');
  const textInput = $('#textInput');
  const charCount = $('#charCount');
  const inputError = $('#inputError');

  // Actions
  const generateBtn = $('#generateBtn');
  const clearBtn = $('#clearBtn');

  // Customize
  const customizeToggle = $('#customizeToggle');
  const customizePanel = $('#customizePanel');
  const sizeSelect = $('#sizeSelect');
  const ecSelect = $('#ecSelect');
  const darkColor = $('#darkColor');
  const lightColor = $('#lightColor');
  const darkColorValue = $('#darkColorValue');
  const lightColorValue = $('#lightColorValue');
  const contrastWarning = $('#contrastWarning');

  // Preview
  const previewPlaceholder = $('#previewPlaceholder');
  const previewResult = $('#previewResult');
  const qrCanvas = $('#qrCanvas');
  const typeBadge = $('#typeBadge');
  const contentSummary = $('#contentSummary');

  // Result actions
  const downloadBtn = $('#downloadBtn');
  const copyBtn = $('#copyBtn');
  const regenBtn = $('#regenBtn');

  // History
  const historyList = $('#historyList');
  const clearHistoryBtn = $('#clearHistoryBtn');

  // Theme & toast
  const themeToggle = $('#themeToggle');
  const toast = $('#toast');

  /* ============================================================
     Utilities
     ============================================================ */

  /** Show a small toast notification. */
  let toastTimer = null;
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, 2800);
  }

  /** Set inline validation error under the input. */
  function setInputError(message) {
    inputError.textContent = message || '';
  }
  function clearInputError() { inputError.textContent = ''; }

  /** Relative time formatting for history. */
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  }

  /* ============================================================
     URL handling
     ============================================================ */

  /**
   * Normalize a user-entered URL.
   * - Trims whitespace.
   * - Prepends https:// when no scheme is present.
   * - Validates scheme and hostname.
   * Returns the canonical URL (u.href) or throws an Error.
   */
  function normalizeUrl(raw) {
    let value = String(raw).trim();
    if (!value) throw new Error('Please enter a URL.');

    // Add protocol if missing
    if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(value)) {
      value = 'https://' + value;
    }

    let url;
    try {
      url = new URL(value);
    } catch (e) {
      throw new Error('Please enter a valid URL (e.g. https://example.com).');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http and https URLs are supported.');
    }
    if (!url.hostname) {
      throw new Error('Please enter a valid URL (e.g. https://example.com).');
    }
    return url.href;
  }

  /* ============================================================
     Tabs
     ============================================================ */

  function switchTab(name) {
    state.activeTab = name;
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === name);
    });
    clearInputError();
    // Focus the relevant input for convenience (without scrolling)
    if (name === 'url') urlInput.focus({ preventScroll: true });
    else textInput.focus({ preventScroll: true });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  /* ============================================================
     Character counter
     ============================================================ */

  function updateCharCount() {
    charCount.textContent = String(textInput.value.length);
  }
  textInput.addEventListener('input', updateCharCount);

  /* ============================================================
     Color helpers (contrast validation)
     ============================================================ */

  function hexToLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(hexA, hexB) {
    const la = hexToLuminance(hexA);
    const lb = hexToLuminance(hexB);
    const light = Math.max(la, lb);
    const dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
  }

  function updateColorLabels() {
    darkColorValue.textContent = darkColor.value;
    lightColorValue.textContent = lightColor.value;
  }

  function updateContrastWarning() {
    const dark = darkColor.value;
    const light = lightColor.value;
    const ratio = contrastRatio(dark, light);
    const darkLum = hexToLuminance(dark);
    const lightLum = hexToLuminance(light);

    let message = '';
    if (ratio < 3) {
      message = 'Low contrast between QR color and background. The code may be hard to scan.';
    } else if (darkLum >= lightLum) {
      message = 'For best results, use a dark QR color on a light background.';
    }

    if (message) {
      contrastWarning.textContent = message;
      contrastWarning.hidden = false;
    } else {
      contrastWarning.hidden = true;
    }
  }

  /* ============================================================
     Options
     ============================================================ */

  function readOptionsFromUI() {
    state.options.size = parseInt(sizeSelect.value, 10) || DEFAULT_OPTIONS.size;
    state.options.dark = darkColor.value;
    state.options.light = lightColor.value;
    state.options.ec = ecSelect.value;
  }

  function syncOptionsToUI() {
    sizeSelect.value = String(state.options.size);
    ecSelect.value = state.options.ec;
    darkColor.value = state.options.dark;
    lightColor.value = state.options.light;
    updateColorLabels();
  }

  /* ============================================================
     QR rendering
     ============================================================ */

  function friendlyQrError(err) {
    const msg = String((err && err.message) || err || '');
    if (/too (big|long|much)|data too long|overflow|code length overflow/i.test(msg)) {
      return 'Content is too long for the selected error correction level. Try shorter text or a lower error correction level.';
    }
    return 'Failed to generate QR code. Please try again.';
  }

  /**
   * Render a QR code onto the preview canvas.
   * Calls onDone(err|null) when finished.
   */
  function renderQR(content, options, onDone) {
    if (typeof window.QRCode === 'undefined') {
      showToast('QR library failed to load. Check your connection and reload.', 'error');
      if (onDone) onDone(new Error('library-unavailable'));
      return;
    }

    const opts = {
      width: options.size,
      margin: 4, // quiet zone in modules
      color: { dark: options.dark, light: options.light },
      errorCorrectionLevel: options.ec
    };

    window.QRCode.toCanvas(qrCanvas, content, opts, function (err) {
      if (onDone) onDone(err || null);
    });
  }

  /** Re-render current content (used when settings change). */
  function refreshPreview() {
    if (!state.current) return;
    renderQR(state.current.content, state.options, function (err) {
      if (err) showToast(friendlyQrError(err), 'error');
    });
  }

  /* ============================================================
     Generation flow
     ============================================================ */

  function generateFromContent(type, content) {
    clearInputError();
    state.current = { type: type, content: content };

    // Show result, hide placeholder
    previewPlaceholder.hidden = true;
    previewResult.hidden = false;

    // Update meta
    typeBadge.textContent = type === 'url' ? 'URL' : 'TEXT';
    typeBadge.className = 'badge badge-' + type;
    contentSummary.textContent = content;
    contentSummary.title = content;

    // Loading state
    const originalLabel = generateBtn.textContent;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    readOptionsFromUI();

    renderQR(content, state.options, function (err) {
      generateBtn.disabled = false;
      generateBtn.textContent = originalLabel;

      if (err) {
        showToast(friendlyQrError(err), 'error');
        // Revert to placeholder so we don't show a stale/blank canvas
        previewResult.hidden = true;
        previewPlaceholder.hidden = false;
        state.current = null;
        return;
      }

      // Play the fade-in animation fresh
      previewResult.classList.remove('fade-in');
      void previewResult.offsetWidth;
      previewResult.classList.add('fade-in');

      addToHistory(type, content);
      showToast('QR code generated.', 'success');
    });
  }

  function handleGenerate() {
    clearInputError();

    if (state.activeTab === 'url') {
      const raw = urlInput.value.trim();
      if (!raw) {
        setInputError('Please enter a URL.');
        urlInput.focus();
        return;
      }
      let normalized;
      try {
        normalized = normalizeUrl(raw);
      } catch (e) {
        setInputError(e.message);
        urlInput.focus();
        return;
      }
      generateFromContent('url', normalized);
    } else {
      const text = textInput.value;
      if (!text.trim()) {
        setInputError('Please enter some text.');
        textInput.focus();
        return;
      }
      // Use the raw text exactly as typed (preserves whitespace/newlines)
      generateFromContent('text', text);
    }
  }

  generateBtn.addEventListener('click', handleGenerate);

  // Enter key in URL input triggers generation
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  });
  // Ctrl/Cmd+Enter in textarea triggers generation
  textInput.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  });

  /* ============================================================
     Clear
     ============================================================ */

  function handleClear() {
    urlInput.value = '';
    textInput.value = '';
    updateCharCount();
    clearInputError();

    // Reset result preview
    state.current = null;
    previewResult.hidden = true;
    previewPlaceholder.hidden = false;

    showToast('Input cleared.', 'success');
    if (state.activeTab === 'url') urlInput.focus();
    else textInput.focus();
  }

  clearBtn.addEventListener('click', handleClear);

  /* ============================================================
     Download PNG
     ============================================================ */

  function handleDownload() {
    if (!state.current) {
      showToast('Generate a QR code first.', 'error');
      return;
    }
    if (typeof qrCanvas.toBlob !== 'function') {
      showToast('Download is not supported in this browser.', 'error');
      return;
    }

    qrCanvas.toBlob(function (blob) {
      if (!blob) {
        showToast('Failed to create PNG. Try again.', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'horizonx-qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('QR code downloaded.', 'success');
    }, 'image/png');
  }

  downloadBtn.addEventListener('click', handleDownload);

  /* ============================================================
     Copy content
     ============================================================ */

  function copyWithFallback(text) {
    // Try modern API first
    if (navigator.clipboard && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-secure contexts
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) {
        reject(e);
      }
    });
  }

  function handleCopy() {
    if (!state.current) {
      showToast('Nothing to copy yet.', 'error');
      return;
    }
    copyWithFallback(state.current.content)
      .then(() => showToast('Content copied to clipboard.', 'success'))
      .catch(() => showToast('Failed to copy content.', 'error'));
  }

  copyBtn.addEventListener('click', handleCopy);

  /* ============================================================
     Regenerate
     ============================================================ */

  function handleRegenerate() {
    if (!state.current) {
      showToast('Generate a QR code first.', 'error');
      return;
    }
    readOptionsFromUI();
    refreshPreview();
    // Subtle confirmation
    previewResult.classList.remove('fade-in');
    void previewResult.offsetWidth;
    previewResult.classList.add('fade-in');
    showToast('QR code regenerated.', 'success');
  }

  regenBtn.addEventListener('click', handleRegenerate);

  /* ============================================================
     Customize panel
     ============================================================ */

  customizeToggle.addEventListener('click', function () {
    const expanded = customizeToggle.getAttribute('aria-expanded') === 'true';
    customizeToggle.setAttribute('aria-expanded', String(!expanded));
    customizePanel.hidden = expanded;
  });

  // Settings changes → update state, contrast warning, and live preview
  function onSettingChange() {
    readOptionsFromUI();
    updateContrastWarning();
    refreshPreview();
  }

  [sizeSelect, ecSelect].forEach((el) => {
    el.addEventListener('change', onSettingChange);
  });

  [darkColor, lightColor].forEach((el) => {
    // 'input' fires while dragging the picker — update label + warning only
    el.addEventListener('input', function () {
      updateColorLabels();
      updateContrastWarning();
    });
    // 'change' fires on final selection — apply to QR
    el.addEventListener('change', onSettingChange);
  });

  /* ============================================================
     History
     ============================================================ */

  function addToHistory(type, content) {
    // Remove an identical entry so it moves to the top
    state.history = state.history.filter(
      (item) => !(item.type === type && item.content === content)
    );
    state.history.unshift({ type: type, content: content, time: Date.now() });
    if (state.history.length > MAX_HISTORY) {
      state.history.length = MAX_HISTORY;
    }
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = '';

    if (!state.history.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'No recent codes yet.';
      historyList.appendChild(li);
      return;
    }

    state.history.forEach(function (item) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.tabIndex = 0;
      li.setAttribute('role', 'button');

      const badge = document.createElement('span');
      badge.className = 'badge badge-' + item.type;
      badge.textContent = item.type === 'url' ? 'URL' : 'TEXT';

      const textEl = document.createElement('span');
      textEl.className = 'history-text';
      const preview = item.content.length > 60
        ? item.content.slice(0, 60) + '…'
        : item.content;
      textEl.textContent = preview;          // textContent = safe, no HTML injection
      textEl.title = item.content;

      const timeEl = document.createElement('span');
      timeEl.className = 'history-time';
      timeEl.textContent = timeAgo(item.time);

      li.appendChild(badge);
      li.appendChild(textEl);
      li.appendChild(timeEl);

      const activate = function () { loadFromHistory(item); };
      li.addEventListener('click', activate);
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      historyList.appendChild(li);
    });
  }

  function loadFromHistory(item) {
    if (item.type === 'url') {
      switchTab('url');
      urlInput.value = item.content;
      // Content was already normalized when stored, so generate directly.
      generateFromContent('url', item.content);
    } else {
      switchTab('text');
      textInput.value = item.content;
      updateCharCount();
      generateFromContent('text', item.content);
    }
  }

  clearHistoryBtn.addEventListener('click', function () {
    if (!state.history.length) {
      showToast('History is already empty.', 'success');
      return;
    }
    state.history = [];
    renderHistory();
    showToast('History cleared.', 'success');
  });

  /* ============================================================
     Theme
     ============================================================ */

  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    themeToggle.setAttribute(
      'aria-label',
      next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (saved !== 'light' && saved !== 'dark') {
      // Default to dark theme per spec
      saved = 'dark';
    }
    setTheme(saved);
  }

  themeToggle.addEventListener('click', function () {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ============================================================
     Initialization
     ============================================================ */

  function init() {
    initTheme();
    syncOptionsToUI();
    readOptionsFromUI();
    updateColorLabels();
    updateContrastWarning();
    updateCharCount();
    renderHistory();

    // Warn once if the QR library failed to load from CDN
    if (typeof window.QRCode === 'undefined') {
      showToast('QR library failed to load. Check your connection and reload.', 'error');
      generateBtn.disabled = true;
      generateBtn.textContent = 'QR library unavailable';
    }
  }

  // DOM is ready because script.js is loaded at the end of <body>.
  init();
})();
