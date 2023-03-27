import {Component} from '@angular/core';
import {Store} from "@ngrx/store";
import {settingsAction} from "../../state/settings/settings.action";
import {environment} from "../../environments/environment";
import {ToastrService} from "ngx-toastr";
import {NgcCookieConsentService} from "ngx-cookieconsent";
import {take} from "rxjs";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor(private store: Store, private ccService: NgcCookieConsentService) {
    this.store.dispatch(settingsAction.loadCookie());

    if (environment.production) {
      document.addEventListener('contextmenu', event => event.preventDefault());

    }


    this.ccService.initialized$.pipe(
    ).subscribe(_ => ccService.open())
  }
}
