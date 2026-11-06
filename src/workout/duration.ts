import type { SetPiece, Workout, WorkoutSection } from "./types"

export type DurationStatus = "calculated" | "estimated" | "incomplete"

export type DurationResult = {
  status: DurationStatus
  seconds: number
  reasons: string[]
  source?: "send-off" | "explicit" | "pace" | "nested"
}

export type TargetDurationStatus = { status: "none" } | {
  status: "over"
  differenceSeconds: number
} | { status: "within"; differenceSeconds: number } | {
  status: "incomplete"
  differenceSeconds: number | null
}

const calculated = (
  seconds: number,
  source: DurationResult["source"],
): DurationResult => ({
  status: "calculated",
  seconds,
  reasons: [],
  source,
})

function combine(results: DurationResult[], source: "nested"): DurationResult {
  const reasons = results.flatMap((result) => result.reasons)
  const status = results.some((result) => result.status === "incomplete")
    ? "incomplete"
    : results.some((result) => result.status === "estimated")
      ? "estimated"
      : "calculated"
  return {
    status,
    seconds: results.reduce((sum, result) => sum + result.seconds, 0),
    reasons,
    source,
  }
}

export function parseDurationSeconds(value?: string): number | null {
  if (!value?.trim()) return null
  const input = value.trim().toLowerCase()
  const clock = input.match(/^(\d+)?:(\d{1,2})(?::(\d{1,2}))?$/)
  if (clock) {
    const first = Number(clock[1] ?? 0)
    const second = Number(clock[2])
    const third = clock[3] === undefined ? null : Number(clock[3])
    if (second >= 60 || (third !== null && third >= 60)) return null
    return third === null
      ? first * 60 + second
      : first * 3600 + second * 60 + third
  }
  const hours = input.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)/)
  const minutes = input.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)/)
  const seconds = input.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)/)
  if (!hours && !minutes && !seconds) return null
  return Math.round(
    Number(hours?.[1] ?? 0) * 3600 +
      Number(minutes?.[1] ?? 0) * 60 +
      Number(seconds?.[1] ?? 0),
  )
}

function parseSendOffSeconds(value?: string): number | null {
  if (!value?.trim()) return null
  const input = value.trim()
  const prefixed = input.match(/^(?:@|on)\s*(.+)$/i)
  if (prefixed) return parseDurationSeconds(prefixed[1])
  return /^\d*:\d{1,2}(?::\d{1,2})?$/.test(input)
    ? parseDurationSeconds(input)
    : null
}

function adaptiveSendOff(
  piece: SetPiece,
): {
  seconds: number
  estimated: boolean
} | null {
  const config = piece.adaptiveInterval
  if (!config?.enabled) return null
  if (config.manualIntervalSeconds && config.manualIntervalSeconds > 0) {
    return { seconds: config.manualIntervalSeconds, estimated: false }
  }
  const recommendation = config.recommendation
  if (!recommendation?.accepted) return null
  const groupSendOffs = recommendation.groups
    .map((group) => group.sendOffSeconds)
    .filter((seconds) => seconds > 0)
  if (groupSendOffs.length) {
    return {
      seconds: Math.max(...groupSendOffs),
      estimated: recommendation.status === "estimated",
    }
  }
  const estimatedSendOffs = recommendation.estimates
    .map((estimate) => estimate.recommendedSendOffSeconds)
    .filter((seconds): seconds is number => seconds !== null && seconds > 0)
  if (!estimatedSendOffs.length) return null
  return { seconds: Math.max(...estimatedSendOffs), estimated: true }
}

function sendOffForPiece(piece: SetPiece) {
  return (
    adaptiveSendOff(piece) ??
    (parseSendOffSeconds(piece.rest)
      ? {
          seconds: parseSendOffSeconds(piece.rest) as number,
          estimated: false,
        }
      : null)
  )
}

function invalidRest(reason: string, seconds: number): DurationResult {
  return {
    status: "incomplete",
    seconds,
    reasons: [reason],
    source: "nested",
  }
}

