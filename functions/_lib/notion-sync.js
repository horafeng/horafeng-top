import { boolFromEnv, json, nowIso, sanitizeSingleLine } from "./comments-utils.js";

const SYNC_STATUS_IDLE = "idle";
const SYNC_STATUS_SYNCING = "syncing";
const SYNC_RESULT_IDLE = "idle";
const SYNC_RESULT_TRIGGERED = "triggered";
const SYNC_RESULT_SUCCESS = "success";
const SYNC_RESULT_FAILED = "failed";

function buildRunId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

function normalizeStateRow(row) {
  return {
    status: sanitizeSingleLine(row?.status || SYNC_STATUS_IDLE, 24) || SYNC_STATUS_IDLE,
    active_run_id: sanitizeSingleLine(row?.active_run_id || "", 80),
    auto_enabled: Number(row?.auto_enabled || 0) === 1,
    last_requested_at: row?.last_requested_at || "",
    last_started_at: row?.last_started_at || "",
    last_finished_at: row?.last_finished_at || "",
    last_checked_at: row?.last_checked_at || "",
    last_result: sanitizeSingleLine(row?.last_result || SYNC_RESULT_IDLE, 32) || SYNC_RESULT_IDLE,
    last_message: row?.last_message || "",
    last_source: sanitizeSingleLine(row?.last_source || "", 24),
    last_triggered_by: row?.last_triggered_by || "",
    last_trigger_response: row?.last_trigger_response || "",
    last_deployment_url: row?.last_deployment_url || "",
    updated_at: row?.updated_at || "",
  };
}

export async function ensureNotionSyncStateTable(db) {
  await db
    .prepare(
      `
        CREATE TABLE IF NOT EXISTS notion_sync_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL DEFAULT 'idle',
          active_run_id TEXT,
          auto_enabled INTEGER NOT NULL DEFAULT 0,
          last_requested_at TEXT,
          last_started_at TEXT,
          last_finished_at TEXT,
          last_checked_at TEXT,
          last_result TEXT NOT NULL DEFAULT 'idle',
          last_message TEXT,
          last_source TEXT,
          last_triggered_by TEXT,
          last_trigger_response TEXT,
          last_deployment_url TEXT,
          updated_at TEXT NOT NULL
        )
      `,
    )
    .run();

  await db
    .prepare(
      `
        INSERT OR IGNORE INTO notion_sync_state (
          id, status, auto_enabled, last_result, updated_at
        )
        VALUES (1, 'idle', 0, 'idle', ?)
      `,
    )
    .bind(nowIso())
    .run();
}

export async function getNotionSyncState(db) {
  await ensureNotionSyncStateTable(db);
  const row = await db.prepare("SELECT * FROM notion_sync_state WHERE id = 1 LIMIT 1").first();
  return normalizeStateRow(row);
}

export async function tryStartNotionSync(db, { source = "manual", triggeredBy = "" } = {}) {
  await ensureNotionSyncStateTable(db);

  const current = await getNotionSyncState(db);
  if (current.status === SYNC_STATUS_SYNCING) {
    return {
      ok: false,
      reason: "already_syncing",
      state: current,
    };
  }

  const startedAt = nowIso();
  const runId = buildRunId();
  const update = await db
    .prepare(
      `
        UPDATE notion_sync_state
        SET
          status = ?,
          active_run_id = ?,
          last_requested_at = ?,
          last_started_at = ?,
          last_result = ?,
          last_message = ?,
          last_source = ?,
          last_triggered_by = ?,
          last_trigger_response = '',
          last_deployment_url = '',
          updated_at = ?
        WHERE id = 1 AND status != ?
      `,
    )
    .bind(
      SYNC_STATUS_SYNCING,
      runId,
      startedAt,
      startedAt,
      SYNC_RESULT_TRIGGERED,
      "Trigger created. Waiting for sync pipeline result.",
      sanitizeSingleLine(source, 24) || "manual",
      sanitizeSingleLine(triggeredBy, 120),
      startedAt,
      SYNC_STATUS_SYNCING,
    )
    .run();

  if (!update.meta?.changes) {
    return {
      ok: false,
      reason: "already_syncing",
      state: await getNotionSyncState(db),
    };
  }

  return {
    ok: true,
    runId,
    state: await getNotionSyncState(db),
  };
}

export async function markNotionSyncTriggered(db, { runId, message = "", responseText = "", deploymentUrl = "" } = {}) {
  const updatedAt = nowIso();
  await ensureNotionSyncStateTable(db);
  await db
    .prepare(
      `
        UPDATE notion_sync_state
        SET
          status = ?,
          last_result = ?,
          last_message = ?,
          last_trigger_response = ?,
          last_deployment_url = ?,
          updated_at = ?
        WHERE id = 1 AND active_run_id = ?
      `,
    )
    .bind(
      SYNC_STATUS_SYNCING,
      SYNC_RESULT_TRIGGERED,
      message || "Sync trigger accepted. Waiting for completion report.",
      String(responseText || "").slice(0, 1000),
      String(deploymentUrl || "").slice(0, 500),
      updatedAt,
      runId,
    )
    .run();

  return getNotionSyncState(db);
}

