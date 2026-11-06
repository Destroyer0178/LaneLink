import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { supabase } from "../lib/supabase"
import type { SetPiece, Workout } from "../workout/types"
import {
  createPiece,
  createSet,
  deletePiece,
  deleteSet,
  duplicatePiece,
  duplicatePublicLibraryItem,
  duplicateSet,
  listPublicLibrary,
  listOwnPieces,
  listOwnSets,
  removePublicLibraryItem,
  savePublicLibraryItem,
  setContentVisibility,
  updatePiece,
  updateSet,
} from "./contentRepository"

const testEmail = process.env.SUPABASE_TEST_EMAIL
const testPassword = process.env.SUPABASE_TEST_PASSWORD
const canRunLive = Boolean(supabase && testEmail && testPassword)
const secondTestEmail = process.env.SUPABASE_SECOND_TEST_EMAIL
const secondTestPassword = process.env.SUPABASE_SECOND_TEST_PASSWORD
const canRunTwoCoachLive = Boolean(
  canRunLive && secondTestEmail && secondTestPassword,
)

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

describe.skipIf(!canRunTwoCoachLive)(
  "Supabase public sharing (two-coach live)",
  () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    let firstCoachId = ""
    let secondCoachId = ""
    let sourceSetId = ""
    let sourcePieceId = ""
    let copiedSetId = ""
    let copiedPieceId = ""

    const signIn = async (email: string, password: string) => {
      const { data, error } = await supabase!.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      const restored = await supabase!.auth.getSession()
      if (restored.error) throw restored.error
      expect(restored.data.session?.user.id).toBe(data.user.id)
      return data.user.id
    }

    afterAll(async () => {
      try {
        if (secondCoachId) {
          await signIn(secondTestEmail!, secondTestPassword!)
          await Promise.allSettled([
            copiedSetId ? deleteSet(secondCoachId, copiedSetId) : undefined,
            copiedPieceId
              ? deletePiece(secondCoachId, copiedPieceId)
              : undefined,
          ])
        }
        if (firstCoachId) {
          await signIn(testEmail!, testPassword!)
          await Promise.allSettled([
            sourceSetId ? deleteSet(firstCoachId, sourceSetId) : undefined,
            sourcePieceId
              ? deletePiece(firstCoachId, sourcePieceId)
              : undefined,
          ])
        }
      } finally {
        await supabase!.auth.signOut()
      }
    })

    it("keeps public discovery, references, private IDs, and independent copies isolated", async () => {
      firstCoachId = await signIn(testEmail!, testPassword!)
      const child: SetPiece = {
        id: `public-child-${suffix}`,
        name: `Public child ${suffix}`,
        category: "Main Set",
        instructions: "4 × 100 threshold",
        repeats: 4,
        distance: 100,
        rest: "@ 1:20",
        adaptiveInterval: {
          enabled: true,
          goal: "threshold",
          desiredRestSeconds: 15,
          groupCount: 2,
        },
      }
      const sourcePiece = await createPiece(firstCoachId, {
        id: `public-piece-${suffix}`,
        name: `Public circuit ${suffix}`,
        category: "Main Set",
        instructions: "2 rounds",
        repeats: 1,
        distance: 0,
        kind: "circuit",
        rounds: 2,
        children: [child],
        restBetweenPieces: "10 seconds",
        restBetweenRounds: "30 seconds",
      })
      sourcePieceId = sourcePiece.id
      const sourceSet = await createSet(firstCoachId, {
        id: `public-set-${suffix}`,
        title: `Public workout ${suffix}`,
        description: "Two-coach public sharing verification",
        created: "2025-05-21",
        modified: "2025-05-21",
        sections: [
          {
            id: `public-section-${suffix}`,
            name: "Main Set",
            pieces: [sourcePiece],
          },
        ],
      })
      sourceSetId = sourceSet.id
      await Promise.all([
        setContentVisibility(firstCoachId, "set", sourceSetId, "public"),
        setContentVisibility(firstCoachId, "piece", sourcePieceId, "public"),
      ])

      secondCoachId = await signIn(secondTestEmail!, secondTestPassword!)
      const [publicSets, publicPieces] = await Promise.all([
        listPublicLibrary({ type: "set", query: suffix }),
        listPublicLibrary({ type: "piece", query: suffix }),
      ])
      const discoveredSet = publicSets.items.find(
        (item) => item.id === sourceSetId,
      )
      const discoveredPiece = publicPieces.items.find(
        (item) => item.id === sourcePieceId,
      )
      expect(discoveredSet?.isOwn).toBe(false)
      expect(discoveredPiece?.isOwn).toBe(false)

      const { data: privateLookup, error: privateLookupError } = await supabase!
        .from("sets")
        .select("id")
        .eq("owner_id", firstCoachId)
        .eq("visibility", "private")
      if (privateLookupError) throw privateLookupError
      expect(privateLookup).toEqual([])

      expect(
        await savePublicLibraryItem(secondCoachId, "set", sourceSetId),
      ).toBe("saved")
      expect(
        await savePublicLibraryItem(secondCoachId, "set", sourceSetId),
      ).toBe("already-saved")
      await removePublicLibraryItem(secondCoachId, "set", sourceSetId)

      const copiedSet = await duplicatePublicLibraryItem("set", sourceSetId)
      const copiedPiece = await duplicatePublicLibraryItem(
        "piece",
        sourcePieceId,
      )
      expect(copiedSet.type).toBe("set")
      expect(copiedPiece.type).toBe("piece")
      if (copiedSet.type !== "set" || copiedPiece.type !== "piece") return
      copiedSetId = copiedSet.item.id
      copiedPieceId = copiedPiece.item.id
      expect(copiedSet.item.sections).toEqual(sourceSet.sections)
      expect(copiedPiece.item.children).toEqual(sourcePiece.children)

      const editedCopy = await updateSet(secondCoachId, {
        ...copiedSet.item,
        title: `Edited independent copy ${suffix}`,
      })
      expect(editedCopy.title).toContain("Edited independent copy")
      await expect(
        updateSet(secondCoachId, {
          ...sourceSet,
          title: "Unauthorized source edit",
        }),
      ).rejects.toThrow()
      await expect(deleteSet(secondCoachId, sourceSetId)).rejects.toThrow()

      firstCoachId = await signIn(testEmail!, testPassword!)
      const original = (await listOwnSets(firstCoachId, suffix)).find(
        (item) => item.id === sourceSetId,
      )
      expect(original?.title).toBe(sourceSet.title)
      expect(original?.sections).toEqual(sourceSet.sections)
    })
  },
)
