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


const templatePagesUrl = "https://wiki.guildwars2.com/api.php?action=query&format=json&list=embeddedin&eititle=Template:Interactive%20map&einamespace=0&eilimit=500"
const wikiTextQueryUrl = (pageTitle) => `https://wiki.guildwars2.com/api.php?action=query&format=json&prop=revisions&rvprop=content&titles=${pageTitle}`;
const includedPages = ["Lion's Arch", "Arborstone", "Lion's_Arch_Aerodrome", "Black Citadel", "Hoelbrak", "Rata Sum", "Divinity's Reach", "The Grove", "Eye of the North", "Labyrinthine Cliffs", "The Wizard's Tower", "Thousand Seas Pavilion"]

function extractMarkers(text) {
  const startMarker = "{{interactive map";
  const paramMarker = "markers";
  const endMarker = "}}";

  const start = text.toLowerCase().indexOf(startMarker);
  if (start === -1) {
    return null
  }

  let paramStart = text.indexOf(paramMarker, start);
  if (paramStart === -1) {
    return null
  }

  paramStart += paramMarker.length;
  const startOfData = text.indexOf("{", paramStart)

  const end = text.indexOf(endMarker, paramStart);
  if (end === -1) {
    return null
  }

  return text.slice(startOfData, end).trim();
}

async function getGuildWars2WikiImageUrl(filename) {
  const apiUrl = 'https://wiki.guildwars2.com/api.php';
  const params = {
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    titles: `File:${filename}`,
    iiprop: 'url',
  };

  const response = await axios.get(apiUrl, { params });
  const data = response.data;
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];

  return pages[pageId].imageinfo[0].url;
}

async function writeCityMarkers(pageTitles) {
  let res = [];
  for (let pageTitleIdx in pageTitles) {
    let pageTitle = pageTitles[pageTitleIdx]
    try {
      const query = await axios.get(wikiTextQueryUrl(pageTitle));
      const pages = query.data.query.pages;
      const pageTexts = Object.values(pages).map(page => page.revisions[0]["*"]);

      const markerDataStrArr = pageTexts.map(pageText => extractMarkers(pageText)).filter(m => m);

      const markerDataArrPromises = markerDataStrArr.map(async markerDataStr => {
        const markers = markerDataStr
          .split("\n")
          .map(s => (s.charAt(-1) !== "}" ? s.substring(0, s.length - 1) : s))
          .map(s => JSON.parse(s));

        const markersWithIcons = [];

        for (const marker of markers) {
          const icon = await getGuildWars2WikiImageUrl(marker.icon);
          markersWithIcons.push({ ...marker, icon });
        }

        return markersWithIcons;
      });

      const markerDataArr = await Promise.all(markerDataArrPromises);
      const data = markerDataArr.reduce((prev, cur) => [...prev, ...cur], []);

      res = [
        ...res,
        ...data
      ]
      console.log("finished writing " + pageTitle);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  fs.writeFileSync("./src/assets/data/city_markers.json", JSON.stringify(res));
}

writeCityMarkers(includedPages)
