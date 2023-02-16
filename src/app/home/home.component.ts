import {Component} from '@angular/core';
import {CookieService} from "ngx-cookie";
import {Router} from "@angular/router";

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor() {
    document.addEventListener('contextmenu', event => event.preventDefault());
  }
}
