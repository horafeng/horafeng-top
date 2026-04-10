PRAGMA foreign_keys = ON;

ALTER TABLE comments ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notify_enabled IN (0, 1));
ALTER TABLE comments ADD COLUMN contact_email_resolved TEXT;
ALTER TABLE comments ADD COLUMN unsubscribe_token TEXT;
ALTER TABLE comments ADD COLUMN last_notified_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_unsubscribe_token
  ON comments (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

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

UPDATE comments
SET contact_email_resolved = CASE
  WHEN contact LIKE '%@%' THEN lower(contact)
  WHEN contact GLOB '[1-9][0-9][0-9][0-9][0-9]*' THEN contact || '@qq.com'
  ELSE contact_email_resolved
END
WHERE contact_email_resolved IS NULL;
