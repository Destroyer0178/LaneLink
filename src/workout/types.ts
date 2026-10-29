export type Category = "Warmup" | "Drill" | "Main Set" | "Kick" | "Pull" | "Sprint" | "Cooldown"

export type Confidence = "verified" | "review" | "missing"
export type DistanceUnit = "yards" | "meters" | "unknown"

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
  kind?: "set" | "rounds" | "unrecognized"
  rounds?: number
  children?: SetPiece[]
  betweenRounds?: SetPiece[]
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
}
