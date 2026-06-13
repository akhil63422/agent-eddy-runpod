import React from 'react';
import { Server, Cloud, Globe, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const TRANSPORT_TYPES = [
  { value: 'SFTP', label: 'SFTP', icon: Server, description: 'Secure File Transfer Protocol' },
  { value: 'AS2', label: 'AS2', icon: Lock, description: 'Applicability Statement 2' },
  { value: 'API', label: 'REST API', icon: Globe, description: 'HTTP/REST API endpoint' },
  { value: 'S3', label: 'Cloud Bucket (S3)', icon: Cloud, description: 'AWS S3 or compatible' },
];

export const Step7Transport = ({ data, onChange, errors = {} }) => {
  const handleChange = (field, value) => {
    onChange({
      transportConfig: {
        ...data.transportConfig,
        [field]: value,
      },
    });
  };

  const handleTransportTypeChange = (value) => {
    onChange({
      transportType: value,
      transportConfig: {}, // Reset config when type changes
    });
  };

  const renderTransportConfig = () => {
    if (!data.transportType) return null;

    switch (data.transportType) {
      case 'SFTP':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sftpHost">Host / Server *</Label>
                <Input
                  id="sftpHost"
                  value={data.transportConfig?.host || ''}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="sftp.partner.com"
                  aria-invalid={!!errors.transportHost}
                  className={errors.transportHost ? 'border-destructive' : undefined}
                />
                {errors.transportHost && <p className="text-xs text-destructive">{errors.transportHost}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sftpPort">Port</Label>
                <Input
                  id="sftpPort"
                  type="number"
                  value={data.transportConfig?.port || '22'}
                  onChange={(e) => handleChange('port', e.target.value)}
                  placeholder="22"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sftpUsername">Username *</Label>
                <Input
                  id="sftpUsername"
                  value={data.transportConfig?.username || ''}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="sftp_user"
                  aria-invalid={!!errors.transportUsername}
                  className={errors.transportUsername ? 'border-destructive' : undefined}
                />
                {errors.transportUsername && (
                  <p className="text-xs text-destructive">{errors.transportUsername}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sftpPassword">Password / Key</Label>
                <Input
                  id="sftpPassword"
                  type="password"
                  value={data.transportConfig?.password || ''}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sftpPath">Remote Path</Label>
              <Input
                id="sftpPath"
                value={data.transportConfig?.path || ''}
                onChange={(e) => handleChange('path', e.target.value)}
                placeholder="/inbound/edi"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sftpEncryption"
                checked={data.transportConfig?.encryption || false}
                onCheckedChange={(checked) => handleChange('encryption', checked)}
              />
              <Label htmlFor="sftpEncryption" className="cursor-pointer">
                Enable encryption (SSH)
              </Label>
            </div>
          </div>
        );

      case 'AS2':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="as2Url">AS2 URL *</Label>
              <Input
                id="as2Url"
                value={data.transportConfig?.url || ''}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://as2.partner.com/as2"
                aria-invalid={!!errors.transportUrl}
                className={errors.transportUrl ? 'border-destructive' : undefined}
              />
              {errors.transportUrl && <p className="text-xs text-destructive">{errors.transportUrl}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="as2SenderId">AS2 Sender ID *</Label>
                <Input
                  id="as2SenderId"
                  value={data.transportConfig?.senderId || ''}
                  onChange={(e) => handleChange('senderId', e.target.value)}
                  placeholder="Your AS2 ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as2ReceiverId">AS2 Receiver ID *</Label>
                <Input
                  id="as2ReceiverId"
                  value={data.transportConfig?.receiverId || ''}
                  onChange={(e) => handleChange('receiverId', e.target.value)}
                  placeholder="Partner AS2 ID"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="as2Certificate">Certificate (PEM)</Label>
              <Textarea
                id="as2Certificate"
                value={data.transportConfig?.certificate || ''}
                onChange={(e) => handleChange('certificate', e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----..."
                rows={4}
                className="font-mono text-xs"
              />
            </div>
          </div>
        );

      case 'API':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiEndpoint">API Endpoint URL *</Label>
              <Input
                id="apiEndpoint"
                value={data.transportConfig?.endpoint || ''}
                onChange={(e) => handleChange('endpoint', e.target.value)}
                placeholder="https://api.partner.com/v1/edi"
                aria-invalid={!!errors.transportEndpoint}
                className={errors.transportEndpoint ? 'border-destructive' : undefined}
              />
              {errors.transportEndpoint && (
                <p className="text-xs text-destructive">{errors.transportEndpoint}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={data.transportConfig?.apiKey || ''}
                  onChange={(e) => handleChange('apiKey', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiMethod">HTTP Method</Label>
                <Select
                  value={data.transportConfig?.method || 'POST'}
                  onValueChange={(value) => handleChange('method', value)}
                >
                  <SelectTrigger id="apiMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiHeaders">Custom Headers (JSON)</Label>
              <Textarea
                id="apiHeaders"
                value={data.transportConfig?.headers || ''}
                onChange={(e) => handleChange('headers', e.target.value)}
                placeholder='{"Content-Type": "application/json"}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>
        );

      case 'S3':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s3Bucket">Bucket Name *</Label>
              <Input
                id="s3Bucket"
                value={data.transportConfig?.bucket || ''}
                onChange={(e) => handleChange('bucket', e.target.value)}
                placeholder="partner-edi-bucket"
                aria-invalid={!!errors.transportBucket}
                className={errors.transportBucket ? 'border-destructive' : undefined}
              />
              {errors.transportBucket && (
                <p className="text-xs text-destructive">{errors.transportBucket}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="s3Region">Region</Label>
              <Input
                id="s3Region"
                value={data.transportConfig?.region || ''}
                onChange={(e) => handleChange('region', e.target.value)}
                placeholder="us-east-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s3AccessKey">Access Key ID</Label>
                <Input
                  id="s3AccessKey"
                  value={data.transportConfig?.accessKey || ''}
                  onChange={(e) => handleChange('accessKey', e.target.value)}
                  placeholder="AKIA..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3SecretKey">Secret Access Key</Label>
                <Input
                  id="s3SecretKey"
                  type="password"
                  value={data.transportConfig?.secretKey || ''}
                  onChange={(e) => handleChange('secretKey', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s3Prefix">Path Prefix</Label>
              <Input
                id="s3Prefix"
                value={data.transportConfig?.prefix || ''}
                onChange={(e) => handleChange('prefix', e.target.value)}
                placeholder="inbound/edi/"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Configure Transport</h2>
        <p className="text-muted-foreground">
          Set up how EDI files will be transferred between you and this partner. Configure secure connectivity.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transport Method</CardTitle>
          <CardDescription>Select how files will be exchanged with this partner</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {TRANSPORT_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = data.transportType === type.value;

              return (
                <button
                  key={type.value}
                  onClick={() => handleTransportTypeChange(type.value)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-6 h-6 mt-0.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{type.label}</div>
                      <div className="text-sm text-muted-foreground">{type.description}</div>
                    </div>
                    {isSelected && <Badge variant="default">Selected</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
          {errors.transportType && <p className="text-sm text-destructive mt-2">{errors.transportType}</p>}
        </CardContent>
      </Card>

      {data.transportType && (
        <Card>
          <CardHeader>
            <CardTitle>{TRANSPORT_TYPES.find((t) => t.value === data.transportType)?.label} Configuration</CardTitle>
            <CardDescription>Configure connection details for {data.transportType}</CardDescription>
          </CardHeader>
          <CardContent>{renderTransportConfig()}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Schedule & Triggers</CardTitle>
          <CardDescription>When should files be transferred?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schedule">Transfer Schedule</Label>
            <Select
              value={data.transportConfig?.schedule || 'event'}
              onValueChange={(value) => handleChange('schedule', value)}
            >
              <SelectTrigger id="schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Event-driven (real-time)</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="manual">Manual trigger only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoRetry"
              checked={data.transportConfig?.autoRetry || false}
              onCheckedChange={(checked) => handleChange('autoRetry', checked)}
            />
            <Label htmlFor="autoRetry" className="cursor-pointer">
              Enable automatic retry on failure
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
