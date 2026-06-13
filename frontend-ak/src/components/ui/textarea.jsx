import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
    return (
        <textarea
            className={cn(
                'flex min-h-[60px] w-full rounded-md border border-[var(--border-focus)] bg-[var(--bg-surface)] px-3 py-2 font-sans text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className,
            )}
            ref={ref}
            {...props}
        />
    );
});
Textarea.displayName = 'Textarea';

export { Textarea };
