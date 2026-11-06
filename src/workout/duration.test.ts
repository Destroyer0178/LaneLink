import { describe, expect, it } from "vitest"
import type { SetPiece, Workout } from "./types"
import {
  calculatePieceDuration,
  calculateWorkoutDuration,
  evaluateTargetDuration,
  parseDurationSeconds,
} from "./duration"

const piece = (id: string, repeats: number, rest?: string): SetPiece => ({
  id,
  name: id,
  category: "Main Set",
  instructions: "",
  repeats,
  distance: 100,
  rest,
})

describe("send-off-first workout duration", () => {
  it("uses repetitions multiplied by send-off without adding rest twice", () => {
    expect(calculatePieceDuration(piece("8 x 100", 8, "@ 1:30"))).toMatchObject(
      {
        status: "calculated",
        seconds: 720,
        source: "send-off",
      },
    )
    expect(calculatePieceDuration(piece("4 x 50", 4, "@ 1:00")).seconds).toBe(
      240,
    )
    expect(calculatePieceDuration(piece("6 x 100", 6, "@ 1:30")).seconds).toBe(
      540,
    )
  })

  it("uses the slowest accepted adaptive group send-off", () => {
    const adaptive = piece("adaptive", 5)
    adaptive.adaptiveInterval = {
      enabled: true,
      goal: "threshold",
      groupCount: 2,
      recommendation: {
        generatedAt: "2025-01-01",
        dataFingerprint: "test",
        goal: "threshold",
        assumptions: [],
        estimates: [],
        groups: [
          {
            id: "fast",
            name: "Fast",
            sendOffSeconds: 75,
            swimmerIds: [],
            workingTimeRange: [60, 60],
            restRange: [15, 15],
            insufficientRestSwimmerIds: [],
            warnings: [],
          },
          {
            id: "developing",
            name: "Developing",
            sendOffSeconds: 90,
            swimmerIds: [],
            workingTimeRange: [75, 75],
            restRange: [15, 15],
            insufficientRestSwimmerIds: [],
            warnings: [],
          },
        ],
        status: "calculated",
        warnings: [],
        accepted: true,
      },
    }
    expect(calculatePieceDuration(adaptive).seconds).toBe(450)
  })

  it("calculates nested circuits and only adds explicit transition rest", () => {
    const nested: SetPiece = {
      ...piece("nested", 1),
      kind: "rounds",
      rounds: 2,
      children: [piece("50s", 4, "@ 1:00")],
    }
    const circuit: SetPiece = {
      ...piece("circuit", 1),
      kind: "circuit",
      rounds: 3,
      children: [piece("100s", 2, "@ 1:30"), nested],
      restBetweenPieces: "10 seconds",
      restBetweenRounds: "30 seconds",
    }
    // Per round: 180 + 480 + 10 = 670. Three rounds plus two 30s rests.
    expect(calculatePieceDuration(circuit)).toMatchObject({
      status: "calculated",
      seconds: 2070,
    })
  })

  it("uses explicit or estimated duration and otherwise stays incomplete", () => {
    expect(
      calculatePieceDuration({
        ...piece("explicit", 4),
        explicitDurationSeconds: 300,
      }),
    ).toMatchObject({ status: "calculated", seconds: 300 })
    expect(
      calculatePieceDuration({
        ...piece("estimated", 4),
        estimatedDurationSeconds: 330,
      }),
    ).toMatchObject({ status: "estimated", seconds: 330 })
    expect(calculatePieceDuration(piece("missing", 4))).toMatchObject({
      status: "incomplete",
      seconds: 0,
    })
  })

  it("totals workouts and evaluates target warnings", () => {
    const workout: Workout = {
      id: "w",
      title: "Target test",
      description: "",
      created: "2025-01-01",
      modified: "2025-01-01",
      targetDurationMinutes: 15,
      sections: [
        {
          id: "s",
          name: "Main",
          pieces: [piece("first", 8, "@ 1:30"), piece("second", 4, "@ 1:00")],
        },
      ],
    }
    const duration = calculateWorkoutDuration(workout)
    expect(duration.seconds).toBe(960)
    expect(
      evaluateTargetDuration(duration, workout.targetDurationMinutes),
    ).toEqual({
      status: "over",
      differenceSeconds: 60,
    })
    expect(evaluateTargetDuration(duration, 20)).toEqual({
      status: "within",
      differenceSeconds: 240,
    })
    expect(
      evaluateTargetDuration(calculatePieceDuration(piece("missing", 1)), 20),
    ).toEqual({ status: "incomplete", differenceSeconds: null })
  })

  it("parses clock and written transition durations", () => {
    expect(parseDurationSeconds("1:30")).toBe(90)
    expect(parseDurationSeconds(":40")).toBe(40)
    expect(parseDurationSeconds("1 min 15 seconds")).toBe(75)
    expect(parseDurationSeconds("bad value")).toBeNull()
  })
})
