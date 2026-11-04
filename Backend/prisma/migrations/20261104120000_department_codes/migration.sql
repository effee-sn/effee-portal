-- A department's number in project tag numbers becomes a custom text code
-- (e.g. ELE, 12, PS-01), set in Administrator → Configuration → Department
-- Codes. Existing numbers are kept as codes; locked BOM tags keep theirs.

DROP INDEX `Department_dept_no_idx` ON `Department`;
ALTER TABLE `Department` CHANGE `dept_no` `dept_code` VARCHAR(10) NULL;
CREATE INDEX `Department_dept_code_idx` ON `Department`(`dept_code`);

ALTER TABLE `ProjectBomItem` CHANGE `dept_no` `dept_code` VARCHAR(10) NOT NULL;
