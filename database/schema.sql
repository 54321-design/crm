-- CRM schema (MySQL 8+). Run: mysql -u root -p < database/schema.sql
CREATE DATABASE IF NOT EXISTS crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crm;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','employee') NOT NULL DEFAULT 'employee',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_sources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sources_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_statuses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  sort_order TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_statuses_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS n8n_workflows (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  source_id INT UNSIGNED NULL,
  status ENUM('running','success','failed','inactive') NOT NULL DEFAULT 'inactive',
  last_run_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workflows_name (name),
  CONSTRAINT fk_wf_source FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company VARCHAR(200) NULL,
  person_name VARCHAR(160) NULL,
  title VARCHAR(255) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  website VARCHAR(500) NULL,
  linkedin_url VARCHAR(500) NULL,
  linkedin_norm VARCHAR(255) NULL,   -- normalized, used for dedupe
  email_norm VARCHAR(190) NULL,      -- normalized, used for dedupe
  phone_norm VARCHAR(20) NULL,       -- digits only incl. country code
  source_id INT UNSIGNED NOT NULL,
  status_id INT UNSIGNED NOT NULL,
  workflow_id INT UNSIGNED NULL,
  assigned_to INT UNSIGNED NULL,
  scraped_at DATE NULL,
  last_activity_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leads_linkedin (linkedin_norm),
  KEY ix_leads_email (email_norm),
  KEY ix_leads_phone (phone_norm),
  KEY ix_leads_created (created_at),
  KEY ix_leads_status (status_id),
  KEY ix_leads_source (source_id),
  KEY ix_leads_assigned (assigned_to),
  KEY ix_leads_workflow (workflow_id),
  KEY ix_leads_company (company),
  KEY ix_leads_person (person_name),
  CONSTRAINT fk_leads_source FOREIGN KEY (source_id) REFERENCES lead_sources(id),
  CONSTRAINT fk_leads_status FOREIGN KEY (status_id) REFERENCES lead_statuses(id),
  CONSTRAINT fk_leads_workflow FOREIGN KEY (workflow_id) REFERENCES n8n_workflows(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_user FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  activity_type VARCHAR(40) NOT NULL, -- lead_created, sheet_import, lead_updated, duplicate_detected, lead_assigned, lead_contacted, status_changed, note_added, lead_converted, lead_deleted
  description VARCHAR(500) NOT NULL,
  meta JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_act_lead (lead_id, created_at),
  KEY ix_act_created (created_at),
  KEY ix_act_type (activity_type),
  CONSTRAINT fk_act_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_notes_lead (lead_id),
  CONSTRAINT fk_notes_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workflow_executions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT UNSIGNED NOT NULL,
  status ENUM('running','success','failed') NOT NULL,
  leads_created INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_exec_wf (workflow_id, created_at),
  CONSTRAINT fk_exec_wf FOREIGN KEY (workflow_id) REFERENCES n8n_workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Google Sheet sync -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spreadsheet_id VARCHAR(120) NOT NULL,
  sheet_gid VARCHAR(40) NOT NULL,
  last_synced_at DATETIME NULL,
  UNIQUE KEY uq_sync_state (spreadsheet_id, sheet_gid)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sheet_row_state (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  spreadsheet_id VARCHAR(120) NOT NULL,
  sheet_gid VARCHAR(40) NOT NULL,
  row_key VARCHAR(255) NOT NULL,      -- stable id: linkedin_norm | email_norm | phone_norm | hash(company+name)
  content_hash CHAR(40) NOT NULL,     -- unchanged rows are skipped
  lead_id INT UNSIGNED NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_row (spreadsheet_id, sheet_gid, row_key),
  CONSTRAINT fk_row_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sheet_name VARCHAR(120) NULL,
  trigger_type ENUM('schedule','manual') NOT NULL,
  status ENUM('running','success','partial','failed') NOT NULL DEFAULT 'running',
  rows_scanned INT UNSIGNED NOT NULL DEFAULT 0,
  new_leads INT UNSIGNED NOT NULL DEFAULT 0,
  updated_leads INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_leads INT UNSIGNED NOT NULL DEFAULT 0,
  unchanged_rows INT UNSIGNED NOT NULL DEFAULT 0,
  error_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_details JSON NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  KEY ix_sync_started (started_at)
) ENGINE=InnoDB;

-- Seed data --------------------------------------------------------------
INSERT IGNORE INTO lead_statuses (name, sort_order) VALUES ('New',1),('Contacted',2),('Qualified',3),('Converted',4),('Lost',5);
INSERT IGNORE INTO lead_sources (name, slug) VALUES
 ('LinkedIn','linkedin'),('Instagram','instagram'),('Google Maps / GMB','google-maps-gmb'),('Website','website'),('Other','other');
INSERT IGNORE INTO n8n_workflows (name, source_id)
 SELECT 'LinkedIn Lead Generation', id FROM lead_sources WHERE slug='linkedin';
INSERT IGNORE INTO n8n_workflows (name, source_id)
 SELECT 'Instagram Lead Generation', id FROM lead_sources WHERE slug='instagram';
INSERT IGNORE INTO n8n_workflows (name, source_id)
 SELECT 'Google Maps Lead Generation', id FROM lead_sources WHERE slug='google-maps-gmb';
INSERT IGNORE INTO n8n_workflows (name, source_id)
 SELECT 'GMB Review Responder', id FROM lead_sources WHERE slug='google-maps-gmb';
INSERT IGNORE INTO n8n_workflows (name, source_id)
 SELECT 'Website Lead Generation', id FROM lead_sources WHERE slug='website';

-- Outreach (AI message + LinkedIn DM via n8n) ----------------------------
CREATE TABLE IF NOT EXISTS outreach_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'linkedin',
  tone VARCHAR(30) NULL,
  body TEXT NOT NULL,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_out_lead (lead_id, created_at),
  KEY ix_out_status (status),
  CONSTRAINT fk_out_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_out_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
