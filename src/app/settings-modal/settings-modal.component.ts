import {Component, EventEmitter, Input, OnDestroy, Output} from '@angular/core';
import {FormControl, FormGroup} from "@angular/forms";
import {World, WvwService} from "../../services/wvw.service";
import {debounceTime, filter, map, Observable, Subscription, switchMap} from "rxjs";
import {Store} from "@ngrx/store";
import {ChannelType, SettingsState} from "../../state/settings/settings.feature";
import {settingsAction} from "../../state/settings/settings.action";
import {AppState} from "../../state/appState";
import {AccountService} from "../../services/account.service";

@Component({
  selector: 'app-settings-modal',
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css']
})
export class SettingsModalComponent implements OnDestroy {
  @Input()
  visible!: boolean;
  @Output()
  visibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  settingsForm = new FormGroup({
    apiKey: new FormControl(),
    homeWorld: new FormControl(),
    liveMapEnabled: new FormControl(),
    selectedChannel: new FormControl(),
    guildChannel: new FormControl(),
    customChannel: new FormControl()
  })

  maps: string[] = ["Tyria", "Mists"];
  ChannelType = ChannelType;
  authChannelTypes: ChannelType[] = [ChannelType.Global, ChannelType.Guild, ChannelType.Solo, ChannelType.Custom];
  unauthChannelTypes: ChannelType[] = [ChannelType.Global]
  worlds$: Observable<World[]> = this.wvwService.getAllWorlds()
  settings$: Subscription;
  validateApiKey$ = this.settingsForm.get("apiKey")?.valueChanges.pipe(
    filter(apiKey => !!apiKey && apiKey.length == 72),
    debounceTime(5000),
    switchMap(apiKey => this.accountService.getAccountInfo(apiKey)),
  )

  userGuilds$ = this.store.select(s => s.user.guild_details).pipe(
    map(guilds => Object.values(guilds)),
    filter(guilds => guilds.length > 0),
  )

  constructor(private wvwService: WvwService, private store: Store<AppState>, private accountService: AccountService) {
    this.settings$ = this.store.select(s => s.settings).subscribe(s => this.settingsForm.patchValue(s));
  }

  ngOnDestroy() {
    this.settings$.unsubscribe();
  }

  onSubmit() {
    this.store.dispatch(settingsAction.setAll({ settings: this.settingsForm.value as SettingsState }));
    this.close();
  }

  close() {
    this.visible = false;
    this.visibleChange.emit(false)
  }
}
