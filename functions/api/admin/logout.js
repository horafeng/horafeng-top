import { buildClearCookie, deleteAdminSession } from "../../_lib/admin-auth.js";
import { getDb, json } from "../../_lib/comments-utils.js";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const db = getDb(env);
    await deleteAdminSession({ db, request });

    return json(
      {
        ok: true,
        message: "Logged out.",
      },
      200,
      {
        "set-cookie": buildClearCookie(request),
      },
    );
  } catch (error) {
    return json({ ok: false, message: error.message || "Logout failed." }, 500);
  }
}
