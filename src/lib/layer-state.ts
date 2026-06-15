// Shared by the OpenLayers map stack (base-ol-map.ts) and the UI so components
// like the layer panel don't depend on the map library.

export enum LayerState {
  Enabled,
  Disabled,
  Hidden,
  Pinned,
}

// Minimal shape the layer panel needs; the map stack's layer options satisfy it.
export interface PanelLayerOptions {
  friendlyName?: string;
  icon?: string;
  state: LayerState;
  /** Ancestor group names (e.g. pack → map) used by the panel to nest the layer
   *  under a collapsible tree. Absent for built-in map layers, which stay flat. */
  group?: string[];
}
