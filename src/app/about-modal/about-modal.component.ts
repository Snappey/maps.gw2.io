import {Component} from '@angular/core';
import {ToggleableDialog} from "../shared/toggleable-dialog";
import { Bind } from 'primeng/bind';
import { Dialog } from 'primeng/dialog';
import { PrimeTemplate } from 'primeng/api';
import { Button } from 'primeng/button';

@Component({
    selector: 'app-about-modal',
    templateUrl: './about-modal.component.html',
    styleUrls: ['./about-modal.component.css'],
    imports: [Bind, Dialog, PrimeTemplate, Button]
})
export class AboutModalComponent extends ToggleableDialog {
  openDiscord = () => window.open("https://discord.gg/8vCN5RBz75", "_blank");
  openGithub = () => window.open("https://github.com/Snappey/maps.gw2.io/", "_blank");
  openGithubIssues = () => window.open("https://github.com/Snappey/maps.gw2.io/issues/new", "_blank");
}
