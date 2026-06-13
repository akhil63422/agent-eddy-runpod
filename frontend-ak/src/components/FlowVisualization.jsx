import React, { useState, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, Package, Brain, FileJson, FileText, ArrowRight, GitBranch, Truck, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const INBOUND_STEPS = [
  { num: 1, icon: Cloud, label: 'Receive', shortDesc: 'AS2 / SFTP / REST', description: 'AS2 / SFTP / REST', details: 'Receive EDI files via AS2, SFTP, REST API.' },
  { num: 2, icon: Package, label: 'Parse', shortDesc: 'EDI / JSON / XML / CSV', description: 'Parse & Detect', details: 'Parse input and detect format (X12, EDIFACT, JSON, XML, CSV).' },
  { num: 3, icon: FileText, label: 'Validate', shortDesc: 'Syntax + Rules', description: 'Validate', details: 'Validate syntax and business rules.' },
  { num: 4, icon: FileJson, label: 'Canonical', shortDesc: 'Canonical model', description: 'Canonical', details: 'Map to internal canonical JSON model.' },
  { num: 5, icon: Brain, label: 'Ready', shortDesc: 'Ready for Dispatch', description: 'Ready for Dispatch', details: 'Inbound complete. Create outbound to dispatch.' },
];

const OUTBOUND_STEPS = [
  { num: 1, icon: GitBranch, label: 'Route', shortDesc: 'Business rules', description: 'Routing', details: 'Route to target system based on business rules.' },
  { num: 2, icon: FileJson, label: 'Transform', shortDesc: 'If needed', description: 'Transform', details: 'Apply transformations if required.' },
  { num: 3, icon: Truck, label: 'Deliver', shortDesc: 'ERP / Transport', description: 'Delivering', details: 'Post to ERP or deliver via AS2, SFTP, REST.' },
  { num: 4, icon: BarChart3, label: 'Monitor', shortDesc: 'Audit / ACK', description: 'Monitor', details: 'Audit trail and ACK monitoring.' },
];

export const FlowVisualization = memo(({ direction }) => {
  const [selectedStep, setSelectedStep] = useState(null);
  const flowSteps = direction === 'Outbound' ? OUTBOUND_STEPS : INBOUND_STEPS;
  const title = direction === 'Outbound' ? 'Outbound Pipeline' : 'Inbound Pipeline';
  
  return (
    <>
      <Card className="bg-[var(--bg-surface)] border border-[var(--border)]">
        <CardHeader className="border-b border-[var(--border)]">
          <CardTitle className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="relative overflow-x-auto pb-4">
            {/* 10-step flow per architecture */}
            <div className="relative flex items-center gap-2 min-w-max">
              {flowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <React.Fragment key={index}>
                    <div 
                      className="flex flex-col items-center cursor-pointer flex-shrink-0 min-w-[100px] w-[100px] p-3 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
                      onClick={() => setSelectedStep(step)}
                    >
                      <div className="w-12 h-12 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-focus)] flex items-center justify-center text-[var(--status-info-text)]">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="mt-2 text-center w-full">
                        <span className="text-[10px] text-[var(--text-muted)]">Step {step.num}</span>
                        <p className="text-xs font-medium text-[var(--text-primary)] mt-0.5 leading-tight">{step.label}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight" title={step.description}>{step.shortDesc}</p>
                      </div>
                    </div>
                    {index < flowSteps.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {selectedStep && (
        <Dialog open={!!selectedStep} onOpenChange={() => setSelectedStep(null)}>
          <DialogContent className="max-w-lg bg-[var(--bg-surface)] border border-[var(--border)]">
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-4">
                {selectedStep.icon && (() => {
                  const Icon = selectedStep.icon;
                  return (
                    <div className="w-14 h-14 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-focus)] flex items-center justify-center text-[var(--status-info-text)]">
                      <Icon className="w-7 h-7" />
                    </div>
                  );
                })()}
                <div>
                  <DialogTitle className="text-xl font-semibold text-[var(--text-primary)]">
                    Step {selectedStep.num}: {selectedStep.label}
                  </DialogTitle>
                  <p className="text-sm text-[var(--text-secondary)]">{selectedStep.description}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="pt-4">
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                {selectedStep.details}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
});

FlowVisualization.displayName = 'FlowVisualization';
