# Switchback

Park charades for the standby line.

A phone-on-your-forehead guessing game built for the specific situation Play
Disney Parks used to cover and no longer will: forty minutes in a queue with
people you came with. Play Disney Parks retires on 16 September 2026; this is
not a clone of it, and deliberately so — see [Content and IP](#content-and-ip).

## What v1 is

- **Five decks**, 24 original prompts each: Ride It, Snack Bar, Queue Life,
  Backstage, Souvenir Stand.
- **60 / 90 / 120 second rounds.** Bank a card or pass; clearing the whole deck
  ends the round early and says so.
- **Two control schemes.** Tilt the phone down to bank and up to pass, or tap
  the bottom and top of the screen. Tilt is opt-in, because iOS only grants
  motion access from a user gesture and some devices never grant it at all.
- **A local leaderboard per deck.** Top 25, ties broken toward whoever needed
  fewer cards.
- **Offline.** No backend, no network calls, no accounts. The service worker
  serves the whole app from cache, which is the normal case in a queue inside a
  concrete building.

Deliberately **not** in v1, and scoped for later: BLE beacon proximity, and
land-wide or park-wide scoring. Both have seams waiting for them — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Running it

```bash
npm install
npm start          # Expo dev server; press w for web
npm run web        # straight to the browser
```

Tilt needs a real phone on `https://` (or `localhost`). Desktop browsers fall
back to tap controls automatically.

## Building the PWA

```bash
npm run build:web  # expo export -p web, then the PWA head/SW injection
npx http-server dist -p 8099
```

`dist/` is a static site. `scripts/postbuild-web.js` injects the manifest link,
theme colour, favicons, iOS standalone metas, `viewport-fit=cover` and the
service worker registration into the exported `index.html`; it is idempotent, so
re-running over the same `dist/` does nothing.

Deploying anywhere static works. The SPA needs all routes served the same
`index.html` — `public/_redirects` covers Netlify-style hosts.

## Checks

```bash
npm test           # 24 unit tests over the round machine, tilt math, board
npm run typecheck  # tsc --noEmit
npm run icons      # regenerate public/icons/* from scripts/make-icons.js
```

The tests cover the parts that are hard to check by hand: round timing and
end conditions, tilt hysteresis across screen rotations, and board ranking and
persistence. Everything they exercise is pure — no device, no timers, no
rendered tree.

## Content and IP

Every prompt is original and generic theme-park culture. No park, ride,
character, film or product name appears in any deck, and none should be added:
the app's whole reason to exist is being the queue game that doesn't depend on
somebody else's licence. `tests/decks.test.ts` enforces this with a name check
that fails the build if a third-party mark slips into a prompt.

## Layout

```
src/core/       pure TypeScript rules — no React, no React Native, no DOM
src/platform/   adapters: storage, leaderboard, tilt, haptics, wake lock
src/ui/         screens, components, the hook that drives a round
scripts/        icon generation and the PWA postbuild step
tests/          unit tests over src/core and src/platform
```
