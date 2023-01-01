import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {SelectItem} from "primeng/api";
import {EditorService, MarkerType} from "../../../services/editor.service";
import {DynamicDialogConfig, DynamicDialogRef} from "primeng/dynamicdialog";
import {PointTuple} from "leaflet";

@Component({
  selector: 'app-editor-modal',
  templateUrl: './editor-modal.component.html',
  styleUrls: ['./editor-modal.component.css']
})
export class EditorModalComponent implements OnInit {
  coords: PointTuple = [0,0];
  markerType: MarkerType = MarkerType.Unknown;

  fields = {};
  formStructure = {
    [<number>MarkerType.Waypoint]: {
      "tooltip": "string",
      "chatLink": "string",
    },
    [<number>MarkerType.Poi]: {
      "tooltip": "string",
      "chatLink": "string",
    },
    [<number>MarkerType.Heart]: {
      "tooltip": "string",
    },
    [<number>MarkerType.Vista]: {},
    [<number>MarkerType.Mastery]: {
      "type": "string"
    },
    [<number>MarkerType.SkillPoint]: {},
    [<number>MarkerType.Region]: {
      "heading": "string",
    },
    [<number>MarkerType.Map]: {
      "heading": "string",
      "subheading": "string"
    },
    [<number>MarkerType.Unlock]: {
      "icon": "string",
      "tooltip": "string"
    }
  }
  results: {[name: string]: string} = {}

  constructor(public ref: DynamicDialogRef, public config: DynamicDialogConfig) {
  }

  ngOnInit(): void {
    this.coords = this.config.data.coords;
    this.markerType = this.config.data.type;

    this.fields = this.formStructure[this.markerType];
  }

  submit() {
    this.ref.close(this.results);
  }
}
