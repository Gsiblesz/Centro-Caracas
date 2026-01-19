'use strict';

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const API_KEY = process.env.BACKEND_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const headerKey = req.get('x-api-key') || req.get('X-API-Key');
  if (headerKey && headerKey === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/registros', requireApiKey, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Payload inválido' });
    }
    const input = buildRegistroInput(req.body);
    const registro = await prisma.registro.create({ data: input });
    res.status(201).json(registro);
  } catch (error) {
    console.error('POST /registros error', error);
    res.status(500).json({ error: 'No se pudo guardar el registro' });
  }
});

app.get('/registros', requireApiKey, async (req, res) => {
  try {
    const { panel, lotId, desde, hasta, take, skip } = req.query;
    const where = {};
    if (panel) where.panel = panel;
    if (lotId) where.lotId = lotId;
    if (desde || hasta) {
      where.shiftDate = {};
      if (desde) where.shiftDate.gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) where.shiftDate.lte = new Date(`${hasta}T23:59:59.999Z`);
    }
    const registros = await prisma.registro.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    res.json(registros);
  } catch (error) {
    console.error('GET /registros error', error);
    res.status(500).json({ error: 'No se pudo listar registros' });
  }
});

app.delete('/registros', requireApiKey, async (_req, res) => {
  try {
    const result = await prisma.registro.deleteMany();
    res.json({ deleted: result.count });
  } catch (error) {
    console.error('DELETE /registros error', error);
    res.status(500).json({ error: 'No se pudieron borrar los registros' });
  }
});

app.delete('/registros/:id', requireApiKey, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const deleted = await prisma.registro.delete({ where: { id } });
    res.json({ deleted: deleted.id });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    console.error('DELETE /registros/:id error', error);
    res.status(500).json({ error: 'No se pudo borrar el registro' });
  }
});

app.get('/registros/control-chart', requireApiKey, async (req, res) => {
  try {
    const metric = sanitizeMetric(req.query.metric);
    const panel = req.query.panel || undefined;
    if (!metric) {
      return res.status(400).json({ error: 'Métrica inválida' });
    }
    const where = panel ? { panel } : {};
    const registros = await prisma.registro.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        panel: true,
        unit: true,
        lotId: true,
        shiftDate: true,
        createdAt: true,
        durationMs: true,
        deadMs: true,
        overallMs: true,
      },
    });
    const series = registros
      .map((reg) => buildMetricPoint(reg, metric))
      .filter((point) => typeof point.value === 'number');
    const payload = buildControlChartPayload(series);
    res.json({
      metric,
      panel: panel || 'all',
      count: payload.count,
      centerLine: payload.centerLine,
      ucl: payload.ucl,
      lcl: payload.lcl,
      stdDev: payload.stdDev,
      points: payload.points,
    });
  } catch (error) {
    console.error('GET /registros/control-chart error', error);
    res.status(500).json({ error: 'No se pudieron calcular las gráficas de control' });
  }
});

app.get('/registros/metrics', requireApiKey, async (req, res) => {
  try {
    const panel = req.query.panel || undefined;
    const where = panel ? { panel } : {};
    const registros = await prisma.registro.findMany({ where });
    const summary = buildSummaryMetrics(registros);
    res.json(summary);
  } catch (error) {
    console.error('GET /registros/metrics error', error);
    res.status(500).json({ error: 'No se pudieron calcular métricas' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Centro-Caracas backend listo en http://localhost:${PORT}`);
});

function buildRegistroInput(payload) {
  const panel = sanitizePanel(payload.panel);
  const unit = stringOrFallback(payload.unit || payload.cardId || payload.unitName, 'sin-unidad');
  const lote = resolveLote(payload);
  const lotId = payload.transition?.lotId || payload.shift?.dailyLot || lote || null;
  const shiftDate = parseShiftDate(payload.shift?.shiftDate || payload.shiftDate);
  const fechaTexto = payload.shift?.shiftDate || payload.fecha || null;
  const durationMs = resolveNumber(
    payload.timing?.durationMs ??
      payload.totals?.machineTotalMs ??
      (Array.isArray(payload.stages) ? payload.stages.reduce((acc, stage) => acc + resolveNumber(stage.durationMs), 0) : null),
  );
  const deadMs = resolveNumber(
    payload.totals?.deadTotalMs ??
      (Array.isArray(payload.deadTimesMs) ? payload.deadTimesMs.reduce((acc, ms) => acc + resolveNumber(ms), 0) : null),
  );
  const overallMs = resolveNumber(payload.totals?.overallMs ?? (durationMs || 0) + (deadMs || 0));

  return {
    panel,
    unit,
    lote,
    lotId,
    shiftDate,
    fechaTexto,
    durationMs,
    deadMs,
    overallMs,
    data: payload,
  };
}

function resolveLote(payload) {
  if (!payload) return null;
  const fields = [
    payload.form?.lote,
    payload.form?.lote1,
    payload.form?.lote2,
    payload.form?.lote3,
    payload.shift?.dailyLot,
    payload.shift?.lote,
  ];
  const value = fields.find((item) => typeof item === 'string' && item.trim().length);
  return value ? value.trim() : null;
}

function parseShiftDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const normalized = `${value}`.trim();
  if (!/\d{4}-\d{2}-\d{2}/.test(normalized)) return null;
  const iso = `${normalized}T00:00:00.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizePanel(panel) {
  const accepted = ['mixers', 'mesa', 'fermenter', 'ovens'];
  if (panel && accepted.includes(panel)) return panel;
  return panel ? `${panel}` : 'unknown';
}

function resolveNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function sanitizeMetric(value) {
  const allowed = ['durationMs', 'deadMs', 'overallMs'];
  if (!value) return 'overallMs';
  return allowed.includes(value) ? value : null;
}

function stringOrFallback(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function buildMetricPoint(registro, metric) {
  return {
    id: registro.id,
    lotId: registro.lotId,
    panel: registro.panel,
    unit: registro.unit,
    shiftDate: registro.shiftDate,
    createdAt: registro.createdAt,
    value: registro[metric] ?? null,
  };
}

function buildControlChartPayload(points) {
  if (!points.length) {
    return { count: 0, centerLine: null, ucl: null, lcl: null, stdDev: null, points: [] };
  }
  const values = points.map((p) => p.value);
  const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length > 1 ? values.length - 1 : 1);
  const stdDev = Math.sqrt(variance);
  const ucl = mean + 3 * stdDev;
  const lcl = Math.max(mean - 3 * stdDev, 0);
  const enhancedPoints = points.map((point) => ({
    ...point,
    outOfControl: point.value > ucl || point.value < lcl,
  }));
  return {
    count: points.length,
    centerLine: mean,
    ucl,
    lcl,
    stdDev,
    points: enhancedPoints,
  };
}

function buildSummaryMetrics(registros) {
  const base = { count: registros.length, duration: {}, dead: {}, overall: {} };
  const calc = (values) => {
    if (!values.length) return { avg: null, min: null, max: null };
    const sum = values.reduce((acc, val) => acc + val, 0);
    return { avg: sum / values.length, min: Math.min(...values), max: Math.max(...values) };
  };
  const durationVals = registros.map((r) => r.durationMs).filter((n) => typeof n === 'number');
  const deadVals = registros.map((r) => r.deadMs).filter((n) => typeof n === 'number');
  const overallVals = registros.map((r) => r.overallMs).filter((n) => typeof n === 'number');
  return {
    ...base,
    duration: calc(durationVals),
    dead: calc(deadVals),
    overall: calc(overallVals),
  };
}
