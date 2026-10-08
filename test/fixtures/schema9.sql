-- Exact schema9 DDL from f738655ccab834d77d9204ebab25ab1e2a61d8ee; no data.
CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'trial')),
          password_hash TEXT,
          created_at TEXT NOT NULL,
          CHECK ((role = 'owner' AND id = 'owner' AND username = 'owner' AND password_hash IS NULL) OR
            (role = 'trial' AND id != 'owner' AND username != 'owner' AND password_hash IS NOT NULL))
        ) STRICT;
CREATE TABLE cases (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          version INTEGER NOT NULL CHECK (version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        , client_id TEXT REFERENCES clients(id)) STRICT;
CREATE INDEX cases_by_owner_updated ON cases(user_id, updated_at DESC, id);
CREATE TABLE telemetry_workflows (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
CREATE INDEX telemetry_workflows_owner_updated ON telemetry_workflows(user_id, updated_at, id);
CREATE INDEX telemetry_workflows_case ON telemetry_workflows(case_id, user_id);
CREATE TABLE telemetry_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL REFERENCES telemetry_workflows(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          request_id TEXT,
          source TEXT NOT NULL CHECK(source IN ('server','client')),
          event_name TEXT NOT NULL CHECK(event_name IN ('input.paste','input.file','input.mapping','review.confirm','draft.generate','draft.edit','export.copy','export.download','export.print','case.open','case.save','case.delete','request.pdf_parse','request.workbook_parse','request.extract','request.chat','request.case_create','request.case_read','request.case_update','request.case_delete','request.case_list')),
          outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
          http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
          error_code TEXT,
          server_elapsed_ms INTEGER CHECK(server_elapsed_ms IS NULL OR server_elapsed_ms BETWEEN 0 AND 300000),
          client_active_ms INTEGER CHECK(client_active_ms IS NULL OR client_active_ms BETWEEN 0 AND 86400000),
          client_wait_ms INTEGER CHECK(client_wait_ms IS NULL OR client_wait_ms BETWEEN 0 AND 300000),
          created_at TEXT NOT NULL
        ) STRICT;
CREATE INDEX telemetry_events_owner_id ON telemetry_events(user_id,id);
CREATE INDEX telemetry_events_workflow_id ON telemetry_events(workflow_id,id);
CREATE INDEX telemetry_events_created ON telemetry_events(created_at);
CREATE UNIQUE INDEX telemetry_server_request_id ON telemetry_events(request_id) WHERE source='server';
CREATE TABLE clients (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          display_name TEXT NOT NULL,
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id)
        ) STRICT;
CREATE INDEX clients_owner_name ON clients(user_id, display_name COLLATE NOCASE, id);
CREATE INDEX cases_owner_client ON cases(user_id, client_id, updated_at, id);
CREATE UNIQUE INDEX cases_owner_identity ON cases(user_id, id);
CREATE TRIGGER cases_client_owner_insert BEFORE INSERT ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
CREATE TRIGGER cases_client_owner_update BEFORE UPDATE OF client_id,user_id ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
CREATE TABLE conversations (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id),
          FOREIGN KEY(user_id,case_id) REFERENCES cases(user_id,id) ON DELETE CASCADE
        ) STRICT;
CREATE INDEX conversations_owner_case ON conversations(user_id,case_id,updated_at,id);
CREATE TABLE messages (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          conversation_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK(sequence > 0),
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          content TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('complete','interrupted','failed')),
          request_id TEXT,
          client_message_id TEXT,
          image_metadata_json TEXT NOT NULL CHECK(json_valid(image_metadata_json)),
          created_at TEXT NOT NULL,
          UNIQUE(conversation_id,sequence),
          FOREIGN KEY(user_id,conversation_id) REFERENCES conversations(user_id,id) ON DELETE CASCADE
        ) STRICT;
