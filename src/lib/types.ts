export type MarketCategoryId =
  | "result"
  | "handicaps"
  | "halves"
  | "team_totals"
  | "goals"
  | "corners"
  | "cards"
  | "shots"
  | "players";

export interface AnalysisFilters {
  scanDate: string;
  horizonHours: number;
  minOdd: number;
  maxOdd: number;
  pickCount: number;
  targetAccumulatorOdd: number;
  leagueIds: number[];
  marketCategories: MarketCategoryId[];
  useWebSearch: boolean;
  includeSameGame: boolean;
}

export interface AnalysisSection {
  id:
    | "context"
    | "availability"
    | "form"
    | "offense"
    | "defense"
    | "style"
    | "advanced"
    | "matchup"
    | "set_pieces"
    | "players"
    | "calendar"
    | "environment"
    | "weather"
    | "discipline"
    | "news";
  label: string;
  tone: "support" | "caution" | "neutral";
  bullets: string[];
}

export interface XgContextSnapshot {
  homeFor: number | null;
  homeAgainst: number | null;
  awayFor: number | null;
  awayAgainst: number | null;
  combinedProjection: number | null;
  source: "feed" | "estimated" | "mixed" | "proxy";
}

export interface LineMovementSnapshot {
  openingOdd: number | null;
  previousOdd: number | null;
  currentOdd: number;
  deltaFromOpen: number | null;
  deltaFromPrevious: number | null;
  trend: "steam" | "drift" | "flat" | "new";
  sampleCount: number;
  signal: string;
}

export interface ClvSnapshot {
  status: "pending" | "positive" | "negative" | "flat" | "unavailable";
  capturedOdd: number;
  closingOdd: number | null;
  delta: number | null;
  percentage: number | null;
}

export interface PickTrackingSnapshot {
  status: "open" | "won" | "lost" | "void" | "ungraded";
  settledAt: string | null;
  resultLabel: string | null;
  profitUnits: number | null;
}

export interface RefereeStatsSnapshot {
  refereeName: string | null;
  samples: number;
  yellowAvg: number | null;
  redAvg: number | null;
  foulsAvg: number | null;
  over45CardsRate: number | null;
}

export interface PerformanceBucket {
  key: string;
  label: string;
  total: number;
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  ungraded: number;
  roiUnits: number;
  hitRate: number | null;
  averageClv: number | null;
  positiveClvRate: number | null;
}

export interface PerformanceSummary {
  totalTracked: number;
  settledCount: number;
  wins: number;
  losses: number;
  voids: number;
  ungraded: number;
  openCount: number;
  roiUnits: number;
  roiPct: number | null;
  hitRate: number | null;
  averageClv: number | null;
  positiveClvRate: number | null;
  byMarket: PerformanceBucket[];
  byLeague: PerformanceBucket[];
  byConfidence: PerformanceBucket[];
}

export interface ConfigStatus {
  openai: boolean;
  apiFootball: boolean;
  apiFootballPlanMode: "free" | "pro";
  primaryBookmakerName: string;
  primaryBookmakerUrl: string;
  singleBookmakerMode: boolean;
  tursoRemote: boolean;
  storageMode: "turso" | "local";
  webSearchEnabled: boolean;
  openAiModel: string;
}

export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
  emphasis: string;
}

export interface SupportedMarketCategory {
  id: MarketCategoryId;
  label: string;
  description: string;
  accent: string;
}

export interface AnalysisPick {
  candidateId: string;
  fixtureId: number;
  fixtureLabel: string;
  fixtureDate: string;
  leagueId: number;
  leagueName: string;
  leagueCountry: string;
  homeTeam: string;
  awayTeam: string;
  marketId: number;
  marketName: string;
  marketCategory: MarketCategoryId;
  selection: string;
  selectionKey: string;
  bestOdd: number;
  consensusOdd: number;
  sportsbookCount: number;
  bookmaker: string;
  bookmakerPool: string[];
  impliedProbability: number;
  modelProbability: number;
  fairOdd: number;
  edge: number;
  expectedValue: number;
  confidence: number;
  riskScore: number;
  dataQualityScore: number;
  xgContext: XgContextSnapshot | null;
  lineMovement: LineMovementSnapshot | null;
  clv: ClvSnapshot | null;
  tracking: PickTrackingSnapshot;
  refereeStats: RefereeStatsSnapshot | null;
  lineupStatus: "confirmed" | "projected" | "unknown";
  predictionPulse: string;
  summary: string;
  reasons: string[];
  cautions: string[];
  analysisSections: AnalysisSection[];
  newsNote: string | null;
  aiVerdict: "strong_yes" | "yes" | "lean_yes" | "pass";
  aiConfidenceLabel: "elite" | "high" | "medium" | "guarded";
}

