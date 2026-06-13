import React, { useState } from 'react';
import { Link2, CheckCircle2, AlertCircle, Brain, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import api from '@/services/api';

const DEFAULT_MAPPINGS = [
    {
      id: 1,
      source: 'BIG02',
      target: 'invoiceNumber',
      confidence: 95,
      status: 'approved',
      explanation: 'High confidence match based on field name and position',
    },
    {
      id: 2,
      source: 'N1*01',
      target: 'buyer.name',
      confidence: 87,
      status: 'pending',
      explanation: 'Segment N1 typically contains name information',
    },
    {
      id: 3,
      source: 'IT1*01',
      target: 'lineItems[].productCode',
      confidence: 92,
      status: 'approved',
      explanation: 'IT1 segment maps to line items with high confidence',
    },
  ];

export const Step6Mapping = ({ data, onChange, errors = {} }) => {
  const [suggestedMappings, setSuggestedMappings] = useState(data.aiMappings || DEFAULT_MAPPINGS);
  const [generating, setGenerating] = useState(false);

  const handleGenerateMapping = async () => {
    setGenerating(true);
    try {
      const sourceSchema = { segments: ['BEG', 'N1', 'N2', 'N3', 'N4', 'IT1', 'CTT', 'SE'], document_type: '850' };
      const x12Schema = { segments: { BEG: { elements: 6 }, N1: { elements: 4 }, IT1: { elements: 12 } }, document_type: '850' };
      const res = await api.post('/ai/generate-mapping', {
        source_schema: sourceSchema,
        x12_schema: x12Schema,
        document_type: '850',
      });
      const fm = res.data?.mapping?.field_mappings || [];
      const mapped = fm.map((m, i) => ({
        id: i + 1,
        source: m.source_field || m.source,
        target: m.target_field || m.target,
        confidence: Math.round((m.confidence || 0.85) * 100),
        status: 'pending',
        explanation: m.reason || 'AI-suggested mapping',
      }));
      if (mapped.length > 0) {
        setSuggestedMappings(mapped);
        onChange({ aiMappings: mapped, mappings: [...(data.mappings || []), ...mapped] });
      }
    } catch (e) {
      console.error('Generate mapping failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveMapping = (id) => {
    const mapping = suggestedMappings.find((m) => m.id === id);
    if (mapping) {
      const updated = suggestedMappings.map((m) => (m.id === id ? { ...m, status: 'approved' } : m));
      setSuggestedMappings(updated);
      onChange({ mappings: [...(data.mappings || []).filter((x) => x.id !== id), { ...mapping, status: 'approved' }] });
    }
  };

  const handleRejectMapping = (id) => {
    // Remove from suggestions or mark as rejected
    console.log('Reject mapping:', id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Build Mapping</h2>
        <p className="text-muted-foreground">
          The Build Agent suggests mappings between partner EDI structure and your canonical data model. Review and approve.
        </p>
      </div>

      {errors.mappings && <p className="text-sm text-destructive">{errors.mappings}</p>}

      <Card className="bg-warning-bg border-warning">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Mapping Agent (Assist Mode)
          </CardTitle>
          <CardDescription>
            Generate mapping suggestions via /generate-mapping. Review and approve before use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGenerateMapping} disabled={generating} variant="outline" className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Generate AI Mapping'}
          </Button>
            <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-warning-foreground">
              {suggestedMappings.length}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Mapping suggestions generated</p>
              <p className="text-xs text-muted-foreground">
                Average confidence:{' '}
                {suggestedMappings.length
                  ? Math.round(suggestedMappings.reduce((acc, m) => acc + m.confidence, 0) / suggestedMappings.length)
                  : 0}
                %
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapping Visualization</CardTitle>
          <CardDescription>
            Visual representation of EDI to Canonical JSON mappings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 p-6 border border-border rounded-lg bg-muted/30">
            {/* Source: Partner EDI */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground mb-4">Source: Partner EDI</h3>
              <div className="space-y-2">
                {suggestedMappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="p-3 bg-card border border-border rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {mapping.source}
                      </Badge>
                      <span className="text-xs text-muted-foreground">String</span>
                    </div>
                    <Link2 className="w-4 h-4 text-primary" />
                  </div>
                ))}
              </div>
            </div>

            {/* Target: Canonical JSON */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground mb-4">Target: Canonical JSON</h3>
              <div className="space-y-2">
                {suggestedMappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="p-3 bg-card border border-border rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="font-mono text-xs">
                        {mapping.target}
                      </Badge>
                      <span className="text-xs text-muted-foreground">String</span>
                    </div>
                    {mapping.status === 'approved' ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-warning" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapping Suggestions</CardTitle>
          <CardDescription>Review AI-suggested mappings with confidence scores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestedMappings.map((mapping) => (
            <div
              key={mapping.id}
              className={`p-4 border rounded-lg ${
                mapping.status === 'approved'
                  ? 'border-success bg-success-bg'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className="font-mono">
                      {mapping.source}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="default" className="font-mono">
                      {mapping.target}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{mapping.explanation}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confidence:</span>
                    <Progress value={mapping.confidence} className="h-1.5 w-24" />
                    <span className="text-xs font-medium">{mapping.confidence}%</span>
                  </div>
                </div>
                {mapping.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleApproveMapping(mapping.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRejectMapping(mapping.id)}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {mapping.status === 'approved' && (
                  <Badge variant="success" className="gap-1.5">
                    <CheckCircle2 className="w-3 h-3" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapping Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Approved Mappings:</span>
              <span className="font-medium">
                {suggestedMappings.filter((m) => m.status === 'approved').length} / {suggestedMappings.length}
              </span>
            </div>
            <Progress
              value={
                (suggestedMappings.filter((m) => m.status === 'approved').length /
                  suggestedMappings.length) *
                100
              }
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
