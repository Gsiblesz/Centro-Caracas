'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycbwLcR2mEfY2i-MIxc3JO6mcS5JL2EoE4rjftf3dvfxt6ny5gqmaD0fqcdSRdyfBdYqp/exec';
const BACKEND_BASE_URL = 'https://centro-caracas-backend.onrender.com';
const BACKEND_POST_URL = `${BACKEND_BASE_URL}/registros`;
const BACKEND_API_KEY = 'npg_h1wfyYnG2RDz';

const state = {
  timers: {},
  histories: {
    mixers: [],
    mesa: [],
    fermenter: [],
    ovens: [],
  },
  fermenterCount: 0,
  lotTracker: {},
  controlChart: null,
  resultsMode: 'cards',
  resultsRecords: [],
};

document.addEventListener('DOMContentLoaded', () => {
  setupLockScreen();
  setShiftDefaults();
  setupDailyLotPropagation();
  setupTabs();
  setupStaticCards();
  setupFermenter();
  wireHistoryClears();
  setupResultsView();
  wireResultsShortcut();
});

function setupLockScreen() {
  const lock = document.getElementById('lockScreen');
  const form = document.getElementById('lockForm');
  const input = lock ? lock.querySelector('input[name="lockPassword"]') : null;
  const errorEl = lock ? lock.querySelector('[data-lock-error]') : null;
  const body = document.body;
  const KEY = 'pandetata';

  if (!lock || !form) return;

  body.classList.add('is-locked');

  const attemptUnlock = () => {
    const value = input ? input.value.trim() : '';
    if (value && value.toLowerCase() === KEY) {
      lock.remove();
      body.classList.remove('is-locked');
      if (errorEl) errorEl.textContent = '';
      return true;
    }
    if (errorEl) errorEl.textContent = 'Clave incorrecta. Intenta de nuevo.';
    if (input) {
      input.value = '';
      input.focus();
    }
    return false;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    attemptUnlock();
  });

  if (input) input.focus();
}

class Timer {
  constructor(displayEl, pillEl) {
    this.displayEl = displayEl;
    this.pillEl = pillEl;
    this.interval = null;
    this.reset(true);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startAt = Date.now() - this.elapsed;
    this.endAt = null;
    this._tick();
    this.interval = setInterval(() => this._tick(), 500);
    this._setState('running');
  }

  pause() {
    if (!this.running) return;
    this.elapsed = Date.now() - this.startAt;
    clearInterval(this.interval);
    this.running = false;
    this._tick();
    this._setState('paused');
  }

  finish() {
    if (this.running) {
      this.pause();
    }
    this.endAt = Date.now();
    this._setState('complete');
  }

  reset(silent = false) {
    clearInterval(this.interval);
    this.running = false;
    this.startAt = null;
    this.endAt = null;
    this.elapsed = 0;
    this._tick();
    if (!silent) this._setState('idle');
  }

  durationMs() {
    if (this.running) return Date.now() - this.startAt;
    return this.elapsed;
  }

  _tick() {
    const ms = this.running ? Date.now() - this.startAt : this.elapsed;
    this.displayEl.textContent = formatDuration(ms);
  }

  _setState(mode) {
    if (!this.pillEl) return;
    const map = {
      idle: { text: 'En espera', state: '' },
      running: { text: 'Corriendo', state: 'running' },
      paused: { text: 'Pausado', state: 'paused' },
      complete: { text: 'Listo', state: 'complete' },
    };
    const data = map[mode] || map.idle;
    this.pillEl.textContent = data.text;
    if (data.state) {
      this.pillEl.setAttribute('data-state', data.state);
    } else {
      this.pillEl.removeAttribute('data-state');
    }
  }
}

function setShiftDefaults() {
  const shiftForm = document.getElementById('shiftForm');
  if (!shiftForm) return;
  const dateInput = shiftForm.querySelector('input[name="shiftDate"]');
  const today = new Date();
  if (dateInput) {
    const iso = today.toISOString().slice(0, 10);
    dateInput.value = iso;
  }
}

function setupDailyLotPropagation() {
  const shiftForm = document.getElementById('shiftForm');
  if (!shiftForm) return;
  const dailyLotInput = shiftForm.querySelector('input[name="dailyLot"]');
  if (!dailyLotInput) return;
  const today = new Date();
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
  if (!dailyLotInput.value) {
    dailyLotInput.value = `LD-${yyyymmdd}`;
  }

  const applyValue = (value) => {
    const targets = document.querySelectorAll('[data-daily-lot]');
    targets.forEach((input) => {
      if (input instanceof HTMLInputElement && !input.value) {
        input.value = value;
      }
    });
  };

  applyValue(dailyLotInput.value);

  dailyLotInput.addEventListener('input', (e) => {
    applyValue(e.target.value);
  });
}

