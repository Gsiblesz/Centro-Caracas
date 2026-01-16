'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycby0lPYSvoSdZNqH1mKzP3ugUr0i-YfZaQjNm9JOJ20Xs6SL-csNXo5VfcnkS3dWm_gK/exec';

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
};

document.addEventListener('DOMContentLoaded', () => {
  setupLockScreen();
  setShiftDefaults();
  setupDailyLotPropagation();
  setupTabs();
  setupStaticCards();
  setupFermenter();
  wireHistoryClears();
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
    const value = (input?.value || '').trim();
    if (value && value.toLowerCase() === KEY) {
      lock.setAttribute('hidden', 'true');
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
  const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-tab-target');
      buttons.forEach((b) => b.classList.toggle('is-active', b === button));
      panels.forEach((panel) => {
        const key = panel.getAttribute('data-tab-panel');
        panel.classList.toggle('is-active', key === target);
      });
    });
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

    if (startBtn) {
      startBtn.addEventListener('click', () => {
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
        await sendToSheets(payload);
        addHistory('mixers', historyEntry);
        resetStageDisplays();
        form.reset();
        setupDailyLotPropagation();
      } catch (err) {
        console.error('No se pudo enviar a Sheets', err);
        addHistory('mixers', `${historyEntry} · Error al enviar`);
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
        await sendToSheets(payload);
        addHistory(panel, historyEntry);
        timer.finish();
        timer.reset();
        form.reset();
      } catch (err) {
        console.error('No se pudo enviar a Sheets', err);
        addHistory(panel, `${historyEntry} · Error al enviar`);
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

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  const ss = date.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
