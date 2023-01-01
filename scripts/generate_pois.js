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

async function getContinent(id, floor) {
  return axios.get(`https://api.guildwars2.com/v2/continents/${id}/floors/${floor}`)
}

function hasKey(obj, key) {
  return key in obj;
}

async function getInitLabels() {
  const seedData = JSON.parse(fs.readFileSync("./scripts/static/poi_labels.json"))
  const labels = {
    "unknown": {
      "hearts": [],
      "masterypoints": [],
      "poi": [],
      "skillpoints": []
    }
  };

  seedData.forEach((label) => {
    switch(label.type) {
      case "heart":
        labels.unknown.hearts.push(label);
        break;
      case "mastery":
        labels.unknown.masterypoints.push(label);
        break;
      case "skillpoint":
        labels.unknown.skillpoints.push(label);
        break;
      case "landmark":
      case "vista":
      case "waypoint":
        labels.unknown.poi.push(label);
        break;
    }
  });

  return labels;
}

async function generate() {
  const details = await getContinent(1, 1);
  const labels = await getInitLabels()

  for (let region of Object.values(details.data.regions)) {
    console.log(region.name)

    if (!hasKey(labels, region.name))
      labels[region.name] = {
        "skillpoints": [],
        "hearts": [],
        "masterypoints": [],
        "poi": []
      };

    for (let map of Object.values(region.maps)) {

      // skillpoints
      for (let skillpoint of map.skill_challenges) {
        if (skillpoint.id === "")
          continue;

        labels[region.name]["skillpoints"].push({
          id: skillpoint.id,
          coordinates: skillpoint.coord,
          type: "skillpoint"
        });
      }

      // hearts
      for (let heart of Object.values(map.tasks)) {
        if (heart.id === 0)
          continue;

        labels[region.name]["hearts"].push({
          id: heart.id,
          coordinates: heart.coord,
          type: "heart",
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

        labels[region.name]["masterypoints"].push({
          id: mastery.id,
          coordinates: mastery.coord,
          type: "mastery",
          data: {
            "type": mastery.region
          }
        });
      }

      // pois
      for (let poi of Object.values(map.points_of_interest)) {
        if (poi.id === 0)
          continue;

        if (poi.id in overrides)
          poi.name = overrides[poi.id].Name;

        labels[region.name]["poi"].push({
          id: poi.id,
          coordinates: poi.coord,
          type: poi.type,
          data: {
            "icon": poi.icon,
            "tooltip": poi.name,
            "chat_link": poi.chat_link,
          }
        })
      }
    }
  }

  fs.writeFileSync("./src/assets/data/poi_labels.json", JSON.stringify(labels));
  return true;
}

generate()
  .catch(err => console.error(err))
  .finally(() => console.log("Finished POIs"));
