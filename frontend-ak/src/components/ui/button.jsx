import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] shadow-none',
                destructive:
                    'border border-[var(--status-error)] bg-transparent text-[var(--status-error-text)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]',
                outline:
                    'border border-[var(--border-focus)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--mdb-green-dark)] hover:text-[var(--text-primary)]',
                secondary:
                    'border border-[var(--border-focus)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--mdb-green-dark)] hover:text-[var(--text-primary)]',
                ghost: 'rounded-md hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] text-[var(--text-secondary)]',
                link: 'rounded-md text-[var(--mdb-green-dark)] underline-offset-4 hover:underline hover:text-[var(--primary)]',
                success:
                    'border border-[var(--status-success)] bg-transparent text-[var(--status-success-text)] hover:bg-[var(--status-success)]/20',
                warning:
                    'border border-[var(--status-warn)] bg-transparent text-[var(--status-warn-text)] hover:bg-[var(--status-warn)]/30',
            },
            size: {
                default: 'h-10 px-[22px] py-2.5',
                sm: 'h-9 rounded-full px-4 text-xs',
                lg: 'h-11 rounded-full px-8',
                icon: 'h-10 w-10 rounded-full',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
