# Pawstructions — custom icon commission spec

**Concept: the icons are PETS.** Every icon is a pet character (or a paw-accented glyph where
a full character can't survive the render size). Each animal OWNS a functional domain so the
metaphors stay consistent across the app — the turtle always means shelter/protection, the
bird always carries messages, and so on.

## The cast

| Character | Domain | Notes |
|---|---|---|
| **Dog** | core helper: guides, docs, play, celebration | the everyman of the set |
| **Cat** | watching & hiding: reveal/hide, evening, feeding | |
| **Turtle** ⭐required | shelter & protection: home, insurance, privacy | shell = house |
| **Hedgehog** ⭐required | alerts + the "Other" species avatar | spikes up = emergency |
| **Bird family** ⭐required | messages: email, invites, arrival, morning (rooster), memorial (dove) | carrier-pigeon energy |
| **Snake** ⭐required | connection: the share link (coiled into a chain link) | |
| **Rabbit** | speed & travel | suitcase in paw |
| **Hamster** | busy work: refresh (wheel!), notes | |
| **Ferret** | keys & codes | ferrets famously steal keys |
| **Parrot** | talk & tips: testimonials, helpful hints | a nod to the retired parrot logo |
| Gecko, fish | their own species avatars | |

**Two deliberate NON-pets (per Tim):** the **Crown** (paid tier + AI features) is a real gold
crown — regal, not a character; and the **memorial rainbow** is a plain rainbow — gentle and
dignified, no cartoon animal on the screen where someone's pet has died. The memorial dove is
the one exception in that space (it reads as spirit, not character).

## Design guidance

**Style:** match the P-mark — rounded, friendly, 2-color. Primary line work in castle navy
`#1E3A5F`, accents in current teal `#5B95A8`, warm highlights in castle gold `#C6A75E`,
destructive/alert icons may use coral `#A6453F`. Backgrounds transparent (they sit on
parchment `#F5EDD6` and near-white `#FEFDF9` cards — check contrast on both).

**Two tiers — this matters:**
- **Character icons** (slots rendering ≥20px): full pet character with prop/pose.
- **Paw-glyphs** (tiny UI controls at 14–18px: checkmarks, close ✕, trays, pins, calendar): a
  full animal turns to mush at 14px, so these are simple shapes with a paw accent — e.g. a
  paw-shaped checkmark, a location pin with a paw-pad center. The designer should NOT force a
  character into these.

**Format:** SVG masters on a **24×24 grid** with ~1.5–2px equivalent stroke, plus PNG exports
at **24, 48, and 96px** (@1x/2x/4x). Square 1:1; consistent optical weight across the set;
filled-shape style preferred over thin outlines (they render small).

**Rendered sizes in-app** (design must hold up at the smallest):
| Slot | Rendered size |
|---|---|
| Inline in buttons/rows (most usage) | 14–18px |
| Section headers, feature chips | 20–24px |
| Species avatars (pet cards) | 28–32px inside a 64px circle |
| Empty states, celebrations | 48–60px |

**Naming:** `icon-<name>.svg` per the Name column below.

## The set (53) — full pet mapping

### Core brand / high-frequency
| Replaces | Name | Design | Tier |
|---|---|---|---|
| 🐾 | paw | the brand paw, unchanged concept | glyph |
| 🏠 | home | **turtle whose shell is a little house** | character |
| ✈️ | travel | **rabbit with a tiny suitcase** | character |
| 📋 | guide | **dog holding a clipboard in its mouth** | character |
| 🤖 | crown-ai | **gold crown** (non-pet, per Tim) — AI is a Crown feature | glyph |
| ✓ | check | paw-shaped checkmark | glyph |

### Species avatars (largest renders, 28–60px — the stars of the set)
dog · cat (one design; app uses two cat emoji today) · bird · fish · rabbit · hamster ·
gecko (reptile) · **hedgehog = "Other"** (every unusual pet gets a face)

### Guide sections
| Replaces | Design | Tier |
|---|---|---|
| 🚨 emergency | **hedgehog, spikes up, alarmed** | character |
| 📝 notes | **hamster chewing a pencil** | character |
| 🔗 share-link | **snake coiled into a chain link** | character |
| 📅 calendar | calendar page with paw print | glyph |
| 🛬 arrival | **bird coming in to land** | character |
| 📄 document/pdf | **dog with a rolled newspaper** | character |
| 🍽 feeding | **cat at a food bowl** | character |
| 💊 medication | pill bottle with paw-print label | glyph |
| 🏥 vet | collar tag with a medical cross | glyph |
| 🛡 insurance | **turtle tucked safely in its shell** | character |
| 🪪 id-tag | collar tag with paw | glyph |
| 🎾 toys/play | **dog with tennis ball** | character |

### Daily routine time-of-day (a little narrative arc)
| Replaces | Design |
|---|---|
| 🌅 morning | **rooster crowing at sunrise** |
| ☀️ midday | **dog mid-fetch under a sun** |
| 🌆 evening | **cat silhouetted on a windowsill at dusk** |
| 🌙 bedtime | **puppy curled asleep under a crescent moon** |

### Actions & UI
| Replaces | Design | Tier |
|---|---|---|
| 👁️ reveal | **wide cat eye** | character |
| 🙈 hide | **cat covering its eyes with paws** | character |
| 🗑 delete | trash can, paw accent (coral) | glyph |
| 📞 phone | **dog holding a bone like a telephone** | character |
| ✉️ email | **carrier pigeon with an envelope** | character |
| 💌 invite | **carrier pigeon with a heart-sealed envelope** | character |
| 🔑 key/code | **ferret clutching a key** (ferrets famously steal keys) | character |
| 📍 location | pin with paw-pad center | glyph |
| 🖨 print | printer, paw on the page | glyph |
| 🔄 regenerate | **hamster on a wheel** | character |
| 📤 export | tray with out-arrow + paw | glyph |
| 📥 import | tray with in-arrow + paw | glyph |
| ✕ close | plain ✕ | glyph |
| 🔒 privacy | **turtle in shell with a tiny padlock** | character |

### Moments & marketing
| Replaces | Design | Tier |
|---|---|---|
| 🎉 celebration | **dog in a party hat, confetti** | character |
| ✨ AI flourish | crown sparkles (gold) | glyph |
| 💡 tip | **parrot with a lightbulb** (the retired logo parrot returns) | character |
| ✅ feature check | paw checkmark (matches ✓) | glyph |
| 💬 testimonial | **parrot with a speech bubble** | character |
| 📱 mobile install | phone with paw on screen | glyph |
| 💻 desktop install | laptop with paw on screen | glyph |
| 🌈 memorial rainbow | **plain rainbow** (non-pet, per Tim — gentle, dignified) | glyph |
| 🕊 memorial dove | **white dove ascending** | character |

## Integration plan (engineering side, later)
An `Icon` component mapping name → asset with a size prop replaces raw emoji strings
incrementally; PNGs ship in `assets/icons/`. No code changes needed from the designer.
