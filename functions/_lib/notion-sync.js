import { json, nowIso, sanitizeSingleLine } from "./comments-utils.js";

const SYNC_STATUS_IDLE = "idle";
const SYNC_STATUS_SYNCING = "syncing";

const SYNC_RESULT_IDLE = "idle";
const SYNC_RESULT_TRIGGERED = "triggered";
const SYNC_RESULT_SUCCESS = "success";
const SYNC_RESULT_FAILED = "failed";
const SYNC_RESULT_SKIPPED = "skipped";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

function buildRunId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

function safeLower(value) {
  return sanitizeSingleLine(value || "", 120).toLowerCase();
}

function parseDatabaseId(value) {
  const input = sanitizeSingleLine(value || "", 400);
  if (!input) {
    return "";
  }

  const hyphenated = input.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (hyphenated) {
    return hyphenated[0].toLowerCase();
  }

  const compact = input.match(/[0-9a-fA-F]{32}/);
  if (!compact) {
    return "";
  }

  const raw = compact[0].toLowerCase();
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
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
    last_deployment_id: sanitizeSingleLine(row?.last_deployment_id || "", 120),
    last_deployment_status: sanitizeSingleLine(row?.last_deployment_status || "", 40),
    last_known_fingerprint: row?.last_known_fingerprint || "",
    last_deployed_fingerprint: row?.last_deployed_fingerprint || "",
    pending_fingerprint: row?.pending_fingerprint || "",
    updated_at: row?.updated_at || "",
  };
}

async function getExistingColumns(db) {
  const result = await db.prepare("PRAGMA table_info(notion_sync_state)").all();
  return new Set((result.results || []).map((row) => String(row.name || "")));
}

async function ensureColumn(db, existing, name, definition) {
  if (existing.has(name)) {
    return;
  }
  await db.prepare(`ALTER TABLE notion_sync_state ADD COLUMN ${name} ${definition}`).run();
  existing.add(name);
}

async function updateState(db, updates = {}) {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return getNotionSyncState(db);
  }

  const clauses = [];
  const values = [];
  for (const [key, value] of entries) {
    clauses.push(`${key} = ?`);
    values.push(value);
  }
  clauses.push("updated_at = ?");
  values.push(nowIso());

  await db
    .prepare(`UPDATE notion_sync_state SET ${clauses.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run();

  return getNotionSyncState(db);
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
          last_deployment_id TEXT,
          last_deployment_status TEXT,
          last_known_fingerprint TEXT,
          last_deployed_fingerprint TEXT,
          pending_fingerprint TEXT,
          updated_at TEXT NOT NULL
        )
      `,
    )
    .run();

  const existing = await getExistingColumns(db);
  await ensureColumn(db, existing, "last_deployment_id", "TEXT");
  await ensureColumn(db, existing, "last_deployment_status", "TEXT");
  await ensureColumn(db, existing, "last_known_fingerprint", "TEXT");
  await ensureColumn(db, existing, "last_deployed_fingerprint", "TEXT");
  await ensureColumn(db, existing, "pending_fingerprint", "TEXT");

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

export function getNotionSyncConfig(env) {
  return {
    triggerUrl: sanitizeSingleLine(env.NOTION_SYNC_TRIGGER_URL || "", 500),
    triggerToken: sanitizeSingleLine(env.NOTION_SYNC_TRIGGER_TOKEN || "", 500),
    reportToken: sanitizeSingleLine(env.NOTION_SYNC_REPORT_TOKEN || "", 500),
    autoIntervalMinutes: Math.max(1, Number.parseInt(String(env.NOTION_SYNC_AUTO_INTERVAL_MINUTES || "10"), 10) || 10),
    pagesAccountId: sanitizeSingleLine(env.CLOUDFLARE_ACCOUNT_ID || "", 120),
    pagesProjectName: sanitizeSingleLine(env.CLOUDFLARE_PAGES_PROJECT_NAME || "", 160),
    pagesApiToken: sanitizeSingleLine(env.CLOUDFLARE_PAGES_API_TOKEN || "", 500),
    notionToken: sanitizeSingleLine(env.NOTION_TOKEN || "", 500),
    notionDatabaseUrl: sanitizeSingleLine(env.NOTION_DATABASE_URL || "", 500),
    notionSitePageUrl: sanitizeSingleLine(env.NOTION_SITE_PAGE_URL || env.NOTION_DATABASE_PUBLIC_URL || "", 500),
    notionDatabaseId:
      parseDatabaseId(env.NOTION_DATABASE_ID || "") || parseDatabaseId(env.NOTION_DATABASE_URL || ""),
  };
}

