import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center border px-2.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full bg-transparent',
    {
        variants: {
            variant: {
                default:
                    'border-[var(--border-focus)] text-[var(--text-muted)]',
                secondary: 'border-[var(--border)] text-[var(--text-secondary)]',
                destructive:
                    'border-[var(--status-error)] text-[var(--status-error-text)]',
                outline: 'border-[var(--border-focus)] text-[var(--text-secondary)]',
                success:
                    'border-[var(--status-success)] text-[var(--status-success-text)] bg-[var(--status-success)]/15',
                warn: 'border-[var(--status-warn)] text-[var(--status-warn-text)]',
                error: 'border-[var(--status-error)] text-[var(--status-error-text)]',
                info: 'border-[var(--status-info)] text-[var(--status-info-text)]',
                draft: 'border-[var(--border-focus)] text-[var(--text-muted)]',
                notStarted: 'border-[var(--border)] text-[var(--text-muted)]',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

function Badge({ className, variant, ...props }) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
