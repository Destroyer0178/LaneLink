import type {
  AdaptiveIntervalConfig,
  CourseType,
  IntervalGroup,
  IntervalRecommendation,
  PerformanceRecord,
  SetPiece,
  Stroke,
  SwimmerIntervalEstimate,
  TrainingGoal,
} from "./types"

export type TimeValidation = { valid: true; seconds: number } | {
  valid: false
  error: string
}

export const GOAL_RULES: Record<Exclude<TrainingGoal, "custom">, {
  workMultiplier: number
  minimumRestSeconds: number
  maxRestRatio: number
  description: string
}> = {
  recovery: {
    workMultiplier: 1.35,
    minimumRestSeconds: 15,
    maxRestRatio: 0.45,
    description: "Relaxed working pace with generous recovery.",
  },
  aerobic: {
    workMultiplier: 1.22,
    minimumRestSeconds: 10,
    maxRestRatio: 0.3,
    description: "Sustainable aerobic pace with moderate recovery.",
  },
  threshold: {
    workMultiplier: 1.1,
    minimumRestSeconds: 5,
    maxRestRatio: 0.18,
    description: "Sustained hard pace with limited recovery.",
  },
  speed: {
    workMultiplier: 1.03,
    minimumRestSeconds: 20,
    maxRestRatio: 0.8,
    description: "High-intensity pace with enough recovery for quality.",
  },
}

export function parsePerformanceTime(value: string): TimeValidation {
  const input = value.trim()
  if (!input) return { valid: false, error: "Time is required." }
  const parts = input.split(":")
  if (
    parts.length > 2 ||
    !parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))
  ) {
    return { valid: false, error: "Use seconds or minutes:seconds." }
  }
  const seconds =
    parts.length === 2
      ? Number(parts[0]) * 60 + Number(parts[1])
      : Number(parts[0])
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    (parts.length === 2 && Number(parts[1]) >= 60)
  ) {
    return { valid: false, error: "Enter a valid positive performance time." }
  }
  return { valid: true, seconds }
}

