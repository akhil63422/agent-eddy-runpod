import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Rocket, Shield, Activity, Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

export const Step9GoLive = ({ data, onChange, onComplete }) => {
  const [activating, setActivating] = useState(false);

  const handleChange = (field, value) => {
    onChange({ [field]: value });
  };

  const runComplete = async () => {
    if (!onComplete) return;
    setActivating(true);
    try {
      await onComplete();
    } finally {
      setActivating(false);
    }
  };

  const readinessChecks = [
    { id: 1, label: 'Business Partner Information', status: data.businessName ? 'complete' : 'incomplete' },
    { id: 2, label: 'EDI Profile Configured', status: data.ediStandard ? 'complete' : 'incomplete' },
    { id: 3, label: 'ERP & System Context', status: data.erpContext?.targetSystem?.system ? 'complete' : 'optional', optional: true },
    { id: 4, label: 'Documents Defined', status: data.documents?.length > 0 ? 'complete' : 'incomplete' },
    { id: 5, label: 'Mappings Approved', status: data.mappings?.length > 0 ? 'complete' : 'incomplete' },
    { id: 6, label: 'Transport Configured', status: data.transportType ? 'complete' : 'incomplete' },
    { id: 7, label: 'Testing Completed', status: data.testResults?.length > 0 ? 'complete' : 'incomplete' },
  ];

  // Count only required (non-optional) checks
  const requiredChecks = readinessChecks.filter((check) => !check.optional);
  const completedRequiredChecks = requiredChecks.filter((check) => check.status === 'complete').length;
  const readinessPercentage = requiredChecks.length > 0 
    ? (completedRequiredChecks / requiredChecks.length) * 100 
    : 100;
  const isReady = readinessPercentage === 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Go Live</h2>
        <p className="text-muted-foreground">
          Activate this trading partner for production. The Execute Agent will take over automated processing.
        </p>
      </div>

      <Card className={isReady ? 'border-success' : 'border-warning'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isReady ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-success" />
                Ready for Production
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-warning" />
                Setup Incomplete
              </>
            )}
          </CardTitle>
          <CardDescription>
            Review readiness checklist before activating
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Readiness:</span>
              <span className="font-medium">{completedRequiredChecks} of {requiredChecks.length} required complete</span>
            </div>
            <Progress value={readinessPercentage} className="h-2" />
          </div>

          <div className="space-y-2">
            {readinessChecks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex items-center gap-2">
                  {check.status === 'complete' ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : check.status === 'optional' ? (
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground opacity-50" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-warning" />
                  )}
                  <span className="text-sm">{check.label}</span>
                  {check.optional && (
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  )}
                </div>
                <Badge variant={
                  check.status === 'complete' ? 'success' 
                  : check.status === 'optional' ? 'secondary'
                  : 'warning'
                }>
                  {check.status === 'optional' ? 'Skipped' : check.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activation Settings</CardTitle>
          <CardDescription>Configure how the partner will operate in production</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="activationDate">Activation Date</Label>
            <Input
              id="activationDate"
              type="datetime-local"
              value={data.activationDate || ''}
              onChange={(e) => handleChange('activationDate', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When should this partner go live? Leave empty to activate immediately.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="monitoringEnabled"
                checked={data.monitoringEnabled !== false}
                onCheckedChange={(checked) => handleChange('monitoringEnabled', checked)}
              />
              <Label htmlFor="monitoringEnabled" className="cursor-pointer flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Enable real-time monitoring
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exceptionAlerts"
                checked={data.exceptionAlerts !== false}
                onCheckedChange={(checked) => handleChange('exceptionAlerts', checked)}
              />
              <Label htmlFor="exceptionAlerts" className="cursor-pointer flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Send alerts for exceptions
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoRetry"
                checked={data.autoRetry || false}
                onCheckedChange={(checked) => handleChange('autoRetry', checked)}
              />
              <Label htmlFor="autoRetry" className="cursor-pointer flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Enable automatic retry on failures
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Execute Agent Activation
          </CardTitle>
          <CardDescription>
            Once activated, the Execute Agent will automatically handle all EDI operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">What happens after activation:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
              <li>Execute Agent monitors inbound/outbound flows automatically</li>
              <li>Documents are processed using approved mappings</li>
              <li>Exceptions are flagged for human review only when confidence is low</li>
              <li>All operations are logged for audit purposes</li>
              <li>Real-time monitoring dashboard updates</li>
            </ul>
          </div>

          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Management by Exception</p>
                <p className="text-xs text-muted-foreground">
                  The system operates autonomously. You'll only be notified when the AI has low confidence
                  in its decisions or when business rules are violated.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isReady && (
        <Card className="border-success">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold mb-1">Ready to activate</p>
                <p className="text-sm text-muted-foreground">
                  All configuration steps are complete. Click below to activate this trading partner.
                </p>
              </div>
              <Button onClick={runComplete} disabled={activating} variant="success" size="lg" className="gap-2">
                <Rocket className="w-4 h-4" />
                {activating ? 'Saving…' : 'Activate Partner'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isReady && (
        <Card className="border-warning">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="font-semibold mb-1">Setup incomplete</p>
                <p className="text-sm text-muted-foreground">
                  Please complete all required steps before activating this partner.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