CREATE INDEX messages_owner_conversation ON messages(user_id,conversation_id,sequence);
CREATE UNIQUE INDEX messages_user_turn ON messages(user_id,client_message_id) WHERE role='user' AND client_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_user_request ON messages(user_id,request_id) WHERE role='user' AND request_id IS NOT NULL;
CREATE UNIQUE INDEX messages_assistant_request ON messages(user_id,request_id) WHERE role='assistant' AND request_id IS NOT NULL;
CREATE TRIGGER immutable_message_update BEFORE UPDATE ON messages BEGIN SELECT RAISE(ABORT, 'Messages are immutable'); END;
CREATE TABLE artifacts (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('followup','missing-documents','status-summary')),
          title TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('draft','final')),
          content TEXT NOT NULL,
          version INTEGER NOT NULL CHECK(version > 0),
          source_case_version INTEGER NOT NULL CHECK(source_case_version > 0),
          source_conversation_id TEXT REFERENCES conversations(id),
          source_message_id TEXT REFERENCES messages(id),
          snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
          created_at TEXT NOT NULL,
          UNIQUE(user_id,case_id,kind,version),
          FOREIGN KEY(user_id,case_id) REFERENCES cases(user_id,id) ON DELETE CASCADE
        ) STRICT;
CREATE INDEX artifacts_owner_case ON artifacts(user_id,case_id,created_at,id);
CREATE TRIGGER immutable_artifact_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'Artifacts are immutable'); END;
CREATE TABLE assets (
          id TEXT PRIMARY KEY NOT NULL,
          owner_user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
          client_id TEXT REFERENCES clients(id),
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
          sha256 TEXT NOT NULL CHECK(length(sha256)=64),
          extracted_text TEXT NOT NULL,
          search_text TEXT NOT NULL,
          text_status TEXT NOT NULL CHECK(text_status IN ('ready','unavailable')),
          text_truncated INTEGER NOT NULL CHECK(text_truncated IN (0,1)),
          preview_kind TEXT NOT NULL CHECK(preview_kind IN ('pdf','image','text')),
          warnings_json TEXT NOT NULL CHECK(json_valid(warnings_json)),
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_user_id,id)
        ) STRICT;
CREATE INDEX assets_owner_created ON assets(owner_user_id,created_at DESC,id);
CREATE INDEX assets_owner_case ON assets(owner_user_id,case_id,created_at DESC,id);
CREATE INDEX assets_owner_client ON assets(owner_user_id,client_id,created_at DESC,id);
CREATE TRIGGER assets_owner_insert BEFORE INSERT ON assets
          WHEN (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
CREATE TRIGGER assets_owner_update BEFORE UPDATE OF owner_user_id,case_id,client_id ON assets
          WHEN NEW.owner_user_id != OLD.owner_user_id
          OR (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
CREATE TRIGGER assets_immutable_content BEFORE UPDATE OF id,original_filename,mime_type,size_bytes,sha256,extracted_text,search_text,text_status,text_truncated,preview_kind,warnings_json,created_at ON assets
          BEGIN SELECT RAISE(ABORT,'Original assets are immutable'); END;
CREATE TRIGGER assets_follow_case_customer AFTER UPDATE OF client_id ON cases WHEN NEW.client_id IS NOT OLD.client_id
          BEGIN UPDATE assets SET client_id=NEW.client_id,version=version+1,updated_at=NEW.updated_at WHERE case_id=NEW.id AND owner_user_id=NEW.user_id; END;
CREATE TRIGGER assets_preserve_case_delete BEFORE DELETE ON cases
          BEGIN UPDATE assets SET case_id=NULL,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE case_id=OLD.id AND owner_user_id=OLD.user_id; END;
CREATE TABLE email_identities (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  email TEXT NOT NULL UNIQUE CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
  verified_at INTEGER NOT NULL
) STRICT;
CREATE TABLE email_actions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
  kind TEXT NOT NULL CHECK(kind IN ('register','bind','reset')),
  email TEXT NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
  user_id TEXT REFERENCES users(id),
  password_hash TEXT,
  credential_fingerprint TEXT,
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
  UNIQUE(kind,email),
  CHECK((kind='register' AND user_id IS NULL AND password_hash IS NOT NULL AND credential_fingerprint IS NULL)
    OR (kind IN ('bind','reset') AND user_id IS NOT NULL AND password_hash IS NULL AND credential_fingerprint IS NOT NULL))
) STRICT;
CREATE INDEX email_actions_expiry ON email_actions(expires_at);
CREATE TABLE email_rate_buckets (
  bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash)=64),
  count INTEGER NOT NULL CHECK(count>0),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX email_rate_expiry ON email_rate_buckets(expires_at);
