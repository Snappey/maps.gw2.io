import {Component} from '@angular/core';
import {NavigationEnd, Router} from "@angular/router";
import {Store} from "@ngrx/store";
import {distinctUntilChanged, filter, map} from "rxjs";
import {settingsAction} from "../../state/settings/settings.action";
import {environment} from "../../environments/environment";
import {NgcCookieConsentService} from "ngx-cookieconsent";

declare const gtag: ((...args: unknown[]) => void) | undefined;

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css'],
    standalone: false
})
export class HomeComponent {
  constructor(private store: Store, private ccService: NgcCookieConsentService, router: Router) {
    this.store.dispatch(settingsAction.loadCookie());
    this.preloadAssets();

    if (environment.production) {
      document.addEventListener('contextmenu', event => event.preventDefault());

    }

    // SPA page views for the gtag snippet in index.html (replaces ngx-google-analytics).
    // The maps write "#lat,lng,zoom" fragments on every pan — only the path counts.
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects.split("#")[0]),
      distinctUntilChanged(),
    ).subscribe(pagePath => {
      if (typeof gtag === "function") {
        gtag("event", "page_view", {page_path: pagePath});
      }
    });

    this.ccService.initialized$.pipe(
    ).subscribe(_ => ccService.open())
  }

  preloadAssetUrls = [
    "/assets/compass_core_pointer_activated.png",
    "/assets/compass_eod_pointer_activated.png",
    "/assets/compass_hot_pointer_activated.png",
    "/assets/compass_pof_pointer_activated.png",
    "/assets/compass_soto_pointer_activated.png",
    "/assets/compass_castora_pointer_activated.png"
  ]

  preloadAssets = () => this.preloadAssetUrls.forEach(url => new Image(0, 0).src = url);
}
