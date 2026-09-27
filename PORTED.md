# Ported from the old sandbox into this dashboard

Everything from `3000-ip9x1udd12lgy917bya4e.e2b.app` now lives here, where it persists.

## Pages (all live, sidebar matches the original)

| Route | What it is |
|---|---|
| `/` | overview — 6 stat cards, focus next, closest milestones, skills/slayers, bazaar, net worth |
| `/companion` | **live companion** — the mod bridge, corner-card focus, NPC scan, scoreboard, pairing |
| `/goals` | goals with progress bars, ETAs, steps, category/priority filters, add-goal form |
| `/roadmap` | 39 milestones across Early/Mid/Late game, category filters, hide-completed |
| `/advisor` | chat-style advisor (built-in rules engine) + 6 ranked upgrade priorities |
| `/accessories` | 27 accessory upgrades, MP optimizer, owned tracking |
| `/bazaar` | economy — net worth chart, snapshots, bazaar moves |
| `/profile` | manual stats entry, skills/slayers, net worth snapshots |

## Data brought across (not retyped — harvested from the old HTML)

- **Profile:** SkyPathDemo / Mango · lvl 187 · Mid Game
- **Stats verified identical:** net worth 612.00m · liquid 160.4m · skill avg 28.6 · cata 27 · MP 612 · roadmap 15/39
- **Roadmap:** 39 milestones, 15 done, 9 early / 12 mid / 18 late — parsed and count-checked against the original
- **Goals:** all 4 with their real progress (27/30, 160.4m/900.0m, 4/7, 612/800) and ETAs (2.1d, 4.7d, 6.3d = ≈13.1d queued)
- **Accessories:** 27 items; the optimizer independently reproduces the original result — **+162 MP for 149.2m**
- **Snapshots, skills, slayers, advisor priorities, bazaar moves**

## Design

Ported from the original's own CSS: same sidebar, `#121110` surfaces, `Pixelify Sans` headings,
`JetBrains Mono` body, indigo/emerald/amber/pink/sky accents, `❯` prompt markers, `card`/`label`/`chip`/`kbd` components.

## What's new vs the original

- Runs on Minecraft **26.1.2** (the original targeted 1.21.1 and could not load)
- Real interactivity: everything persists to `data.json` (goal steps, roadmap ticks, accessories, profile, snapshots)
- Advisor is a working local rules engine — no API key needed
- Downloads the 26.1.2 jar at `/downloads/skypath-companion-2.0.0.jar`

## Running it

```bash
cd skypath-dashboard && node server.js     # no dependencies, no install step
```

Files: `server.js` (routes + pages), `public/app.css`, `public/app.js`,
`data.json` (mutable state), `data/roadmap.json`, `data/accessories.json`, `downloads/*.jar`.
