'use client'

import { useState } from 'react'

interface Props {
  data: string
}

export default function EdiPanel({ data }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(data)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest">x12 output</div>
        {data && (
          <button
            onClick={copy}
            className="text-xs font-mono px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
        )}
      </div>
      <pre className="flex-1 overflow-auto bg-zinc-900 border border-zinc-800 rounded p-3 text-xs font-mono text-emerald-300 leading-5 whitespace-pre-wrap break-all">
        {data || <span className="text-zinc-600">—</span>}
      </pre>
    </div>
  )
}
