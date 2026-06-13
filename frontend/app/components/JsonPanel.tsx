'use client'

interface Props {
  label: string
  data: unknown
}

export default function JsonPanel({ label, data }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-2 px-1">
        {label}
      </div>
      <pre className="flex-1 overflow-auto bg-zinc-900 border border-zinc-800 rounded p-3 text-xs font-mono text-emerald-300 leading-5 whitespace-pre-wrap break-all">
        {data ? JSON.stringify(data, null, 2) : <span className="text-zinc-600">—</span>}
      </pre>
    </div>
  )
}
