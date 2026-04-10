INSERT INTO comments (
  page_key,
  parent_id,
  nickname,
  contact,
  content,
  status,
  is_admin,
  ip_hash,
  user_agent,
  created_at,
  updated_at
)
VALUES
  ('guestbook', NULL, '木木', 'mumu@example.com', '路过留个言，页面气质很舒服。', 'approved', 0, 'seed-ip-1', 'seed', '2026-04-10T01:20:00.000Z', '2026-04-10T01:20:00.000Z'),
  ('guestbook', NULL, '阿青', '12345678', '希望后面能看到更多通勤系列。', 'approved', 0, 'seed-ip-2', 'seed', '2026-04-10T01:40:00.000Z', '2026-04-10T01:40:00.000Z'),
  ('guestbook', 2, 'HoraFeng', 'admin', '收到，已经在计划里了。', 'approved', 1, 'seed-admin', 'seed', '2026-04-10T02:05:00.000Z', '2026-04-10T02:05:00.000Z');
