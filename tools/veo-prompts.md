# Veo prompts for The Genesis Initiative

Three prompts, crafted with the veo skill's 5-element formula
(cinematography + subject + action + context + style) and checked against its
validation rules: one camera movement each, no text/UI requests, no conflicting
descriptors, and loop flags on the hero clip.

Generate with `tools/veo-generate.mjs` once Google Cloud credentials are set up
(see the notes at the top of that file). Roughly $0.50 and 2-4 minutes per clip.

## A note on what these deliberately avoid

None of these prompts depict students, instructors, or classrooms. AI-generated
people on a real nonprofit's site read as actual program participants, and they
are not. These stay abstract or on objects, which keeps the footage honest.
Real photos of real camps are the right fix for that, when there are some.

---

## 1. Hero ambient loop

Sits behind the wordmark on the home page. Built to be barely-there: the hero
is light, so this is high-key rather than the usual dark hero footage.

```
Static locked camera, thousands of tiny pale blue paper discs suspended in a
bright white void, drifting upward almost imperceptibly, soft overhead studio
light, seamless loop, high-key white background with cobalt blue accents,
gentle motion, clean and minimal
```

- Aspect 16:9 | Duration 4s | 720p | Audio off
- Validation: single camera (static locked), no text, `seamless loop` +
  `locked camera` + gentle motion present.

```bash
node tools/veo-generate.mjs \
  --prompt "Static locked camera, thousands of tiny pale blue paper discs suspended in a bright white void, drifting upward almost imperceptibly, soft overhead studio light, seamless loop, high-key white background with cobalt blue accents, gentle motion, clean and minimal" \
  --aspect-ratio 16:9 --duration 4 --resolution 720p \
  --output assets/video/hero-loop.mp4
```

## 2. Programs page clip

For the Programs page, showing the work rather than the people doing it.

```
Overhead static camera, a business sketch on grid paper surrounded by sticky
notes and a single cobalt pen, one hand placing a note onto the page, morning
window light across a pale wood desk, shallow depth of field, muted blue and
white palette, quiet documentary realism
```

- Aspect 16:9 | Duration 8s | 1080p | Audio off
- Validation: single camera (static overhead), one action, no text requests.

```bash
node tools/veo-generate.mjs \
  --prompt "Overhead static camera, a business sketch on grid paper surrounded by sticky notes and a single cobalt pen, one hand placing a note onto the page, morning window light across a pale wood desk, shallow depth of field, muted blue and white palette, quiet documentary realism" \
  --aspect-ratio 16:9 --duration 8 --resolution 1080p \
  --output assets/video/programs.mp4
```

## 3. Instagram vertical clip

Vertical, for posting alongside camp announcements.

```
Slow push in on a stack of blank index cards on a pale desk, the top card
lifting and settling in a draft, north-facing window light, a single cobalt
blue pen resting alongside, calm modern still life, shallow depth of field
```

- Aspect 9:16 | Duration 8s | 1080p | Audio on
- Validation: single camera (push in), one action, no text requests.

```bash
node tools/veo-generate.mjs \
  --prompt "Slow push in on a stack of blank index cards on a pale desk, the top card lifting and settling in a draft, north-facing window light, a single cobalt blue pen resting alongside, calm modern still life, shallow depth of field" \
  --aspect-ratio 9:16 --duration 8 --resolution 1080p --audio \
  --output assets/video/social-vertical.mp4
```

---

## Wiring the hero clip into the page

Once `assets/video/hero-loop.mp4` exists, the hero video goes behind
`.hero-inner` and must not fight the wordmark. Keep it under the existing glow
layers, muted/autoplay/loop/playsinline, `object-fit: cover`, and hidden for
`prefers-reduced-motion` users, with the current static hero as the fallback.
