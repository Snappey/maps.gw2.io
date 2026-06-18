import {Component, OnDestroy} from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import {debounceTime, filter, map, Subscription, switchMap} from "rxjs";
import {Store} from "@ngrx/store";
import {ChannelType, SettingsState} from "../../state/settings/settings.feature";
import {settingsAction} from "../../state/settings/settings.action";
import {AppState} from "../../state/appState";
import {AccountService} from "../../services/account.service";
import {ToggleableDialog} from "../shared/toggleable-dialog";
import { Bind } from 'primeng/bind';
import { Dialog } from 'primeng/dialog';
import { Password } from 'primeng/password';
import { LetDirective } from '@ngrx/component';
import { SelectButton } from 'primeng/selectbutton';
import { Select } from 'primeng/select';
import { PrimeTemplate } from 'primeng/api';
import { ButtonDirective, Button } from 'primeng/button';

@Component({
    selector: 'app-settings-modal',
    templateUrl: './settings-modal.component.html',
    styleUrls: ['./settings-modal.component.css'],
    imports: [Bind, Dialog, FormsModule, ReactiveFormsModule, Password, LetDirective, SelectButton, Select, PrimeTemplate, ButtonDirective, Button]
})
export class SettingsModalComponent extends ToggleableDialog implements OnDestroy {
  settingsForm = new FormGroup({
    apiKey: new FormControl(),
    liveMapEnabled: new FormControl(),
    selectedChannel: new FormControl(),
    guildChannel: new FormControl(),
    customChannel: new FormControl()
  })

  maps: string[] = ["Tyria", "Mists"];
  ChannelType = ChannelType;
  authChannelTypes: ChannelType[] = [ChannelType.Global, ChannelType.Guild, ChannelType.Solo, ChannelType.Custom];
  unauthChannelTypes: ChannelType[] = [ChannelType.Global]
  settings$: Subscription;
  validateApiKey$ = this.settingsForm.get("apiKey")?.valueChanges.pipe(
    filter(apiKey => !!apiKey && apiKey.length == 72),
    debounceTime(5000),
    switchMap(apiKey => this.accountService.getAccountInfo(apiKey)),
  )

  userGuilds$ = this.store.select(s => s.user.guild_details).pipe(
    map(guilds => Object.values(guilds)),
    filter(guilds => guilds.length > 0),
    map(guilds => [...guilds].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  )

  constructor(private store: Store<AppState>, private accountService: AccountService) {
    super();
    this.settings$ = this.store.select(s => s.settings).subscribe(s => this.settingsForm.patchValue(s));
  }

  ngOnDestroy() {
    this.settings$.unsubscribe();
  }

  onSubmit() {
    this.store.dispatch(settingsAction.setAll({ settings: this.settingsForm.value as SettingsState }));
    this.close();
  }
}
