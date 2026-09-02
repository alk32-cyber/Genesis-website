# The Genesis Initiative — Website

A static, no-build site for [The Genesis Initiative](https://www.instagram.com/thegenesisinitiative_austin/),
a youth-led Austin nonprofit teaching entrepreneurship and financial literacy to middle
and high schoolers.

## Structure

```
index.html        All page markup and content
css/styles.css     Design tokens + all styling (single file, no framework)
js/main.js         Mobile nav, scroll-spy nav highlighting, reveal-on-scroll
assets/favicon.svg Wordmark/favicon (simple vector, no external image)
```

No build step, no dependencies — open `index.html` directly, or serve the folder:

```
python3 -m http.server 8000
```

## Design approach

- **Palette:** white + one blue family, defined once as CSS custom properties in
  `:root` (`--blue-900` … `--blue-100`). No gradients, no purple.
- **Type:** Fraunces (display/headings) + Inter (body), loaded from Google Fonts.
  One modular scale via `clamp()` — the hero heading is intentionally restrained,
  not oversized.
- **Spacing & radius:** both on fixed scales (`--sp-1`…`--sp-10`, `--radius-sm/md/lg`)
  so nothing is a one-off magic number.
- **Motion:** one easing curve (`--ease`), short hover lifts (2–4px), a single
  fade+rise reveal-on-scroll that respects `prefers-reduced-motion`.
- **No stock illustration:** since there's no real photography available yet, the
  hero uses real content (the org's own mission quote, a real founder stat) instead
  of an abstract gradient blob or AI-generated graphic. Founder "photos" are
  deliberately simple initial avatars, not fake portraits.

## Content sourced

Copy is built from what's publicly verifiable (Instagram bio, LinkedIn, and
public write-ups about the founders), since this session couldn't reach
`instagram.com` directly (network egress to it is blocked here). **Please review
before publishing** — a few things are placeholders on purpose:

- [ ] `mailto:hello@thegenesisinitiative.us` in the "Partner with us" card is a
      **guessed placeholder address** — swap in the real contact email.
- [ ] Confirm the mission quote, camp name ("High School Head Start Camp"),
      grade range (6–9), and founder bios against your own copy — pull them
      from your Instagram bio/Linktree directly if anything here is stale.
- [ ] Add real photos when available (camp sessions, founders, students with
      permission) — there's no photography in this build by design, rather
      than faking it with stock/AI imagery.
- [ ] The Instagram and LinkedIn links point to the handles found via public
      search; double check they're still correct.

## Deploying

Any static host works as-is (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
For GitHub Pages: Settings → Pages → deploy from the `main` branch, root folder.
