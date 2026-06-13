'use client'

const INBOUND_SKILLS = [
  'format_detection',
  'parser',
  'relationship',
  'normalization',
  'mapper',
  'validator',
  'hitl',
]

const OUTBOUND_SKILLS = [
  'po_validator',
  'x12_builder',
  'envelope_wrapper',
]

interface Props {
  completed: string[]
  current?: string
  status: string
  skills?: string[]
}

export default function PipelineSteps({ completed, current, status, skills }: Props) {
  const SKILLS = skills ?? INBOUND_SKILLS
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {SKILLS.map((skill, i) => {
        const done = completed.includes(skill)
        const active = current === skill
        const failed = status === 'FAILED' && active

        return (
          <div key={skill} className="flex items-center gap-1">
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono border ${
                failed
                  ? 'border-red-500 text-red-400 bg-red-950'
                  : done
                  ? 'border-emerald-600 text-emerald-400 bg-emerald-950'
                  : active
                  ? 'border-yellow-500 text-yellow-300 bg-yellow-950 animate-pulse'
                  : 'border-zinc-700 text-zinc-600'
              }`}
            >
              {skill}
            </span>
            {i < SKILLS.length - 1 && (
              <span className="text-zinc-700 text-xs">›</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
