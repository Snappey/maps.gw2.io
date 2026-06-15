import {enableProdMode} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';

import {HomeComponent} from './app/home/home.component';
import {appConfig} from './app/app.config';
import {environment} from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(HomeComponent, appConfig)
  .catch(err => console.error(err));
