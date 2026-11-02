# TRL Backend — Training & Recipe LMS API

Express 5 + Prisma 7 (PostgreSQL) API for the Indoventura staff training and recipe library.
Videos are hosted on Bunny Stream and played as token-signed HLS.

## Requirements

- Node.js 22.12+ (developed on Node 24)
- PostgreSQL 14+
- A Bunny Stream library (for protected video; optional in development)

## Setup

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # fill in DATABASE_URL, secrets, seed passwords
npm run db:deploy           # apply migrations (use db:migrate while developing)
npm run db:seed             # roles, permissions, categories, super admin (ADMIN001)
npm run db:seed -- --demo   # optional: demo brands, outlets, users, training, recipes
npm run dev                 # http://localhost:8020/api
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (use 16 bytes for `ENCRYPT_IV`).

The seeded super admin logs in with employee ID `ADMIN001` (or `admin@indoventura.local`) and the
`SEED_ADMIN_PASSWORD` from `.env`, and must change it on first login. Demo users (`TRN001`, `FRN001`,
`INC001`, `TM001`–`TM004`) use `SEED_DEMO_PASSWORD`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode with tsx |
| `npm run build` / `npm start` | Compile to `dist/` and run it (module-alias resolves `@/` and `@core/`) |
| `npm run typecheck` / `lint` / `format` | Static checks (ESLint 9 flat config, Prettier) |
| `npm test` | Jest unit and API guard tests (no database writes) |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed roles, permissions, categories and the super admin |
| `npm run db:studio` | Prisma Studio |

Prisma 7 notes: the connection string lives in `prisma.config.ts`, the client is generated into
`src/generated/prisma` (CommonJS) and uses the `@prisma/adapter-pg` driver adapter. `migrate dev` no
longer seeds or generates automatically — run `db:seed` / `db:generate` yourself.

## Project layout

```
prisma/                 schema.prisma, migrations, seed.ts
src/
  server.ts             entry: loads env, starts HTTP server and the reminder job
  app.ts                express app: helmet, CORS, body parsing, uploads, error handler
  @core/                framework code (enums, helpers, security, services)
    helpers/            prisma client, query helpers, validation, export (CSV/XLSX), mail
    securityService/    password hashing (scrypt), AES, JWT
    services/           logging, responses, Bunny Stream, file storage, notifications, audit, SMS
  app/
    router.ts           route table with auth / permission middlewares
    middlewares/        auth, read/write access, shift window, rate limits
    services/           cross-module domain logic (scope, shift, assignments, media)
    jobs/               reminder cron (due soon, overdue, expired access)
    modules/<name>/     <name>Controller.ts + <name>Routes.ts (+ <name>Service.ts when needed)
```

Conventions follow the original boilerplate: snake_case tables with prefixed columns and the
`_status / _archived / _deleted / _created_by / _updated_by` columns, controllers that return
`sendResponse(res, status, data, message, code)`, list endpoints that accept
`search, status, archived, deleted, limit, offset` and return `{ total, rows }`, and `POST /save`
for create + update.

## Access model

- **Authentication**: login with employee ID, mobile or email. Short access token (15 min) plus a
  refresh token that ends the session after 12 h. Five failed logins lock the account for 15 min.
  Password reset by OTP (SMS + email). Temporary passwords must be changed on first login.
- **Instant revocation**: every token carries `user_token_version`. Deactivating a user, “end all
  sessions”, password changes and logout bump it, so existing tokens fail on the next request.
  `user_access_expires_at` ends access automatically for temporary staff.
- **Permissions**: `sys_module` × `roles` matrix (`module_role_map`) with read/write per screen, checked
  by `readAccessMiddleware` / `writeAccessMiddleware`.
- **Data scope**: `roles.role_scope` limits which users and outlets a role sees — `all`, `brand`,
  `franchise` (outlets owned by the franchisee), `outlet`, `self`.
- **Content audience**: modules and recipes are limited by brand and role.
- **Shift window**: for roles with `role_shift_restricted`, content endpoints (`/learn/*` detail,
  playback, assessments, `/library/*`) only work inside the user's shift (user override or outlet
  default, overnight shifts and working days supported, `SHIFT_GRACE_MINUTES` either side). Video
  links expire at the end of the shift.

