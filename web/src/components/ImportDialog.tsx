import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fitToCapacity,
  parseParticipantsFile,
  TEMPLATE_CSV,
  type ImportProblem,
  type ImportRow,
} from '../lib/participantsImport'
import { ImportReadError, readImportFile } from '../lib/readImportFile'

interface Props {
  /** Emails already in the editor, for duplicate detection. */
  existingEmails: string[]
  currentCount: number
  onAdd: (rows: ImportRow[]) => void
  onClose: () => void
}

export default function ImportDialog({ existingEmails, currentCount, onAdd, onClose }: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => closeRef.current?.focus(), [])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setRows(null)
    try {
      const result = parseParticipantsFile(await readImportFile(file), existingEmails)
      if (result.ok) setRows(result.rows)
      else setError(t(`import.errors.${result.error}`))
    } catch (err) {
      setError(t(`import.errors.${err instanceof ImportReadError ? err.code : 'unreadable'}`))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  const { added, leftOut } = rows ? fitToCapacity(rows, currentCount) : { added: [], leftOut: 0 }
  const valid = rows ? rows.filter((r) => r.problems.length === 0).length : 0
  const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`

  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="modal grid max-w-2xl gap-4"
      >
        <h3 id="import-title" className="card-title">
          {t('import.title')}
        </h3>
        <p className="text-sm">{t('import.help')}</p>
        <a href={templateUrl} download="participants-template.csv" className="btn btn-neutral btn-sm w-fit">
          {t('import.template')}
        </a>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center text-sm font-bold ${
            dragging ? 'border-berry bg-danger-soft' : 'border-line bg-paper-deep'
          }`}
        >
          <span>{t('import.drop')}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>

        {error && (
          <p className="callout callout-error" role="alert">
            {error}
          </p>
        )}

        {rows && (
          <div className="grid gap-3">
            <p className="text-sm" role="status">
              {t('import.summary', { read: rows.length, valid })}
            </p>
            {leftOut > 0 && (
              <p className="callout callout-warn" role="status">
                {t('import.leftOut', { count: leftOut })}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-1 pr-2">#</th>
                    <th className="pr-2">{t('participants.name')}</th>
                    <th className="pr-2">{t('participants.email')}</th>
                    <th className="pr-2">{t('participants.gender')}</th>
                    <th>{t('import.problems')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-paper-deep align-top">
                      <td className="py-1 pr-2">{r.line}</td>
                      <td className="pr-2">{r.name}</td>
                      <td className="pr-2 break-all">{r.email}</td>
                      <td className="pr-2">{r.gender ? t(`participants.${r.gender}`) : ''}</td>
                      <td className="text-danger">
                        {r.problems.map((p: ImportProblem) => t(`import.problem.${p}`)).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-neutral">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={added.length === 0}
            onClick={() => onAdd(added)}
            className="btn btn-primary"
          >
            {t('import.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
