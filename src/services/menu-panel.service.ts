import {Injectable} from "@angular/core";
import {BehaviorSubject, Observable} from "rxjs";

export type PanelId =
  | "settings" | "about" | "layers" | "userLayers"   // shared
  | "events" | "liveMarkers" | "wizardsVault"        // tyria
  | "matches" | "score" | "objectiveDetails";        // mists

/**
 * Single source of truth for which overlay is open on a map view: only one id is
 * ever active, so opening one closes any other. Provided per map component, so each
 * route starts with nothing open.
 *
 * The active id is observable (active$) so cross-cutting consumers — e.g. the
 * widget layer that hides itself while a full-screen panel is open — can react to
 * it; templates keep using the synchronous isOpen()/active accessors.
 */
@Injectable()
export class MenuPanelService {
  private readonly _active$ = new BehaviorSubject<PanelId | null>(null);
  readonly active$: Observable<PanelId | null> = this._active$.asObservable();

  get active(): PanelId | null {
    return this._active$.value;
  }

  isOpen(id: PanelId): boolean {
    return this._active$.value === id;
  }

  open(id: PanelId): void {
    this._active$.next(id);
  }

  toggle(id: PanelId): void {
    this._active$.next(this._active$.value === id ? null : id);
  }

  /** Closes `id` if it's the open one; with no arg closes whatever is open. */
  close(id?: PanelId): void {
    if (id === undefined || this._active$.value === id) {
      this._active$.next(null);
    }
  }

  /** Bridges PrimeNG [visible]/(visibleChange) bindings to the active state. */
  setVisible(id: PanelId, visible: boolean): void {
    if (visible) {
      this.open(id);
    } else {
      this.close(id);
    }
  }
}