function setupTabs() {
  const buttons = Array.from(document.querySelectorAll('[data-tab-target]'));
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-tab-target');
      activateTab(target);
    });
  });
}

function activateTab(targetKey) {
  const buttons = document.querySelectorAll('[data-tab-target]');
  const panels = document.querySelectorAll('[data-tab-panel]');
  buttons.forEach((button) => {
    const key = button.getAttribute('data-tab-target');
    button.classList.toggle('is-active', key === targetKey);
  });
  panels.forEach((panel) => {
    const key = panel.getAttribute('data-tab-panel');
    panel.classList.toggle('is-active', key === targetKey);
  });
}

function setupStaticCards() {
  const cards = document.querySelectorAll('[data-card]');
  cards.forEach((card) => {
    if (card.dataset.panel === 'mixers') {
      wireMixerCard(card);
    } else {
      wireCard(card);
    }
  });
}

function setupFermenter() {
  const grid = document.getElementById('fermenterGrid');
  if (!grid) return;
  const existingCards = Array.from(grid.querySelectorAll('.card'));
  if (existingCards.length) {
    existingCards.forEach((card) => wireCard(card));
    setupDailyLotPropagation();
    return;
  }
  const card = createFermenterCard();
  grid.appendChild(card);
  wireCard(card);
  setupDailyLotPropagation();
}

function createFermenterCard() {
  const tpl = document.getElementById('fermenterTemplate');
  if (!tpl) throw new Error('No hay plantilla de fermentadora');
  const clone = tpl.content.cloneNode(true);
  const card = clone.querySelector('.card');
  state.fermenterCount += 1;
  const cardId = `fermento-${state.fermenterCount}`;
  card.dataset.card = cardId;
  card.querySelector('[data-fermenter-title]').textContent = `Fermentación ${state.fermenterCount}`;
  return card;
}

