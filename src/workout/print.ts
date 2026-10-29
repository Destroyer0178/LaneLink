import type { IntervalGroup, SetPiece } from "./types"
import { calculatePieceYardage } from "./yardage"

export type IntervalPrintMode = "all" | "selected" | "compact" | "none"

export function circuitPrintLines(
  piece: SetPiece,
  intervalMode: IntervalPrintMode = "all",
  selectedGroupIndex = 0,
): string[] {
  if (piece.kind !== "circuit") return []
  return (piece.children ?? []).map((child, index) => {
    const result = calculatePieceYardage(child)
    const yards =
      result.status === "resolved" ? `${result.yards} yd` : "Unresolved"
    const intervals =
      intervalMode !== "none"
        ? intervalGroupsForPrint(child, intervalMode, selectedGroupIndex)
            .map(
              (group) =>
                `${group.name} ${Math.floor(group.sendOffSeconds / 60)}:${String(
                  Math.round(group.sendOffSeconds % 60),
                ).padStart(2, "0")}`,
            )
            .join(", ")
        : ""
    return `${index + 1}. ${child.name} — ${child.instructions} · ${yards}${
      intervals ? ` · ${intervals}` : ""
    }`
  })
}

export function intervalGroupsForPrint(
  piece: SetPiece,
  mode: IntervalPrintMode,
  selectedGroupIndex = 0,
): IntervalGroup[] {
  if (mode === "none") return []
  const groups =
    piece.adaptiveInterval?.recommendation?.accepted === true
      ? piece.adaptiveInterval.recommendation.groups
      : []
  return mode === "selected"
    ? groups.filter((_, index) => index === selectedGroupIndex)
    : groups
}
