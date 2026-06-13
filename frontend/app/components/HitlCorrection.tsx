'use client'

import { useState } from 'react'

interface Props {
  documentId: string
  currentPayload: Record<string, unknown>
  onCorrected: () => void
}

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

export default function HitlCorrection({ documentId, currentPayload, onCorrected }: Props) {
  const [payload, setPayload] = useState(JSON.stringify(currentPayload, null, 2))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      setError('Invalid JSON — fix the payload before submitting.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/document/${documentId}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrected_payload: parsed, reviewer_notes: notes }),
      })
      if (!res.ok) throw new Error(await res.text())
      onCorrected()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-orange-700 rounded p-3 space-y-3 bg-orange-950/20">
      <div className="text-xs font-mono text-orange-400 uppercase tracking-widest">
        ⚠ human review required
      </div>
      <textarea
        className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs font-mono text-emerald-300 resize-none focus:outline-none focus:border-orange-600"
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        spellCheck={false}
      />
      <input
        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-orange-600"
        placeholder="Reviewer notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && <div className="text-xs font-mono text-red-400">{error}</div>}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-1.5 text-xs font-mono rounded border border-orange-600 text-orange-300 hover:bg-orange-900/40 disabled:opacity-40 transition-colors"
      >
        {loading ? 'submitting...' : 'approve & submit correction'}
      </button>
    </div>
  )
}
