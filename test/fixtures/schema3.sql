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
