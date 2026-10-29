export type Category = "Warmup" | "Drill" | "Main Set" | "Kick" | "Pull" | "Sprint" | "Cooldown"

export type Confidence = "verified" | "review" | "missing"
export type DistanceUnit = "yards" | "meters" | "unknown"
export type CourseType = "SCY" | "SCM" | "LCM"
export type Stroke = "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "individual medley" | "kick" | "pull" | "other"
export type TrainingGoal = "recovery" | "aerobic" | "threshold" | "speed" | "custom"

export type PerformanceRecord = {
  id: string
  swimmerId: string
  swimmerName: string
  eventDistance: number
  stroke: Stroke
  course: CourseType
  timeSeconds: number
  recordedAt?: string
  updatedAt: string
}

export type SwimmerIntervalEstimate = {
  swimmerId: string
  swimmerName: string
  workingTimeSeconds: number | null
  desiredRestSeconds: number | null
  recommendedSendOffSeconds: number | null
  method: "matching" | "related" | "manual" | "insufficient"
  sourceRecordId?: string
  explanation: string
}

export type IntervalGroup = {
  id: string
  name: string
  sendOffSeconds: number
  swimmerIds: string[]
  workingTimeRange: [number, number]
  restRange: [number, number]
  insufficientRestSwimmerIds: string[]
  warnings: string[]
}

export type IntervalRecommendation = {
  generatedAt: string
  dataFingerprint: string
  goal: TrainingGoal
  assumptions: string[]
  estimates: SwimmerIntervalEstimate[]
  groups: IntervalGroup[]
  status: "calculated" | "estimated" | "manual"
  warnings: string[]
  accepted: boolean
}

export type AdaptiveIntervalConfig = {
  enabled: boolean
  goal: TrainingGoal
  desiredRestSeconds?: number
  customWorkMultiplier?: number
  customMaxRestRatio?: number
  manualIntervalSeconds?: number
  groupCount: number
  recommendation?: IntervalRecommendation
  previousRest?: string
}

export type SetPiece = {
  id: string
  name: string
  category: Category
  instructions: string
  repeats: number
  distance: number
  unit?: DistanceUnit
  stroke?: string
  equipment?: string[]
  rest?: string
  notes?: string
  manualYardage?: number
  confidence?: Confidence
  confidenceNote?: string
  kind?: "set" | "rounds" | "circuit" | "unrecognized"
  rounds?: number
  children?: SetPiece[]
  betweenRounds?: SetPiece[]
  restBetweenPieces?: string
  restBetweenRounds?: string
  restAfterFinalRound?: boolean
  adaptiveInterval?: AdaptiveIntervalConfig
  sourceText?: string
  normalizedText?: string
}

export type WorkoutSection = {
  id: string
  name: string
  pieces: SetPiece[]
}

export type Workout = {
  id: string
  title: string
  description: string
  created: string
  modified: string
  sections: WorkoutSection[]
  adaptiveIntervalsEnabled?: boolean
}
