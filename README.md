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
