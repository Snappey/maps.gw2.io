import {Component, EventEmitter, HostListener, Input, Output} from "@angular/core";

export interface MapContextMenuItem {
  label: string;
  icon?: string;
  separator?: boolean;
  action?: () => void;
}

/**
 * Context menu for the dev editor — replaces the leaflet-contextmenu plugin.
 * Hidden whenever `position` is undefined.
 */
@Component({
  selector: "app-map-context-menu",
  standalone: true,
  template: `
    @if (position) {
      <div class="map-context-menu tooltip" [style.left.px]="position.x" [style.top.px]="position.y">
        @for (item of items; track item.label) {
          @if (item.separator) {
            <hr class="menu-separator"/>
          } @else {
            <div class="menu-item" (click)="run(item)">
              @if (item.icon) {
                <img [src]="item.icon" width="16" height="16" alt=""/>
              }
              {{item.label}}
            </div>
          }
        }
      </div>
    }
  `,
  styles: [`
    .map-context-menu {
      position: absolute;
      z-index: 1000;
      min-width: 160px;
      padding: 4px 0;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .menu-separator {
      margin: 4px 0;
      border-color: rgba(255, 255, 255, 0.15);
    }
  `],
})
export class MapContextMenuComponent {
  @Input() items: MapContextMenuItem[] = [];
  @Input() position?: {x: number, y: number};
  @Output() closed = new EventEmitter<void>();

  run(item: MapContextMenuItem) {
    item.action?.();
    this.close();
  }

  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: PointerEvent) {
    if (this.position && !(event.target as HTMLElement).closest(".map-context-menu")) {
      this.close();
    }
  }

  private close() {
    this.position = undefined;
    this.closed.emit();
  }
}
