import React, { useState } from 'react';
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

const DOCUMENT_TYPES = {
  X12: [
    { code: '850', name: 'Purchase Order' },
    { code: '855', name: 'Purchase Order Acknowledgment' },
    { code: '856', name: 'Advance Ship Notice (ASN)' },
    { code: '810', name: 'Invoice' },
    { code: '820', name: 'Payment Order/Remittance Advice' },
    { code: '824', name: 'Application Advice' },
    { code: '830', name: 'Planning Schedule' },
    { code: '846', name: 'Inventory Inquiry/Advice' },
    { code: '997', name: 'Functional Acknowledgment' },
    { code: '999', name: 'Implementation Acknowledgment' },
  ],
  EDIFACT: [
    { code: 'ORDERS', name: 'Purchase Order' },
    { code: 'ORDRSP', name: 'Purchase Order Response' },
    { code: 'DESADV', name: 'Despatch Advice' },
    { code: 'INVOIC', name: 'Invoice' },
    { code: 'PAYORD', name: 'Payment Order' },
    { code: 'INVRPT', name: 'Inventory Report' },
  ],
};

export const Step4Documents = ({ data, onChange, errors = {} }) => {
  const [newDocument, setNewDocument] = useState({
    transactionSet: '',
    direction: '',
    frequency: '',
    acknowledgmentRequired: false,
    sla: { deliveryTime: '', retryRules: '' },
  });

  const availableDocuments = DOCUMENT_TYPES[data.ediStandard] || [];

  const handleAddDocument = () => {
    if (newDocument.transactionSet && newDocument.direction) {
      const documents = data.documents || [];
      onChange({
        documents: [...documents, { ...newDocument, id: Date.now() }],
      });
      setNewDocument({
        transactionSet: '',
        direction: '',
        frequency: '',
        acknowledgmentRequired: false,
        sla: { deliveryTime: '', retryRules: '' },
      });
    }
  };

  const handleRemoveDocument = (id) => {
    const documents = (data.documents || []).filter((doc) => doc.id !== id);
    onChange({ documents });
  };

  const handleDocumentChange = (id, field, value) => {
    const documents = (data.documents || []).map((doc) =>
      doc.id === id ? { ...doc, [field]: value } : doc
    );
    onChange({ documents });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Define Documents Exchanged</h2>
        <p className="text-muted-foreground">
          Specify which EDI documents will flow between you and this partner. This creates the document contract.
        </p>
      </div>

      {errors.documents && <p className="text-sm text-destructive">{errors.documents}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Add Document Agreement</CardTitle>
          <CardDescription>Configure a new document type to exchange with this partner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transactionSet">Transaction Set / Document Type *</Label>
              <Select
                value={newDocument.transactionSet}
                onValueChange={(value) => setNewDocument({ ...newDocument, transactionSet: value })}
              >
                <SelectTrigger id="transactionSet">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {availableDocuments.map((doc) => (
                    <SelectItem key={doc.code} value={doc.code}>
                      {doc.code} - {doc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="direction">Direction *</Label>
              <Select
                value={newDocument.direction}
                onValueChange={(value) => setNewDocument({ ...newDocument, direction: value })}
              >
                <SelectTrigger id="direction">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inbound">
                    <div className="flex items-center gap-2">
                      <ArrowDownToLine className="w-4 h-4" />
                      <span>Inbound (Partner → You)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Outbound">
                    <div className="flex items-center gap-2">
                      <ArrowUpFromLine className="w-4 h-4" />
                      <span>Outbound (You → Partner)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Both">Both Directions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="frequency">Expected Frequency</Label>
              <Select
                value={newDocument.frequency}
                onValueChange={(value) => setNewDocument({ ...newDocument, frequency: value })}
              >
                <SelectTrigger id="frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Real-time">Real-time</SelectItem>
                  <SelectItem value="Hourly">Hourly</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                  <SelectItem value="On-demand">On-demand</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Checkbox
                id="ackRequired"
                checked={newDocument.acknowledgmentRequired}
                onCheckedChange={(checked) =>
                  setNewDocument({ ...newDocument, acknowledgmentRequired: checked })
                }
              />
              <Label htmlFor="ackRequired" className="cursor-pointer">
                Acknowledgment Required
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deliveryTime">SLA - Delivery Time</Label>
              <Input
                id="deliveryTime"
                value={newDocument.sla.deliveryTime}
                onChange={(e) =>
                  setNewDocument({
                    ...newDocument,
                    sla: { ...newDocument.sla, deliveryTime: e.target.value },
                  })
                }
                placeholder="e.g., 2 hours"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retryRules">Retry Rules</Label>
              <Input
                id="retryRules"
                value={newDocument.sla.retryRules}
                onChange={(e) =>
                  setNewDocument({
                    ...newDocument,
                    sla: { ...newDocument.sla, retryRules: e.target.value },
                  })
                }
                placeholder="e.g., 3 attempts, 30min intervals"
              />
            </div>
          </div>

          <Button onClick={handleAddDocument} className="w-full" disabled={!newDocument.transactionSet || !newDocument.direction}>
            <Plus className="w-4 h-4 mr-2" />
            Add Document Agreement
          </Button>
        </CardContent>
      </Card>

      {/* Existing Documents */}
      {data.documents && data.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Configured Documents</CardTitle>
            <CardDescription>{data.documents.length} document agreement(s) configured</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.documents.map((doc) => {
                const docInfo = availableDocuments.find((d) => d.code === doc.transactionSet);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="default">{doc.transactionSet}</Badge>
                        <span className="font-medium">{docInfo?.name || doc.transactionSet}</span>
                        <Badge variant={doc.direction === 'Inbound' ? 'secondary' : 'outline'}>
                          {doc.direction === 'Inbound' ? (
                            <ArrowDownToLine className="w-3 h-3 mr-1" />
                          ) : doc.direction === 'Outbound' ? (
                            <ArrowUpFromLine className="w-3 h-3 mr-1" />
                          ) : null}
                          {doc.direction}
                        </Badge>
                        {doc.acknowledgmentRequired && (
                          <Badge variant="success">ACK Required</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Frequency: {doc.frequency || 'Not specified'} | SLA: {doc.sla?.deliveryTime || 'Not specified'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveDocument(doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
