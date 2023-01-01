import { Component, OnInit } from '@angular/core';
import {AchievementDetails, DailyService} from "../../../services/daily.service";
import {ArraySortPipe} from "../../../pipes/orderBy.pipe";

@Component({
  selector: 'app-daily-grid',
  templateUrl: './daily-grid.component.html',
  styleUrls: ['./daily-grid.component.css'],
  providers: [ ArraySortPipe ]
})
export class DailyGridComponent implements OnInit {
  dailies: {[type: string]: AchievementDetails[]} = {};
  friendlyCatNames: any = {
    "pve": "Open World",
    "pvp": "PvP",
    "wvw": "WvW",
    "fractals": "Fractals",
  }


  constructor(private dailyService: DailyService) { }

  ngOnInit(): void {
    this.dailyService.getDailyAchievements()
      .subscribe((val) => {
        if (!val.category)
          return;

        if (!this.dailies[val.category])
          this.dailies[val.category] = [];

        if (val.max_level !== 80)
          return;

        if (val.name.startsWith("Daily")) {
          val.name = val.name.substring(6);
        }

        if (val.name.startsWith("Adventure: ")) {
          val.name = val.name.substring(11);
        }

        if (val.category === "fractals") {
          const isTierAchievement = val.name.includes("Tier")
          if (isTierAchievement) {
            const tierIdx = val.name.indexOf("Tier");

            val.name = `${val.name.substring(0, tierIdx - 1)} ${val.name.substring(tierIdx + 6)}`

            const hasMatch = this.dailies["fractals"].filter(a => a.name === val.name).length > 0
            if (hasMatch)
              return;
          }

          /*const isRecommendedAchievement = val.name.includes("Recommended")
          if (isRecommendedAchievement) {
            const recommendedIdx = val.name.indexOf("—");

            val.name = val.name.substring(recommendedIdx + 1)
          }*/
        }

        this.dailies[val.category].push(
          val
        )
      })
  }

}
