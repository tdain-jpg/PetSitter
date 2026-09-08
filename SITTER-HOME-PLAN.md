# Two homes, one account (planned 2026-09-08, NOT built)

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

1. Sitter-role accounts never see the owner onboarding wizard. Smallest change,
   fixes the worst symptom, ships alone.
2. Promote Pet Sitters out of Household on the owner home.
3. Rebuild SitterHome as a real home: Today first, then clients, then invite.
4. The switch, for people who are genuinely both.

Steps 1 and 2 are worth doing on their own even if 3 and 4 wait.

## Deliberately not in scope

A tab bar. It is the obvious answer and the wrong one here: it costs permanent
vertical space on every screen to serve a minority who are both, and the app is
PWA-first on phones. The header switch appears only for those people.

## Also outstanding, unrelated to this

**Back controls are inconsistent.** 17 screens hand-roll
`<Button title="← Back" variant="outline">`; 9 use the shared `ScreenHeader`,
which renders a plain arrow at the left edge. Both call `safeGoBack`, so this is
cosmetic, not behavioural. Unifying means converting 17 screens onto
`ScreenHeader` — mechanical but touching 17 layouts, so it wants its own pass
and its own QA, not a corner of someone else's.

**Export / import.** JSON import is a developer's answer to a user's problem.
Nobody moving in with a partner thinks "I will export my pets as JSON". Keep
export (a real get-my-data-out promise, and cheap to honour); replace import
with a **merge household** flow: enter the other person's email, they confirm,
their pets and guides move across. Same underlying operation, described in
words a person would use.

**Settings shows "Role: User" to everybody.** `User.role` is hardcoded to
'user' in AuthContext and read from nowhere. It is a leftover that displays a
meaningless word on a screen people read when they are confused. Delete it.
