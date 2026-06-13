import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import {
  Zap, Building2, Mail, Lock, User, Package, ShoppingCart,
  Loader2, ArrowLeft, Plus, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authService } from '@/services/auth';

export const Register = () => {
  const navigate = useNavigate();
  const [path, setPath] = useState(null); // 'create' | 'join' | null
  const [formData, setFormData] = useState({
    org_name: '',
    org_code: '',
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'Supplier',
  });
  const [orgNamePreview, setOrgNamePreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'org_code') setOrgNamePreview(null);
  };

  const handleLookupOrg = async () => {
    const code = (formData.org_code || '').trim().toUpperCase();
    if (!code || code.length < 3) return;
    try {
      const res = await authService.getCompanyByCode(code);
      setOrgNamePreview(res?.name || null);
    } catch {
      setOrgNamePreview(null);
    }
  };

  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    const { org_name, org_code, username, email, password, full_name, role } = formData;
    if (!org_name.trim() || !org_code.trim()) {
      toast.error('Organization name and ID are required');
      return;
    }
    if (!username.trim() || !email.trim() || !password) {
      toast.error('Please fill in username, email, and password');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authService.registerCreateOrg({
        org_name: org_name.trim(),
        org_code: org_code.trim().toUpperCase(),
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: full_name.trim() || undefined,
        role,
      });
      toast.success('Organization created! Please sign in.');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitJoin = async (e) => {
    e.preventDefault();
    const { org_code, username, email, password, full_name, role } = formData;
    if (!org_code.trim()) {
      toast.error('Organization ID is required');
      return;
    }
    if (!username.trim() || !email.trim() || !password) {
      toast.error('Please fill in username, email, and password');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authService.registerJoinOrg({
        org_code: org_code.trim().toUpperCase(),
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: full_name.trim() || undefined,
        role,
      });
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[var(--bg-base)] via-[var(--bg-base)] to-[var(--bg-surface)] flex-col pt-24 px-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-[var(--status-success)] bg-transparent">
            <Zap className="w-6 h-6 text-[var(--status-success-text)]" />
          </div>
          <span className="text-xl font-semibold text-[var(--text-primary)]">Agent Eddy</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
          Create or join your organization
        </h1>
        <p className="mt-4 text-[var(--text-secondary)] max-w-md">
          Set up a new EDI organization or join an existing one with your admin's Organization ID.
        </p>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex flex-col pt-24 px-8 lg:px-16 pb-16 bg-background overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center">
              <Zap className="w-5 h-5 text-[var(--status-success-text)]" />
            </div>
            <span className="text-lg font-semibold text-[var(--text-primary)]">Agent Eddy</span>
          </div>

          {path === null ? (
            <>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Get started</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Choose how you want to register
              </p>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setPath('create')}
                  className="w-full p-5 rounded-sm border-2 border-[var(--border-focus)] bg-[var(--bg-subtle)] hover:border-[var(--status-success)] hover:bg-[var(--bg-elevated)] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center group-hover:bg-primary/30">
                      <Plus className="w-5 h-5 text-[var(--status-success-text)]" />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">Create new organization</p>
                      <p className="text-sm text-[var(--text-secondary)]">Set up your company and become the first admin</p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPath('join')}
                  className="w-full p-5 rounded-sm border-2 border-[var(--border-focus)] bg-[var(--bg-subtle)] hover:border-[var(--status-success)] hover:bg-[var(--bg-elevated)] transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center group-hover:bg-primary/30">
                      <UserPlus className="w-5 h-5 text-[var(--status-success-text)]" />
                    </div>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">Join existing organization</p>
                      <p className="text-sm text-[var(--text-secondary)]">Use your admin's Organization ID to join</p>
                    </div>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setPath(null); setOrgNamePreview(null); }}
                className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">
                {path === 'create' ? 'Create organization' : 'Join organization'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                {path === 'create'
                  ? 'Organization ID is used for login (e.g. ACME)'
                  : 'Ask your admin for the Organization ID'}
              </p>

              <form
                onSubmit={path === 'create' ? handleSubmitCreate : handleSubmitJoin}
                className="space-y-4"
              >
                {path === 'create' && (
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)] text-sm font-medium">Organization name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <Input
                        type="text"
                        placeholder="Acme Corp"
                        value={formData.org_name}
                        onChange={(e) => handleChange('org_name', e.target.value)}
                        className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">Organization ID</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      <Input
                        type="text"
                        placeholder="e.g. ACME or WIDGET-001"
                        value={formData.org_code}
                        onChange={(e) => handleChange('org_code', e.target.value.toUpperCase())}
                        className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                      />
                    </div>
                    {path === 'join' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLookupOrg}
                        className="border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                      >
                        Verify
                      </Button>
                    )}
                  </div>
                  {path === 'join' && orgNamePreview && (
                    <p className="text-xs text-[var(--status-success-text)]">Organization: {orgNamePreview}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <Input
                      type="text"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={(e) => handleChange('username', e.target.value)}
                      className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">Full name (optional)</Label>
                  <Input
                    type="text"
                    placeholder="John Doe"
                    value={formData.full_name}
                    onChange={(e) => handleChange('full_name', e.target.value)}
                    className="bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <Input
                      type="password"
                      placeholder="At least 6 characters"
                      value={formData.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-sm font-medium">I am a</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleChange('role', 'Supplier')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 transition-all text-sm font-medium ${
                        formData.role === 'Supplier'
                          ? 'border-[var(--status-success)] bg-transparent text-[var(--status-success-text)]'
                          : 'border-[var(--border-focus)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      Supplier
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange('role', 'Customer')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 transition-all text-sm font-medium ${
                        formData.role === 'Customer'
                          ? 'border-[var(--status-success)] bg-transparent text-[var(--status-success-text)]'
                          : 'border-[var(--border-focus)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Customer
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary text-[var(--text-primary)] font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : path === 'create' ? (
                    'Create Organization'
                  ) : (
                    'Join Organization'
                  )}
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Already have an account?{' '}
            <NavLink to="/login" className="text-[var(--status-success-text)] hover:text-[var(--status-success-text)] font-medium">
              Sign In
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  );
};
