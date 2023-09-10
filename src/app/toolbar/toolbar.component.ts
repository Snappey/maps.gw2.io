import {Component, Input, OnDestroy} from '@angular/core';
import {fromEvent, map, Observable, Subject, takeUntil} from "rxjs";

export interface ToolbarButton {
  Tooltip: string;
  Icon: string;
  IconHover: string;
  OnClick: () => void;
  Keybindings?: string[]
}

interface AppToolbarButton extends ToolbarButton {
  isActive: boolean;
}

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnDestroy {
  _buttons: AppToolbarButton[] = [];
  @Input()
  public set buttons(buttons: ToolbarButton[]) {
    this._buttons = buttons.map(button => ({
      ...button,
      isActive: false
    }));
  }

  private unsubscribe$ = new Subject<void>();

  constructor() {
    fromEvent(document, "keydown").pipe(
      takeUntil(this.unsubscribe$),
      map(event => this._buttons.filter(button => button.Keybindings?.includes((event as KeyboardEvent).code)))
    ).subscribe(matchingButtons => {
      matchingButtons.forEach(button => button.OnClick());
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
