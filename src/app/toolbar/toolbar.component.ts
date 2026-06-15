import {Component, Input, OnDestroy} from '@angular/core';
import {filter, fromEvent, map, Subject, takeUntil} from "rxjs";
import { NgClass } from '@angular/common';
import { Tooltip as Tooltip_1 } from 'primeng/tooltip';

export interface ToolbarButton {
  Tooltip: string;
  Icon: string;
  IconHover: string;
  OnClick: () => void;
  Keybindings?: string[]
  /** Panel id this button opens; used to keep its icon highlighted while open. */
  PanelId?: string;
}

interface AppToolbarButton extends ToolbarButton {
  isActive: boolean;
}

@Component({
    selector: 'app-toolbar',
    templateUrl: './toolbar.component.html',
    styleUrls: ['./toolbar.component.css'],
    imports: [NgClass, Tooltip_1]
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

  @Input()
  leftToRight: boolean = true;

  /** Id of the currently open panel, so the matching button stays highlighted. */
  @Input()
  activePanel: string | null = null;

  private unsubscribe$ = new Subject<void>();

  constructor() {
    fromEvent(document, "keydown").pipe(
      takeUntil(this.unsubscribe$),
      // Don't fire hotkeys while the user is typing into a field.
      filter(() => !ToolbarComponent.isTypingTarget()),
      map(event => this._buttons.filter(button => button.Keybindings?.includes((event as KeyboardEvent).code)))
    ).subscribe(matchingButtons => {
      matchingButtons.forEach(button => button.OnClick());
    });
  }

  private static isTypingTarget(): boolean {
    const el = document.activeElement as HTMLElement | null;
    const tag = el?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  toolbarClasses(): string[] {
    return this.leftToRight ? ["flex-row", "justify-content-start"] : ["flex-row", "justify-content-end"]
  }
}
