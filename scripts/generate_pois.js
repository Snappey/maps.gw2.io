const axios = require("axios");
const fs = require("fs");

const overrides = {
  2344: {
    Name: "Raid Lobby",
  },
  2970: {
    Name: "Mythwright Gambit",
  },
  2080: {
    Name: "Forsaken Thicket",
  },
  2452: {
    Name: "Bastion of the Penitent",
  },
  2850: {
    Name: "Hall of Chains",
  },
  3451: {
    Name: "Scrying Stone: Cantha Strike Missions"
  },
  3454: {
    name: "Asura Gate: Shiverpeaks Strike Missions"
  }
};

const mapOverrides = {

}

async function getContinent(id, floor) {
  return axios.get(`https://api.guildwars2.com/v2/continents/${id}/floors/${floor}`)
}

function hasKey(obj, key) {
  return key in obj;
}

function getStaticTyriaLabels () {
  return JSON.parse(fs.readFileSync("./scripts/static/poi_labels.json").toString())
}

async function generate(continentId, floorId) {
  const details = await getContinent(continentId, floorId);
  let labels = []

  if (continentId === 1 && floorId === 1) {
    labels = await getStaticTyriaLabels()
  }

  for (let region of Object.values(details.data.regions)) {
    console.log(region.name)

    for (let map of Object.values(region.maps)) {

      // skillpoints
      for (let skillpoint of map.skill_challenges) {
        if (skillpoint.id === "")
          continue;

        labels.push({
          id: skillpoint.id,
          coordinates: skillpoint.coord,
          type: "skillpoint",
          map: map.name,
          continent: region.name
        });
      }

      // hearts
      for (let heart of Object.values(map.tasks)) {
        if (heart.id === 0)
          continue;

        labels.push({
          id: heart.id,
          coordinates: heart.coord,
          type: "heart",
          map: map.name,
          continent: region.name,
          data: {
            "tooltip": heart.objective,
            "chat_link": heart.chat_link,
            "bounds": heart.bounds
          }
        });
      }

      // masteries
      for (let mastery of Object.values(map.mastery_points)) {
        if (mastery.id === 0)
          continue;

        labels.push({
          id: mastery.id,
          coordinates: mastery.coord,
          type: "mastery",
          map: map.name,
          continent: region.name,
          data: {
            "type": mastery.region !== "Unknown" ? mastery.region : region.name
          }
        });
      }

      // pois
      for (let poi of Object.values(map.points_of_interest)) {
        if (poi.id === 0)
          continue;

        if (poi.id in overrides)
          poi.name = overrides[poi.id].Name;

        labels.push({
          id: poi.id,
          coordinates: poi.coord,
          type: poi.type,
          map: map.name,
          continent: region.name,
          data: {
            "icon": poi.icon,
            "tooltip": poi.name,
            "chat_link": poi.chat_link,
          }
        })
      }

      for (let sector of Object.values(map.sectors)) {
        labels.push({
          id: sector.id,
          coordinates: sector.coord,
          type: "sector",
          map: map.name,
          continent: region.name,
          data: {
            "tooltip": sector.name,
            "level": sector.level,
            "bounds": sector.bounds,
            //"chat_link": sector.chat_link, These clash with actual points of interest
          }
        })
      }
    }
  }

  fs.writeFileSync(`./src/assets/data/poi_labels_${continentId}_${floorId}.json`, JSON.stringify(labels));
  console.log(`updated ./src/assets/data/poi_labels_${continentId}_${floorId}.json in assets`)
  return true;
}

generate(1, 1)
  .catch(err => console.error(err))
  .finally(() => console.log("Finished Tyria POIs"));

generate(2, 1)
  .catch(err => console.error(err))
  .finally(() => console.log("Finished Mists POIs"));
