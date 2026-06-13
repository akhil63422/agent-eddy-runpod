import React from 'react';
import { FileOutput, GripVertical } from 'lucide-react';
import { useMapperStore } from '../../store/mapperStore';

const typeColors = {
  string: 'text-[var(--status-success-text)] bg-[var(--bg-subtle)] border-green-500/30',
  date: 'text-[var(--status-info-text)] bg-blue-500/10 border-[var(--border)]/30',
  number: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  decimal: 'text-[var(--text-secondary)] bg-[var(--bg-subtle)] border-purple-500/30',
};

export const TargetFieldsPanel = ({ onDrop, onDragOver }) => {
  const { targetFields, mappings } = useMapperStore();

  const isMapped = (fieldId) => mappings.some(m => m.targetId === fieldId);
  const getSourceForTarget = (targetId) => {
    const mapping = mappings.find(m => m.targetId === targetId);
    return mapping?.sourceId || null;
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-purple-500/30 rounded-sm backdrop-blur-sm flex flex-col h-full">
      <div className="p-3 border-b border-purple-500/20">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
            <FileOutput className="w-3.5 h-3.5 text-[var(--text-primary)]" />
          </div>
          <div>
            <h3 className="text-[var(--text-primary)] font-bold text-sm">Target Fields</h3>
            <p className="text-xs text-[var(--text-secondary)] font-mono">Canonical Format</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {targetFields.map((field) => {
          const mapped = isMapped(field.id);
          const sourceId = getSourceForTarget(field.id);
          return (
            <div
              key={field.id}
              onDrop={(e) => onDrop(e, field)}
              onDragOver={onDragOver}
              className={`group p-2.5 rounded-lg border transition-all duration-200
                ${mapped
                  ? 'bg-[var(--bg-subtle)] border-purple-500/40 shadow-sm shadow-purple-500/10'
                  : 'bg-[var(--bg-surface)]/60 border-[var(--border)] hover:border-purple-500/40 hover:bg-[var(--bg-subtle)] border-dashed'
                }`}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)] font-mono text-xs font-semibold">{field.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${typeColors[field.type] || typeColors.string}`}>
                      {field.type}
                    </span>
                    {mapped && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-[var(--text-secondary)] border border-purple-500/30">
                        linked
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{field.description}</div>
                  {mapped && sourceId && (
                    <div className="text-[10px] text-[var(--text-primary)] font-mono mt-0.5">
                      ← {sourceId}
                    </div>
                  )}
                  {!mapped && (
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 italic">Drop source field here</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
