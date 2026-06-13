import React, { useState, useEffect } from 'react';
import { documentsService } from '@/services/documents';
import { localDataStore } from '@/store/localDataStore';
import { Loader2 } from 'lucide-react';
import { 
  ArrowUpFromLine, 
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Send
} from 'lucide-react';
import { EdiFlowScaffold } from '@/components/edi/EdiFlowScaffold';

export const OutboundEDI = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [kpiData, setKpiData] = useState([
    { title: 'Total Outbound Files', value: '0', subtitle: '—', trend: 'up', trendValue: '—', icon: FileText },
    { title: 'Successfully Sent', value: '0', subtitle: '—', trend: 'up', trendValue: '—', variant: 'success', icon: Send },
    { title: 'Pending Delivery', value: '0', subtitle: '—', trend: 'down', trendValue: '—', variant: 'warning', icon: Clock },
    { title: 'Failed', value: '0', subtitle: '—', trend: 'down', trendValue: '—', variant: 'error', icon: XCircle },
  ]);
  const [filters, setFilters] = useState({
    dateRange: 'last7days',
    partner: 'all',
    docType: 'all',
    status: 'all',
    search: '',
  });

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const params = { direction: 'Outbound', skip: 0, limit: 500, forceApi: true, summary: true };
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.docType !== 'all') params.document_type = filters.docType;
      if (filters.partner !== 'all') params.partner_id = filters.partner;
      const data = await documentsService.getAll(params);
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setDocuments(list);
      const completed = list.filter(d => d.status === 'Completed').length;
      const failed = list.filter(d => d.status === 'Failed').length;
      const pending = list.filter(d => ['Processing', 'Needs Review'].includes(d.status)).length;
      const successRate = list.length > 0 ? ((completed / list.length) * 100).toFixed(1) : 0;
      setKpiData([
        { title: 'Total Outbound Files', value: list.length.toString(), subtitle: '—', trend: 'up', trendValue: '—', icon: FileText },
        { title: 'Successfully Sent', value: completed.toString(), subtitle: `${successRate}% success rate`, trend: 'up', trendValue: '—', variant: 'success', icon: Send },
        { title: 'Pending Delivery', value: pending.toString(), subtitle: '—', trend: 'down', trendValue: '—', variant: 'warning', icon: Clock },
        { title: 'Failed', value: failed.toString(), subtitle: '—', trend: 'down', trendValue: '—', variant: 'error', icon: XCircle },
      ]);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localDataStore.clearInboundOutboundDocuments();
    loadDocuments();
  }, [filters]);

  const itemsPerPage = 50;

  const getDocNumber = (doc) => {
    const c = doc.canonical_json || {};
    const f = c.fields || {};
    return f.control_number || f.po_number || f.invoice_number || c.control_number || c.po_number || doc._id?.slice(-8) || doc.id?.slice(-8) || '';
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page on filter change
  };

  const filteredDocuments = documents.filter(doc => {
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const docNum = getDocNumber(doc);
      const origin = (doc.source_system || doc.partner_code || '').toLowerCase();
      const dest = (doc.target_system || '').toLowerCase();
      const fileId = (doc.file_name || doc._id || doc.id || '').toString().toLowerCase();
      if (!docNum.toLowerCase().includes(search) && !origin.includes(search) && !dest.includes(search) && !fileId.includes(search)) {
        return false;
      }
    }
    if (filters.partner !== 'all' && doc.partner_id !== filters.partner && doc.partner_code !== filters.partner) {
      return false;
    }
    if (filters.docType !== 'all' && doc.document_type !== filters.docType && !(doc.document_type || '').toLowerCase().includes((filters.docType || '').toLowerCase())) {
      return false;
    }
    if (filters.status !== 'all' && doc.status !== filters.status) {
      return false;
    }
    return true;
  });

  const totalItems = filteredDocuments.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDocuments = filteredDocuments.slice(startIndex, endIndex);

  if (loading && documents.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--text-primary)]" />
          <p className="text-[var(--text-primary)] font-mono">Loading outbound documents...</p>
        </div>
      </div>
    );
  }

  const filterOptions = [
    {
      key: 'dateRange',
      label: 'Date Range',
      type: 'select',
      items: [
        { value: 'last7days', label: 'Last 7 Days' },
        { value: 'last30days', label: 'Last 30 Days' },
        { value: 'last90days', label: 'Last 90 Days' },
        { value: 'today', label: 'Today' },
        { value: 'custom', label: 'Custom Range' },
      ],
    },
    {
      key: 'partner',
      label: 'Partner',
      type: 'select',
      items: [
        { value: 'all', label: 'All Partners' },
        { value: 'Walmart', label: 'Walmart' },
        { value: 'Target', label: 'Target' },
        { value: 'Amazon', label: 'Amazon' },
        { value: 'Home Depot', label: 'Home Depot' },
        { value: 'Costco', label: 'Costco' },
        { value: 'Kroger', label: 'Kroger' },
      ],
    },
    {
      key: 'docType',
      label: 'Doc Type',
      type: 'select',
      items: [
        { value: 'all', label: 'All Types' },
        { value: 'X12 810', label: 'X12 810 (Invoice)' },
        { value: 'X12 856', label: 'X12 856 (ASN)' },
        { value: 'X12 855', label: 'X12 855 (PO ACK)' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      items: [
        { value: 'all', label: 'All Statuses' },
        { value: 'Delivered', label: 'Delivered' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Pending ACK', label: 'Pending ACK' },
        { value: 'Needs Review', label: 'Needs Review' },
        { value: 'Processing', label: 'Processing' },
        { value: 'Failed', label: 'Failed' },
      ],
    },
    {
      key: 'search',
      label: 'Search',
      type: 'search',
      placeholder: 'Doc No, origin, destination...',
    },
  ];

  return (
    <EdiFlowScaffold
      icon={ArrowUpFromLine}
      title="Outbound EDI - Flow Monitor"
      subtitle="Monitor and manage all outbound EDI transactions"
      kpiData={kpiData}
      filters={filters}
      onFilterChange={handleFilterChange}
      filterOptions={filterOptions}
      paginatedDocuments={paginatedDocuments}
      direction="Outbound"
      loading={loading}
      emptyMessage="No outbound documents found matching your filters"
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      startIndex={startIndex}
      endIndex={endIndex}
      statusMessage="All outbound EDI files are processing normally."
      statusIcon={CheckCircle2}
    />
  );
};
