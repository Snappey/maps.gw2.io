import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {Store} from "@ngrx/store";

@Injectable()
export class LiveMarkersEffects {
  constructor(private actions$: Actions, private readonly store: Store) {}
}
