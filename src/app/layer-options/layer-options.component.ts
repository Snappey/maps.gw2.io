import {Component, EventEmitter, Input, Output} from '@angular/core';
import {LayerState, PanelLayerOptions} from "../../lib/layer-state";

interface LayerOptionsWithId extends PanelLayerOptions {
  id: string;
}

@Component({
    selector: 'app-layer-options',
    templateUrl: './layer-options.component.html',
    styleUrls: ['./layer-options.component.css'],
    standalone: false
})
export class LayerOptionsComponent {
  _layers!: LayerOptionsWithId[];

  @Input()
  set layers(value: {[key: string]: PanelLayerOptions}) {
    this._layers = Object.entries(value)
        .map(([id, layer]) => ({...layer, id}))
        .sort((a, b) =>
            (a.friendlyName ?? "") > (b.friendlyName ?? "") ? 1 : -1);
  }

  @Output()
  layerUpdated: EventEmitter<[string, LayerState]> = new EventEmitter<[string, LayerState]>();

  stateIcon(layer: LayerOptionsWithId): string {
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

  stateLabel(layer: LayerOptionsWithId): string {
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
  onLayerToggle(layer: LayerOptionsWithId) {
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