export function formatInterval(seconds: number): string {
  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

export function roundSendOff(seconds: number, increment = 5): number {
  return Math.ceil(seconds / increment) * increment
}

function normalizedStroke(piece: SetPiece): Stroke | null {
  const text = `${piece.stroke ?? ""} ${piece.instructions}`.toLowerCase()
  if (/free(style)?/.test(text)) return "freestyle"
  if (/back(stroke)?/.test(text)) return "backstroke"
  if (/breast(stroke)?/.test(text)) return "breaststroke"
  if (/fly|butterfly/.test(text)) return "butterfly"
  if (/\bim\b|individual medley/.test(text)) return "individual medley"
  if (/kick/.test(text)) return "kick"
  if (/pull/.test(text)) return "pull"
  return null
}

function courseForPiece(piece: SetPiece): CourseType | null {
  if (piece.unit === "yards" || piece.unit === undefined) return "SCY"
  return null
}

function estimateFromRecord(piece: SetPiece, records: PerformanceRecord[]): {
  raceEquivalentSeconds: number
  method: "matching" | "related"
  record: PerformanceRecord
  explanation: string
} | null {
  const stroke = normalizedStroke(piece)
  const course = courseForPiece(piece)
  if (!stroke || !course || !piece.distance) return null
  const sameContext = records.filter(
    (record) => record.stroke === stroke && record.course === course,
  )
  const exact = sameContext.find(
    (record) => record.eventDistance === piece.distance,
  )
  if (exact) {
    return {
      raceEquivalentSeconds: exact.timeSeconds,
      method: "matching",
      record: exact,
      explanation: `Matched ${exact.eventDistance} ${exact.stroke} ${exact.course} performance.`,
    }
  }
  const related = sameContext
    .filter((record) => {
      const ratio = piece.distance / record.eventDistance
      return ratio >= 0.5 && ratio <= 2
    })
    .sort(
      (a, b) =>
        Math.abs(Math.log(piece.distance / a.eventDistance)) -
        Math.abs(Math.log(piece.distance / b.eventDistance)),
    )[0]
  if (!related) return null
  const ratio = piece.distance / related.eventDistance
  return {
    raceEquivalentSeconds: related.timeSeconds * Math.pow(ratio, 1.06),
    method: "related",
    record: related,
    explanation: `Estimated from related ${related.eventDistance} ${related.stroke} ${related.course} performance using a limited-distance Riegel exponent of 1.06.`,
  }
}

function goalRule(config: AdaptiveIntervalConfig) {
  if (config.goal !== "custom") return GOAL_RULES[config.goal]
  return {
    workMultiplier: config.customWorkMultiplier ?? 1.2,
    minimumRestSeconds: config.desiredRestSeconds ?? 10,
    maxRestRatio: config.customMaxRestRatio ?? 0.3,
    description: "Coach-configured work and recovery assumptions.",
  }
}

export function createDataFingerprint(
  records: PerformanceRecord[],
  piece: SetPiece,
  config: AdaptiveIntervalConfig,
): string {
  return JSON.stringify({
    records: records
      .map((record) => [
        record.id,
        record.eventDistance,
        record.stroke,
        record.course,
        record.timeSeconds,
        record.updatedAt,
      ])
      .sort(),
    piece: [piece.distance, piece.repeats, piece.stroke, piece.unit],
    config: [
      config.goal,
      config.desiredRestSeconds,
      config.customWorkMultiplier,
      config.customMaxRestRatio,
      config.manualIntervalSeconds,
      config.groupCount,
    ],
  })
}

export function isRecommendationStale(
  recommendation: IntervalRecommendation,
  records: PerformanceRecord[],
  piece: SetPiece,
  config: AdaptiveIntervalConfig,
): boolean {
  return (
    recommendation.dataFingerprint !==
    createDataFingerprint(records, piece, config)
  )
}

function buildGroups(
  estimates: SwimmerIntervalEstimate[],
  groupCount: number,
  maxRestRatio: number,
): IntervalGroup[] {
  const eligible = estimates
    .filter(
      (estimate): estimate is SwimmerIntervalEstimate & {
        workingTimeSeconds: number
        desiredRestSeconds: number
        recommendedSendOffSeconds: number
      } =>
        estimate.workingTimeSeconds !== null &&
        estimate.desiredRestSeconds !== null &&
        estimate.recommendedSendOffSeconds !== null,
    )
    .sort((a, b) => a.workingTimeSeconds - b.workingTimeSeconds)
  const count = Math.max(1, Math.min(groupCount, eligible.length))
  if (!eligible.length) return []
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * eligible.length) / count)
    const end = Math.floor(((index + 1) * eligible.length) / count)
    const members = eligible.slice(start, end)
    const sendOff = Math.max(
      ...members.map((member) => member.recommendedSendOffSeconds),
    )
    const evaluation = evaluateGroupInterval(members, sendOff, maxRestRatio)
    const names =
      count === 3
        ? ["Faster group", "Middle group", "Slower group"]
        : Array.from({ length: count }, (_, item) => `Group ${item + 1}`)
    return {
      id: `interval-group-${index + 1}`,
      name: names[index],
      sendOffSeconds: sendOff,
      swimmerIds: members.map((member) => member.swimmerId),
      workingTimeRange: [
        Math.min(...members.map((member) => member.workingTimeSeconds)),
        Math.max(...members.map((member) => member.workingTimeSeconds)),
      ],
      restRange: evaluation.restRange,
      insufficientRestSwimmerIds: evaluation.insufficientRestSwimmerIds,
      warnings: evaluation.warnings,
    }
  })
}

