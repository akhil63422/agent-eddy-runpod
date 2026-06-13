import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  ExternalLink,
  User,
  Activity,
  Shield,
  Clock,
  FileText,
  Link2,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Settings,
  Send,
  Brain
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export const AuditLogDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Mock audit log detail data - in real app, this would come from API based on id
  const auditLogData = {
    id: id || 'AUD_001',
    timestamp: '2024-01-15 10:42:23',
    date: '2024-01-15',
    time: '10:42 AM',
    user: 'John Doe',
    userType: 'Human',
    userEmail: 'john.doe@company.com',
    action: 'Exception Resolved',
    actionType: 'Exception',
    entity: 'PO_8932',
    entityType: 'Document',
    partner: 'Walmart',
    partnerCode: 'WMT',
    details: 'Resolved low confidence exception - Approved AI suggestion for PO number format',
    fullDetails: `The system detected a low confidence exception (45%) for Purchase Order PO_8932 from Walmart. 
    The AI agent suggested a format correction for the PO number field: changing "PO893245" to "PO-893245" 
    based on historical patterns. User John Doe reviewed and approved the suggestion, resolving the exception. 
    The document was then successfully processed and sent to the ERP system.`,
    ipAddress: '192.168.1.45',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    result: 'Success',
    duration: '2.3 seconds',
    metadata: {
      confidence: 92,
      previousValue: 'PO893245',
      newValue: 'PO-893245',
      aiModel: 'GPT-4',
      processingTime: '2.3s',
    },
    relatedLogs: [
      {
        id: 'AUD_002',
        timestamp: '2024-01-15 10:35:12',
        action: 'Exception Created',
        actionType: 'Exception',
        result: 'Warning',
      },
      {
        id: 'AUD_003',
        timestamp: '2024-01-15 10:43:15',
        action: 'Document Processed',
        actionType: 'Processing',
        result: 'Success',
      },
    ],
  };

  const getActionTypeBadge = (actionType) => {
    const typeConfig = {
      'Exception': { bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', icon: AlertTriangle },
      'Processing': { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-[var(--status-info-text)]', icon: Activity },
      'Configuration': { bg: 'bg-primary/10', text: 'text-primary', icon: Settings },
      'Transport': { bg: 'bg-muted', text: 'text-muted-foreground', icon: Send },
      'Security': { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-[var(--status-error-text)]', icon: Shield },
      'AI': { bg: 'bg-[var(--bg-subtle)]', text: 'text-green-700 dark:text-[var(--status-success-text)]', icon: Brain },
    };

    const config = typeConfig[actionType] || typeConfig['Processing'];
    const Icon = config.icon;
    return (
      <Badge variant="secondary" className={`${config.bg} ${config.text} border-0 gap-1.5`}>
        <Icon className="w-3 h-3" />
        {actionType}
      </Badge>
    );
  };

  const getResultBadge = (result) => {
    const resultConfig = {
      'Success': { bg: 'bg-[var(--bg-subtle)]', text: 'text-green-700 dark:text-[var(--status-success-text)]', icon: CheckCircle2 },
      'Warning': { bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', icon: AlertTriangle },
      'Error': { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-[var(--status-error-text)]', icon: XCircle },
      'Info': { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-[var(--status-info-text)]', icon: Info },
    };

    const config = resultConfig[result] || resultConfig['Info'];
    const Icon = config.icon;
    return (
      <Badge variant="secondary" className={`${config.bg} ${config.text} border-0 gap-1.5`}>
        <Icon className="w-3 h-3" />
        {result}
      </Badge>
    );
  };

  const handleViewEntity = (e) => {
    if (e) e.stopPropagation();
    if (auditLogData.entity.includes('PO_') || auditLogData.entity.includes('INV_') || auditLogData.entity.includes('ASN_')) {
      navigate(`/document/${auditLogData.entity}`);
    } else if (auditLogData.entity.includes('PARTNER')) {
      navigate('/partners');
    } else if (auditLogData.entity.includes('MAPPING')) {
      navigate('/mapper');
    }
  };

  const handleViewRelatedLog = (logId) => {
    navigate(`/audit/${logId}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/audit')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Audit Log Detail</h1>
            <p className="text-muted-foreground mt-1">
              Event ID: <span className="font-mono">{auditLogData.id}</span>
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export Details
        </Button>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Action Type</p>
                <div className="mt-2">
                  {getActionTypeBadge(auditLogData.actionType)}
                </div>
              </div>
              <Activity className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Result</p>
                <div className="mt-2">
                  {getResultBadge(auditLogData.result)}
                </div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-[var(--status-success-text)] opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="text-2xl font-bold mt-1">{auditLogData.duration}</p>
              </div>
              <Clock className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Timestamp</p>
                <p className="text-sm font-medium mt-1">{auditLogData.time}</p>
                <p className="text-xs text-muted-foreground">{auditLogData.date}</p>
              </div>
              <Clock className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Details */}
          <Card>
            <CardHeader>
              <CardTitle>Action Details</CardTitle>
              <CardDescription>Information about the performed action</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Action</p>
                  <p className="font-semibold text-lg">{auditLogData.action}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Action Type</p>
                  <div>{getActionTypeBadge(auditLogData.actionType)}</div>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Description</p>
                <p className="text-sm">{auditLogData.details}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Full Details</p>
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm leading-relaxed">{auditLogData.fullDetails}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Entity Information */}
          <Card>
            <CardHeader>
              <CardTitle>Entity Information</CardTitle>
              <CardDescription>Details about the affected entity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {auditLogData.entityType === 'Document' && <FileText className="w-5 h-5 text-primary" />}
                  {auditLogData.entityType === 'Mapping' && <Link2 className="w-5 h-5 text-primary" />}
                  {auditLogData.entityType === 'Partner' && <Building2 className="w-5 h-5 text-primary" />}
                  {auditLogData.entityType === 'User' && <User className="w-5 h-5 text-primary" />}
                  <div>
                    <p className="font-mono font-semibold text-lg">{auditLogData.entity}</p>
                    <p className="text-sm text-muted-foreground">{auditLogData.entityType}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={(e) => handleViewEntity(e)} className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  View Entity
                </Button>
              </div>
              {auditLogData.partner !== 'N/A' && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Trading Partner</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{auditLogData.partner}</Badge>
                        {auditLogData.partnerCode && (
                          <span className="text-xs text-muted-foreground font-mono">({auditLogData.partnerCode})</span>
                        )}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        // Navigate to partners list - in real app, would use partner ID from entity
                        navigate('/partners');
                      }}
                    >
                      View Partner
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          {auditLogData.metadata && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
                <CardDescription>Additional technical information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(auditLogData.metadata).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs text-muted-foreground mb-1">
                        {key.split(/(?=[A-Z])/).join(' ')}
                      </p>
                      <p className="font-medium">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* User Information */}
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {auditLogData.user.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{auditLogData.user}</p>
                  <p className="text-sm text-muted-foreground">{auditLogData.userEmail}</p>
                </div>
              </div>
              <Separator />
              <div>
                <Badge variant={auditLogData.userType === 'Human' ? 'outline' : 'secondary'} className="gap-1.5">
                  {auditLogData.userType === 'Human' ? (
                    <>
                      <User className="w-3 h-3" />
                      Human User
                    </>
                  ) : (
                    <>
                      <Activity className="w-3 h-3" />
                      AI Agent
                    </>
                  )}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Request Information */}
          <Card>
            <CardHeader>
              <CardTitle>Request Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                <p className="font-mono text-sm">{auditLogData.ipAddress}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">User Agent</p>
                <p className="text-xs font-mono break-all">{auditLogData.userAgent}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                <p className="font-mono text-sm">{auditLogData.timestamp}</p>
              </div>
            </CardContent>
          </Card>

          {/* Related Logs */}
          {auditLogData.relatedLogs && auditLogData.relatedLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Related Events</CardTitle>
                <CardDescription>Other audit logs related to this event</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditLogData.relatedLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleViewRelatedLog(log.id)}
                    >
                      <div className="flex-1">
                        <p className="text-xs font-mono text-muted-foreground">{log.id}</p>
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-muted-foreground">{log.timestamp}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getResultBadge(log.result)}
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