function canQueryPagesStatus(config) {
  return Boolean(config.pagesAccountId && config.pagesProjectName && config.pagesApiToken);
}

async function requestPagesApi(config, pathname) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.pagesAccountId)}/pages/projects/${encodeURIComponent(config.pagesProjectName)}${pathname}`,
    {
      headers: {
        authorization: `Bearer ${config.pagesApiToken}`,
        "content-type": "application/json",
      },
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `Cloudflare Pages API failed with HTTP ${response.status}.`);
  }

  return payload?.result ?? null;
}

function parseIsoTime(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function extractDeploymentStatus(deployment) {
  const latestStage = deployment?.latest_stage || {};
  const status = safeLower(latestStage.status || deployment?.latest_stage?.name || deployment?.stage || deployment?.status);

  if (!status) {
    return {
      status: "unknown",
      terminal: false,
      success: false,
      message: "Waiting for Cloudflare deployment status.",
    };
  }

  if (["success", "completed", "active"].includes(status)) {
    return {
      status,
      terminal: true,
      success: true,
      message: "Cloudflare Pages deployment completed successfully.",
    };
  }

  if (status.includes("fail") || status.includes("error") || status.includes("cancel")) {
    return {
      status,
      terminal: true,
      success: false,
      message: "Cloudflare Pages deployment failed.",
    };
  }

  return {
    status,
    terminal: false,
    success: false,
    message: `Cloudflare Pages deployment is ${status}.`,
  };
}

function extractDeploymentUrl(deployment) {
  return sanitizeSingleLine(deployment?.url || deployment?.aliases?.[0] || "", 500);
}

function extractDeploymentId(deployment) {
  return sanitizeSingleLine(deployment?.id || deployment?.deployment_id || deployment?.short_id || "", 160);
}

async function findMatchingDeployment(config, state) {
  if (!canQueryPagesStatus(config)) {
    return null;
  }

  if (state.last_deployment_id) {
    try {
      return await requestPagesApi(config, `/deployments/${encodeURIComponent(state.last_deployment_id)}`);
    } catch {
      // fall through to list lookup
    }
  }

  const deployments = await requestPagesApi(config, "/deployments?per_page=10");
  const rows = Array.isArray(deployments) ? deployments : [];
  const startedAt = parseIsoTime(state.last_started_at);
  const floor = startedAt ? startedAt - 3 * 60 * 1000 : 0;

  const matched =
    rows.find((item) => parseIsoTime(item?.created_on || item?.modified_on) >= floor) ||
    rows[0] ||
    null;

  return matched;
}

async function requestNotionDatabaseQuery(config, body) {
  if (!config.notionToken || !config.notionDatabaseId) {
    throw new Error("Notion API config is incomplete.");
  }

  const response = await fetch(`${NOTION_API_BASE}/databases/${encodeURIComponent(config.notionDatabaseId)}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Notion API query failed with HTTP ${response.status}.`);
  }

  return payload;
}

async function queryAllPublishedNotionPages(config, body = {}) {
  const results = [];
  let nextCursor = "";

  do {
    const payload = await requestNotionDatabaseQuery(config, {
      page_size: 100,
      ...body,
      start_cursor: nextCursor || undefined,
    });

    results.push(...(Array.isArray(payload?.results) ? payload.results : []));
    nextCursor = payload?.has_more ? String(payload?.next_cursor || "") : "";
  } while (nextCursor);

  return results;
}

async function requestNotion(config, pathname, { method = "GET", body } = {}) {
  if (!config.notionToken) {
    throw new Error("Notion API config is incomplete.");
  }

  const response = await fetch(`${NOTION_API_BASE}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${config.notionToken}`,
      "Notion-Version": NOTION_API_VERSION,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Notion API request failed with HTTP ${response.status}.`);
  }

  return payload;
}

