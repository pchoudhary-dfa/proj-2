import React, { useState, useEffect, useMemo } from 'react';
import { EmailTemplate, EmailTemplateFormData, EmailTemplatesTableProps, PaginatedResponse, EmailTemplateSummary } from '../types';
import { EmailTemplateService, PaginatedResponse as ApiPaginatedResponse } from '../services/api';
import { EmailTemplateForm } from './EmailTemplateForm';
import './EmailTemplatesTable.css';

interface FilterState {
  templateKey: string;
  name: string;
  language: string;
  status: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
}

type I18nMap = Record<string, string>;

const en: I18nMap = {
  templates: 'Templates',
  createTemplate: 'Create template',
  showingXofYRecords: 'Showing {x} of {y} records',
  filters: 'Filters',
  csv: 'CSV',
  excel: 'Excel',
  json: 'JSON',
  refresh: 'Refresh',
  clearAll: 'Clear All',
  templateKey: 'Template Key',
  name: 'Name',
  language: 'Language',
  status: 'Status',
  createdBy: 'Created By',
  dateFrom: 'Date From',
  dateTo: 'Date To',
  allLanguages: 'All Languages',
  allStatus: 'All Status',
  active: 'Active',
  inactive: 'Inactive',
  allCreators: 'All Creators',
  searchTemplateKey: 'Search template key...',
  searchName: 'Search name...',
  closeFilters: 'Close Filters',
  subject: 'Subject',
  htmlContent: 'HTML Content',
  textContent: 'Text Content',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  actions: 'Actions',
  edit: 'Edit',
  delete: 'Delete',
  confirmDelete: 'Are you sure you want to delete this template?',
  loading: 'Loading',
  csvDownloaded: 'CSV file downloaded successfully',
  csvFailed: 'Failed to export CSV file',
  excelDownloaded: 'Excel file downloaded successfully',
  excelFailed: 'Failed to export Excel file',
  jsonDownloaded: 'JSON file downloaded successfully',
  jsonFailed: 'Failed to export JSON file',
  templatesRefreshed: 'Templates refreshed',
  templateDeleted: 'Template deleted successfully',
  templateDeleteFailed: 'Failed to delete template',
  templateUpdated: 'Template updated successfully',
  templateCreated: 'Template created successfully',
  failedToLoadTemplates: 'Failed to load templates',
  failedToSaveTemplate: 'Failed to save template',
};

function interpolate(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str;
  return str.replace(/\{(.*?)\}/g, (_, k) => String(vars[k] ?? ''));
}
type TFunc = (key: string, vars?: Record<string, string | number>) => string;
type LangOption = { code: string; name: string };

export const EmailTemplatesTable: React.FC<
  EmailTemplatesTableProps & {
    translations?: I18nMap;
    t?: TFunc;
    languages?: LangOption[]; 
    preferredLocale?: string;  
  }