function wireMixerCard(card) {
  const cardId = card.dataset.card;
  const summaryPill = card.querySelector('[data-summary-status]');
  const form = card.querySelector('form');
  const stageEls = Array.from(card.querySelectorAll('[data-stage-id]'));
  const stages = [];
  const deadTimesMs = [0, 0];
  const deadDisplays = [
    card.querySelector('[data-dead-display="1"]'),
    card.querySelector('[data-dead-display="2"]'),
  ];
  const deadTotalDisplay = card.querySelector('[data-dead-total]');
  const machineTotalDisplay = card.querySelector('[data-total-machine]');
  const overallDisplay = card.querySelector('[data-total-overall]');

  const setSummaryState = (mode) => {
    if (!summaryPill) return;
    const map = {
      idle: { text: 'En espera', state: '' },
      running: { text: 'Corriendo', state: 'running' },
      paused: { text: 'Pausado', state: 'paused' },
      complete: { text: 'Listo', state: 'complete' },
    };
    const data = map[mode] || map.idle;
    summaryPill.textContent = data.text;
    if (data.state) {
      summaryPill.setAttribute('data-state', data.state);
    } else {
      summaryPill.removeAttribute('data-state');
    }
  };

  const recalcSummary = () => {
    const running = stages.some((s) => s.timer.running);
    const allFinished = stages.every((s) => s.timer.endAt);
    if (running) return setSummaryState('running');
    if (allFinished && stages.length) return setSummaryState('complete');
    return setSummaryState('idle');
  };

  const recalcDeadTimes = () => {
    deadTimesMs[0] = 0;
    deadTimesMs[1] = 0;
    stages.forEach((stage, index) => {
      if (index === 0) return;
      const prev = stages[index - 1];
      if (stage.timer.startAt && prev.timer.endAt) {
        deadTimesMs[index - 1] = Math.max(0, stage.timer.startAt - prev.timer.endAt);
      }
    });
    deadDisplays.forEach((el, idx) => {
      if (el) el.textContent = deadTimesMs[idx] ? formatDuration(deadTimesMs[idx]) : '--:--:--';
    });
    const deadTotal = deadTimesMs.reduce((acc, val) => acc + val, 0);
    if (deadTotalDisplay) deadTotalDisplay.textContent = formatDuration(deadTotal);
  };

  const updateTotals = () => {
    const machineTotal = stages.reduce((acc, stage) => acc + stage.timer.durationMs(), 0);
    const deadTotal = deadTimesMs.reduce((acc, val) => acc + val, 0);
    const overall = machineTotal + deadTotal;
    if (machineTotalDisplay) machineTotalDisplay.textContent = formatDuration(machineTotal);
    if (overallDisplay) overallDisplay.textContent = formatDuration(overall);
  };

  const forceFinishOtherStages = (currentStage) => {
    let anyFinished = false;
    stages.forEach((other) => {
      if (other !== currentStage && other.timer.running) {
        other.timer.finish();
        other.updateTexts?.();
        anyFinished = true;
      }
    });
    if (anyFinished) {
      recalcDeadTimes();
      updateTotals();
      recalcSummary();
    }
  };

  stageEls.forEach((stageEl) => {
    const stageId = stageEl.getAttribute('data-stage-id');
    const timerDisplay = stageEl.querySelector('[data-stage-timer]');
    const pill = stageEl.querySelector('[data-status-pill]');
    const startEl = stageEl.querySelector('[data-stage-start]');
    const endEl = stageEl.querySelector('[data-stage-end]');
    const startBtn = stageEl.querySelector('[data-stage-start-btn]');
    const pauseBtn = stageEl.querySelector('[data-stage-pause-btn]');
    const finishBtn = stageEl.querySelector('[data-stage-finish-btn]');
    const resetBtn = stageEl.querySelector('[data-stage-reset-btn]');
    const timer = new Timer(timerDisplay, pill);

    const stage = { id: stageId, el: stageEl, timer, startEl, endEl };
    stages.push(stage);
    state.timers[`${cardId}-${stageId}`] = timer;

    const updateStartText = () => {
      if (!stage.startEl) return;
      stage.startEl.textContent = stage.timer.startAt ? formatTime(new Date(stage.timer.startAt).toISOString()) : '--:--:--';
    };

    const updateEndText = () => {
      if (!stage.endEl) return;
      stage.endEl.textContent = stage.timer.endAt ? formatTime(new Date(stage.timer.endAt).toISOString()) : '--:--:--';
    };

    stage.updateTexts = () => {
      updateStartText();
      updateEndText();
    };
    stage.updateStartText = updateStartText;
    stage.updateEndText = updateEndText;

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        forceFinishOtherStages(stage);
        timer.start();
        updateStartText();
        const currentIndex = stages.indexOf(stage);
        if (currentIndex > 0) {
          const prev = stages[currentIndex - 1];
          if (prev.timer.endAt) {
            deadTimesMs[currentIndex - 1] = Math.max(0, timer.startAt - prev.timer.endAt);
            recalcDeadTimes();
          }
        }
        recalcSummary();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        timer.pause();
        recalcSummary();
      });
    }

    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        timer.finish();
        updateEndText();
        recalcDeadTimes();
        updateTotals();
        recalcSummary();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        timer.reset();
        stage.timer.endAt = null;
        stage.timer.startAt = null;
        updateStartText();
        updateEndText();
        recalcDeadTimes();
        updateTotals();
        recalcSummary();
      });
    }
  });

  const resetStageDisplays = () => {
    stages.forEach((stage) => {
      if (stage.startEl) stage.startEl.textContent = '--:--:--';
      if (stage.endEl) stage.endEl.textContent = '--:--:--';
      stage.timer.reset();
    });
    deadTimesMs[0] = 0;
    deadTimesMs[1] = 0;
    recalcDeadTimes();
    updateTotals();
    recalcSummary();
  };

  recalcDeadTimes();
  updateTotals();
  recalcSummary();

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = buildMixerPayload({ card, cardId, stages, deadTimesMs });
      attachLotTransition(payload);
      const historyEntry = formatHistoryEntry(payload);
      try {
        const persistence = await persistPayload(payload);
        notifyPersistence(persistence);
        addHistory('mixers', historyEntry);
        resetStageDisplays();
        form.reset();
        setupDailyLotPropagation();
      } catch (err) {
        console.error('No se pudo enviar a Sheets', err);
        addHistory('mixers', `${historyEntry} · Error al enviar`);
        showNotification(err?.message || 'No se pudo guardar', 'error');
      }
    });
  }
}

