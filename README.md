This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Song management API

Server-side CRUD for songs and voice kits, plus the admin UI at `/admin` that
drives it. Both are **switched off by default** and require a signed-in,
allowlisted Google account — see "Security" below.

Songs live in Neon; the MP3s live in Cloudflare R2 and the database stores only
object keys, never URLs.

### Layout

| Path                              | Role                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `src/lib/validation/songs.ts`     | Zod schemas — the only place external input is trusted from |
| `src/lib/object-keys.ts`          | Builds and validates R2 keys                                |
| `src/lib/r2.ts`                   | Presign, HEAD, delete. Never streams audio                  |
| `src/lib/cache.ts`                | Public CDN cache tags and their invalidation                |
| `src/lib/api/admin.ts`            | The guard every admin route goes through                    |
| `src/lib/auth/admins.ts`          | The allowlist and the 404/401/403 policy                    |
| `src/lib/auth/options.ts`         | NextAuth configuration (Google, JWT session)                |
| `src/lib/auth/page.ts`            | `withAdminPage`, the guard for `/admin/*` pages             |
| `src/lib/api/client.ts`           | The browser's typed client for `/api/admin`                 |
| `src/lib/lyrics.ts`               | Timecode parsing and line helpers for the lyrics editor     |
| `src/services/songs.ts`           | Song create/update/delete/reorder                           |
| `src/services/tracks.ts`          | Kit upload/replace/delete                                   |
| `src/services/storage-cleanup.ts` | Deferred deletion of orphaned R2 objects                    |

### Endpoints

```text
GET    /api/admin/songs             every song, inactive included
POST   /api/admin/songs             create a song (metadata only)
GET    /api/admin/songs/:id         one song
PATCH  /api/admin/songs/:id         update metadata
DELETE /api/admin/songs/:id         delete song, kits and (later) objects
POST   /api/admin/songs/reorder     rewrite the public list order
POST   /api/admin/tracks/upload-url step 1 — presign an upload
POST   /api/admin/tracks            step 3 — persist the uploaded kit
DELETE /api/admin/tracks/:id        remove one voice kit
```

### Admin UI

| Route                      | What it does                                    |
| -------------------------- | ----------------------------------------------- |
| `/admin/entrar`            | Google sign-in. The only unguarded admin page   |
| `/admin`                   | Song list: status, order, delete                |
| `/admin/musicas/nova`      | Create a song                                   |
| `/admin/musicas/:id`       | Metadata and the five voice-kit slots           |
| `/admin/musicas/:id/letra` | Time the lyric against the song's own recording |

**Ordering** is edited with the arrow buttons (or `Alt+↑`/`Alt+↓`) and saved
explicitly. The request always carries _every_ song id in its new order, never
a filtered view: the server rejects a list that has drifted from the database,
which is what stops a stale tab from dropping a song it never saw to the end.
If that happens the UI says so and offers a reload.

**Changing a slug does not rewrite existing object keys.** Kits already uploaded
keep the old slug in their path and keep working; only later uploads pick up the
new one. The form says so when it matters.

**The lyrics editor** plays the song's own kit and stamps the audio element's
clock — not React state, which only moves about four times a second — onto the
selected line:

| Key            | Action                            |
| -------------- | --------------------------------- |
| `Space`        | play / pause                      |
| `Enter` or `T` | stamp this line, move to the next |
| `↑` / `↓`      | change the selected line          |
| `[` / `]`      | nudge the stamp by ∓0.1 s         |
| `Backspace`    | clear the stamp                   |
| `S`            | mark the line as a solo           |

Every shortcut also has a button, and none of them fire while an input is
focused. Paste the whole lyric first, then play and tap down the lines.

The preview beside the editor is the chorister's own `TextReader`, unmodified.
It decides which line is active by looking at the _next_ line's stamp, so a line
timed earlier than the one above it highlights out of order — the editor flags
those and offers "Ordenar por tempo".

### Uploading audio

The MP3 never passes through Vercel. Uploads are three steps:

1. `POST /api/admin/tracks/upload-url` with the song, voice, filename, content
   type and size. The server validates the request, mints a fresh object key
   and returns `{ uploadUrl, objectKey, requiredHeaders, expiresAt }`.
