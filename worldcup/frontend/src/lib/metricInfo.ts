// ─────────────────────────────────────────────────────────────────────────────
// Metric explainers (owner request 7/17) — what each proprietary metric
// measures and why it matters, in plain fan language. Shown via the InfoTip
// "i" popover next to metric badges. Deliberately NO formulas here: the math
// lives on the (future) methodology page; cards keep the mystique
// (owner platform-story directive).
// ─────────────────────────────────────────────────────────────────────────────

export const METRIC_INFO: Record<string, { name: string; blurb: string }> = {
  matchDna: {
    name: "Match DNA™",
    blurb: "The fingerprint of a match: when each team struck across the 90+ minutes. Read it to see who controlled which phases — early blitz, second-half surge, or late drama.",
  },
  momentumPulse: {
    name: "Momentum Pulse™",
    blurb: "Who has the game by the throat right now. Combines the goal timeline with live pressure — possession, shots and corners — so it moves even at 0-0.",
  },
  strikeClock: {
    name: "Strike Clock™",
    blurb: "The match's goal-timing rhythm: when the first blow landed, how long between goals, and whether scoring came in bursts or a steady drumbeat.",
  },
  scoreVolatility: {
    name: "Score Volatility™",
    blurb: "How much the story of the match changed: lead changes and equalisers. High volatility = a rollercoaster; low = one team dictated the script.",
  },
  clutchIndex: {
    name: "Clutch Index™",
    blurb: "Credit for goals that mattered most — lead-changers and equalisers, with late-game moments weighted heaviest. The players who show up when it counts.",
  },
  goalGravity: {
    name: "Goal Gravity™",
    blurb: "The narrative weight of each goal: comebacks and lead-breakers pull hardest, late drama pulls hardest of all. A 90th-minute equaliser outweighs a fifth in a rout.",
  },
  upsetFactor: {
    name: "Upset Factor™",
    blurb: "How shocking a result was, judged against pre-match prediction-market odds. The bigger the underdog that won, the higher the reading.",
  },
  pressingIntensity: {
    name: "Pressing Intensity Index™",
    blurb: "How physically confrontational each side played, built from fouls and cards. High readings mean a game fought in the trenches.",
  },
  transitionDanger: {
    name: "Transition Danger Rating™",
    blurb: "Lethality on the counter: goals scored in quick succession or straight after conceding. High ratings belong to teams that punish you in a heartbeat.",
  },
  formMeter: {
    name: "Form Meter™",
    blurb: "The last five results, most recent first, with points earned. A quick read on whether a team arrives hot or limping.",
  },
  eliminationProximity: {
    name: "Elimination Proximity™",
    blurb: "How close a team stands to the exit door, from group position and games remaining. Red means the cliff edge.",
  },
  playerPerformanceIndex: {
    name: "Player Performance Index™",
    blurb: "One number for a player's tournament: goals and assists weighted with match ratings, minus discipline. The engine behind our player boards.",
  },
  clubContribution: {
    name: "Club Contribution Index™",
    blurb: "Which clubs powered this tournament — how many players each club sent and the firepower they brought.",
  },
  fatigueFactor: {
    name: "Fatigue Factor™",
    blurb: "The hidden opponent: accumulated travel miles, days of rest, and extra-time minutes in each team's legs coming into this game.",
  },
  groupIntensity: {
    name: "Group Intensity™",
    blurb: "How fierce a group was: how tightly packed the points finished and how freely the goals flowed.",
  },
};
