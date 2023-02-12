import { Injectable } from '@angular/core';
import {PointTuple} from "leaflet";
// @ts-ignore
import FuzzySearch from 'fuzzy-search'

export interface SearchEntry {
  coords: PointTuple
  chatLink: string;
  type: string;
  name: string
  description?: string
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private searchEntries: SearchEntry[] = [];
  private searcher: FuzzySearch;

  constructor() {
    this.searcher = new FuzzySearch(this.searchEntries, ["name", "chatLink", "description"], { sort: true });
  }

  public addSearch(entry: SearchEntry) {
    entry.type = entry.type.toLowerCase();
    this.searchEntries.push(entry);
  }

  public search(needle: string) : SearchEntry[] {
    return this.searcher.search(needle);
  }
}
