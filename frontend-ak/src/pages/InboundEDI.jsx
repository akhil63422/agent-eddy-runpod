import React, { useState, useEffect } from 'react';
import { 
  ArrowDownToLine, 
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Loader2
} from 'lucide-react';
import { documentsService } from '@/services/documents';
import { localDataStore } from '@/store/localDataStore';
import { toast } from 'sonner';
import { EdiFlowScaffold } from '@/components/edi/EdiFlowScaffold';

export const InboundEDI = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [kpiData, setKpiData] = useState([]);
  const [filters, setFilters] = useState({
    dateRange: 'last7days',
    partner: 'all',
    docType: 'all',
    status: 'all',
    search: '',
  });

  useEffect(() => {
    localDataStore.clearInboundOutboundDocuments();
    loadDocuments();
  }, [filters]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const params = {
        direction: 'Inbound',
        skip: 0,
        limit: 500,
      };
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.docType !== 'all') params.document_type = filters.docType;
      if (filters.partner !== 'all') params.partner_id = filters.partner;
      
      const data = await documentsService.getAll({ ...params, forceApi: true, summary: true });
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('Invalid data format received:', data);
        setDocuments([]);
        setLoading(false);
        return;
      }
      
      setDocuments(data);
      
      // Calculate KPIs
      try {
        const allDocs = await documentsService.getAll({ direction: 'Inbound', limit: 500, forceApi: true, summary: true });
        if (!Array.isArray(allDocs)) {
          console.warn('Invalid KPI data format, using current page data');
          // Use current page data for KPIs
          const total = data.length;
          const completed = data.filter(d => d.status === 'Completed').length;
          const needsReview = data.filter(d => d.status === 'Needs Review').length;
          const failed = data.filter(d => d.status === 'Failed').length;
          const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
          
          setKpiData([
            {
              title: 'Total Inbound Files',
              value: total.toLocaleString(),
              subtitle: 'Last 7 days',
              trend: 'up',
              trendValue: '+12%',
              icon: FileText,
            },
            {
              title: 'Success Rate',
              value: `${successRate}%`,
              subtitle: `${completed} successful`,
              trend: 'up',
              trendValue: '+2.1%',
              variant: 'success',
              icon: CheckCircle2,
            },
            {
              title: 'Needs Review',
              value: needsReview.toString(),
              subtitle: 'Requires attention',
              trend: 'down',
              trendValue: '-8',
              variant: 'warning',
              icon: AlertTriangle,
            },
            {
              title: 'Failed',
              value: failed.toString(),
              subtitle: 'Requires action',
              trend: 'down',
              trendValue: '-5',
              variant: 'error',
              icon: XCircle,
            },
          ]);
          return;
        }
        
        const total = allDocs.length;
        const completed = allDocs.filter(d => d.status === 'Completed').length;
        const needsReview = allDocs.filter(d => d.status === 'Needs Review').length;
        const failed = allDocs.filter(d => d.status === 'Failed').length;
        const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
        
        setKpiData([
          {
            title: 'Total Inbound Files',
            value: total.toLocaleString(),
            subtitle: 'Last 7 days',
            trend: 'up',
            trendValue: '+12%',
            icon: FileText,
          },
          {
            title: 'Success Rate',
            value: `${successRate}%`,
            subtitle: `${completed} successful`,
            trend: 'up',
            trendValue: '+2.1%',
            variant: 'success',
            icon: CheckCircle2,
          },
          {
            title: 'Needs Review',
            value: needsReview.toString(),
            subtitle: 'Requires attention',
            trend: 'down',
            trendValue: '-8',
            variant: 'warning',
            icon: AlertTriangle,
          },
          {
            title: 'Failed',
            value: failed.toString(),
            subtitle: 'Requires action',
            trend: 'down',
            trendValue: '-5',
            variant: 'error',
            icon: XCircle,
          },
        ]);
      } catch (kpiErr) {
        console.warn('Error loading KPI data:', kpiErr);
        // Use current page data for KPIs as fallback
        const total = data.length;
        const completed = data.filter(d => d.status === 'Completed').length;
        const needsReview = data.filter(d => d.status === 'Needs Review').length;
        const failed = data.filter(d => d.status === 'Failed').length;
        const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
        
        setKpiData([
          {
            title: 'Total Inbound Files',
            value: total.toLocaleString(),
            subtitle: 'Last 7 days',
            trend: 'up',
            trendValue: '+12%',
            icon: FileText,
          },
          {
            title: 'Success Rate',
            value: `${successRate}%`,
            subtitle: `${completed} successful`,
            trend: 'up',
            trendValue: '+2.1%',
            variant: 'success',
            icon: CheckCircle2,
          },
          {
            title: 'Needs Review',
            value: needsReview.toString(),
            subtitle: 'Requires attention',
            trend: 'down',
            trendValue: '-8',
            variant: 'warning',
            icon: AlertTriangle,
          },
          {
            title: 'Failed',
            value: failed.toString(),
            subtitle: 'Requires action',
            trend: 'down',
            trendValue: '-5',
            variant: 'error',
            icon: XCircle,
          },
        ]);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
      let errorMessage = 'Failed to load inbound documents';
      try {
        if (err.response?.data) {
          if (typeof err.response.data === 'string') {
            errorMessage = err.response.data;
          } else if (err.response.data.detail) {
            errorMessage = typeof err.response.data.detail === 'string' 
              ? err.response.data.detail 
              : JSON.stringify(err.response.data.detail);
          } else if (err.response.data.message) {
            errorMessage = typeof err.response.data.message === 'string'
              ? err.response.data.message
              : JSON.stringify(err.response.data.message);
          } else {
            errorMessage = JSON.stringify(err.response.data);
          }
        } else if (err.message) {
          errorMessage = err.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        } else {
          errorMessage = err?.toString() || 'Unknown error occurred';
        }
      } catch {
        errorMessage = 'Failed to load inbound documents - Network or parsing error';
      }
      toast.error(`Failed to load inbound documents: ${errorMessage}`);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const itemsPerPage = 20;

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
          <p className="text-[var(--text-primary)] font-mono">Loading inbound documents...</p>
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
      ],
    },
    {
      key: 'docType',
      label: 'Doc Type',
      type: 'select',
      items: [
        { value: 'all', label: 'All Types' },
        { value: 'X12 850', label: 'X12 850 (PO)' },
        { value: 'X12 810', label: 'X12 810 (Invoice)' },
        { value: 'X12 856', label: 'X12 856 (ASN)' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      items: [
        { value: 'all', label: 'All Statuses' },
        { value: 'Ready for Dispatch', label: 'Ready for Dispatch' },
        { value: 'Dispatched', label: 'Dispatched' },
        { value: 'Completed', label: 'Completed' },
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
      icon={ArrowDownToLine}
      title="Inbound EDI - Flow Monitor"
      subtitle="Monitor and manage all inbound EDI transactions"
      kpiData={kpiData}
      filters={filters}
      onFilterChange={handleFilterChange}
      filterOptions={filterOptions}
      paginatedDocuments={paginatedDocuments}
      direction="Inbound"
      loading={loading}
      emptyMessage="No inbound documents found matching your filters"
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      startIndex={startIndex}
      endIndex={endIndex}
      statusMessage="All inbound EDI files are processing normally."
      statusIcon={CheckCircle2}
    />
  );
};
