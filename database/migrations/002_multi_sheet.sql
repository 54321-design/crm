-- Run ONLY if you already created the database with the first schema.sql.
USE crm;
ALTER TABLE leads ADD COLUMN address VARCHAR(500) NULL AFTER country;
ALTER TABLE sync_logs ADD COLUMN sheet_name VARCHAR(120) NULL AFTER id;