function wireCard(card) {
  const cardId = card.dataset.card;
  const panel = card.dataset.panel;
  const display = card.querySelector('[data-timer-display]');
  const pill = card.querySelector('[data-status-pill]');
  const startBtn = card.querySelector('[data-start]');
  const pauseBtn = card.querySelector('[data-pause]');
  const finishBtn = card.querySelector('[data-finish]');
  const resetBtn = card.querySelector('[data-reset]');
  const form = card.querySelector('form');

  const timer = new Timer(display, pill);
  state.timers[cardId] = timer;

  if (startBtn) startBtn.addEventListener('click', () => timer.start());
  if (pauseBtn) pauseBtn.addEventListener('click', () => timer.pause());
  if (finishBtn) finishBtn.addEventListener('click', () => timer.finish());
  if (resetBtn) resetBtn.addEventListener('click', () => timer.reset());

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.submitting === 'true') return;
      form.dataset.submitting = 'true';
      const payload = buildPayload({ card, panel, cardId, timer });
      attachLotTransition(payload);
      const historyEntry = formatHistoryEntry(payload);
      try {
        const persistence = await persistPayload(payload);
        notifyPersistence(persistence);
        addHistory(panel, historyEntry);
        timer.finish();
        timer.reset();
        form.reset();
      } catch (err) {
        console.error('No se pudo enviar a Sheets', err);
        addHistory(panel, `${historyEntry} · Error al enviar`);
        showNotification(err?.message || 'No se pudo guardar', 'error');
      } finally {
        delete form.dataset.submitting;
      }
    });
  }
}

function buildPayload({ card, panel, cardId, timer }) {
  const shiftForm = document.getElementById('shiftForm');
  const shiftData = shiftForm ? Object.fromEntries(new FormData(shiftForm).entries()) : {};
  const form = card.querySelector('form');
  const formData = form ? Object.fromEntries(new FormData(form).entries()) : {};
  if (!formData.producto && shiftData.producto) {
    formData.producto = shiftData.producto;
  }
  if (!formData.producto1 && shiftData.producto) {
    formData.producto1 = shiftData.producto;
  }
  const envData = panel === 'fermenter' ? getFermenterEnv() : {};
  const now = new Date();
  const startIso = timer.startAt ? new Date(timer.startAt).toISOString() : '';
  const endIso = timer.endAt ? new Date(timer.endAt).toISOString() : new Date().toISOString();

  return {
    panel,
    unit: cardId,
    timestamp: now.toISOString(),
    shift: shiftData,
    form: formData,
    env: envData,
    timing: {
      start: startIso,
      end: endIso,
      durationMs: timer.durationMs(),
    },
  };
}

function getFermenterEnv() {
  const envForm = document.getElementById('fermenterEnv');
  if (!envForm) return {};
  return Object.fromEntries(new FormData(envForm).entries());
}

function resolveLotId(formData, shiftData) {
  return (
    formData?.lote ||
    formData?.lote1 ||
    formData?.lote2 ||
    formData?.lote3 ||
    shiftData?.dailyLot ||
    ''
  );
}

function attachLotTransition(payload) {
  if (!payload) return payload;
  const { panel, form, shift, timing } = payload;
  const lotId = resolveLotId(form || {}, shift || {});
  if (!lotId) return payload;

  const tracker = state.lotTracker[lotId] || {};
  const startIso = timing?.start;
  const endIso = timing?.end;

  const prevKeyMap = {
    mesa: 'mixerEnd',
    fermenter: 'mesaEnd',
    ovens: 'fermentEnd',
  };
  const currentKeyMap = {
    mixers: 'mixerEnd',
    mesa: 'mesaEnd',
    fermenter: 'fermentEnd',
    ovens: 'ovenEnd',
  };

  const prevKey = prevKeyMap[panel];
  const currentKey = currentKeyMap[panel];

  if (prevKey && tracker[prevKey] && startIso) {
    const deltaMs = new Date(startIso).getTime() - new Date(tracker[prevKey]).getTime();
    payload.transition = {
      from: prevKey.replace('End', ''),
      to: panel,
      fromEnd: tracker[prevKey],
      deltaMs,
      delta: formatDuration(Math.max(0, deltaMs)),
      lotId,
    };
  }

  if (currentKey && endIso) {
    tracker[currentKey] = endIso;
  }

  state.lotTracker[lotId] = tracker;
  return payload;
}

