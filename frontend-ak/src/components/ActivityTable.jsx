import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ArrowRight } from 'lucide-react';
import { getDocumentStatusBadge } from '@/lib/statusBadgeClasses';

export const ActivityTable = ({ data }) => {
    const navigate = useNavigate();

    const renderStatusBadge = (status) => {
        const { label, className } = getDocumentStatusBadge(status);
        return <span className={className}>{label}</span>;
    };

    const handleViewDetails = (id) => {
        navigate(`/document/${id}`);
    };

    return (
        <div className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--bg-surface)]">
            <Table>
                <TableHeader>
                    <TableRow className="border-b border-[var(--border-subtle)] hover:bg-[#0f0f0f]">
                        <TableHead>File ID</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead className="w-4" />
                        <TableHead>To</TableHead>
                        <TableHead>Doc Type</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Current Stage</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row) => (
                        <TableRow
                            key={row.id}
                            className="cursor-pointer border-b border-[var(--border-subtle)]"
                            onClick={() => handleViewDetails(row.id)}
                        >
                            <TableCell
                                className="font-mono text-sm font-medium text-[var(--text-primary)]"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewDetails(row.id);
                                }}
                            >
                                {row.id}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{row.timestamp}</TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                                        <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                                            {(row.fromParty || row.partner || '?').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]">
                                        {row.fromParty || row.partner}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="px-0">
                                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--bg-surface)]">
                                        <span className="font-mono text-[10px] font-medium text-[var(--text-secondary)]">
                                            {(row.toParty || row.partner || '?').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="max-w-[110px] truncate text-sm font-medium text-[var(--text-primary)]">
                                        {row.toParty || row.partner}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="draft" className="normal-case">
                                    {row.docType}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="normal-case text-[var(--text-secondary)]">
                                    {row.direction}
                                </Badge>
                            </TableCell>
                            <TableCell>{renderStatusBadge(row.status)}</TableCell>
                            <TableCell className="font-mono text-sm">{row.stage}</TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewDetails(row.id);
                                    }}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};
