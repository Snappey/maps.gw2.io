import {Component} from '@angular/core';
import {Store} from "@ngrx/store";
import {settingsAction} from "../../state/settings/settings.action";
import {environment} from "../../environments/environment";
import {NgcCookieConsentService} from "ngx-cookieconsent";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor(private store: Store, private ccService: NgcCookieConsentService) {
    this.store.dispatch(settingsAction.loadCookie());
    this.preloadAssets();

    if (environment.production) {
      document.addEventListener('contextmenu', event => event.preventDefault());

    }


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
