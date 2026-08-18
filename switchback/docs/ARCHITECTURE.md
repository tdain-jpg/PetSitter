# Architecture

The brief was "PWA first, with build choices that make an app pivot simple."
That shaped two decisions, and everything else follows from them.

## 1. Expo + React Native Web, not a web-only stack

The app is written once in React Native and exported to the web with
`expo export -p web`. The same source runs natively via `expo run:ios` /
`expo run:android` with no rewrite — the pivot is a build target, not a port.

This is also the stack the sibling `petsitter/` app in this repo already uses,
including its PWA postbuild step, so the pattern is proven here rather than
assumed.

The cost is honest: web bundles are larger than a hand-rolled web app would be
(~620 kB of JS), and a handful of web APIs need adapters. Given the app must
work offline and is cached after first load, bundle size matters far less than
not writing the game twice.

## 2. Three layers, and the boundary is enforced by imports

```
src/core/       pure TypeScript. No React. No React Native. No DOM.
src/platform/   every platform API the app touches, behind an interface.
src/ui/         screens and components. Talks to core and platform, never to
                a platform API directly.
```

`src/core` holds the round state machine, tilt gesture math, deck content and
board ranking. It is the layer that survives the native pivot untouched, and
the layer a server can import verbatim when scoring goes multiplayer. It is
also why the test suite needs no device and no renderer.

`src/platform` is where the pivot actually happens. Each adapter is an
interface with a web implementation and an obvious native counterpart:

| Adapter | Web today | Native later |
| --- | --- | --- |
| `storage.ts` | AsyncStorage (localStorage) | AsyncStorage (unchanged) |
| `tiltSensor.ts` | `DeviceOrientationEvent` | `expo-sensors` `DeviceMotion` |
| `haptics.ts` | `navigator.vibrate` | `expo-haptics` |
| `wakeLock.ts` | `navigator.wakeLock` | `expo-keep-awake` |
| `leaderboardStore.ts` | local, per deck | a remote board, same interface |

`src/platform/services.ts` is the single wiring point. Screens import
`leaderboard` and `settings` from there rather than constructing stores, so
repointing the board is a one-line change in one file.

## Where the deferred features plug in

**BLE beacons.** The captured beacon data is out of scope for v1 by design, but
nothing here forecloses it. It arrives as a new adapter — `platform/proximity.ts`
exposing something like `nearestQueue(): Promise<QueueId | null>` — plus a pure
`core/proximity.ts` that maps a beacon reading to a location. Web Bluetooth
cannot do passive beacon scanning, so this is the first feature that genuinely
*requires* the native build; the adapter split is what lets the web app keep
running with a null implementation while the native one uses real radios.

**Land-wide and park-wide scoring.** The leaderboard is deliberately async and
deck-scoped already. `core/leaderboard.ts` holds the comparator, so a server
orders a shared board the same way a phone orders a local one. What a remote
board adds is identity and a submission endpoint, not new ranking rules.

## Smaller decisions worth knowing

- **The router is a tagged union in `App.tsx`,** not a navigation library. Four
  screens in a linear flow with no meaningful back stack didn't justify the
  dependency. The comment in that file marks where one would go.
- **The round machine never reads the clock.** `tick(state, now)` takes `now`
  as an argument, and the playable window is anchored to the scheduled start
  rather than to whenever the tick arrived, so a late frame can't hand the
  player extra seconds.
- **Tilt calibrates against the player's own resting posture** instead of an
  absolute device frame, because how the phone sits at someone's forehead
  depends on their arm, not on the world. Verdicts fire with hysteresis so a
  wobbling hand can't machine-gun through the deck.
- **The service worker is cache-first, including navigations.** With no backend
  and a local board there's nothing to be stale about, and a queue is exactly
  where the network fails.
- **Icons are generated, not checked in as binaries** (`scripts/make-icons.js`,
  a dependency-free PNG encoder), so a palette change regenerates the set.
