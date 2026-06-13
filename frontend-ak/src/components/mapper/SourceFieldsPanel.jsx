import React from 'react';
import { Database, GripVertical } from 'lucide-react';
import { useMapperStore } from '../../store/mapperStore';

const typeColors = {
  string: 'text-[var(--status-success-text)] bg-[var(--bg-subtle)] border-green-500/30',
  date: 'text-[var(--status-info-text)] bg-blue-500/10 border-[var(--border)]/30',
  number: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  decimal: 'text-[var(--text-secondary)] bg-[var(--bg-subtle)] border-purple-500/30',
};

export const SourceFieldsPanel = ({ onDragStart }) => {
  const { sourceFields, mappings } = useMapperStore();

  const isMapped = (fieldId) => mappings.some(m => m.sourceId === fieldId);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm backdrop-blur-sm flex flex-col h-full">
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Database className="w-3.5 h-3.5 text-[var(--text-primary)]" />
          </div>
          <div>
            <h3 className="text-[var(--text-primary)] font-bold text-sm">Source Fields</h3>
            <p className="text-xs text-[var(--text-secondary)] font-mono">EDI 850 Purchase Order</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sourceFields.map((field) => {
          const mapped = isMapped(field.id);
          return (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => onDragStart(e, field, 'source')}
              className={`group cursor-grab active:cursor-grabbing p-2.5 rounded-lg border transition-all duration-200
                ${mapped
                  ? 'bg-primary/10 border-[var(--border)] shadow-sm shadow-none'
                  : 'bg-[var(--bg-surface)]/60 border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]'
                }`}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)] font-mono text-xs font-semibold">{field.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${typeColors[field.type] || typeColors.string}`}>
                      {field.type}
                    </span>
                    {mapped && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)]">
                        linked
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{field.description}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 truncate">= {field.value}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
