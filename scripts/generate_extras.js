const axios = require("axios");
const fs = require("fs");


const adventuresQueryUrl = "https://wiki.guildwars2.com/api.php?action=ask&format=json&query=[[Category:Adventures]]|[[Has%20x%20coordinate::%3E0]]|?Has%20x%20coordinate|?Has%20y%20coordinate|?Has game description|limit=500"

axios.get(adventuresQueryUrl)
  .then((queryData) => queryData.data.query)
  .then(adventureData => Object.entries(adventureData.results))
  .then(results => results.filter(([_, data]) => data.printouts["Has game description"][0] !== undefined)) // Filters out NPCs linked to adventures
  .then(results => results.map(([name, data]) => ({
      id: name,
      coordinates: [data.printouts["Has x coordinate"][0], data.printouts["Has y coordinate"][0]],
      type: "Adventure",
      data: {
        "tooltip": data.printouts["Has game description"][0],
        "url": data.fullurl
      }
  })))
  .then(data => fs.writeFileSync("./src/assets/data/adventure_labels.json", JSON.stringify(data)))
  .finally(_ => console.log("finished adventures written to assets.."))
