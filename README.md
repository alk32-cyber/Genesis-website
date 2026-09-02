# The Genesis Initiative — Website

A static, no-build site for [The Genesis Initiative](https://www.instagram.com/thegenesisinitiative_austin/),
a youth-led Austin nonprofit teaching entrepreneurship and financial literacy to middle
and high schoolers.

## Structure

```
index.html        All page markup and content
css/styles.css     Design tokens + all styling (single file, no framework)
js/main.js         Mobile nav, scroll-spy nav highlighting, reveal-on-scroll
assets/favicon.svg Favicon (a real typographic "G", not a template icon)
```

No build step, no dependencies — open `index.html` directly, or serve the folder:

```
python3 -m http.server 8000
```

## Design approach

Dark, editorial, one blue accent — directed at a specific reference (a
premium agency site) rather than a generic template look.

- **Palette:** near-black ground (`--bg`), warm cream text (`--cream`), one
  blue accent (`--accent`) used consistently for links, numerals, active
  states, and the logo mark. No purple, no scattered "glow" accents — a
  single soft radial field sits behind the hero only.
- **The wordmark is the logo.** Instead of a generic rounded-square icon,
  the hero centerpiece is a bespoke dot-matrix rendering of "Genesis" (an
  SVG `<text>` filled with a small circle `<pattern>`) — a real, custom
  graphic device instead of a stock icon. The nav/footer use the same
  wordmark in plain type, two-tone (cream + accent), no separate icon box.
  Founder photos are placeholder initials in a simple ring badge, honestly
  presented as initials — not a fake AI portrait.
- **Type:** Fraunces (display/headings) + Inter (body) from Google Fonts,
  one modular scale via `clamp()`.
- **Structure over cards.** Sections use hairline dividers and numbered
  lists (the "Gap" section's 01/02/03, "Get Involved"'s three paths) rather
  than boxing everything in bordered cards — used only where content is
  genuinely enumerable.
- **Texture:** a faint fixed film-grain overlay (`body::before`, SVG
  `feTurbulence`) keeps the dark background from reading as a flat CSS
  gradient.
- **Motion:** one easing curve, pill buttons with a short hover lift, a
  single fade+rise reveal-on-scroll that respects `prefers-reduced-motion`
  and never hides above-the-fold content waiting on JS.

## Content sourced

Copy is built from what's publicly verifiable (Instagram bio, LinkedIn, and
public write-ups about the founders), since this session couldn't reach
`instagram.com` directly (network egress to it is blocked here). **Please
review before publishing** — a few things are placeholders on purpose:

- [ ] `mailto:hello@thegenesisinitiative.us` in the "Partner with us" card is a
      **guessed placeholder address** — swap in the real contact email.
- [ ] Confirm the mission quote, camp name ("High School Head Start Camp"),
      grade range (6–9), and founder bios against your own copy.
- [ ] Founder "photos" are initials-only by design — swap in real photos
      (with permission) when available.
- [ ] The Instagram and LinkedIn links point to the handles found via public
      search; double check they're still correct.

## Deploying

Any static host works as-is (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
For GitHub Pages: Settings → Pages → deploy from the `main` branch, root folder.
