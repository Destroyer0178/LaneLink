import { describe, expect, it } from "vitest"
import type { SetPiece } from "./types"
import { calculateCircuitYardage, calculatePieceYardage } from "./yardage"

const piece = (id: string, repeats: number, distance: number): SetPiece => ({
  id,
  name: id,
  category: "Main Set",
  instructions: `${repeats} x ${distance}`,
  repeats,
  distance,
  unit: "yards",
})

describe("circuit yardage", () => {
  it("preserves child order and calculates per-round and total yardage", () => {
    const circuit: SetPiece = {
      id: "c1",
      name: "Skills Circuit",
      category: "Main Set",
      instructions: "Three-part skills circuit",
      repeats: 1,
      distance: 0,
      kind: "circuit",
      rounds: 4,
      children: [
        piece("free", 4, 50),
        piece("kick", 4, 25),
        piece("pull", 1, 100),
      ],
      restBetweenPieces: "10 seconds",
      restBetweenRounds: "30 seconds",
      restAfterFinalRound: false,
    }
    expect(circuit.children?.map((child) => child.id)).toEqual([
      "free",
      "kick",
      "pull",
    ])
    expect(calculateCircuitYardage(circuit)).toEqual({
      perRound: { status: "resolved", yards: 400 },
      total: { status: "resolved", yards: 1600 },
    })
    expect(calculatePieceYardage(circuit)).toEqual({
      status: "resolved",
      yards: 1600,
    })
  })

  it("supports nested repetitions without double counting", () => {
    const nested: SetPiece = {
      id: "nested",
      name: "Nested rounds",
      category: "Main Set",
      instructions: "2 rounds",
      repeats: 1,
      distance: 0,
      kind: "rounds",
      rounds: 2,
      children: [piece("100s", 3, 100)],
    }
    const circuit: SetPiece = {
      id: "c2",
      name: "Nested circuit",
      category: "Main Set",
      instructions: "2 rounds",
      repeats: 1,
      distance: 0,
      kind: "circuit",
      rounds: 2,
      children: [nested, piece("easy", 1, 100)],
    }
    expect(calculatePieceYardage(circuit)).toEqual({
      status: "resolved",
      yards: 1400,
    })
  })

  it("keeps copied templates isolated when edited", () => {
    const template = piece("template", 4, 50)
    const copied: SetPiece = JSON.parse(JSON.stringify(template))
    copied.distance = 75
    expect(template.distance).toBe(50)
    expect(copied.distance).toBe(75)
  })

  it("does not let adaptive interval data change yardage", () => {
    const adaptive = {
      ...piece("adaptive", 8, 100),
      adaptiveInterval: {
        enabled: true,
        goal: "threshold" as const,
        groupCount: 3,
        manualIntervalSeconds: 90,
      },
    }
    expect(calculatePieceYardage(adaptive)).toEqual({
      status: "resolved",
      yards: 800,
    })
  })
})
