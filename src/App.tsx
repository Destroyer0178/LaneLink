import { useEffect, useMemo, useState } from "react"
import { extractDocx } from "./import/documentExtraction"
import { ImportSourcePreview } from "./import/ImportSourcePreview"
import { NestedSetSummary } from "./import/NestedSetSummary"
import { parseWorkoutText } from "./import/parser"
import type {
  AdaptiveIntervalConfig,
  Category,
  PerformanceRecord,
  SetPiece,
  Workout,
  WorkoutSection,
} from "./workout/types"
import {
  calculateCircuitYardage,
  calculatePieceYardage,
  calculateSectionYardage,
  calculateWorkoutYardage,
  resolvedYardageOrZero,
} from "./workout/yardage"
import { AdaptiveIntervalsModal } from "./workout/AdaptiveIntervalsModal"
import { recommendIntervals } from "./workout/intervals"
import { circuitPrintLines, intervalGroupsForPrint } from "./workout/print"

type Page = "dashboard" | "builder" | "workouts" | "library" | "account" | "preview" | "import"
type ImportStep = "upload" | "processing" | "review" | "save" | "success"

type ImportSource = {
  filename: string
  fileType: "DOCX" | "TEXT"
  source: string
  warnings: string[]
}

const categoryColors: Record<Category, string> = {
  Warmup: "sky",
  Drill: "violet",
  "Main Set": "teal",
  Kick: "amber",
  Pull: "blue",
  Sprint: "rose",
  Cooldown: "slate",
}

const seedPieces: SetPiece[] = [
  {
    id: "p1",
    name: "400 Easy Swim",
    category: "Warmup",
    instructions: "400 easy choice\nBuild effort by 100",
    repeats: 1,
    distance: 400,
  },
  {
    id: "p2",
    name: "Technique 50s",
    category: "Drill",
    instructions: "8 × 50 technique drill\n25 catch-up / 25 swim",
    repeats: 8,
    distance: 50,
    rest: "@ 1:00",
  },
  {
    id: "p3",
    name: "Kick Strength",
    category: "Kick",
    instructions: "6 × 100 kick with board\nDescend 1–3, 4–6",
    repeats: 6,
    distance: 100,
    rest: "@ 1:50",
  },
  {
    id: "p4",
    name: "Threshold 100s",
    category: "Main Set",
    instructions: "10 × 100 freestyle\nHold strong, consistent pace",
    repeats: 10,
    distance: 100,
    rest: "@ 1:30",
  },
  {
    id: "p5",
    name: "Pull 200s",
    category: "Pull",
    instructions: "4 × 200 pull with paddles\nBreathe every 3",
    repeats: 4,
    distance: 200,
    rest: "@ 3:00",
  },
  {
    id: "p6",
    name: "Race Pace 25s",
    category: "Sprint",
    instructions: "12 × 25 from a push\nRace pace, perfect finish",
    repeats: 12,
    distance: 25,
    rest: "@ :40",
  },
  {
    id: "p7",
    name: "200 Easy Swim",
    category: "Cooldown",
    instructions: "200 easy choice\nLong strokes, relaxed breathing",
    repeats: 1,
    distance: 200,
  },
]

const copyPiece = (piece: SetPiece): SetPiece => {
  const copy: SetPiece = JSON.parse(JSON.stringify(piece))
  return {
    ...copy,
    id: `${piece.id}-${Date.now()}-${Math.random()}`,
  }
}
const yardage = (piece: SetPiece) => resolvedYardageOrZero(piece)
const sectionYardage = (section: WorkoutSection) => {
  const result = calculateSectionYardage(section)
  return result.status === "resolved"
    ? result.yards
    : section.pieces.reduce((sum, piece) => sum + yardage(piece), 0)
}
const workoutYardage = (workout: Workout) => {
  const result = calculateWorkoutYardage(workout)
  return result.status === "resolved"
    ? result.yards
    : workout.sections.reduce(
        (sum, section) => sum + sectionYardage(section),
        0,
      )
}
const pieceCount = (workout: Workout) =>
  workout.sections.reduce((sum, section) => sum + section.pieces.length, 0)
const formatYards = (value: number) => `${value.toLocaleString()} yd`
const pieceYardageLabel = (piece: SetPiece) => {
  const result = calculatePieceYardage(piece)
  return result.status === "resolved" ? formatYards(result.yards) : "Unresolved"
}
const today = () => new Date().toISOString().slice(0, 10)

const seedWorkouts: Workout[] = [
  {
    id: "w1",
    title: "Monday Aerobic Foundation",
    description: "Technique-focused aerobic session for the senior group.",
    created: "2025-05-12",
    modified: "2025-05-18",
    sections: [
      {
        id: "s1",
        name: "Warmup",
        pieces: [copyPiece(seedPieces[0]), copyPiece(seedPieces[1])],
      },
      {
        id: "s2",
        name: "Main Set",
        pieces: [copyPiece(seedPieces[4]), copyPiece(seedPieces[3])],
      },
      { id: "s3", name: "Cooldown", pieces: [copyPiece(seedPieces[6])] },
    ],
  },
  {
    id: "w2",
    title: "Wednesday Speed & Skills",
    description: "Short speed with technical quality.",
    created: "2025-05-08",
    modified: "2025-05-16",
    sections: [
      { id: "s4", name: "Warmup", pieces: [copyPiece(seedPieces[0])] },
      {
        id: "s5",
        name: "Pre-Set",
        pieces: [copyPiece(seedPieces[1]), copyPiece(seedPieces[2])],
      },
      {
        id: "s6",
        name: "Main Set",
        pieces: [copyPiece(seedPieces[5]), copyPiece(seedPieces[5])],
      },
      { id: "s7", name: "Cooldown", pieces: [copyPiece(seedPieces[6])] },
    ],
  },
  {
    id: "w3",
    title: "Friday Threshold Builder",
    description: "Sustained threshold work with a pull lead-in.",
    created: "2025-05-03",
    modified: "2025-05-14",
    sections: [
      {
        id: "s8",
        name: "Warmup",
        pieces: [copyPiece(seedPieces[0]), copyPiece(seedPieces[1])],
      },
      {
        id: "s9",
        name: "Main Set",
        pieces: [
          copyPiece(seedPieces[4]),
          copyPiece(seedPieces[3]),
          copyPiece(seedPieces[2]),
        ],
      },
      { id: "s10", name: "Cooldown", pieces: [copyPiece(seedPieces[6])] },
    ],
  },
]

const emptyWorkout = (): Workout => ({
  id: `w-${Date.now()}`,
  title: "Untitled Workout",
  description: "",
  created: today(),
  modified: today(),
  sections: [
    { id: `s-${Date.now()}-1`, name: "Warmup", pieces: [] },
    { id: `s-${Date.now()}-2`, name: "Main Set", pieces: [] },
    { id: `s-${Date.now()}-3`, name: "Cooldown", pieces: [] },
  ],
})

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    builder: (
      <>
        <path d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" />
        <path d="M8 8h8M8 12h5M8 16h7" />
      </>
    ),
    workouts: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </>
    ),
    library: (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    duplicate: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
        <path d="m14 7 3 3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 20h18.4z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    grip: (
      <>
        <circle cx="9" cy="7" r="1" />
        <circle cx="15" cy="7" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="17" r="1" />
        <circle cx="15" cy="17" r="1" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
    print: (
      <>
        <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7z" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      </>
    ),
  }
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  className = "",
}: {
  children?: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  icon?: string
  onClick?: () => void
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />} {children}
    </button>
  )
}

