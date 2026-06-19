# Interactive Guild Wars 2 Map

Hosted at [maps.gw2.io](https://maps.gw2.io/), with two major maps implemented for Tyria and WvW.

## Some of the Features

- Waypoints, Points of Interest, Vistas, Hearts, Hero Points, Adventures and Masteries
  - Single click to copy Chat Link
  - Double click to link to wiki
  - Filter them out, only see what you'd like.
- World Boss Markers
  - Single click to copy the closest waypoint Chat Link
  - See upcoming events using the overlay
- Live World vs World matchups, updated as you watch
  - See who owns each objective, the running scores and skirmish ticks
  - Jump between matchups from the match list, or dig into skirmish details and match history
- Live Markers support integrating with [BlishHud](https://blishhud.com/) addon using Mumble Link
  - Track yourself on the map with other users using Solo, Guild, Global and custom channels.
  - API Key is required to ensure Location is only published in the right channels.
  - _Addon is not published, maybe one day_
- Major Cities have merchant and NPC markers e.g. Lion's Arch, Wizards Tower and Arborstone
  - Double click to link to Wiki
- Bundled marker packs from [Lady Elyssa's TacO collection](https://github.com/LadyElyssa/LadyElyssaTacoTrails)
  - Bounty, Fishing, Gathering, Rift Hunting and plenty more
  - Toggle on only the ones you'd like
- Bring your own markers **kind of**
  - Drag a Taco marker pack over the map and itll do it's best to parse/render it
- Right click to draw on Map
  - Fades after you finish drawing

## What does it look Like

![Tyria Overview](/images/tyria_overview.jpg)

![Tyria World Bosses Table](/images/tyria_world_bosses.jpg)

![WvW Match Table](/images/wvw_matches.jpg)

![WvW Overview](/images/wvw_overview.jpg)

https://github.com/Snappey/maps.gw2.io/assets/4106212/068d7b4d-78cf-4098-8b98-7c1b69c5973e

Tiles are provided by [ThatShaman](https://twitter.com/that_shaman) and [ArenaNet](https://www.arena.net/en) and hosted by myself for Tyria.

The [Official Guild Wars 2 API](https://wiki.guildwars2.com/wiki/API:Main) and [Wiki](https://wiki.guildwars2.com/wiki/Main_Page) is used for label and marker data. 


## Development

See [ARCHITECTURE.md](ARCHITECTURE.md) for a map of how the app is structured.

Requires Node.js 22+ and npm.

```sh
npm install
npm start          # dev server on http://localhost:4200
npm run build      # production build
```

The map overlay data (`src/assets/data`, `src/assets/tiles`, and the cached
`city_icons`/`wvw` PNGs) is generated from the GW2 API and wiki by the scripts in
[`scripts/`](scripts/) — see [scripts/README.md](scripts/README.md) for the
seeding pipeline.
