import { describe, expect, it } from "vitest"
import { parseWorkoutText } from "./parser"
import {
  calculatePieceYardage,
  calculateWorkoutYardage,
} from "../workout/yardage"

describe("parseWorkoutText", () => {
  it("parses simple sets with explicit yard units", () => {
    const result = parseWorkoutText(
      "Tuesday Practice\nWarmup:\n4 x 100 yd free @ 1:30\nCooldown:\n200 yards easy",
    )
    const warmup = result.workout.sections[0].pieces[0]
    expect(warmup.repeats).toBe(4)
    expect(warmup.distance).toBe(100)
    expect(warmup.unit).toBe("yards")
    expect(warmup.rest).toBe("@ 1:30")
    expect(calculatePieceYardage(warmup)).toEqual({
      status: "resolved",
      yards: 400,
    })
    expect(calculateWorkoutYardage(result.workout)).toEqual({
      status: "resolved",
      yards: 600,
    })
  })

  it("normalizes compact and multiplication-sign notation", () => {
    const result = parseWorkoutText(
      "SCY\nKick:\n8x50 kick\nDrill:\n4 × 25 drill",
    )
    expect(result.workout.sections[0].pieces[0].repeats).toBe(8)
    expect(result.workout.sections[0].pieces[0].distance).toBe(50)
    expect(result.workout.sections[1].pieces[0].repeats).toBe(4)
  })

  it("represents repeated rounds and between-round recovery explicitly", () => {
    const result = parseWorkoutText(
      "SCY\nMain Set:\n3 rounds of 4 x 100 free, with 200 easy between rounds",
    )
    const group = result.workout.sections[0].pieces[0]
    expect(group.kind).toBe("rounds")
    expect(group.rounds).toBe(3)
    expect(group.children).toHaveLength(1)
    expect(group.betweenRounds).toHaveLength(1)
    expect(calculatePieceYardage(group)).toEqual({
      status: "resolved",
      yards: 1600,
    })
  })

  it("leaves omitted units unresolved", () => {
    const result = parseWorkoutText("Main Set:\n4 x 100 free @ 1:30")
    const piece = result.workout.sections[0].pieces[0]
    expect(piece.unit).toBe("unknown")
    expect(piece.confidence).toBe("review")
    expect(calculatePieceYardage(piece).status).toBe("unresolved")
  })

  it("marks unrecognized lines for manual review", () => {
    const result = parseWorkoutText(
      "Main Set:\nSwim strong and keep everyone together",
    )
    const piece = result.workout.sections[0].pieces[0]
    expect(piece.kind).toBe("unrecognized")
    expect(piece.confidence).toBe("missing")
    expect(piece.sourceText).toBe("Swim strong and keep everyone together")
  })

  it("does not convert meter sets into yardage", () => {
    const result = parseWorkoutText("Main Set:\n10 x 100 m freestyle")
    const calculation = calculateWorkoutYardage(result.workout)
    expect(result.workout.sections[0].pieces[0].unit).toBe("meters")
    expect(calculation.status).toBe("unresolved")
  })
})
