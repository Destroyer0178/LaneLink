import type { ReactNode } from "react"

type ImportSourcePreviewProps = {
  filename: string
  fileType: "DOCX" | "TEXT"
  source: string
  alertIcon: ReactNode
}

export function ImportSourcePreview({
  filename,
  fileType,
  source,
  alertIcon,
}: ImportSourcePreviewProps) {
  return (
    <aside className="source-column">
      <div className="source-heading">
        <div>
          <span>Original Workout</span>
          <strong>{filename}</strong>
        </div>
        <span className="file-type">{fileType}</span>
      </div>
      <div className="source-preview">
        <span className="source-label">EXTRACTED SOURCE TEXT</span>
        <pre>{source}</pre>
      </div>
      <div className="prototype-note">
        {alertIcon}
        <p>
          Review each converted item against the extracted source. Unrecognized
          lines and missing units remain unresolved.
        </p>
      </div>
    </aside>
  )
}