function Field({
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: string
}) {
  return (
    <input
      className={`field ${className}`}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function Badge({ category }: { category: Category }) {
  return (
    <span className={`badge badge-${categoryColors[category]}`}>
      {category}
    </span>
  )
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="stat-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  )
}

function App() {
  const [page, setPage] = useState<Page>("dashboard")
  const [pieces, setPieces] = useState<SetPiece[]>(() => {
    const stored = localStorage.getItem("swimflow-pieces")
    return stored ? JSON.parse(stored) : seedPieces
  })
  const [workouts, setWorkouts] = useState<Workout[]>(() => {
    const stored = localStorage.getItem("swimflow-workouts")
    return stored ? JSON.parse(stored) : seedWorkouts
  })
  const [current, setCurrent] = useState<Workout>(() => emptyWorkout())
  const [importStep, setImportStep] = useState<ImportStep>("upload")
  const [importScenario, setImportScenario] = useState<ImportSource | null>(
    null,
  )
  const [importDraft, setImportDraft] = useState<Workout>(() => emptyWorkout())
  const [savedImport, setSavedImport] = useState<Workout | null>(null)
  const [savedLibraryCount, setSavedLibraryCount] = useState(0)
  const [importPrompt, setImportPrompt] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"All" | Category>("All")
  const [modal, setModal] = useState<{
    open: boolean
    piece?: SetPiece
    sectionId?: string
    libraryOnly?: boolean
  }>({ open: false })
  const [performanceRecords, setPerformanceRecords] =
    useState<PerformanceRecord[]>(() => {
      const stored = localStorage.getItem("swimflow-performance-records")
      return stored ? JSON.parse(stored) : []
    })
  const [intervalTarget, setIntervalTarget] = useState<{
    piece: SetPiece
    sectionId: string
    parentPieceId?: string
  } | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(
    () => localStorage.setItem("swimflow-pieces", JSON.stringify(pieces)),
    [pieces],
  )
  useEffect(
    () => localStorage.setItem("swimflow-workouts", JSON.stringify(workouts)),
    [workouts],
  )
  useEffect(
    () =>
      localStorage.setItem(
        "swimflow-performance-records",
        JSON.stringify(performanceRecords),
      ),
    [performanceRecords],
  )
  useEffect(() => {
    const pageTitles: Record<Page, string> = {
      dashboard: "Dashboard",
      builder: "Workout Builder",
      workouts: "My Workouts",
      library: "Set Piece Library",
      account: "Account Settings",
      preview: "Print Preview",
      import: "Import Workout",
    }
    document.title = `LaneLink — ${pageTitles[page]}`
  }, [page])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(""), 2600)
  }

  const navigate = (next: Page) => {
    setPage(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const startNew = () => {
    setCurrent(emptyWorkout())
    navigate("builder")
  }

  const beginImport = (fromBuilder = false) => {
    if (fromBuilder && pieceCount(current) > 0) {
      setImportPrompt(true)
      return
    }
    setImportScenario(null)
    setImportStep("upload")
    navigate("import")
  }

  const continueImport = (action: "save" | "discard") => {
    if (action === "save") saveWorkout()
    setImportPrompt(false)
    setImportScenario(null)
    setImportStep("upload")
    navigate("import")
  }

  const openWorkout = (workout: Workout, preview = false) => {
    setCurrent(JSON.parse(JSON.stringify(workout)))
    navigate(preview ? "preview" : "builder")
  }

  const saveWorkout = (asNew = false) => {
    const updated = {
      ...current,
      id: asNew ? `w-${Date.now()}` : current.id,
      created: asNew ? today() : current.created,
      modified: today(),
    }
    const exists = workouts.some((workout) => workout.id === updated.id)
    setWorkouts(
      exists
        ? workouts.map((workout) =>
            workout.id === updated.id ? updated : workout,
          )
        : [updated, ...workouts],
    )
    setCurrent(updated)
    showNotice(
      asNew ? "Workout saved as a new copy" : "Workout saved successfully",
    )
  }

  const totalSaved = workouts.reduce(
    (sum, workout) => sum + workoutYardage(workout),
    0,
  )
  const average = workouts.length ? Math.round(totalSaved / workouts.length) : 0

  return (
    <div className="app-shell">
      <Sidebar page={page} navigate={navigate} startNew={startNew} />
      <main className={page === "preview" ? "main preview-main" : "main"}>
        <Topbar page={page} />
        {page === "dashboard" && (
          <Dashboard
            workouts={workouts}
            pieces={pieces}
            total={totalSaved}
            average={average}
            startNew={startNew}
            openWorkout={openWorkout}
            navigate={navigate}
            beginImport={() => beginImport()}
          />
        )}
        {page === "builder" && (
          <Builder
            current={current}
            setCurrent={setCurrent}
            pieces={pieces}
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            setModal={setModal}
            saveWorkout={saveWorkout}
            navigate={navigate}
            beginImport={() => beginImport(true)}
            setIntervalTarget={setIntervalTarget}
            performanceRecords={performanceRecords}
          />
        )}
        {page === "workouts" && (
          <WorkoutsPage
            workouts={workouts}
            total={totalSaved}
            average={average}
            openWorkout={openWorkout}
            setWorkouts={setWorkouts}
            showNotice={showNotice}
            startNew={startNew}
            beginImport={() => beginImport()}
          />
        )}
        {page === "library" && (
          <LibraryPage
            pieces={pieces}
            setPieces={setPieces}
            setModal={setModal}
            startNew={startNew}
            showNotice={showNotice}
          />
        )}
        {page === "account" && <AccountPage showNotice={showNotice} />}
        {page === "preview" && (
          <Preview
            workout={current}
            navigate={navigate}
            showNotice={showNotice}
          />
        )}
        {page === "import" && (
          <ImportWorkflow
            step={importStep}
            setStep={setImportStep}
            scenario={importScenario}
            setScenario={setImportScenario}
            draft={importDraft}
            setDraft={setImportDraft}
            setModal={setModal}
            pieces={pieces}
            setPieces={setPieces}
            workouts={workouts}
            setWorkouts={setWorkouts}
            savedImport={savedImport}
            setSavedImport={setSavedImport}
            savedLibraryCount={savedLibraryCount}
            setSavedLibraryCount={setSavedLibraryCount}
            openWorkout={openWorkout}
            navigate={navigate}
          />
        )}
      </main>
      {modal.open && (
        <PieceModal
          modal={modal}
          close={() => setModal({ open: false })}
          pieces={pieces}
          setPieces={setPieces}
          current={page === "import" ? importDraft : current}
          setCurrent={page === "import" ? setImportDraft : setCurrent}
          showNotice={showNotice}
        />
      )}
      {intervalTarget && (
        <AdaptiveIntervalsModal
          piece={intervalTarget.piece}
          records={performanceRecords}
          onRecordsChange={setPerformanceRecords}
          onClose={() => setIntervalTarget(null)}
          onSave={(updatedPiece) => {
            setCurrent({
              ...current,
              sections: current.sections.map((section) => {
                if (section.id !== intervalTarget.sectionId) return section
                return {
                  ...section,
                  pieces: section.pieces.map((piece) => {
                    if (intervalTarget.parentPieceId) {
                      if (piece.id !== intervalTarget.parentPieceId)
                        return piece
                      return {
                        ...piece,
                        children: piece.children?.map((child) =>
                          child.id === updatedPiece.id ? updatedPiece : child,
                        ),
                      }
                    }
                    return piece.id === updatedPiece.id ? updatedPiece : piece
                  }),
                }
              }),
            })
            showNotice("Adaptive interval settings updated")
          }}
        />
      )}
      {importPrompt && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <span className="confirm-icon">
              <Icon name="alert" />
            </span>
            <h2>Start a new import?</h2>
            <p>
              Your current workout contains pieces that may not be saved. What
              would you like to do?
            </p>
            <div>
              <Button variant="ghost" onClick={() => setImportPrompt(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => continueImport("discard")}
              >
                Discard Changes
              </Button>
              <Button onClick={() => continueImport("save")}>
                Save &amp; Import
              </Button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast">
          <span className="toast-check">
            <Icon name="check" size={15} />
          </span>
          {notice}
        </div>
      )}
    </div>
  )
}

function Sidebar({
  page,
  navigate,
  startNew,
}: {
  page: Page
  navigate: (page: Page) => void
  startNew: () => void
}) {
  const items: { page: Page; label: string; icon: string }[] = [
    { page: "dashboard", label: "Dashboard", icon: "dashboard" },
    { page: "builder", label: "Workout Builder", icon: "builder" },
    { page: "workouts", label: "My Workouts", icon: "workouts" },
    { page: "library", label: "Set Piece Library", icon: "library" },
  ]
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("dashboard")}>
        <span className="brand-mark">
          <span />
          <span />
          <span />
        </span>
        <span className="brand-copy">
          <span>
            Lane<strong>Link</strong>
          </span>
          <small>Connect. Create. Coach.</small>
        </span>
      </button>
      <Button icon="plus" className="new-workout" onClick={startNew}>
        New Workout
      </Button>
      <nav className="nav-list">
        <span className="nav-label">Workspace</span>
        {items.map((item) => (
          <button
            key={item.page}
            className={`nav-item ${page === item.page ? "active" : ""}`}
            onClick={() => navigate(item.page)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          className={`nav-item ${page === "account" ? "active" : ""}`}
          onClick={() => navigate("account")}
        >
          <Icon name="account" />
          <span>Account Settings</span>
        </button>
        <div className="coach-card">
          <div className="avatar">MC</div>
          <div>
            <strong>Marcus Chen</strong>
            <span>Head Coach</span>
          </div>
          <Icon name="more" />
        </div>
      </div>
    </aside>
  )
}

function Topbar({ page }: { page: Page }) {
  const labels: Record<Page, string> = {
    dashboard: "Dashboard",
    builder: "Workout Builder",
    workouts: "My Workouts",
    library: "Set Piece Library",
    account: "Account Settings",
    preview: "Print Preview",
    import: "Import Workout",
  }
  return (
    <header className="topbar">
      <span className="mobile-logo">LaneLink</span>
      <span className="breadcrumb">
        Workspace <Icon name="chevron" size={14} />{" "}
        <strong>{labels[page]}</strong>
      </span>
      <div className="topbar-actions">
        <button className="help-button">?</button>
        <div className="avatar avatar-small">MC</div>
      </div>
    </header>
  )
}

function Dashboard({
  workouts,
  pieces,
  total,
  average,
  startNew,
  openWorkout,
  navigate,
  beginImport,
}: {
  workouts: Workout[]
  pieces: SetPiece[]
  total: number
  average: number
  startNew: () => void
  openWorkout: (w: Workout) => void
  navigate: (p: Page) => void
  beginImport: () => void
}) {
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <span className="date-label">MONDAY, MAY 19</span>
          <h1>Good morning, Marcus</h1>
          <p>Here’s what’s happening across your workout library.</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" icon="upload" onClick={beginImport}>
            Import Workout
          </Button>
          <Button icon="plus" onClick={startNew}>
            Create Workout
          </Button>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard
          label="Saved workouts"
          value={`${workouts.length}`}
          detail="+2 this month"
        />
        <StatCard
          label="Combined yardage"
          value={formatYards(total)}
          detail="Across all workouts"
        />
        <StatCard
          label="Average workout"
          value={formatYards(average)}
          detail="Per saved workout"
        />
        <StatCard
          label="Reusable pieces"
          value={`${pieces.length}`}
          detail="Across 7 categories"
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Recently edited</h2>
              <p>Pick up where you left off</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("workouts")}
            >
              View all <Icon name="chevron" size={15} />
            </button>
          </div>
          <div className="workout-list">
            {workouts.slice(0, 3).map((workout, index) => (
              <button
                className="recent-workout"
                key={workout.id}
                onClick={() => openWorkout(workout)}
              >
                <span className={`workout-index index-${index + 1}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="recent-info">
                  <strong>{workout.title}</strong>
                  <span>
                    Edited {workout.modified} · {pieceCount(workout)} pieces
                  </span>
                </span>
                <span className="yardage-column">
                  <strong>{workoutYardage(workout).toLocaleString()}</strong>
                  <span>yards</span>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h2>Quick access</h2>
              <p>Your most-used set pieces</p>
            </div>
            <button className="text-button" onClick={() => navigate("library")}>
              Library <Icon name="chevron" size={15} />
            </button>
          </div>
          <div className="quick-list">
            {pieces.slice(0, 4).map((piece) => (
              <div className="quick-piece" key={piece.id}>
                <span
                  className={`quick-icon badge-${categoryColors[piece.category]}`}
                >
                  {piece.category.slice(0, 1)}
                </span>
                <div>
                  <strong>{piece.name}</strong>
                  <span>
                    {piece.category} · {formatYards(yardage(piece))}
                  </span>
                </div>
                <button onClick={startNew}>
                  <Icon name="plus" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="planning-banner">
        <div className="banner-art">
          <span />
          <span />
          <span />
        </div>
        <div>
          <span className="eyebrow">Connect. Create. Coach.</span>
          <h2>Build this week’s next practice</h2>
          <p>
            Start from your saved pieces and have a pool-ready workout in
            minutes.
          </p>
        </div>
        <Button variant="secondary" onClick={startNew}>
          Open Builder <Icon name="chevron" />
        </Button>
      </section>
    </div>
  )
}

function Builder({
  current,
  setCurrent,
  pieces,
  search,
  setSearch,
  filter,
  setFilter,
  setModal,
  saveWorkout,
  navigate,
  beginImport,
  setIntervalTarget,
  performanceRecords,
}: {
  current: Workout
  setCurrent: React.Dispatch<React.SetStateAction<Workout>>
  pieces: SetPiece[]
  search: string
  setSearch: (v: string) => void
  filter: "All" | Category
  setFilter: (v: "All" | Category) => void
  setModal: React.Dispatch<React.SetStateAction<{
    open: boolean
    piece?: SetPiece
    sectionId?: string
    libraryOnly?: boolean
  }>>
  saveWorkout: (asNew?: boolean) => void
  navigate: (p: Page) => void
  beginImport: () => void
  setIntervalTarget: React.Dispatch<React.SetStateAction<{
    piece: SetPiece
    sectionId: string
    parentPieceId?: string
  } | null>>
  performanceRecords: PerformanceRecord[]
}) {
  const [draggedPiece, setDraggedPiece] = useState<{
    source: "library" | "workout"
    piece: SetPiece
    sectionId?: string
    index?: number
  } | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const categories: ("All" | Category)[] = [
    "All",
    "Warmup",
    "Drill",
    "Main Set",
    "Kick",
    "Pull",
    "Sprint",
    "Cooldown",
  ]
  const filtered = pieces.filter(
    (piece) =>
      (filter === "All" || piece.category === filter) &&
      `${piece.name} ${piece.instructions}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const addPiece = (piece: SetPiece) => {
    const targetIndex = Math.max(
      0,
      current.sections.findIndex((section) =>
        section.name
          .toLowerCase()
          .includes(piece.category.toLowerCase().split(" ")[0]),
      ),
    )
    setCurrent({
      ...current,
      sections: current.sections.map((section, index) =>
        index === targetIndex
          ? { ...section, pieces: [...section.pieces, copyPiece(piece)] }
          : section,
      ),
    })
  }
  const movePiece = (
    sectionId: string,
    pieceIndex: number,
    direction: -1 | 1,
  ) =>
    setCurrent({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) return section
        const next = [...section.pieces]
        const target = pieceIndex + direction
        if (target < 0 || target >= next.length) return section
        ;[next[pieceIndex], next[target]] = [next[target], next[pieceIndex]]
        return { ...section, pieces: next }
      }),
    })
  const removePiece = (sectionId: string, pieceId: string) =>
    setCurrent({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              pieces: section.pieces.filter((piece) => piece.id !== pieceId),
            }
          : section,
      ),
    })
  const duplicatePiece = (sectionId: string, piece: SetPiece) =>
    setCurrent({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, pieces: [...section.pieces, copyPiece(piece)] }
          : section,
      ),
    })
  const deleteSection = (section: WorkoutSection) => {
    if (
      section.pieces.length > 0 &&
      !window.confirm(
        `Delete “${section.name}” and its ${section.pieces.length} set piece${
          section.pieces.length === 1 ? "" : "s"
        }?`,
      )
    ) {
      return
    }
    setCurrent({
      ...current,
      sections: current.sections.filter((item) => item.id !== section.id),
    })
  }
  const dropPiece = (targetSectionId: string, targetIndex?: number) => {
    if (!draggedPiece) return
    const pieceToInsert =
      draggedPiece.source === "library"
        ? copyPiece(draggedPiece.piece)
        : draggedPiece.piece
    let nextSections = current.sections.map((section) =>
      draggedPiece.source === "workout" && section.id === draggedPiece.sectionId
        ? {
            ...section,
            pieces: section.pieces.filter(
              (piece) => piece.id !== draggedPiece.piece.id,
            ),
          }
        : { ...section, pieces: [...section.pieces] },
    )
    nextSections = nextSections.map((section) => {
      if (section.id !== targetSectionId) return section
      const nextPieces = [...section.pieces]
      let insertAt = targetIndex ?? nextPieces.length
      if (
        draggedPiece.source === "workout" &&
        draggedPiece.sectionId === targetSectionId &&
        draggedPiece.index !== undefined &&
        draggedPiece.index < insertAt
      ) {
        insertAt -= 1
      }
      nextPieces.splice(Math.max(0, insertAt), 0, pieceToInsert)
      return { ...section, pieces: nextPieces }
    })
    setCurrent({ ...current, sections: nextSections })
    setDraggedPiece(null)
    setDragOverSection(null)
  }
  const applyAdaptiveToEligibleSets = () => {
    const eligibleCount = current.sections
      .flatMap((section) => section.pieces)
      .reduce(
        (count, piece) =>
          count +
          (piece.kind === "circuit"
            ? (piece.children ?? []).filter((child) => child.distance > 0)
                .length
            : piece.distance > 0
              ? 1
              : 0),
        0,
      )
    if (
      !window.confirm(
        `Calculate recommendations for ${eligibleCount} eligible set${
          eligibleCount === 1 ? "" : "s"
        } using ${performanceRecords.length} saved performance record${
          performanceRecords.length === 1 ? "" : "s"
        }? Existing manual overrides will be preserved.`,
      )
    ) {
      return
    }
    const updatePiece = (piece: SetPiece): SetPiece => {
      if (piece.kind === "circuit") {
        return {
          ...piece,
          children: piece.children?.map(updatePiece),
        }
      }
      if (!piece.distance) return piece
      const config: AdaptiveIntervalConfig = piece.adaptiveInterval ?? {
        enabled: true,
        goal: "aerobic",
        groupCount: 3,
      }
      if (config.manualIntervalSeconds) return piece
      return {
        ...piece,
        adaptiveInterval: {
          ...config,
          enabled: true,
          recommendation: recommendIntervals(piece, performanceRecords, config),
        },
      }
    }
    setCurrent({
      ...current,
      adaptiveIntervalsEnabled: true,
      sections: current.sections.map((section) => ({
        ...section,
        pieces: section.pieces.map(updatePiece),
      })),
    })
  }

  return (
    <div className="builder-page">
      <div className="builder-toolbar">
        <div>
          <span className="eyebrow">WORKOUT BUILDER</span>
          <input
            className="title-input"
            value={current.title}
            onChange={(event) =>
              setCurrent({ ...current, title: event.target.value })
            }
          />
          <input
            className="description-input"
            value={current.description}
            placeholder="Add a short workout description..."
            onChange={(event) =>
              setCurrent({ ...current, description: event.target.value })
            }
          />
        </div>
        <div className="builder-actions">
          <label className="builder-adaptive-toggle">
            <input
              type="checkbox"
              checked={current.adaptiveIntervalsEnabled ?? false}
              onChange={(event) =>
                setCurrent({
                  ...current,
                  adaptiveIntervalsEnabled: event.target.checked,
                })
              }
            />
            <span className="toggle" />
            <span>Adaptive intervals</span>
          </label>
          {current.adaptiveIntervalsEnabled && (
            <Button variant="ghost" onClick={applyAdaptiveToEligibleSets}>
              Apply to Eligible Sets
            </Button>
          )}
          <Button variant="ghost" icon="upload" onClick={beginImport}>
            Import Existing
          </Button>
          <Button variant="ghost" onClick={() => saveWorkout(true)}>
            Save as New
          </Button>
          <Button
            variant="secondary"
            icon="print"
            onClick={() => navigate("preview")}
          >
            Preview PDF
          </Button>
          <Button icon="check" onClick={() => saveWorkout()}>
            Save Workout
          </Button>
        </div>
      </div>
      <div className="builder-layout">
        <aside className="library-panel">
          <div className="library-header">
            <div>
              <h2>Set Piece Library</h2>
              <p>{pieces.length} reusable pieces</p>
            </div>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setModal({ open: true, libraryOnly: true })}
            >
              Create Piece
            </Button>
          </div>
          <div className="drag-helper">
            <Icon name="grip" size={16} />
            Drag any set piece into the section where you want it.
          </div>
          <label className="search-box">
            <Icon name="search" />
            <Field
              value={search}
              onChange={setSearch}
              placeholder="Search set pieces..."
            />
          </label>
          <div className="filter-row">
            {categories.map((category) => (
              <button
                key={category}
                className={filter === category ? "selected" : ""}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="piece-list">
            {filtered.map((piece) => (
              <article
                className="piece-card draggable-piece"
                key={piece.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy"
                  setDraggedPiece({ source: "library", piece })
                }}
                onDragEnd={() => {
                  setDraggedPiece(null)
                  setDragOverSection(null)
                }}
              >
                <div className="piece-card-top">
                  <Badge category={piece.category} />
                  <strong>{formatYards(yardage(piece))}</strong>
                </div>
                <h3>{piece.name}</h3>
                <p>{piece.instructions.split("\n")[0]}</p>
                <div className="piece-meta">
                  <span>
                    {piece.repeats} × {piece.distance}
                  </span>
                  {piece.rest && <span>{piece.rest}</span>}
                </div>
                <Button
                  variant="secondary"
                  icon="plus"
                  onClick={() => addPiece(piece)}
                >
                  Add to Workout
                </Button>
              </article>
            ))}
          </div>
        </aside>
        <section className="workout-canvas">
          <div className="yardage-summary">
            <div>
              <span>Total workout</span>
              <strong>
                {workoutYardage(current).toLocaleString()} <small>yards</small>
              </strong>
            </div>
            <div className="summary-meta">
              <span>{current.sections.length} sections</span>
              <span>{pieceCount(current)} pieces</span>
            </div>
          </div>
          <div className="section-stack">
            {current.sections.map((section) => (
              <article
                className={`workout-section ${
                  dragOverSection === section.id ? "drag-over" : ""
                }`}
                key={section.id}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect =
                    draggedPiece?.source === "library" ? "copy" : "move"
                  setDragOverSection(section.id)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  dropPiece(section.id)
                }}
              >
                <header>
                  <div>
                    <input
                      value={section.name}
                      onChange={(event) =>
                        setCurrent({
                          ...current,
                          sections: current.sections.map((item) =>
                            item.id === section.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <span>{section.pieces.length} pieces</span>
                  </div>
                  <div className="section-header-actions">
                    <strong>{formatYards(sectionYardage(section))}</strong>
                    <button
                      className="delete-section-button"
                      title={`Delete ${section.name} section`}
                      onClick={() => deleteSection(section)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </header>
                <div className="section-pieces">
                  {section.pieces.length === 0 ? (
                    <button
                      className="empty-dropzone"
                      onClick={() =>
                        setModal({ open: true, sectionId: section.id })
                      }
                    >
                      <Icon name="plus" />
                      <span>Drop a set piece here or create one</span>
                    </button>
                  ) : (
                    section.pieces.map((piece, index) => (
                      <div
                        className="workout-piece"
                        key={piece.id}
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation()
                          event.dataTransfer.effectAllowed = "move"
                          setDraggedPiece({
                            source: "workout",
                            piece,
                            sectionId: section.id,
                            index,
                          })
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setDragOverSection(section.id)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          dropPiece(section.id, index)
                        }}
                        onDragEnd={() => {
                          setDraggedPiece(null)
                          setDragOverSection(null)
                        }}
                      >
                        <span className="grip" title="Drag to move this piece">
                          <Icon name="grip" />
                        </span>
                        <div className="piece-order">
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="workout-piece-copy">
                          <div>
                            <strong>{piece.name}</strong>
                            <Badge category={piece.category} />
                          </div>
                          <p>{piece.instructions}</p>
                          <span>
                            {piece.repeats} × {piece.distance}
                            {piece.rest ? ` ${piece.rest}` : ""}
                          </span>
                          {piece.adaptiveInterval?.enabled && (
                            <span className="adaptive-summary">
                              Adaptive · {piece.adaptiveInterval.goal}
                              {piece.adaptiveInterval.recommendation?.accepted
                                ? ` · ${piece.adaptiveInterval.recommendation.groups.length} groups`
                                : " · needs review"}
                            </span>
                          )}
                          {piece.kind === "circuit" && (
                            <div className="builder-circuit-children">
                              {piece.children?.map((child) => (
                                <div key={child.id}>
                                  <span>
                                    {child.name} · {pieceYardageLabel(child)}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setIntervalTarget({
                                        piece: child,
                                        sectionId: section.id,
                                        parentPieceId: piece.id,
                                      })
                                    }
                                  >
                                    {child.adaptiveInterval?.enabled
                                      ? "Edit intervals"
                                      : "Add intervals"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <strong className="piece-yards">
                          {formatYards(yardage(piece))}
                        </strong>
                        <div className="piece-actions">
                          <button
                            title="Move up"
                            onClick={() => movePiece(section.id, index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            title="Move down"
                            onClick={() => movePiece(section.id, index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            title="Adaptive intervals"
                            onClick={() =>
                              setIntervalTarget({
                                piece,
                                sectionId: section.id,
                              })
                            }
                          >
                            @
                          </button>
                          <button
                            title="Edit"
                            onClick={() =>
                              setModal({
                                open: true,
                                piece,
                                sectionId: section.id,
                              })
                            }
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            title="Duplicate"
                            onClick={() => duplicatePiece(section.id, piece)}
                          >
                            <Icon name="duplicate" size={16} />
                          </button>
                          <button
                            title="Delete set piece"
                            onClick={() => removePiece(section.id, piece.id)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="add-piece-row"
                  onClick={() =>
                    setModal({ open: true, sectionId: section.id })
                  }
                >
                  <Icon name="plus" size={16} /> Create custom piece
                </button>
              </article>
            ))}
          </div>
          <button
            className="add-section"
            onClick={() =>
              setCurrent({
                ...current,
                sections: [
                  ...current.sections,
                  { id: `s-${Date.now()}`, name: "New Section", pieces: [] },
                ],
              })
            }
          >
            <Icon name="plus" /> Add workout section
          </button>
        </section>
      </div>
    </div>
  )
}

function PieceModal({
  modal,
  close,
  pieces,
  setPieces,
  current,
  setCurrent,
  showNotice,
}: {
  modal: {
    open: boolean
    piece?: SetPiece
    sectionId?: string
    libraryOnly?: boolean
  }
  close: () => void
  pieces: SetPiece[]
  setPieces: (p: SetPiece[]) => void
  current: Workout
  setCurrent: React.Dispatch<React.SetStateAction<Workout>>
  showNotice: (m: string) => void
}) {
  const [draft, setDraft] = useState<SetPiece>(
    modal.piece
      ? JSON.parse(JSON.stringify(modal.piece))
      : {
          id: `p-${Date.now()}`,
          name: "",
          category: "Main Set",
          instructions: "",
          repeats: 1,
          distance: 100,
          rest: "",
          notes: "",
        },
  )
  const [saveToLibrary, setSaveToLibrary] = useState(
    modal.libraryOnly ?? !modal.piece,
  )
  const [selectedCircuitPiece, setSelectedCircuitPiece] = useState(
    pieces[0]?.id ?? "",
  )
  const isCircuit = draft.kind === "circuit"
  const circuitYardage = calculateCircuitYardage(draft)
  const draftYardage = calculatePieceYardage(draft)
  const save = () => {
    if (!draft.name.trim()) return
    if (isCircuit && !draft.children?.length) return
    const finalDraft: SetPiece = {
      ...draft,
      instructions: isCircuit
        ? `${draft.rounds ?? 1} rounds: ${draft.children?.map((piece) => piece.name).join(" → ")}`
        : draft.instructions,
      confidence: draftYardage.status === "resolved" ? "verified" : "missing",
      confidenceNote:
        draftYardage.status === "resolved" ? undefined : draftYardage.reason,
    }
    if (modal.piece && modal.sectionId) {
      setCurrent({
        ...current,
        sections: current.sections.map((section) =>
          section.id === modal.sectionId
            ? {
                ...section,
                pieces: section.pieces.map((piece) =>
                  piece.id === modal.piece?.id ? finalDraft : piece,
                ),
              }
            : section,
        ),
      })
    } else if (modal.sectionId) {
      setCurrent({
        ...current,
        sections: current.sections.map((section) =>
          section.id === modal.sectionId
            ? { ...section, pieces: [...section.pieces, copyPiece(finalDraft)] }
            : section,
        ),
      })
    }
    if (saveToLibrary || modal.libraryOnly) {
      const libraryPiece = {
        ...finalDraft,
        id:
          modal.libraryOnly && modal.piece ? modal.piece.id : `p-${Date.now()}`,
      }
      setPieces(
        modal.libraryOnly && modal.piece
          ? pieces.map((piece) =>
              piece.id === modal.piece?.id ? libraryPiece : piece,
            )
          : [libraryPiece, ...pieces],
      )
    }
    showNotice(modal.piece ? "Set piece updated" : "Set piece created")
    close()
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className={`modal ${isCircuit ? "circuit-modal" : ""}`}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">
              {modal.piece ? "EDIT SET PIECE" : "NEW SET PIECE"}
            </span>
            <h2>{modal.piece ? "Update this set" : "Create a custom set"}</h2>
          </div>
          <button onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="form-label wide">
            <span>Piece name</span>
            <Field
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
              placeholder="e.g. Threshold 100s"
            />
          </label>
          <div className="piece-type-switch wide">
            <button
              className={!isCircuit ? "active" : ""}
              onClick={() =>
                setDraft({
                  ...draft,
                  kind: "set",
                  children: undefined,
                  rounds: undefined,
                  restBetweenPieces: undefined,
                  restBetweenRounds: undefined,
                  restAfterFinalRound: undefined,
                  distance: draft.distance || 100,
                })
              }
            >
              Standard Set
            </button>
            <button
              className={isCircuit ? "active" : ""}
              onClick={() =>
                setDraft({
                  ...draft,
                  kind: "circuit",
                  repeats: 1,
                  distance: 0,
                  rounds: draft.rounds ?? 2,
                  children: draft.children ?? [],
                  unit: "yards",
                })
              }
            >
              Create Circuit
            </button>
          </div>
          {!isCircuit && (
            <label className="form-label wide">
              <span>
                Manual yardage override <em>Optional</em>
              </span>
              <div className="input-suffix">
                <Field
                  type="number"
                  value={draft.manualYardage ?? ""}
                  onChange={(manualYardage) =>
                    setDraft({
                      ...draft,
                      manualYardage:
                        manualYardage === ""
                          ? undefined
                          : Number(manualYardage),
                    })
                  }
                  placeholder="Use only when the set cannot be expressed as repeats × distance"
                />
                <span>yd</span>
              </div>
            </label>
          )}
          <label className="form-label wide">
            <span>Category</span>
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value as Category })
              }
            >
              {Object.keys(categoryColors).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          {isCircuit && (
            <div className="circuit-editor wide">
              <div className="circuit-config-grid">
                <label className="form-label">
                  <span>Number of rounds</span>
                  <Field
                    type="number"
                    value={draft.rounds ?? 1}
                    onChange={(rounds) =>
                      setDraft({
                        ...draft,
                        rounds: Math.max(1, Number(rounds)),
                      })
                    }
                  />
                </label>
                <label className="form-label">
                  <span>Rest between pieces</span>
                  <Field
                    value={draft.restBetweenPieces ?? ""}
                    onChange={(restBetweenPieces) =>
                      setDraft({ ...draft, restBetweenPieces })
                    }
                    placeholder="e.g. 10 seconds"
                  />
                </label>
                <label className="form-label">
                  <span>Rest between rounds</span>
                  <Field
                    value={draft.restBetweenRounds ?? ""}
                    onChange={(restBetweenRounds) =>
                      setDraft({ ...draft, restBetweenRounds })
                    }
                    placeholder="e.g. 30 seconds"
                  />
                </label>
                <label className="toggle-row compact">
                  <input
                    type="checkbox"
                    checked={draft.restAfterFinalRound ?? false}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        restAfterFinalRound: event.target.checked,
                      })
                    }
                  />
                  <span className="toggle" />
                  <span>
                    <strong>Rest after final round</strong>
                  </span>
                </label>
              </div>
              <div className="circuit-add-row">
                <select
                  value={selectedCircuitPiece}
                  onChange={(event) =>
                    setSelectedCircuitPiece(event.target.value)
                  }
                >
                  {pieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.name} · {pieceYardageLabel(piece)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  icon="plus"
                  onClick={() => {
                    const selected = pieces.find(
                      (piece) => piece.id === selectedCircuitPiece,
                    )
                    if (selected) {
                      setDraft({
                        ...draft,
                        children: [
                          ...(draft.children ?? []),
                          copyPiece(selected),
                        ],
                      })
                    }
                  }}
                >
                  Add from Library
                </Button>
                <Button
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      children: [
                        ...(draft.children ?? []),
                        {
                          id: `circuit-child-${Date.now()}`,
                          name: "New Circuit Piece",
                          category: draft.category,
                          instructions: "1 x 100",
                          repeats: 1,
                          distance: 100,
                          unit: "yards",
                        },
                      ],
                    })
                  }
                >
                  Custom Piece
                </Button>
              </div>
              <div className="circuit-piece-list">
                {!!draft.children?.length && (
                  <div className="circuit-list-header">
                    <span />
                    <span>Set piece</span>
                    <span>Reps</span>
                    <span />
                    <span>Distance</span>
                    <span>Yardage</span>
                    <span>Actions</span>
                  </div>
                )}
                {(draft.children ?? []).map((child, index) => (
                  <div className="circuit-piece-row" key={child.id}>
                    <span className="grip">
                      <Icon name="grip" />
                    </span>
                    <Field
                      value={child.name}
                      onChange={(name) =>
                        setDraft({
                          ...draft,
                          children: draft.children?.map((item) =>
                            item.id === child.id ? { ...item, name } : item,
                          ),
                        })
                      }
                    />
                    <Field
                      type="number"
                      value={child.repeats}
                      onChange={(repeats) =>
                        setDraft({
                          ...draft,
                          children: draft.children?.map((item) =>
                            item.id === child.id
                              ? {
                                  ...item,
                                  repeats: Math.max(1, Number(repeats)),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    <span>×</span>
                    <Field
                      type="number"
                      value={child.distance}
                      onChange={(distance) =>
                        setDraft({
                          ...draft,
                          children: draft.children?.map((item) =>
                            item.id === child.id
                              ? {
                                  ...item,
                                  distance: Math.max(0, Number(distance)),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    <strong>{pieceYardageLabel(child)}</strong>
                    <button
                      title="Move up"
                      onClick={() => {
                        if (index === 0) return
                        const children = [...(draft.children ?? [])]
                        ;[children[index - 1], children[index]] = [
                          children[index],
                          children[index - 1],
                        ]
                        setDraft({ ...draft, children })
                      }}
                    >
                      ↑
                    </button>
                    <button
                      title="Move down"
                      onClick={() => {
                        if (index === (draft.children?.length ?? 0) - 1) return
                        const children = [...(draft.children ?? [])]
                        ;[children[index], children[index + 1]] = [
                          children[index + 1],
                          children[index],
                        ]
                        setDraft({ ...draft, children })
                      }}
                    >
                      ↓
                    </button>
                    <button
                      title="Duplicate"
                      onClick={() => {
                        const children = [...(draft.children ?? [])]
                        children.splice(index + 1, 0, copyPiece(child))
                        setDraft({ ...draft, children })
                      }}
                    >
                      <Icon name="duplicate" size={15} />
                    </button>
                    <button
                      title="Save child as new library template"
                      onClick={() => {
                        setPieces([copyPiece(child), ...pieces])
                        showNotice(`${child.name} saved to the library`)
                      }}
                    >
                      <Icon name="library" size={15} />
                    </button>
                    <button
                      title="Remove"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          children: draft.children?.filter(
                            (item) => item.id !== child.id,
                          ),
                        })
                      }
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
                {!draft.children?.length && (
                  <div className="circuit-empty">
                    Add at least one library or custom piece to the circuit.
                  </div>
                )}
              </div>
              <div className="circuit-summary">
                <span>
                  <strong>{draft.rounds ?? 1}</strong> rounds
                </span>
                <span>
                  <strong>
                    {circuitYardage.perRound.status === "resolved"
                      ? formatYards(circuitYardage.perRound.yards)
                      : "Unresolved"}
                  </strong>{" "}
                  per round
                </span>
                <span>
                  <strong>
                    {circuitYardage.total.status === "resolved"
                      ? formatYards(circuitYardage.total.yards)
                      : "Unresolved"}
                  </strong>{" "}
                  total
                </span>
              </div>
            </div>
          )}
          {!isCircuit && (
            <label className="form-label wide">
              <span>Swim instructions</span>
              <textarea
                rows={5}
                value={draft.instructions}
                onChange={(event) =>
                  setDraft({ ...draft, instructions: event.target.value })
                }
                placeholder={
                  "10 × 100 Freestyle @ 1:30\nHold a strong, consistent pace"
                }
              />
              <small>Use multiple lines for complex sets.</small>
            </label>
          )}
          {isCircuit && (
            <label className="form-label wide">
              <span>
                Circuit notes <em>Optional</em>
              </span>
              <textarea
                rows={3}
                value={draft.notes ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                placeholder="Coaching focus or transition instructions"
              />
            </label>
          )}
          {!isCircuit && (
            <div className="form-grid">
              <label className="form-label">
                <span>Repeat count</span>
                <Field
                  type="number"
                  value={draft.repeats}
                  onChange={(repeats) =>
                    setDraft({
                      ...draft,
                      repeats: Math.max(1, Number(repeats)),
                    })
                  }
                />
              </label>
              <label className="form-label">
                <span>Distance per rep</span>
                <div className="input-suffix">
                  <Field
                    type="number"
                    value={draft.distance}
                    onChange={(distance) =>
                      setDraft({
                        ...draft,
                        distance: Math.max(0, Number(distance)),
                      })
                    }
                  />
                  <span>yd</span>
                </div>
              </label>
              <label className="form-label">
                <span>Distance unit</span>
                <select
                  value={draft.unit ?? "yards"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      unit: event.target
                        .value as "yards" | "meters" | "unknown",
                      children: draft.children?.map((piece) => ({
                        ...piece,
                        unit: event.target
                          .value as "yards" | "meters" | "unknown",
                      })),
                      betweenRounds: draft.betweenRounds?.map((piece) => ({
                        ...piece,
                        unit: event.target
                          .value as "yards" | "meters" | "unknown",
                      })),
                    })
                  }
                >
                  <option value="yards">Yards</option>
                  <option value="meters">Meters</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="form-label">
                <span>Rest / interval</span>
                <Field
                  value={draft.rest ?? ""}
                  onChange={(rest) => setDraft({ ...draft, rest })}
                  placeholder="@ 1:30"
                />
              </label>
            </div>
          )}
          {!isCircuit && (
            <label className="form-label wide">
              <span>
                Coach notes <em>Optional</em>
              </span>
              <Field
                value={draft.notes ?? ""}
                onChange={(notes) => setDraft({ ...draft, notes })}
                placeholder="Equipment, stroke, or coaching cues"
              />
            </label>
          )}
          <div className="calculation">
            <div>
              <span>Calculated yardage</span>
              <small>
                {draft.kind === "rounds" || draft.kind === "circuit"
                  ? `${draft.rounds} rounds with ${draft.children?.length ?? 0} nested set(s)`
                  : `${draft.repeats} repeats × ${draft.distance} ${draft.unit ?? "yards"}`}
              </small>
            </div>
            <strong>
              {draftYardage.status === "resolved"
                ? formatYards(draftYardage.yards)
                : "Unresolved"}
            </strong>
          </div>
          {!modal.libraryOnly && (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(event) => setSaveToLibrary(event.target.checked)}
              />
              <span className="toggle" />
              <span>
                <strong>Save to Set Piece Library</strong>
                <small>Reuse this set in future workouts</small>
              </span>
            </label>
          )}
        </div>
        <div className="modal-footer">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button icon="check" onClick={save}>
            {modal.piece ? "Save Changes" : "Create Piece"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function WorkoutsPage({
  workouts,
  total,
  average,
  openWorkout,
  setWorkouts,
  showNotice,
  startNew,
  beginImport,
}: {
  workouts: Workout[]
  total: number
  average: number
  openWorkout: (w: Workout, preview?: boolean) => void
  setWorkouts: (w: Workout[]) => void
  showNotice: (m: string) => void
  startNew: () => void
  beginImport: () => void
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("modified")
  const displayed = useMemo(
    () =>
      [...workouts]
        .filter((workout) =>
          workout.title.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title)
            : b.modified.localeCompare(a.modified),
        ),
    [workouts, query, sort],
  )
  const duplicate = (workout: Workout) => {
    setWorkouts([
      {
        ...JSON.parse(JSON.stringify(workout)),
        id: `w-${Date.now()}`,
        title: `${workout.title} Copy`,
        created: today(),
        modified: today(),
      },
      ...workouts,
    ])
    showNotice("Workout duplicated")
  }
  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">WORKOUT MANAGEMENT</span>
          <h1>My Workouts</h1>
          <p>Browse, track, and manage your saved practices.</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" icon="upload" onClick={beginImport}>
            Import Workout
          </Button>
          <Button icon="plus" onClick={startNew}>
            New Workout
          </Button>
        </div>
      </section>
      <section className="stats-grid compact">
        <StatCard
          label="Saved workouts"
          value={`${workouts.length}`}
          detail="In your library"
        />
        <StatCard
          label="Combined yardage"
          value={formatYards(total)}
          detail="All saved workouts"
        />
        <StatCard
          label="Average workout"
          value={formatYards(average)}
          detail="Per workout"
        />
      </section>
      <section className="panel table-panel">
        <div className="table-tools">
          <label className="search-box">
            <Icon name="search" />
            <Field
              value={query}
              onChange={setQuery}
              placeholder="Search workouts..."
            />
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="modified">Recently modified</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="workout-table">
          <div className="table-row table-header">
            <span>Workout</span>
            <span>Created</span>
            <span>Last modified</span>
            <span>Total yardage</span>
            <span>Pieces</span>
            <span>Actions</span>
          </div>
          {displayed.map((workout) => (
            <div
              className="table-row"
              key={workout.id}
              onClick={() => openWorkout(workout)}
            >
              <span className="table-title">
                <span className="file-icon">
                  <Icon name="workouts" />
                </span>
                <span>
                  <strong>{workout.title}</strong>
                  <small>{workout.description || "No description"}</small>
                </span>
              </span>
              <span>{workout.created}</span>
              <span>{workout.modified}</span>
              <span className="yardage-hover">
                <strong>{formatYards(workoutYardage(workout))}</strong>
                <div className="yardage-tooltip">
                  <span className="eyebrow">WORKOUT BREAKDOWN</span>
                  <strong>{formatYards(workoutYardage(workout))} total</strong>
                  {workout.sections.map((section) => (
                    <span key={section.id}>
                      <i>{section.name}</i>
                      <b>{formatYards(sectionYardage(section))}</b>
                    </span>
                  ))}
                  <small>{pieceCount(workout)} total set pieces</small>
                </div>
              </span>
              <span>{pieceCount(workout)}</span>
              <span
                className="row-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  title="Preview PDF"
                  onClick={() => openWorkout(workout, true)}
                >
                  <Icon name="print" />
                </button>
                <button title="Duplicate" onClick={() => duplicate(workout)}>
                  <Icon name="duplicate" />
                </button>
                <button
                  title="Delete"
                  onClick={() => {
                    setWorkouts(
                      workouts.filter((item) => item.id !== workout.id),
                    )
                    showNotice("Workout deleted")
                  }}
                >
                  <Icon name="trash" />
                </button>
              </span>
            </div>
          ))}
        </div>
        {displayed.length === 0 && (
          <div className="empty-state workout-empty">
            <span>
              <Icon name="workouts" size={28} />
            </span>
            <h2>No saved workouts yet</h2>
            <p>
              Create a workout from scratch or bring in an existing document.
            </p>
            <div className="heading-actions">
              <Button variant="secondary" icon="upload" onClick={beginImport}>
                Import Workout
              </Button>
              <Button icon="plus" onClick={startNew}>
                Create Workout
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function LibraryPage({
  pieces,
  setPieces,
  setModal,
  startNew,
  showNotice,
}: {
  pieces: SetPiece[]
  setPieces: (p: SetPiece[]) => void
  setModal: React.Dispatch<React.SetStateAction<{
    open: boolean
    piece?: SetPiece
    sectionId?: string
    libraryOnly?: boolean
  }>>
  startNew: () => void
  showNotice: (m: string) => void
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const filtered = pieces.filter(
    (piece) =>
      (category === "All" || piece.category === category) &&
      piece.name.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <span className="eyebrow">REUSABLE COMPONENTS</span>
          <h1>Set Piece Library</h1>
          <p>Build once, reuse across every practice.</p>
        </div>
        <Button
          icon="plus"
          onClick={() => setModal({ open: true, libraryOnly: true })}
        >
          Create Set Piece
        </Button>
      </section>
      <div className="library-tools">
        <label className="search-box">
          <Icon name="search" />
          <Field
            value={query}
            onChange={setQuery}
            placeholder="Search your library..."
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option>All</option>
          {Object.keys(categoryColors).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select>
          <option>Recently used</option>
          <option>Name A–Z</option>
          <option>Yardage</option>
        </select>
      </div>
      {filtered.length ? (
        <div className="library-grid">
          {filtered.map((piece) => (
            <article className="library-card" key={piece.id}>
              <div className="library-card-head">
                <Badge category={piece.category} />
                <button>
                  <Icon name="more" />
                </button>
              </div>
              <h3>{piece.name}</h3>
              <p>{piece.instructions}</p>
              <div className="set-notation">
                <span>
                  {piece.repeats} × {piece.distance}
                </span>
                {piece.rest && <span>{piece.rest}</span>}
                <strong>{formatYards(yardage(piece))}</strong>
              </div>
              <div className="library-card-actions">
                <Button variant="secondary" onClick={startNew}>
                  Use in Workout
                </Button>
                <button
                  title="Edit"
                  onClick={() =>
                    setModal({ open: true, piece, libraryOnly: true })
                  }
                >
                  <Icon name="edit" />
                </button>
                <button
                  title="Duplicate"
                  onClick={() => {
                    setPieces([
                      {
                        ...piece,
                        id: `p-${Date.now()}`,
                        name: `${piece.name} Copy`,
                      },
                      ...pieces,
                    ])
                    showNotice("Set piece duplicated")
                  }}
                >
                  <Icon name="duplicate" />
                </button>
                <button
                  title="Delete"
                  onClick={() => {
                    setPieces(pieces.filter((item) => item.id !== piece.id))
                    showNotice("Set piece deleted")
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>
            <Icon name="search" size={28} />
          </span>
          <h2>No set pieces found</h2>
          <p>Try a different search or create a new reusable piece.</p>
          <Button
            icon="plus"
            onClick={() => setModal({ open: true, libraryOnly: true })}
          >
            Create Set Piece
          </Button>
        </div>
      )}
    </div>
  )
}

function AccountPage({ showNotice }: { showNotice: (m: string) => void }) {
  return (
    <div className="page-content account-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1>Account Settings</h1>
          <p>Manage your coach profile and workout preferences.</p>
        </div>
      </section>
      <section className="settings-layout">
        <nav className="settings-nav">
          <button className="active">Profile</button>
          <button>Workout defaults</button>
          <button>Export preferences</button>
          <button>Notifications</button>
        </nav>
        <div className="settings-content">
          <div className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <h2>Coach profile</h2>
                <p>This information appears on exported workouts.</p>
              </div>
            </div>
            <div className="profile-row">
              <div className="avatar avatar-large">MC</div>
              <div>
                <Button variant="secondary">Change photo</Button>
                <p>JPG or PNG. Maximum 2 MB.</p>
              </div>
            </div>
            <div className="settings-form">
              <label className="form-label">
                <span>First name</span>
                <Field value="Marcus" onChange={() => {}} />
              </label>
              <label className="form-label">
                <span>Last name</span>
                <Field value="Chen" onChange={() => {}} />
              </label>
              <label className="form-label wide">
                <span>Email address</span>
                <Field value="marcus@northshoreswim.com" onChange={() => {}} />
              </label>
              <label className="form-label wide">
                <span>Team / organization</span>
                <Field value="North Shore Aquatics" onChange={() => {}} />
              </label>
            </div>
            <div className="settings-save">
              <Button onClick={() => showNotice("Profile settings saved")}>
                Save Changes
              </Button>
            </div>
          </div>
          <div className="panel signout-panel">
            <div>
              <h3>Signed in as Marcus Chen</h3>
              <p>Your workouts are saved to this coach account.</p>
            </div>
            <Button variant="danger" icon="logout">
              Sign Out
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ImportWorkflow({
  step,
  setStep,
  scenario,
  setScenario,
  draft,
  setDraft,
  setModal,
  pieces,
  setPieces,
  workouts,
  setWorkouts,
  savedImport,
  setSavedImport,
  savedLibraryCount,
  setSavedLibraryCount,
  openWorkout,
  navigate,
}: {
  step: ImportStep
  setStep: (step: ImportStep) => void
  scenario: ImportSource | null
  setScenario: (scenario: ImportSource | null) => void
  draft: Workout
  setDraft: React.Dispatch<React.SetStateAction<Workout>>
  setModal: React.Dispatch<React.SetStateAction<{
    open: boolean
    piece?: SetPiece
    sectionId?: string
    libraryOnly?: boolean
  }>>
  pieces: SetPiece[]
  setPieces: (pieces: SetPiece[]) => void
  workouts: Workout[]
  setWorkouts: (workouts: Workout[]) => void
  savedImport: Workout | null
  setSavedImport: (workout: Workout | null) => void
  savedLibraryCount: number
  setSavedLibraryCount: (count: number) => void
  openWorkout: (workout: Workout, preview?: boolean) => void
  navigate: (page: Page) => void
}) {
  const [processingStage, setProcessingStage] = useState(0)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [uploadError, setUploadError] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [saveTemplates, setSaveTemplates] = useState(true)

  useEffect(() => {
    if (step !== "processing") return
    setProcessingStage(0)
    const timers = [1, 2, 3, 4].map((stage, index) =>
      window.setTimeout(() => setProcessingStage(stage), 260 * (index + 1)),
    )
    const finish = window.setTimeout(() => setStep("review"), 1500)
    return () => {
      timers.forEach(window.clearTimeout)
      window.clearTimeout(finish)
    }
  }, [step, setStep])

  useEffect(() => {
    if (step === "save" && selectedTemplates.length === 0) {
      setSelectedTemplates(
        draft.sections.flatMap((section) =>
          section.pieces
            .filter((piece) => piece.confidence !== "missing")
            .map((piece) => piece.id),
        ),
      )
    }
  }, [step, draft, selectedTemplates.length])

  const handleFile = async (file?: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setScenario(null)
      setUploadError(
        "Upload failed because this file is larger than 10 MB. Choose a smaller document.",
      )
      return
    }
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (extension !== "docx") {
      setScenario(null)
      setUploadError(
        "Only .docx files are currently supported. PDF support is not yet available.",
      )
      return
    }
    setIsExtracting(true)
    setUploadError("")
    try {
      const extracted = await extractDocx(file)
      setScenario({
        filename: extracted.filename,
        fileType: "DOCX",
        source: extracted.text,
        warnings: extracted.warnings,
      })
    } catch (error) {
      setScenario(null)
      setUploadError(
        error instanceof Error
          ? error.message
          : "The document could not be read.",
      )
    } finally {
      setIsExtracting(false)
    }
  }

  const startConversion = () => {
    if (!scenario) return
    const parsed = parseWorkoutText(scenario.source, {
      filename: scenario.filename,
    })
    setDraft(parsed.workout)
    setStep("processing")
  }

  const convertPastedText = () => {
    if (!pasteText.trim()) return
    const pasted: ImportSource = {
      filename: "Pasted workout text",
      fileType: "TEXT",
      source: pasteText,
      warnings: [],
    }
    setScenario(pasted)
    setDraft(parseWorkoutText(pasteText).workout)
    setPasteOpen(false)
    setStep("processing")
  }

  const updateSection = (sectionId: string, changes: Partial<WorkoutSection>) =>
    setDraft({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId ? { ...section, ...changes } : section,
      ),
    })

  const removePiece = (sectionId: string, pieceId: string) =>
    setDraft({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              pieces: section.pieces.filter((piece) => piece.id !== pieceId),
            }
          : section,
      ),
    })

  const duplicatePiece = (sectionId: string, piece: SetPiece) =>
    setDraft({
      ...draft,
      sections: draft.sections.map((section) =>
        section.id === sectionId
          ? { ...section, pieces: [...section.pieces, copyPiece(piece)] }
          : section,
      ),
    })

  const movePiece = (sectionId: string, index: number, direction: -1 | 1) =>
    setDraft({
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id !== sectionId) return section
        const next = [...section.pieces]
        const target = index + direction
        if (target < 0 || target >= next.length) return section
        ;[next[index], next[target]] = [next[target], next[index]]
        return { ...section, pieces: next }
      }),
    })

  const moveToSection = (
    piece: SetPiece,
    fromSectionId: string,
    targetSectionId: string,
  ) =>
    setDraft({
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id === fromSectionId) {
          return {
            ...section,
            pieces: section.pieces.filter((item) => item.id !== piece.id),
          }
        }
        if (section.id === targetSectionId) {
          return { ...section, pieces: [...section.pieces, piece] }
        }
        return section
      }),
    })

  const unresolved = draft.sections
    .flatMap((section) => section.pieces)
    .filter((piece) => piece.confidence !== "verified")
  const incomplete = calculateWorkoutYardage(draft).status === "unresolved"

  const saveImportedWorkout = () => {
    if (calculateWorkoutYardage(draft).status === "unresolved") {
      setStep("review")
      return
    }
    const approved: Workout = {
      ...JSON.parse(JSON.stringify(draft)),
      id: `w-import-${Date.now()}`,
      created: draft.created || today(),
      modified: today(),
      description:
        draft.description ||
        `Imported from ${scenario?.filename ?? "workout text"}`,
    }
    const selected = saveTemplates
      ? approved.sections
          .flatMap((section) => section.pieces)
          .filter((piece) => selectedTemplates.includes(piece.id))
          .map((piece) => {
            const template: SetPiece = JSON.parse(JSON.stringify(piece))
            return {
              ...template,
              id: `p-import-${Date.now()}-${Math.random()}`,
            }
          })
      : []
    setWorkouts([approved, ...workouts])
    if (selected.length) setPieces([...selected, ...pieces])
    setSavedImport(approved)
    setSavedLibraryCount(selected.length)
    setStep("success")
  }

  if (step === "upload") {
    return (
      <div className="import-shell">
        <div className="import-heading">
          <span className="eyebrow">IMPORT WORKOUT</span>
          <h1>Import a Workout</h1>
          <p>
            Bring an existing swim workout into your library without rebuilding
            it from scratch.
          </p>
        </div>
        <div className="import-card">
          <label
            className={`upload-zone ${uploadError ? "upload-error" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              handleFile(event.dataTransfer.files?.[0])
            }}
          >
            <input
              type="file"
              accept=".docx"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <span className="upload-icon">
              <Icon name="upload" size={28} />
            </span>
            <h2>
              {isExtracting
                ? "Reading document..."
                : "Drag and drop your workout here"}
            </h2>
            <p>
              {isExtracting
                ? "Mammoth is extracting the Word document text."
                : "or select a document from your computer"}
            </p>
            <span className="browse-button">Browse Files</span>
            <small>Supported format: .docx · Maximum 10 MB</small>
          </label>
          {uploadError && (
            <div className="import-error">
              <Icon name="alert" size={17} />
              <span>{uploadError}</span>
            </div>
          )}
          {scenario && (
            <>
              <div className="selected-file">
                <span className="file-type">{scenario.fileType}</span>
                <div>
                  <strong>{scenario.filename}</strong>
                  <span>
                    Text extracted · {scenario.source.split("\n").length} lines
                  </span>
                </div>
                <button onClick={() => setScenario(null)}>Remove File</button>
              </div>
              {scenario.warnings.length > 0 && (
                <div className="document-warnings">
                  <Icon name="alert" size={16} />
                  <span>
                    Mammoth reported {scenario.warnings.length} document warning
                    {scenario.warnings.length === 1 ? "" : "s"}. Review the
                    extracted text carefully.
                  </span>
                </div>
              )}
            </>
          )}
          <div className="import-divider">
            <span>or</span>
          </div>
          <button className="paste-option" onClick={() => setPasteOpen(true)}>
            <span>
              <Icon name="file" />
            </span>
            <div>
              <strong>Paste Workout Text Instead</strong>
              <small>Copy instructions from an email, note, or document.</small>
            </div>
            <Icon name="chevron" />
          </button>
          <div className="import-actions">
            <Button variant="ghost" onClick={() => navigate("dashboard")}>
              Cancel
            </Button>
            <Button
              icon="chevron"
              onClick={startConversion}
              className={!scenario || isExtracting ? "button-disabled" : ""}
            >
              Continue to Import
            </Button>
          </div>
        </div>
        {pasteOpen && (
          <div className="modal-backdrop">
            <div className="paste-modal">
              <div className="modal-header">
                <div>
                  <span className="eyebrow">TEXT IMPORT</span>
                  <h2>Paste Workout Text</h2>
                </div>
                <button onClick={() => setPasteOpen(false)}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="paste-body">
                <p>
                  Paste a complete workout below. The same rule-based parser
                  used for Word documents will convert the text.
                </p>
                <textarea
                  rows={14}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={
                    "Tuesday Practice\n\nWarmup:\n400 yd easy swim\n\nMain Set:\n8 x 100 yd freestyle @ 1:30\n\nCooldown:\n200 yd easy"
                  }
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setPasteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={convertPastedText}
                  className={!pasteText.trim() ? "button-disabled" : ""}
                >
                  Convert Text
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (step === "processing") {
    const stages = [
      "Reading document",
      "Identifying workout sections",
      "Extracting swim instructions",
      "Calculating yardage",
      "Preparing workout preview",
    ]
    return (
      <div className="processing-page">
        <div className="processing-card">
          <span className="processing-document">
            <Icon name="file" size={32} />
            <i />
          </span>
          <span className="eyebrow">CONVERTING {scenario?.filename}</span>
          <h1>Reading Your Workout</h1>
          <p>
            We’re organizing the document into editable swim sets and sections.
          </p>
          <div className="processing-progress">
            <span style={{ width: `${(processingStage + 1) * 20}%` }} />
          </div>
          <div className="processing-stages">
            {stages.map((label, index) => (
              <div
                key={label}
                className={
                  index < processingStage
                    ? "complete"
                    : index === processingStage
                      ? "active"
                      : ""
                }
              >
                <span>
                  {index < processingStage ? (
                    <Icon name="check" size={13} />
                  ) : (
                    index + 1
                  )}
                </span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <small>Conversion is deterministic and rule-based.</small>
        </div>
      </div>
    )
  }

  if (step === "review") {
    return (
      <div className="import-review-page">
        <div className="review-topbar">
          <div>
            <span className="eyebrow">IMPORT WORKOUT · STEP 3 OF 4</span>
            <h1>Review Imported Workout</h1>
            <p>Check the converted workout before saving.</p>
          </div>
          <div className="heading-actions">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Start Over
            </Button>
            <Button
              onClick={() => setStep("save")}
              className={incomplete ? "button-disabled" : ""}
            >
              Continue to Save
            </Button>
          </div>
        </div>
        <div className="review-layout">
          {scenario && (
            <ImportSourcePreview
              filename={scenario.filename}
              fileType={scenario.fileType}
              source={scenario.source}
              alertIcon={<Icon name="alert" size={16} />}
            />
          )}
          <section className="converted-column">
            <div className="converted-summary">
              <div className="import-title-fields">
                <label>
                  <span>Workout title</span>
                  <Field
                    value={draft.title}
                    onChange={(title) => setDraft({ ...draft, title })}
                  />
                </label>
                <label>
                  <span>Workout date</span>
                  <Field
                    type="date"
                    value={draft.created}
                    onChange={(created) => setDraft({ ...draft, created })}
                  />
                </label>
              </div>
              <div className="import-metrics">
                <div className={incomplete ? "incomplete" : ""}>
                  <span>Total yardage</span>
                  <strong>{workoutYardage(draft).toLocaleString()} yd</strong>
                  {incomplete && <small>Incomplete total</small>}
                </div>
                <div>
                  <span>Sections</span>
                  <strong>{draft.sections.length}</strong>
                </div>
                <div>
                  <span>Pieces</span>
                  <strong>{pieceCount(draft)}</strong>
                </div>
                <div className={unresolved.length ? "review-count" : ""}>
                  <span>Needs review</span>
                  <strong>{unresolved.length}</strong>
                </div>
              </div>
            </div>
            {unresolved.length > 0 && (
              <div className="review-alert">
                <Icon name="alert" />
                <div>
                  <strong>
                    {unresolved.length} item{unresolved.length > 1 ? "s" : ""}{" "}
                    need your attention
                  </strong>
                  <span>
                    Open flagged pieces to confirm distances or instructions.
                  </span>
                </div>
              </div>
            )}
            <div className="import-sections">
              {draft.sections.map((section) => (
                <article className="import-section" key={section.id}>
                  <header>
                    <div>
                      <input
                        value={section.name}
                        onChange={(event) =>
                          updateSection(section.id, {
                            name: event.target.value,
                          })
                        }
                      />
                      <span>
                        {section.pieces.length} pieces ·{" "}
                        {formatYards(sectionYardage(section))}
                      </span>
                    </div>
                    {section.pieces.length === 0 && (
                      <button
                        onClick={() =>
                          setDraft({
                            ...draft,
                            sections: draft.sections.filter(
                              (item) => item.id !== section.id,
                            ),
                          })
                        }
                      >
                        Remove section
                      </button>
                    )}
                  </header>
                  <div>
                    {section.pieces.map((piece, index) => (
                      <div
                        className={`import-piece confidence-${piece.confidence ?? "verified"}`}
                        key={piece.id}
                      >
                        <span className="grip">
                          <Icon name="grip" />
                        </span>
                        <div className="import-piece-main">
                          <div className="import-piece-title">
                            <strong>{piece.name}</strong>
                            <Badge category={piece.category} />
                            <button
                              className={`confidence-pill ${piece.confidence ?? "verified"}`}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  piece,
                                  sectionId: section.id,
                                })
                              }
                            >
                              {piece.confidence === "review"
                                ? "Needs Review"
                                : piece.confidence === "missing"
                                  ? "Missing Information"
                                  : "Verified"}
                            </button>
                          </div>
                          <p>{piece.instructions}</p>
                          <div className="import-piece-meta">
                            {piece.kind === "rounds" ? (
                              <span>
                                {piece.rounds} rounds ·{" "}
                                {piece.children?.length ?? 0} nested set
                                {(piece.children?.length ?? 0) === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span>
                                {piece.repeats} × {piece.distance}{" "}
                                {piece.unit === "yards"
                                  ? "yd"
                                  : piece.unit === "meters"
                                    ? "m"
                                    : "unit unknown"}
                              </span>
                            )}
                            {piece.rest && <span>{piece.rest}</span>}
                            {piece.equipment?.map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                          </div>
                          <NestedSetSummary piece={piece} />
                          {piece.confidenceNote && (
                            <small>{piece.confidenceNote}</small>
                          )}
                        </div>
                        <strong className="import-piece-yards">
                          {pieceYardageLabel(piece)}
                        </strong>
                        <div className="import-piece-controls">
                          <select
                            value={section.id}
                            title="Move to another section"
                            onChange={(event) =>
                              moveToSection(
                                piece,
                                section.id,
                                event.target.value,
                              )
                            }
                          >
                            {draft.sections.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                          <button
                            title="Move up"
                            onClick={() => movePiece(section.id, index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            title="Move down"
                            onClick={() => movePiece(section.id, index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            title="Edit"
                            onClick={() =>
                              setModal({
                                open: true,
                                piece,
                                sectionId: section.id,
                              })
                            }
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            title="Duplicate"
                            onClick={() => duplicatePiece(section.id, piece)}
                          >
                            <Icon name="duplicate" size={16} />
                          </button>
                          <button
                            title="Remove"
                            onClick={() => removePiece(section.id, piece.id)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="add-piece-row"
                    onClick={() =>
                      setModal({ open: true, sectionId: section.id })
                    }
                  >
                    <Icon name="plus" size={16} /> Add missed piece
                  </button>
                </article>
              ))}
              <button
                className="add-section"
                onClick={() =>
                  setDraft({
                    ...draft,
                    sections: [
                      ...draft.sections,
                      {
                        id: `import-section-${Date.now()}`,
                        name: "New Section",
                        pieces: [],
                      },
                    ],
                  })
                }
              >
                <Icon name="plus" /> Add Section
              </button>
            </div>
            <div className="review-footer">
              <span>
                {incomplete
                  ? "Resolve missing yardage before relying on the total."
                  : "All calculated yardage is included in the total."}
              </span>
              <Button
                onClick={() => setStep("save")}
                className={incomplete ? "button-disabled" : ""}
              >
                Continue to Save
              </Button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  if (step === "save") {
    const allPieces = draft.sections.flatMap((section) => section.pieces)
    const allSelected =
      allPieces.length > 0 && selectedTemplates.length === allPieces.length
    return (
      <div className="save-import-page">
        <div className="import-heading">
          <span className="eyebrow">IMPORT WORKOUT · STEP 4 OF 4</span>
          <h1>Save Imported Workout</h1>
          <p>Choose what to keep in your personal workout library.</p>
        </div>
        <div className="save-import-layout">
          <section className="panel save-details">
            <div className="panel-heading">
              <div>
                <h2>Workout details</h2>
                <p>These details can be changed later in the builder.</p>
              </div>
            </div>
            <div className="save-form">
              <label className="form-label">
                <span>Workout name</span>
                <Field
                  value={draft.title}
                  onChange={(title) => setDraft({ ...draft, title })}
                />
              </label>
              <label className="form-label">
                <span>Date</span>
                <Field
                  type="date"
                  value={draft.created}
                  onChange={(created) => setDraft({ ...draft, created })}
                />
              </label>
              <label className="form-label wide">
                <span>
                  Notes <em>Optional</em>
                </span>
                <textarea
                  rows={4}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="save-summary-strip">
              <span>
                <strong>{formatYards(workoutYardage(draft))}</strong>
                Total yardage
              </span>
              <span>
                <strong>{draft.sections.length}</strong>
                Sections
              </span>
              <span>
                <strong>{pieceCount(draft)}</strong>
                Pieces
              </span>
            </div>
          </section>
          <section className="panel save-options">
            <div className="panel-heading">
              <div>
                <h2>Save options</h2>
                <p>
                  The workout always keeps independent copies of its pieces.
                </p>
              </div>
            </div>
            <label
              className={`save-option ${!saveTemplates ? "selected" : ""}`}
            >
              <input
                type="radio"
                checked={!saveTemplates}
                onChange={() => setSaveTemplates(false)}
              />
              <span />
              <div>
                <strong>Save Workout</strong>
                <p>Save the complete converted workout to My Workouts.</p>
              </div>
            </label>
            <label className={`save-option ${saveTemplates ? "selected" : ""}`}>
              <input
                type="radio"
                checked={saveTemplates}
                onChange={() => setSaveTemplates(true)}
              />
              <span />
              <div>
                <strong>Save Workout and Reusable Pieces</strong>
                <p>
                  Also add selected pieces as independent templates in your Set
                  Piece Library.
                </p>
              </div>
            </label>
            {saveTemplates && (
              <div className="template-checklist">
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() =>
                      setSelectedTemplates(
                        allSelected ? [] : allPieces.map((piece) => piece.id),
                      )
                    }
                  />
                  <span>Select all pieces</span>
                  <strong>
                    {selectedTemplates.length} of {allPieces.length} selected
                  </strong>
                </label>
                {draft.sections.map((section) => (
                  <div className="template-group" key={section.id}>
                    <span>{section.name}</span>
                    {section.pieces.map((piece) => (
                      <label key={piece.id}>
                        <input
                          type="checkbox"
                          checked={selectedTemplates.includes(piece.id)}
                          onChange={() =>
                            setSelectedTemplates(
                              selectedTemplates.includes(piece.id)
                                ? selectedTemplates.filter(
                                    (id) => id !== piece.id,
                                  )
                                : [...selectedTemplates, piece.id],
                            )
                          }
                        />
                        <div>
                          <strong>{piece.name}</strong>
                          <span>
                            {piece.instructions} · {formatYards(yardage(piece))}
                          </span>
                        </div>
                        <Badge category={piece.category} />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="save-import-actions">
          <Button variant="ghost" onClick={() => setStep("review")}>
            Back to Review
          </Button>
          <Button
            icon="check"
            onClick={saveImportedWorkout}
            className={incomplete ? "button-disabled" : ""}
          >
            Save Imported Workout
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="import-success-page">
      <div className="success-card">
        <span className="success-icon">
          <Icon name="check" size={30} />
        </span>
        <span className="eyebrow">IMPORT COMPLETE</span>
        <h1>Workout Imported Successfully</h1>
        <p>“{savedImport?.title}” has been added to My Workouts.</p>
        <div className="success-workout">
          <div>
            <span className="file-icon">
              <Icon name="workouts" />
            </span>
            <div>
              <strong>{savedImport?.title}</strong>
              <span>Ready to edit, reuse, or export</span>
            </div>
          </div>
          <div className="success-stats">
            <span>
              <strong>
                {savedImport
                  ? formatYards(workoutYardage(savedImport))
                  : "0 yd"}
              </strong>
              Total yardage
            </span>
            <span>
              <strong>{savedImport?.sections.length ?? 0}</strong>
              Sections
            </span>
            <span>
              <strong>{savedImport ? pieceCount(savedImport) : 0}</strong>
              Pieces
            </span>
            <span>
              <strong>{savedLibraryCount}</strong>
              Library pieces
            </span>
          </div>
        </div>
        <div className="success-actions">
          <Button
            variant="secondary"
            onClick={() => savedImport && openWorkout(savedImport)}
          >
            Open Workout
          </Button>
          <Button variant="secondary" onClick={() => navigate("workouts")}>
            View My Workouts
          </Button>
          <Button
            icon="print"
            onClick={() => savedImport && openWorkout(savedImport, true)}
          >
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  )
}

function Preview({
  workout,
  navigate,
  showNotice,
}: {
  workout: Workout
  navigate: (p: Page) => void
  showNotice: (m: string) => void
}) {
  const [intervalDisplay, setIntervalDisplay] =
    useState<"all" | "selected" | "compact" | "none">("compact")
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0)
  const print = () => {
    showNotice("PDF export ready")
    window.setTimeout(() => window.print(), 300)
  }
  return (
    <div className="preview-page">
      <div className="preview-toolbar">
        <Button
          variant="ghost"
          icon="arrow"
          onClick={() => navigate("builder")}
        >
          Back to Editor
        </Button>
        <div>
          <span>Print preview</span>
          <small>US Letter · Portrait</small>
          <div className="pdf-interval-options">
            <select
              value={intervalDisplay}
              onChange={(event) =>
                setIntervalDisplay(
                  event.target.value as "all" | "selected" | "compact" | "none",
                )
              }
            >
              <option value="all">All interval groups</option>
              <option value="selected">Selected group only</option>
              <option value="compact">Compact interval table</option>
              <option value="none">Hide adaptive intervals</option>
            </select>
            {intervalDisplay === "selected" && (
              <select
                value={selectedGroupIndex}
                onChange={(event) =>
                  setSelectedGroupIndex(Number(event.target.value))
                }
              >
                <option value={0}>Faster / Group 1</option>
                <option value={1}>Middle / Group 2</option>
                <option value={2}>Slower / Group 3</option>
                <option value={3}>Group 4</option>
                <option value={4}>Group 5</option>
              </select>
            )}
          </div>
        </div>
        <Button icon="download" onClick={print}>
          Export PDF
        </Button>
      </div>
      <div className="paper-wrap">
        <article className="paper">
          <header className="paper-header">
            <div className="paper-brand">
              <span className="brand-mark dark">
                <span />
                <span />
                <span />
              </span>
              <span className="paper-brand-copy">
                <strong>LANELINK</strong>
                <small>CONNECT. CREATE. COACH.</small>
              </span>
            </div>
            <span>North Shore Aquatics</span>
          </header>
          <div className="paper-title">
            <div>
              <span>SWIM PRACTICE · {workout.modified}</span>
              <h1>{workout.title}</h1>
              <p>{workout.description}</p>
            </div>
            <div>
              <span>Total yardage</span>
              <strong>{workoutYardage(workout).toLocaleString()}</strong>
              <small>YARDS</small>
            </div>
          </div>
          <div className="paper-sections">
            {workout.sections.map((section, sectionIndex) => (
              <section key={section.id}>
                <header>
                  <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                  <h2>{section.name}</h2>
                  <strong>{formatYards(sectionYardage(section))}</strong>
                </header>
                {section.pieces.length ? (
                  section.pieces.map((piece, index) => (
                    <div className="paper-piece" key={piece.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{piece.name}</strong>
                        <p>{piece.instructions}</p>
                        {piece.kind === "circuit" && (
                          <div className="paper-circuit">
                            <strong>
                              {piece.rounds} rounds ·{" "}
                              {formatYards(
                                piece.children?.reduce(
                                  (sum, child) => sum + yardage(child),
                                  0,
                                ) ?? 0,
                              )}{" "}
                              per round
                            </strong>
                            {circuitPrintLines(
                              piece,
                              intervalDisplay,
                              selectedGroupIndex,
                            ).map((line) => (
                              <span key={line}>{line}</span>
                            ))}
                            {piece.restBetweenPieces && (
                              <span>
                                Between pieces: {piece.restBetweenPieces}
                              </span>
                            )}
                            {piece.restBetweenRounds && (
                              <span>
                                Between rounds: {piece.restBetweenRounds}
                                {piece.restAfterFinalRound
                                  ? " (including final round)"
                                  : ""}
                              </span>
                            )}
                          </div>
                        )}
                        {piece.rest && <small>Interval: {piece.rest}</small>}
                        {intervalDisplay !== "none" &&
                          piece.adaptiveInterval?.recommendation?.accepted && (
                            <div
                              className={`paper-intervals ${intervalDisplay}`}
                            >
                              <strong>Adaptive send-offs</strong>
                              {intervalGroupsForPrint(
                                piece,
                                intervalDisplay,
                                selectedGroupIndex,
                              ).map((group) => (
                                <span key={group.id}>
                                  {group.name}:{" "}
                                  {Math.floor(group.sendOffSeconds / 60)}:
                                  {String(
                                    Math.round(group.sendOffSeconds % 60),
                                  ).padStart(2, "0")}
                                  {intervalDisplay === "all" &&
                                    ` · ${group.swimmerIds.length} swimmers · ${Math.round(group.restRange[0])}-${Math.round(group.restRange[1])} sec rest`}
                                </span>
                              ))}
                            </div>
                          )}
                        {piece.notes && <em>Coach note: {piece.notes}</em>}
                      </div>
                      <strong>{formatYards(yardage(piece))}</strong>
                    </div>
                  ))
                ) : (
                  <div className="paper-empty">No pieces in this section</div>
                )}
              </section>
            ))}
          </div>
          <footer className="paper-footer">
            <span>Coach Marcus Chen · North Shore Aquatics</span>
            <span>Generated with LaneLink</span>
          </footer>
        </article>
      </div>
    </div>
  )
}

export default App
