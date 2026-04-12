import { getDb, json, parseJson, sanitizeSingleLine } from "../../_lib/comments-utils.js";
import {
  buildNotionSyncStatePayload,
  dispatchNotionSync,
  getNotionSyncConfig,
  getNotionSyncState,
  markNotionSyncFinished,
  markNotionSyncTriggered,
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
    const config = getNotionSyncConfig(context.env);
    const started = await tryStartNotionSync(db, {
      source,
      triggeredBy: source,
    });

    if (!started.ok) {
      return json(
        {
          ok: false,
          message: "A notion sync is already in progress.",
          item: buildNotionSyncStatePayload(started.state, context.env).item,
        },
        409,
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
            ? `Auto sync trigger accepted. Interval target: ${config.autoIntervalMinutes} minutes.`
            : "Sync trigger accepted. Waiting for completion report.",
        responseText: trigger.responseText,
        deploymentUrl: trigger.deploymentUrl,
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
