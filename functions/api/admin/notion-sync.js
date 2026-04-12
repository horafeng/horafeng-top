import { requireAdminSession } from "../../_lib/admin-auth.js";
import { getDb, json, parseJson } from "../../_lib/comments-utils.js";
import {
  buildNotionSyncStatePayload,
  dispatchNotionSync,
  getNotionFingerprint,
  getNotionSyncState,
  markNotionSyncFinished,
  markNotionSyncTriggered,
  reconcileNotionSyncState,
  setNotionAutoSyncEnabled,
  tryStartNotionSync,
} from "../../_lib/notion-sync.js";

async function ensureAdmin(context) {
  const db = getDb(context.env);
  const auth = await requireAdminSession({ db, request: context.request });
  if (!auth.ok) {
    return { db, failedResponse: auth.response };
  }
  return { db, failedResponse: null };
}

export async function onRequestGet(context) {
  try {
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const state = await reconcileNotionSyncState(db, context.env);
    return json(buildNotionSyncStatePayload(state, context.env));
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to load notion sync status." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { env } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    await reconcileNotionSyncState(db, env);

    const started = await tryStartNotionSync(db, {
      source: "manual",
      triggeredBy: "admin",
    });

    if (!started.ok) {
      return json(
        {
          ok: false,
          message: "A notion sync is already in progress.",
          item: buildNotionSyncStatePayload(started.state, env).item,
        },
        409,
      );
    }

    try {
      let pendingFingerprint = "";
      try {
        const fingerprint = await getNotionFingerprint(env);
        pendingFingerprint = fingerprint.fingerprint;
      } catch {
        pendingFingerprint = "";
      }

      const trigger = await dispatchNotionSync(env, {
        source: "manual",
        runId: started.runId,
        requestedAt: started.state.last_requested_at,
        requestedBy: "admin",
      });

      const state = await markNotionSyncTriggered(db, {
        runId: started.runId,
        message: "Manual sync triggered. Waiting for Cloudflare Pages deployment result.",
        responseText: trigger.responseText,
        deploymentUrl: trigger.deploymentUrl,
        deploymentId: trigger.deploymentId,
        deploymentStatus: trigger.deploymentStatus,
        pendingFingerprint,
      });

      return json({
        ok: true,
        message: "Notion sync has been triggered.",
        item: buildNotionSyncStatePayload(state, env).item,
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
          item: buildNotionSyncStatePayload(state || (await getNotionSyncState(db)), env).item,
        },
        500,
      );
    }
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to trigger notion sync." }, 500);
  }
}

export async function onRequestPatch(context) {
  try {
    const { request, env } = context;
    const { db, failedResponse } = await ensureAdmin(context);
    if (failedResponse) {
      return failedResponse;
    }

    const payload = await parseJson(request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    if (typeof payload.auto_enabled !== "boolean") {
      return json({ ok: false, message: "auto_enabled must be a boolean." }, 400);
    }

    const state = await setNotionAutoSyncEnabled(db, payload.auto_enabled);
    return json({
      ok: true,
      message: `Auto sync ${payload.auto_enabled ? "enabled" : "disabled"}.`,
      item: buildNotionSyncStatePayload(state, env).item,
    });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to update notion sync settings." }, 500);
  }
}
