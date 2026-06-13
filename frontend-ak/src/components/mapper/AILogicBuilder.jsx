import React, { useState } from 'react';
import { Sparkles, Play, Code, Wand2, CheckCircle } from 'lucide-react';
import { useMapperStore } from '../../store/mapperStore';

const PRESETS = [
  { label: 'Convert date YYYYMMDD to ISO 8601', logic: 'YYYYMMDD → ISO 8601' },
  { label: 'Flag quantities over 1000 for review', logic: 'If > 1000, flag for review' },
  { label: 'Calculate total = quantity × unit price', logic: 'quantity × unit_price' },
  { label: 'Map N302 + N401 to full address', logic: 'Concatenate: address + ", " + city' },
  { label: 'Prefix REF02 with "REF-"', logic: 'Prepend "REF-" if not present' },
];

export const AILogicBuilder = () => {
  const [prompt, setPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [appliedToMapping, setAppliedToMapping] = useState(null);
  const { mappings, updateMappingLogic, addScore, addBadge } = useMapperStore();

  const generateLogic = async (text) => {
    setIsGenerating(true);
    setAppliedToMapping(null);

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const lower = text.toLowerCase();
    let code = '';

    if (lower.includes('date') || lower.includes('yyyymmdd') || lower.includes('iso')) {
      code = `function transformDate(value) {\n  // Convert YYYYMMDD → ISO 8601\n  const y = value.slice(0, 4);\n  const m = value.slice(4, 6);\n  const d = value.slice(6, 8);\n  return \`\${y}-\${m}-\${d}T00:00:00Z\`;\n}`;
    } else if (lower.includes('flag') || lower.includes('quantity') || lower.includes('1000')) {
      code = `function validateQuantity(value) {\n  const qty = parseInt(value);\n  if (qty > 1000) {\n    return { value: qty, flag: 'REVIEW_REQUIRED' };\n  }\n  return { value: qty, flag: null };\n}`;
    } else if (lower.includes('total') || lower.includes('multiply') || lower.includes('price')) {
      code = `function calculateTotal(quantity, unitPrice) {\n  const total = parseFloat(quantity) * parseFloat(unitPrice);\n  return total.toFixed(2);\n}`;
    } else if (lower.includes('address') || lower.includes('concat')) {
      code = `function buildAddress(line, city) {\n  return [line, city].filter(Boolean).join(', ');\n}`;
    } else if (lower.includes('prefix') || lower.includes('ref')) {
      code = `function ensurePrefix(value, prefix = 'REF-') {\n  return value.startsWith(prefix) ? value : prefix + value;\n}`;
    } else {
      code = `function transform(value) {\n  // AI-generated logic: ${text}\n  return value;\n}`;
    }

    setGeneratedCode(code);
    setIsGenerating(false);
    addScore(15);
  };

  const applyToMapping = (mappingId) => {
    const lines = generatedCode.split('\n');
    const comment = lines.find(l => l.includes('//'));
    const logic = comment ? comment.replace('//', '').trim() : prompt;
    updateMappingLogic(mappingId, logic);
    setAppliedToMapping(mappingId);
    addScore(25);

    if (!appliedToMapping) {
      addBadge({ id: 'ai_logic', label: 'AI Architect', description: 'Applied AI-generated logic' });
    }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-amber-500/30 rounded-sm backdrop-blur-sm flex flex-col h-full">
      <div className="p-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Sparkles className="w-3.5 h-3.5 text-[var(--text-primary)]" />
          </div>
          <div>
            <h3 className="text-[var(--text-primary)] font-bold text-sm">AI Logic Builder</h3>
            <p className="text-xs text-[var(--text-secondary)] font-mono">Plain English → Code</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider mb-1.5 block">
            Describe your logic
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && prompt.trim() && generateLogic(prompt)}
              placeholder="e.g., Convert date format to ISO 8601..."
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
            <button
              onClick={() => prompt.trim() && generateLogic(prompt)}
              disabled={isGenerating || !prompt.trim()}
              className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-[var(--text-primary)] rounded-lg text-xs font-bold hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              {isGenerating ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              Generate
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider mb-1.5 block">
            Quick presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => {
                  setPrompt(preset.label);
                  generateLogic(preset.label);
                }}
                className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-amber-500/40 hover:text-[var(--status-warn-text)] transition-all font-mono"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {isGenerating && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <span className="text-[var(--status-warn-text)] text-xs font-mono">AI generating transformation logic...</span>
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-[var(--bg-surface)] rounded animate-pulse w-3/4" />
              <div className="h-2 bg-[var(--bg-surface)] rounded animate-pulse w-1/2" />
              <div className="h-2 bg-[var(--bg-surface)] rounded animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {generatedCode && !isGenerating && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[var(--text-secondary)] font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Code className="w-3 h-3" />
                Generated Code
              </label>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--status-success-text)] border border-green-500/20 font-mono">
                Ready to apply
              </span>
            </div>
            <pre className="bg-background border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--status-success-text)] font-mono overflow-x-auto leading-relaxed">
              {generatedCode}
            </pre>

            {mappings.length > 0 && (
              <div className="mt-2">
                <label className="text-[10px] text-[var(--text-secondary)] font-mono uppercase tracking-wider mb-1.5 block">
                  Apply to mapping
                </label>
                <div className="space-y-1">
                  {mappings.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => applyToMapping(m.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono transition-all flex items-center justify-between
                        ${appliedToMapping === m.id
                          ? 'bg-[var(--bg-subtle)] border border-green-500/30 text-[var(--status-success-text)]'
                          : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-amber-500/40'
                        }`}
                    >
                      <span>{m.sourceId} → {m.targetId}</span>
                      {appliedToMapping === m.id ? (
                        <CheckCircle className="w-3 h-3 text-[var(--status-success-text)]" />
                      ) : (
                        <Play className="w-3 h-3 text-[var(--status-warn-text)]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
