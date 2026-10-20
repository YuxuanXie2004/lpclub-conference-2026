CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  event_key VARCHAR(100) NOT NULL,
  ref VARCHAR(100) NOT NULL,
  status ENUM('Received','Under Review','Approved','Waitlisted','Rejected','Cancelled') NOT NULL DEFAULT 'Received',
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  salutation VARCHAR(100) NOT NULL DEFAULT '',
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  company VARCHAR(255) NOT NULL DEFAULT '',
  company_type VARCHAR(255) NOT NULL DEFAULT '',
  department VARCHAR(255) NOT NULL DEFAULT '',
  job_title VARCHAR(255) NOT NULL DEFAULT '',
  country VARCHAR(150) NOT NULL DEFAULT '',
  city VARCHAR(150) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL,
  mobile VARCHAR(100) NOT NULL DEFAULT '',
  whatsapp_same VARCHAR(100) NOT NULL DEFAULT '',
  whatsapp_number VARCHAR(100) NOT NULL DEFAULT '',
  investment_focus JSON NOT NULL DEFAULT (JSON_ARRAY()),
  attendance_purpose JSON NOT NULL DEFAULT (JSON_ARRAY()),
  matchmaking VARCHAR(100) NOT NULL DEFAULT '',
  visa_letter VARCHAR(100) NOT NULL DEFAULT '',
  arrival_date DATE NULL,
  guests SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
  package_id VARCHAR(100) NOT NULL DEFAULT '',
  attendee_category VARCHAR(255) NOT NULL DEFAULT '',
  ticket_name VARCHAR(255) NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  display_price VARCHAR(255) NOT NULL DEFAULT '',
  pricing_basis VARCHAR(500) NOT NULL DEFAULT '',
  source VARCHAR(255) NOT NULL DEFAULT '',
  email_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  email_sent_at DATETIME(3) NULL,
  status_updated_at DATETIME(3) NULL,
  status_note TEXT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at DATETIME(3) NULL,
  deleted_by VARCHAR(255) NOT NULL DEFAULT '',
  deletion_reason TEXT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  owner VARCHAR(255) NOT NULL DEFAULT '',
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  option_id VARCHAR(100) NOT NULL DEFAULT '',
  attendee_snapshot JSON NOT NULL DEFAULT (JSON_OBJECT()),
  package_snapshot JSON NOT NULL DEFAULT (JSON_OBJECT()),
  active_email VARCHAR(254) GENERATED ALWAYS AS (CASE WHEN status NOT IN ('Rejected','Cancelled') AND deleted_at IS NULL THEN LOWER(TRIM(email)) ELSE NULL END) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY registrations_ref (event_key,ref),
  UNIQUE KEY registrations_active_email (event_key,active_email),
  KEY registrations_status (event_key,status,submitted_at),
  CONSTRAINT registrations_focus_array CHECK (JSON_TYPE(investment_focus)='ARRAY'),
  CONSTRAINT registrations_purpose_array CHECK (JSON_TYPE(attendance_purpose)='ARRAY')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS submission_requests (
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  result_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT submission_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vip_meta (
  meta_key VARCHAR(100) PRIMARY KEY,
  meta_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vip_codes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  cipher TEXT NOT NULL,
  last4 CHAR(4) NOT NULL,
  batch_name VARCHAR(120) NOT NULL DEFAULT '',
  status ENUM('available','used','revoked') NOT NULL DEFAULT 'available',
  expires_at DATETIME(3) NULL,
  recipient_name VARCHAR(120) NOT NULL DEFAULT '',
  recipient_email VARCHAR(254) NOT NULL DEFAULT '',
  distributed_at DATETIME(3) NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  used_at DATETIME(3) NULL,
  used_name VARCHAR(255) NOT NULL DEFAULT '',
  used_email VARCHAR(254) NOT NULL DEFAULT '',
  registration_ref VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY vip_codes_status (status,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vip_redemptions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT redemption_code FOREIGN KEY (code_id) REFERENCES vip_codes(id),
  CONSTRAINT redemption_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_files (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  storage_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_items (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('card','portrait','logo') NOT NULL,
  current_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 0,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY material_item_kind (registration_id,kind),
  CONSTRAINT item_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS material_versions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending','approved','rejected','deleted') NOT NULL DEFAULT 'pending',
  reason TEXT NULL,
  uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  reviewer VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY material_version_number (item_id,version_no),
  UNIQUE KEY material_version_item (id,item_id),
  CONSTRAINT version_item FOREIGN KEY (item_id) REFERENCES material_items(id),
  CONSTRAINT version_file FOREIGN KEY (file_id) REFERENCES material_files(id)
) ENGINE=InnoDB;

ALTER TABLE material_items ADD CONSTRAINT item_current_version FOREIGN KEY (current_version_id,id) REFERENCES material_versions(id,item_id);

CREATE TABLE IF NOT EXISTS publication_consents (
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('portrait','logo') NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  text_version VARCHAR(100) NOT NULL DEFAULT '',
  PRIMARY KEY (registration_id,kind),
  CONSTRAINT consent_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS showcase_entries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  event_key VARCHAR(100) NOT NULL,
  kind ENUM('portrait','logo') NOT NULL,
  published_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  sort_order INT NOT NULL DEFAULT 0,
  org_key VARCHAR(255) NOT NULL DEFAULT '',
  active_org_key VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN enabled=TRUE AND kind='logo' AND org_key<>'' THEN org_key ELSE NULL END) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY showcase_active_org (event_key,active_org_key),
  CONSTRAINT showcase_item FOREIGN KEY (item_id) REFERENCES material_items(id),
  CONSTRAINT showcase_version FOREIGN KEY (published_version_id,item_id) REFERENCES material_versions(id,item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS supplement_tokens (
  digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope VARCHAR(100) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY supplement_registration (registration_id),
  CONSTRAINT token_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mail_jobs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(100) NOT NULL,
  dedupe_key VARCHAR(255) NOT NULL UNIQUE,
  encrypted_payload MEDIUMTEXT NULL,
  status ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_until DATETIME(3) NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  last_error TEXT NULL,
  message_id VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  KEY mail_due (status,next_attempt_at,lease_until),
  CONSTRAINT mail_registration FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  vip_code_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(255) NOT NULL DEFAULT '',
  detail JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_registration (registration_id,id),
  KEY audit_vip (vip_code_id,id),
  CONSTRAINT audit_registration FOREIGN KEY (registration_id) REFERENCES registrations(id),
  CONSTRAINT audit_vip FOREIGN KEY (vip_code_id) REFERENCES vip_codes(id)
) ENGINE=InnoDB;
