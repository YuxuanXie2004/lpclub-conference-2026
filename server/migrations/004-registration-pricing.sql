CREATE TABLE IF NOT EXISTS registration_pricing (
  event_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  prices_json JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT INTO registration_pricing (event_key, prices_json)
SELECT 'conference-2026', JSON_OBJECT(
  'lp', JSON_OBJECT('ticket', 0, 'speaking', 4000, 'panel', 3000, 'matchmaking', 5000),
  'lpclub_member', JSON_OBJECT('ticket', 0, 'speaking', 4000, 'panel', 3000, 'matchmaking', 5000),
  'gp', JSON_OBJECT('ticket', 2000, 'speaking', 4000, 'panel', 3000, 'matchmaking', 5000),
  'investment_company', JSON_OBJECT('ticket', 2800, 'speaking', 5600, 'panel', 4200, 'matchmaking', 7000),
  'standard', JSON_OBJECT('ticket', 3500, 'speaking', 7000, 'panel', 5250, 'matchmaking', 8750)
)
WHERE NOT EXISTS (SELECT 1 FROM registration_pricing WHERE event_key = 'conference-2026');
