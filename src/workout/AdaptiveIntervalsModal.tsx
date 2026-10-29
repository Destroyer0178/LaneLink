import { useMemo, useState } from "react"
import {
  formatInterval,
  GOAL_RULES,
  isRecommendationStale,
  parsePerformanceTime,
  recommendIntervals,
} from "./intervals"
import type {
  AdaptiveIntervalConfig,
  CourseType,
  IntervalRecommendation,
  PerformanceRecord,
  SetPiece,
  Stroke,
  TrainingGoal,
} from "./types"

type Props = {
  piece: SetPiece
  records: PerformanceRecord[]
  onRecordsChange: (records: PerformanceRecord[]) => void
  onSave: (piece: SetPiece) => void
  onClose: () => void
}

const defaultConfig: AdaptiveIntervalConfig = {
  enabled: true,
  goal: "aerobic",
  groupCount: 3,
}

function secondsInput(seconds?: number): string {
  return seconds ? formatInterval(seconds) : ""
}

export function AdaptiveIntervalsModal({
  piece,
  records,
  onRecordsChange,
  onSave,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"recommend" | "records">("recommend")
  const [config, setConfig] = useState<AdaptiveIntervalConfig>(
    piece.adaptiveInterval
      ? JSON.parse(JSON.stringify(piece.adaptiveInterval))
      : defaultConfig,
  )
  const [recommendation, setRecommendation] =
    useState<IntervalRecommendation | undefined>(config.recommendation)
  const [manualIntervalText, setManualIntervalText] = useState(
    secondsInput(config.manualIntervalSeconds),
  )
  const [recordDraft, setRecordDraft] = useState({
    id: "",
    swimmerName: "",
    eventDistance: "100",
    stroke: "freestyle" as Stroke,
    course: "SCY" as CourseType,
    time: "",
    recordedAt: "",
  })
  const [recordError, setRecordError] = useState("")
  const stale = useMemo(
    () =>
      recommendation
        ? isRecommendationStale(recommendation, records, piece, config)
        : false,
    [recommendation, records, piece, config],
  )

  const saveRecord = () => {
    const parsed = parsePerformanceTime(recordDraft.time)
    if (!recordDraft.swimmerName.trim()) {
      setRecordError("Swimmer name is required.")
      return
    }
    if (
      !Number(recordDraft.eventDistance) ||
      Number(recordDraft.eventDistance) <= 0
    ) {
      setRecordError("Enter a valid event distance.")
      return
    }
    if (!parsed.valid) {
      setRecordError(parsed.error)
      return
    }
    const id = recordDraft.id || `record-${Date.now()}`
    const swimmerId =
      records.find(
        (record) =>
          record.swimmerName.toLowerCase() ===
          recordDraft.swimmerName.trim().toLowerCase(),
      )?.swimmerId ?? `swimmer-${Date.now()}`
    const next: PerformanceRecord = {
      id,
      swimmerId,
      swimmerName: recordDraft.swimmerName.trim(),
      eventDistance: Number(recordDraft.eventDistance),
      stroke: recordDraft.stroke,
      course: recordDraft.course,
      timeSeconds: parsed.seconds,
      recordedAt: recordDraft.recordedAt || undefined,
      updatedAt: new Date().toISOString(),
    }
    onRecordsChange(
      recordDraft.id
        ? records.map((record) => (record.id === id ? next : record))
        : [...records, next],
    )
    setRecordDraft({
      id: "",
      swimmerName: "",
      eventDistance: "100",
      stroke: "freestyle",
      course: "SCY",
      time: "",
      recordedAt: "",
    })
    setRecordError("")
  }

  const recalculate = () => {
    if (
      recommendation?.status === "manual" &&
      !window.confirm(
        "Recalculating will replace manual group assignments and interval edits. Continue?",
      )
    ) {
      return
    }
    setRecommendation(recommendIntervals(piece, records, config))
  }

  const updateGroup = (
    groupId: string,
    changes: { name?: string sendOffSeconds?: number },
  ) => {
    if (!recommendation) return
    setRecommendation({
      ...recommendation,
      status: changes.sendOffSeconds ? "manual" : recommendation.status,
      groups: recommendation.groups.map((group) => {
        if (group.id !== groupId) return group
        const next = { ...group, ...changes }
        if (!changes.sendOffSeconds) return next
        const members = recommendation.estimates.filter(
          (estimate) =>
            group.swimmerIds.includes(estimate.swimmerId) &&
            estimate.workingTimeSeconds !== null,
        )
        const rests = members.map(
          (estimate) =>
            changes.sendOffSeconds! - estimate.workingTimeSeconds as number,
        )
        const insufficient = members.filter(
          (estimate) =>
            changes.sendOffSeconds! - estimate.workingTimeSeconds as number <
            (estimate.desiredRestSeconds ?? 0),
        )
        const maxRestRatio =
          config.goal === "custom"
            ? (config.customMaxRestRatio ?? 0.3)
            : GOAL_RULES[config.goal].maxRestRatio
        const excessive = members.filter(
          (estimate) =>
            changes.sendOffSeconds! - estimate.workingTimeSeconds as number >
            estimate.workingTimeSeconds as number * maxRestRatio,
        )
        const warnings: string[] = []
        if (insufficient.length)
          warnings.push("Some swimmers receive insufficient rest.")
        if (excessive.length)
          warnings.push("Some swimmers receive excessive rest for this goal.")
        return {
          ...next,
          restRange: rests.length
            ? [Math.min(...rests), Math.max(...rests)]
            : [0, 0],
          insufficientRestSwimmerIds: insufficient.map(
            (estimate) => estimate.swimmerId,
          ),
          warnings,
        }
      }),
    })
  }

  const moveSwimmer = (swimmerId: string, targetGroupId: string) => {
    if (!recommendation) return
    const estimate = recommendation.estimates.find(
      (item) => item.swimmerId === swimmerId,
    )
    if (!estimate?.workingTimeSeconds) return
    setRecommendation({
      ...recommendation,
      status: "manual",
      groups: recommendation.groups.map((group) => {
        const swimmerIds = group.swimmerIds.filter((id) => id !== swimmerId)
        if (group.id === targetGroupId) swimmerIds.push(swimmerId)
        const members = recommendation.estimates.filter(
          (item) =>
            swimmerIds.includes(item.swimmerId) &&
            item.workingTimeSeconds !== null,
        )
        const workingTimes = members.map(
          (item) => item.workingTimeSeconds as number,
        )
        const rests = workingTimes.map(
          (workingTime) => group.sendOffSeconds - workingTime,
        )
        return {
          ...group,
          swimmerIds,
          workingTimeRange: workingTimes.length
            ? [Math.min(...workingTimes), Math.max(...workingTimes)]
            : [0, 0],
          restRange: rests.length
            ? [Math.min(...rests), Math.max(...rests)]
            : [0, 0],
          insufficientRestSwimmerIds: members
            .filter(
              (item) =>
                (group.sendOffSeconds - item.workingTimeSeconds) as number <
                (item.desiredRestSeconds ?? 0),
            )
            .map((item) => item.swimmerId),
        }
      }),
    })
  }

  const accept = () => {
    onSave({
      ...piece,
      adaptiveInterval: {
        ...config,
        enabled: true,
        previousRest: piece.adaptiveInterval?.previousRest ?? piece.rest,
        recommendation: recommendation
          ? { ...recommendation, accepted: true }
          : undefined,
      },
    })
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="interval-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">ADAPTIVE INTERVALS</span>
            <h2>{piece.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="interval-tabs">
          <button
            className={tab === "recommend" ? "active" : ""}
            onClick={() => setTab("recommend")}
          >
            Recommendation
          </button>
          <button
            className={tab === "records" ? "active" : ""}
            onClick={() => setTab("records")}
          >
            Swimmer Data ({records.length})
          </button>
        </div>
        {tab === "records" ? (
          <div className="interval-body">
            <div className="record-form">
              <input
                placeholder="Swimmer name"
                value={recordDraft.swimmerName}
                onChange={(event) =>
                  setRecordDraft({
                    ...recordDraft,
                    swimmerName: event.target.value,
                  })
                }
              />
              <input
                type="number"
                min="1"
                placeholder="Distance"
                value={recordDraft.eventDistance}
                onChange={(event) =>
                  setRecordDraft({
                    ...recordDraft,
                    eventDistance: event.target.value,
                  })
                }
              />
              <select
                value={recordDraft.stroke}
                onChange={(event) =>
                  setRecordDraft({
                    ...recordDraft,
                    stroke: event.target.value as Stroke,
                  })
                }
              >
                {[
                  "freestyle",
                  "backstroke",
                  "breaststroke",
                  "butterfly",
                  "individual medley",
                  "kick",
                  "pull",
                  "other",
                ].map((stroke) => (
                  <option key={stroke}>{stroke}</option>
                ))}
              </select>
              <select
                value={recordDraft.course}
                onChange={(event) =>
                  setRecordDraft({
                    ...recordDraft,
                    course: event.target.value as CourseType,
                  })
                }
              >
                <option>SCY</option>
                <option>SCM</option>
                <option>LCM</option>
              </select>
              <input
                placeholder="Time (1:02.50)"
                value={recordDraft.time}
                onChange={(event) =>
                  setRecordDraft({ ...recordDraft, time: event.target.value })
                }
              />
              <input
                type="date"
                value={recordDraft.recordedAt}
                onChange={(event) =>
                  setRecordDraft({
                    ...recordDraft,
                    recordedAt: event.target.value,
                  })
                }
              />
              <button className="button button-primary" onClick={saveRecord}>
                {recordDraft.id ? "Update Record" : "Add Record"}
              </button>
            </div>
            {recordError && <div className="inline-error">{recordError}</div>}
            <div className="records-table">
              <div className="records-row records-header">
                <span>Swimmer</span>
                <span>Event</span>
                <span>Course</span>
                <span>Time</span>
                <span>Actions</span>
              </div>
              {records.map((record) => (
                <div className="records-row" key={record.id}>
                  <span>{record.swimmerName}</span>
                  <span>
                    {record.eventDistance} {record.stroke}
                  </span>
                  <span>{record.course}</span>
                  <span>{formatInterval(record.timeSeconds)}</span>
                  <span>
                    <button
                      onClick={() =>
                        setRecordDraft({
                          id: record.id,
                          swimmerName: record.swimmerName,
                          eventDistance: String(record.eventDistance),
                          stroke: record.stroke,
                          course: record.course,
                          time: formatInterval(record.timeSeconds),
                          recordedAt: record.recordedAt ?? "",
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        onRecordsChange(
                          records.filter((item) => item.id !== record.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="interval-body">
            <div className="interval-config">
              <label>
                <span>Training goal</span>
                <select
                  value={config.goal}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      goal: event.target.value as TrainingGoal,
                    })
                  }
                >
                  <option value="recovery">Recovery / easy aerobic</option>
                  <option value="aerobic">General aerobic endurance</option>
                  <option value="threshold">Threshold / sustained hard</option>
                  <option value="speed">High-intensity / speed</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                <span>Minimum rest (seconds)</span>
                <input
                  type="number"
                  min="0"
                  value={config.desiredRestSeconds ?? ""}
                  placeholder="Use goal default"
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      desiredRestSeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </label>
              <label>
                <span>Ability groups</span>
                <select
                  value={config.groupCount}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      groupCount: Number(event.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Manual send-off override</span>
                <input
                  value={manualIntervalText}
                  placeholder="e.g. 1:30"
                  onChange={(event) => {
                    setManualIntervalText(event.target.value)
                    const parsed = event.target.value
                      ? parsePerformanceTime(event.target.value)
                      : null
                    setConfig({
                      ...config,
                      manualIntervalSeconds: parsed?.valid
                        ? parsed.seconds
                        : undefined,
                    })
                  }}
                />
              </label>
              {config.goal === "custom" && (
                <>
                  <label>
                    <span>Working-time multiplier</span>
                    <input
                      type="number"
                      min="1"
                      step=".01"
                      value={config.customWorkMultiplier ?? 1.2}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          customWorkMultiplier: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Maximum rest ratio</span>
                    <input
                      type="number"
                      min="0"
                      step=".05"
                      value={config.customMaxRestRatio ?? 0.3}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          customMaxRestRatio: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="recommendation-toolbar">
              <div>
                <strong>{records.length} performance records available</strong>
                <span>
                  Recommendations require relevant stroke, distance, and course
                  data.
                </span>
              </div>
              <button className="button button-primary" onClick={recalculate}>
                {recommendation ? "Recalculate" : "Calculate Intervals"}
              </button>
            </div>
            {stale && (
              <div className="stale-warning">
                Swimmer data or set settings changed. Recalculate before
                accepting.
              </div>
            )}
            {recommendation && (
              <>
                <div className="assumption-box">
                  <strong>Calculation assumptions</strong>
                  {recommendation.assumptions.map((assumption) => (
                    <span key={assumption}>{assumption}</span>
                  ))}
                </div>
                {recommendation.warnings.map((warning) => (
                  <div className="inline-warning" key={warning}>
                    {warning}
                  </div>
                ))}
                <div className="group-table">
                  <div className="group-row group-header">
                    <span>Ability group</span>
                    <span>Send-off</span>
                    <span>Swimmers</span>
                    <span>Work range</span>
                    <span>Rest range</span>
                    <span>Status</span>
                  </div>
                  {recommendation.groups.map((group) => (
                    <div className="group-row" key={group.id}>
                      <input
                        value={group.name}
                        onChange={(event) =>
                          updateGroup(group.id, { name: event.target.value })
                        }
                      />
                      <input
                        value={formatInterval(group.sendOffSeconds)}
                        onChange={(event) => {
                          const parsed = parsePerformanceTime(
                            event.target.value,
                          )
                          if (parsed.valid)
                            updateGroup(group.id, {
                              sendOffSeconds: parsed.seconds,
                            })
                        }}
                      />
                      <span>{group.swimmerIds.length}</span>
                      <span>
                        {formatInterval(group.workingTimeRange[0])}–
                        {formatInterval(group.workingTimeRange[1])}
                      </span>
                      <span>
                        {formatInterval(group.restRange[0])}–
                        {formatInterval(group.restRange[1])}
                      </span>
                      <span className={group.warnings.length ? "warn" : "ok"}>
                        {group.warnings.length
                          ? group.warnings.join(" ")
                          : "Within assumptions"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="assignment-list">
                  {recommendation.estimates.map((estimate) => (
                    <div key={estimate.swimmerId}>
                      <span>
                        <strong>{estimate.swimmerName}</strong>
                        <small>
                          {estimate.workingTimeSeconds
                            ? `${formatInterval(estimate.workingTimeSeconds)} estimated work · ${estimate.method}`
                            : estimate.explanation}
                        </small>
                      </span>
                      {estimate.workingTimeSeconds && (
                        <span className="assignment-controls">
                          <select
                            value={
                              recommendation.groups.find((group) =>
                                group.swimmerIds.includes(estimate.swimmerId),
                              )?.id ?? ""
                            }
                            onChange={(event) =>
                              moveSwimmer(
                                estimate.swimmerId,
                                event.target.value,
                              )
                            }
                          >
                            {recommendation.groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            title="Individual send-off in seconds"
                            value={estimate.recommendedSendOffSeconds ?? ""}
                            onChange={(event) => {
                              const seconds = Number(event.target.value)
                              if (!seconds) return
                              setRecommendation({
                                ...recommendation,
                                status: "manual",
                                estimates: recommendation.estimates.map(
                                  (item) =>
                                    item.swimmerId === estimate.swimmerId
                                      ? {
                                          ...item,
                                          recommendedSendOffSeconds: seconds,
                                          method: "manual",
                                          explanation:
                                            "Coach supplied an individual interval.",
                                        }
                                      : item,
                                ),
                              })
                            }}
                          />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="modal-footer">
          {piece.adaptiveInterval && (
            <button
              className="button button-ghost"
              onClick={() => {
                onSave({
                  ...piece,
                  rest: piece.adaptiveInterval?.previousRest,
                  adaptiveInterval: undefined,
                })
                onClose()
              }}
            >
              Restore Previous Interval
            </button>
          )}
          <button
            className="button button-ghost"
            onClick={() => {
              onSave({
                ...piece,
                adaptiveInterval: {
                  ...config,
                  enabled: false,
                  recommendation: undefined,
                },
              })
              onClose()
            }}
          >
            Disable for Set
          </button>
          <button className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`button button-primary ${
              stale || (!recommendation && !config.manualIntervalSeconds)
                ? "button-disabled"
                : ""
            }`}
            onClick={accept}
          >
            Accept Recommendation
          </button>
        </div>
      </div>
    </div>
  )
}
