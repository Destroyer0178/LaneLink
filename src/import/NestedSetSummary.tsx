import type { SetPiece } from "../workout/types"
import { calculatePieceYardage } from "../workout/yardage"

function yardageLabel(piece: SetPiece): string {
  const result = calculatePieceYardage(piece)
  return result.status === "resolved"
    ? `${result.yards.toLocaleString()} yd`
    : "Unresolved"
}

export function NestedSetSummary({ piece }: { piece: SetPiece }) {
  if (piece.kind !== "rounds") return null

  return (
    <div className="nested-set-summary">
      {piece.children?.map((child) => (
        <span key={child.id}>
          Each round: {child.instructions} · {yardageLabel(child)}
        </span>
      ))}
      {piece.betweenRounds?.map((child) => (
        <span key={child.id}>
          Between rounds: {child.instructions} · {yardageLabel(child)}
        </span>
      ))}
    </div>
  )
}
