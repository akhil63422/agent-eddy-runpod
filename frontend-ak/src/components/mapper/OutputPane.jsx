import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Zap, Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// X12 810 Invoice structure
const x12Structure = [
  { id: 'ISA', label: 'ISA', type: 'segment', required: true, level: 0 },
  { id: 'GS', label: 'GS', type: 'segment', required: true, level: 0 },
  { id: 'ST', label: 'ST', type: 'segment', required: true, level: 0 },
  { id: 'BIG', label: 'BIG - Invoice Date', type: 'segment', required: true, level: 0, fields: [
    { id: 'BIG01', label: 'BIG01', description: 'Invoice Date', type: 'date' },
    { id: 'BIG02', label: 'BIG02', description: 'Invoice Number', type: 'string' },
  ]},
  { id: 'N1', label: 'N1 - Name', type: 'segment', required: true, level: 0, fields: [
    { id: 'N101', label: 'N101', description: 'Entity Identifier Code', type: 'string' },
    { id: 'N102', label: 'N102', description: 'Name', type: 'string' },
  ]},
  { id: 'IT1', label: 'IT1 - Line Item', type: 'loop', required: false, level: 0, repeatable: true, fields: [
    { id: 'IT101', label: 'IT101', description: 'Quantity', type: 'number' },
    { id: 'IT102', label: 'IT102', description: 'Unit Price', type: 'decimal' },
    { id: 'IT103', label: 'IT103', description: 'Product Code', type: 'string' },
  ]},
  { id: 'TDS', label: 'TDS - Total', type: 'segment', required: true, level: 0, fields: [
    { id: 'TDS01', label: 'TDS01', description: 'Total Amount', type: 'decimal' },
  ]},
  { id: 'SE', label: 'SE', type: 'segment', required: true, level: 0 },
  { id: 'GE', label: 'GE', type: 'segment', required: true, level: 0 },
  { id: 'IEA', label: 'IEA', type: 'segment', required: true, level: 0 },
];

export const OutputPane = () => {
  const [expanded, setExpanded] = useState({});
  
  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderField = (field, depth = 0) => {
    const isExpanded = expanded[field.id];
    const hasChildren = field.fields && field.fields.length > 0;

    return (
      <div key={field.id} className="select-none">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-2 p-2 rounded border-2 cursor-pointer transition-all ${
            field.required
              ? 'border-purple-500/50 bg-[var(--bg-subtle)]'
              : 'border-purple-500/30 bg-purple-500/5'
          } hover:border-purple-400 hover:bg-purple-500/20`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          data-handle="target"
          data-nodeid={field.id}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(field.id)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          
          <Zap className="w-4 h-4 text-[var(--text-secondary)]" />
          <code className="text-xs font-mono text-[var(--text-secondary)] flex-1">{field.label}</code>
          
          <div className="flex items-center gap-2">
            {field.repeatable && (
              <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
                Loop
              </Badge>
            )}
            {field.required && (
              <Lock className="w-3 h-3 text-[var(--status-error-text)]" />
            )}
            {!field.required && (
              <Unlock className="w-3 h-3 text-gray-500" />
            )}
          </div>
        </motion.div>
        
        {hasChildren && isExpanded && (
          <div className="ml-4 mt-1 space-y-1">
            {field.fields.map((subField) => (
              <motion.div
                key={subField.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 p-2 rounded border-2 cursor-pointer transition-all border-purple-500/30 bg-purple-500/5 hover:border-purple-400 hover:bg-purple-500/20`}
                data-handle="target"
                data-nodeid={subField.id}
              >
                <div className="w-4" />
                <div className="w-3 h-3 bg-purple-400 rounded-full" />
                <code className="text-xs font-mono text-[var(--text-secondary)] flex-1">{subField.label}</code>
                <span className="text-xs text-gray-400">{subField.description}</span>
                <Badge variant="outline" className="text-xs border-purple-500/30 text-[var(--text-secondary)]">
                  {subField.type}
                </Badge>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-black/90 border-2 border-purple-500/50 rounded-lg">
      <div className="p-4 border-b border-purple-500/30">
        <h3 className="text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <Zap className="w-5 h-5" />
          X12 Portal (810 Invoice)
        </h3>
        <p className="text-xs text-gray-400 mt-1">Build your circuit to unlock the portal</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {x12Structure.map((field) => renderField(field))}
      </div>
    </div>
  );
};
