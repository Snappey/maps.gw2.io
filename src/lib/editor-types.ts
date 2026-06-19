/** Formerly lived in the Leaflet-coupled EditorService. */
export enum MarkerType {
  Unknown,
  Waypoint,
  Vista,
  Poi,
  Heart,
  SkillPoint,
  Mastery,
  Region,
  Map,
  Unlock
}

export interface MarkerMetadata {
  [key: string]: string | number | boolean;
}
