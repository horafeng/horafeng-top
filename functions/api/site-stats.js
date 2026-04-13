function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function ensureSiteStatsTable(db) {
  await db
    .prepare(
      `
        CREATE TABLE IF NOT EXISTS site_metrics (
          metric_key TEXT PRIMARY KEY,
          metric_value INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        )
      `,
    )
    .run();
}

export async function onRequestGet(context) {
  const db = context.env?.COMMENTS_DB;
  if (!db) {
    return json({ ok: true, pageviews: 0, source: "unavailable" });
  }

  const shouldIncrement = context.request.url.includes("increment=1");
  const now = new Date().toISOString();

  await ensureSiteStatsTable(db);

  if (shouldIncrement) {
    await db
      .prepare(
        `
          INSERT INTO site_metrics (metric_key, metric_value, updated_at)
          VALUES ('pageviews', 1, ?)
          ON CONFLICT(metric_key) DO UPDATE
          SET metric_value = metric_value + 1,
              updated_at = excluded.updated_at
        `,
      )
      .bind(now)
      .run();
  }

  const row = await db.prepare("SELECT metric_value, updated_at FROM site_metrics WHERE metric_key = 'pageviews'").first();

  return json({
    ok: true,
    pageviews: Number(row?.metric_value || 0),
    updated_at: row?.updated_at || now,
    source: "d1",
  });
}
