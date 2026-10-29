import type { SetPiece, Workout, WorkoutSection } from "./types"

export type YardageResult = { status: "resolved"; yards: number } | {
  status: "unresolved"
  yards: null
  reason: string
}

export function calculatePieceYardage(piece: SetPiece): YardageResult {
  if (piece.manualYardage !== undefined) {
    return { status: "resolved", yards: piece.manualYardage }
  }

  if (
    piece.kind === "rounds" ||
    piece.kind === "circuit" ||
    piece.children?.length
  ) {
    if (!piece.rounds || !piece.children?.length) {
      return {
        status: "unresolved",
        yards: null,
        reason: "Repeated group is missing a round count or child sets.",
      }
    }
    const childResults = piece.children.map(calculatePieceYardage)
    const recoveryResults = (piece.betweenRounds ?? []).map(
      calculatePieceYardage,
    )
    const unresolved = [...childResults, ...recoveryResults].find(
      (result) => result.status === "unresolved",
    )
    if (unresolved?.status === "unresolved") return unresolved
    const childYards = childResults.reduce(
      (sum, result) => sum + (result.status === "resolved" ? result.yards : 0),
      0,
    )
    const recoveryYards = recoveryResults.reduce(
      (sum, result) => sum + (result.status === "resolved" ? result.yards : 0),
      0,
    )
    return {
      status: "resolved",
      yards:
        childYards * piece.rounds +
        recoveryYards * Math.max(0, piece.rounds - 1),
    }
  }

  if (!piece.distance || !piece.repeats) {
    return {
      status: "unresolved",
      yards: null,
      reason: "Distance or repetition count is missing.",
    }
  }

  // Existing manually-created pieces predate explicit units and are yard-based.
  if (piece.unit === undefined || piece.unit === "yards") {
    return {
      status: "resolved",
      yards: piece.distance * piece.repeats,
    }
  }

  return {
    status: "unresolved",
    yards: null,
    reason:
      piece.unit === "meters"
        ? "Meter distances are not converted to yards automatically."
        : "Distance unit must be confirmed.",
  }
}

export function calculateCircuitYardage(
  piece: SetPiece,
): {
  perRound: YardageResult
  total: YardageResult
} {
  if (piece.kind !== "circuit" || !piece.children?.length || !piece.rounds) {
    const unresolved: YardageResult = {
      status: "unresolved",
      yards: null,
      reason: "Circuit requires at least one piece and one round.",
    }
    return { perRound: unresolved, total: unresolved }
  }
  const childResults = piece.children.map(calculatePieceYardage)
  const unresolved = childResults.find(
    (result) => result.status === "unresolved",
  )
  if (unresolved?.status === "unresolved") {
    return { perRound: unresolved, total: unresolved }
  }
  const perRoundYards = childResults.reduce(
    (sum, result) => sum + (result.status === "resolved" ? result.yards : 0),
    0,
  )
  return {
    perRound: { status: "resolved", yards: perRoundYards },
    total: {
      status: "resolved",
      yards: perRoundYards * piece.rounds,
    },
  }
}

export function calculateSectionYardage(
  section: WorkoutSection,
): YardageResult {
  const results = section.pieces.map(calculatePieceYardage)
  const unresolved = results.find((result) => result.status === "unresolved")
  if (unresolved?.status === "unresolved") return unresolved
  return {
    status: "resolved",
    yards: results.reduce(
      (sum, result) => sum + (result.status === "resolved" ? result.yards : 0),
      0,
    ),
  }
}

export function calculateWorkoutYardage(workout: Workout): YardageResult {
  const results = workout.sections.flatMap((section) =>
    section.pieces.map(calculatePieceYardage),
  )
  const resolvedYards = results.reduce(
    (sum, result) => sum + (result.status === "resolved" ? result.yards : 0),
    0,
  )
  const unresolved = results.find((result) => result.status === "unresolved")
  if (unresolved?.status === "unresolved") {
    return {
      status: "unresolved",
      yards: null,
      reason: `${unresolved.reason} Resolved subtotal: ${resolvedYards} yards.`,
    }
  }
  return { status: "resolved", yards: resolvedYards }
}

export function resolvedYardageOrZero(piece: SetPiece): number {
  const result = calculatePieceYardage(piece)
  return result.status === "resolved" ? result.yards : 0
}
