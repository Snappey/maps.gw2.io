import {inject, Injectable} from "@angular/core";
import {BehaviorSubject, merge, Observable} from "rxjs";
import {MenuPanelService} from "./menu-panel.service";

/** Persistent on-map chrome whose visibility can be toggled independently. */
export type WidgetId = "compass" | "fps";

export const ALL_WIDGETS: readonly WidgetId[] = ["compass", "fps"];

/**
 * Panels that take over the screen and should hide every widget while open
 * (e.g. the full-width Events grid). A widget is never visible while one of
 * these is the active panel, regardless of its own toggle.
 */
const WIDGET_SUPPRESSING_PANELS = ["events"] as const;

/**
 * Visibility registry for on-map widgets (Compass, FPS counter, …), mirroring
 * MenuPanelService but non-exclusive: any combination can be shown. Each widget
 * defaults to visible.
 *
 * Provided per map component. Visibility also yields to a screen-filling panel
 * (see WIDGET_SUPPRESSING_PANELS) so opening Events hides all widgets and closing
 * it restores their prior state. `changes$` lets imperative widgets (the FPS DOM
 * meter) react; templates can call isVisible() directly.
 */
@Injectable()
export class WidgetService {
  private readonly menu = inject(MenuPanelService);

  /** Widgets the user/app has explicitly hidden (absent = visible). */
  private readonly hidden = new Set<WidgetId>();
  private readonly version$ = new BehaviorSubject<void>(undefined);

  /** Emits whenever effective visibility may have changed (own state or panel). */
  readonly changes$: Observable<unknown> = merge(this.version$, this.menu.active$);

  isVisible(id: WidgetId): boolean {
    return !this.suppressed() && !this.hidden.has(id);
  }

  show(id: WidgetId): void {
    this.setHidden(id, false);
  }

  hide(id: WidgetId): void {
    this.setHidden(id, true);
  }

  toggle(id: WidgetId): void {
    this.setHidden(id, !this.hidden.has(id));
  }

  setVisible(id: WidgetId, visible: boolean): void {
    this.setHidden(id, !visible);
  }

  showAll(): void {
    if (this.hidden.size) {
      this.hidden.clear();
      this.version$.next();
    }
  }

  hideAll(): void {
    ALL_WIDGETS.forEach(id => this.hidden.add(id));
    this.version$.next();
  }

  /** True while a screen-filling panel is open, forcing all widgets hidden. */
  private suppressed(): boolean {
    return WIDGET_SUPPRESSING_PANELS.some(id => this.menu.active === id);
  }

  private setHidden(id: WidgetId, hide: boolean): void {
    if (hide === this.hidden.has(id)) {
      return;
    }
    hide ? this.hidden.add(id) : this.hidden.delete(id);
    this.version$.next();
  }
}
