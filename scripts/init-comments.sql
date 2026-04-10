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
