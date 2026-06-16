import {Component, EventEmitter, Input, Output} from '@angular/core';
import {NgTemplateOutlet} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {TooltipModule} from "primeng/tooltip";
import {InputTextModule} from "primeng/inputtext";
import {IconFieldModule} from "primeng/iconfield";
import {InputIconModule} from "primeng/inputicon";
import {LayerState, PanelLayerOptions} from "../../lib/layer-state";

interface LeafLayer extends PanelLayerOptions {
  id: string;
}

/** A node in the layer-panel tree: nested subgroups plus the leaf layers directly under it. */
interface LayerGroup {
  name: string;
  key: string;
  groups: LayerGroup[];
  layers: LeafLayer[];
}

/** Built-in category order at the top level; user/TacO packs sort after, alphabetically.
 *  "Objectives" only appears on Mists (WvW); "World Completion"/"Activities" only on Tyria. */
const CATEGORY_ORDER = ["Objectives", "World Completion", "Activities", "World Map"];

/** Only imported (user_) and bundled TacO (taco_) overlays can be removed by the user. */
function isRemovableId(id: string): boolean {
  return id.startsWith("user_") || id.startsWith("taco_");
}

function byName(a: {friendlyName?: string}, b: {friendlyName?: string}): number {
  return (a.friendlyName ?? "") > (b.friendlyName ?? "") ? 1 : -1;
}