2. The browser `PUT`s the file to `uploadUrl` with **exactly** the headers in
   `requiredHeaders` — they are covered by the signature, so anything else is
   rejected by R2.
3. `POST /api/admin/tracks` with `{ songId, voice, objectKey }`. The server
   confirms the object is really in the bucket and within limits, and only then
   writes the row.

Nothing is written to the database before step 3, so an abandoned upload leaves
an unreferenced object rather than a song pointing at missing audio.

Direct browser uploads need the bucket to accept `PUT`; run `npm run r2:cors`
after deploying this for the first time.

### Replacing and deleting

Replacing a kit always writes a **new** object key. Audio is served with
`max-age=31536000, immutable`, so overwriting a cached key would strand
listeners on the old file with no way to refresh it.

Deletes never touch R2 inline. The reference is dropped in Postgres and the
orphaned key is queued in `pending_object_deletions` in the same transaction;
`npm run r2:purge` deletes objects whose grace period (7 days) has elapsed,
after re-checking that nothing references them again.

The ordering is deliberate: an orphaned object costs a little storage and is
invisible, whereas a row pointing at a deleted object is a player that silently
fails. Run `npm run r2:purge -- --dry-run` to see what is due.

### Google OAuth setup

Google Cloud Console → **APIs & Services → Credentials → Create credentials →
OAuth client ID → Web application**.

- Authorized JavaScript origins: `https://coraljovemlondrina.com.br`,
  `http://localhost:3000`
- Authorized redirect URIs: `https://coraljovemlondrina.com.br/api/auth/callback/google`,
  `http://localhost:3000/api/auth/callback/google`

The consent screen needs only the default `email` and `profile` scopes, so no
Google verification review is required. Keep it in "Testing" with the admins as
test users, or publish it.

Copy the client id and secret into `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`, generate `NEXTAUTH_SECRET` with `openssl rand -base64
32`, and list the admins in `ADMIN_EMAILS`. **Paste each address exactly as
Google shows it** — a Gmail dot or plus alias is a different string even though
it reaches the same inbox, and the id token always returns the canonical form.

### Security

Two latches stand in front of every mutation, and both are applied in
`requireAdmin` in `src/lib/api/admin.ts`:

1. `ADMIN_API_ENABLED` must be exactly `"true"`, or every `/api/admin` route —
   and `/api/auth` and every `/admin` page — answers `404`.
2. A Google session whose email is in `ADMIN_EMAILS`.

| Situation                               | Answer |
| --------------------------------------- | ------ |
| Kill switch off                         | `404`  |
| Enabled, no session                     | `401`  |
| Enabled, session, email not on the list | `403`  |

`404` for the switch because the surface genuinely does not exist in that
deployment, and a `403` would only advertise that it is there and merely
switched off. `401` and `403` once it is on, because there is now an identity to
challenge and a sign-in page to send people to.

The allowlist is checked **on every request**, not only at sign-in, so removing
an address revokes access immediately rather than whenever the session happens
to expire (8 hours). That is what the `403` branch almost always means in
practice.

`requireAdmin` is the only way in: every route goes through `withAdminRoute`,
and there is no way to add one that skips it. The `/admin` pages go through
`withAdminPage` in `src/lib/auth/page.ts`, which shares the same
`decideAdminAccess` policy — unit tested in `src/lib/auth/admins.test.ts` — so
the API and the UI cannot drift on who gets in.

**To grant or revoke access**, edit `ADMIN_EMAILS` and redeploy. An empty or
unset list admits nobody: it fails closed.

**On Vercel, set these on Production only.** Preview deployments get a fresh
hostname per deploy, which Google will refuse as an unregistered redirect URI;
leaving the kill switch unset there means previews have no admin surface at all.
`NEXTAUTH_URL` is not needed on Vercel — the origin is derived from the
forwarded host.

There is deliberately no `middleware.ts`. It would run on the Edge runtime,
where `getServerSession` does not work, so it would need a second copy of the
allowlist rule at the edge — exactly the drift the single chokepoint exists to
prevent — while the API would still have to re-check anyway.

### Database

The migration in `drizzle/0001_*.sql` adds `songs.position` (explicit list
ordering, backfilled from the id) and the `pending_object_deletions` table.
Apply it with `npm run db:migrate` before running this code; the public
`/api/musicas` endpoint orders by `position` and will fail until it is applied.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
