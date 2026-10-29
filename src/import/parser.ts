import type {
  Category,
  DistanceUnit,
  SetPiece,
  Workout,
  WorkoutSection,
} from "../workout/types"
import { calculatePieceYardage } from "../workout/yardage"

export type ParsedWorkout = {
  workout: Workout
  originalText: string
  normalizedText: string
  reviewCount: number
}

const SECTION_ALIASES: Array<{
  pattern: RegExp
  name: string
  category: Category
}> = [
  { pattern: /^(warm[\s-]?up|warmup)$/i, name: "Warmup", category: "Warmup" },
  { pattern: /^(pre[\s-]?set|preset)$/i, name: "Pre-Set", category: "Drill" },
  { pattern: /^(main(\s+set)?)$/i, name: "Main Set", category: "Main Set" },
  { pattern: /^(kick(\s+set)?)$/i, name: "Kick", category: "Kick" },
  { pattern: /^(pull(\s+set)?)$/i, name: "Pull", category: "Pull" },
  { pattern: /^(drill(\s+set)?)$/i, name: "Drill", category: "Drill" },
  { pattern: /^(sprint(\s+set)?)$/i, name: "Sprint", category: "Sprint" },
  {
    pattern: /^(cool[\s-]?down|cooldown|easy down)$/i,
    name: "Cooldown",
    category: "Cooldown",
  },
]

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`

export function normalizeWorkoutText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .split("\n")
    .map((line) =>
      line
        .replace(/\t/g, " ")
        .replace(/[ ]{2,}/g, " ")
        .trim(),
    )
    .join("\n")
}

function unitFromToken(token?: string): DistanceUnit {
  if (!token) return "unknown"
  return /^m/i.test(token) ? "meters" : "yards"
}

function documentUnit(text: string): DistanceUnit | undefined {
  if (/\b(SCY|yards?|yard pool)\b/i.test(text)) return "yards"
  if (/\b(LCM|SCM|meters?|metres?|meter pool)\b/i.test(text)) return "meters"
  return undefined
}

function stripListPrefix(line: string): string {
  return line
    .replace(/^[•●▪◦*-]\s*/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim()
}

function parseSectionHeading(
  line: string,
): { name: string; category: Category; remainder: string } | null {
  const match = line.match(/^([^:]+):\s*(.*)$/)
  const candidate = (match?.[1] ?? line).trim()
  const alias = SECTION_ALIASES.find(({ pattern }) => pattern.test(candidate))
  if (!alias) return null
  return {
    name: alias.name,
    category: alias.category,
    remainder: match?.[2]?.trim() ?? "",
  }
}

function equipmentFromText(text: string): string[] {
  const equipment = ["paddles", "fins", "board", "snorkel", "pull buoy"]
  return equipment.filter((item) => new RegExp(`\\b${item}\\b`, "i").test(text))
}

function intervalFromText(text: string): string | undefined {
  const sendoff = text.match(/@\s*(\d+:\d{2}|:\d{2}|\d+\s*(?:sec|seconds?))/i)
  if (sendoff) return `@ ${sendoff[1]}`
  const rest = text.match(
    /\b(\d+\s*(?:sec|seconds?|min|minutes?)\s*(?:rest|recovery))\b/i,
  )
  return rest?.[1]
}

function pieceName(
  repeats: number,
  distance: number,
  description: string,
): string {
  const cleaned = description
    .replace(/@\s*(\d+:\d{2}|:\d{2})/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const label = cleaned || "Swim"
  return repeats > 1
    ? `${repeats} x ${distance} ${label}`.trim()
    : `${distance} ${label}`.trim()
}

function unresolvedPiece(
  sourceText: string,
  normalizedText: string,
  category: Category,
  reason = "Line was not recognized as a complete swim set.",
): SetPiece {
  return {
    id: nextId("import-piece"),
    name: "Unrecognized instruction",
    category,
    instructions: sourceText,
    repeats: 1,
    distance: 0,
    unit: "unknown",
    kind: "unrecognized",
    confidence: "missing",
    confidenceNote: reason,
    sourceText,
    normalizedText,
  }
}

function parseAtomicSet(
  sourceText: string,
  normalizedText: string,
  category: Category,
  defaultUnit?: DistanceUnit,
): SetPiece {
  const line = stripListPrefix(normalizedText)
  const repeated = line.match(
    /^(\d+)\s*x\s*(\d+)\s*(yds?|yards?|m|meters?|metres?)?\b\s*(.*)$/i,
  )
  const single = line.match(
    /^(\d+)\s*(yds?|yards?|m|meters?|metres?)?\b\s+(.+)$/i,
  )

  let repeats: number
  let distance: number
  let unitToken: string | undefined
  let description: string

  if (repeated) {
    repeats = Number(repeated[1])
    distance = Number(repeated[2])
    unitToken = repeated[3]
    description = repeated[4].trim()
  } else if (single) {
    repeats = 1
    distance = Number(single[1])
    unitToken = single[2]
    description = single[3].trim()
  } else {
    return unresolvedPiece(sourceText, normalizedText, category)
  }

  const unit = unitToken ? unitFromToken(unitToken) : (defaultUnit ?? "unknown")
  const interval = intervalFromText(description)
  const equipment = equipmentFromText(description)
  const piece: SetPiece = {
    id: nextId("import-piece"),
    name: pieceName(repeats, distance, description),
    category,
    instructions: sourceText,
    repeats,
    distance,
    unit,
    stroke: description || undefined,
    equipment: equipment.length ? equipment : undefined,
    rest: interval,
    kind: "set",
    confidence: unit === "yards" ? "verified" : "review",
    confidenceNote:
      unit === "meters"
        ? "Meter distance requires confirmation or a manual yardage override."
        : unit === "unknown"
          ? "Confirm whether this distance is in yards or meters."
          : undefined,
    sourceText,
    normalizedText,
  }
  const result = calculatePieceYardage(piece)
  if (result.status === "unresolved" && piece.confidence === "verified") {
    piece.confidence = "review"
    piece.confidenceNote = result.reason
  }
  return piece
}

function parseRepeatedGroup(
  sourceText: string,
  normalizedText: string,
  category: Category,
  defaultUnit?: DistanceUnit,
): SetPiece | null {
  const match = stripListPrefix(normalizedText).match(
    /^(\d+)\s+rounds?(?:\s+of)?\s+(.+)$/i,
  )
  if (!match) return null

  const rounds = Number(match[1])
  let body = match[2].replace(/\.$/, "").trim()
  let recoveryText: string | undefined
  const recoveryMatch =
    body.match(/^(.+?),\s*(?:with\s+)?(.+?)\s+between\s+rounds?$/i) ??
    body.match(/^(.+?)\s+with\s+(.+?)\s+between\s+rounds?$/i)
  if (recoveryMatch) {
    body = recoveryMatch[1].trim()
    recoveryText = recoveryMatch[2].trim()
  }

  const child = parseAtomicSet(body, body, category, defaultUnit)
  const betweenRounds = recoveryText
    ? [parseAtomicSet(recoveryText, recoveryText, category, defaultUnit)]
    : []
  const nestedPieces = [child, ...betweenRounds]
  const hasUnresolved = nestedPieces.some(
    (piece) => calculatePieceYardage(piece).status === "unresolved",
  )

  return {
    id: nextId("import-rounds"),
    name: `${rounds} rounds of ${child.name}`,
    category,
    instructions: sourceText,
    repeats: 1,
    distance: 0,
    unit: defaultUnit ?? "unknown",
    kind: "rounds",
    rounds,
    children: [child],
    betweenRounds,
    confidence: hasUnresolved ? "review" : "verified",
    confidenceNote: hasUnresolved
      ? "Confirm units or incomplete sets inside this repeated group."
      : undefined,
    sourceText,
    normalizedText,
  }
}

function parseSetLine(
  sourceText: string,
  normalizedText: string,
  category: Category,
  defaultUnit?: DistanceUnit,
): SetPiece {
  return (
    parseRepeatedGroup(sourceText, normalizedText, category, defaultUnit) ??
    parseAtomicSet(sourceText, normalizedText, category, defaultUnit)
  )
}

export function parseWorkoutText(
  originalText: string,
  options: { filename?: string; date?: string } = {},
): ParsedWorkout {
  idCounter = 0
  const normalizedText = normalizeWorkoutText(originalText)
  const originalLines = originalText.replace(/\r\n?/g, "\n").split("\n")
  const normalizedLines = normalizedText.split("\n")
  const defaultUnit = documentUnit(normalizedText)
  const sections: WorkoutSection[] = []
  let currentSection: WorkoutSection | null = null
  let currentCategory: Category = "Main Set"
  const fallbackTitle = options.filename
    ?.replace(/\.docx$/i, "")
    .replace(/[_-]+/g, " ")
  let title: string | undefined

  const ensureSection = () => {
    if (!currentSection) {
      currentSection = {
        id: nextId("import-section"),
        name: "Uncategorized",
        pieces: [],
      }
      sections.push(currentSection)
    }
    return currentSection
  }

  normalizedLines.forEach((normalizedLine, index) => {
    if (!normalizedLine) return
    if (/^(SCY|SCM|LCM|yards?|meters?|metres?)$/i.test(normalizedLine)) return
    const sourceLine = originalLines[index]?.trim() || normalizedLine
    const heading = parseSectionHeading(normalizedLine)
    if (heading) {
      currentCategory = heading.category
      currentSection = {
        id: nextId("import-section"),
        name: heading.name,
        pieces: [],
      }
      sections.push(currentSection)
      if (heading.remainder) {
        currentSection.pieces.push(
          parseSetLine(
            sourceLine.slice(sourceLine.indexOf(":") + 1).trim(),
            heading.remainder,
            currentCategory,
            defaultUnit,
          ),
        )
      }
      return
    }

    const isLikelyTitle =
      !title &&
      sections.length === 0 &&
      !/^(?:[•●▪◦*-]\s*)?(?:\d+\s+rounds?\b|\d+\s*x\s*\d+|\d+\s+(?:(?:yds?|yards?|m|meters?|metres?)\s+)?\D)/i.test(
        normalizedLine,
      )
    if (isLikelyTitle) {
      title = sourceLine
      return
    }

    ensureSection().pieces.push(
      parseSetLine(sourceLine, normalizedLine, currentCategory, defaultUnit),
    )
  })

  if (!sections.length) {
    sections.push({
      id: nextId("import-section"),
      name: "Uncategorized",
      pieces: [
        unresolvedPiece(
          originalText,
          normalizedText,
          "Main Set",
          "No recognizable workout sections or sets were found.",
        ),
      ],
    })
  }

  const date = options.date ?? new Date().toISOString().slice(0, 10)
  const workout: Workout = {
    id: nextId("import-workout"),
    title: title || fallbackTitle || "Imported Workout",
    description: options.filename ? `Imported from ${options.filename}` : "",
    created: date,
    modified: date,
    sections,
  }
  const reviewCount = sections
    .flatMap((section) => section.pieces)
    .filter((piece) => piece.confidence !== "verified").length

  return { workout, originalText, normalizedText, reviewCount }
}