function buildMixerPayload({ card, cardId, stages, deadTimesMs }) {
  const shiftForm = document.getElementById('shiftForm');
  const shiftData = shiftForm ? Object.fromEntries(new FormData(shiftForm).entries()) : {};
  const form = card.querySelector('form');
  const formData = form ? Object.fromEntries(new FormData(form).entries()) : {};
  if (!formData.producto && shiftData.producto) {
    formData.producto = shiftData.producto;
  }
  const now = new Date();
  const stagePayload = stages.map((stage) => ({
    id: stage.id,
    start: stage.timer.startAt ? new Date(stage.timer.startAt).toISOString() : '',
    end: stage.timer.endAt ? new Date(stage.timer.endAt).toISOString() : '',
    durationMs: stage.timer.durationMs(),
  }));
  const startIso = stagePayload.find((s) => s.start)?.start || '';
  const endIso = [...stagePayload].reverse().find((s) => s.end)?.end || '';
  const machineTotalMs = stagePayload.reduce((acc, item) => acc + (item.durationMs || 0), 0);
  const deadTotalMs = deadTimesMs.reduce((acc, val) => acc + (val || 0), 0);
  const overallMs = machineTotalMs + deadTotalMs;

  const payload = {
    panel: 'mixers',
    unit: cardId,
    timestamp: now.toISOString(),
    shift: shiftData,
    form: formData,
    stages: stagePayload,
    deadTimesMs,
    totals: {
      machineTotalMs,
      deadTotalMs,
      overallMs,
    },
    timing: {
      start: startIso,
      end: endIso,
      durationMs: machineTotalMs,
    },
  };

  return payload;
}

async function sendToSheets(payload) {
  if (!API_URL || API_URL.includes('PASTE')) {
    console.warn('Define API_URL con la URL de despliegue de Apps Script.');
    return;
  }
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return { ok: true };
}

