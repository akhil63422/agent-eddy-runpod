import React, { useState, useMemo, memo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const KPI3DCard = memo(
    ({ title, value, subtitle, trend, trendValue, icon: Icon, description, details }) => {
        const [isOpen, setIsOpen] = useState(false);

        const getTrendIcon = () => {
            if (trend === 'up') return <TrendingUp className="h-4 w-4" />;
            if (trend === 'down') return <TrendingDown className="h-4 w-4" />;
            return <Minus className="h-4 w-4" />;
        };

        const getTrendColor = () => {
            if (trend === 'up') return 'text-[var(--status-success-text)]';
            if (trend === 'down') return 'text-[var(--status-error-text)]';
            return 'text-[var(--text-muted)]';
        };

        const iconShell = useMemo(
            () => 'flex h-12 w-12 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)]',
            [],
        );

        return (
            <>
                <div
                    className="relative w-full cursor-pointer rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] p-6 transition-colors hover:border-[var(--border-focus)]"
                    onClick={() => setIsOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsOpen(true);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                >
                    <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {title}
                            </p>
                            <h3 className="mb-1 font-mono text-3xl font-medium tracking-tight text-[var(--text-primary)]">
                                {value}
                            </h3>
                            {subtitle && (
                                <p className="font-sans text-sm text-[var(--text-secondary)]">{subtitle}</p>
                            )}
                            {trendValue && (
                                <div
                                    className={`mt-2 flex items-center gap-1 font-sans text-sm font-medium ${getTrendColor()}`}
                                >
                                    {getTrendIcon()}
                                    <span>{trendValue}</span>
                                </div>
                            )}
                        </div>
                        <div className={iconShell}>
                            <Icon className="h-6 w-6" />
                        </div>
                    </div>
                </div>

                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogContent className="max-w-lg border border-[var(--border)] bg-[var(--bg-surface)]">
                        <DialogHeader className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className={iconShell}>
                                    <Icon className="h-6 w-6" />
                                </div>
                                <div>
                                    <DialogTitle className="font-sans text-lg font-medium text-[var(--text-primary)]">
                                        {title}
                                    </DialogTitle>
                                    <p className="font-sans text-sm text-[var(--text-secondary)]">
                                        {description || subtitle}
                                    </p>
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="space-y-6 pt-4">
                            <div className="text-center">
                                <h2 className="mb-2 font-mono text-4xl font-medium text-[var(--text-primary)]">
                                    {value}
                                </h2>
                                {trendValue && (
                                    <div
                                        className={`flex items-center justify-center gap-2 font-sans text-lg font-medium ${getTrendColor()}`}
                                    >
                                        {getTrendIcon()}
                                        <span>{trendValue}</span>
                                    </div>
                                )}
                            </div>
                            {details && details.length > 0 && (
                                <div className="grid grid-cols-2 gap-3">
                                    {details.map((detail, index) => (
                                        <div
                                            key={index}
                                            className="rounded-sm border border-[var(--border)] bg-[var(--bg-base)] p-4"
                                        >
                                            <p className="mb-1 font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                                {detail.label}
                                            </p>
                                            <p className="font-mono text-lg font-medium text-[var(--text-primary)]">
                                                {detail.value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        );
    },
);

KPI3DCard.displayName = 'KPI3DCard';