function calculateRepeatedGroupDuration(piece: SetPiece): DurationResult {
  const rounds = piece.rounds ?? 0
  const children = piece.children ?? []
  if (rounds <= 0 || children.length === 0) {
    return {
      status: "incomplete",
      seconds: 0,
      reasons: [
        "Repeated group requires at least one round and one child piece.",
      ],
      source: "nested",
    }
  }

  const childResult = combine(children.map(calculatePieceDuration), "nested")
  const betweenPiecesText = piece.restBetweenPieces?.trim()
  const betweenPieces = betweenPiecesText
    ? parseDurationSeconds(betweenPiecesText)
    : 0
  const betweenRoundsText = piece.restBetweenRounds?.trim()
  const betweenRounds = betweenRoundsText
    ? parseDurationSeconds(betweenRoundsText)
    : 0
  const recoveryResult = combine(
    (piece.betweenRounds ?? []).map(calculatePieceDuration),
    "nested",
  )

  const perRoundSeconds =
    childResult.seconds +
    (betweenPieces ?? 0) * Math.max(0, children.length - 1)
  const roundRestCount = piece.restAfterFinalRound
    ? rounds
    : Math.max(0, rounds - 1)
  const totalSeconds =
    perRoundSeconds * rounds +
    (betweenRounds ?? 0) * roundRestCount +
    recoveryResult.seconds * Math.max(0, rounds - 1)
  const parts = [childResult, recoveryResult]
  if (betweenPiecesText && betweenPieces === null) {
    parts.push(
      invalidRest(
        `Could not parse rest between pieces: “${piece.restBetweenPieces}”.`,
        0,
      ),
    )
  }
  if (betweenRoundsText && betweenRounds === null) {
    parts.push(
      invalidRest(
        `Could not parse rest between rounds: “${piece.restBetweenRounds}”.`,
        0,
      ),
    )
  }
  const result = combine(parts, "nested")
  return { ...result, seconds: totalSeconds }
}

export function calculatePieceDuration(piece: SetPiece): DurationResult {
  if (
    piece.kind === "circuit" ||
    piece.kind === "rounds" ||
    piece.children?.length
  ) {
    return calculateRepeatedGroupDuration(piece)
  }

  const repeats = Number(piece.repeats)
  const sendOff = sendOffForPiece(piece)
  if (sendOff) {
    if (!Number.isFinite(repeats) || repeats <= 0) {
      return {
        status: "incomplete",
        seconds: 0,
        reasons: ["A positive repetition count is required for the send-off."],
        source: "send-off",
      }
    }
    return {
      status: sendOff.estimated ? "estimated" : "calculated",
      seconds: repeats * sendOff.seconds,
      reasons: [],
      source: "send-off",
    }
  }

  if (
    piece.explicitDurationSeconds !== undefined &&
    piece.explicitDurationSeconds > 0
  ) {
    return calculated(piece.explicitDurationSeconds, "explicit")
  }
  if (
    piece.estimatedDurationSeconds !== undefined &&
    piece.estimatedDurationSeconds > 0
  ) {
    return {
      status: "estimated",
      seconds: piece.estimatedDurationSeconds,
      reasons: [],
      source: "pace",
    }
  }

  const workingTimes =
    piece.adaptiveInterval?.recommendation?.estimates
      .map((estimate) => estimate.workingTimeSeconds)
      .filter(
        (seconds): seconds is number => seconds !== null && seconds > 0,
      ) ?? []
  if (workingTimes.length && repeats > 0) {
    return {
      status: "estimated",
      seconds: Math.max(...workingTimes) * repeats,
      reasons: [],
      source: "pace",
    }
  }

  return {
    status: "incomplete",
    seconds: 0,
    reasons: [`${piece.name || "Piece"} needs a send-off or duration.`],
  }
}

export function calculateSectionDuration(
  section: WorkoutSection,
): DurationResult {
  return combine(section.pieces.map(calculatePieceDuration), "nested")
}

export function calculateWorkoutDuration(workout: Workout): DurationResult {
  return combine(workout.sections.map(calculateSectionDuration), "nested")
}

export function evaluateTargetDuration(
  result: DurationResult,
  targetMinutes?: number,
): TargetDurationStatus {
  if (!targetMinutes || targetMinutes <= 0) return { status: "none" }
  const targetSeconds = targetMinutes * 60
  if (result.seconds > targetSeconds) {
    return {
      status: "over",
      differenceSeconds: result.seconds - targetSeconds,
    }
  }
  if (result.status === "incomplete") {
    return { status: "incomplete", differenceSeconds: null }
  }
  return {
    status: "within",
    differenceSeconds: targetSeconds - result.seconds,
  }
}

export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainder = rounded % 60
  if (hours) {
    return `${hours} hr ${minutes ? `${minutes} min` : ""}`.trim()
  }
  if (minutes) {
    return `${minutes} min ${remainder ? `${remainder} sec` : ""}`.trim()
  }
  return `${remainder} sec`
}

export function durationLabel(result: DurationResult): string {
  if (result.status === "incomplete") {
    return result.seconds
      ? `Incomplete · ${formatDuration(result.seconds)} known`
      : "Duration incomplete"
  }
  return `${result.status === "estimated" ? "Est. " : ""}${formatDuration(
    result.seconds,
  )}`
}
