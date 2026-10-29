import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { supabase } from "../lib/supabase"
import type { SetPiece, Workout } from "../workout/types"
import {
  createPiece,
  createSet,
  deletePiece,
  deleteSet,
  duplicatePiece,
  duplicateSet,
  listOwnPieces,
  listOwnSets,
  updatePiece,
  updateSet,
} from "./contentRepository"

const testEmail = process.env.SUPABASE_TEST_EMAIL
const testPassword = process.env.SUPABASE_TEST_PASSWORD
const canRunLive = Boolean(supabase && testEmail && testPassword)

describe.skipIf(!canRunLive)("Supabase content repository (live)", () => {
  let ownerId = ""
  const setIds: string[] = []
  const pieceIds: string[] = []
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`

  beforeAll(async () => {
    const { data, error } = await supabase!.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error) throw error
    ownerId = data.user.id
  })

  afterAll(async () => {
    await Promise.allSettled([
      ...setIds.map((id) => deleteSet(ownerId, id)),
      ...pieceIds.map((id) => deletePiece(ownerId, id)),
    ])
    await supabase!.auth.signOut()
  })

  it("creates, edits, reloads, duplicates, and deletes nested content", async () => {
    const child: SetPiece = {
      id: `child-${suffix}`,
      name: `Live child ${suffix}`,
      category: "Kick",
      instructions: "4 × 50 kick",
      repeats: 4,
      distance: 50,
      rest: "@ 1:00",
      adaptiveInterval: {
        enabled: true,
        goal: "aerobic",
        desiredRestSeconds: 15,
        groupCount: 2,
      },
    }
    const circuit: SetPiece = {
      id: `piece-${suffix}`,
      name: `Live circuit ${suffix}`,
      category: "Main Set",
      instructions: "2 rounds",
      repeats: 1,
      distance: 0,
      kind: "circuit",
      rounds: 2,
      children: [child],
      restBetweenPieces: "10 seconds",
      restBetweenRounds: "30 seconds",
    }

    const createdPiece = await createPiece(ownerId, circuit)
    pieceIds.push(createdPiece.id)
    expect(createdPiece.children?.[0].adaptiveInterval?.goal).toBe("aerobic")

    const editedPiece = await updatePiece(ownerId, {
      ...createdPiece,
      name: `${createdPiece.name} edited`,
      rounds: 3,
    })
    expect(editedPiece.rounds).toBe(3)

    const workout: Workout = {
      id: `set-${suffix}`,
      title: `Live set ${suffix}`,
      description: "Live repository verification",
      created: "2025-05-21",
      modified: "2025-05-21",
      adaptiveIntervalsEnabled: true,
      sections: [
        {
          id: `section-${suffix}`,
          name: "Main Set",
          pieces: [editedPiece],
        },
      ],
    }
    const createdSet = await createSet(ownerId, workout)
    setIds.push(createdSet.id)

    const editedSet = await updateSet(ownerId, {
      ...createdSet,
      description: "Edited and persisted",
    })
    expect(editedSet.description).toBe("Edited and persisted")

    const [reloadedSets, reloadedPieces] = await Promise.all([
      listOwnSets(ownerId, suffix),
      listOwnPieces(ownerId, suffix),
    ])
    expect(
      reloadedSets.find((item) => item.id === createdSet.id)?.sections[0],
    ).toEqual(editedSet.sections[0])
    expect(
      reloadedPieces.find((item) => item.id === createdPiece.id)?.rounds,
    ).toBe(3)

    const copiedSet = await duplicateSet(ownerId, editedSet)
    const copiedPiece = await duplicatePiece(ownerId, editedPiece)
    setIds.push(copiedSet.id)
    pieceIds.push(copiedPiece.id)
    expect(copiedSet.title).toContain("Copy")
    expect(copiedPiece.name).toContain("Copy")

    await deleteSet(ownerId, createdSet.id)
    await deletePiece(ownerId, createdPiece.id)
    setIds.splice(setIds.indexOf(createdSet.id), 1)
    pieceIds.splice(pieceIds.indexOf(createdPiece.id), 1)

    const [setsAfterDelete, piecesAfterDelete] = await Promise.all([
      listOwnSets(ownerId, suffix),
      listOwnPieces(ownerId, suffix),
    ])
    expect(setsAfterDelete.some((item) => item.id === createdSet.id)).toBe(
      false,
    )
    expect(piecesAfterDelete.some((item) => item.id === createdPiece.id)).toBe(
      false,
    )
  })
})