export interface AccumulatorSuggestion {
  targetOdd: number;
  combinedOdd: number;
  confidence: number;
  picks: AnalysisPick[];
  rationale: string;
}

export interface AnalysisRun {
  id: string;
  createdAt: string;
  filters: AnalysisFilters;
  fixturesScanned: number;
  candidatesScanned: number;
  executiveSummary: string;
  systemNote: string;
  picks: AnalysisPick[];
  accumulator: AccumulatorSuggestion | null;
}

export interface AnalysisJob {
  id: string;
  status: "queued" | "running" | "failed" | "completed";
  createdAt: string;
  updatedAt: string;
  filters: AnalysisFilters;
  message: string;
  error: string | null;
}

export interface CalibrationBucket {
  key: string;
  scope: "overall" | "market" | "league";
  sampleSize: number;
  settledCount: number;
  roiPct: number | null;
  hitRate: number | null;
  positiveClvRate: number | null;
  probabilityDelta: number;
  confidenceDelta: number;
  riskDelta: number;
}

export interface CalibrationProfile {
  updatedAt: string | null;
  sampleSize: number;
  overall: CalibrationBucket | null;
  byMarket: Record<string, CalibrationBucket>;
  byLeague: Record<string, CalibrationBucket>;
}

export interface PrefetchStatus {
  fixtureEntries: number;
  oddsEntries: number;
  lastFixturesAt: string | null;
  lastOddsAt: string | null;
}

export interface WorkerStatus {
  queuedJobs: number;
  runningJobs: number;
  failedLast24h: number;
  completedLast24h: number;
  lastCompletedAt: string | null;
}

export interface OperationsStatus {
  calibration: CalibrationProfile;
  prefetch: PrefetchStatus;
  worker: WorkerStatus;
}

export interface DashboardSnapshot {
  config: ConfigStatus;
  latestRun: AnalysisRun | null;
  activeJob: AnalysisJob | null;
  performance: PerformanceSummary;
  operations: OperationsStatus;
  draftFilters: AnalysisFilters;
  defaultFilters: AnalysisFilters;
  supportedLeagues: SupportedLeague[];
  supportedMarkets: SupportedMarketCategory[];
}

export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    timestamp?: number;
    timezone?: string;
    referee?: string | null;
    status?: {
      long?: string;
      short?: string;
    };
    venue?: {
      id?: number;
      name?: string;
      city?: string;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string;
    flag?: string;
    season?: number;
    round?: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo?: string;
      winner?: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo?: string;
      winner?: boolean | null;
    };
  };
  goals?: {
    home: number | null;
    away: number | null;
  };
  score?: {
    halftime?: {
      home: number | null;
      away: number | null;
    };
    fulltime?: {
      home: number | null;
      away: number | null;
    };
    extratime?: {
      home: number | null;
      away: number | null;
    };
    penalty?: {
      home: number | null;
      away: number | null;
    };
  };
  events?: ApiFootballFixtureEvent[];
  lineups?: ApiFootballLineup[];
  statistics?: ApiFootballFixtureStatistics[];
  players?: ApiFootballFixturePlayers[];
}

export interface ApiFootballFixtureEvent {
  time?: {
    elapsed?: number | null;
    extra?: number | null;
  };
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  player?: {
    id?: number | null;
    name?: string | null;
  };
  assist?: {
    id?: number | null;
    name?: string | null;
  };
  type?: string | null;
  detail?: string | null;
  comments?: string | null;
}

export interface ApiFootballFixtureStatistics {
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  statistics?: Array<{
    type?: string | null;
    value?: string | number | null;
  }>;
}

