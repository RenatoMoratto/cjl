# Coral Jovem de Londrina

The website of the Coral Jovem de Londrina (CJL), live at
[coraljovemlondrina.com.br](https://coraljovemlondrina.com.br).

Choristers use it to rehearse with the **voice kits**: each song is recorded
once per voice, and the player shows its lyrics in sync. They also use it to
check the rehearsal agenda. The site can be installed as an app, and it keeps
working offline.

An admin panel at `/admin` is where songs, voice kits, lyrics and the agenda
are managed. It has its own guide: [docs/admin.md](docs/admin.md).

- [Stack](#stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Deploying](#deploying)
- [Maintenance](#maintenance)

## Stack

- [Next.js 15](https://nextjs.org) (Pages Router), React 19, Tailwind CSS 3, SWR
- [Neon](https://neon.tech) Postgres through [Drizzle ORM](https://orm.drizzle.team)
  for songs, voice kits and the agenda
- [Cloudflare R2](https://developers.cloudflare.com/r2/) for the MP3s
- [NextAuth](https://next-auth.js.org) with Google, used only for the admin sign-in
- Hosted on [Vercel](https://vercel.com), with Vercel Analytics

## Getting started

You need Node 22, which `.nvmrc` pins as `lts/jod`.

```bash
nvm use
npm install
cp .env.example .env.local
npm run dev
```

Then open <http://localhost:3000>.

What you put in `.env.local` depends on what you are working on.
[.env.example](.env.example) explains every variable.

| To work on                 | Set in `.env.local`                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Home page, splash, styling | nothing                                                                                                             |
| Song lists, player, agenda | `DATABASE_URL`, `R2_PUBLIC_URL`                                                                                     |
| The admin panel            | all of the above, plus the other `R2_*`, `GOOGLE_*`, `NEXTAUTH_SECRET`, `ADMIN_EMAILS` and `ADMIN_API_ENABLED=true` |

These variables point at real services. If `DATABASE_URL` and the R2
credentials are the production values, then saving in your local admin panel
changes the live site.

Things to know when working locally:

- **Use port 3000.** The R2 CORS policy and the Google OAuth client both allow
  `http://localhost:3000` and no other local origin. On any other port, saving
  songs offline, downloading MP3s and uploading kits all fail, and Google
  refuses the sign-in.
- **The service worker only runs in production builds.** To test offline
  support, run `npm run build && npm start`. Stop `npm run dev` first: both
  commands write to `.next`, and a build under a running dev server leaves it
  stuck in a reload loop. If that happens, stop the server, delete `.next` and
  start it again.
- **The opening animation** only plays when the app is launched from the home
  screen. To see it in a browser, add `?splash` to any URL.

## Scripts

| Command                                   | What it does                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                             | Starts the dev server on port 3000                                                    |
| `npm run build` / `npm start`             | Builds the site for production / serves that build                                    |
| `npm test`                                | Runs the unit tests (`src/**/*.test.ts`) with Node's test runner. Needs no env        |
| `npm run typecheck`                       | Type-checks with `tsc --noEmit`                                                       |
| `npm run lint`                            | Runs ESLint                                                                           |
| `npm run lint:check` / `npm run lint:fix` | Checks / fixes formatting with Prettier                                               |
| `npm run db:generate`                     | Writes a migration to `drizzle/` from changes in `src/lib/db/schema.ts`               |
| `npm run db:migrate`                      | Applies pending migrations to `DATABASE_URL`                                          |
| `npm run db:studio`                       | Opens Drizzle Studio on `DATABASE_URL`                                                |
| `npm run r2:cors`                         | Applies the bucket's CORS policy (see [Maintenance](#maintenance))                    |
| `npm run r2:purge`                        | Deletes R2 objects that nothing references any more                                   |
| `npm run optimize:audio`                  | Re-encodes the MP3s in `audio-staging/` at 128 kbps (see [Maintenance](#maintenance)) |

The scripts in `scripts/` read `.env.local`, so they act on whatever database
and bucket it points at.

## Project layout

```text
src/
  pages/              routes; pages/api/ is the HTTP API
    kits/             voice → song list → player
    admin/            the admin panel (docs/admin.md)
    api/admin/        admin API, every route behind withAdminRoute
  components/         UI; admin/ and splash/ hold their own components
  hooks/              audio player, offline songs, install prompt, uploads
  lib/                database, R2, auth, CDN cache, validation, helpers
  services/           what the API routes call to read and change songs and the agenda
  types.tsx           types shared by the API and the pages
public/
  sw.js               the service worker (offline support)
  manifest.webmanifest, icons/, splash/   the installable app
drizzle/              SQL migrations, generated from src/lib/db/schema.ts
scripts/              maintenance scripts, run with tsx
```

## How it works

### Pages

| Route                  | What it shows                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `/`                    | Home page: a link to the kits, social media and an install button                    |
| `/kits`                | Choose a voice                                                                       |
| `/kits/[voz]`          | The songs that have a kit for that voice. "Tocar todas" plays them one after another |
| `/kits/[voz]/[musica]` | The player and the lyrics for one song                                               |
| `/agenda`              | Upcoming rehearsals and presentations                                                |

`voz` is one of `soprano`, `contralto`, `tenor`, `baixo` or `todos` (all
voices mixed). `musica` is the song id. Choristers share these links, so a song
id must never change. The order of the song list is stored separately, in
`songs.position`.

On the song page, the ⋯ menu holds the reading settings (synced lyrics, text
size, alignment), the playback speed, the "Ouvir sem internet" switch, "Baixar
MP3", copy lyrics, "Modo apresentação" and "Compartilhar". Presentation mode
fills the screen (the browser's full screen where it has one) with the lyrics
in large type for the choir to sing along on a projector or TV. The player
stays at the bottom, and the song keeps playing as it opens and closes. ✕ or
Esc closes it. "Compartilhar" opens the phone's share sheet with the song's
link, for the voice being played. Where the browser has no share sheet, it
copies the link.

### Link previews

Apps such as WhatsApp read a shared link's HTML to show its preview, without
running its scripts. The pages are prerendered, so that HTML only names the
site. `next.config.ts` sends those apps, recognised by their user agent
(`LINK_PREVIEW_AGENTS`), to `/api/musicas/[id]/previa`, which answers with the
song's title and voice. Browsers still get the page. An app missing from the
list shows the site's generic preview. To see what an app gets:

```bash
curl -A WhatsApp https://coraljovemlondrina.com.br/kits/soprano/1
```

### Data

Neon stores the songs, their lyrics (as `jsonb`), the voice kits and the
agenda. The schema is in `src/lib/db/schema.ts`.

The MP3s are stored in a public R2 bucket. The database stores only the
**object key** of each kit, such as `songs/<slug>/<voice>-<hex>.mp3`, never a
full URL. The API builds the URL from the key and `R2_PUBLIC_URL`, so the audio
host can change with an env var and no code change. Audio is cached for a year
as `immutable`, which is why replacing a kit always writes a new key.

The pages are static, and they load their data from three public endpoints:

| Endpoint                | Returns                               |
| ----------------------- | ------------------------------------- |
| `GET /api/musicas`      | The active songs, in list order       |
| `GET /api/musicas/[id]` | One song with its lyrics and kit URLs |
| `GET /api/agenda`       | `{ events }` from today onwards       |

Vercel's CDN caches these endpoints
(`s-maxage=300, stale-while-revalidate=86400`), which also hides Neon's cold
start. Each response is tagged, and every admin change invalidates the tags it
touched, so edits show up without waiting for the cache to expire (see
`src/lib/cache.ts`). There is no edge cache outside Vercel.

The service worker serves cached copies of these responses offline, and it
keeps them across deploys. So you can **add** fields to a response, but never
rename or remove one.

Agenda dates and times are Londrina wall-clock values with no time zone.
`/api/agenda` lists events from today in `America/Sao_Paulo`, so an evening
rehearsal stays listed until midnight local time, not until 21:00 UTC.

### Offline and the installed app

`public/sw.js` is registered from `_app.tsx`, in production only, as
`/sw.js?build=<buildId>`. Because of the build id, each deploy installs a fresh
worker. The worker keeps three caches:

| Cache             | Holds                                                         |
| ----------------- | ------------------------------------------------------------- |
| `cjl-app-<build>` | The public pages and their JS, CSS and images, for this build |
| `cjl-data`        | The song list and the agenda, kept across deploys             |
| `cjl-songs`       | The songs saved for offline listening                         |

The five songs a chorister opened most recently are saved for offline
listening automatically (`src/hooks/useOfflineSongs.ts`). The "Ouvir sem
internet" switch removes a song from that set or adds it back.

All the public pages are prerendered, so every URL of a dynamic route gets the
same HTML. The worker caches each route once (see `ROUTES` in `sw.js`). **If
you add a public page, add it to `ROUTES` too**, or it will not open offline.

The manifest and icons make the site installable. On iOS, the installed app
also needs a launch image for each exact screen size. Those images are in
`public/splash/`, and `_document.tsx` lists them. The opening animation in
`src/components/splash/` plays once each time the installed app is launched.

## Deploying

Vercel builds and hosts the site. Before you ship:

- **Run migrations first.** Nothing runs them during the build. Run
  `npm run db:migrate` against the production database before you deploy code
  that needs the new schema.
- **Env vars:** `DATABASE_URL` and the `R2_*` variables go in every
  environment. The admin variables (`ADMIN_API_ENABLED`, `GOOGLE_*`,
  `NEXTAUTH_SECRET`, `ADMIN_EMAILS`) go on **Production only**, as
  [docs/admin.md](docs/admin.md#environment) explains. Vercel does not need
  `NEXTAUTH_URL`.
- **A new domain** must be added to `ALLOWED_ORIGINS` in
  `scripts/configure-r2-cors.ts` (then run `npm run r2:cors`), and to the
  Google OAuth client.

## Maintenance

### R2 bucket CORS

`npm run r2:cors` applies the bucket's CORS policy. Without it, these break:
saving songs offline, downloading MP3s, and uploading kits from the admin
panel. Run it after you change `ALLOWED_ORIGINS` in
`scripts/configure-r2-cors.ts`.

The R2 token needs **Admin Read & Write** to apply the policy. If yours does
not have it, the script still prints the policy, and you can paste it into
Cloudflare under R2 → the bucket → Settings → CORS policy.

### Orphaned audio

Deleting or replacing a kit never deletes from R2 right away. It queues the old
object in `pending_object_deletions` with a 7-day grace period, so a chorister
who is in the middle of listening is not cut off.
`npm run r2:purge -- --dry-run` lists what is due, and `npm run r2:purge`
deletes it. You never have to run it urgently: skipping it only costs storage.
More in [docs/admin.md](docs/admin.md#replacing-and-deleting).

### Health check

```bash
npx tsx scripts/verify-migration.ts
```

This script checks three things: that the database is consistent, that every
kit points at an R2 object of the right size, and that those objects are
publicly readable with range requests (the player needs range requests to
seek). Run it before anything destructive. It exits non-zero on failure.

### Shrinking an MP3

New songs and kits are added in the admin panel, which accepts MP3s up to
30 MB. To make a large file smaller first, put it in
`audio-staging/<slug>/<voice>.mp3` and run `npm run optimize:audio`. The
re-encoded file appears in `audio-staging-optimized/`, ready to upload. Git
ignores both folders.
