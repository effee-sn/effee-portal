# Azure App Service — settings for the two web apps

What each web app needs: its startup command, general settings, and the
App Settings (environment variables) that replace the VPS `.env` file.
Secrets go in Key Vault and are referenced from App Settings as
`@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/<name>/)`.

> **Copy `JWT_SECRET` and `ENCRYPTION_KEY` exactly as they are on the VPS.**
> Encrypted values in the database (and signed-in sessions) depend on them; new
> values would make that data unreadable after the move. If the VPS has no
> `ENCRYPTION_KEY`, the key comes from `JWT_SECRET` — then copy that one
> exactly and do not add an `ENCRYPTION_KEY`.

---

## 1. API web app (e.g. `effee-api`)

**Configuration → General settings**

| Setting | Value |
|---|---|
| Stack | Node 20 LTS |
| Startup Command | `node scripts/azure-start.js` (applies migrations, then starts) |
| Always On | On |
| HTTPS Only | On, minimum TLS 1.2 |
| FTP / basic auth publishing | Off |
| Health check path | `/health` |

**App Settings**

| Name | Value | Key Vault |
|---|---|---|
| `NODE_ENV` | `production` | |
| `TRUST_PROXY_HOPS` | `1` | |
| `DATABASE_URL` | `mysql://<user>:<password>@<server>.mysql.database.azure.com:3306/effeeportal?sslaccept=strict&connection_limit=10&pool_timeout=20&max_idle_connection_lifetime=180` (URL-encode special characters in the password) | yes |
| `JWT_SECRET` | **same as the VPS** | yes |
| `ENCRYPTION_KEY` | **same as the VPS** (only if the VPS has one) | yes |
| `JWT_EXPIRES_IN` | as on the VPS (e.g. `7d`) | |
| `BCRYPT_ROUNDS` | `12` | |
| `ALLOWED_ORIGIN` | the portal's address, e.g. `https://portal.effee-induction.com` (first entry is also used in password-reset links) | |
| `BACKUP_DIR` | `/home/data/backups` (outside the app folder, which a deploy replaces) | |
| `AZURE_STORAGE_CONNECTION_STRING` | storage account → Access keys → connection string | yes |
| `AZURE_STORAGE_CONTAINER` | `effee-portal` | |
| `SMTP_HOST` | `smtp.office365.com` | |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | the mailbox, e.g. `noreply@effee-induction.com` | |
| `SMTP_PASS` | its password | yes |
| `SMTP_FROM_NAME` | `Effee Portal` | |
| `SMTP_FROM_EMAIL` | same as `SMTP_USER` | |
| `EMAIL_NOTIFICATIONS` | `true` | |
| `MS_SSO_TENANT_ID` | from IT | |
| `MS_SSO_CLIENT_ID` | from IT | |
| `MS_SSO_CLIENT_SECRET` | from IT (note its expiry date) | yes |
| `MS_SSO_REDIRECT_URI` | `https://<api domain>/api/v1/auth/sso/microsoft/callback` — exactly as registered in Entra | |
| `MS_SSO_ALLOWED_GROUP_ID` | Object ID of "Effee Portal Users" | |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | **same as the VPS** (else browsers must allow notifications again) | private key: yes |
| `APP_TIMEZONE` | `Asia/Kolkata` | |
| `FOLLOWUP_REMINDER_LEAD_MINUTES` | as on the VPS (e.g. `15`) | |
| `FOLLOWUP_REMINDER_DAY_TIME` | as on the VPS (e.g. `09:00`) | |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (the pipeline ships a finished build) | |

Do **not** set `PORT` (App Service sets it) or `MYSQL_BIN_DIR`, and do not set
`WEBSITE_RUN_FROM_PACKAGE` (uploads are written to the app folder briefly
before going to Blob, so it must stay writable).

## 2. Frontend web app (e.g. `effee-web`)

**Configuration → General settings**

| Setting | Value |
|---|---|
| Stack | Node 20 LTS |
| Startup Command | `node start.js` |
| Always On | On |
| HTTPS Only | On, minimum TLS 1.2 |
| FTP / basic auth publishing | Off |
| Health check path | `/login` |

**App Settings**

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |

The API address is built into the pages, not read from App Settings: it comes
from the GitHub variable `API_BASE_URL` at build time (see below). Changing
the API's address means running the pipeline again.

## 3. GitHub (repository `effee-sn/effee-portal`)

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `AZURE_CLIENT_ID` | service principal's application (client) ID |
| Secret | `AZURE_TENANT_ID` | tenant ID |
| Secret | `AZURE_SUBSCRIPTION_ID` | subscription ID |
| Variable | `AZURE_API_APP` | API web app name |
| Variable | `AZURE_WEB_APP` | frontend web app name |
| Variable | `API_BASE_URL` | API address, no trailing slash, e.g. `https://portal-api.effee-induction.com` |

The service principal's federated credential: entity type **Branch**, the
branch the deploy runs from (e.g. `main`), on this repository.

Deploy: Actions → **Deploy to Azure** → Run workflow → `both` / `api` / `web`.
The run waits until `<API_BASE_URL>/health/ready` answers (database reached).

## 4. First start, and checks

- **Empty database** (a trial before moving day): after the first deploy,
  create the Super Admin once from the API web app's SSH console
  (Development Tools → SSH): `cd /home/site/wwwroot && SEED_ADMIN_PASSWORD='<password>' node prisma/seed.js`.
- **Moving day**: import the VPS database dump instead (no seed); the startup
  applies any newer migrations.
- After switching **Settings → Storage** to Blob, run the transfer once.
- `GET <api>/health/ready` → `{"status":"ok","database":"ok"}`.
- **Backups** on Azure hold the files only; the database is backed up by
  Azure Database for MySQL (point-in-time restore, in the Azure portal).
- A request is cut off by Azure after 230 seconds. If a files backup of a
  large store ever runs into that, download from Blob with Azure Storage
  Explorer / `azcopy` instead.
