import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import {
  isSupabaseConfigured,
  requireSupabase,
  supabase,
} from "../lib/supabase"

export type CoachProfile = {
  id: string
  display_name: string
  organization: string
  preferences: Record<string, unknown>
}

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: CoachProfile | null
  profileError: string
  isRecovery: boolean
  signUp: (
    email: string,
    password: string,
    displayName: string,
    organization: string,
  ) => Promise<{ requiresEmailConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  saveProfile: (displayName: string, organization: string) => Promise<void>
  refreshProfile: () => Promise<void>
  finishRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}

function applicationUrl(path = ""): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  return new URL(path, base).toString()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<CoachProfile | null>(null)
  const [profileError, setProfileError] = useState("")
  const [isRecovery, setIsRecovery] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    const client = requireSupabase()
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, organization, preferences")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      setProfile(null)
      setProfileError(messageFromError(error))
      return
    }

    setProfile(data as CoachProfile | null ?? null)
    setProfileError("")
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setProfileError(messageFromError(error))
      setSession(data.session)
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => {
          if (active) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true)
      if (
        nextSession?.user &&
        (event === "SIGNED_IN" || event === "USER_UPDATED")
      ) {
        setLoading(true)
        window.setTimeout(() => {
          if (active) {
            void loadProfile(nextSession.user.id).finally(() => {
              if (active) setLoading(false)
            })
          }
        }, 0)
      } else {
        if (!nextSession) {
          setProfile(null)
          setLoading(false)
        }
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      organization: string,
    ) => {
      const client = requireSupabase()
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: applicationUrl(),
          data: {
            display_name: displayName,
            organization,
          },
        },
      })
      if (error) throw error
      if (data.session?.user) await loadProfile(data.session.user.id)
      return { requiresEmailConfirmation: !data.session }
    },
    [loadProfile],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const client = requireSupabase()
    const { error } = await client.auth.signOut()
    if (error) throw error
    setProfile(null)
    setSession(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: applicationUrl("?recovery=1"),
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const client = requireSupabase()
    const { error } = await client.auth.updateUser({ password })
    if (error) throw error
    setIsRecovery(false)
    window.history.replaceState({}, document.title, window.location.pathname)
  }, [])

  const saveProfile = useCallback(
    async (displayName: string, organization: string) => {
      if (!session?.user) throw new Error("No authenticated user.")
      const client = requireSupabase()
      const { data, error } = await client
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          organization: organization.trim(),
        })
        .eq("id", session.user.id)
        .select("id, display_name, organization, preferences")
        .single()
      if (error) throw error
      setProfile(data as CoachProfile)
      setProfileError("")
    },
    [session],
  )

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [loadProfile, session])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      isRecovery,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      saveProfile,
      refreshProfile,
      finishRecovery: () => setIsRecovery(false),
    }),
    [
      isRecovery,
      loading,
      profile,
      profileError,
      refreshProfile,
      requestPasswordReset,
      saveProfile,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider.")
  return context
}
