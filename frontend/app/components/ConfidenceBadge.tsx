'use client'

interface Props {
  score: number
  status: string
}

export default function ConfidenceBadge({ score, status }: Props) {
  const pct = Math.round(score * 100)
  const color =
    status === 'COMPLETED'
      ? pct >= 90 ? 'emerald' : pct >= 75 ? 'yellow' : 'orange'
      : status === 'HITL_PENDING'
      ? 'orange'
      : 'red'

  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 border-emerald-600',
    yellow:  'text-yellow-400 border-yellow-600',
    orange:  'text-orange-400 border-orange-600',
    red:     'text-red-400 border-red-600',
  }

  const barColor: Record<string, string> = {
    emerald: 'bg-emerald-500',
    yellow:  'bg-yellow-500',
    orange:  'bg-orange-500',
    red:     'bg-red-500',
  }

  return (
    <div className={`border rounded px-3 py-2 font-mono text-sm ${colorMap[color]}`}>
      <div className="flex justify-between mb-1">
        <span>confidence</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${barColor[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-xs opacity-70">
        status:{' '}
        <span className="font-semibold">
          {status === 'COMPLETED' ? '✓ COMPLETED' : status === 'HITL_PENDING' ? '⚠ HITL PENDING' : status}
        </span>
      </div>
    </div>
  )
}
