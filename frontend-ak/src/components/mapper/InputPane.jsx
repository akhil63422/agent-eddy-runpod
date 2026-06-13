import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useMapperStore } from '@/store/mapperStore';

export const InputPane = () => {
  const { rawInput, parsedInput, setRawInput } = useMapperStore();
  
  const sampleData = "Invoice|12345|20231001|VendorX|Item1|5|10.00|Item2|3|15.00|Total|75.00";

  const handleLoadSample = () => {
    setRawInput(sampleData);
  };

  const handleInputChange = (e) => {
    setRawInput(e.target.value);
  };

  return (
    <div className="h-full flex flex-col bg-black/90 border-2 border-[var(--border)]/50 rounded-lg">
      <div className="p-4 border-b border-[var(--border)]/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--status-info-text)] font-bold flex items-center gap-2">
            <Radio className="w-5 h-5" />
            Energy Sources
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLoadSample}
            className="bg-blue-500/10 border-[var(--border)]/30 text-[var(--status-info-text)] hover:bg-[var(--bg-subtle)]"
          >
            <Upload className="w-4 h-4 mr-2" />
            Load Sample
          </Button>
        </div>
        <Textarea
          value={rawInput}
          onChange={handleInputChange}
          placeholder="Paste pipe-delimited data here..."
          className="bg-black/50 border-[var(--border)]/30 text-[var(--text-primary)] font-mono text-xs min-h-[100px]"
        />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {parsedInput.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">No data loaded</p>
            <p className="text-xs mt-2">Load sample data or paste your own</p>
          </div>
        ) : (
          parsedInput.map((field, idx) => (
            <motion.div
              key={field.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="group relative p-3 rounded-lg border-2 border-[var(--border)]/30 bg-blue-500/10 hover:border-blue-400 hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              data-handle="source"
              data-nodeid={`input-${idx}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
                  <code className="text-xs font-mono text-[var(--text-secondary)]">{field.label}</code>
                </div>
                <Badge variant="outline" className="text-xs border-[var(--border)]/30 text-[var(--status-info-text)]">
                  #{idx}
                </Badge>
              </div>
              <div className="absolute inset-0 rounded-lg bg-blue-400/0 group-hover:bg-blue-400/10 transition-colors pointer-events-none" />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
