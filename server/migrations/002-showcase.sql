ALTER TABLE registrations ADD COLUMN follow_up_note TEXT NULL;

ALTER TABLE material_items ADD COLUMN approved_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE material_items ADD CONSTRAINT item_approved_version FOREIGN KEY (approved_version_id,id) REFERENCES material_versions(id,item_id);

CREATE TABLE IF NOT EXISTS showcase_boards (
  event_key VARCHAR(100) NOT NULL,
  kind ENUM('portrait','logo') NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_key,kind)
) ENGINE=InnoDB;

INSERT IGNORE INTO showcase_boards(event_key,kind) VALUES ('conference-2026','portrait'),('conference-2026','logo');

INSERT IGNORE INTO showcase_boards(event_key,kind) SELECT DISTINCT event_key,kind FROM showcase_entries;

UPDATE material_items m SET approved_version_id=(SELECT v.id FROM material_versions v WHERE v.item_id=m.id AND v.status='approved' ORDER BY v.version_no DESC LIMIT 1) WHERE approved_version_id IS NULL;