async function sendToBackend(payload) {
  if (!BACKEND_POST_URL) {
    console.warn('Define BACKEND_URL para habilitar el envío al backend.');
    return;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (BACKEND_API_KEY) {
    headers['x-api-key'] = BACKEND_API_KEY;
  }
  const response = await fetch(BACKEND_POST_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Backend ${response.status}: ${text || 'sin cuerpo'}`);
  }
  return response.json().catch(() => ({ ok: true }));
}

async function persistPayload(payload) {
  const result = { sheets: false, backend: false, errors: [] };
  try {
    await sendToSheets(payload);
    result.sheets = true;
  } catch (err) {
    result.errors.push(`Sheets: ${err?.message || err}`);
  }
  try {
    await sendToBackend(payload);
    result.backend = true;
  } catch (err) {
    result.errors.push(`Backend: ${err?.message || err}`);
  }
  if (!result.sheets && !result.backend) {
    throw new Error(result.errors.join(' | ') || 'No se pudo guardar');
  }
  return result;
}

function formatHistoryEntry(payload) {
  const { panel, unit, form, shift = {}, timing } = payload;
  const start = timing.start ? formatTime(timing.start) : 'sin inicio';
  const end = timing.end ? formatTime(timing.end) : 'sin fin';
  const duration = timing.durationMs ? formatDuration(timing.durationMs) : '00:00:00';
  const ovenLabel = [form.producto1, form.producto2, form.producto3]
    .filter(Boolean)
    .join(' / ');
  const label =
    form.producto || shift.producto || ovenLabel || form.tipoMasa || form.lote || form.lote1 || form.lote2 || form.lote3 || 'Sin etiqueta';
  const base = `${panel.toUpperCase()} · ${unit} · ${label} · ${start} - ${end} (${duration})`;
  if (payload.transition?.delta) {
    return `${base} · Δ ${payload.transition.delta}`;
  }
  return base;
}

function addHistory(panel, text) {
  const list = state.histories[panel];
  if (Array.isArray(list)) {
    list.unshift(text);
    state.histories[panel] = list.slice(0, 40);
  }
  renderHistory(panel);
}

function renderHistory(panel) {
  const container = document.querySelector(`[data-history="${panel}"]`);
  const entries = state.histories[panel] || [];
  if (!container) return;
  container.innerHTML = entries
    .map((entry) => `<div class="history-entry">${entry}</div>`)
    .join('');
}

function wireHistoryClears() {
  document.querySelectorAll('[data-clear-history]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-clear-history');
      state.histories[key] = [];
      renderHistory(key);
    });
  });
}

function formatDuration(ms = 0) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function wireResultsShortcut() {
  const button = document.getElementById('openResultsTab');
  if (!button) return;
  button.addEventListener('click', () => {
    activateTab('results');
    const panel = document.getElementById('resultsPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  const ss = date.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function setupResultsView() {
  const panel = document.getElementById('resultsPanel');
  if (!panel) return;
  const fromInput = document.getElementById('resultsFrom');
  const toInput = document.getElementById('resultsTo');
  const refreshBtn = document.getElementById('resultsRefresh');
  const chartBtn = document.getElementById('resultsChartRefresh');
  const panelSelect = document.getElementById('resultsPanelFilter');
  const metricSelect = document.getElementById('resultsMetric');
  const cardsBtn = document.getElementById('resultsShowCards');
  const chartsBtn = document.getElementById('resultsShowCharts');

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (fromInput && !fromInput.value) fromInput.value = weekAgo.toISOString().slice(0, 10);
  if (toInput && !toInput.value) toInput.value = today.toISOString().slice(0, 10);

  const reloadAll = () => {
    refreshResultsList();
    if (state.resultsMode === 'charts') {
      refreshControlChart();
    }
  };

  if (refreshBtn) refreshBtn.addEventListener('click', refreshResultsList);
  if (chartBtn) chartBtn.addEventListener('click', () => {
    setResultsMode('charts');
    refreshControlChart();
  });
  if (panelSelect) panelSelect.addEventListener('change', reloadAll);
  if (metricSelect) metricSelect.addEventListener('change', () => refreshControlChart());
  if (cardsBtn) cardsBtn.addEventListener('click', () => setResultsMode('cards'));
  if (chartsBtn) chartsBtn.addEventListener('click', () => setResultsMode('charts'));

  setResultsMode('cards');
  reloadAll();
}

function getResultsFilters() {
  const panel = document.getElementById('resultsPanelFilter');
  const fromInput = document.getElementById('resultsFrom');
  const toInput = document.getElementById('resultsTo');
  return {
    panel: panel ? panel.value : 'all',
    desde: fromInput?.value || '',
    hasta: toInput?.value || '',
  };
}

function setResultsMode(mode) {
  state.resultsMode = mode;
  document.querySelectorAll('[data-results-area]').forEach((area) => {
    area.classList.toggle('is-active', area.getAttribute('data-results-area') === mode);
  });
  const cardsBtn = document.getElementById('resultsShowCards');
  const chartsBtn = document.getElementById('resultsShowCharts');
  if (cardsBtn) cardsBtn.classList.toggle('is-active', mode === 'cards');
  if (chartsBtn) chartsBtn.classList.toggle('is-active', mode === 'charts');
  if (mode === 'charts') {
    refreshControlChart();
  }
}

async function refreshResultsList() {
  try {
    showResultsStatus('Cargando registros...');
    const filters = getResultsFilters();
    const [records, summary] = await Promise.all([
      loadBackendRecords(filters),
      loadSummaryMetrics(filters),
    ]);
    state.resultsRecords = records;
    renderResultsCards(records);
    renderSummaryCards(summary);
    showResultsStatus(records.length ? '' : 'Sin registros para los filtros seleccionados.');
  } catch (err) {
    console.error('Resultados · lista', err);
    showResultsStatus(`Error al cargar resultados: ${err?.message || err}`);
  }
}

async function refreshControlChart() {
  try {
    const filters = getResultsFilters();
    const metricSelect = document.getElementById('resultsMetric');
    const metric = metricSelect ? metricSelect.value : 'overallMs';
    showResultsStatus('Calculando gráfica de control...');
    const chartData = await loadControlChart(filters, metric);
    renderControlChart(chartData, metric);
    showResultsStatus('');
  } catch (err) {
    console.error('Resultados · chart', err);
    showResultsStatus(`Error al generar la gráfica: ${err?.message || err}`);
  }
}

async function loadBackendRecords(filters) {
  if (!BACKEND_BASE_URL) throw new Error('Backend no configurado');
  const params = new URLSearchParams();
  if (filters.panel && filters.panel !== 'all') params.set('panel', filters.panel);
  if (filters.desde) params.set('desde', filters.desde);
  if (filters.hasta) params.set('hasta', filters.hasta);
  params.set('take', '200');
  const url = `${BACKEND_BASE_URL}/registros?${params.toString()}`;
  const response = await fetch(url, { headers: buildBackendHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

async function loadSummaryMetrics(filters) {
  if (!BACKEND_BASE_URL) return null;
  const params = new URLSearchParams();
  if (filters.panel && filters.panel !== 'all') params.set('panel', filters.panel);
  const url = `${BACKEND_BASE_URL}/registros/metrics?${params.toString()}`;
  const response = await fetch(url, { headers: buildBackendHeaders() });
  if (!response.ok) return null;
  return response.json();
}

async function loadControlChart(filters, metric) {
  if (!BACKEND_BASE_URL) throw new Error('Backend no configurado');
  const params = new URLSearchParams();
  if (filters.panel && filters.panel !== 'all') params.set('panel', filters.panel);
  params.set('metric', metric || 'overallMs');
  const url = `${BACKEND_BASE_URL}/registros/control-chart?${params.toString()}`;
  const response = await fetch(url, { headers: buildBackendHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

function renderResultsCards(records = []) {
  const grid = document.getElementById('resultsCardGrid');
  if (!grid) return;
  if (!records.length) {
    grid.innerHTML = `
      <div class="result-card">
        <p class="eyebrow">Sin registros</p>
        <p>Ajusta los filtros o guarda un nuevo lote para ver tarjetas.</p>
      </div>`;
    return;
  }
  grid.innerHTML = records
    .map((row) => renderResultCard(row))
    .join('');
}

function renderResultCard(row) {
  const dateLabel = row.shiftDate ? new Date(row.shiftDate).toLocaleDateString('es-VE') : '--';
  const panelLabel = getPanelLabel(row.panel);
  const lotLabel = row.lotId || row.lote || row.data?.shift?.dailyLot || 'Sin lote';
  const observation = extractObservation(row);
  const variables = extractVariableBadges(row);
  return `
    <article class="result-card">
      <header>
        <div>
          <p class="eyebrow">${dateLabel}</p>
          <h3>${panelLabel} · ${row.unit}</h3>
        </div>
        <span class="result-chip">${lotLabel}</span>
      </header>
      <div class="result-metrics">
        <div><dt>Total</dt><dd>${formatDuration(row.overallMs || 0)}</dd></div>
        <div><dt>Máquina</dt><dd>${formatDuration(row.durationMs || 0)}</dd></div>
        <div><dt>Muertos</dt><dd>${formatDuration(row.deadMs || 0)}</dd></div>
      </div>
      <div class="result-meta">
        <div>
          <p class="eyebrow">Observaciones</p>
          <p>${observation}</p>
        </div>
        <div>
          <p class="eyebrow">Variables</p>
          <div class="result-variables">
            ${variables.map((text) => `<span>${text}</span>`).join('') || '<span>Sin variables registradas</span>'}
          </div>
        </div>
      </div>
    </article>
  `;
}

function extractObservation(row) {
  const form = row?.data?.form || {};
  const shift = row?.data?.shift || {};
  const env = row?.data?.env || {};
  return (
    form.notas ||
    form.observaciones ||
    shift.shiftNotes ||
    env.notas ||
    'Sin observaciones registradas.'
  );
}

function extractVariableBadges(row) {
  const values = [];
  const ignore = new Set(['notas', 'observaciones', 'timestamp', 'unit', 'panel']);
  const collect = (obj, prefix = '') => {
    if (!obj) return;
    Object.entries(obj).forEach(([key, value]) => {
      if (ignore.has(key) || value === '' || value === null || typeof value === 'object') return;
      const label = prefix ? `${prefix} ${humanizeKey(key)}` : humanizeKey(key);
      values.push(`${label}: ${value}`);
    });
  };
  collect(row?.data?.shift, 'Turno');
  collect(row?.data?.form);
  collect(row?.data?.env, 'Cámara');
  return values.slice(0, 10);
}

function getPanelLabel(panel) {
  const map = {
    mixers: 'Amasadora',
    mesa: 'Mesa',
    fermenter: 'Fermentadora',
    ovens: 'Horno',
  };
  return map[panel] || panel || 'Proceso';
}

function humanizeKey(key = '') {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function renderSummaryCards(summary) {
  if (!summary) return;
  const apply = (key, metric) => {
    const avgEl = document.querySelector(`[data-summary="${key}-avg"]`);
    const minEl = document.querySelector(`[data-summary="${key}-min"]`);
    const maxEl = document.querySelector(`[data-summary="${key}-max"]`);
    if (avgEl) avgEl.textContent = metric?.avg ? formatDuration(metric.avg) : '—';
    if (minEl) minEl.textContent = metric?.min ? formatDuration(metric.min) : '—';
    if (maxEl) maxEl.textContent = metric?.max ? formatDuration(metric.max) : '—';
  };
  apply('duration', summary.duration);
  apply('dead', summary.dead);
  apply('overall', summary.overall);
  const countEl = document.querySelector('[data-summary="count"]');
  if (countEl) countEl.textContent = summary.count ?? '0';
}

function renderControlChart(data, metric) {
  const canvas = document.getElementById('controlChart');
  if (!canvas || !window.Chart) return;
  if (!data || !Array.isArray(data.points) || !data.points.length) {
    if (state.controlChart) {
      state.controlChart.destroy();
      state.controlChart = null;
    }
    const foot = document.getElementById('chartFootnote');
    if (foot) foot.textContent = 'Sin datos para graficar.';
    return;
  }
  const labels = data.points.map((point, index) => {
    if (point.shiftDate) {
      return new Date(point.shiftDate).toLocaleDateString('es-VE');
    }
    return `#${point.id || index + 1}`;
  });
  const values = data.points.map((point) => msToMinutes(point.value));
  const cl = msToMinutes(data.centerLine || 0);
  const ucl = msToMinutes(data.ucl || 0);
  const lcl = msToMinutes(data.lcl || 0);
  if (state.controlChart) {
    state.controlChart.destroy();
  }
  const datasets = [
    {
      label: 'Valores',
      data: values,
      borderColor: '#f5aa2c',
      backgroundColor: 'rgba(245, 170, 44, 0.15)',
      tension: 0.2,
      pointRadius: 4,
      pointBackgroundColor: data.points.map((pt) => (pt.outOfControl ? '#f36c60' : '#f5aa2c')),
    },
    {
      label: 'UCL',
      data: new Array(values.length).fill(ucl),
      borderColor: '#f36c60',
      borderDash: [6, 6],
      pointRadius: 0,
    },
    {
      label: 'CL',
      data: new Array(values.length).fill(cl),
      borderColor: '#94a0b5',
      borderDash: [4, 4],
      pointRadius: 0,
    },
    {
      label: 'LCL',
      data: new Array(values.length).fill(lcl),
      borderColor: '#46c172',
      borderDash: [6, 6],
      pointRadius: 0,
    },
  ];

  state.controlChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label(context) {
              if (context.datasetIndex === 0) {
                return `Valor: ${context.formattedValue} min`;
              }
              return `${context.dataset.label}: ${context.formattedValue} min`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Minutos' },
        },
      },
    },
  });

  const foot = document.getElementById('chartFootnote');
  if (foot) {
    const metricLabel = metric === 'durationMs' ? 'Duración máquina' : metric === 'deadMs' ? 'Tiempos muertos' : 'Total general';
    foot.textContent = `${metricLabel} · CL ${cl.toFixed(2)} min · UCL ${ucl.toFixed(2)} min · LCL ${lcl.toFixed(2)} min (n=${data.count})`;
  }
}

