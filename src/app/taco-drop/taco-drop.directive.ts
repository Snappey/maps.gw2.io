import {Directive, HostBinding, HostListener, Input, NgZone} from "@angular/core";
import {TacoImportService} from "../../services/taco-import.service";

/**
 * Drop target for GW2 TacO marker files. Put it on the map host:
 * `<div appTacoDrop [appTacoDrop]="continentId">`. On drop it hands the files
 * to TacoImportService; `taco-drag-over` is toggled for the drop affordance.
 */
@Directive({selector: "[appTacoDrop]", standalone: true})
export class TacoDropDirective {
  /** Continent of the map this directive sits on (1 Tyria, 2 Mists). */
  @Input("appTacoDrop") continentId: 1 | 2 = 1;

  @HostBinding("class.taco-drag-over") dragging = false;

  constructor(private importer: TacoImportService, private ngZone: NgZone) {}

  private hasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.items ?? []).some(i => i.kind === "file");
  }

  @HostListener("dragover", ["$event"])
  onDragOver(e: DragEvent) {
    if (!this.hasFiles(e)) {
      return;
    }
    e.preventDefault(); // required so the element becomes a valid drop target
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    this.dragging = true;
  }

  @HostListener("dragleave", ["$event"])
  onDragLeave(e: DragEvent) {
    // Ignore moves onto descendant elements (e.g. the OL canvas).
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    this.dragging = false;
  }

  @HostListener("drop", ["$event"])
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) {
      this.ngZone.run(() => void this.importer.importFiles(files, this.continentId));
    }
  }
}
