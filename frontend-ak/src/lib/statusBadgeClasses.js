/**
 * MongoDB-style status pills: transparent bg, 1px border, pill radius.
 * Maps document / EDI statuses to outline tone + display label.
 */

const BASE =
    'inline-flex items-center border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em] rounded-full bg-transparent';

const TONES = {
    success: `${BASE} border-[var(--status-success)] text-[var(--status-success-text)]`,
    warn: `${BASE} border-[var(--status-warn)] text-[var(--status-warn-text)]`,
    error: `${BASE} border-[var(--status-error)] text-[var(--status-error-text)]`,
    info: `${BASE} border-[var(--status-info)] text-[var(--status-info-text)]`,
    draft: `${BASE} border-[var(--border)] text-[var(--text-muted)]`,
    notStarted: `${BASE} border-[var(--border)] text-[var(--text-muted)]`,
};

const SUCCESS_LABELS = new Set([
    'completed',
    'processed',
    'generated',
    'dispatched',
    'delivered',
    'sent',
    'active',
    'success',
    'ready for dispatch',
]);

const WARN_LABELS = new Set(['needs review', 'warning', 'needs_review', 'review']);

const ERROR_LABELS = new Set(['failed', 'error', 'critical', 'duplicate']);

const DRAFT_LABELS = new Set(['draft', 'inactive']);

const NOT_STARTED_LABELS = new Set(['not started', 'not_started', 'pending']);

function normalize(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase();
}

/**
 * @param {string} status
 * @returns {{ label: string, className: string }}
 */
export function getDocumentStatusBadge(status) {
    const raw = String(status || '').trim();
    const s = normalize(raw);

    if (!s) {
        return { label: '—', className: TONES.notStarted };
    }

    if (ERROR_LABELS.has(s)) {
        return { label: raw || 'Failed', className: TONES.error };
    }
    if (WARN_LABELS.has(s)) {
        return { label: raw || 'Needs Review', className: TONES.warn };
    }
    if (DRAFT_LABELS.has(s)) {
        return { label: raw || 'Draft', className: TONES.draft };
    }
    if (NOT_STARTED_LABELS.has(s)) {
        return { label: raw || 'Not Started', className: TONES.notStarted };
    }
    if (SUCCESS_LABELS.has(s)) {
        return { label: raw || 'Success', className: TONES.success };
    }

    if (
        s === 'processing' ||
        s.includes('process') ||
        s === 'received' ||
        s === 'parsed' ||
        s === 'validated' ||
        s === 'ai processing' ||
        s === 'mapping' ||
        s === 'canonical generated' ||
        s === 'send ack' ||
        s === 'created'
    ) {
        return { label: raw || 'Processing', className: TONES.info };
    }

    return { label: raw, className: TONES.info };
}

export { TONES };
