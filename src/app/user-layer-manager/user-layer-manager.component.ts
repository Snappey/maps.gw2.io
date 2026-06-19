import {Component, Input} from "@angular/core";
import {AsyncPipe} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {ClipboardService} from "ngx-clipboard";
import {ToastrService} from "ngx-toastr";
import {ButtonModule} from "primeng/button";
import {DialogModule} from "primeng/dialog";
import {InputTextModule} from "primeng/inputtext";
import {TooltipModule} from "primeng/tooltip";
import {Observable} from "rxjs";
import {UserLayer, UserLayerService} from "../../services/user-layer.service";
import {ToggleableDialog} from "../shared/toggleable-dialog";

@Component({
  selector: "app-user-layer-manager",
  standalone: true,
  imports: [AsyncPipe, FormsModule, ButtonModule, DialogModule, InputTextModule, TooltipModule],
  templateUrl: "./user-layer-manager.component.html",
  styleUrls: ["./user-layer-manager.component.css"],
})
export class UserLayerManagerComponent extends ToggleableDialog {
  @Input() continentId: 1 | 2 = 1;

  layers$: Observable<UserLayer[]> | undefined;

  importName = "";
  importColor = "#FFCC66";
  importGeoJson = "";
  importError = "";

  constructor(
    private userLayerService: UserLayerService,
    private clipboard: ClipboardService,
    private toastr: ToastrService,
  ) {
    super();
  }

  ngOnInit() {
    this.layers$ = this.userLayerService.layersFor(this.continentId);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    if (!this.importName) {
      this.importName = file.name.replace(/\.(geo)?json$/i, "");
    }
    file.text().then(text => this.importGeoJson = text);
  }

  import() {
    this.importError = "";
    try {
      const layer = this.userLayerService.importGeoJson(
        this.importName, this.continentId, this.importColor, this.importGeoJson);
      this.toastr.info(`Imported ${layer.features.length} features`, layer.name, {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right",
      });
      this.importName = "";
      this.importGeoJson = "";
    } catch (e) {
      this.importError = e instanceof Error ? e.message : String(e);
    }
  }

  export(layer: UserLayer) {
    const geoJson = this.userLayerService.exportGeoJson(layer.id);
    if (geoJson) {
      this.clipboard.copy(geoJson);
      this.toastr.info("Copied GeoJSON to clipboard!", layer.name, {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right",
      });
    }
  }

  remove(layer: UserLayer) {
    this.userLayerService.remove(layer.id);
  }
}
