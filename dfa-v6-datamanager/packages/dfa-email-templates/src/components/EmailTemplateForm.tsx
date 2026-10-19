
"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { EmailTemplate, EmailTemplateFormData } from '../types';
import { EmailTemplateService } from '../services/api';
import './EmailTemplateForm.css';
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

type I18nMap = Record<string, string>;

const en: I18nMap = {
  editTemplate: 'Edit Template',
  addNewTemplate: 'Add New Template',
  back: 'Back',
  backToList: 'Back to List',
  composite_name: 'Name',
  loadingTemplateData: 'Loading template data...',
  templateKey: 'Template Key',
  templateKeyPlaceholder: 'e.g., welcome_email',
  name: 'Name',
  namePlaceholder: 'e.g., Welcome Email Template',
  language: 'Language',
  subject: 'Subject',
  subjectPlaceholder: 'e.g., Welcome to our platform!',
  htmlContent: 'HTML Content',
  textContent: 'Text Content',
  textContentPlaceholder: 'Dear {{ user_name }}, welcome to our platform!',
  active: 'Active',
  cancel: 'Cancel',
  updateTemplate: 'Update Template',
  createTemplate: 'Create Template',
  preview: 'Preview',
  close: 'Close',
  changesApplyToAllVariants: 'Changes to this field will apply to all language variants',
  templateKeyRequired: 'Template key is required',
  nameRequired: 'Name is required',
  subjectRequired: 'Subject is required',
  htmlContentRequired: 'HTML content is required',
  languageRequired: 'Language is required',
};

