import {Directive, EventEmitter, Input, Output} from "@angular/core";

/**
 * Shared two-way `visible` state for the toggleable side panels/dialogs
 * (about, settings, user layers, …). The equality guard stops a redundant
 * `visibleChange` emit when the value hasn't actually changed.
 */
@Directive()
export abstract class ToggleableDialog {
  private _visible = false;

  @Input()
  get visible(): boolean {
    return this._visible;
  }
  set visible(value: boolean) {
    if (value === this._visible) {
      return;
    }
    this._visible = value;
    this.visibleChange.emit(value);
  }

  @Output() visibleChange = new EventEmitter<boolean>();

  close() {
    this.visible = false;
  }
}
