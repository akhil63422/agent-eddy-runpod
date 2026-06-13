import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DocumentTable } from '@/components/DocumentTable';

export const EdiFlowScaffold = ({
  icon: Icon,
  title,
  subtitle,
  kpiData,
  filters,
  onFilterChange,
  filterOptions,
  paginatedDocuments,
  direction,
  loading,
  emptyMessage,
  currentPage,
  setCurrentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  statusMessage,
  statusIcon: StatusIcon,
}) => (
  <div className="p-6 space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
        <Icon className="w-8 h-8 text-primary" />
        {title}
      </h1>
      <p className="text-muted-foreground mt-1">{subtitle}</p>
    </div>

    {kpiData.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>
    )}

    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {filterOptions.map((option) => (
            <div className="space-y-2" key={option.key}>
              <label className="text-xs font-medium text-muted-foreground">{option.label}</label>
              {option.type === 'select' ? (
                <Select value={filters[option.key]} onValueChange={(value) => onFilterChange(option.key, value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {option.items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={option.placeholder}
                    value={filters[option.key]}
                    onChange={(e) => onFilterChange(option.key, e.target.value)}
                    className="pl-10"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent className="p-0">
        <DocumentTable
          documents={paginatedDocuments}
          direction={direction}
          isLoading={loading}
          emptyMessage={emptyMessage}
          pagination={
            <div className="border-t border-border px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} - {Math.min(endIndex, totalItems)} of {totalItems} entries
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1">
                  <Button variant={currentPage === 1 ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(1)}>
                    1
                  </Button>
                  {currentPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
                  {currentPage > 1 && currentPage < totalPages && <Button variant="default" size="sm">{currentPage}</Button>}
                  {currentPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
                  {totalPages > 1 && (
                    <Button
                      variant={currentPage === totalPages ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          }
        />
      </CardContent>
    </Card>

    <div className="text-center text-sm text-muted-foreground">
      <StatusIcon className="w-4 h-4 inline mr-2 text-success" />
      {statusMessage}
    </div>
  </div>
);