function interpolate(str: string | undefined, vars?: Record<string, string | number>) {
  if (str == null) return '';
  if (!vars) return str;
  return str.replace(/\{(.*?)\}/g, (_, k) => String(vars[k] ?? ''));
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string;


interface EmailTemplateFormProps {
  /** If single-template edit or create. Keep for backward compatibility. */
  template?: EmailTemplate | null;

  /** New: list of language options (from props only). */
  languages: { code: string; name: string }[];

  /** New: when editing a family of templates by language (same template_key). */
  templatesByLang?: Record<string, EmailTemplate | null>;

  /** New: provide the common template_key when editing multiple languages. */
  templateKey?: string;

  /** API base URL for fetching template data */
  apiBaseUrl?: string;

  /** Internationalization support */
  translations?: I18nMap;
  t?: TFunc;

  onSubmit: (data: EmailTemplateFormData) => void;
  onCancel: () => void;
  userData?: any;
}


export const EmailTemplateForm: React.FC<EmailTemplateFormProps> = ({
  template,
  languages,
  templatesByLang,
  templateKey,
  apiBaseUrl,
  translations,
  t: i18nT,
  onSubmit,
  onCancel,
  userData
}) => {
  const t = (key: keyof typeof en, vars?: Record<string, string | number>) => {
    // Prefer this screen's strings first. Parent `t` (e.g. EmailTemplatesTable) only knows list keys,
    // so delegating to it first would yield empty labels for cancel / save / preview / etc.
    const local =
      en[key] || (translations && translations[key as string]);
    if (local) return interpolate(local, vars);
    if (i18nT) {
      const remote = i18nT(key as string, vars);
      if (remote != null && String(remote).trim() !== '') return remote;
    }
    return String(key);
  };
  // Decide initial language:
  const [editorReady, setEditorReady] = useState(true);
  const [apiTemplatesByLang, setApiTemplatesByLang] = useState<Record<string, EmailTemplate | null>>({});
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  const initialLang = useMemo<string>(() => {
  if (template?.language) return template.language;
  if (templatesByLang) {
    const withData = languages.find(l => templatesByLang[l.code]);
    return withData?.code || languages[0]?.code || 'en';
  }
  return languages[0]?.code || 'en';
}, [template?.language, templatesByLang, languages]);


  const [selectedLang, setSelectedLang] = useState<string>(initialLang);

  const emptyForLang = (lang: string): EmailTemplateFormData => ({
    template_key: templateKey || template?.template_key || '',
    language: lang,
    name: '',
    subject: '',
    html_content: '',
    text_content: '',
    is_active: true,
  });

  // Function to fetch template data from API
  const fetchTemplateByKeyAndLanguage = async (key: string, language: string): Promise<EmailTemplate | null> => {
    if (!apiBaseUrl) return null;
    
    try {
      const apiService = new EmailTemplateService(apiBaseUrl);
      return await apiService.getTemplateByKeyAndLanguage(key, language);
    } catch (error) {
      console.error('Error fetching template:', error);
      return null;
    }
  };

  // Load template data for all languages when templateKey is provided
  useEffect(() => {
    const loadTemplatesForAllLanguages = async () => {
      if (!templateKey || !apiBaseUrl || templatesByLang) return; // Skip if using legacy approach
      
      setLoadingTemplate(true);
      const templates: Record<string, EmailTemplate | null> = {};
      
      for (const { code } of languages) {
        const template = await fetchTemplateByKeyAndLanguage(templateKey, code);
        templates[code] = template;
      }
      
      setApiTemplatesByLang(templates);
      setLoadingTemplate(false);
    };

    loadTemplatesForAllLanguages();
  }, [templateKey, apiBaseUrl, languages, templatesByLang]);

  const initialFormData: EmailTemplateFormData = useMemo(() => {
    // Use API-fetched templates if available
    const templatesToUse = templatesByLang || apiTemplatesByLang;
    
    if (templatesToUse && Object.keys(templatesToUse).length > 0) {
      const existing = templatesToUse[selectedLang];
      return existing
        ? {
            ...( { id: (existing as any).id } as any ),
            template_key: existing.template_key,
            language: existing.language,
            name: existing.name,
            subject: existing.subject,
            html_content: existing.html_content,
            text_content: existing.text_content || '',
            is_active: existing.is_active,
          }
        : emptyForLang(selectedLang);
    }
    if (template) {
      return {
        ...( { id: (template as any).id } as any ),
        template_key: template.template_key,
        language: template.language,
        name: template.name,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.text_content || '',
        is_active: template.is_active,
      };
    }
    // create mode
    return emptyForLang(initialLang);
  }, [template, templatesByLang, apiTemplatesByLang, selectedLang, initialLang]);

  const [formData, setFormData] = useState<EmailTemplateFormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // When the selected language changes, load that language's data
  useEffect(() => {
    setFormData(prev => {
      // Use API-fetched templates if available
      const templatesToUse = templatesByLang || apiTemplatesByLang;
      
      if (templatesToUse && Object.keys(templatesToUse).length > 0) {
        const existing = templatesToUse[selectedLang];
        if (existing) {
          return {
            ...( { id: (existing as any).id } as any ),
            template_key: existing.template_key,
            language: existing.language,
            name: existing.name,
            subject: existing.subject,
            html_content: existing.html_content,
            text_content: existing.text_content || '',
            is_active: existing.is_active,
          };
        } else {
          // For new language variants, preserve shared fields from other languages
          const anyExistingTemplate = Object.keys(templatesToUse)
            .map(key => templatesToUse[key])
            .find(t => t !== null);
          const sharedFields = anyExistingTemplate ? {
            template_key: anyExistingTemplate.template_key,
            name: anyExistingTemplate.name,
          } : {
            template_key: templateKey || template?.template_key || '',
            name: '',
          };
          
          return {
            ...sharedFields,
            language: selectedLang,
            subject: '',
            html_content: '',
            text_content: '',
            is_active: true,
          };
        }
      }
      // If single-template edit/create, just switch language on the form
      return { ...prev, language: selectedLang };
    });
    setErrors({});
  }, [selectedLang, templatesByLang, apiTemplatesByLang, templateKey, template]);

  const isEditMode = useMemo<boolean>(() => {
    if (template) return true;
    if (templatesByLang && Object.keys(templatesByLang).some(k => !!templatesByLang[k])) return true;
    if (apiTemplatesByLang && Object.keys(apiTemplatesByLang).some(k => !!apiTemplatesByLang[k])) return true;
    return false;
  }, [template, templatesByLang, apiTemplatesByLang]);

  // CHANGE #1: validate what you submit
const validateForm = (data: EmailTemplateFormData): boolean => {
  const newErrors: Record<string, string> = {};
  if (!data.template_key.trim()) newErrors.template_key = t('templateKeyRequired');
  if (!data.name.trim()) newErrors.name = t('nameRequired');
  if (!data.subject.trim()) newErrors.subject = t('subjectRequired');
  if (!data.html_content.trim()) newErrors.html_content = t('htmlContentRequired');

  // If language is tab-driven you can keep or drop this check.

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // CHANGE #2: submit with selectedLang + per-language id
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  const templatesToUse = templatesByLang || apiTemplatesByLang;
const currentForLang = templatesToUse && Object.keys(templatesToUse).length > 0
  ? templatesToUse[selectedLang]
  : null;

const base = (s?: string) => (s || '').toLowerCase().split('-')[0];

// Prefer the language code from the existing variant (e.g., 'fr'),
// otherwise use the base part of the selected tab (e.g., 'fr' from 'fr-FR').
const langForPayload =
  (currentForLang?.language as string | undefined) || base(selectedLang);

const payload: EmailTemplateFormData = { ...formData, language: langForPayload };

if (currentForLang && (currentForLang as any).id != null) {
  (payload as any).id = (currentForLang as any).id;
}

  console.log('[EmailTemplateForm] submitting', { selectedLang, payload });

  if (validateForm(payload)) onSubmit(payload);
};


  function decodeHtmlEntities(s: string) {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
  return (
    <div className="template-form-container">
      <div className="form-header">
        <h3>{isEditMode ? t('editTemplate') : t('addNewTemplate')}</h3>
        <button className="custom-back-action btn btn-primary" onClick={onCancel} title={t('backToList')}>
          <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="chevron-left" className="svg-inline--fa fa-chevron-left fa-fw" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512">
            <path fill="currentColor" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"></path>
          </svg>
          {t("back")}
        </button>
      </div>

      {loadingTemplate && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          {t('loadingTemplateData')}
        </div>
      )}

      {/* Language Tabs (replace dropdown) */}
      {/* Language Tabs (replace dropdown) */}
     


{showPreview && (
      <div className="preview-backdrop" onClick={() => setShowPreview(false)}>
    <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
      <div className="preview-header">
        <h4>{t('preview')}</h4>
        <button
          type="button"
          className="btn btn-sm btn-secondary email-form-preview-close"
          onClick={() => setShowPreview(false)}
        >
          {t('close')}
        </button>
      </div>
      <div
        className="preview-body"
        dangerouslySetInnerHTML={{
          __html: formData.html_content.includes('&lt;')
            ? decodeHtmlEntities(formData.html_content)
            : formData.html_content,
        }}
      />
    </div>
  </div>
)}


      <form onSubmit={handleSubmit} className="template-form">
        {/* Template Key */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="template_key">
                {t('templateKey')} <span className="asterisk">*</span>
              </label>
              <input
                type="text"
                id="template_key"
                name="template_key"
                value={formData.template_key}
                onChange={handleInputChange}
                className={errors.template_key ? 'error' : ''}
                placeholder={t('templateKeyPlaceholder')}
              />
              {errors.template_key && <span className="error-message">{errors.template_key}</span>}
             
            </div>

       
          </div>

        {/* Name */}
          <div className="form-group">
            <label htmlFor="name">
              {t('composite_name')} <span className="asterisk">*</span>
            </label>
            
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={errors.name ? 'error' : ''}
              placeholder={t('namePlaceholder')}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
            
          </div>
          {languages.length > 0 && (
  <div className="lang-tabs">
    {languages.map(({ code, name }) => {
      const isActive = selectedLang === code;
      const isAddMode = !template && !templatesByLang;
      const shouldDisable = isAddMode && !isActive;

      return (
        <button
          key={code}
          type="button"
          className={`lang-tab ${isActive ? 'active' : ''}`}
          onClick={() => !shouldDisable && setSelectedLang(code)}
          aria-pressed={isActive}
          disabled={shouldDisable}
        >
          {name}
        </button>
      );
    })}
  </div>
)}
        {/* Subject */}
          <div className="form-group">
            <label htmlFor="subject">{t('subject')} <span className="asterisk">*</span></label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleInputChange}
              className={errors.subject ? 'error' : ''}
              placeholder={t('subjectPlaceholder')}
            />
            {errors.subject && <span className="error-message">{errors.subject}</span>}
          </div>

        {/* HTML Content */}
          <div className="form-group">
  <div className="email-form-html-field-head">
    <label htmlFor="html_content">
      {t('htmlContent')} <span className="asterisk">*</span>
    </label>

    {/* Preview button */}
    <button
      type="button"
      className="btn btn-sm btn-secondary email-form-preview-open"
      onClick={() => setShowPreview(true)}
    >
      {t('preview')}
    </button>
  </div>

  <div className={errors.html_content ? 'error ck-wrapper' : 'ck-wrapper'}>
  {editorReady && ClassicEditor && (
    <CKEditor
      editor={ClassicEditor as any}
      data={formData.html_content}
      onChange={(_, editor) => {
        const data = editor.getData();
        setFormData(prev => ({ ...prev, html_content: data }));
        if (errors.html_content) setErrors(prev => ({ ...prev, html_content: '' }));
      }}
      config={{
        toolbar: [
          'heading', '|',
          'bold','italic','link','bulletedList','numberedList','blockQuote','insertTable',
          '|','undo','redo', '|', 'sourceEditing' 
          // If your build includes it, you can also add: 'preview', 'sourceEditing'
        ],
        // optional: allow all content if you use custom placeholders like {{ user_name }}
        // removePlugins: [ 'CKBox', 'CKFinder' ],
      }}
    />
    )}
  </div>

            {errors.html_content && <span className="error-message">{errors.html_content}</span>}
          </div>

        {/* Text Content */}
          <div className="form-group">
            <label htmlFor="text_content">{t('textContent')}</label>
            <textarea
              id="text_content"
              name="text_content"
              value={formData.text_content}
              onChange={handleInputChange}
              rows={4}
              placeholder={t('textContentPlaceholder')}
            />
          </div>

        {/* Active */}
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
              />
              {t('active')}
            </label>
          </div>

        {/* Actions */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
            {template || templatesByLang ? t('updateTemplate') : t('createTemplate')}
            </button>
          </div>
        </form>
    </div>
  );
};
