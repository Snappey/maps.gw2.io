import {Observable} from "rxjs";

/**
 * What the live-marker sidebar needs from a player marker, independent of the
 * map library rendering it.
 */
export interface SidebarLiveMarker {
  readonly accountName: string;
  readonly isSelf: boolean;
  getProfessionIcon(): string;
  getProfessionColour(): string;
  isMounted(): boolean;
  getMountIcon(): string;
  /** Pans to the player every 250ms until unsubscribed. */
  follow(setZoom?: boolean): Observable<unknown>;
}
