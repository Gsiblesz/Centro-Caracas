const SPREADSHEET_ID = '1FJqnYbVdQZsxSW_q7yRjBCBYzVSofUZBKiTQfWkBdHs';

const SHEET_MAPPING = {
  mixers: 'Amasadoras',
  mesa: 'Mesa',
  fermenter: 'Fermentadora',
  ovens: 'Hornos',
};

const SUMMARY_SHEET = 'Resumen';
const SUMMARY_HEADERS = [
  'Timestamp',
  'Fecha',
  'Panel',
  'Unidad',
  'Lote diario',
  'Producto',
  'Duracion ms',
  'Total proceso ms',
  'Delta ms desde anterior',
  'Delta origen',
  'Delta destino',
  'Notas',
];

const SHEET_SCHEMAS = {
  mixers: {
    headers: [
      'Timestamp',
      'Fecha',
      'Panel',
      'Equipo',
      'Lote diario',
      'Producto',
      'Hielo',
      'Tipo masa',
      'Temp masa',
      'Peso masa',
      'Temp ambiente',
      'Humedad ambiente',
      'Responsable',
      'Notas turno',
      'Inicio',
      'Fin',
      'Duracion ms',
      'Duracion esponja ms',
      'Duracion masa ms',
      'Duracion mantequilla ms',
      'Dead 1 ms',
      'Dead 2 ms',
      'Dead total ms',
      'Total maquina ms',
      'Total proceso ms',
      'Delta ms desde anterior',
      'Delta origen',
      'Delta destino',
      'Notas proceso',
    ],
    buildRow: buildMixerRow,
  },
  mesa: {
    headers: [
      'Timestamp',
      'Fecha',
      'Panel',
      'Mesa',
      'Lote diario',
      'Producto',
      'Personas min',
      'Personas max',
      'Temp ambiente',
      'Humedad ambiente',
      'Responsable',
      'Notas turno',
      'Inicio',
      'Fin',
      'Duracion ms',
      'Delta ms desde anterior',
      'Delta origen',
      'Delta destino',
      'Notas proceso',
    ],
    buildRow: buildMesaRow,
  },
  fermenter: {
    headers: [
      'Timestamp',
      'Fecha',
      'Panel',
      'Lote diario',
      'Producto',
      'Temp camara',
      'Humedad camara',
      'Temp ambiente',
      'Humedad ambiente',
      'Responsable',
      'Notas turno',
      'Inicio',
      'Fin',
      'Duracion ms',
      'Delta ms desde anterior',
      'Delta origen',
      'Delta destino',
      'Notas proceso',
    ],
    buildRow: buildFermenterRow,
  },
  ovens: {
    headers: [
      'Timestamp',
      'Fecha',
      'Panel',
      'Horno',
      'Lote diario',
      'Producto',
      'Temp horno',
      'Temp ambiente',
      'Humedad ambiente',
      'Responsable',
      'Notas turno',
      'Inicio',
      'Fin',
      'Duracion ms',
      'Delta ms desde anterior',
      'Delta origen',
      'Delta destino',
      'Notas proceso',
    ],
    buildRow: buildOvenRow,
  },
};

function doGet() {
  return buildResponse(200, { ok: true });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const panelKey = getPanelKey(payload);
    const sheetName = resolveSheet(panelKey);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const summarySheet = ss.getSheetByName(SUMMARY_SHEET) || ss.insertSheet(SUMMARY_SHEET, 0);
    ensureHeaders(summarySheet, SUMMARY_HEADERS);
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const schema = SHEET_SCHEMAS[panelKey] || SHEET_SCHEMAS.mixers;
    ensureHeaders(sheet, schema.headers);
    const row = schema.buildRow(payload);
    sheet.appendRow(row);
    const summaryRow = buildSummaryRow(payload);
    summarySheet.appendRow(summaryRow);
    return buildResponse(200, { ok: true });
  } catch (err) {
    return buildResponse(500, { ok: false, error: err.message });
  }
}

function resolveSheet(panelKey) {
  return SHEET_MAPPING[panelKey] || 'General';
}

function getPanelKey(payload) {
  const key = payload && payload.panel;
  return SHEET_SCHEMAS[key] ? key : 'mixers';
}

