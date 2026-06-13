import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

export const KPICard = ({
    title,
    value,
    subtitle,
    trend,
    trendValue,
    icon: Icon,
    onClick,
}) => {
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

    return (
        <motion.div
            whileHover={onClick ? { y: -1 } : undefined}
            transition={{ type: 'tween', duration: 0.15 }}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={
                onClick
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick(e);
                          }
                      }
                    : undefined
            }
            className={
                onClick
                    ? 'cursor-pointer rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#444444]'
                    : ''
            }
        >
            <Card className="border border-[var(--border)] bg-[var(--bg-surface)] shadow-none transition-colors duration-200">
                <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                                {title}
                            </p>
                            <div className="flex items-baseline gap-2">
                                <h3 className="font-mono text-3xl font-medium tracking-tight text-[var(--text-primary)]">
                                    {value}
                                </h3>
                                {trendValue && (
                                    <div
                                        className={`flex items-center gap-1 font-mono text-sm font-medium ${getTrendColor()}`}
                                    >
                                        {getTrendIcon()}
                                        <span>{trendValue}</span>
                                    </div>
                                )}
                            </div>
                            {subtitle && (
                                <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{subtitle}</p>
                            )}
                        </div>
                        {Icon && (
                            <div className="ml-4 flex h-12 w-12 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-surface)]">
                                <Icon className="h-6 w-6 text-[var(--text-muted)]" />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};
