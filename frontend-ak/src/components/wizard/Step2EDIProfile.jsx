import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';

export const Step2EDIProfile = ({ data, onChange, errors = {} }) => {
  const handleChange = (field, value) => {
    onChange({ [field]: value });
  };

  const handleDelimiterChange = (field, value) => {
    onChange({
      delimiters: {
        ...data.delimiters,
        [field]: value,
      },
    });
  };

  const handleGSIdsChange = (field, value) => {
    onChange({
      gsIds: {
        ...data.gsIds,
        [field]: value,
      },
    });
  };

  const getVersionsForStandard = (standard) => {
    if (standard === 'X12') {
      return ['4010', '4030', '5010'];
    } else if (standard === 'EDIFACT') {
      return ['D96A', 'D97A', 'D98A', 'D99A', 'D00A', 'D01A', 'D02A'];
    } else if (standard === 'TRADACOMS') {
      return ['V1', 'V2'];
    }
    return [];
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Register Partner EDI Profile</h2>
        <p className="text-muted-foreground">
          Configure how this partner communicates using EDI standards. This defines the EDI language they speak.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>EDI Standard Configuration</CardTitle>
          <CardDescription>Select the EDI standard and version used by this partner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ediStandard">EDI Standard *</Label>
              <Select
                value={data.ediStandard}
                onValueChange={(value) => {
                  handleChange('ediStandard', value);
                  handleChange('version', ''); // Reset version when standard changes
                }}
              >
                <SelectTrigger
                  id="ediStandard"
                  aria-invalid={!!errors.ediStandard}
                  className={errors.ediStandard ? 'border-destructive' : undefined}
                >
                  <SelectValue placeholder="Select EDI standard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="X12">X12 (ANSI ASC X12)</SelectItem>
                  <SelectItem value="EDIFACT">EDIFACT (UN/EDIFACT)</SelectItem>
                  <SelectItem value="TRADACOMS">TRADACOMS</SelectItem>
                </SelectContent>
              </Select>
              {errors.ediStandard && <p className="text-xs text-destructive">{errors.ediStandard}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version *</Label>
              <Select
                value={data.version}
                onValueChange={(value) => handleChange('version', value)}
                disabled={!data.ediStandard}
              >
                <SelectTrigger id="version" aria-invalid={!!errors.version} className={errors.version ? 'border-destructive' : undefined}>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {getVersionsForStandard(data.ediStandard).map((version) => (
                    <SelectItem key={version} value={version}>
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.version && <p className="text-xs text-destructive">{errors.version}</p>}
            </div>
          </div>

          {data.ediStandard === 'X12' && (
            <div className="space-y-2">
              <Label htmlFor="functionalGroups">Functional Groups</Label>
              <div className="flex flex-wrap gap-2">
                {['PO', 'IN', 'SH', 'AS', 'FA', 'PR'].map((group) => (
                  <Badge
                    key={group}
                    variant={data.functionalGroups?.includes(group) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      const current = data.functionalGroups || [];
                      const updated = current.includes(group)
                        ? current.filter((g) => g !== group)
                        : [...current, group];
                      handleChange('functionalGroups', updated);
                    }}
                  >
                    {group}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="characterSet">Character Set</Label>
            <Select value={data.characterSet} onValueChange={(value) => handleChange('characterSet', value)}>
              <SelectTrigger id="characterSet">
                <SelectValue placeholder="Select character set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UTF-8">UTF-8</SelectItem>
                <SelectItem value="ASCII">ASCII</SelectItem>
                <SelectItem value="EBCDIC">EBCDIC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delimiters</CardTitle>
          <CardDescription>Character delimiters used in EDI files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="elementDelimiter">Element Delimiter</Label>
              <Input
                id="elementDelimiter"
                value={data.delimiters?.element || '*'}
                onChange={(e) => handleDelimiterChange('element', e.target.value)}
                maxLength={1}
                placeholder="*"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segmentDelimiter">Segment Delimiter</Label>
              <Input
                id="segmentDelimiter"
                value={data.delimiters?.segment || '~'}
                onChange={(e) => handleDelimiterChange('segment', e.target.value)}
                maxLength={1}
                placeholder="~"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subElementDelimiter">Sub-Element Delimiter</Label>
              <Input
                id="subElementDelimiter"
                value={data.delimiters?.subElement || '>'}
                onChange={(e) => handleDelimiterChange('subElement', e.target.value)}
                maxLength={1}
                placeholder=">"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Partner Control IDs</CardTitle>
          <CardDescription>Identifiers used in ISA and GS segments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="isaSenderId">ISA Sender ID *</Label>
              <Input
                id="isaSenderId"
                value={data.isaSenderId}
                onChange={(e) => handleChange('isaSenderId', e.target.value.toUpperCase())}
                placeholder="Your company ID"
                maxLength={15}
                aria-invalid={!!errors.isaSenderId}
                className={errors.isaSenderId ? 'border-destructive' : undefined}
              />
              {errors.isaSenderId && <p className="text-xs text-destructive">{errors.isaSenderId}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="isaReceiverId">ISA Receiver ID *</Label>
              <Input
                id="isaReceiverId"
                value={data.isaReceiverId}
                onChange={(e) => handleChange('isaReceiverId', e.target.value.toUpperCase())}
                placeholder="Partner's company ID"
                maxLength={15}
                aria-invalid={!!errors.isaReceiverId}
                className={errors.isaReceiverId ? 'border-destructive' : undefined}
              />
              {errors.isaReceiverId && <p className="text-xs text-destructive">{errors.isaReceiverId}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gsSenderId">GS Sender ID</Label>
              <Input
                id="gsSenderId"
                value={data.gsIds?.sender || ''}
                onChange={(e) => handleGSIdsChange('sender', e.target.value)}
                placeholder="GS sender identifier"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gsReceiverId">GS Receiver ID</Label>
              <Input
                id="gsReceiverId"
                value={data.gsIds?.receiver || ''}
                onChange={(e) => handleGSIdsChange('receiver', e.target.value)}
                placeholder="GS receiver identifier"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              These IDs are used to identify your company and the trading partner in EDI transactions.
              They must match exactly what the partner expects.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
