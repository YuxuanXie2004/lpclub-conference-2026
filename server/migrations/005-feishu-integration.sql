ALTER TABLE registrations ADD COLUMN sync_version BIGINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE registrations ADD COLUMN sync_changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS integration_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(50) NOT NULL,
  snapshot JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY integration_event_registration (registration_id,occurred_at),
  CONSTRAINT integration_event_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integration_jobs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'feishu_bot',
  dedupe_key VARCHAR(150) NOT NULL UNIQUE,
  status ENUM('pending','processing','sent','failed','blocked') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error VARCHAR(100) NOT NULL DEFAULT '',
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY integration_due (status,next_attempt_at),
  CONSTRAINT integration_job_event FOREIGN KEY (event_id) REFERENCES integration_events(id),
  CONSTRAINT integration_job_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feishu_sync_state (
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  record_id VARCHAR(100) NULL,
  desired_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  synced_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','processing','synced','failed','blocked') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error VARCHAR(100) NOT NULL DEFAULT '',
  synced_at DATETIME(3) NULL,
  content_hash CHAR(64) NULL,
  PRIMARY KEY (registration_id,target_key),
  KEY feishu_sync_due (target_key,status,next_attempt_at),
  CONSTRAINT feishu_sync_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS integration_control (
  control_key VARCHAR(100) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_upload_requests (
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(20) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (registration_id,request_key),
  CONSTRAINT upload_request_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;
