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
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="max-h-full w-full max-w-2xl space-y-4 overflow-auto rounded bg-white p-6 text-neutral-900 shadow-lg"
      >
        <h3 id="import-title" className="text-lg font-semibold">
          {t('import.title')}
        </h3>
        <p className="text-sm">{t('import.help')}</p>
        <a href={templateUrl} download="participants-template.csv" className="text-sm underline">
          {t('import.template')}
        </a>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded border-2 border-dashed p-6 text-center text-sm ${
            dragging ? 'border-red-700 bg-red-50' : 'border-neutral-300'
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
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {rows && (
          <div className="space-y-3">
            <p className="text-sm" role="status">
              {t('import.summary', { read: rows.length, valid })}
            </p>
            {leftOut > 0 && (
              <p className="text-sm text-amber-800" role="status">
                {t('import.leftOut', { count: leftOut })}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-300">
                    <th className="py-1 pr-2">#</th>
                    <th className="pr-2">{t('participants.name')}</th>
                    <th className="pr-2">{t('participants.email')}</th>
                    <th className="pr-2">{t('participants.gender')}</th>
                    <th>{t('import.problems')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-neutral-100 align-top">
                      <td className="py-1 pr-2">{r.line}</td>
                      <td className="pr-2">{r.name}</td>
                      <td className="pr-2 break-all">{r.email}</td>
                      <td className="pr-2">{r.gender ? t(`participants.${r.gender}`) : ''}</td>
                      <td className="text-red-700">
                        {r.problems.map((p: ImportProblem) => t(`import.problem.${p}`)).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button ref={closeRef} type="button" onClick={onClose} className="rounded border border-neutral-300 px-4 py-2">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={added.length === 0}
            onClick={() => onAdd(added)}
            className="rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {t('import.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
