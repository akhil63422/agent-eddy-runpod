import React from 'react';
import { ArrowRight, Brain, Trash2, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { useMapperStore } from '../../store/mapperStore';

const confidenceColor = (confidence) => {
  if (confidence >= 95) return 'text-[var(--status-success-text)]';
  if (confidence >= 85) return 'text-yellow-400';
  return 'text-[var(--status-warn-text)]';
};

const confidenceBarColor = (confidence) => {
  if (confidence >= 95) return 'from-green-500 to-emerald-400';
  if (confidence >= 85) return 'from-yellow-500 to-amber-400';
  return 'from-orange-500 to-red-400';
};

export const MappingCanvas = () => {
  const { mappings, removeMapping, sourceFields, targetFields, isRunning } = useMapperStore();

  const getSourceField = (id) => sourceFields.find(f => f.id === id);
  const getTargetField = (id) => targetFields.find(f => f.id === id);

  if (mappings.length === 0) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-sm backdrop-blur-sm flex flex-col h-full">
        <div className="p-3 border-b border-[var(--border)]/30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Brain className="w-3.5 h-3.5 text-[var(--text-primary)]" />
            </div>
            <div>
              <h3 className="text-[var(--text-primary)] font-bold text-sm">Active Mappings</h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">0 connections</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-focus)] rounded-2xl flex items-center justify-center mx-auto mb-3">
              <ArrowRight className="w-6 h-6 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">No mappings yet</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Drag source fields onto target fields to create mappings</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--status-success)] rounded-sm backdrop-blur-sm flex flex-col h-full">
      <div className="p-3 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Brain className="w-3.5 h-3.5 text-[var(--text-primary)]" />
          </div>
          <div>
            <h3 className="text-[var(--text-primary)] font-bold text-sm">Active Mappings</h3>
            <p className="text-xs text-[var(--text-secondary)] font-mono">{mappings.length} connections</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {mappings.map((mapping) => {
          const source = getSourceField(mapping.sourceId);
          const target = getTargetField(mapping.targetId);
          if (!source || !target) return null;

          return (
            <div
              key={mapping.id}
              className={`rounded-lg border p-3 transition-all duration-300
                ${isRunning
                  ? 'bg-[var(--bg-subtle)] border-[var(--border)] shadow-md shadow-none animate-pulse'
                  : 'bg-[var(--bg-surface)]/60 border-[var(--border)] hover:border-emerald-500/40'
                }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[var(--text-primary)] font-mono text-xs font-semibold bg-primary/10 px-2 py-0.5 rounded border border-[var(--border)] truncate">
                    {source.label}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="w-4 h-px bg-gradient-to-r from-[var(--border-focus)] to-[var(--border-focus)]" />
                    <Zap className="w-3 h-3 text-[var(--status-success-text)]" />
                    <div className="w-4 h-px bg-gradient-to-r from-emerald-500 to-purple-500" />
                  </div>
                  <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold bg-[var(--bg-subtle)] px-2 py-0.5 rounded border border-purple-500/20 truncate">
                    {target.label}
                  </span>
                </div>
                <button
                  onClick={() => removeMapping(mapping.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] transition-colors flex-shrink-0 p-1 hover:bg-red-500/10 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-[var(--text-secondary)] font-mono flex-shrink-0">LOGIC:</span>
                <span className="text-[10px] text-[var(--status-success-text)] bg-primary/10 px-2 py-0.5 rounded border border-emerald-500/20 truncate">
                  {mapping.logic || 'Direct mapping'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-secondary)] font-mono flex-shrink-0">CONFIDENCE:</span>
                <div className="flex-1 h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${confidenceBarColor(mapping.confidence)} rounded-full transition-all duration-500`}
                    style={{ width: `${mapping.confidence}%` }}
                  />
                </div>
                <span className={`text-xs font-mono font-bold ${confidenceColor(mapping.confidence)} flex-shrink-0`}>
                  {mapping.confidence}%
                </span>
                {mapping.confidence >= 95 ? (
                  <CheckCircle className="w-3 h-3 text-[var(--status-success-text)] flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
