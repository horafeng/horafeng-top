import { getDb, json, parseJson, sanitizeSingleLine } from "../../_lib/comments-utils.js";
import { markNotionSyncFinished, verifyNotionSyncReport } from "../../_lib/notion-sync.js";

export async function onRequestPost(context) {
  try {
    const authFailure = verifyNotionSyncReport(context.request, context.env);
    if (authFailure) {
      return authFailure;
    }

    const payload = await parseJson(context.request);
    if (!payload) {
      return json({ ok: false, message: "Invalid JSON body." }, 400);
    }

    const status = sanitizeSingleLine(payload.status, 24).toLowerCase();
    if (!["success", "failed"].includes(status)) {
      return json({ ok: false, message: "status must be success or failed." }, 400);
    }

    const db = getDb(context.env);
    const state = await markNotionSyncFinished(db, {
      runId: sanitizeSingleLine(payload.run_id, 80),
      status,
      message: sanitizeSingleLine(payload.message, 500) || (status === "success" ? "Notion sync completed." : "Notion sync failed."),
      finishedAt: sanitizeSingleLine(payload.finished_at, 80),
      checkedAt: sanitizeSingleLine(payload.checked_at, 80),
      deploymentUrl: sanitizeSingleLine(payload.deployment_url, 500),
      deploymentId: sanitizeSingleLine(payload.deployment_id, 160),
      deploymentStatus: sanitizeSingleLine(payload.deployment_status, 40),
      responseText: sanitizeSingleLine(payload.response_text, 1000),
    });

    if (!state) {
      return json({ ok: false, message: "No matching notion sync run found." }, 404);
    }

    return json({
      ok: true,
      message: "Notion sync state updated.",
      item: state,
    });
  } catch (error) {
    return json({ ok: false, message: error.message || "Failed to report notion sync result." }, 500);
  }
}
