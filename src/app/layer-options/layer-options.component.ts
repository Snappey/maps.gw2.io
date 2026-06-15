import {Component, EventEmitter, Input, Output} from '@angular/core';
import {NgTemplateOutlet} from "@angular/common";
import {ButtonModule} from "primeng/button";
import {TooltipModule} from "primeng/tooltip";
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

function byName(a: {friendlyName?: string}, b: {friendlyName?: string}): number {
  return (a.friendlyName ?? "") > (b.friendlyName ?? "") ? 1 : -1;
}

function sortTree(groups: LayerGroup[]): void {
  groups.sort((a, b) => (a.name > b.name ? 1 : -1));
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
    imports: [NgTemplateOutlet, ButtonModule, TooltipModule]
})
export class LayerOptionsComponent {
  /** Built-in map layers (no group): rendered flat at the top. */
  ungrouped: LeafLayer[] = [];
  /** Imported/custom layers, nested by their `group` path into a collapsible tree. */
  tree: LayerGroup[] = [];

  // Group keys the user has expanded; persists across re-renders (groups start collapsed).
  private expanded = new Set<string>();

  @Input()
  set layers(value: {[key: string]: PanelLayerOptions}) {
    const all = Object.entries(value).map(([id, layer]) => ({...layer, id}));
    this.ungrouped = all.filter(l => !l.group?.length).sort(byName);

    const roots: LayerGroup[] = [];
    for (const layer of all.filter(l => l.group?.length)) {
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
    sortTree(roots);
    this.tree = roots;
  }

  @Output() layerUpdated = new EventEmitter<[string, LayerState]>();
  @Output() removeLayers = new EventEmitter<string[]>();

  isExpanded(g: LayerGroup): boolean {
    return this.expanded.has(g.key);
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

  /** Show all of a group's layers, or hide all if any are currently shown. */
  toggleGroup(g: LayerGroup, event: Event): void {
    event.stopPropagation();
    const leaves = this.descendants(g);
    const target = leaves.some(l => l.state !== LayerState.Disabled) ? LayerState.Disabled : LayerState.Enabled;
    for (const layer of leaves) {
      layer.state = target;
      this.layerUpdated.emit([layer.id, target]);
    }
  }

  removeGroup(g: LayerGroup, event: Event): void {
    event.stopPropagation();
    this.removeLayers.emit(this.descendants(g).map(l => l.id));
  }

  stateIcon(layer: LeafLayer): string {
    switch (layer.state) {
      case LayerState.Enabled:
      case LayerState.Hidden:
        return "pi pi-lock-open";
      case LayerState.Pinned:
        return "pi pi-lock";
      default:
        return "pi pi-eye-slash";
    }
  }

  stateLabel(layer: LeafLayer): string {
    switch (layer.state) {
      case LayerState.Enabled:
      case LayerState.Hidden:
        return "Shown";
      case LayerState.Pinned:
        return "Pinned";
      default:
        return "Hidden";
    }
  }

  // Cycles Shown -> Pinned -> Hidden, matching the old tri-state checkbox order.
  onLayerToggle(layer: LeafLayer): void {
    switch (layer.state) {
      case LayerState.Enabled:
      case LayerState.Hidden:
        layer.state = LayerState.Pinned;
        break;
      case LayerState.Pinned:
        layer.state = LayerState.Disabled;
        break;
      default:
        layer.state = LayerState.Enabled;
        break;
    }
    this.layerUpdated.emit([layer.id, layer.state]);
  }
}