function ensureHeaders(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = firstRow.join('') === '';
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function buildSummaryRow(payload) {
  const { shift = {}, form = {}, timing = {}, totals = {}, transition = {} } = payload || {};
  const product = form.producto || form.producto1 || shift.producto || '';
  const totalProceso = totals.overallMs || totals.machineTotalMs || timing.durationMs || '';
  return [
    safeValue(payload && payload.timestamp),
    safeValue(shift.shiftDate),
    safeValue(payload && payload.panel),
    safeValue(payload && (payload.unit || form.equipo || form.mesaSeleccion || form.horno)),
    safeValue(shift.dailyLot),
    safeValue(product),
    msToHms(timing.durationMs),
    msToHms(totalProceso),
    msToHms(transition.deltaMs),
    safeValue(transition.from),
    safeValue(transition.to),
    safeValue(form.notas),
  ];
}

function buildMixerRow(payload) {
  const { shift = {}, form = {}, timing = {}, stages = [], deadTimesMs = [], totals = {}, transition = {} } = payload;
  const stageDuration = (id) => {
    const stage = stages.find((s) => s.id === id);
    return stage ? msToHms(stage.durationMs) : '';
  };
  const dead1 = msToHms(deadTimesMs[0]);
  const dead2 = msToHms(deadTimesMs[1]);
  const deadTotal = msToHms(totals.deadTotalMs || totals.deadTotal || '');
  return [
    safeValue(payload.timestamp),
    safeValue(shift.shiftDate),
    'mixers',
    safeValue(payload.unit || form.equipo),
    safeValue(shift.dailyLot),
    safeValue(form.producto || shift.producto),
    safeValue(form.hielo),
    safeValue(form.tipoMasa),
    safeValue(form.tempMasa),
    safeValue(form.pesoMasa),
    safeValue(shift.ambientTemp),
    safeValue(shift.ambientHumidity),
    safeValue(shift.responsable),
    safeValue(shift.shiftNotes),
    safeValue(timing.start),
    safeValue(timing.end),
    msToHms(timing.durationMs),
    stageDuration('sponge'),
    stageDuration('dough'),
    stageDuration('butter'),
    dead1,
    dead2,
    deadTotal,
    msToHms(totals.machineTotalMs),
    msToHms(totals.overallMs),
    msToHms(transition.deltaMs),
    safeValue(transition.from),
    safeValue(transition.to),
    safeValue(form.notas),
  ];
}

function buildMesaRow(payload) {
  const { shift = {}, form = {}, timing = {}, transition = {} } = payload;
  return [
    safeValue(payload.timestamp),
    safeValue(shift.shiftDate),
    'mesa',
    safeValue(form.mesaSeleccion || payload.unit),
    safeValue(shift.dailyLot),
    safeValue(form.producto || shift.producto),
    safeValue(form.personasMin),
    safeValue(form.personasMax),
    safeValue(shift.ambientTemp),
    safeValue(shift.ambientHumidity),
    safeValue(shift.responsable),
    safeValue(shift.shiftNotes),
    safeValue(timing.start),
    safeValue(timing.end),
    msToHms(timing.durationMs),
    msToHms(transition.deltaMs),
    safeValue(transition.from),
    safeValue(transition.to),
    safeValue(form.notas),
  ];
}

function buildFermenterRow(payload) {
  const { shift = {}, form = {}, timing = {}, env = {}, transition = {} } = payload;
  return [
    safeValue(payload.timestamp),
    safeValue(shift.shiftDate),
    'fermenter',
    safeValue(shift.dailyLot),
    safeValue(form.producto || shift.producto),
    safeValue(env.tempCamara),
    safeValue(env.humedadCamara),
    safeValue(shift.ambientTemp),
    safeValue(shift.ambientHumidity),
    safeValue(shift.responsable),
    safeValue(shift.shiftNotes),
    safeValue(timing.start),
    safeValue(timing.end),
    msToHms(timing.durationMs),
    msToHms(transition.deltaMs),
    safeValue(transition.from),
    safeValue(transition.to),
    safeValue(form.notas),
  ];
}

function buildOvenRow(payload) {
  const { shift = {}, form = {}, timing = {}, transition = {} } = payload;
  return [
    safeValue(payload.timestamp),
    safeValue(shift.shiftDate),
    'ovens',
    safeValue(form.horno || payload.unit),
    safeValue(shift.dailyLot),
    safeValue(form.producto1 || shift.producto),
    safeValue(form.tempHorno),
    safeValue(shift.ambientTemp),
    safeValue(shift.ambientHumidity),
    safeValue(shift.responsable),
    safeValue(shift.shiftNotes),
    safeValue(timing.start),
    safeValue(timing.end),
    msToHms(timing.durationMs),
    msToHms(transition.deltaMs),
    safeValue(transition.from),
    safeValue(transition.to),
    safeValue(form.notas),
  ];
}

function safeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return value;
}

function msToHms(ms) {
  if (!ms && ms !== 0) return '';
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

function buildResponse(status, body) {
  const output = ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  if (typeof output.setResponseCode === 'function') {
    output.setResponseCode(status);
  }
  return output;
}