const { MeiliSearch } = require('meilisearch')
const tyriaPois = require("../src/assets/data/poi_labels_1_1.json");

filteredPois = tyriaPois.filter(p => p.type !== "skillpoint" && p.type !== "vista" && p.type !== "mastery")

const client = new MeiliSearch({ host: 'https://ms-5cf643127ad9-2720.lon.meilisearch.io', apiKey: '614a9a8ab4a5d7635f2d99e85866aa2175fc503446d78f262dd6af133ebbf315' })

/*
client.index('tyria').addDocuments(filteredPois)
  .then((res) => console.log(res))
*/
client.getTask(4).then(res => console.log(res))

