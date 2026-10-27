# BOA Network marketing rules

These rules apply to every piece of BOA Network marketing: BOA HUB, BOA
Originals (Mind States UK) and the BOA lifestyle, in every template in this
repo and anything made outside it.

## Faces

**No stock footage faces. No AI-generated faces.**

Allowed faces:

- Joseph Boat (Jo)
- David
- The actual Mind States UK cast and crew

Do **not** include Sarah (Samsung colleague) or any random models.

Where a shot needs a person and none of the above is available, use one of
these instead:

- Abstract cinematic B-roll: light, texture, city, motion
- Silhouettes, unidentifiable and backlit
- Samsung product shots

AI video tools may generate B-roll only when the prompt excludes people and
the output is checked frame by frame for faces before it's used.

## Brand DNA

Every ad is built on the manifesto from boanetworks.com:

- "Talent is everywhere. Opportunity is not."
- "Talent was never the problem. Access was."
- "We are not here to guard the door. We are here to hold it open."

The look: premium, urban, cinematic. Deep blacks, glowing gold, fast cuts,
bass-heavy audio. 9:16 for TikTok, Snapchat and YouTube Shorts.

## Type safe area (9:16, 1080 x 1920)

TikTok, Shorts and Spotlight put buttons down the right edge and captions
along the bottom. In `src/brand.ts`:

- `SAFE`: keep all type 220 px from the top, 480 px from the bottom, 120 px
  from the left and 160 px from the right.
- `STATEMENT_MARGIN` (72 px each side): only for statements in the upper
  half, which sit above the button rail.
- Statement type is sized to fit with 5% headroom for the slam-in overshoot
  and camera shake (`fitSize` in each template).

## Audit log

- 2026-10-27, The Access Manifesto: kinetic type, gold rules, the door
  reveal and the BOA logo only. No faces of any kind. Margins and headroom
  as above.
