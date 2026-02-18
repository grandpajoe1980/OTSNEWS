# OTS NEWS (Local SQLite)

This project now runs locally using SQLite only.

## Prerequisites

- Node.js 18+

## Run locally

1. Install dependencies:
   `npm install`
2. Set required server secrets (PowerShell example):
   `$env:SESSION_SECRET="change-me-long-random-secret"`
   `$env:EMAIL_CONFIG_KEY="change-me-separate-email-key"`
   Optional migration window override:
   `$env:PASSWORD_MIGRATION_WINDOW_DAYS="30"`
   Optional origin allowlist override:
   `$env:CORS_ORIGINS="http://127.0.0.1:3000,http://localhost:3000"`
3. Seed local SQLite database (creates `otsnews.db` and seeds default data if empty):
   `npm run db:seed`
4. Start API + client:
   `npm run dev`

## Notes

- API server runs at `http://127.0.0.1:3001`.
- Frontend uses `/api` and Vite proxies to the local API.
- No Turso / Vercel database is required.
- Email credentials are encrypted at rest using `EMAIL_CONFIG_KEY`.

## Security Hardening Checklist

- [x] Admin local-password reset flow wired frontend → API → database (hashed + salted storage).
- [ ] Replace modal `alert(...)` error handling in admin password reset with inline form error UI.

## SAML / ADFS SSO

- Sign in as an admin and open Admin Dashboard → SAML / ADFS.
- Configure IdP metadata using either:
   - Metadata URL, or
   - Pasted metadata XML.
- Use **Test Metadata** to parse and validate the IdP details.
- Save the configuration, then enable **Show SAML Login Option** to display SAML sign-in on the login modal.

### Service Provider metadata (for IdP onboarding)

- URL: `http://127.0.0.1:3001/api/auth/saml/metadata`
- The admin SAML page includes:
   - Copyable metadata URL
   - Direct XML download button

### SAML endpoints

- Login redirect: `/api/auth/saml/login`
- Assertion callback (ACS): `/api/auth/saml/callback`
- SP metadata XML: `/api/auth/saml/metadata`
