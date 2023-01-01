const axios = require("axios");
const fs = require("fs");

const regionBlacklist = {
  "Dragon Bash Arena":                         true,
  "Noble's Folly":                             true,
  "Lion's Arch Aerodrome":                     true,
  "Strike Mission: Shiverpeaks Pass (Public)": true,
  "Crystal Desert":                            true,
  "Labyrinthine Cliffs":                        true,
}

async function getContinent(id, floor) {
  return axios.get(`https://api.guildwars2.com/v2/continents/${id}/floors/${floor}`)
}

async function getMap(id) {
  return axios.get(`https://api.guildwars2.com/v2/maps/${id}`);
}

async function getInitLabels() {
  const seedData = JSON.parse(fs.readFileSync("./scripts/static/map_text.json"));
  const labels = [];

  seedData.forEach((label) => {
    labels.push({
      type: label.type,
      label_coordinates: label.coordinates,
      coordinates: null,
      heading: label.data.heading,
      subheading: label.data.subheading
    })
  });

  return labels;
}

async function generate() {
  // Fetch Continent Details
  const details = await getContinent(1, 1);
  const labels = await getInitLabels()

  if (details.status !== 200)
    throw `non 200 staus from continents api: ${details.status}`

  for (let region of Object.values(details.data.regions)) {
    console.log(region.name)

    if (!regionBlacklist[region.name]) {
      labels.push({
        type: "Region",
        label_coordinates: region.label_coord,
        coordinates: region.continent_rect,
        heading: region.name,
        subheading: ""
      })
    }


    for (let map of Object.values(region.maps)) {
      const mapDetails = await getMap(map.id);
      console.log("| " + mapDetails.data.name);

      if (mapDetails.data.type === "Public") {
        let subheading
        if (mapDetails.data.min_level === 0 || mapDetails.data.min_level === mapDetails.data.max_level) {
          subheading = `${mapDetails.data.max_level}`;
        } else {
          subheading = mapDetails.data.min_level !== 0 ?
            `${mapDetails.data.min_level} - ${mapDetails.data.max_level}` :
            ""
        }

        if (!regionBlacklist[mapDetails.data.name]) {
          labels.push({
            type: "Map",
            label_coordinates: map.label_coord,
            coordinates: mapDetails.data.continent_rect,
            heading: mapDetails.data.name,
            subheading: subheading
          })
        }
      }
    }
  }

  fs.writeFileSync("./src/assets/data/region_labels.json", JSON.stringify(labels));
  return true;
}

generate()
  .then(res => console.log(res))
  .catch(err => console.error(err))
  .finally(() => console.log("Finished Regions"));
