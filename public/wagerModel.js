// wagerModel.js

class Wager {
  constructor(teamName, openTeam, takenOdds, openOdds, wager, eventTime, firstUser, group, sportId, eventId) {
    this.teamName = teamName;
    this.openTeam = openTeam;
    this.takenOdds = takenOdds;
    this.openOdds = openOdds;
    this.wager = wager;
    this.eventTime = eventTime;
    this.firstUser = firstUser;
    this.group = group;
    this.sportId = sportId;
    this.eventId = eventId;
  }
}

module.exports = Wager;
