import {selectUserRegion, selectUserWvwTeam} from "./user/user.feature";
import {selectUserTopic} from "./live-markers/live-markers.feature";
import {selectActiveMatch} from "./mists/mists.feature";
import {ChannelType, SettingsState} from "./settings/settings.feature";
import {Match, MatchOverview} from "../services/wvw.model";

// createSelector exposes the final projector as `.projector`, so these branchy
// selectors can be tested as pure functions — no store/TestBed needed.

describe("selectUserRegion", () => {
  it("maps world ids >= 2000 to EU and below to US (boundary at 2000)", () => {
    expect(selectUserRegion.projector("1999")).toBe("us");
    expect(selectUserRegion.projector("1019")).toBe("us");
    expect(selectUserRegion.projector("2000")).toBe("eu");
    expect(selectUserRegion.projector("2301")).toBe("eu");
  });
});

describe("selectUserWvwTeam", () => {
  const match = (red: string[], green: string[], blue: string[]): MatchOverview => ({
    id: "2-1",
    worlds: {red: 0, blue: 0, green: 0},
    all_worlds: {red, green, blue},
    start_time: new Date(),
    end_time: new Date(),
  });

  it("returns undefined when there is no active match", () => {
    expect(selectUserWvwTeam.projector(undefined, "1019")).toBeUndefined();
  });

  it("resolves the team that contains the user's world", () => {
    const m = match(["1019"], ["1020"], ["1021"]);
    expect(selectUserWvwTeam.projector(m, "1019")).toEqual({team: "red", matchId: "2-1"});
    expect(selectUserWvwTeam.projector(m, "1020")).toEqual({team: "green", matchId: "2-1"});
    expect(selectUserWvwTeam.projector(m, "1021")).toEqual({team: "blue", matchId: "2-1"});
  });

  it("documents the fall-through: a world in no team silently reports blue", () => {
    const m = match(["1019"], ["1020"], ["1021"]);
    expect(selectUserWvwTeam.projector(m, "9999")).toEqual({team: "blue", matchId: "2-1"});
  });
});

describe("selectActiveMatch", () => {
  const match = (id: string): Match => ({id} as Match);

  it("returns null when there is no active match id", () => {
    expect(selectActiveMatch.projector({}, null)).toBeNull();
  });

  it("returns null when the active id isn't in the matches dictionary", () => {
    expect(selectActiveMatch.projector({"2-1": match("2-1")}, "2-9")).toBeNull();
  });

  it("resolves the active match from the dictionary", () => {
    const m = match("2-1");
    expect(selectActiveMatch.projector({"2-1": m}, "2-1")).toBe(m);
  });
});

describe("selectUserTopic", () => {
  const settings = (over: Partial<SettingsState> = {}): SettingsState => ({
    apiKey: undefined,
    lastMatchId: undefined,
    liveMapEnabled: true,
    selectedChannel: ChannelType.Global,
    guildChannel: undefined,
    customChannel: undefined,
    ...over,
  });
  const team = {team: "red", matchId: "2-7"};

  it("returns undefined when the user is not on a team", () => {
    expect(selectUserTopic.projector(settings(), 1, "eu", undefined, "Acc.1234")).toBeUndefined();
  });

  it("Global on Tyria (continent 1) keys by region", () => {
    expect(selectUserTopic.projector(settings(), 1, "eu", team, "Acc.1234"))
      .toBe("maps.gw2.io/global/1/eu/#");
  });

  it("Global in the Mists (continent 2) keys by match + team", () => {
    expect(selectUserTopic.projector(settings(), 2, "eu", team, "Acc.1234"))
      .toBe("maps.gw2.io/global/2/2-7/red/#");
  });

  it("routes Guild / Custom / Solo channels to their own topics", () => {
    expect(selectUserTopic.projector(settings({selectedChannel: ChannelType.Guild, guildChannel: "G1"}), 1, "eu", team, "Acc.1234"))
      .toBe("maps.gw2.io/guild/G1/#");
    expect(selectUserTopic.projector(settings({selectedChannel: ChannelType.Custom, customChannel: "C1"}), 1, "eu", team, "Acc.1234"))
      .toBe("maps.gw2.io/custom/C1/#");
    expect(selectUserTopic.projector(settings({selectedChannel: ChannelType.Solo}), 1, "eu", team, "Acc.1234"))
      .toBe("maps.gw2.io/solo/Acc.1234/#");
  });
});
