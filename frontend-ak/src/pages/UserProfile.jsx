import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User,
  LogOut,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Key,
  Bell,
  Activity,
  Edit,
  Save,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Settings,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/sonner';
import { authService } from '@/services/auth';

export const UserProfile = () => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({
    // Personal Information
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    jobTitle: '',
    location: '',
    timezone: 'America/New_York',
    
    // Account Information
    username: '',
    role: '',
    status: 'Active',
    memberSince: '',
    lastLogin: '',
    
    // Security
    twoFactorEnabled: false,
    passwordLastChanged: '2024-01-01',
    
    // Preferences
    emailNotifications: true,
    exceptionAlerts: true,
    dailyDigest: true,
    realTimeAlerts: false,
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    
    // Password Change Form
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      const username = localStorage.getItem('username') || '';
      const role = localStorage.getItem('role') || '';
      setProfile((p) => ({ ...p, username, role }));
      try {
        const user = await authService.getCurrentUser();
        if (user) {
          const fullName = user.full_name || '';
          const [firstName = '', ...rest] = fullName.split(' ');
          const lastName = rest.join(' ') || '';
          setProfile((p) => ({
            ...p,
            username: user.username || username,
            role: user.role || role,
            email: user.email || '',
            firstName,
            lastName,
            memberSince: user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : '',
            lastLogin: user.last_login ? new Date(user.last_login).toLocaleString() : '',
          }));
        }
      } catch {
        setProfile((p) => ({ ...p, username, role }));
      }
    };
    loadUser();
  }, []);

  const [stats] = useState({
    documentsProcessed: 1245,
    exceptionsResolved: 87,
    mappingsCreated: 23,
    partnersManaged: 5,
    lastActivity: '2 hours ago',
  });

  const [recentActivity] = useState([
    {
      id: 'act1',
      action: 'Resolved Exception',
      entity: 'PO_8932',
      timestamp: '2 hours ago',
      type: 'exception',
    },
    {
      id: 'act2',
      action: 'Updated Mapping',
      entity: 'WMT_MAPPING_001',
      timestamp: '5 hours ago',
      type: 'mapping',
    },
    {
      id: 'act3',
      action: 'Processed Document',
      entity: 'INV_4521',
      timestamp: '1 day ago',
      type: 'document',
    },
  ]);

  const handleChange = (key, value) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setIsEditing(false);
    toast.success('Profile updated successfully');
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original values if needed
  };

  const handlePasswordChange = async () => {
    if (profile.newPassword !== profile.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (profile.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setShowPasswordForm(false);
    setProfile(prev => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      passwordLastChanged: new Date().toISOString().split('T')[0],
    }));
    toast.success('Password changed successfully');
  };

  const getInitials = () => {
    if (profile.firstName || profile.lastName) {
      return `${(profile.firstName || ' ').charAt(0)}${(profile.lastName || ' ').charAt(0)}`.toUpperCase().replace(' ', '');
    }
    return (profile.username || 'U').slice(0, 2).toUpperCase();
  };

  const getFullName = () => {
    const full = `${profile.firstName} ${profile.lastName}`.trim();
    return full || profile.username || 'User';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <User className="w-8 h-8 text-primary" />
            User Profile
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your account information and preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
        {!isEditing ? (
          <>
            <Button onClick={() => setIsEditing(true)} className="gap-2">
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
            {authService.isAuthenticated() && (
              <Button
                variant="outline"
                onClick={() => {
                  authService.logout();
                  toast.success('Signed out');
                  navigate('/login');
                }}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* Profile Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <Avatar className="w-24 h-24">
                <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-semibold">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              {isEditing && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute bottom-0 right-0 rounded-full"
                  onClick={() => toast.info('Avatar upload coming soon')}
                >
                  <Camera className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-foreground">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={profile.firstName}
                        onChange={(e) => handleChange('firstName', e.target.value)}
                        className="w-32"
                      />
                      <Input
                        value={profile.lastName}
                        onChange={(e) => handleChange('lastName', e.target.value)}
                        className="w-32"
                      />
                    </div>
                  ) : (
                    getFullName()
                  )}
                </h2>
                <Badge variant={profile.status === 'Active' ? 'secondary' : 'secondary'} className="bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0">
                  {profile.status}
                </Badge>
              </div>
              <div className="space-y-1">
                {isEditing ? (
                  <Input
                    type="email"
                    value={profile.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-64"
                  />
                ) : (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {profile.email || `${profile.username}@example.com`}
                  </p>
                )}
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline">{profile.role}</Badge>
                  <span className="mx-2">•</span>
                  <Calendar className="w-4 h-4" />
                  Member since {profile.memberSince ? new Date(profile.memberSince).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Last Login</p>
              <p className="text-sm font-medium">{profile.lastLogin}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Documents Processed</p>
                <p className="text-2xl font-bold mt-1">{stats.documentsProcessed.toLocaleString()}</p>
              </div>
              <FileText className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Exceptions Resolved</p>
                <p className="text-2xl font-bold mt-1">{stats.exceptionsResolved}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mappings Created</p>
                <p className="text-2xl font-bold mt-1">{stats.mappingsCreated}</p>
              </div>
              <Settings className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Partners Managed</p>
                <p className="text-2xl font-bold mt-1">{stats.partnersManaged}</p>
              </div>
              <User className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-6">
        <TabsList>
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Personal Information */}
        <TabsContent value="personal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Your personal details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  {isEditing ? (
                    <Input
                      id="firstName"
                      value={profile.firstName}
                      onChange={(e) => handleChange('firstName', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium">{profile.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  {isEditing ? (
                    <Input
                      id="lastName"
                      value={profile.lastName}
                      onChange={(e) => handleChange('lastName', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium">{profile.lastName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {profile.email}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      {profile.phone}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  {isEditing ? (
                    <Input
                      id="department"
                      value={profile.department}
                      onChange={(e) => handleChange('department', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium">{profile.department}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Job Title</Label>
                  {isEditing ? (
                    <Input
                      id="jobTitle"
                      value={profile.jobTitle}
                      onChange={(e) => handleChange('jobTitle', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium">{profile.jobTitle}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  {isEditing ? (
                    <Input
                      id="location"
                      value={profile.location}
                      onChange={(e) => handleChange('location', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      {profile.location}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  {isEditing ? (
                    <Select value={profile.timezone} onValueChange={(value) => handleChange('timezone', value)}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm font-medium">{profile.timezone}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details and status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Username</p>
                  <p className="font-mono text-sm font-medium">{profile.username}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Role</p>
                  <Badge variant="outline">{profile.role}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <Badge variant="secondary" className="bg-[var(--bg-subtle)] text-green-700 dark:text-[var(--status-success-text)] border-0">
                    {profile.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                  <p className="text-sm font-medium">
                    {new Date(profile.memberSince).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Security Settings
              </CardTitle>
              <CardDescription>Manage your account security and authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Password Change */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Label className="text-base font-semibold">Password</Label>
                    <p className="text-sm text-muted-foreground">
                      Last changed: {new Date(profile.passwordLastChanged).toLocaleDateString()}
                    </p>
                  </div>
                  {!showPasswordForm ? (
                    <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
                      <Lock className="w-4 h-4 mr-2" />
                      Change Password
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setShowPasswordForm(false)}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </div>
                {showPasswordForm && (
                  <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={profile.currentPassword}
                          onChange={(e) => handleChange('currentPassword', e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={profile.newPassword}
                          onChange={(e) => handleChange('newPassword', e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Password must be at least 8 characters long
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={profile.confirmPassword}
                          onChange={(e) => handleChange('confirmPassword', e.target.value)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button onClick={handlePasswordChange} disabled={saving}>
                      {saving ? (
                        <>
                          <Activity className="w-4 h-4 mr-2 animate-spin" />
                          Changing...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Update Password
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <Separator />
              {/* Two-Factor Authentication */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="twoFactor">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Switch
                  id="twoFactor"
                  checked={profile.twoFactorEnabled}
                  onCheckedChange={(checked) => {
                    handleChange('twoFactorEnabled', checked);
                    toast.info(checked ? '2FA enabled' : '2FA disabled');
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNotifications">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  id="emailNotifications"
                  checked={profile.emailNotifications}
                  onCheckedChange={(checked) => handleChange('emailNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="exceptionAlerts">Exception Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when exceptions occur
                  </p>
                </div>
                <Switch
                  id="exceptionAlerts"
                  checked={profile.exceptionAlerts}
                  onCheckedChange={(checked) => handleChange('exceptionAlerts', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dailyDigest">Daily Digest</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive daily summary of activities
                  </p>
                </div>
                <Switch
                  id="dailyDigest"
                  checked={profile.dailyDigest}
                  onCheckedChange={(checked) => handleChange('dailyDigest', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="realTimeAlerts">Real-Time Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive immediate notifications for critical events
                  </p>
                </div>
                <Switch
                  id="realTimeAlerts"
                  checked={profile.realTimeAlerts}
                  onCheckedChange={(checked) => handleChange('realTimeAlerts', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize your display settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={profile.language} onValueChange={(value) => handleChange('language', value)}>
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Date Format</Label>
                  <Select value={profile.dateFormat} onValueChange={(value) => handleChange('dateFormat', value)}>
                    <SelectTrigger id="dateFormat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeFormat">Time Format</Label>
                  <Select value={profile.timeFormat} onValueChange={(value) => handleChange('timeFormat', value)}>
                    <SelectTrigger id="timeFormat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your recent actions and activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{activity.action}</p>
                        <p className="text-sm text-muted-foreground font-mono">{activity.entity}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{activity.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