> = ({
  apiBaseUrl,
  apiKey,
  onError,
  onSuccess,
  userData,
  getTemplates,
  getTemplatesGrouped,
  getTemplatesByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  translations,
  t: i18nT,
  defaultPageSize = 20,
  pageSizeOptions = [5, 10, 20, 50],
  languages = [{ code: 'en', name: 'English' }],
  preferredLocale = 'en', 
}) => {
  const t = (key: keyof typeof en, vars?: Record<string, string | number>) => {
    if (i18nT) return i18nT(key as string, vars);
    const source = (translations && translations[key]) || en[key];
    return interpolate(source, vars);
  };

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const apiService = useMemo(
    () =>
      new EmailTemplateService(apiBaseUrl, {
        defaultHeaders: apiKey ? { "X-Api-Key": apiKey } : {},
      }),
    [apiBaseUrl, apiKey]
  );
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | null>(null);
  const [editingTemplatesByLang, setEditingTemplatesByLang] =
    useState<Record<string, EmailTemplate | null> | null>(null);
  
  // grouped templates + pagination
  const [groupedTemplates, setGroupedTemplates] = useState<(EmailTemplate | EmailTemplateSummary)[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [useGroupedView, setUseGroupedView] = useState<boolean>(true);
  const [filters, setFilters] = useState<FilterState>({
    templateKey: '',
    name: '',
    language: '',
    status: '',
    createdBy: '',
    dateFrom: '',
    dateTo: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
       templateKey: '',
       name: '',
       language: '',
       status: '',
       createdBy: '',
       dateFrom: '',
       dateTo: '',
    });
  // confirm dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [confirmDialogData, setConfirmDialogData] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);


  const loadTemplates = async () => {
    try {
      setLoading(true);
      if (useGroupedView) {
        await loadGroupedTemplates();
      } else {
        const data = getTemplates ? await getTemplates() : await apiService.getAllTemplates();
        const templatesArray = Array.isArray(data) ? data : [];
        setTemplates(templatesArray);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToLoadTemplates');
      console.error('Error loading templates:', error);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupedTemplates = async () => {
    try {
      const response = getTemplatesGrouped 
        ? await getTemplatesGrouped(currentPage, pageSize, preferredLocale, false)
        : await apiService.getTemplatesGrouped(currentPage, pageSize, preferredLocale, false);
      
      setGroupedTemplates(response.results);
      setTotalCount(response.count);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToLoadTemplates');
      console.error('Error loading grouped templates:', error);
      onError?.(errorMessage);
      throw error;
    }
  };

  const applyFilters = (f: FilterState) => {
       // now a pure helper (no setState). Kept if you want to reuse elsewhere.
       let filtered = [...templates];
        if (f.templateKey) {
      filtered = filtered.filter((template) =>
        template.template_key?.toLowerCase().includes(f.templateKey.toLowerCase())
      );
    }

    if (f.name) {
      filtered = filtered.filter((template) =>
        template.name?.toLowerCase().includes(f.name.toLowerCase())
      );
    }

    if (f.language) {
      filtered = filtered.filter(
        (template) => template.language?.toLowerCase() === f.language.toLowerCase()
      );
    }

    if (f.status) {
      const isActive = f.status === "active";
      filtered = filtered.filter((template) => template.is_active === isActive);
    }

    if (f.createdBy) {
      filtered = filtered.filter((template) => {
        const createdBy = template.created_by as any;
        const createdByStr = typeof createdBy === 'object' && createdBy !== null
          ? (createdBy.name || createdBy.id || createdBy.email || '')
          : String(createdBy || '');
        return createdByStr.toLowerCase().includes(f.createdBy.toLowerCase());
      });
    }

    if (f.dateFrom) {
      filtered = filtered.filter((template) => {
        const v = template.created_at;
        if (!v) return true; // 👈 changed: keep if missing
        const templateDate = new Date(v);
        const fromDate = new Date(f.dateFrom);
        return templateDate >= fromDate;
      });
    }

    if (f.dateTo) {
      filtered = filtered.filter((template) => {
        const v = template.created_at;
        if (!v) return true; // 👈 changed: keep if missing
        const templateDate = new Date(v);
        const toDate = new Date(f.dateTo);
        toDate.setHours(23, 59, 59, 999);
        return templateDate <= toDate;
      });
    }

    const byKey = new Map<string, EmailTemplate>();

    const newerOf = (a: EmailTemplate, b: EmailTemplate) => {
      const ad = new Date(a.updated_at || a.created_at || 0).getTime();
      const bd = new Date(b.updated_at || b.created_at || 0).getTime();
      return bd > ad ? b : a;
    };

    const choose = (current: EmailTemplate | undefined, candidate: EmailTemplate) => {
      if (!current) return candidate;
      if ((current.language || "").toLowerCase() === preferredLocale.toLowerCase()) return current;
      if ((candidate.language || "").toLowerCase() === preferredLocale.toLowerCase()) return candidate;
      return newerOf(current, candidate);
    };

    for (const item of filtered) {
      if (!item.template_key) continue;
      const existing = byKey.get(item.template_key);
      byKey.set(item.template_key, choose(existing, item));
    }

    return Array.from(byKey.values());
  };

  const handleAddTemplate = () => {
    setEditingTemplate(null);
    setEditingTemplateKey(null);
    setEditingTemplatesByLang(null);
    setCurrentView('create');
  };

  const handleEditTemplate = async (template: EmailTemplate | EmailTemplateSummary) => {
    const key = template.template_key;
    
    if (useGroupedView) {
      try {
        setLoading(true);
        const templatesByKey = getTemplatesByKey 
          ? await getTemplatesByKey(key)
          : await apiService.getTemplatesByKey(key);
        
        const normalize = (s?: string) => (s || '').toLowerCase();
        const base = (s?: string) => normalize(s).split('-')[0];
        
        const findVariantFor = (code: string) => {
          const want = normalize(code);
          const wantBase = base(code);
          return (
            templatesByKey.find(t => normalize(t.language) === want) ||
            templatesByKey.find(t => normalize(t.language) === wantBase) ||
            templatesByKey.find(t => base(t.language) === wantBase) ||
            null
          );
        };
        
        const byLang: Record<string, EmailTemplate | null> = {};
        languages.forEach(({ code }) => {
          byLang[code] = findVariantFor(code);
        });
        
        setEditingTemplate(null);
        setEditingTemplateKey(key);
        setEditingTemplatesByLang(byLang);
        setCurrentView('edit');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load template data';
        onError?.(errorMessage);
      } finally {
        setLoading(false);
      }
    } else {
      const byLang: Record<string, EmailTemplate | null> = {};
      languages.forEach(({ code }) => {
        byLang[code] = templates.find(t => t.template_key === key && t.language === code) || null;
      });

      setEditingTemplate(null);
      setEditingTemplateKey(key);
      setEditingTemplatesByLang(byLang);
      setCurrentView('edit');
    }
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = async (id: number) => {
    setConfirmDialogData({
      title: t('confirm_delete'),
      message: t('confirmDelete'),
      onConfirm: async () => {
        try {
          if (deleteTemplate) {
            await deleteTemplate(id);
          } else {
            await apiService.deleteTemplate(id);
          }
          await loadTemplates();
          onSuccess?.(t('templateDeleted'));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t('templateDeleteFailed');
          onError?.(errorMessage);
        }
        setShowConfirmDialog(false);
        setConfirmDialogData(null);
      },
      onCancel: () => {
        setShowConfirmDialog(false);
        setConfirmDialogData(null);
      }
    });
    setShowConfirmDialog(true);
  };

  const handleFormSubmit = async (formData: EmailTemplateFormData) => {
    try {
      const isEditingFamily = !!editingTemplatesByLang && !!editingTemplateKey;
  
      if (isEditingFamily) {
        const sharedFields: (keyof EmailTemplateFormData)[] = ['template_key', 'name'];
        const originalForSelected = editingTemplatesByLang[formData.language] || null;
  
        const hasSharedFieldChanges = sharedFields.some((field) => {
          const currentValue = (formData as any)[field];
          const originalValue = originalForSelected ? (originalForSelected as any)[field] : undefined;
          return currentValue !== originalValue;
        });
  
        if (hasSharedFieldChanges) {
          const normalize = (s?: string) => (s || '').toLowerCase();
          const baseLang = (s?: string) => normalize(s).split('-')[0];
          const updatePromises: Promise<any>[] = [];

          for (const langCode of Object.keys(editingTemplatesByLang)) {
            const template = editingTemplatesByLang[langCode];
            if (!template) continue;

            const forThisLang = {
              template_key: formData.template_key,
              name: formData.name,
              language: template.language || langCode,
              subject: (template.language === formData.language || normalize(langCode) === normalize(formData.language))
                ? formData.subject
                : template.subject,
              html_content: (template.language === formData.language || normalize(langCode) === normalize(formData.language))
                ? formData.html_content
                : template.html_content,
              text_content: (template.language === formData.language || normalize(langCode) === normalize(formData.language))
                ? formData.text_content
                : template.text_content,
              is_active: (template.language === formData.language || normalize(langCode) === normalize(formData.language))
                ? formData.is_active
                : template.is_active,
            };

            if (updateTemplate) updatePromises.push(updateTemplate(template.id, forThisLang));
            else updatePromises.push(apiService.updateTemplate(template.id, forThisLang));
          }

          const vals: (EmailTemplate | null)[] = Object.keys(editingTemplatesByLang)
            .map((k) => editingTemplatesByLang[k]);

          const selectedExists =
            vals.some((t: EmailTemplate | null) => t && normalize(t.language) === normalize(formData.language)) ||
            vals.some((t: EmailTemplate | null) => t && baseLang(t.language) === baseLang(formData.language));

          if (!selectedExists) {
            const newLangCode = baseLang(formData.language);
            const createBody = {
              template_key: formData.template_key,
              name: formData.name,
              language: newLangCode,
              subject: formData.subject,
              html_content: formData.html_content,
              text_content: formData.text_content,
              is_active: formData.is_active,
            };
            if (createTemplate) updatePromises.push(createTemplate(createBody));
            else updatePromises.push(apiService.createTemplate(createBody));
          }

          await Promise.all(updatePromises);
          onSuccess?.(t('templateUpdated'));
        } else {
          const existing = editingTemplatesByLang[formData.language];
  
          if (existing) {
            const body = {
              template_key: formData.template_key,
              name: formData.name,
              language: formData.language,
              subject: formData.subject,
              html_content: formData.html_content,
              text_content: formData.text_content,
              is_active: formData.is_active,
            };
  
            if (updateTemplate) await updateTemplate(existing.id, body);
            else await apiService.updateTemplate(existing.id, body);
  
            onSuccess?.(t('templateUpdated'));
          } else {
            const body = {
              template_key: formData.template_key,
              name: formData.name,
              language: formData.language,
              subject: formData.subject,
              html_content: formData.html_content,
              text_content: formData.text_content,
              is_active: formData.is_active,
            };
  
            if (createTemplate) await createTemplate(body);
            else await apiService.createTemplate(body);
  
            onSuccess?.(t('templateCreated'));
          }
        }
      } else if (editingTemplate) {
        const body = {
          template_key: formData.template_key,
          name: formData.name,
          language: formData.language,
          subject: formData.subject,
          html_content: formData.html_content,
          text_content: formData.text_content,
          is_active: formData.is_active,
        };
  
        if (updateTemplate) await updateTemplate(editingTemplate.id, body);
        else await apiService.updateTemplate(editingTemplate.id, body);
  
        onSuccess?.(t('templateUpdated'));
      } else {
        const body = {
          template_key: formData.template_key,
          name: formData.name,
          language: formData.language,
          subject: formData.subject,
          html_content: formData.html_content,
          text_content: formData.text_content,
          is_active: formData.is_active,
        };
  
        if (createTemplate) await createTemplate(body);
        else await apiService.createTemplate(body);
  
        onSuccess?.(t('templateCreated'));
      }
  
      await loadTemplates();
      setCurrentView('list');
      setEditingTemplate(null);
      setEditingTemplateKey(null);
      setEditingTemplatesByLang(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToSaveTemplate');
      onError?.(errorMessage);
    }
  };
  

  // Pagination handlers
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (useGroupedView) {
      loadTemplates();
    }
  }, [currentPage, pageSize, useGroupedView]);

  const handleFormCancel = () => {
    setCurrentView('list');
    setEditingTemplate(null);
  };

  // helper
  const normalize = (s?: string | null | any) => {
    if (s == null) return '';
    if (typeof s === 'string') return s.toLowerCase();
    if (typeof s === 'object' && s !== null) {
      return (s.name || s.id || s.email || '').toLowerCase();
    }
    return String(s).toLowerCase();
  };

  // FRONT-END filtered list for whatever you're rendering
  const visibleRows = React.useMemo(() => {
    const source = useGroupedView ? groupedTemplates : templates;
    let rows = [...source];

    if (appliedFilters.templateKey) {
      const q = normalize(appliedFilters.templateKey);
      rows = rows.filter(t => normalize((t as any).template_key).includes(q));
    }

    if (appliedFilters.name) {
            const q = normalize(appliedFilters.name);
      rows = rows.filter(t => normalize((t as any).name).includes(q));
    }

      if (appliedFilters.status) {
        const wantActive = appliedFilters.status === 'active';
      rows = rows.filter(t => (t as any).is_active === wantActive);
    }

    if (appliedFilters.createdBy) {
      const q = normalize(appliedFilters.createdBy);
      rows = rows.filter(t => normalize((t as any).created_by).includes(q));
    }

    // 👇 Null-safe date filters (minimal change)
    if (appliedFilters.dateFrom) {
      const from = new Date(appliedFilters.dateFrom);
      rows = rows.filter(t => {
        const v = (t as any).created_at;
        return v ? new Date(v) >= from : true;
      });
    }

    if (appliedFilters.dateTo) {
      const to = new Date(appliedFilters.dateTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter(t => {
        const v = (t as any).created_at;
        return v ? new Date(v) <= to : true;
      });
    }

    // (language filter omitted from panel; add here if you re-enable it)

    if (!useGroupedView) {
      const byKey = new Map<string, EmailTemplate>();
      const newerOf = (a: EmailTemplate, b: EmailTemplate) => {
        const ad = new Date(a.updated_at || a.created_at || 0).getTime();
        const bd = new Date(b.updated_at || b.created_at || 0).getTime();
        return bd > ad ? b : a;
      };
      const choose = (current: EmailTemplate | undefined, candidate: EmailTemplate) => {
        if (!current) return candidate;
        if (normalize(current.language) === normalize(preferredLocale)) return current;
        if (normalize(candidate.language) === normalize(preferredLocale)) return candidate;
        return newerOf(current, candidate);
      };
      for (const item of rows as EmailTemplate[]) {
        if (!item.template_key) continue;
        const existing = byKey.get(item.template_key);
        byKey.set(item.template_key, choose(existing, item));
      }
      return Array.from(byKey.values());
    }

    return rows;
  }, [useGroupedView, groupedTemplates, templates, appliedFilters, preferredLocale]);

  const handleExportCSV = () => {
    try {
      const headers = [
        t('templateKey'),
        t('name'),
        t('language'),
        t('subject'),
        t('status'),
        t('createdAt'),
        t('updatedAt'),
        t('createdBy'),
      ];

      const formatCreatedBy = (createdBy: any) => {
        if (!createdBy) return '';
        if (typeof createdBy === 'object' && createdBy !== null) {
          return createdBy.name || createdBy.id || createdBy.email || '';
        }
        return String(createdBy);
      };

      const rowsForExport = visibleRows as any[];

      const csvRows = rowsForExport.map((template) => [
        template.template_key ?? '',
        template.name ?? '',
        template.language ?? '',
        template.subject ?? '',
        template.is_active ? t('active') : t('inactive'),
        template.created_at ?? '',
        template.updated_at ?? '',
        formatCreatedBy(template.created_by),
      ]);
      
      const csvContent = [headers, ...csvRows]
        .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `email_templates_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onSuccess?.(t('csvDownloaded'));
    } catch (error) {
      onError?.(t('csvFailed'));
    }
  };

  const handleExportExcel = async () => {
    try {
      const m = await import('xlsx');
      const XLSX: any = (m as any).default ?? m;
      const writeFile = XLSX.writeFileXLSX ?? XLSX.writeFile;
  
      const s = (v: any) => (v == null ? '' : String(v));
      const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
      const fmtDate = (v: any) => {
        if (!v) return '';
        try {
          const d = v instanceof Date ? v : new Date(v);
          if (isNaN(d.getTime())) return String(v); // Return original value if date parsing fails
          return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        } catch (error) {
          return String(v); // Return original value if any error occurs
        }
      };
      
      const formatCreatedBy = (createdBy: any) => {
        if (!createdBy) return '';
        if (typeof createdBy === 'object' && createdBy !== null) {
          return createdBy.name || createdBy.id || createdBy.email || '';
        }
        return String(createdBy);
      };
  
      const rowsForExport = (visibleRows as any[]).map((row) => [
        s(row.template_key),
        s(row.name),
        s(row.language),
        s(row.subject),
        row.is_active ? t('active') : t('inactive'),
        fmtDate(row.created_at),
        fmtDate(row.updated_at),
        formatCreatedBy(row.created_by),
      ]);

      const headers = [
        t('templateKey'), t('name'), t('language'), t('subject'),
        t('status'), t('createdAt'), t('updatedAt'), t('createdBy'),
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rowsForExport]);
      (ws as any)['!cols'] = [
        { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 40 },
        { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 24 },
      ];
  
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Email Templates');
  
      const filename = `email_templates_${new Date().toISOString().slice(0,10)}.xlsx`;
      writeFile(wb, filename, { compression: true, bookType: 'xlsx' });
      onSuccess?.(t('excelDownloaded'));
    } catch (err) {
      console.error('Excel export failed:', err);
      onError?.(t('excelFailed'));
    }
  };
  
  

  const handleExportJSON = () => {
    try {
      const rowsForExport = visibleRows as any[]; // 👈 changed
      const jsonData = {
        exported_at: new Date().toISOString(),
        total_templates: rowsForExport.length, // 👈 changed
        templates: rowsForExport.map((template) => ({
          id: template.id,
          template_key: template.template_key,
          name: template.name,
          language: template.language,
          subject: template.subject,
          html_content: template.html_content,
          text_content: template.text_content,
          is_active: template.is_active,
          created_at: template.created_at,
          updated_at: template.updated_at,
          created_by: template.created_by,
          updated_by: template.updated_by,
        })),
      };
      
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `email_templates_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      onSuccess?.(t('jsonDownloaded'));
    } catch (error) {
      onError?.(t('jsonFailed'));
    }
  };

  const handleFilters = () => {
    setShowFilters(!showFilters);
  };

  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters); // visibleRows will recompute
    setShowFilters(false);
  };
  const clearFilters = () => {
    setFilters({
      templateKey: '',
      name: '',
      language: '',
      status: '',
      createdBy: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  const getUniqueLanguages = () => {
    const source = useGroupedView ? groupedTemplates : templates; // 👈 changed (optional)
    const languages = source.map((t: any) => t.language).filter(Boolean) as string[];
    return Array.from(new Set(languages)).sort();
  };

  const getUniqueCreators = () => {
    const source = useGroupedView ? groupedTemplates : templates;
    const creators = source
      .map((t: any) => {
        const v = (t as any).created_by;
        // force to string to avoid objects becoming [object Object] keys/labels
        return typeof v === 'object' && v !== null
          ? String(v.name ?? v.id ?? '')
          : String(v ?? '');
      })
      .filter((s: string) => s.length > 0);
    return Array.from(new Set(creators)).sort();
  };

  const handleRefresh = () => {
    loadTemplates();
    onSuccess?.(t('templatesRefreshed'));
  };

  if (loading) {
    return (
      <div className="email-templates-container">
        <div className="loading">{t('loading')}</div>
      </div>
    );
  }

  if (currentView !== 'list') {
    return (
      <div className="email-templates-container">
        <EmailTemplateForm
          template={editingTemplate}
          languages={languages}
          templatesByLang={editingTemplatesByLang || undefined}
          templateKey={editingTemplateKey || undefined}
          apiBaseUrl={apiBaseUrl}
          translations={translations}
          t={t}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          userData={userData}
        />
      </div>
    );
  }
  const showPager = useGroupedView && totalCount > pageSize;
  return (
    <div className="email-templates-container">
      <div className="email-templates-header">
        <div className="header-left">
          <h1>
            {t('templates')}
            <button 
              style={{ marginLeft: '14px' }}
              className="btn btn-primary create-btn"
              onClick={handleAddTemplate}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 640 640"
                fill="white"
                style={{ margin: 0, width: '17px', height: '17px' }}
              >
                <path d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z" />
              </svg>
              {t('createTemplate')}
            </button>
          </h1>
        </div>
        <div className="header-right">
          <div className="action-buttons-group">
            <button className="btn btn-secondary" onClick={handleFilters}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 640 640"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)' }}
              >
                <path d="M64 157.7C64 141.3 77.3 128 93.7 128L546.4 128C562.8 128 576.1 141.3 576.1 157.7C576.1 165.6 573 173.1 567.4 178.7L400 345.9L400 546.3C400 562.7 386.7 576 370.3 576C362.4 576 354.9 572.9 349.3 567.3L247 465C242.5 460.5 240 454.4 240 448L240 345.9L72.7 178.6C67.1 173.1 64 165.5 64 157.7zM137.9 176L281 319C285.5 323.5 288 329.6 288 336L288 438.1L352 502.1L352 336C352 329.6 354.5 323.5 359 319L502 176L137.9 176z" />
              </svg>             
              {t('filters')}
            </button>
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)' }}
              >
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
              {t('csv')}
            </button>
            <button className="btn btn-secondary" onClick={handleExportExcel}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 640 640"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)' }}
              >
                <path d="M352 224L352 320L480 320L480 224L352 224zM288 224L160 224L160 320L288 320L288 224zM96 384L96 160C96 124.7 124.7 96 160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 384zM480 384L352 384L352 480L480 480L480 384zM288 480L288 384L160 384L160 480L288 480z" />
              </svg>
              {t('excel')}
            </button>
            <button className="btn btn-secondary refresh-btn" onClick={handleRefresh}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '4px', transform: 'translateY(-1px)' }}
              >
                <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" />
              </svg>
              {t('refresh')}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-header">
          </div>
          <div className="filter-grid">
            <div className="filter-row">
              <div className="filter-item">
                <label>{t('templateKey')}</label>
                <input
                  type="text"
                  value={filters.templateKey}
                  onChange={(e) => handleFilterChange('templateKey', e.target.value)}
                  placeholder={t('searchTemplateKey')}
                  className="filter-input"
                />
              </div>
              <div className="filter-item">
                <label>{t('name')}</label>
                <input
                  type="text"
                  value={filters.name}
                  onChange={(e) => handleFilterChange('name', e.target.value)}
                  placeholder={t('searchName')}
                  className="filter-input"
                />
              </div>
              <div className="filter-item">
                <label>{t('status')}</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="filter-select"
                >
                  <option value="">{t('allStatus')}</option>
                  <option value="active">{t('active')}</option>
                  <option value="inactive">{t('inactive')}</option>
                </select>
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-item">
                <label>{t('createdBy')}</label>
                <select
                  value={filters.createdBy}
                  onChange={(e) => handleFilterChange('createdBy', e.target.value)}
                  className="filter-select"
                >
                  <option value="">{t('allCreators')}</option>
                  {getUniqueCreators().map((creator) => (
                     <option key={creator} value={creator}>
                       {String(creator)}
                     </option>
                   ))}
                </select>
              </div>
              <div className="filter-item">
                <label>{t('dateFrom')}</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="filter-input"
                />
              </div>
              <div className="filter-item">
                <label>{t('dateTo')}</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="filter-input"
                />
              </div>
            </div>
            <div
  className="filter-buttons-row"
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '8px',
  }}
>
  <button
    className="btn btn-primary"
    onClick={handleApplyFilters}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    {t('filters')}
  </button>

  {/* spacer pushes the next buttons to the right end */}
  <div className="spacer" style={{ flex: 1 }} />

  <button
    className="btn btn-secondary"
    onClick={clearFilters}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'text-bottom', transform: 'translateY(-1px)' }}
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
    {t('clearAll')}
  </button>

  <button
    className="btn btn-secondary"
    onClick={() => setShowFilters(false)}
    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'text-bottom', transform: 'translateY(-1px)' }}
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
    {t('closeFilters')}
  </button>
