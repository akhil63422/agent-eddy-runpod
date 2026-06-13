import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Shield, Settings2, Calculator, Code, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

const nodeStyles = {
  input: 'border-[var(--border)] bg-[var(--bg-subtle)]',
  output: 'border-purple-500 bg-purple-500/20',
  transform: 'border-green-500 bg-green-500/20',
  validation: 'border-yellow-500 bg-yellow-500/20',
};

export const InputNode = ({ data }) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`px-4 py-3 rounded-lg border-2 ${nodeStyles.input} min-w-[150px]`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
        <code className="text-xs font-mono text-[var(--text-secondary)]">{data.label}</code>
      </div>
      <p className="text-xs text-gray-400">{data.value}</p>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-400" />
    </motion.div>
  );
};

export const OutputNode = ({ data }) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`px-4 py-3 rounded-lg border-2 ${nodeStyles.output} min-w-[150px]`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-400" />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 bg-purple-400 rounded-full" />
        <code className="text-xs font-mono text-[var(--text-secondary)]">{data.label}</code>
      </div>
      <p className="text-xs text-gray-400">{data.description}</p>
    </motion.div>
  );
};

export const TransformNode = ({ data }) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`px-4 py-3 rounded-lg border-2 ${nodeStyles.transform} min-w-[150px]`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-green-400" />
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-4 h-4 text-[var(--status-success-text)]" />
        <span className="text-xs font-semibold text-green-300">{data.type || 'Transform'}</span>
      </div>
      <p className="text-xs text-gray-400">{data.config || 'No config'}</p>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-green-400" />
    </motion.div>
  );
};

export const ValidationGateNode = ({ data }) => {
  const status = data.status || 'idle'; // idle, pass, fail
  const statusColors = {
    idle: 'border-yellow-500 bg-yellow-500/20',
    pass: 'border-green-500 bg-green-500/20',
    fail: 'border-red-500 bg-transparent',
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: status === 'fail' ? [1, 1.1, 1] : 1,
        rotate: status === 'fail' ? [0, -5, 5, 0] : 0,
      }}
      transition={{ duration: 0.3 }}
      className={`px-4 py-3 rounded-lg border-2 ${statusColors[status]} min-w-[150px] relative overflow-hidden`}
    >
      {status === 'fail' && (
        <motion.div
          className="absolute inset-0 bg-transparent"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5 }}
        />
      )}
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-yellow-400" />
      <div className="flex items-center gap-2 mb-2 relative z-10">
        <Shield className={`w-4 h-4 ${
          status === 'pass' ? 'text-[var(--status-success-text)]' :
          status === 'fail' ? 'text-[var(--status-error-text)]' :
          'text-yellow-400'
        }`} />
        <span className="text-xs font-semibold text-yellow-300">{data.rule || 'Validation'}</span>
      </div>
      <p className="text-xs text-gray-400 relative z-10">{data.message || 'Configure rule'}</p>
      {status === 'fail' && (
        <motion.div
          className="absolute top-0 right-0 w-2 h-2 bg-red-400 rounded-full"
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 0.5 }}
        />
      )}
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-yellow-400" />
    </motion.div>
  );
};

export const nodeTypes = {
  input: InputNode,
  output: OutputNode,
  transform: TransformNode,
  validation: ValidationGateNode,
};
