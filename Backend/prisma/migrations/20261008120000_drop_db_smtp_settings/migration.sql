-- SMTP moves to the environment (SMTP_* in .env). Drop the database-stored
-- SMTP configuration and the email-notifications toggle from CompanySettings.
ALTER TABLE `CompanySettings`
  DROP COLUMN `smtp_host`,
  DROP COLUMN `smtp_port`,
  DROP COLUMN `smtp_user`,
  DROP COLUMN `smtp_pass`,
  DROP COLUMN `smtp_from_name`,
  DROP COLUMN `smtp_from_email`,
  DROP COLUMN `email_notifications`;
