import React, { useState } from 'react';
import { Upload, Play, CheckCircle2, XCircle, AlertTriangle, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const Step8Testing = ({ data, onChange }) => {
  const [testFile, setTestFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const testResults = Array.isArray(data.testResults) ? data.testResults : [];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTestFile(file);
    }
  };

  const runSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const mockResults = [
        {
          id: 1,
          test: 'Structure Validation',
          status: 'passed',
          message: 'All segments and elements are valid',
        },
        {
          id: 2,
          test: 'Business Rules',
          status: 'passed',
          message: 'All business rules validated successfully',
        },
        {
          id: 3,
          test: 'Mapping Accuracy',
          status: 'warning',
          message: '1 field mapping has low confidence (87%)',
        },
        {
          id: 4,
          test: 'ACK Generation',
          status: 'passed',
          message: 'Functional acknowledgment generated correctly',
        },
      ];
      setIsRunning(false);
      onChange({ testResults: mockResults });
    }, 2000);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'passed':
        return { variant: 'success', icon: CheckCircle2 };
      case 'failed':
        return { variant: 'error', icon: XCircle };
      case 'warning':
        return { variant: 'warning', icon: AlertTriangle };
      default:
        return { variant: 'secondary', icon: FileText };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Test & Simulate</h2>
        <p className="text-muted-foreground">
          Validate your configuration with test files. Simulate inbound and outbound flows before going live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test status & notes</CardTitle>
          <CardDescription>Stored with the partner for your testing workflow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="testStatus">Test status</Label>
              <Select
                value={data.testStatus || undefined}
                onValueChange={(value) => onChange({ testStatus: value })}
              >
                <SelectTrigger id="testStatus">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not started">Not started</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Testing">Testing</SelectItem>
                  <SelectItem value="Passed">Passed</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastTestDate">Last test date</Label>
              <Input
                id="lastTestDate"
                type="date"
                value={data.lastTestDate || ''}
                onChange={(e) => onChange({ lastTestDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="testNotes">Test notes</Label>
            <Textarea
              id="testNotes"
              value={data.testNotes || ''}
              onChange={(e) => onChange({ testNotes: e.target.value })}
              placeholder="Add any notes or observations from testing..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Test File</CardTitle>
          <CardDescription>Upload a sample EDI file to test the configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <Label htmlFor="testFile" className="cursor-pointer">
              <span className="text-primary hover:underline">Click to upload</span> or drag and drop
            </Label>
            <Input
              id="testFile"
              type="file"
              accept=".edi,.txt,.x12"
              className="hidden"
              onChange={handleFileUpload}
            />
            <p className="text-xs text-muted-foreground mt-2">
              EDI, TXT files (MAX. 5MB)
            </p>
          </div>

          {testFile && (
            <div className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{testFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(testFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button onClick={runSimulation} disabled={isRunning}>
                <Play className="w-4 h-4 mr-2" />
                {isRunning ? 'Running Tests...' : 'Run Simulation'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isRunning && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Running validation tests...</span>
                <span className="font-medium">Processing</span>
              </div>
              <Progress value={65} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Validating structure, business rules, and mappings...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {testResults.length > 0 && !isRunning && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>
                Validation results from the test simulation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {testResults.map((result) => {
                const statusInfo = getStatusBadge(result.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div
                    key={result.id}
                    className={`p-4 border rounded-lg ${
                      result.status === 'passed'
                        ? 'border-success bg-success-bg'
                        : result.status === 'failed'
                        ? 'border-error bg-error-bg'
                        : 'border-warning bg-warning-bg'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <StatusIcon className={`w-5 h-5 mt-0.5 ${
                          result.status === 'passed'
                            ? 'text-success'
                            : result.status === 'failed'
                            ? 'text-error'
                            : 'text-warning'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{result.test}</span>
                            <Badge variant={statusInfo.variant} className="text-xs">
                              {result.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{result.message}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="text-2xl font-bold text-success mb-1">
                    {testResults.filter((r) => r.status === 'passed').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="text-2xl font-bold text-warning mb-1">
                    {testResults.filter((r) => r.status === 'warning').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </div>
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="text-2xl font-bold text-error mb-1">
                    {testResults.filter((r) => r.status === 'failed').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Simulation Options</CardTitle>
          <CardDescription>Configure what to test during simulation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="simulationType">Simulation Type</Label>
            <select
              id="simulationType"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              defaultValue="full"
            >
              <option value="full">Full End-to-End</option>
              <option value="structure">Structure Only</option>
              <option value="mapping">Mapping Only</option>
              <option value="business">Business Rules Only</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
