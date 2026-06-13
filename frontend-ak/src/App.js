import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { authService } from '@/services/auth';
import { DocumentDetail } from '@/pages/DocumentDetail';
import Mapper from '@/pages/Mapper';
import Playground from '@/pages/Playground';
import { TradingPartners } from '@/pages/TradingPartners';
import { PartnerDetail } from '@/pages/PartnerDetail';
import { InboundEDI } from '@/pages/InboundEDI';
import { OutboundEDI } from '@/pages/OutboundEDI';
import { Exceptions } from '@/pages/Exceptions';
import { AuditLogs } from '@/pages/AuditLogs';
import { AuditLogDetail } from '@/pages/AuditLogDetail';
import { Settings } from '@/pages/Settings';
import { UserProfile } from '@/pages/UserProfile';
import { Analytics } from '@/pages/Analytics';
import { Connections } from '@/pages/Connections';
import { Endpoints } from '@/pages/Endpoints';
import Migration from '@/pages/Migration';
import { ERPSimulator } from '@/pages/ERPSimulator';
import { WalmartSimulator } from '@/pages/WalmartSimulator';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmDialogProvider } from '@/components/ConfirmDialogProvider';
import './App.css';

// Error boundary: catches JS errors and shows a helpful message instead of blank screen
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="max-w-md text-center">
            <div className="mb-4 font-mono text-2xl text-[var(--status-warn-text)]">!</div>
            <h2 className="mb-2 font-sans text-lg font-medium tracking-tight text-foreground">Something went wrong</h2>
            <p className="mb-6 font-sans text-sm text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/dashboard'; }}
              className="mr-3 rounded-sm bg-primary px-4 py-2 font-sans text-xs font-medium tracking-[0.04em] text-primary-foreground hover:bg-[#ffffff]"
            >
              Try again
            </button>
            <button
              onClick={() => { authService.logout(); window.location.href = '/login'; }}
              className="rounded-sm border border-[var(--border-focus)] bg-transparent px-4 py-2 font-sans text-xs font-medium tracking-[0.04em] text-muted-foreground hover:border-[var(--border-focus)] hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * ProtectedRoute — re-renders as a proper React component so that
 * authService.isAuthenticated() is re-evaluated on every navigation,
 * including client-side navigate('/dashboard') after login.
 * (Inline JSX expressions inside element props can be skipped by React's
 * reconciler when the parent doesn't receive new props/state.)
 */
function ProtectedRoute() {
  const location = useLocation();
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  /* Standalone page: no sidebar (direct URL only). */
  if (location.pathname === '/erp-simulator') {
    return <Navigate to="/sap-simulator" replace />;
  }
  if (location.pathname === '/sap-simulator') {
    return (
      <ErrorBoundary>
        <div className="flex min-h-screen flex-col overflow-y-auto bg-background scrollbar-thin">
          <ERPSimulator />
        </div>
      </ErrorBoundary>
    );
  }
  if (location.pathname === '/walmart-simulator') {
    return (
      <ErrorBoundary>
        <div className="flex min-h-screen flex-col overflow-y-auto bg-background scrollbar-thin">
          <WalmartSimulator />
        </div>
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          {/* relative paths — required for nested <Routes> under a "/*" parent in RRv6 */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="document/:id" element={<DocumentDetail />} />
          <Route path="document/:id/review" element={<DocumentDetail />} />
          <Route path="mapper" element={<Mapper />} />
          <Route path="playground" element={<Playground />} />
          <Route path="inbound" element={<InboundEDI />} />
          <Route path="outbound" element={<OutboundEDI />} />
          <Route path="exceptions" element={<Exceptions />} />
          <Route path="partners" element={<TradingPartners />} />
          <Route path="partners/:id" element={<PartnerDetail />} />
          <Route path="connections" element={<Connections />} />
          <Route path="endpoints" element={<Endpoints />} />
          <Route path="migration" element={<Migration />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="audit/:id" element={<AuditLogDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<UserProfile />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <div className="App">
        <ConfirmDialogProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/*" element={<ProtectedRoute />} />
            </Routes>
          </BrowserRouter>
        </ConfirmDialogProvider>
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export default App;