export function evaluateGroupInterval(
  members: Array<SwimmerIntervalEstimate & {
    workingTimeSeconds: number
    desiredRestSeconds: number
  }>,
  sendOffSeconds: number,
  maxRestRatio: number,
): {
  restRange: [number, number]
  insufficientRestSwimmerIds: string[]
  warnings: string[]
} {
  const rests = members.map(
    (member) => sendOffSeconds - member.workingTimeSeconds,
  )
  const insufficient = members.filter(
    (member) =>
      sendOffSeconds - member.workingTimeSeconds < member.desiredRestSeconds,
  )
  const excessive = members.filter(
    (member) =>
      sendOffSeconds - member.workingTimeSeconds >
      member.workingTimeSeconds * maxRestRatio,
  )
  const warnings: string[] = []
  if (insufficient.length)
    warnings.push("Some swimmers receive less than the minimum requested rest.")
  if (excessive.length)
    warnings.push(
      "Some swimmers receive more rest than the selected goal usually calls for.",
    )
  return {
    restRange: rests.length ? [Math.min(...rests), Math.max(...rests)] : [0, 0],
    insufficientRestSwimmerIds: insufficient.map((member) => member.swimmerId),
    warnings,
  }
}

export function recommendIntervals(
  piece: SetPiece,
  records: PerformanceRecord[],
  config: AdaptiveIntervalConfig,
): IntervalRecommendation {
  const swimmers = new Map<string, PerformanceRecord[]>()
  records.forEach((record) => {
    swimmers.set(record.swimmerId, [
      ...(swimmers.get(record.swimmerId) ?? []),
      record,
    ])
  })
  const rule = goalRule(config)
  const estimates: SwimmerIntervalEstimate[] = [...swimmers.entries()].map(
    ([swimmerId, swimmerRecords]) => {
      const swimmerName = swimmerRecords[0]?.swimmerName ?? swimmerId
      if (config.manualIntervalSeconds) {
        return {
          swimmerId,
          swimmerName,
          workingTimeSeconds: null,
          desiredRestSeconds: null,
          recommendedSendOffSeconds: config.manualIntervalSeconds,
          method: "manual",
          explanation: "Coach supplied a manual send-off interval.",
        }
      }
      const basis = estimateFromRecord(piece, swimmerRecords)
      if (!basis) {
        return {
          swimmerId,
          swimmerName,
          workingTimeSeconds: null,
          desiredRestSeconds: null,
          recommendedSendOffSeconds: null,
          method: "insufficient",
          explanation:
            "No matching or reasonably related stroke, distance, and course record is available.",
        }
      }
      const workingTime = basis.raceEquivalentSeconds * rule.workMultiplier
      const rest = config.desiredRestSeconds ?? rule.minimumRestSeconds
      return {
        swimmerId,
        swimmerName,
        workingTimeSeconds: workingTime,
        desiredRestSeconds: rest,
        recommendedSendOffSeconds: roundSendOff(workingTime + rest),
        method: basis.method,
        sourceRecordId: basis.record.id,
        explanation: basis.explanation,
      }
    },
  )
  const groups = config.manualIntervalSeconds
    ? []
    : buildGroups(estimates, config.groupCount, rule.maxRestRatio)
  const warnings: string[] = []
  const insufficient = estimates.filter(
    (estimate) => estimate.method === "insufficient",
  )
  if (insufficient.length)
    warnings.push(
      `${insufficient.length} swimmer(s) need more relevant performance data.`,
    )
  groups
    .flatMap((group) => group.warnings)
    .forEach((warning) => {
      if (!warnings.includes(warning)) warnings.push(warning)
    })
  return {
    generatedAt: new Date().toISOString(),
    dataFingerprint: createDataFingerprint(records, piece, config),
    goal: config.goal,
    assumptions: [
      rule.description,
      `Working-time multiplier: ${rule.workMultiplier.toFixed(2)}.`,
      `Minimum rest: ${config.desiredRestSeconds ?? rule.minimumRestSeconds} seconds.`,
      "Related-distance estimates are limited to records between half and twice the set distance.",
      "Send-offs are rounded up to the next five seconds.",
    ],
    estimates,
    groups,
    status: config.manualIntervalSeconds
      ? "manual"
      : estimates.some((estimate) => estimate.method === "related")
        ? "estimated"
        : "calculated",
    warnings,
    accepted: false,
  }
}
