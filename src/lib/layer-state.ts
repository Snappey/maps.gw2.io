// Shared between the Leaflet (base-map.ts) and OpenLayers (base-ol-map.ts) stacks
// so UI components like the layer panel don't depend on either map library.

export enum LayerState {
  Enabled,
  Disabled,
  Hidden,
  Pinned,
}

// Minimal shape the layer panel needs; both map stacks' layer options satisfy it.
export interface PanelLayerOptions {
  friendlyName?: string;
  icon?: string;
  state: LayerState;
}