</div>

          </div>
        </div>
      )}

      <div className="email-templates-table-container">
        <table className="email-templates-table">
          <thead>
            <tr>
              <th>{t('templateKey')}</th>
              <th>{t('name')}</th>
              <th>{t('createdAt')}</th>
              <th>{t('updatedAt')}</th>
              <th >{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
          {visibleRows.map((template: any, idx: number) => {
            const rawKey = useGroupedView ? (template as any).template_key : (template as EmailTemplate).id;
            const rowKey =
              typeof rawKey === 'string' || typeof rawKey === 'number'
                ? String(rawKey)
                : `${String((template as any).id ?? (template as any).template_key ?? '')}-${idx}`;
           return (
             <tr key={rowKey}>
               <td>{String(template.template_key ?? '')}</td>
               <td>{String(template.name ?? '')}</td>
               <td>{String(template.created_at ?? '')}</td>
               <td>{String(template.updated_at ?? '')}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn btn-sm btn-edit"
                      onClick={() => handleEditTemplate(template)}
                      title={t('edit')}
                    >
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        data-prefix="fas"
                        data-icon="pen-to-square"
                        className="svg-inline--fa fa-pen-to-square table-action-btn"
                        role="img"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 512 512"
                      >
                        <path
                          fill="currentColor"
                          d="M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z"
                        ></path>
                      </svg>
                    </button>
                    {'id' in template && template.id != null && (
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() => handleDeleteTemplate(template.id)}
                        title={t('delete')}
                      >
                        <svg
                          data-prefix="fas"
                          data-icon="trash"
                          className="svg-inline--fa fa-trash table-action-btn"
                          role="img"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 448 512"
                        >
                          <path
                            fill="currentColor"
                            d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z"
                          ></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
                </tr>
            );
          })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <footer
           className="pagination-footer"
           style={{
             paddingLeft: '5px',
             paddingRight: '5px',
             display: 'grid',
             gridTemplateColumns: '1fr auto 1fr',  // left | center | right
             alignItems: 'center',
             gap: '8px'
           }}
         >
           <div
             className="pagination-controls"
             style={{ justifySelf: 'start', visibility: showPager ? 'visible' : 'hidden' }}
           >
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {Math.ceil(totalCount / pageSize)}
              </span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
              >
                Next
              </button>
              </div>
          
          <div
            className="page-size-selector"
            style={{ justifySelf: 'center', visibility: showPager ? 'visible' : 'hidden' }}
          >
              <label htmlFor="pageSize">Per page:</label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="page-size-select"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              </div>
              <div className="pagination-info" style={{ justifySelf: 'end' }}>
            {t('showingXofYRecords', {
              x: visibleRows.length,
              y: useGroupedView ? groupedTemplates.length : templates.length
            })}
          </div>
      </footer>

      {/* Custom Confirmation Dialog */}
      {showConfirmDialog && confirmDialogData && (
        <div className="confirmation-dialog-overlay" onClick={confirmDialogData.onCancel}>
          <div className="confirmation-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirmation-dialog-header">
              <h4>{confirmDialogData.title}</h4>
            </div>
            <div className="confirmation-dialog-body">
              <p>{confirmDialogData.message}</p>
            </div>
            <div className="confirmation-dialog-footer">
              <button 
                className="btn btn-secondary" 
                onClick={confirmDialogData.onCancel}
              >
                Cancel
              </button>
              <button 
                style={{color:"black"}}
                className="btn btn-danger" 
                onClick={confirmDialogData.onConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
