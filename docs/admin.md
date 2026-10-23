# Admin panel

The admin panel at `/admin` and the API behind it at `/api/admin` manage the
songs, voice kits, lyrics and agenda. Both are **off by default**. To get in,
you need a signed-in Google account that is on an allowlist.

- [Setting it up](#setting-it-up)
- [Using it](#using-it)
- [Access control](#access-control)
- [Uploading audio](#uploading-audio)
- [Replacing and deleting](#replacing-and-deleting)
- [API](#api)
- [Code map](#code-map)

## Setting it up

### Google OAuth client

Create the client in Google Cloud Console under **APIs & Services →
Credentials → Create credentials → OAuth client ID → Web application**:

- Authorized JavaScript origins: `https://coraljovemlondrina.com.br`,
  `http://localhost:3000`
- Authorized redirect URIs:
  `https://coraljovemlondrina.com.br/api/auth/callback/google`,
  `http://localhost:3000/api/auth/callback/google`

The consent screen needs only the default `email` and `profile` scopes, so
Google does not require a verification review. Either keep it in "Testing" with
the admins added as test users, or publish it.

### Environment

| Variable               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `ADMIN_API_ENABLED`    | Exactly `true`. Anything else turns the admin surface off |
| `GOOGLE_CLIENT_ID`     | From the OAuth client                                     |
| `GOOGLE_CLIENT_SECRET` | From the OAuth client                                     |
| `NEXTAUTH_SECRET`      | `openssl rand -base64 32`                                 |
| `ADMIN_EMAILS`         | Comma-separated Google addresses                          |

The admin panel also needs the `DATABASE_URL` and `R2_*` variables that the
rest of the site uses. Uploads also need the bucket's CORS policy (run
`npm run r2:cors`, as the README explains).

**On Vercel, set the admin variables on Production only.** Every preview
deployment gets a new hostname, and Google refuses any redirect URI that is not
registered. With the switch unset, previews have no admin surface at all.
Vercel does not need `NEXTAUTH_URL`, because NextAuth reads the origin from the
forwarded host.

### Granting and revoking access

To grant or revoke access, edit `ADMIN_EMAILS` and redeploy. The list is checked
on every request, not only at sign-in. So when you remove an address, that
person loses access immediately, not when their 8-hour session expires. If the
list is empty or unset, nobody gets in.

**Paste each address exactly as Google shows it.** A Gmail address with an
added dot or `+alias` reaches the same inbox, but it is a different string.
Google always sends the canonical form, so an address typed with a dot or alias
never matches.

## Using it

| Route                      | What it does                                      |
| -------------------------- | ------------------------------------------------- |
| `/admin/entrar`            | Google sign-in. The only admin page with no guard |
| `/admin`                   | The song list: status, order, delete              |
| `/admin/musicas/nova`      | Create a song                                     |
| `/admin/musicas/:id`       | A song's details and its five voice-kit slots     |
| `/admin/musicas/:id/letra` | Time the lyrics against the song's own recording  |
| `/admin/agenda`            | Create, edit and delete agenda events             |

**Ordering.** Move songs with the arrow buttons (or `Alt+↑` / `Alt+↓`), then
save. The save always sends _every_ song id in the new order, even when the
view is filtered. If the list in the request no longer matches the database,
the server rejects it. This stops a stale tab from pushing a song it never saw
to the end of the list. When that happens, the page says so and offers to
reload.

**Changing a slug does not move existing audio.** Kits that are already
uploaded keep the old slug in their object key, and they keep working. Only
kits uploaded after the change use the new slug. The form points this out when
it matters.

### Lyrics editor

The editor plays the song's own recording. When you mark a line, it records the
time from the audio element's clock, not from React state, which only updates
about four times a second.

| Key            | Action                                     |
| -------------- | ------------------------------------------ |
| `Space`        | Play / pause                               |
| `Enter` or `T` | Mark this line's time and move to the next |
| `↑` / `↓`      | Select another line                        |
| `[` / `]`      | Move the time back / forward by 0.1 s      |
| `Backspace`    | Clear the time                             |
| `S`            | Mark the line as a solo                    |

Each shortcut also has a button, and no shortcut fires while you are typing in
a field. Paste the whole lyrics first, then play the song and mark each line as
it is sung.

The preview next to the editor is the same `TextReader` component that
choristers see. A line is highlighted until the _next_ line's time starts, so a
line timed earlier than the line above it is highlighted out of order. The
editor flags those lines, and "Ordenar por tempo" sorts them by time.

## Access control

Two latches guard every admin route and page:

1. `ADMIN_API_ENABLED` must be exactly `"true"`. Otherwise every `/api/admin`
   route, every `/api/auth` endpoint and every `/admin` page answers `404`.
2. The request needs a Google session whose email is in `ADMIN_EMAILS`.

| Situation                               | Answer |
| --------------------------------------- | ------ |
| Switch off                              | `404`  |
| Switch on, no session                   | `401`  |
| Switch on, signed in, email not on list | `403`  |

The switch answers `404` because in that deployment the admin surface really
does not exist, and a `403` would only reveal that it is there and turned off.
Once the switch is on, `401` and `403` are the right answers, because there is
now an identity to check and a sign-in page to send people to. In practice, a
`403` almost always means the address was removed from the list.

There is exactly one way into an admin route: `withAdminRoute`, in
`src/lib/api/admin.ts`. Every route is wrapped in it. The pages go through
`withAdminPage`, in `src/lib/auth/page.ts`. Both call the same
`decideAdminAccess` function, which `src/lib/auth/admins.test.ts` unit-tests,
so the API and the panel always agree on who gets in.

On top of the identity check, `withAdminRoute` rejects writes from other sites:
it refuses a `POST`, `PATCH` or `DELETE` whose `Sec-Fetch-Site` header is
anything but `same-origin`. This check only ever rejects a request. It never
lets anyone in. After sign-in, the `callbackUrl` can only lead to a path inside
`/admin` (`src/lib/auth/paths.ts`).

The project deliberately has no `middleware.ts`. Middleware runs on the Edge
runtime, where `getServerSession` does not work, so the allowlist rule would
need a second copy at the edge. A second copy is exactly the kind of drift that
the single entry point is there to prevent, and the API would still have to
check again anyway.

## Uploading audio

The MP3 never passes through Vercel. An upload takes three steps:

1. `POST /api/admin/tracks/upload-url` with the song, the voice, and the file's
   name, content type and size. The server validates the request, creates a
   fresh object key and returns
   `{ uploadUrl, objectKey, requiredHeaders, expiresAt }`.
2. The browser `PUT`s the file to `uploadUrl` with **exactly** the headers in
   `requiredHeaders`. The signature covers those headers, so R2 rejects any
   others.
3. `POST /api/admin/tracks` with `{ songId, voice, objectKey }`. The server
   checks that the object is really in the bucket and within the limits
   (an MP3 of 30 MB at most), and only then writes the row.

The database is not touched until step 3. So an abandoned upload leaves an
object that nothing references, rather than a song that points at missing
audio.

## Replacing and deleting

Replacing a kit always writes a **new** object key. Audio is served with
`max-age=31536000, immutable`, so if a cached key were overwritten, listeners
would be stuck on the old file with no way to refresh it.

Deletes never touch R2 straight away. In the same transaction, the server drops
the reference in Postgres and adds the orphaned key to
`pending_object_deletions`. Later, `npm run r2:purge` deletes the objects whose
7-day grace period has passed, after checking again that nothing references
them. Run `npm run r2:purge -- --dry-run` to see what is due.

The order is deliberate. An orphaned object costs a little storage and nobody
sees it. A row that points at a deleted object is a player that silently fails.

## API

```text
GET    /api/admin/songs             every song, inactive ones included
POST   /api/admin/songs             create a song (details only, no audio)
GET    /api/admin/songs/:id         one song
PATCH  /api/admin/songs/:id         update a song's details
DELETE /api/admin/songs/:id         delete a song and its kits (audio is purged later)
POST   /api/admin/songs/reorder     save the public list order
POST   /api/admin/tracks/upload-url upload step 1: get a presigned upload URL
POST   /api/admin/tracks            upload step 3: save the uploaded kit
DELETE /api/admin/tracks/:id        remove one voice kit
GET    /api/admin/agenda            every event, past ones included
POST   /api/admin/agenda            create an event
PATCH  /api/admin/agenda/:id        update an event
DELETE /api/admin/agenda/:id        delete an event
```

Every song and agenda change invalidates the matching public CDN cache (see
`src/lib/cache.ts`).

## Code map

| Path                              | Role                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `src/lib/api/admin.ts`            | `withAdminRoute`, the guard every admin route goes through |
| `src/lib/auth/admins.ts`          | The allowlist and the 404/401/403 policy                   |
| `src/lib/auth/options.ts`         | NextAuth configuration (Google, JWT session)               |
| `src/lib/auth/page.ts`            | `withAdminPage`, the guard for `/admin/*` pages            |
| `src/lib/auth/paths.ts`           | Where a sign-in is allowed to land                         |
| `src/lib/api/client.ts`           | The browser's typed client for `/api/admin`                |
| `src/lib/validation/`             | Zod schemas, the only way external input is trusted        |
| `src/lib/object-keys.ts`          | Builds and validates R2 object keys                        |
| `src/lib/r2.ts`                   | Presign, HEAD and delete. Never streams audio              |
| `src/lib/audio.ts`                | Accepted MP3 types and size limits                         |
| `src/lib/cache.ts`                | Public CDN cache tags and their invalidation               |
| `src/lib/lyrics.ts`               | Timecode parsing and line helpers for the lyrics editor    |
| `src/services/songs.ts`           | Create, update, delete and reorder songs                   |
| `src/services/tracks.ts`          | Upload, replace and delete kits                            |
| `src/services/agenda.ts`          | Create, update and delete agenda events                    |
| `src/services/storage-cleanup.ts` | Deferred deletion of orphaned R2 objects                   |