export interface ApiFootballFixturePlayers {
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  players?: Array<{
    player?: {
      id?: number;
      name?: string;
      photo?: string;
    };
    statistics?: Array<{
      games?: {
        minutes?: number | null;
        number?: number | null;
        position?: string | null;
        rating?: string | null;
        captain?: boolean | null;
        substitute?: boolean | null;
      };
      offsides?: number | null;
      shots?: {
        total?: number | null;
        on?: number | null;
      };
      goals?: {
        total?: number | null;
        conceded?: number | null;
        assists?: number | null;
        saves?: number | null;
      };
      passes?: {
        total?: number | null;
        key?: number | null;
        accuracy?: string | number | null;
      };
      tackles?: {
        total?: number | null;
        blocks?: number | null;
        interceptions?: number | null;
      };
      duels?: {
        total?: number | null;
        won?: number | null;
      };
      dribbles?: {
        attempts?: number | null;
        success?: number | null;
        past?: number | null;
      };
      fouls?: {
        drawn?: number | null;
        committed?: number | null;
      };
      cards?: {
        yellow?: number | null;
        red?: number | null;
      };
      penalty?: {
        won?: number | null;
        commited?: number | null;
        scored?: number | null;
        missed?: number | null;
        saved?: number | null;
      };
    }>;
  }>;
}

export interface ApiFootballOddsEntry {
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string;
    flag?: string;
    season?: number;
  };
  fixture: {
    id: number;
    date: string;
    timestamp?: number;
  };
  update?: string;
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{
        value: string;
        odd: string;
        handicap?: string | null;
      }>;
    }>;
  }>;
}

export interface ApiFootballPrediction {
  predictions?: {
    winner?: {
      id?: number | null;
      name?: string | null;
      comment?: string | null;
    };
    advice?: string | null;
    percent?: {
      home?: string;
      draw?: string;
      away?: string;
    };
  };
  teams?: {
    home?: {
      id?: number;
      name?: string;
      last_5?: {
        played?: number;
        form?: string;
        att?: string;
        def?: string;
        goals?: {
          for?: {
            total?: number;
            average?: string;
          };
          against?: {
            total?: number;
            average?: string;
          };
        };
      };
      league?: {
        form?: string;
      };
    };
    away?: {
      id?: number;
      name?: string;
      last_5?: {
        played?: number;
        form?: string;
        att?: string;
        def?: string;
        goals?: {
          for?: {
            total?: number;
            average?: string;
          };
          against?: {
            total?: number;
            average?: string;
          };
        };
      };
      league?: {
        form?: string;
      };
    };
  };
  comparison?: Record<
    string,
    {
      home?: string;
      away?: string;
    }
  >;
}

export interface ApiFootballStandingEntry {
  rank?: number;
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  points?: number;
  goalsDiff?: number;
  group?: string;
  form?: string;
  status?: string;
  description?: string | null;
  all?: {
    played?: number;
    win?: number;
    draw?: number;
    lose?: number;
    goals?: {
      for?: number;
      against?: number;
    };
  };
  home?: {
    played?: number;
    win?: number;
    draw?: number;
    lose?: number;
    goals?: {
      for?: number;
      against?: number;
    };
  };
  away?: {
    played?: number;
    win?: number;
    draw?: number;
    lose?: number;
    goals?: {
      for?: number;
      against?: number;
    };
  };
  update?: string;
}

