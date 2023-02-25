import {Component} from '@angular/core';
import {Store} from "@ngrx/store";
import {settingsAction} from "../../state/settings/settings.action";
import {environment} from "../../environments/environment";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor(private store: Store) {
    this.store.dispatch(settingsAction.loadCookie());

    if (environment.production) {
      document.addEventListener('contextmenu', event => event.preventDefault());
    }
  }
}
