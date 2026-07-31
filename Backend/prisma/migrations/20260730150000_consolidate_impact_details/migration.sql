-- Replace the three impact flags + their detail columns with a single free-text
-- `impact_details`. Existing detail text is preserved by concatenating whatever
-- was filled in. Table name is PascalCase (ServiceTicket) for Linux MySQL.

ALTER TABLE `ServiceTicket` ADD COLUMN `impact_details` TEXT NULL;

UPDATE `ServiceTicket`
SET `impact_details` = NULLIF(
  CONCAT_WS('\n',
    NULLIF(`production_impact_details`, ''),
    NULLIF(`customer_impact_details`, ''),
    NULLIF(`safety_impact_details`, '')
  ), '');

ALTER TABLE `ServiceTicket`
  DROP COLUMN `production_impact`,
  DROP COLUMN `production_impact_details`,
  DROP COLUMN `customer_impact`,
  DROP COLUMN `customer_impact_details`,
  DROP COLUMN `safety_impact`,
  DROP COLUMN `safety_impact_details`;
