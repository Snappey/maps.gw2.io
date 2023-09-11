import {Component, EventEmitter, Input, Output} from '@angular/core';
import {LayerOptions} from "../../lib/base-map";
import {InputSwitchOnChangeEvent} from "primeng/inputswitch";

@Component({
  selector: 'app-layer-options',
  templateUrl: './layer-options.component.html',
  styleUrls: ['./layer-options.component.css']
})
export class LayerOptionsComponent {
  _layers!: LayerOptions[];

  @Input()
  set layers(value: {[key: string]: LayerOptions}) {
    this._layers = Object.values(value)
        .sort((a, b) =>
            (a.friendlyName ?? "") > (b.friendlyName ?? "") ? 1 : -1);
  }

  @Output()
  layerUpdated: EventEmitter<boolean> = new EventEmitter<boolean>();

  onChange = ($event: InputSwitchOnChangeEvent) =>
    this.layerUpdated.emit($event.checked);

}
