# Interactive Guild Wars 2 Map

Hosted at [maps.gw2.io](https://maps.gw2.io/), with two major maps implemented for Tyria and WvW.

## Some of the Features

- Waypoints, Points of Interest, Vistas, Hearts, Adventures and Masteries
  - Single click to copy Chat Link
  - Double click to link to wiki
  - Filter them out, only see what you'd like.
- World Boss Markers
  - Single click to copy the closest waypoint Chat Link
  - See upcoming events using the overlay
- Live Markers support integrating with [BlishHud](https://blishhud.com/) addon using Mumble Link
  - Track yourself on the map with other users using Solo, Guild, Global and custom channels.
  - API Key is required to ensure Location is only published in the right channels.
  - _Addon is not published, maybe one day_
- Major Cities have merchant and NPC markers e.g. Lion's Arch, Wizards Tower and Arborstone
  - Double click to link to Wiki
- Right click to draw on Map
  - Fades after you finish drawing

## What does it look Like

![Tyria Overview](/images/tyria_overview.png)

![Tyria World Bosses Table](/images/tyria_world_bosses.png)

![WvW Match Table](/images/wvw_matches.png)

![WvW Overview](/images/wvw_overview.jpg)

https://github.com/Snappey/maps.gw2.io/assets/4106212/068d7b4d-78cf-4098-8b98-7c1b69c5973e

Tiles are provided by [ThatShaman](https://twitter.com/that_shaman) and [ArenaNet](https://www.arena.net/en) and hosted by myself for Tyria.

The [Official Guild Wars 2 API](https://wiki.guildwars2.com/wiki/API:Main) and [Wiki](https://wiki.guildwars2.com/wiki/Main_Page) is used for label and marker data. 


## Development

Requires Node.js 20+ and npm.

```sh
npm install
npm start          # dev server on http://localhost:4200
npm run build      # production build
```

### Data generation scripts

```sh
npm run cache-poi      # POI/label data from the GW2 API
npm run cache-regions  # region/map heading data from the GW2 API
npm run cache-extras   # adventures + city markers scraped from the GW2 wiki
```

### Vector tiles (OpenLayers migration)

Overlay data is being migrated to pre-generated vector tiles (PMTiles) rendered
with OpenLayers. Building the tile archives requires the
[go-pmtiles](https://github.com/protomaps/go-pmtiles) CLI (`pmtiles`) on PATH to
convert the intermediate MBTiles output:

```sh
# Windows: download the release binary, or
go install github.com/protomaps/go-pmtiles/main@latest
```
