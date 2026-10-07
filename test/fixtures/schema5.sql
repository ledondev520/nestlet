-- Historical schema5 DDL from 5335312; no schema6 objects or user data.
-- Genuine schema3 DDL from baseline 8a7f5de, no user data.
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
CREATE TABLE telemetry_workflows (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
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
CREATE TABLE clients (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          display_name TEXT NOT NULL,
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id)
        ) STRICT;
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
CREATE INDEX cases_by_owner_updated ON cases(user_id, updated_at DESC, id);
CREATE INDEX telemetry_workflows_owner_updated ON telemetry_workflows(user_id, updated_at, id);
CREATE INDEX telemetry_workflows_case ON telemetry_workflows(case_id, user_id);
CREATE INDEX telemetry_events_owner_id ON telemetry_events(user_id,id);
CREATE INDEX telemetry_events_workflow_id ON telemetry_events(workflow_id,id);
CREATE INDEX telemetry_events_created ON telemetry_events(created_at);
CREATE UNIQUE INDEX telemetry_server_request_id ON telemetry_events(request_id) WHERE source='server';
CREATE INDEX clients_owner_name ON clients(user_id, display_name COLLATE NOCASE, id);
CREATE INDEX cases_owner_client ON cases(user_id, client_id, updated_at, id);
CREATE UNIQUE INDEX cases_owner_identity ON cases(user_id, id);
CREATE INDEX conversations_owner_case ON conversations(user_id,case_id,updated_at,id);
CREATE INDEX messages_owner_conversation ON messages(user_id,conversation_id,sequence);
CREATE UNIQUE INDEX messages_user_turn ON messages(user_id,client_message_id) WHERE role='user' AND client_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_user_request ON messages(user_id,request_id) WHERE role='user' AND request_id IS NOT NULL;
CREATE UNIQUE INDEX messages_assistant_request ON messages(user_id,request_id) WHERE role='assistant' AND request_id IS NOT NULL;
CREATE INDEX artifacts_owner_case ON artifacts(user_id,case_id,created_at,id);
CREATE TRIGGER cases_client_owner_insert BEFORE INSERT ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
CREATE TRIGGER cases_client_owner_update BEFORE UPDATE OF client_id,user_id ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
CREATE TRIGGER immutable_message_update BEFORE UPDATE ON messages BEGIN SELECT RAISE(ABORT, 'Messages are immutable'); END;
CREATE TRIGGER immutable_artifact_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'Artifacts are immutable'); END;
PRAGMA application_id=1314083916;
PRAGMA user_version=3;

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
        PRAGMA user_version = 4;

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
PRAGMA user_version=5;
