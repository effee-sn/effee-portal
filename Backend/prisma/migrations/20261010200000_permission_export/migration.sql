-- EXPORT permission action (Reports: download Excel / CSV).
ALTER TABLE `Permission` MODIFY `action` ENUM('CREATE', 'VIEW', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE', 'EXPORT') NOT NULL;
