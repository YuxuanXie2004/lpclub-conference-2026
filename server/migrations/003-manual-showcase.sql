CREATE TABLE IF NOT EXISTS showcase_manual_entries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  event_key VARCHAR(100) NOT NULL,
  kind ENUM('portrait','logo') NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  sort_order INT NOT NULL DEFAULT 0,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY manual_showcase_board (event_key,kind,enabled,sort_order),
  CONSTRAINT manual_showcase_file FOREIGN KEY (file_id) REFERENCES material_files(id)
) ENGINE=InnoDB;