| Role | Scope | Shift restricted | Default permissions |
| --- | --- | --- | --- |
| Super Admin | all | no | everything |
| Training Admin | all | no | training, paths, assignments, recipes, categories (write); users, brands, outlets, reports (read) |
| Outlet In-charge | outlet | yes | users, reports (read) |
| Franchisee | franchise | no | users, outlets, reports (read) |
| Team Member | self | yes | own training and recipes only |

## Training model

- `training_modules` hold audience and rules; content lives in `module_versions` (lessons, files,
  questions, options). Published versions are immutable — editing creates a draft copy.
- Publishing a new version asks what happens to learners: **none** (minor fix), **reacknowledge**
  (completed learners acknowledge the updated SOP) or **retrain** (completed learners redo the
  module). Open assignments move to the new version; completed ones stay linked to the version that
  was completed and a new retraining assignment is created.
- An assignment completes only when all required lessons are done, the assessment is passed (if
  any) and the SOP is acknowledged. Video credit comes from server-side heartbeats that only count
  continuous forward playback (no credit for skipping ahead or idle tabs).
- Assessments: single, multiple-answer and written (recorded, not scored) questions, pass mark,
  attempt limit, random subset and shuffled options. Answers are revealed only after passing or
  running out of attempts. Running out of attempts marks the assignment failed and notifies the
  manager; managers assign retraining.

## Bunny Stream setup

1. Create a Stream library; copy the library ID, API key and read-only API key.
2. In the library's pull zone enable **Token authentication** and copy the token key; set
   `BUNNY_STREAM_CDN_HOSTNAME` to the pull zone host (`vz-….b-cdn.net`).
3. Optionally enable MediaCage DRM and block direct file access / allowed referrers in Bunny.
4. Set the webhook URL to `https://<api-host>/api/webhook/bunny` (signature verified with the
   read-only key). Without webhooks, the admin “check status” button polls Bunny.

Uploads go straight from the browser to Bunny over TUS with a short-lived signature; the API key
never reaches the browser. Playback uses Bunny's HMAC-SHA256 directory tokens so HLS segments inherit
authorisation. Images and PDFs are stored under `STORAGE_PATH` and served through expiring signed URLs.

## API overview

All routes are under `/api`. Auth uses `Authorization: Bearer <access token>`.

| Prefix | Who | Highlights |
| --- | --- | --- |
| `/auth` | public | `login`, `access-token`, `forgot-password`, `verify-otp`, `reset-password`, `change-password`, `logout` |
| `/home`, `/master` | any user | dashboard counts, profile + permission map, dropdown lists |
| `/learn` | learner | `assignments`, `available`, `history`, `assignment/:id`, `lesson/play`, `lesson/progress`, `lesson/complete`, `attempt/start`, `attempt/submit`, `acknowledge` |
| `/library` | learner | recipe search, recipe detail, recipe playback |
| `/notification` | any user | list, mark read |
| `/user` `/role` `/brand` `/outlet` `/category` | permission | CRUD; users also `transfer`, `deactivate`, `reactivate`, `force-logout`, `reset-password` |
| `/training` | permission | modules, versions (draft, save, publish, discard), lessons, questions, reorder, archive |
| `/path` `/assignment` | permission | training paths; assign to people or groups, deadlines, revoke, retrain |
| `/recipe` `/media` | permission | recipes (save, publish, revisions); Bunny uploads/registration, file uploads |
| `/report` | permission | dashboard, completion by employee/outlet/brand/role/module, overdue/failed/attempt lists, user history, CSV/XLSX export |
| `/audit` | permission | audit log |
| `/file/:id`, `/webhook/bunny` | signed | file download with expiring signature; Bunny status webhook |

## Production (no Docker)

1. `npm ci && npm run build && npm run db:deploy && npm run db:seed`
2. Run `node -r module-alias/register dist/server.js` under a process manager (systemd or PM2) with
   `MODE=production`, behind Nginx/Caddy with HTTPS (`trust proxy` is enabled).
3. Back up PostgreSQL (e.g. nightly `pg_dump`) and the `STORAGE_PATH` folder.
4. Configure SMTP (`MAIL_*`) and plug an SMS gateway into `src/@core/services/SmsService.ts` for OTPs.
