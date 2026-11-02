import { requireSupabase } from "../lib/supabase"
import type { SetPiece, Workout } from "../workout/types"

type SetRow = {
  id: string
  owner_id: string
  name: string
  description: string
  structure: Record<string, unknown>
  visibility: "private" | "public"
  source_creator_display_name: string | null
  source_creator_organization: string | null
}

type PieceRow = {
  id: string
  owner_id: string
  name: string
  category: SetPiece["category"]
  structure: Record<string, unknown>
  visibility: "private" | "public"
  source_creator_display_name: string | null
  source_creator_organization: string | null
}

export type PublicLibraryItem = {
  id: string
  type: "set" | "piece"
  name: string
  description: string
  category: SetPiece["category"] | null
  creatorDisplayName: string
  creatorOrganization: string
  createdAt: string
  updatedAt: string
  inCollection: boolean
  isOwn: boolean
  content: Workout | SetPiece
}

export type PublicLibraryFilters = {
  type: "set" | "piece"
  query?: string
  stroke?: string
  distance?: number
  goal?: string
  equipment?: string
  sort?: "newest" | "alphabetical"
  page?: number
  pageSize?: number
}

type PublicLibraryRow = {
  id: string
  item_type: "set" | "piece"
  name: string
  description: string
  category: SetPiece["category"] | null
  structure: Record<string, unknown>
  creator_display_name: string
  creator_organization: string
  created_at: string
  updated_at: string
  in_collection: boolean
  is_own: boolean
  total_count: number
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
    visibility: row.visibility,
    sourceCreatorDisplayName: row.source_creator_display_name ?? undefined,
    sourceCreatorOrganization: row.source_creator_organization ?? undefined,
  }
}

function pieceFromRow(row: PieceRow): SetPiece {
  return {
    ...clone(row.structure) as unknown as SetPiece,
    id: row.id,
    name: row.name,
    category: row.category,
    visibility: row.visibility,
    sourceCreatorDisplayName: row.source_creator_display_name ?? undefined,
    sourceCreatorOrganization: row.source_creator_organization ?? undefined,
  }
}

const setColumns =
  "id, owner_id, name, description, structure, visibility, source_creator_display_name, source_creator_organization"
const pieceColumns =
  "id, owner_id, name, category, structure, visibility, source_creator_display_name, source_creator_organization"

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

export async function listPublicLibrary(filters: PublicLibraryFilters) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 50)
  const page = Math.max(filters.page ?? 1, 1)
  const { data, error } = await requireSupabase().rpc("search_public_library", {
    p_item_type: filters.type,
    p_query: filters.query?.trim() ?? "",
    p_stroke: filters.stroke ?? "",
    p_distance: filters.distance ?? null,
    p_goal: filters.goal ?? "",
    p_equipment: filters.equipment ?? "",
    p_sort: filters.sort ?? "newest",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })
  if (error) throw error
  const rows = (data ?? []) as PublicLibraryRow[]
  return {
    items: rows.map(
      (row): PublicLibraryItem => ({
        id: row.id,
        type: row.item_type,
        name: row.name,
        description: row.description,
        category: row.category,
        creatorDisplayName: row.creator_display_name || "LaneLink Coach",
        creatorOrganization: row.creator_organization || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        inCollection: row.in_collection,
        isOwn: row.is_own,
        content:
          row.item_type === "set"
            ? workoutFromRow({
                id: row.id,
                owner_id: "",
                name: row.name,
                description: row.description,
                structure: row.structure,
                visibility: "public",
                source_creator_display_name: null,
                source_creator_organization: null,
              })
            : pieceFromRow({
                id: row.id,
                owner_id: "",
                name: row.name,
                category: row.category!,
                structure: row.structure,
                visibility: "public",
                source_creator_display_name: null,
                source_creator_organization: null,
              }),
      }),
    ),
    total: Number(rows[0]?.total_count ?? 0),
  }
}

export async function savePublicLibraryItem(
  coachId: string,
  type: "set" | "piece",
  itemId: string,
) {
  const table = type === "set" ? "saved_sets" : "saved_pieces"
  const itemColumn = type === "set" ? "set_id" : "piece_id"
  const { error } = await requireSupabase()
    .from(table)
    .insert({ coach_id: coachId, [itemColumn]: itemId })
  if (error?.code === "23505") return "already-saved" as const
  if (error) throw error
  return "saved" as const
}

export async function setContentVisibility(
  ownerId: string,
  type: "set" | "piece",
  itemId: string,
  visibility: "private" | "public",
) {
  const table = type === "set" ? "sets" : "set_pieces"
  const { data, error } = await requireSupabase()
    .from(table)
    .update({ visibility })
    .eq("id", itemId)
    .eq("owner_id", ownerId)
    .select("id, visibility")
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error("This item was not found or you cannot change it.")
  }
  return data.visibility as "private" | "public"
}

type DuplicatedPublicRow = {
  id: string
  item_type: "set" | "piece"
  name: string
  description: string
  category: SetPiece["category"] | null
  structure: Record<string, unknown>
  visibility: "private"
  source_creator_display_name: string
  source_creator_organization: string
}

export async function duplicatePublicLibraryItem(
  type: "set" | "piece",
  itemId: string,
) {
  const { data, error } = await requireSupabase().rpc(
    "duplicate_public_library_item",
    {
      p_item_type: type,
      p_item_id: itemId,
    },
  )
  if (error) throw error
  const row = data as DuplicatedPublicRow
  if (row.item_type === "set") {
    return {
      type: "set" as const,
      item: workoutFromRow({
        id: row.id,
        owner_id: "",
        name: row.name,
        description: row.description,
        structure: row.structure,
        visibility: row.visibility,
        source_creator_display_name: row.source_creator_display_name,
        source_creator_organization: row.source_creator_organization,
      }),
    }
  }
  return {
    type: "piece" as const,
    item: pieceFromRow({
      id: row.id,
      owner_id: "",
      name: row.name,
      category: row.category!,
      structure: row.structure,
      visibility: row.visibility,
      source_creator_display_name: row.source_creator_display_name,
      source_creator_organization: row.source_creator_organization,
    }),
  }
}

export async function removePublicLibraryItem(
  coachId: string,
  type: "set" | "piece",
  itemId: string,
) {
  const table = type === "set" ? "saved_sets" : "saved_pieces"
  const itemColumn = type === "set" ? "set_id" : "piece_id"
  const { error } = await requireSupabase()
    .from(table)
    .delete()
    .eq("coach_id", coachId)
    .eq(itemColumn, itemId)
  if (error) throw error
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