function msToMinutes(ms = 0) {
  return Number(ms || 0) / 60000;
}

function buildBackendHeaders() {
  const headers = {};
  if (BACKEND_API_KEY) {
    headers['x-api-key'] = BACKEND_API_KEY;
  }
  return headers;
}

function showResultsStatus(message) {
  const statusEl = document.getElementById('resultsStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
}

function notifyPersistence(status) {
  if (!status) return;
  const successTargets = [];
  if (status.sheets) successTargets.push('Sheets');
  if (status.backend) successTargets.push('BD');
  let type = 'success';
  if (successTargets.length === 1) type = 'warning';
  const successMessage = successTargets.length
    ? `Guardado en ${successTargets.join(' y ')}`
    : 'Guardado parcial';
  showNotification(successMessage, type, 5000);
  if (status.errors?.length) {
    showNotification(status.errors.join(' | '), 'warning', 6000);
  }
}

function showNotification(message, type = 'info', duration = 4000) {
  const stack = document.getElementById('appNotifications');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = `notification notification--${type}`;
  item.innerHTML = `<span>${message}</span><button type="button" aria-label="Cerrar">×</button>`;
  stack.appendChild(item);

  const remove = () => {
    if (item.parentElement) {
      item.parentElement.removeChild(item);
    }
  };
  item.querySelector('button').addEventListener('click', remove);
  if (duration > 0) {
    setTimeout(remove, duration);
  }
}
