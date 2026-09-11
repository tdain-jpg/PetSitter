# Two homes, one account — ✅ BUILT 2026-09-08/09/11

> All four steps shipped. Kept for the reasoning, not as a to-do.
> Commits: 0d384ba (steps 1-2), d1f72b7 (step 3), 0a477d2 (step 4).

Written after QA. Three findings were the same finding:

- **QA-601** a sitter who signs up lands in the pet-OWNER wizard, and skipping it
  drops them on an owner dashboard whose every Quick Action is an owner task.
- **QA-603** an owner cannot find where to manage their sitters. It is inside
  Household, which reads as "family".
- **QA-604** the sitter's Today screen needs guessing.

One cause: **there is one home screen, built for owners, with sitter features
buried inside it.** Every sitter feature we add makes this worse, and we just
added three.

## The constraint that makes this interesting

A person can be both. Someone who owns two dogs and also sits for their
neighbour is an ordinary user, not an edge case, and the app must never make
them choose an identity or visit Settings to switch. `profiles.role` (migration
0028) is a LANDING PREFERENCE, not a permission — it decides which home opens,
never what anyone may see. RLS decides that and must keep deciding it.

## The shape

**Two homes, one switch.**

`OwnerHome` — today's Home, unchanged in substance: pets, guides, quick actions.

`SitterHome` — exists already but is a client list. It becomes a real home:
Today across all clients first (that is the sitter's actual question), then the
client list, then invite a client, then plans.

**The switch** sits in the header, and only appears for someone who is
demonstrably both: they have their own pets AND an active sitter connection.
For everyone else there is no switch, because there is nothing to switch
between, and a control that does nothing is worse than no control.

Landing rule, in order:
1. `profiles.role` if set
2. otherwise: active sitter connections and no pets of their own -> sitter home
3. otherwise -> owner home

Point 2 matters: it fixes the existing sitters who signed up before roles
existed, without a backfill and without asking them anything.

## What moves

| Now | Becomes |
|---|---|
| Pet Sitters, inside Household | Its own Quick Action on the owner home |
| Today, a button inside My Clients | The first thing on the sitter home |
| Invite a client, below the client list | A Quick Action on the sitter home |
| Owner wizard for everyone | Sitter-role accounts skip it entirely |

## Sequence

1. ✅ Sitter-role accounts never see the owner onboarding wizard. Shipped with a
   second path: active clients and no pets of their own also counts as a sitter,
   which covers everyone who predates the role column without a backfill.
2. ✅ Pet Sitters promoted. It turned out the button was already on the owner
   home and going to the right screen — it was called "Invite a Sitter", which
   reads as an action rather than a place. The architecture was right and the
   label was lying about it.
3. ✅ SitterHome leads with Today, as a live count rather than a link.
4. ✅ The switch. "🐾 Sitting" on the owner home, "🏠 My pets" on the sitter
   home, each shown only to somebody demonstrably both.

## Deliberately not in scope

A tab bar. It is the obvious answer and the wrong one here: it costs permanent
vertical space on every screen to serve a minority who are both, and the app is
PWA-first on phones. The header switch appears only for those people.

## Also outstanding, unrelated to this

~~**Back controls are inconsistent.**~~ ✅ DONE 2026-09-11 (11695f8). Resolved the
other way round from the guess here: the NINE ScreenHeader screens were changed
to match the SEVENTEEN hand-rolled ones. Converting seventeen bespoke headers
would have rewritten the most-used layouts in the app, several of which carry a
right-hand action ScreenHeader has no slot for, to fix something purely visual.
One file instead of seventeen.

~~**Export / import.**~~ ✅ DONE 2026-09-09 (047022a), built as described below.
Original note follows. JSON import is a developer's answer to a user's problem.
Nobody moving in with a partner thinks "I will export my pets as JSON". Keep
export (a real get-my-data-out promise, and cheap to honour); replace import
with a **merge household** flow: enter the other person's email, they confirm,
their pets and guides move across. Same underlying operation, described in
words a person would use.

~~**Settings shows "Role: User" to everybody.**~~ ✅ DONE 2026-09-11 (11695f8).
The field and its UserRole type are both gone. `User.role` is hardcoded to
'user' in AuthContext and read from nowhere. It is a leftover that displays a
meaningless word on a screen people read when they are confused. Delete it.