export async function markNotionSyncFinished(
  db,
  {
    runId = "",
    status = SYNC_RESULT_SUCCESS,
    message = "",
    finishedAt = "",
    checkedAt = "",
    deploymentUrl = "",
    responseText = "",
  } = {},
) {
  await ensureNotionSyncStateTable(db);
  const normalizedResult = status === SYNC_RESULT_FAILED ? SYNC_RESULT_FAILED : SYNC_RESULT_SUCCESS;
  const normalizedStatus = normalizedResult === SYNC_RESULT_FAILED ? SYNC_STATUS_IDLE : SYNC_STATUS_IDLE;
  const endedAt = finishedAt || nowIso();
  const result = await db
    .prepare(
      `
        UPDATE notion_sync_state
        SET
          status = ?,
          active_run_id = '',
          last_finished_at = ?,
          last_checked_at = ?,
          last_result = ?,
          last_message = ?,
          last_deployment_url = CASE WHEN ? != '' THEN ? ELSE last_deployment_url END,
          last_trigger_response = CASE WHEN ? != '' THEN ? ELSE last_trigger_response END,
          updated_at = ?
        WHERE id = 1
          AND (? = '' OR active_run_id = ? OR active_run_id = '')
      `,
    )
    .bind(
      normalizedStatus,
      endedAt,
      checkedAt || endedAt,
      normalizedResult,
      String(message || "").slice(0, 500),
      String(deploymentUrl || ""),
      String(deploymentUrl || "").slice(0, 500),
      String(responseText || ""),
      String(responseText || "").slice(0, 1000),
      endedAt,
      runId,
      runId,
    )
    .run();

  if (!result.meta?.changes) {
    return null;
  }

  return getNotionSyncState(db);
}

export async function setNotionAutoSyncEnabled(db, enabled) {
  await ensureNotionSyncStateTable(db);
  const updatedAt = nowIso();
  await db
    .prepare("UPDATE notion_sync_state SET auto_enabled = ?, updated_at = ? WHERE id = 1")
    .bind(toBoolInt(Boolean(enabled)), updatedAt)
    .run();
  return getNotionSyncState(db);
}

export function getNotionSyncConfig(env) {
  return {
    triggerUrl: sanitizeSingleLine(env.NOTION_SYNC_TRIGGER_URL || "", 500),
    triggerToken: sanitizeSingleLine(env.NOTION_SYNC_TRIGGER_TOKEN || "", 500),
    reportToken: sanitizeSingleLine(env.NOTION_SYNC_REPORT_TOKEN || "", 500),
    autoEnabledByEnv: boolFromEnv(env.NOTION_SYNC_AUTO_ENABLED, false),
    autoIntervalMinutes: Math.max(1, Number.parseInt(String(env.NOTION_SYNC_AUTO_INTERVAL_MINUTES || "10"), 10) || 10),
  };
}

export async function dispatchNotionSync(env, { source = "manual", runId = "", requestedAt = "", requestedBy = "" } = {}) {
  const config = getNotionSyncConfig(env);
  if (!config.triggerUrl) {
    throw new Error("NOTION_SYNC_TRIGGER_URL is not configured.");
  }

  const siteBaseUrl = sanitizeSingleLine(env.SITE_BASE_URL || "", 500).replace(/\/+$/, "");

  const payload = {
    source: sanitizeSingleLine(source, 24) || "manual",
    run_id: runId,
    requested_at: requestedAt || nowIso(),
    requested_by: sanitizeSingleLine(requestedBy, 120),
    report_url: config.reportToken && siteBaseUrl ? `${siteBaseUrl}/api/notion-sync/report` : "",
    report_token: config.reportToken || "",
  };

  const headers = {};
  if (config.triggerToken) {
    headers.authorization = `Bearer ${config.triggerToken}`;
  }

  const response = await fetch(config.triggerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(responseText || `Trigger request failed with HTTP ${response.status}.`);
  }

  return {
    accepted: true,
    responseText: String(responseText || "").slice(0, 1000),
    deploymentUrl: "",
  };
}

export function buildNotionSyncStatePayload(state, env) {
  const config = getNotionSyncConfig(env);
  return {
    ok: true,
    item: {
      ...state,
      auto_supported: true,
      auto_enabled_by_env: config.autoEnabledByEnv,
      auto_interval_minutes: config.autoIntervalMinutes,
      trigger_configured: Boolean(config.triggerUrl),
    },
  };
}

export function verifyNotionSyncReport(request, env) {
  const expected = sanitizeSingleLine(env.NOTION_SYNC_REPORT_TOKEN || "", 500);
  if (!expected) {
    return json({ ok: false, message: "NOTION_SYNC_REPORT_TOKEN is not configured." }, 500);
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = request.headers.get("x-notion-sync-token") || "";
  const received = bearer || headerToken;

  if (!received || received !== expected) {
    return json({ ok: false, message: "Invalid notion sync report token." }, 401);
  }

  return null;
}
