import {PointTuple} from "../lib/types";

/**
 * WvW domain model: GW2 `/v2/wvw/*` API shapes plus the few `// Custom`
 * client-derived fields. Separate module so state, components and services
 * depend on the model directly, not on WvwService.
 */

export interface Objective {
  id: string;
  name: string;
  sector_id: number;
  type: string;
  map_type: string;
  map_id: number;
  upgrade_id: number;
  coord: PointTuple;
  label_coord: PointTuple;
  marker: string;
  chat_link: string;
}

export interface Scores {
  [team: string]: number;
  red: number;
  blue: number;
  green: number;
}

export interface WorldNames {
  [team: string]: string[];
  red: string[];
  blue: string[];
  green: string[];
}

export interface FriendlyWorldNames {
  [team: string]: string;
  red: string;
  blue: string;
  green: string;
}

export interface MapScore {
  type: string;
  scores: Scores;
}

export interface Skirmish {
  id: number;
  scores: Scores;
  map_scores: MapScore[];
}

export interface Bonus {
  type: string;
  owner: string;
}

export interface MatchObjective {
  id: string;
  type: string;
  owner: string;
  friendlyOwner: string;
  last_flipped: Date;
  points_tick: number;
  points_capture: number;
  claimed_by: string;
  claimed_at?: Date;
  yaks_delivered?: number;
  guild_upgrades: string[];
}

/** One of a match's borderland/EBG maps. (`WvwMap`, not `Map`, to avoid shadowing the global.) */
export interface WvwMap {
  id: number;
  type: string;
  scores: Scores;
  bonuses: Bonus[];
  objectives: MatchObjective[];
  deaths: Scores;
  kills: Scores;
}

export interface Match {
  id: string;
  start_time: Date;
  end_time: Date;
  scores: Scores;
  worlds: Scores;
  tier: string;
  region: string;
  deaths: Scores;
  kills: Scores;
  victory_points: Scores;
  skirmishes: Skirmish[];
  maps: WvwMap[];

  // Custom
  all_worlds: WorldNames;
  all_worlds_names: WorldNames
  friendly_names: FriendlyWorldNames
  objectives: FullMatchObjective[]
}

export interface MatchOverview {
  id: string;
  worlds: Scores;
  all_worlds: WorldNames;
  start_time: Date;
  end_time: Date;
}

export interface World {
  id: string;
  name: string;
  population: string;
}

export interface WorldDictionary {
  [id: string]: World;
}

export interface Upgrade {
  name: string;
  description: string;
  icon: string;
}

export interface Tier {
  name: string;
  yaks_required: number;
  upgrades: Upgrade[];
}

export interface ObjectiveTiers {
  id: number;
  tiers: Tier[];
}

export interface FullMatchObjective extends MatchObjective, Objective {
  /**
   * Upgrade tier (0–3) resolved from live yak count against this objective's
   * own tier schedule. Precomputed while building the match feed because it
   * can't be re-derived from yaks alone — thresholds differ per objective.
   */
  upgrade_tier?: number;
}

/**
 * Canonical WvW world-id → name/population dictionary, inlined so the match
 * feed can resolve names without a second `/v2/worlds` round-trip.
 */
export const staticWorldNames: WorldDictionary = {
  "2001": { id: "2001", name: "Skrittsburgh", population: "N/A" },
  "2002": { id: "2002", name: "Fortune's Vale", population: "N/A" },
  "2003": { id: "2003", name: "Silent Woods", population: "N/A" },
  "2004": { id: "2004", name: "Ettin's Back", population: "N/A" },
  "2005": { id: "2005", name: "Domain of Anguish", population: "N/A" },
  "2006": { id: "2006", name: "Palawadan", population: "N/A" },
  "2007": { id: "2007", name: "Bloodstone Gulch", population: "N/A" },
  "2008": { id: "2008", name: "Frost Citadel", population: "N/A" },
  "2009": { id: "2009", name: "Dragrimmar", population: "N/A" },
  "2010": { id: "2010", name: "Grenth's Door", population: "N/A" },
  "2011": { id: "2011", name: "Mirror of Lyssa", population: "N/A" },
  "2012": { id: "2012", name: "Melandru's Dome", population: "N/A" },
  "2013": { id: "2013", name: "Kormir's Library", population: "N/A" },
  "2014": { id: "2014", name: "Great House Aviary", population: "N/A" },
  "2101": { id: "2101", name: "Bava Nisos", population: "N/A" },
  "2102": { id: "2102", name: "Temple of Febe", population: "N/A" },
  "2103": { id: "2103", name: "Gyala Hatchery", population: "N/A" },
  "2104": { id: "2104", name: "Grekvelnn Burrows", population: "N/A" },
  "1001": { id: "1001", name: "Moogooloo", population: "N/A" },
  "1002": { id: "1002", name: "Rall's Rest", population: "N/A" },
  "1003": { id: "1003", name: "Domain of Torment", population: "N/A" },
  "1004": { id: "1004", name: "Yohlon Haven", population: "N/A" },
  "1005": { id: "1005", name: "Tombs of Drascir", population: "N/A" },
  "1006": { id: "1006", name: "Hall of Judgment", population: "N/A" },
  "1007": { id: "1007", name: "Throne of Balthazar", population: "N/A" },
  "1008": { id: "1008", name: "Dwayna's Temple", population: "N/A" },
  "1009": { id: "1009", name: "Abaddon's Prison", population: "N/A" },
  "1010": { id: "1010", name: "Ruined Cathedral of Blood", population: "N/A" },
  "1011": { id: "1011", name: "Lutgardis Conservatory", population: "N/A" },
  "1012": { id: "1012", name: "Mosswood", population: "N/A" },
  "1013": { id: "1013", name: "Mithric Cliffs", population: "N/A" },
  "1014": { id: "1014", name: "Lagula's Kraal", population: "N/A" },
  "1015": { id: "1015", name: "De Molish Post", population: "N/A" },
  "1016": { id: "1016", name: "Sea of Sorrows", population: "VeryHigh" },
  "1017": { id: "1017", name: "Tarnished Coast", population: "VeryHigh" },
  "1018": { id: "1018", name: "Northern Shiverpeaks", population: "Medium" },
  "1019": { id: "1019", name: "Blackgate", population: "Full" },
  "1020": { id: "1020", name: "Ferguson's Crossing", population: "Medium" },
  "1021": { id: "1021", name: "Dragonbrand", population: "High" },
  "1022": { id: "1022", name: "Kaineng", population: "Medium" },
  "1023": { id: "1023", name: "Devona's Rest", population: "VeryHigh" },
  "1024": { id: "1024", name: "Eredon Terrace", population: "High" },
  "2105": { id: "2105", name: "Arborstone [FR]", population: "Medium" },
  "2201": { id: "2201", name: "Kodash [DE]", population: "Medium" },
  "2202": { id: "2202", name: "Riverside [DE]", population: "VeryHigh" },
  "2203": { id: "2203", name: "Elona Reach [DE]", population: "Medium" },
  "2204": { id: "2204", name: "Abaddon's Mouth [DE]", population: "Medium" },
  "2205": { id: "2205", name: "Drakkar Lake [DE]", population: "VeryHigh" },
  "2206": { id: "2206", name: "Miller's Sound [DE]", population: "Medium" },
  "2207": { id: "2207", name: "Dzagonur [DE]", population: "Medium" },
  "2301": { id: "2301", name: "Baruch Bay [SP]", population: "VeryHigh" }
};
