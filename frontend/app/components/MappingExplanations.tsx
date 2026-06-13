'use client'

interface Props {
  explanations: string[]
  unmapped: string[]
}

export default function MappingExplanations({ explanations, unmapped }: Props) {
  return (
    <div className="space-y-3">
      {explanations.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-2">
            mapping explanations
          </div>
          <ul className="space-y-1">
            {explanations.map((e, i) => (
              <li key={i} className="text-xs font-mono text-zinc-300 flex gap-2">
                <span className="text-emerald-600 shrink-0">›</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {unmapped.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-2">
            unmapped fields
          </div>
          <div className="flex flex-wrap gap-1">
            {unmapped.map((f) => (
              <span
                key={f}
                className="text-xs font-mono px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
