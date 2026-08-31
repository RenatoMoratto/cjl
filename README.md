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

Server-side CRUD for songs and voice kits. There is no admin UI yet, and the
routes are **switched off by default** — see "Security" below before enabling
them anywhere.

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

### Security

**These routes have no authentication.** They can create, modify and delete
songs and hand out write access to the R2 bucket.

They answer `404` unless `ADMIN_API_ENABLED=true` is set in the server
environment. That is a deployment kill switch, not a security mechanism: while
the flag is on, anyone who can reach the origin can do anything the admin UI
could.

Before shipping an admin UI, put a real identity check in
`requireAdmin` in `src/lib/api/admin.ts` — every mutation entry point routes
through it — and keep the flag as a second latch.

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
