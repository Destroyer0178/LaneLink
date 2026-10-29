export type ExtractedDocument = {
  filename: string
  text: string
  warnings: string[]
}

export async function extractDocx(file: File): Promise<ExtractedDocument> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Only .docx files are currently supported.")
  }

  const arrayBuffer = await file.arrayBuffer()
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ arrayBuffer })

  // Mammoth separates Word paragraphs with blank lines. Only normalize line
  // endings here so the parser receives the original paragraph boundaries.
  const text = result.value.replace(/\r\n?/g, "\n").trimEnd()
  if (!text.trim()) {
    throw new Error("The document did not contain readable text.")
  }

  return {
    filename: file.name,
    text,
    warnings: result.messages.map((message) => message.message),
  }
}
