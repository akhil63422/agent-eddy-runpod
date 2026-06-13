import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '@/services/auth';
import {
    LayoutDashboard,
    ArrowDownToLine,
    ArrowUpFromLine,
    AlertTriangle,
    Users,
    FileText,
    Settings,
    Activity,
    Link2,
    FlaskConical,
    Zap,
    FileUp,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export const Layout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [logoError, setLogoError] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const navItems = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/inbound', icon: ArrowDownToLine, label: 'Inbound EDI' },
        { path: '/outbound', icon: ArrowUpFromLine, label: 'Outbound EDI' },
        { path: '/exceptions', icon: AlertTriangle, label: 'Error Dashboard' },
        { path: '/partners', icon: Users, label: 'Partner Portal' },
        { path: '/endpoints', icon: Zap, label: 'Endpoints' },
        { path: '/migration', icon: FileUp, label: 'Migration' },
        { path: '/mapper', icon: Link2, label: 'Visual Mapper' },
        { path: '/playground', icon: FlaskConical, label: 'Playground' },
        { path: '/audit', icon: FileText, label: 'Audit Trail' },
        { path: '/analytics', icon: Activity, label: 'SLA Dashboard' },
        { path: '/settings', icon: Settings, label: 'Settings' },
    ];

    const renderBrand = (compact = false) => (
        <button
            type="button"
            className="flex w-full items-center gap-3 text-left"
            onClick={() => navigate('/dashboard')}
        >
            {logoError ? (
                <span className="font-mono text-xs tracking-[0.12em] text-[var(--text-primary)]">AGENT_EDDY</span>
            ) : (
                <img
                    src="/logo.png"
                    alt="Agent Eddy"
                    className="h-8 w-8 shrink-0 rounded-sm object-contain opacity-90"
                    onError={() => setLogoError(true)}
                />
            )}
            {!compact && !logoError && (
                <span className="font-mono text-sm tracking-tight text-[var(--text-primary)]">Agent Eddy</span>
            )}
        </button>
    );

    const renderNav = (compact = false, closeMobile = false) => (
        <nav className="flex-1 space-y-1 overflow-y-auto p-4 scrollbar-thin">
            {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => closeMobile && setMobileOpen(false)}
                        className={`flex items-center gap-3 border-l-2 px-4 py-3 font-sans text-sm font-medium transition-colors ${
                            isActive
                                ? 'border-[var(--primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]/50 hover:text-[var(--text-secondary)]'
                        }`}
                        title={compact ? item.label : undefined}
                    >
                        <Icon className="h-5 w-5 shrink-0 opacity-80" />
                        {!compact && <span>{item.label}</span>}
                        {!compact && item.badge !== undefined && item.badge > 0 && (
                            <Badge variant="warn" className="ml-auto">
                                {item.badge}
                            </Badge>
                        )}
                    </NavLink>
                );
            })}
        </nav>
    );

    const renderAccount = (compact = false, closeMobile = false) => (
        <div className="border-t border-[var(--border-subtle)] p-4">
            {authService.isAuthenticated() ? (
                <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-sm px-4 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                    onClick={() => {
                        navigate('/profile');
                        if (closeMobile) setMobileOpen(false);
                    }}
                >
                    <Avatar className="h-10 w-10 border border-[var(--border)]">
                        <AvatarFallback className="bg-[var(--bg-surface)] font-mono text-sm font-medium text-[var(--text-secondary)]">
                            {localStorage.getItem('username')?.slice(0, 2).toUpperCase() || 'AK'}
                        </AvatarFallback>
                    </Avatar>
                    {!compact && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-sans text-sm font-medium text-[var(--text-primary)]">
                                {localStorage.getItem('username') || 'Account'}
                            </p>
                            <p className="truncate font-sans text-xs text-[var(--text-muted)]">
                                {localStorage.getItem('role') || 'Settings'}
                            </p>
                        </div>
                    )}
                </button>
            ) : (
                <NavLink
                    to="/login"
                    onClick={() => closeMobile && setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-sm border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                    <Avatar className="h-10 w-10 border border-[var(--border)]">
                        <AvatarFallback className="bg-[var(--bg-surface)] font-mono text-sm font-medium text-[var(--text-secondary)]">
                            SI
                        </AvatarFallback>
                    </Avatar>
                    {!compact && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-sans text-sm font-medium text-[var(--text-primary)]">Sign In</p>
                            <p className="truncate font-sans text-xs text-[var(--text-muted)]">Login or Register</p>
                        </div>
                    )}
                </NavLink>
            )}
        </div>
    );

    return (
        <div className="flex h-screen bg-background relative overflow-hidden">
            <aside
                className={`fixed left-0 top-0 bottom-0 z-40 hidden flex-col bg-[var(--bg-base)] transition-all md:flex ${
                    sidebarCollapsed ? 'w-20' : 'w-64'
                }`}
            >
                <div className="border-b border-[var(--border-subtle)] p-6">
                    <div className="flex items-center justify-between gap-2">
                        {renderBrand(sidebarCollapsed)}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarCollapsed((prev) => !prev)}
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                {renderNav(sidebarCollapsed)}
                {renderAccount(sidebarCollapsed)}
            </aside>

            <div className={`flex min-h-0 flex-1 flex-col ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                <header className="border-b border-[var(--border-subtle)] px-4 py-3 md:hidden">
                    <div className="flex items-center justify-between">
                        {renderBrand(true)}
                        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                            <SheetTrigger asChild>
                                <Button variant="outline" size="icon" aria-label="Open navigation menu">
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[18rem] bg-[var(--bg-base)] p-0">
                                <SheetHeader className="border-b border-[var(--border-subtle)] p-4">
                                    <SheetTitle className="text-[var(--text-primary)]">Navigation</SheetTitle>
                                </SheetHeader>
                                {renderNav(false, true)}
                                {renderAccount(false, true)}
                            </SheetContent>
                        </Sheet>
                    </div>
                </header>
                <main className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
                    {children}
                </main>
            </div>
        </div>
    );
};