export interface ApiFootballTeamStatistics {
  league?: {
    id?: number;
    name?: string;
    country?: string;
    logo?: string;
    flag?: string;
    season?: number;
  };
  team?: {
    id?: number;
    name?: string;
    logo?: string;
  };
  form?: string | null;
  fixtures?: {
    played?: {
      home?: number;
      away?: number;
      total?: number;
    };
    wins?: {
      home?: number;
      away?: number;
      total?: number;
    };
    draws?: {
      home?: number;
      away?: number;
      total?: number;
    };
    loses?: {
      home?: number;
      away?: number;
      total?: number;
    };
  };
  goals?: {
    for?: {
      total?: {
        home?: number;
        away?: number;
        total?: number;
      };
      average?: {
        home?: string | null;
        away?: string | null;
        total?: string | null;
      };
      minute?: Record<
        string,
        {
          total?: number | null;
          percentage?: string | null;
        }
      >;
      under_over?: Record<
        string,
        {
          over?: number | null;
          under?: number | null;
        }
      >;
    };
    against?: {
      total?: {
        home?: number;
        away?: number;
        total?: number;
      };
      average?: {
        home?: string | null;
        away?: string | null;
        total?: string | null;
      };
      minute?: Record<
        string,
        {
          total?: number | null;
          percentage?: string | null;
        }
      >;
      under_over?: Record<
        string,
        {
          over?: number | null;
          under?: number | null;
        }
      >;
    };
  };
  biggest?: {
    streak?: {
      wins?: number;
      draws?: number;
      loses?: number;
    };
    wins?: {
      home?: string | null;
      away?: string | null;
    };
    loses?: {
      home?: string | null;
      away?: string | null;
    };
    goals?: {
      for?: {
        home?: number | null;
        away?: number | null;
      };
      against?: {
        home?: number | null;
        away?: number | null;
      };
    };
  };
  clean_sheet?: {
    home?: number;
    away?: number;
    total?: number;
  };
  failed_to_score?: {
    home?: number;
    away?: number;
    total?: number;
  };
  penalty?: {
    scored?: {
      total?: number | null;
      percentage?: string | null;
    };
    missed?: {
      total?: number | null;
      percentage?: string | null;
    };
    total?: number | null;
  };
  lineups?: Array<{
    formation?: string | null;
    played?: number | null;
  }>;
  cards?: {
    yellow?: Record<
      string,
      {
        total?: number | null;
        percentage?: string | null;
      }
    >;
    red?: Record<
      string,
      {
        total?: number | null;
        percentage?: string | null;
      }
    >;
  };
}

export interface ApiFootballLineup {
  team?: {
    id?: number;
    name?: string;
  };
  formation?: string | null;
  startXI?: Array<{
    player?: {
      id?: number;
      name?: string;
      number?: number | null;
      pos?: string | null;
      grid?: string | null;
    };
  }>;
  substitutes?: Array<{
    player?: {
      id?: number;
      name?: string;
      number?: number | null;
      pos?: string | null;
      grid?: string | null;
    };
  }>;
}

export interface ApiFootballInjury {
  team?: {
    id?: number;
    name?: string;
  };
  player?: {
    id?: number;
    name?: string;
    type?: string | null;
    reason?: string | null;
  };
}

export interface ApiFootballPlayer {
  player?: {
    id?: number;
    name?: string;
    firstname?: string;
    lastname?: string;
    age?: number | null;
    nationality?: string | null;
    injured?: boolean | null;
    photo?: string | null;
  };
  statistics?: Array<{
    team?: {
      id?: number;
      name?: string;
      logo?: string;
    };
    league?: {
      id?: number | null;
      name?: string | null;
      country?: string | null;
      logo?: string | null;
      flag?: string | null;
      season?: number | null;
    };
    games?: {
      appearences?: number | null;
      lineups?: number | null;
      minutes?: number | null;
      number?: number | null;
      position?: string | null;
      rating?: string | null;
      captain?: boolean | null;
    };
    substitutes?: {
      in?: number | null;
      out?: number | null;
      bench?: number | null;
    };
    shots?: {
      total?: number | null;
      on?: number | null;
    };
    goals?: {
      total?: number | null;
      conceded?: number | null;
      assists?: number | null;
      saves?: number | null;
    };
    passes?: {
      total?: number | null;
      key?: number | null;
      accuracy?: number | null;
    };
    tackles?: {
      total?: number | null;
      blocks?: number | null;
      interceptions?: number | null;
    };
    duels?: {
      total?: number | null;
      won?: number | null;
    };
    dribbles?: {
      attempts?: number | null;
      success?: number | null;
      past?: number | null;
    };
    fouls?: {
      drawn?: number | null;
      committed?: number | null;
    };
    cards?: {
      yellow?: number | null;
      yellowred?: number | null;
      red?: number | null;
    };
    penalty?: {
      won?: number | null;
      commited?: number | null;
      scored?: number | null;
      missed?: number | null;
      saved?: number | null;
    };
  }>;
}

export interface WeatherSnapshot {
  locationLabel: string;
  kickoffLocalTime: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
  weatherCode: number | null;
}
