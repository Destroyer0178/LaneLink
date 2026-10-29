import { requireSupabase } from "../lib/supabase"
import type { SetPiece, Workout } from "../workout/types"

type SetRow = {
  id: string
  owner_id: string
  name: string
  description: string
  structure: Record<string, unknown>
}

type PieceRow = {
  id: string
  owner_id: string
  name: string
  category: SetPiece["category"]
  structure: Record<string, unknown>
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function searchPattern(query: string) {
  return `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`
}

function workoutFromRow(row: SetRow): Workout {
  return {
    ...clone(row.structure) as unknown as Workout,
    id: row.id,
    title: row.name,
    description: row.description,
  }
}

function pieceFromRow(row: PieceRow): SetPiece {
  return {
    ...clone(row.structure) as unknown as SetPiece,
    id: row.id,
    name: row.name,
    category: row.category,
  }
}

const setColumns = "id, owner_id, name, description, structure"
const pieceColumns = "id, owner_id, name, category, structure"

export async function listOwnSets(ownerId: string, query = "") {
  let request = requireSupabase()
    .from("sets")
    .select(setColumns)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })

  if (query.trim()) request = request.ilike("name", searchPattern(query))
  const { data, error } = await request
  if (error) throw error
  return (data as SetRow[]).map(workoutFromRow)
}

export async function listOwnPieces(ownerId: string, query = "") {
  let request = requireSupabase()
    .from("set_pieces")
    .select(pieceColumns)
    .eq("owner_id", ownerId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })

  if (query.trim()) request = request.ilike("name", searchPattern(query))
  const { data, error } = await request
  if (error) throw error
  return (data as PieceRow[]).map(pieceFromRow)
}

export async function createSet(
  ownerId: string,
  workout: Workout,
  options: { legacyId?: string; sourceSetId?: string } = {},
) {
  const client = requireSupabase()
  const legacyId = options.legacyId ?? workout.id
  const { data, error } = await client
    .from("sets")
    .insert({
      owner_id: ownerId,
      legacy_id: legacyId,
      source_set_id: options.sourceSetId ?? null,
      name: workout.title.trim(),
      description: workout.description,
      structure: clone(workout),
      schema_version: 1,
      visibility: "private",
    })
    .select(setColumns)
    .single()
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await client
        .from("sets")
        .select(setColumns)
        .eq("owner_id", ownerId)
        .eq("legacy_id", legacyId)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existing) return workoutFromRow(existing as SetRow)
    }
    throw error
  }
  return workoutFromRow(data as SetRow)
}

export async function updateSet(ownerId: string, workout: Workout) {
  const { data, error } = await requireSupabase()
    .from("sets")
    .update({
      name: workout.title.trim(),
      description: workout.description,
      structure: clone(workout),
      schema_version: 1,
    })
    .eq("id", workout.id)
    .eq("owner_id", ownerId)
    .select(setColumns)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("This set was not found or you cannot edit it.")
  return workoutFromRow(data as SetRow)
}

export async function duplicateSet(
  ownerId: string,
  workout: Workout,
  copyId = `copy-${Date.now()}`,
) {
  const copy: Workout = {
    ...clone(workout),
    id: copyId,
    title: `${workout.title} Copy`,
    created: new Date().toISOString().slice(0, 10),
    modified: new Date().toISOString().slice(0, 10),
  }
  return createSet(ownerId, copy, { sourceSetId: workout.id })
}

export async function deleteSet(ownerId: string, setId: string) {
  const { data, error } = await requireSupabase()
    .from("sets")
    .delete()
    .eq("id", setId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("This set was not found or you cannot delete it.")
}

export async function createPiece(
  ownerId: string,
  piece: SetPiece,
  options: { legacyId?: string; sourcePieceId?: string } = {},
) {
  const client = requireSupabase()
  const legacyId = options.legacyId ?? piece.id
  const { data, error } = await client
    .from("set_pieces")
    .insert({
      owner_id: ownerId,
      legacy_id: legacyId,
      source_piece_id: options.sourcePieceId ?? null,
      name: piece.name.trim(),
      description: piece.instructions,
      category: piece.category,
      structure: clone(piece),
      schema_version: 1,
      visibility: "private",
    })
    .select(pieceColumns)
    .single()
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await client
        .from("set_pieces")
        .select(pieceColumns)
        .eq("owner_id", ownerId)
        .eq("legacy_id", legacyId)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existing) return pieceFromRow(existing as PieceRow)
    }
    throw error
  }
  return pieceFromRow(data as PieceRow)
}

export async function updatePiece(ownerId: string, piece: SetPiece) {
  const { data, error } = await requireSupabase()
    .from("set_pieces")
    .update({
      name: piece.name.trim(),
      description: piece.instructions,
      category: piece.category,
      structure: clone(piece),
      schema_version: 1,
    })
    .eq("id", piece.id)
    .eq("owner_id", ownerId)
    .select(pieceColumns)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error("This set piece was not found or you cannot edit it.")
  }
  return pieceFromRow(data as PieceRow)
}

export async function duplicatePiece(
  ownerId: string,
  piece: SetPiece,
  copyId = `copy-${Date.now()}`,
) {
  const copy = {
    ...clone(piece),
    id: copyId,
    name: `${piece.name} Copy`,
  }
  return createPiece(ownerId, copy, { sourcePieceId: piece.id })
}

export async function deletePiece(ownerId: string, pieceId: string) {
  const { data, error } = await requireSupabase()
    .from("set_pieces")
    .delete()
    .eq("id", pieceId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error("This set piece was not found or you cannot delete it.")
  }
}

async function existingLegacyIds(
  table: "sets" | "set_pieces",
  ownerId: string,
  legacyIds: string[],
) {
  if (!legacyIds.length) return new Set<string>()
  const found = new Set<string>()
  for (let index = 0; index < legacyIds.length; index += 100) {
    const { data, error } = await requireSupabase()
      .from(table)
      .select("legacy_id")
      .eq("owner_id", ownerId)
      .in("legacy_id", legacyIds.slice(index, index + 100))
    if (error) throw error
    for (const row of data as { legacy_id: string | null }[]) {
      if (row.legacy_id) found.add(row.legacy_id)
    }
  }
  return found
}

export async function migrateLegacyContent(
  ownerId: string,
  workouts: Workout[],
  pieces: SetPiece[],
) {
  const existingSets = await existingLegacyIds(
    "sets",
    ownerId,
    workouts.map((workout) => workout.id),
  )
  const existingPieces = await existingLegacyIds(
    "set_pieces",
    ownerId,
    pieces.map((piece) => piece.id),
  )

  for (const workout of workouts) {
    if (!existingSets.has(workout.id)) {
      try {
        await createSet(ownerId, workout, { legacyId: workout.id })
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error
      }
    }
  }
  for (const piece of pieces) {
    if (!existingPieces.has(piece.id)) {
      try {
        await createPiece(ownerId, piece, { legacyId: piece.id })
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error
      }
    }
  }

  const [savedSets, savedPieces] = await Promise.all([
    listOwnSets(ownerId),
    listOwnPieces(ownerId),
  ])
  return { workouts: savedSets, pieces: savedPieces }
}