function categoryRank(name: string): number {
  const i = CATEGORY_ORDER.indexOf(name);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

/** Sort nested subgroups + their layers alphabetically. */
function sortTree(groups: LayerGroup[]): void {
  groups.sort((a, b) => (a.name > b.name ? 1 : -1));
  for (const g of groups) {
    g.layers.sort(byName);
    sortTree(g.groups);
  }
}

/** Top level: built-in categories first (CATEGORY_ORDER), then everything else alphabetically. */
function sortRoots(groups: LayerGroup[]): void {
  groups.sort((a, b) => {
    const ra = categoryRank(a.name), rb = categoryRank(b.name);
    return ra !== rb ? ra - rb : (a.name > b.name ? 1 : -1);
  });
  for (const g of groups) {
    g.layers.sort(byName);
    sortTree(g.groups);
  }
}

@Component({
    selector: 'app-layer-options',
    templateUrl: './layer-options.component.html',
    styleUrls: ['./layer-options.component.css'],
    standalone: true,
    imports: [NgTemplateOutlet, FormsModule, TooltipModule, InputTextModule, IconFieldModule, InputIconModule]
})
export class LayerOptionsComponent {
  /** Uncategorised layers (editor / Mists-only): rendered flat above the categories. */
  ungrouped: LeafLayer[] = [];
  /** Built-in categories + imported/TacO packs, nested into a collapsible tree. */
  tree: LayerGroup[] = [];
  /** Live search query; filters rows by friendly name. */
  filterText = "";

  // The unfiltered layer set, cached so search can rebuild without a re-emit.
  private raw: LeafLayer[] = [];
  // Group keys the user has expanded; persists across re-renders (built-in categories
  // start expanded, user/TacO packs start collapsed).
  private expanded = new Set<string>();
  // Built-in category keys already auto-expanded once, so a manual collapse sticks.
  private seenCategories = new Set<string>();

  @Input()
  set layers(value: {[key: string]: PanelLayerOptions}) {
    this.raw = Object.entries(value).map(([id, layer]) => ({...layer, id}));
    this.rebuild();
  }

  @Output() layerUpdated = new EventEmitter<[string, LayerState]>();
  @Output() removeLayers = new EventEmitter<string[]>();

  /** (Re)build the flat list + group tree from the cached layers and current filter. */
  private rebuild(): void {
    const q = this.filterText.trim().toLowerCase();
    const shown = this.raw.filter(l =>
      !l.hideFromPanel && (!q || (l.friendlyName ?? "").toLowerCase().includes(q)));

    this.ungrouped = shown.filter(l => !l.group?.length).sort(byName);

    const roots: LayerGroup[] = [];
    for (const layer of shown.filter(l => l.group?.length)) {
      let level = roots;
      let key = "";
      let target: LayerGroup | undefined;
      for (const name of layer.group!) {
        key = key ? `${key} / ${name}` : name;
        let node = level.find(g => g.name === name);
        if (!node) {
          node = {name, key, groups: [], layers: []};
          level.push(node);
        }
        target = node;
        level = node.groups;
      }
      target!.layers.push(layer);
    }
    sortRoots(roots);
    this.tree = roots;

    // Built-in categories start expanded (matches the mockup); seed only once per
    // key so a user's manual collapse survives later rebuilds.
    for (const g of roots) {
      if (CATEGORY_ORDER.includes(g.name) && !this.seenCategories.has(g.key)) {
        this.seenCategories.add(g.key);
        this.expanded.add(g.key);
      }
    }
  }

  /** Search box change handler. */
  onFilterChange(): void {
    this.rebuild();
  }

  isExpanded(g: LayerGroup): boolean {
    // While searching, force every group open so matches are always visible.
    return this.filterText.trim().length > 0 || this.expanded.has(g.key);
  }

  toggleExpand(g: LayerGroup): void {
    if (this.expanded.has(g.key)) {
      this.expanded.delete(g.key);
    } else {
      this.expanded.add(g.key);
    }
  }

  private descendants(g: LayerGroup): LeafLayer[] {
    return [...g.layers, ...g.groups.flatMap(sub => this.descendants(sub))];
  }

  groupCount(g: LayerGroup): string {
    const leaves = this.descendants(g);
    const visible = leaves.filter(l => l.state !== LayerState.Disabled).length;
    return `${visible}/${leaves.length}`;
  }

  groupAllHidden(g: LayerGroup): boolean {
    return this.descendants(g).every(l => l.state === LayerState.Disabled);
  }

  /** Hide a group's layers if any are shown, otherwise show them all. */
  toggleGroup(g: LayerGroup, event: Event): void {
    event.stopPropagation();
    const leaves = this.descendants(g);
    const anyVisible = leaves.some(l => l.state !== LayerState.Disabled);
    for (const l of leaves) {
      if (anyVisible) {
        if (l.state !== LayerState.Disabled) this.setState(l, LayerState.Disabled);
      } else {
        this.setState(l, LayerState.Enabled);
      }
    }
  }

  /** Built-in categories cannot be removed — only imported/TacO packs. */
  isRemovable(g: LayerGroup): boolean {
    const leaves = this.descendants(g);
    return leaves.length > 0 && leaves.every(l => isRemovableId(l.id));
  }

  removeGroup(g: LayerGroup, event: Event): void {
    event.stopPropagation();
    this.removeLayers.emit(this.descendants(g).map(l => l.id));
  }

  // --- Per-row controls -------------------------------------------------------
  // Visibility (eye) and pin (lock) are two independent views of the single
  // LayerState the map reads, so the merged-marker / pin-overlay logic is unchanged.
  isVisible(l: LeafLayer): boolean {
    return l.state !== LayerState.Disabled;
  }

  isPinned(l: LeafLayer): boolean {
    return l.state === LayerState.Pinned;
  }

  // event is present when triggered from the eye button; absent (or stopped) lets a
  // bare row click fall through to toggle visibility too.
  toggleVisible(l: LeafLayer, event?: Event): void {
    event?.stopPropagation();
    this.setState(l, this.isVisible(l) ? LayerState.Disabled : LayerState.Enabled);
  }

  togglePinned(l: LeafLayer, event?: Event): void {
    // Stop the row's own click handler from also toggling visibility.
    event?.stopPropagation();
    // Pinning a hidden layer also turns it on; unpinning returns it to zoom-gated.
    this.setState(l, this.isPinned(l) ? LayerState.Enabled : LayerState.Pinned);
  }

  /** Show every displayed (filtered) layer — leaving pins intact — or hide them all,
   *  except layers flagged keepOnHideAll (the base map stays so the view isn't blank). */
  setAllVisible(visible: boolean): void {
    for (const l of this.allDisplayed()) {
      if (visible) {
        if (l.state === LayerState.Disabled) this.setState(l, LayerState.Enabled);
      } else if (l.state !== LayerState.Disabled && !l.keepOnHideAll) {
        this.setState(l, LayerState.Disabled);
      }
    }
  }

  private allDisplayed(): LeafLayer[] {
    const fromGroups = (gs: LayerGroup[]): LeafLayer[] =>
      gs.flatMap(g => [...g.layers, ...fromGroups(g.groups)]);
    return [...this.ungrouped, ...fromGroups(this.tree)];
  }

  private setState(l: LeafLayer, state: LayerState): void {
    l.state = state;
    this.layerUpdated.emit([l.id, state]);
  }
}
