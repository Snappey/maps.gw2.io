import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {SearchEntry, SearchService} from "../../../services/search.service";

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css']
})
export class SearchBarComponent implements OnInit {
  searchText: string = "";
  searchResults: SearchEntry[] = [];

  @Input()
  showResults: boolean = false;
  @Output()
  showResultsChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  @Output()
  clickedResult: EventEmitter<SearchEntry> = new EventEmitter<SearchEntry>();

  constructor(private searchService: SearchService) { }

  ngOnInit(): void {
  }

  onClick(result: SearchEntry) {
    this.clickedResult.emit(result);
  }

  onSearchChange(newVal: string) {
    this.searchText = newVal;
    this.searchResults = this.searchService.search(newVal).slice(0, 6);

    if (this.searchText != "") {
      this.showResults = true;
      this.showResultsChange.emit(this.showResults);
    }
  }

  onSearchFocused(_: FocusEvent) {
    this.onSearchChange(this.searchText);
  }

  reset() {
    this.showResults = false;
    this.showResultsChange.emit(this.showResults);

    this.searchText = '';
  }

  onKeyDown($event: KeyboardEvent, result: SearchEntry) {
    if ($event.key === "Enter") {
      this.clickedResult.emit(result);
    }
  }

  getIcon(type: string, override: string = ""): string {
    switch(type) {
      case "landmark":
        return "/assets/poi.png";
      case "waypoint":
        return "assets/waypoint.png";
      case "vista":
        return "assets/vista.png";
      case "heart":
        return "assets/hearts.png";
      case "unlock":
        return override !== "" ?
          override :
          "assets/poi.png";
      default:
        return "/assets/poi.png";
    }
  }
}
