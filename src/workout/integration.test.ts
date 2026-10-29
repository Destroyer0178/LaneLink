import { describe, expect, it } from "vitest"
import type { SetPiece, Workout } from "./types"
import { circuitPrintLines, intervalGroupsForPrint } from "./print"
import { calculateWorkoutYardage } from "./yardage"

describe("circuit and interval integration", () => {
  it("keeps circuit structure and accepted groups available for PDF output", () => {
    const child: SetPiece = {
      id: "child",
      name: "Freestyle",
      category: "Main Set",
      instructions: "4 x 50 freestyle",
      repeats: 4,
      distance: 50,
      unit: "yards",
      adaptiveInterval: {
        enabled: true,
        goal: "aerobic",
        groupCount: 1,
        recommendation: {
          generatedAt: "2025-01-01",
          dataFingerprint: "test",
          goal: "aerobic",
          assumptions: [],
          estimates: [],
          groups: [
            {
              id: "g1",
              name: "Training group",
              sendOffSeconds: 60,
              swimmerIds: ["s1"],
              workingTimeRange: [45, 45],
              restRange: [15, 15],
              insufficientRestSwimmerIds: [],
              warnings: [],
            },
          ],
          status: "calculated",
          warnings: [],
          accepted: true,
        },
      },
    }
    const circuit: SetPiece = {
      id: "circuit",
      name: "Circuit",
      category: "Main Set",
      instructions: "3 rounds",
      repeats: 1,
      distance: 0,
      kind: "circuit",
      rounds: 3,
      children: [child],
    }
    const workout: Workout = {
      id: "w",
      title: "Workout",
      description: "",
      created: "2025-01-01",
      modified: "2025-01-01",
      sections: [{ id: "s", name: "Main Set", pieces: [circuit] }],
    }
    expect(calculateWorkoutYardage(workout)).toEqual({
      status: "resolved",
      yards: 600,
    })
    expect(circuitPrintLines(circuit)[0]).toContain("4 x 50 freestyle")
    expect(circuitPrintLines(circuit)[0]).toContain("Training group 1:00")
    expect(circuitPrintLines(circuit, "none")[0]).not.toContain(
      "Training group",
    )
    expect(intervalGroupsForPrint(child, "all")).toHaveLength(1)
    expect(intervalGroupsForPrint(child, "none")).toHaveLength(0)
  })

  it("preserves warnings for missing or invalid data", () => {
    const unresolved: SetPiece = {
      id: "missing",
      name: "Unknown set",
      category: "Main Set",
      instructions: "Swim strong",
      repeats: 1,
      distance: 0,
      unit: "unknown",
      confidence: "missing",
      confidenceNote: "Distance is required.",
    }
    expect(unresolved.confidenceNote).toBe("Distance is required.")
  })
})
