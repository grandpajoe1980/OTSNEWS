# OTS NEWS (Local SQLite)

This project now runs locally using SQLite only.

## Prerequisites

- Node.js 18+

## Run locally

1. Install dependencies:
   `npm install`
2. Seed local SQLite database (creates `otsnews.db` and seeds default data if empty):
   `npm run db:seed`
3. Start API + client:
   `npm run dev`

## Notes

- API server runs at `http://127.0.0.1:3001`.
- Frontend uses `/api` and Vite proxies to the local API.
- No Turso / Vercel database is required.

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