CREATE TABLE user_capabilities (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) CHECK(user_id != 'owner'),
  administrator INTEGER NOT NULL CHECK(administrator IN (0,1)),
  version INTEGER NOT NULL CHECK(version > 0),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE account_capability_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) CHECK(actor_user_id = 'owner'),
  target_user_id TEXT NOT NULL REFERENCES users(id) CHECK(target_user_id != 'owner'),
  administrator INTEGER NOT NULL CHECK(administrator IN (0,1)),
  version INTEGER NOT NULL CHECK(version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(target_user_id,version)
) STRICT;
CREATE TRIGGER account_capability_audit_no_update BEFORE UPDATE ON account_capability_audit
  BEGIN SELECT RAISE(ABORT,'Capability audit is append-only'); END;
CREATE TRIGGER account_capability_audit_no_delete BEFORE DELETE ON account_capability_audit
  BEGIN SELECT RAISE(ABORT,'Capability audit is append-only'); END;
CREATE TABLE conversation_review_intents (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),
 rows_json TEXT NOT NULL CHECK(json_valid(rows_json)),
 expected_version INTEGER NOT NULL CHECK(expected_version>0),
 prompt_message_id TEXT NOT NULL REFERENCES messages(id),
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','applied','cancelled','expired','undone')),
 answer_key TEXT,
 answer_text TEXT,
 answer_message_id TEXT REFERENCES messages(id),
 applied_version INTEGER,
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 undo_key TEXT,
 undo_message_id TEXT REFERENCES messages(id),
 UNIQUE(user_id,request_key)
) STRICT;
CREATE UNIQUE INDEX conversation_review_one_pending ON conversation_review_intents(user_id,conversation_id) WHERE state='pending';
CREATE INDEX conversation_review_case ON conversation_review_intents(user_id,case_id);
CREATE TRIGGER conversation_review_binding_immutable BEFORE UPDATE ON conversation_review_intents
 WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.case_id IS NOT OLD.case_id
 OR NEW.conversation_id IS NOT OLD.conversation_id OR NEW.request_key IS NOT OLD.request_key
 OR NEW.request_json IS NOT OLD.request_json OR NEW.rows_json IS NOT OLD.rows_json
 OR NEW.expected_version IS NOT OLD.expected_version OR NEW.prompt_message_id IS NOT OLD.prompt_message_id
 OR NEW.expires_at IS NOT OLD.expires_at
 BEGIN SELECT RAISE(ABORT,'Review intent binding is immutable'); END;
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','trial')),
  credential_fingerprint TEXT NOT NULL CHECK(length(credential_fingerprint)=64),
  csrf_token TEXT NOT NULL CHECK(length(csrf_token)=43),
  remember_me INTEGER NOT NULL CHECK(remember_me IN (0,1)),
  created INTEGER NOT NULL CHECK(created>=0),
  last_used INTEGER NOT NULL CHECK(last_used>=created)
) STRICT;
CREATE INDEX auth_sessions_user_created ON auth_sessions(user_id,created);
CREATE TRIGGER auth_sessions_revoke_credentials AFTER UPDATE OF password_hash,role ON users
WHEN OLD.password_hash IS NOT NEW.password_hash OR OLD.role IS NOT NEW.role
BEGIN DELETE FROM auth_sessions WHERE user_id=NEW.id; END;
CREATE TABLE library_permissions (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('allow','deny')),
  version INTEGER NOT NULL CHECK(version > 0),
  provider_id TEXT NOT NULL,
  provider_endpoint TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
PRAGMA application_id=1314083916;
PRAGMA user_version=9;
