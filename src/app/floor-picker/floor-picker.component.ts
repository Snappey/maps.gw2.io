import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {FloorPickerState} from '../../lib/ol/floor-lookup';

interface FloorOption {
  label: string;
  value: number;
}

/**
 * Floating floor picker for the map under the view. Renders nothing unless
 * there's more than one floor; selecting one swaps the map's raster base layer.
 */
@Component({
  selector: 'app-floor-picker',
  standalone: true,
  imports: [FormsModule, SelectModule],
  templateUrl: './floor-picker.component.html',
  styleUrls: ['./floor-picker.component.css'],
})
export class FloorPickerComponent {
  state: FloorPickerState | null = null;
  options: FloorOption[] = [];

  @Input('state')
  set stateInput(value: FloorPickerState | null) {
    this.state = value;
    this.options = (value?.floors ?? []).map(floor => ({
      label: floor === value!.defaultFloor ? `Floor ${floor} (default)` : `Floor ${floor}`,
      value: floor,
    }));
  }

  @Output() floorSelected = new EventEmitter<number>();

  onChange(value: number) {
    this.floorSelected.emit(value);
  }
}
