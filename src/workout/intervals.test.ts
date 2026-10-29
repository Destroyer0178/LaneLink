import { describe, expect, it } from "vitest"
import type {
  AdaptiveIntervalConfig,
  PerformanceRecord,
  SetPiece,
} from "./types"
import {
  createDataFingerprint,
  evaluateGroupInterval,
  isRecommendationStale,
  parsePerformanceTime,
  recommendIntervals,
  roundSendOff,
} from "./intervals"

const set: SetPiece = {
  id: "set-1",
  name: "100 Freestyle",
  category: "Main Set",
  instructions: "8 x 100 freestyle",
  repeats: 8,
  distance: 100,
  unit: "yards",
  stroke: "freestyle",
}

const record = (
  id: string,
  swimmerName: string,
  distance: number,
  timeSeconds: number,
  stroke: PerformanceRecord["stroke"] = "freestyle",
  course: PerformanceRecord["course"] = "SCY",
): PerformanceRecord => ({
  id,
  swimmerId: id,
  swimmerName,
  eventDistance: distance,
  stroke,
  course,
  timeSeconds,
  updatedAt: "2025-01-01T00:00:00.000Z",
})

const config: AdaptiveIntervalConfig = {
  enabled: true,
  goal: "threshold",
  groupCount: 3,
}

describe("performance time validation", () => {
  it("accepts seconds and minutes:seconds", () => {
    expect(parsePerformanceTime("58.42")).toEqual({
      valid: true,
      seconds: 58.42,
    })
    expect(parsePerformanceTime("1:02.50")).toEqual({
      valid: true,
      seconds: 62.5,
    })
  })

  it("rejects invalid times", () => {
    expect(parsePerformanceTime("1:72").valid).toBe(false)
    expect(parsePerformanceTime("fast").valid).toBe(false)
    expect(parsePerformanceTime("0").valid).toBe(false)
  })
})

describe("adaptive interval recommendations", () => {
  it("uses matching distance, stroke, and course data", () => {
    const result = recommendIntervals(
      set,
      [record("a", "Ava", 100, 60)],
      config,
    )
    expect(result.estimates[0].method).toBe("matching")
    expect(result.estimates[0].workingTimeSeconds).toBeCloseTo(66)
    expect(result.estimates[0].desiredRestSeconds).toBe(5)
    expect(result.estimates[0].recommendedSendOffSeconds).toBe(75)
  })

  it("estimates only from reasonably related events", () => {
    const result = recommendIntervals(set, [record("a", "Ava", 50, 28)], config)
    expect(result.estimates[0].method).toBe("related")
    expect(result.status).toBe("estimated")
  })

  it("does not use mismatched stroke, course, or distant sprint data", () => {
    const records = [
      record("a", "Ava", 100, 70, "backstroke"),
      record("b", "Ben", 100, 65, "freestyle", "SCM"),
      record("c", "Cam", 25, 12, "freestyle"),
    ]
    const result = recommendIntervals(set, records, config)
    expect(
      result.estimates.every((estimate) => estimate.method === "insufficient"),
    ).toBe(true)
  })

  it("changes rest assumptions for different goals", () => {
    const records = [record("a", "Ava", 100, 60)]
    const recovery = recommendIntervals(set, records, {
      ...config,
      goal: "recovery",
    })
    const threshold = recommendIntervals(set, records, config)
    expect(recovery.estimates[0].desiredRestSeconds).toBeGreaterThan(
      threshold.estimates[0].desiredRestSeconds ?? 0,
    )
    expect(recovery.estimates[0].workingTimeSeconds).toBeGreaterThan(
      threshold.estimates[0].workingTimeSeconds ?? 0,
    )
  })

  it("rounds send-offs up to practical five-second increments", () => {
    expect(roundSendOff(71)).toBe(75)
    expect(roundSendOff(75)).toBe(75)
  })

  it("groups swimmers by set-specific working time", () => {
    const result = recommendIntervals(
      set,
      [
        record("a", "Ava", 100, 55),
        record("b", "Ben", 100, 60),
        record("c", "Cam", 100, 65),
        record("d", "Dia", 100, 70),
        record("e", "Eli", 100, 75),
        record("f", "Fox", 100, 80),
      ],
      config,
    )
    expect(result.groups).toHaveLength(3)
    expect(result.groups.flatMap((group) => group.swimmerIds)).toHaveLength(6)
    expect(result.groups[0].workingTimeRange[1]).toBeLessThan(
      result.groups[2].workingTimeRange[0],
    )
  })

  it("flags excessive rest trade-offs inside a shared group", () => {
    const result = recommendIntervals(
      set,
      [record("a", "Ava", 100, 50), record("b", "Ben", 100, 90)],
      { ...config, groupCount: 1 },
    )
    expect(result.groups[0].warnings.length).toBeGreaterThan(0)
  })

  it("flags a manually shortened group interval with insufficient rest", () => {
    const result = recommendIntervals(
      set,
      [record("a", "Ava", 100, 60)],
      config,
    )
    const estimate = result.estimates[0]
    const evaluation = evaluateGroupInterval(
      [
        {
          ...estimate,
          workingTimeSeconds: estimate.workingTimeSeconds as number,
          desiredRestSeconds: estimate.desiredRestSeconds as number,
        },
      ],
      68,
      0.18,
    )
    expect(evaluation.insufficientRestSwimmerIds).toEqual(["a"])
    expect(evaluation.warnings[0]).toContain("less than")
  })

  it("preserves manual interval overrides", () => {
    const result = recommendIntervals(set, [record("a", "Ava", 100, 60)], {
      ...config,
      manualIntervalSeconds: 95,
    })
    expect(result.status).toBe("manual")
    expect(result.estimates[0].recommendedSendOffSeconds).toBe(95)
  })

  it("detects stale recommendations after records change", () => {
    const records = [record("a", "Ava", 100, 60)]
    const recommendation = recommendIntervals(set, records, config)
    expect(isRecommendationStale(recommendation, records, set, config)).toBe(
      false,
    )
    const changed = [
      { ...records[0], timeSeconds: 61, updatedAt: "2025-02-01" },
    ]
    expect(isRecommendationStale(recommendation, changed, set, config)).toBe(
      true,
    )
    expect(createDataFingerprint(changed, set, config)).not.toBe(
      recommendation.dataFingerprint,
    )
  })
})
