import { IMPORT_LIMITS, parseCsv } from './participantsImport'

export type ReadError = 'too_big' | 'unsupported' | 'unreadable'

export class ImportReadError extends Error {
  readonly code: ReadError
  constructor(code: ReadError) {
    super(code)
    this.code = code
  }
}

/** Read a picked file into rows of text. Only `.csv` for now; spreadsheets are added with the xlsx reader. */
export async function readImportFile(file: File): Promise<string[][]> {
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new ImportReadError('too_big')
  if (!/\.csv$/i.test(file.name)) throw new ImportReadError('unsupported')
  try {
    return parseCsv(await file.text())
  } catch {
    throw new ImportReadError('unreadable')
  }
}
