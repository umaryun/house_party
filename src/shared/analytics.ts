// Shape of the admin analytics report (computed on the server, drawn by the dashboard).

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  visitors: number;
  signups: number;
  players: number; // unique users who were in a party that day
  games: number;
  chats: number;
}

export interface StatsReport {
  generatedAt: number;
  days: number;
  live: { playersOnline: number; partiesLive: number; gamesRunning: number };
  totals: {
    visitors: number;
    signups: number;
    guestSignups: number;
    accountsSaved: number;
    activePlayers: number;
    returningPlayers: number; // active on 2+ different days in the range
    partiesCreated: number;
    gamesPlayed: number;
    chatMessages: number;
    avgPlayersPerGame: number;
  };
  daily: DailyPoint[];
  funnel: { step: string; count: number }[];
  games: { type: string; started: number; finished: number; avgPlayers: number }[];
  joins: { via: string; count: number }[];
  sources: { source: string; visitors: number; signups: number }[];
}
