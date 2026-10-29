import { useEffect, useState } from "react"
import { useAuth } from "./AuthProvider"

type AuthMode = "login" | "register" | "forgot" | "recovery"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Brand() {
  return (
    <div className="auth-brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        <strong>LaneLink</strong>
        <small>Connect. Create. Coach.</small>
      </span>
    </div>
  )
}

export function AuthLoadingScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-loading">
        <Brand />
        <span className="auth-spinner" />
        <p>Restoring your coaching workspace…</p>
      </div>
    </div>
  )
}

export function MissingSupabaseConfiguration() {
  return (
    <div className="auth-shell">
      <div className="auth-card config-card">
        <Brand />
        <span className="eyebrow">CONFIGURATION REQUIRED</span>
        <h1>Connect LaneLink to Supabase</h1>
        <p>
          Add the project URL and publishable key before authentication can
          start.
        </p>
        <div className="config-values">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </div>
        <small>
          Find both values in Supabase Dashboard → Project Settings → API. Never
          use the service-role key in this frontend.
        </small>
      </div>
    </div>
  )
}

export function AuthScreen() {
  const { isRecovery, signIn, signUp, requestPasswordReset, updatePassword } =
    useAuth()
  const [mode, setMode] = useState<AuthMode>(isRecovery ? "recovery" : "login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [organization, setOrganization] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    if (isRecovery) setMode("recovery")
  }, [isRecovery])

  const validate = () => {
    if (mode !== "recovery" && !emailPattern.test(email)) {
      return "Enter a valid email address."
    }
    if (mode === "register" && !displayName.trim()) {
      return "Coach display name is required."
    }
    if (mode !== "forgot" && password.length < 8) {
      return "Password must contain at least 8 characters."
    }
    if (
      (mode === "register" || mode === "recovery") &&
      password !== confirmPassword
    ) {
      return "Passwords do not match."
    }
    return ""
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      if (mode === "login") {
        await signIn(email, password)
      } else if (mode === "register") {
        const result = await signUp(email, password, displayName, organization)
        if (result.requiresEmailConfirmation) {
          setSuccess(
            "Account created. Check your email and follow the verification link before signing in.",
          )
        }
      } else if (mode === "forgot") {
        await requestPasswordReset(email)
        setSuccess(
          "If an account exists for that address, a password recovery link has been sent.",
        )
      } else {
        await updatePassword(password)
        setSuccess("Password updated. Your coaching workspace is ready.")
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Authentication could not be completed.",
      )
    } finally {
      setLoading(false)
    }
  }

  const changeMode = (next: AuthMode) => {
    setMode(next)
    setError("")
    setSuccess("")
    setPassword("")
    setConfirmPassword("")
  }

  const title =
    mode === "login"
      ? "Welcome back"
      : mode === "register"
        ? "Create your coach account"
        : mode === "forgot"
          ? "Reset your password"
          : "Choose a new password"

  return (
    <div className="auth-shell">
      <div className="auth-layout">
        <section className="auth-story">
          <Brand />
          <div>
            <span className="eyebrow">SWIM WORKOUT PLANNING</span>
            <h1>Build better practices, one lane at a time.</h1>
            <p>
              Create reusable sets, organize circuits, calculate yardage, and
              plan adaptive intervals from one focused coaching workspace.
            </p>
          </div>
          <small>
            LaneLink securely uses Supabase Auth for coach accounts.
          </small>
        </section>
        <section className="auth-card">
          <span className="eyebrow">
            {mode === "register"
              ? "NEW ACCOUNT"
              : mode === "recovery"
                ? "ACCOUNT RECOVERY"
                : "COACH SIGN IN"}
          </span>
          <h2>{title}</h2>
          <p>
            {mode === "forgot"
              ? "Enter your account email and we’ll send a secure recovery link."
              : mode === "recovery"
                ? "Your recovery link is valid. Set a new account password."
                : "Access your workout planning workspace."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <>
                <label>
                  <span>Coach display name</span>
                  <input
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Jordan Rivera"
                  />
                </label>
                <label>
                  <span>
                    Team or organization <em>Optional</em>
                  </span>
                  <input
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                    placeholder="North Shore Aquatics"
                  />
                </label>
              </>
            )}
            {mode !== "recovery" && (
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="coach@example.com"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
            )}
            {(mode === "register" || mode === "recovery") && (
              <label>
                <span>Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            )}
            {error && <div className="auth-message error">{error}</div>}
            {success && <div className="auth-message success">{success}</div>}
            <button
              className={`button button-primary auth-submit ${
                loading ? "button-disabled" : ""
              }`}
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                  ? "Sign In"
                  : mode === "register"
                    ? "Create Account"
                    : mode === "forgot"
                      ? "Send Recovery Link"
                      : "Update Password"}
            </button>
          </form>
          <div className="auth-links">
            {mode === "login" && (
              <>
                <button onClick={() => changeMode("forgot")}>
                  Forgot password?
                </button>
                <button onClick={() => changeMode("register")}>
                  Create an account
                </button>
              </>
            )}
            {(mode === "register" || mode === "forgot") && (
              <button onClick={() => changeMode("login")}>
                Back to sign in
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export function ProfileSetupScreen() {
  const { profile, profileError, saveProfile, user } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "")
  const [organization, setOrganization] = useState(profile?.organization ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(profileError)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!displayName.trim()) {
      setError("Coach display name is required.")
      return
    }
    setLoading(true)
    setError("")
    try {
      await saveProfile(displayName, organization)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Profile setup could not be completed.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card profile-setup-card">
        <Brand />
        <span className="eyebrow">PROFILE SETUP</span>
        <h1>Finish your coach profile</h1>
        <p>
          This information identifies your LaneLink coach profile and appears on
          exported practice plans.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input value={user?.email ?? ""} disabled />
          </label>
          <label>
            <span>Coach display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            <span>
              Team or organization <em>Optional</em>
            </span>
            <input
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
            />
          </label>
          {error && <div className="auth-message error">{error}</div>}
          <button
            className={`button button-primary auth-submit ${
              loading ? "button-disabled" : ""
            }`}
            disabled={loading}
          >
            {loading ? "Saving…" : "Open LaneLink"}
          </button>
        </form>
      </div>
    </div>
  )
}