function extractNotionCoverUrl(cover) {
  if (!cover) {
    return "";
  }

  if (cover.type === "external") {
    return sanitizeSingleLine(cover.external?.url || "", 500);
  }

  if (cover.type === "file") {
    return sanitizeSingleLine(cover.file?.url || "", 500);
  }

  return "";
}

function parseAllNotionIds(input) {
  const value = sanitizeSingleLine(input || "", 500);
  if (!value) {
    return [];
  }

  const matches = value.match(/[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g) || [];
  return [...new Set(matches.map((item) => parseDatabaseId(item)).filter(Boolean))];
}

function notionRichTextToPlainText(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.plain_text || ""))
    .join("")
    .trim();
}

function extractNotionTitleFromSearchPage(page = {}) {
  const properties = page?.properties || {};
  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return notionRichTextToPlainText(value.title || []);
    }
  }
  return "";
}

async function fetchPublicNotionCover(config, url) {
  const href = sanitizeSingleLine(url || "", 500);
  if (!href || !/^https?:\/\//i.test(href)) {
    return "";
  }

  try {
    const response = await fetch(href, {
      headers: {
        "user-agent": "HoraFeng-NotionSyncCheck/1.0 (+https://horafeng.top)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const matched =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i);

    return sanitizeSingleLine(matched?.[1] || "", 500);
  } catch {
    return "";
  }
}

async function retrieveNotionSiteShellPage(config, databaseMeta = {}) {
  const candidateIds = [
    sanitizeSingleLine(databaseMeta?.parent?.page_id || "", 120),
    ...parseAllNotionIds(config.notionDatabaseUrl),
    config.notionDatabaseId,
  ].filter(Boolean);
  const uniqueCandidateIds = [...new Set(candidateIds)];

  for (const pageId of uniqueCandidateIds) {
    try {
      const pageMeta = await requestNotion(config, `/pages/${encodeURIComponent(pageId)}`);
      if (pageMeta?.id) {
        return pageMeta;
      }
    } catch {
      // Ignore and continue to the next candidate.
    }
  }

  const title = notionRichTextToPlainText(databaseMeta?.title || []);
  if (!title) {
    return {};
  }

  try {
    const payload = await requestNotion(config, "/search", {
      method: "POST",
      body: {
        query: title,
        filter: {
          property: "object",
          value: "page",
        },
      },
    });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const matched =
      results.find((page) => extractNotionTitleFromSearchPage(page) === title) ||
      results.find((page) => extractNotionTitleFromSearchPage(page).includes(title)) ||
      results[0];

    return matched?.id ? matched : {};
  } catch {
    return {};
  }
}

async function resolveNotionSiteShellCover(config, databaseMeta = {}, siteShellPage = {}) {
  const apiCover = extractNotionCoverUrl(siteShellPage?.cover) || extractNotionCoverUrl(databaseMeta?.cover);
  if (apiCover) {
    return apiCover;
  }

  const candidates = [
    config.notionSitePageUrl,
    sanitizeSingleLine(databaseMeta?.public_url || "", 500),
    sanitizeSingleLine(siteShellPage?.public_url || "", 500),
  ].filter(Boolean);

  for (const url of [...new Set(candidates)]) {
    const cover = await fetchPublicNotionCover(config, url);
    if (cover) {
      return cover;
    }
  }

  return "";
}

export async function getNotionFingerprint(env) {
  const config = getNotionSyncConfig(env);
  const [rows, databaseMeta] = await Promise.all([
    queryAllPublishedNotionPages(config, {
      filter: {
        property: "status",
        select: {
          equals: "published",
        },
      },
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending",
        },
      ],
    }),
    requestNotion(config, `/databases/${encodeURIComponent(config.notionDatabaseId)}`).catch(() => ({})),
  ]);

  const siteShellPage = await retrieveNotionSiteShellPage(config, databaseMeta);
  const siteShellCover = await resolveNotionSiteShellCover(config, databaseMeta, siteShellPage);
  const coverFingerprint = [
    sanitizeSingleLine(databaseMeta?.id || "", 120),
    sanitizeSingleLine(databaseMeta?.last_edited_time || "", 80),
    extractNotionCoverUrl(databaseMeta?.cover),
    sanitizeSingleLine(siteShellPage?.id || "", 120),
    sanitizeSingleLine(siteShellPage?.last_edited_time || "", 80),
    extractNotionCoverUrl(siteShellPage?.cover),
    siteShellCover,
  ]
    .filter(Boolean)
    .join(":");
  const signatures = rows.map((item) => `${item.id}:${item.last_edited_time || ""}`);
  const latestEditedAt = rows[0]?.last_edited_time || "";
  const fingerprint = [`count:${rows.length}`, ...signatures, coverFingerprint].filter(Boolean).join("|");

  return {
    fingerprint,
    latestEditedAt,
    count: rows.length,
  };
}

export async function reconcileNotionSyncState(db, env, existingState = null) {
  const state = existingState || (await getNotionSyncState(db));
  if (state.status !== SYNC_STATUS_SYNCING) {
    return state;
  }

  const config = getNotionSyncConfig(env);
  if (!canQueryPagesStatus(config)) {
    return state;
  }

  const deployment = await findMatchingDeployment(config, state);
  if (!deployment) {
    return state;
  }

  const deploymentId = extractDeploymentId(deployment);
  const deploymentUrl = extractDeploymentUrl(deployment);
  const deploymentInfo = extractDeploymentStatus(deployment);

  let nextState = state;
  if (deploymentId !== state.last_deployment_id || deploymentInfo.status !== state.last_deployment_status || deploymentUrl !== state.last_deployment_url) {
    nextState = await updateState(db, {
      last_deployment_id: deploymentId,
      last_deployment_status: deploymentInfo.status,
      last_deployment_url: deploymentUrl || state.last_deployment_url,
      last_checked_at: nowIso(),
      last_message: deploymentInfo.message,
    });
  }

  if (!deploymentInfo.terminal) {
    return nextState;
  }

  return markNotionSyncFinished(db, {
    runId: state.active_run_id,
    status: deploymentInfo.success ? SYNC_RESULT_SUCCESS : SYNC_RESULT_FAILED,
    message: deploymentInfo.message,
    finishedAt: deployment?.modified_on || deployment?.latest_stage?.ended_on || nowIso(),
    checkedAt: nowIso(),
    deploymentUrl,
    deploymentId,
    deploymentStatus: deploymentInfo.status,
  });
}

export async function recordNotionCheck(db, { fingerprint = "", message = "", result = SYNC_RESULT_IDLE } = {}) {
  return updateState(db, {
    last_checked_at: nowIso(),
    last_known_fingerprint: String(fingerprint || ""),
    last_message: String(message || "").slice(0, 500),
    last_result: result,
  });
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
  await updateState(db, {
    status: SYNC_STATUS_SYNCING,
    active_run_id: runId,
    last_requested_at: startedAt,
    last_started_at: startedAt,
    last_result: SYNC_RESULT_TRIGGERED,
    last_message: "Trigger created. Waiting for Cloudflare deployment.",
    last_source: sanitizeSingleLine(source, 24) || "manual",
    last_triggered_by: sanitizeSingleLine(triggeredBy, 120),
    last_trigger_response: "",
    last_deployment_url: "",
    last_deployment_id: "",
    last_deployment_status: "",
    pending_fingerprint: "",
  });

  return {
    ok: true,
    runId,
    state: await getNotionSyncState(db),
  };
}

export async function markNotionSyncTriggered(
  db,
  {
    runId = "",
    message = "",
    responseText = "",
    deploymentUrl = "",
    deploymentId = "",
    deploymentStatus = "",
    pendingFingerprint = "",
  } = {},
) {
  const current = await getNotionSyncState(db);
  if (runId && current.active_run_id && current.active_run_id !== runId) {
    return current;
  }

  return updateState(db, {
    status: SYNC_STATUS_SYNCING,
    last_result: SYNC_RESULT_TRIGGERED,
    last_message: message || "Sync trigger accepted. Waiting for deployment result.",
    last_trigger_response: String(responseText || "").slice(0, 1000),
    last_deployment_url: String(deploymentUrl || "").slice(0, 500),
    last_deployment_id: String(deploymentId || "").slice(0, 160),
    last_deployment_status: String(deploymentStatus || "").slice(0, 40),
    pending_fingerprint: String(pendingFingerprint || ""),
    last_checked_at: nowIso(),
  });
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
    deploymentId = "",
    deploymentStatus = "",
  } = {},
) {
  const current = await getNotionSyncState(db);
  if (runId && current.active_run_id && current.active_run_id !== runId) {
    return null;
  }

  const normalizedResult =
    status === SYNC_RESULT_FAILED ? SYNC_RESULT_FAILED : status === SYNC_RESULT_SKIPPED ? SYNC_RESULT_SKIPPED : SYNC_RESULT_SUCCESS;
  const endedAt = finishedAt || nowIso();
  const nextUpdates = {
    status: SYNC_STATUS_IDLE,
    active_run_id: "",
    last_finished_at: endedAt,
    last_checked_at: checkedAt || endedAt,
    last_result: normalizedResult,
    last_message: String(message || "").slice(0, 500),
    last_deployment_url: String(deploymentUrl || current.last_deployment_url || "").slice(0, 500),
    last_deployment_id: String(deploymentId || current.last_deployment_id || "").slice(0, 160),
    last_deployment_status: String(deploymentStatus || current.last_deployment_status || "").slice(0, 40),
    last_trigger_response: responseText ? String(responseText).slice(0, 1000) : current.last_trigger_response,
    pending_fingerprint: "",
  };

  if (normalizedResult === SYNC_RESULT_SUCCESS && current.pending_fingerprint) {
    nextUpdates.last_deployed_fingerprint = current.pending_fingerprint;
  }

  return updateState(db, nextUpdates);
}

