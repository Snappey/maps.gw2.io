import {Component, EventEmitter, Input, Output} from '@angular/core';
import {LayerOptions, LayerState} from "../../lib/base-map";
import {TriStateCheckboxChangeEvent} from "primeng/tristatecheckbox";

interface LayerOptionsWithId extends LayerOptions {
  id: string;
}

@Component({
  selector: 'app-layer-options',
  templateUrl: './layer-options.component.html',
  styleUrls: ['./layer-options.component.css']
})
export class LayerOptionsComponent {
  _layers!: LayerOptionsWithId[];

  @Input()
  set layers(value: {[key: string]: LayerOptions}) {
    this._layers = Object.entries(value)
        .map(([id, layer]) => ({...layer, id}))
        .sort((a, b) =>
            (a.friendlyName ?? "") > (b.friendlyName ?? "") ? 1 : -1);
  }

  @Output()
  layerUpdated: EventEmitter<[string, LayerState]> = new EventEmitter<[string, LayerState]>();

  mapState(layer: LayerOptionsWithId): boolean | null {
    switch (layer.state) {
      case LayerState.Enabled:
        return true;
      case LayerState.Pinned:
        return false;
      case LayerState.Disabled:
        return null;
      case LayerState.Hidden:
        return true;
      default:
        return null;
    }
  }

  onLayerToggle($event: TriStateCheckboxChangeEvent, layer: LayerOptionsWithId) {
    switch ($event.value) {
      case true:
        layer.state = LayerState.Enabled;
        break;
      case false:
        layer.state = LayerState.Pinned;
        break;
      case null:
        layer.state = LayerState.Disabled;
        break;
    }
    this.layerUpdated.emit([layer.id, layer.state]);
  }
}
