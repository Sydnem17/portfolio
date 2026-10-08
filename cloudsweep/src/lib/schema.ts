export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  label         TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT,
  tokens_enc    TEXT,
  quota_total   BIGINT,
  quota_used    BIGINT,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'connected',
  last_scan_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  remote_id      TEXT NOT NULL,
  parent_remote_id TEXT,
  name           TEXT NOT NULL,
  path           TEXT,
  is_folder      BOOLEAN NOT NULL DEFAULT FALSE,
  size           BIGINT NOT NULL DEFAULT 0,
  mime           TEXT,
  kind           TEXT NOT NULL DEFAULT 'other',
  md5            TEXT,
  sha1           TEXT,
  sha256         TEXT,
  quick_xor      TEXT,
  provider_hash  TEXT,
  content_sha256 TEXT,
  phash          TEXT,
  modified_at    TIMESTAMPTZ,
  created_remote TIMESTAMPTZ,
  taken_at       TIMESTAMPTZ,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  width          INTEGER,
  height         INTEGER,
  web_url        TEXT,
  trashed        BOOLEAN NOT NULL DEFAULT FALSE,
  scan_id        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_account ON items(account_id);
CREATE INDEX IF NOT EXISTS items_size ON items(size) WHERE NOT is_folder AND NOT trashed;
CREATE INDEX IF NOT EXISTS items_kind ON items(kind);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  account_id   TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'running',
  params       JSONB NOT NULL DEFAULT '{}'::jsonb,
  cursor       JSONB,
  progress     JSONB NOT NULL DEFAULT '{}'::jsonb,
  error        TEXT,
  locked_until TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfer_items (
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL,
  target_path  TEXT NOT NULL,
  action       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  session      JSONB,
  bytes_done   BIGINT NOT NULL DEFAULT 0,
  error        TEXT,
  PRIMARY KEY (job_id, item_id)
);

CREATE TABLE IF NOT EXISTS photo_tags (
  item_id      TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  people_count INTEGER NOT NULL DEFAULT 0,
  pets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  things       JSONB NOT NULL DEFAULT '[]'::jsonb,
  scene        TEXT,
  event        TEXT,
  place_hint   TEXT,
  caption      TEXT,
  analysed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geocache (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  account_id  TEXT,
  item_id     TEXT,
  remote_id   TEXT,
  name        TEXT,
  bytes       BIGINT NOT NULL DEFAULT 0,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  undone      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demo_files (
  account_id  TEXT NOT NULL,
  remote_id   TEXT NOT NULL,
  data        JSONB NOT NULL,
  PRIMARY KEY (account_id, remote_id)
);
`;