export async function setNotionAutoSyncEnabled(db, enabled) {
  await ensureNotionSyncStateTable(db);
  return updateState(db, {
    auto_enabled: toBoolInt(Boolean(enabled)),
    last_message: `Auto sync ${enabled ? "enabled" : "disabled"} from admin panel.`,
  });
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

  let parsed = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  const deploymentId = sanitizeSingleLine(
    parsed?.result?.id || parsed?.result?.deployment_id || parsed?.deployment_id || parsed?.id || "",
    160,
  );
  const deploymentUrl = sanitizeSingleLine(parsed?.result?.url || parsed?.url || "", 500);
  const deploymentStatus = sanitizeSingleLine(parsed?.result?.latest_stage?.status || parsed?.status || "", 40);

  return {
    accepted: true,
    responseText: String(responseText || "").slice(0, 1000),
    deploymentId,
    deploymentUrl,
    deploymentStatus,
  };
}

export function buildNotionSyncStatePayload(state, env) {
  const config = getNotionSyncConfig(env);
  const autoEnabled = Boolean(state?.auto_enabled);
  return {
    ok: true,
    item: {
      ...state,
      auto_supported: true,
      auto_enabled: autoEnabled,
      auto_effective: autoEnabled,
      auto_interval_minutes: config.autoIntervalMinutes,
      trigger_configured: Boolean(config.triggerUrl),
      pages_status_configured: canQueryPagesStatus(config),
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
