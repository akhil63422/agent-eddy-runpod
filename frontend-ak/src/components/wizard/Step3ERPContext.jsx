import React, { useState } from 'react';
import { AlertTriangle, Info, Database, Globe, Key, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const Step3ERPContext = ({ data, onChange, onSkip }) => {
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  const handleChange = (field, value) => {
    onChange({
      erpContext: {
        ...data.erpContext,
        [field]: value,
      },
    });
  };

  const handlePartnerERPChange = (field, value) => {
    onChange({
      erpContext: {
        ...data.erpContext,
        partnerERP: {
          ...data.erpContext?.partnerERP,
          [field]: value,
        },
      },
    });
  };

  const handleTargetSystemChange = (field, value) => {
    const updates = {
      erpContext: {
        ...data.erpContext,
        targetSystem: {
          ...data.erpContext?.targetSystem,
          [field]: value,
        },
      },
    };
    if (field === 'system') {
      updates.erpContext.type = value;  // Sync type for posting
    }
    onChange(updates);
  };

  const handleCredentialsChange = (field, value) => {
    onChange({
      erpContext: {
        ...data.erpContext,
        [field]: value,
      },
    });
  };

  const handleTestConnection = async () => {
    const endpoint = data.erpContext?.endpoint;
    const apiKey = data.erpContext?.api_key;
    if (!endpoint) {
      setConnectionResult({ ok: false, message: 'Endpoint required' });
      return;
    }
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const api = (await import('@/services/api')).default;
      const res = await api.post('/partners/test-erp-connection', {
        endpoint,
        api_key: apiKey,
        type: data.erpContext?.targetSystem?.system || data.erpContext?.type || 'API',
      });
      setConnectionResult({ ok: res.data?.success !== false, message: res.data?.message || 'Connected' });
    } catch (e) {
      setConnectionResult({ ok: false, message: e.response?.data?.detail || e.message || 'Connection failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Optional Badge */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-semibold">ERP & System Context</h2>
          <Badge variant="secondary">Optional</Badge>
        </div>
        <p className="text-muted-foreground">
          If known, this helps us optimize mappings and analytics. You can skip this and add it later.
        </p>
      </div>

      {/* Warning Banner */}
      <Card className="bg-warning-bg border-warning">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-foreground mb-1">
                This step is optional
              </p>
              <p className="text-xs text-muted-foreground">
                ERP context is metadata only and doesn't block setup. However, inbound/outbound execution 
                will require target system configuration before go-live.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section A: Partner System Context */}
      <Card>
        <CardHeader>
          <CardTitle>Partner System Context (Optional)</CardTitle>
          <CardDescription>
            Information about the partner's backend system. Used for pattern inference and analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partnerERP">Partner Backend System</Label>
            <Select
              value={data.erpContext?.partnerERP?.system || 'Unknown'}
              onValueChange={(value) => handlePartnerERPChange('system', value)}
            >
              <SelectTrigger id="partnerERP">
                <SelectValue placeholder="Select ERP system" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Unknown">Unknown</SelectItem>
                <SelectItem value="SAP">SAP</SelectItem>
                <SelectItem value="Oracle">Oracle</SelectItem>
                <SelectItem value="NetSuite">NetSuite</SelectItem>
                <SelectItem value="Dynamics">Microsoft Dynamics</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data.erpContext?.partnerERP?.system && 
           data.erpContext?.partnerERP?.system !== 'Unknown' && 
           data.erpContext?.partnerERP?.system !== 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="erpVersion">ERP Version</Label>
              <Input
                id="erpVersion"
                value={data.erpContext?.partnerERP?.version || ''}
                onChange={(e) => handlePartnerERPChange('version', e.target.value)}
                placeholder="e.g., SAP ECC 6.0, Oracle EBS 12.2"
              />
            </div>
          )}

          {data.erpContext?.partnerERP?.system === 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="partnerERPCustom">Custom ERP Name</Label>
              <Input
                id="partnerERPCustom"
                value={data.erpContext?.partnerERP?.customName || ''}
                onChange={(e) => handlePartnerERPChange('customName', e.target.value)}
                placeholder="Enter custom ERP system name"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasCustomizations"
              checked={data.erpContext?.partnerERP?.hasCustomizations || false}
              onCheckedChange={(checked) => handlePartnerERPChange('hasCustomizations', checked)}
            />
            <Label htmlFor="hasCustomizations" className="cursor-pointer">
              Partner has customizations/modifications
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="partnerNotes">Notes</Label>
            <Textarea
              id="partnerNotes"
              value={data.erpContext?.partnerERP?.notes || ''}
              onChange={(e) => handlePartnerERPChange('notes', e.target.value)}
              placeholder="Any additional notes about partner's system..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section B: Your Internal Target System */}
      <Card>
        <CardHeader>
          <CardTitle>Your Internal Target System</CardTitle>
          <CardDescription>
            Where EDI data will be integrated. Mandatory before go-live, optional now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targetSystem">Target System *</Label>
            <Select
              value={data.erpContext?.targetSystem?.system || ''}
              onValueChange={(value) => handleTargetSystemChange('system', value)}
            >
              <SelectTrigger id="targetSystem">
                <SelectValue placeholder="Select target system" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SAP">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>SAP</span>
                  </div>
                </SelectItem>
                <SelectItem value="Oracle">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>Oracle</span>
                  </div>
                </SelectItem>
                <SelectItem value="Database">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>Database</span>
                  </div>
                </SelectItem>
                <SelectItem value="API">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>REST API</span>
                  </div>
                </SelectItem>
                <SelectItem value="File">File System</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data.erpContext?.targetSystem?.system && (
            <>
              <div className="space-y-2">
                <Label htmlFor="integrationMethod">Integration Method</Label>
                <Select
                  value={data.erpContext?.targetSystem?.integrationMethod || ''}
                  onValueChange={(value) => handleTargetSystemChange('integrationMethod', value)}
                >
                  <SelectTrigger id="integrationMethod">
                    <SelectValue placeholder="Select integration method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="API">API</SelectItem>
                    <SelectItem value="File">File</SelectItem>
                    <SelectItem value="DB">Database</SelectItem>
                    <SelectItem value="Message Queue">Message Queue</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataOwner">Data Owner</Label>
                <Input
                  id="dataOwner"
                  value={data.erpContext?.targetSystem?.dataOwner || ''}
                  onChange={(e) => handleTargetSystemChange('dataOwner', e.target.value)}
                  placeholder="e.g., Finance Team, Operations"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Team or department responsible for this data
                </p>
              </div>

              {/* Endpoint & API Key for posting */}
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="erpEndpoint" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Endpoint URL *
                </Label>
                <Input
                  id="erpEndpoint"
                  value={data.erpContext?.endpoint || ''}
                  onChange={(e) => handleCredentialsChange('endpoint', e.target.value)}
                  placeholder="https://api.erp.com/v1/orders"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erpApiKey" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  API Key (masked)
                </Label>
                <Input
                  id="erpApiKey"
                  type="password"
                  value={data.erpContext?.api_key || ''}
                  onChange={(e) => handleCredentialsChange('api_key', e.target.value)}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">
                  Stored for posting; shown masked in UI
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !data.erpContext?.endpoint}
                >
                  {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </Button>
                {connectionResult && (
                  <span className={`text-sm ${connectionResult.ok ? 'text-[var(--status-success-text)]' : 'text-destructive'}`}>
                    {connectionResult.message}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Warning if skipped */}
          {!data.erpContext?.targetSystem?.system && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Note:</span> Inbound/outbound execution will require this 
                configuration before go-live.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card about Agent Use */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Internal Use (Agent)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• ERP context is metadata only - no logic depends on it yet</p>
            <p>• Used for: Pattern inference, future suggestions, analytics enrichment</p>
            <p>• Can be added or updated later without affecting existing mappings</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
