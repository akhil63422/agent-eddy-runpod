import { Toaster as Sonner, toast } from 'sonner';

const Toaster = ({ ...props }) => {
    return (
        <Sonner
            theme="dark"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:border-[var(--border)] group-[.toaster]:bg-[var(--bg-surface)] group-[.toaster]:text-[var(--text-primary)] group-[.toaster]:shadow-none',
                    description: 'group-[.toast]:text-[var(--text-secondary)]',
                    actionButton:
                        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full',
                    cancelButton:
                        'group-[.toast]:border group-[.toast]:border-[var(--border-focus)] group-[.toast]:bg-transparent group-[.toast]:text-[var(--text-secondary)]',
                },
            }}
            {...props}
        />
    );
};

export { Toaster, toast };
