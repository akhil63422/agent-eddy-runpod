import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export const Step1BusinessPartner = ({ data, onChange, errors = {} }) => {
  const handleChange = (field, value) => {
    onChange({ [field]: value });
  };

  const handleContactChange = (type, field, value) => {
    onChange({
      [type]: {
        ...data[type],
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Add Business Partner</h2>
        <p className="text-muted-foreground">
          Register the business entity. This creates the partner record before any EDI configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Basic details about the trading partner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Legal Business Name *</Label>
              <Input
                id="businessName"
                value={data.businessName}
                onChange={(e) => handleChange('businessName', e.target.value)}
                placeholder="e.g., Walmart Inc."
                aria-invalid={!!errors.businessName}
                className={errors.businessName ? 'border-destructive' : undefined}
              />
              {errors.businessName && <p className="text-xs text-destructive">{errors.businessName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerCode">Trading Partner Code *</Label>
              <Input
                id="partnerCode"
                value={data.partnerCode}
                onChange={(e) => handleChange('partnerCode', e.target.value.toUpperCase())}
                placeholder="e.g., WMT"
                maxLength={100}
                aria-invalid={!!errors.partnerCode}
                className={errors.partnerCode ? 'border-destructive' : undefined}
              />
              <p className="text-xs text-muted-foreground">Internal identifier (max 100 characters)</p>
              {errors.partnerCode && <p className="text-xs text-destructive">{errors.partnerCode}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={data.role || undefined} onValueChange={(value) => handleChange('role', value)}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Customer">Customer</SelectItem>
                  <SelectItem value="Supplier">Supplier</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={data.industry || undefined} onValueChange={(value) => handleChange('industry', value)}>
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Retail">Retail</SelectItem>
                  <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="Logistics">Logistics</SelectItem>
                  <SelectItem value="Healthcare">Healthcare</SelectItem>
                  <SelectItem value="Automotive">Automotive</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country / Region</Label>
              <Input
                id="country"
                value={data.country}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="e.g., United States"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={data.timezone || undefined} onValueChange={(value) => handleChange('timezone', value)}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (CST)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (MST)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={data.status || 'Draft'} onValueChange={(value) => handleChange('status', value)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Draft">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Draft</Badge>
                    <span>Initial setup</span>
                  </div>
                </SelectItem>
                <SelectItem value="Active">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Active</Badge>
                    <span>Production ready</span>
                  </div>
                </SelectItem>
                <SelectItem value="Suspended">
                  <div className="flex items-center gap-2">
                    <Badge variant="error">Suspended</Badge>
                    <span>Temporarily disabled</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Business Contact</CardTitle>
            <CardDescription>Primary business relationship contact</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessContactName">Name</Label>
              <Input
                id="businessContactName"
                value={data.businessContact?.name || ''}
                onChange={(e) => handleContactChange('businessContact', 'name', e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessContactEmail">Email</Label>
              <Input
                id="businessContactEmail"
                type="email"
                value={data.businessContact?.email || ''}
                onChange={(e) => handleContactChange('businessContact', 'email', e.target.value)}
                placeholder="john.doe@company.com"
                aria-invalid={!!errors.businessContactEmail}
                className={errors.businessContactEmail ? 'border-destructive' : undefined}
              />
              {errors.businessContactEmail && (
                <p className="text-xs text-destructive">{errors.businessContactEmail}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessContactPhone">Phone</Label>
              <Input
                id="businessContactPhone"
                type="tel"
                value={data.businessContact?.phone || ''}
                onChange={(e) => handleContactChange('businessContact', 'phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                aria-invalid={!!errors.businessContactPhone}
                className={errors.businessContactPhone ? 'border-destructive' : undefined}
              />
              {errors.businessContactPhone && (
                <p className="text-xs text-destructive">{errors.businessContactPhone}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical Contact</CardTitle>
            <CardDescription>EDI technical support contact</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="technicalContactName">Name</Label>
              <Input
                id="technicalContactName"
                value={data.technicalContact?.name || ''}
                onChange={(e) => handleContactChange('technicalContact', 'name', e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="technicalContactEmail">Email</Label>
              <Input
                id="technicalContactEmail"
                type="email"
                value={data.technicalContact?.email || ''}
                onChange={(e) => handleContactChange('technicalContact', 'email', e.target.value)}
                placeholder="jane.smith@company.com"
                aria-invalid={!!errors.technicalContactEmail}
                className={errors.technicalContactEmail ? 'border-destructive' : undefined}
              />
              {errors.technicalContactEmail && (
                <p className="text-xs text-destructive">{errors.technicalContactEmail}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="technicalContactPhone">Phone</Label>
              <Input
                id="technicalContactPhone"
                type="tel"
                value={data.technicalContact?.phone || ''}
                onChange={(e) => handleContactChange('technicalContact', 'phone', e.target.value)}
                placeholder="+1 (555) 987-6543"
                aria-invalid={!!errors.technicalContactPhone}
                className={errors.technicalContactPhone ? 'border-destructive' : undefined}
              />
              {errors.technicalContactPhone && (
                <p className="text-xs text-destructive">{errors.technicalContactPhone}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
