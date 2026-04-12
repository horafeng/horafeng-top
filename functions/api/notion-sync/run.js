import { getDb, json, parseJson, sanitizeSingleLine } from "../../_lib/comments-utils.js";
import {
  buildNotionSyncStatePayload,
  dispatchNotionSync,
  getNotionFingerprint,
  getNotionSyncState,
  markNotionSyncFinished,
  markNotionSyncTriggered,
  reconcileNotionSyncState,
  recordNotionCheck,
  tryStartNotionSync,
} from "../../_lib/notion-sync.js";

function verifyRunnerToken(request, env) {
  const expected = sanitizeSingleLine(env.NOTION_SYNC_RUN_TOKEN || "", 500);
  if (!expected) {
    return json({ ok: false, message: "NOTION_SYNC_RUN_TOKEN is not configured." }, 500);
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = request.headers.get("x-notion-sync-run-token") || "";
  const received = bearer || headerToken;

  if (!received || received !== expected) {
    return json({ ok: false, message: "Invalid notion sync run token." }, 401);
  }

  return null;
}

export async function onRequestPost(context) {
  try {
    const authFailure = verifyRunnerToken(context.request, context.env);
    if (authFailure) {
      return authFailure;
    }

    const payload = await parseJson(context.request);
    const source = sanitizeSingleLine(payload?.source || "auto", 24) || "auto";
    const db = getDb(context.env);

    const reconciled = await reconcileNotionSyncState(db, context.env);
    if (reconciled.status === "syncing") {
      return json({
        ok: true,
        message: "A notion sync is already in progress.",
        item: buildNotionSyncStatePayload(reconciled, context.env).item,
      });
    }

    const currentState = await getNotionSyncState(db);
    if (source === "auto" && !currentState.auto_enabled) {
      const state = await recordNotionCheck(db, {
        fingerprint: currentState.last_known_fingerprint,
        message: "Auto sync is disabled. Scheduled check skipped.",
        result: "skipped",
      });

      return json({
        ok: true,
        message: "Auto sync is disabled.",
        item: buildNotionSyncStatePayload(state, context.env).item,
      });
    }

    const fingerprint = await getNotionFingerprint(context.env);
    const checkedState = await recordNotionCheck(db, {
      fingerprint: fingerprint.fingerprint,
      message: fingerprint.fingerprint
        ? `Notion check completed. Latest source update: ${fingerprint.latestEditedAt || "unknown"}.`
        : "Notion check completed. No published rows were found.",
      result: currentState.last_result,
    });

    if (source === "auto" && fingerprint.fingerprint && fingerprint.fingerprint === checkedState.last_deployed_fingerprint) {
      const skippedState = await markNotionSyncFinished(db, {
        status: "skipped",
        message: "No Notion content changes detected. Deployment skipped.",
        checkedAt: checkedState.last_checked_at,
      });

      return json({
        ok: true,
        message: "No changes detected.",
        item: buildNotionSyncStatePayload(skippedState, context.env).item,
      });
    }

    const started = await tryStartNotionSync(db, {
      source,
      triggeredBy: source,
    });

    if (!started.ok) {
      return json(
        {
          ok: true,
          message: "A notion sync is already in progress.",
          item: buildNotionSyncStatePayload(started.state, context.env).item,
        },
        200,
      );
    }

    try {
      const trigger = await dispatchNotionSync(context.env, {
        source,
        runId: started.runId,
        requestedAt: started.state.last_requested_at,
        requestedBy: source,
      });

      const state = await markNotionSyncTriggered(db, {
        runId: started.runId,
        message:
          source === "auto"
            ? "Auto sync triggered. Waiting for Cloudflare Pages deployment result."
            : "Sync trigger accepted. Waiting for Cloudflare Pages deployment result.",
        responseText: trigger.responseText,
        deploymentUrl: trigger.deploymentUrl,
        deploymentId: trigger.deploymentId,
        deploymentStatus: trigger.deploymentStatus,
        pendingFingerprint: fingerprint.fingerprint,
      });

      return json({
        ok: true,
        message: "Notion sync has been queued.",
        item: buildNotionSyncStatePayload(state, context.env).item,
      });
    } catch (error) {
      const state = await markNotionSyncFinished(db, {
        runId: started.runId,
        status: "failed",
        message: error.message || "Failed to trigger notion sync.",
      });

      return json(
        {
          ok: false,
          message: error.message || "Failed to trigger notion sync.",
          item: buildNotionSyncStatePayload(state || (await getNotionSyncState(db)), context.env).item,
        },
        500,
      );
    }
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to run notion sync." }, 500);
  }
}
