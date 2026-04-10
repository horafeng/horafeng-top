PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key TEXT NOT NULL,
  parent_id INTEGER,
  nickname TEXT NOT NULL,
  contact TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'deleted', 'spam')),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  notify_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notify_enabled IN (0, 1)),
  contact_email_resolved TEXT,
  unsubscribe_token TEXT,
  last_notified_at TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_page_status_created
  ON comments (page_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent_created
  ON comments (parent_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_comments_status_created
  ON comments (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_unsubscribe_token
  ON comments (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions (expires_at ASC);

CREATE TABLE IF NOT EXISTS comment_rate_limits (
  limiter_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_updated
  ON comment_rate_limits (updated_at ASC);

CREATE TABLE IF NOT EXISTS comment_reply_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reply_comment_id INTEGER NOT NULL,
  parent_comment_id INTEGER NOT NULL,
  parent_page_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(reply_comment_id, parent_comment_id),
  FOREIGN KEY (reply_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_status_created
  ON comment_reply_notifications (status, created_at DESC);
