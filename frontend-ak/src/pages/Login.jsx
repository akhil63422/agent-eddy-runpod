import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Zap, Building2, Mail, Lock, Package, ShoppingCart, Shield, Loader2, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authService } from '@/services/auth';

export const Login = () => {
  const navigate = useNavigate();
  const [orgCode, setOrgCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  /** admin — no role query (works for Admin/Operator/Viewer/any role).
   *  supplier | customer — adds a role filter to the backend request. */
  const [loginKind, setLoginKind] = useState('admin');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgCode.trim()) {
      toast.error('Please enter your Organization ID');
      return;
    }
    if (!username.trim() || !password) {
      toast.error('Please enter username and password');
      return;
    }
    setLoading(true);
    try {
      const roleParam =
        loginKind === 'admin' ? null : loginKind === 'customer' ? 'Customer' : 'Supplier';
      await authService.login(orgCode.trim(), username.trim(), password, roleParam);
      toast.success(`Welcome back, ${username}!`);
      navigate('/dashboard');
    } catch (err) {
      let msg = err.response?.data?.detail ?? err.message ?? 'Login failed';
      if (Array.isArray(msg)) msg = msg.map((e) => e?.msg).filter(Boolean).join('; ');
      else if (typeof msg === 'object' && msg !== null) msg = msg?.msg || JSON.stringify(msg);
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleViewDashboard = () => {
    authService.enterDevSession();
    toast.info('Preview mode — sign in when the backend is available for live data.');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[var(--bg-base)] via-[var(--bg-base)] to-[var(--bg-surface)] flex-col justify-center px-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-[var(--status-success)] bg-transparent">
            <Zap className="w-6 h-6 text-[var(--status-success-text)]" />
          </div>
          <span className="text-xl font-semibold text-[var(--text-primary)]">Agent Eddy</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
          EDI platform for modern supply chains
        </h1>
        <p className="mt-4 text-[var(--text-secondary)] max-w-md">
          Sign in with your organization ID to access documents, partners, and analytics.
        </p>
        <p className="mt-8 text-xs text-[var(--text-muted)] leading-relaxed max-w-md">
          Demo org:{' '}
          <code className="px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--status-success-text)]">DEFAULT</code>
          <br />
          <span className="text-[var(--text-secondary)]">Admin (add partners):</span> admin / admin123 — choose{' '}
          <strong className="text-[var(--text-primary)]">Admin / Operator</strong> below.
          <br />
          <span className="text-[var(--text-secondary)]">Supplier / Customer:</span> supplier123 / customer123
        </p>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-transparent flex items-center justify-center">
              <Zap className="w-5 h-5 text-[var(--status-success-text)]" />
            </div>
            <span className="text-lg font-semibold text-[var(--text-primary)]">Agent Eddy</span>
          </div>

          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Sign in</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Enter your organization credentials
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="orgCode" className="text-[var(--text-primary)] text-sm font-medium">
                Organization ID
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input
                  id="orgCode"
                  type="text"
                  placeholder="e.g. ACME or WIDGET-001"
                  value={orgCode}
                  onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                  className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-11"
                  autoComplete="organization"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-[var(--text-primary)] text-sm font-medium">
                Username
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-11"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[var(--text-primary)] text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-[var(--bg-subtle)] border-[var(--border-focus)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-11"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-primary)] text-sm font-medium">Account type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginKind('admin')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    loginKind === 'admin'
                      ? 'border-amber-500 bg-transparent text-[var(--status-warn-text)]'
                      : 'border-[var(--border-focus)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  Admin / Operator
                </button>
                <button
                  type="button"
                  onClick={() => setLoginKind('supplier')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    loginKind === 'supplier'
                      ? 'border-[var(--status-success)] bg-transparent text-[var(--status-success-text)]'
                      : 'border-[var(--border-focus)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  <Package className="w-4 h-4 shrink-0" />
                  Supplier
                </button>
                <button
                  type="button"
                  onClick={() => setLoginKind('customer')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    loginKind === 'customer'
                      ? 'border-[var(--status-success)] bg-transparent text-[var(--status-success-text)]'
                      : 'border-[var(--border-focus)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4 shrink-0" />
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
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-[var(--border-focus)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]"
              disabled={loading}
              onClick={handleViewDashboard}
            >
              <span className="flex items-center justify-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                View dashboard
              </span>
            </Button>
            <p className="text-xs text-center text-[var(--text-muted)]">
              Opens the UI without signing in when login or the API is unavailable.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            Don't have an account?{' '}
            <NavLink to="/register" className="text-[var(--status-success-text)] hover:text-[var(--status-success-text)] font-medium">
              Register
            </NavLink>
          </p>
        </div>
      </div>
    </div>
  );
};
