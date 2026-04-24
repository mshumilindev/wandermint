# WanderMint

WanderMint is a production-oriented React, TypeScript, Firebase, Zustand, and Material UI scaffold for an adaptive travel and local leisure orchestration platform.

## What is included

- Google-only Firebase Authentication with a dedicated `/auth` route.
- TanStack Router route map for dashboard, local mode, trips, trip wizard, trip overview, day detail, chat, saved, and settings.
- Zustand-first domain caches with explicit metadata, TTL checks, narrow invalidation, and no automatic refetch on remount.
- Firestore repositories with precise methods and centralized mappers.
- Strong domain models for trips, day plans, activities, warnings, replans, completion, scenarios, and preferences.
- Provider abstractions for weather, places, routing, and events, with mock implementations clearly labeled.
- OpenAI gateway abstraction with Zod validation for critical structured outputs.
- Premium dark Material UI theme driven by centralized CSS tokens.
- Firestore rules and indexes for authenticated per-user access.

## Secrets

Firebase web config is public client configuration. OpenAI API keys must not be shipped in browser code. Configure `VITE_AI_GATEWAY_URL=/api/ai`. Firebase Hosting rewrites `/api/ai/*` to the `aiGateway` HTTPS Function, which reads `OPENAI_API_KEY` from Firebase Secret Manager and requires a Firebase Auth bearer token.

Set the key before deploying functions:

```bash
npm run firebase:secret:openai
```

Paste the OpenAI key into the Firebase CLI prompt. Do not place it in `.env`, source files, or hosting config.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
```

## Firebase

```bash
npm run deploy
```

If the global `firebase` command is unavailable, use the npm scripts above. They run the project-local Firebase CLI from `node_modules/.bin`. Log in first when needed:

```bash
npm run firebase:login
```

The data model uses top-level collections for cheap, auditable reads: `trips`, `tripDays`, `tripWarnings`, `replanProposals`, `tripChatThreads`, `tripChatMessages`, `savedLocalScenarios`, `userPreferences`, `validationSnapshots`, and `completionHistory`.
