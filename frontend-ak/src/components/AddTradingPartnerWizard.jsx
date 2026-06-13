import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle2, Circle, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  partnersService,
  wizardFormToPartnerPayload,
  apiPartnerToWizardForm,
  validateWizardStep,
  buildWizardSectionPayload,
  computePersistedStepsFromForm,
} from '@/services/partners';
import { Step1BusinessPartner } from './wizard/Step1BusinessPartner';
import { Step2EDIProfile } from './wizard/Step2EDIProfile';
import { Step3ERPContext } from './wizard/Step3ERPContext';
import { Step4Documents } from './wizard/Step4Documents';
import { Step5Specifications } from './wizard/Step5Specifications';
import { Step6Mapping } from './wizard/Step6Mapping';
import { Step7Transport } from './wizard/Step7Transport';
import { Step8Testing } from './wizard/Step8Testing';
import { Step9GoLive } from './wizard/Step9GoLive';

const STEPS = [
  { id: 1, title: 'Business Partner', description: 'Who are they?' },
  { id: 2, title: 'EDI Profile', description: 'How do they talk EDI?' },
  { id: 3, title: 'ERP & System Context', description: 'System context (optional)', optional: true },
  { id: 4, title: 'Documents', description: 'What flows?', editHidden: true },
  { id: 5, title: 'Specifications', description: 'Teach the system' },
  { id: 6, title: 'Mapping', description: 'Build mappings' },
  { id: 7, title: 'Transport', description: 'How files move' },
  { id: 8, title: 'Testing', description: 'Validate & simulate' },
  { id: 9, title: 'Go Live', description: 'Activate partner' },
];

const INITIAL_FORM_DATA = {
  businessName: '',
  partnerCode: '',
  role: '',
  industry: '',
  country: '',
  timezone: '',
  businessContact: { name: '', email: '', phone: '' },
  technicalContact: { name: '', email: '', phone: '' },
  status: 'Draft',
  ediStandard: '',
  version: '',
  functionalGroups: [],
  characterSet: '',
  delimiters: { element: '*', segment: '~', subElement: '>' },
  isaSenderId: '',
  isaReceiverId: '',
  gsIds: { sender: '', receiver: '' },
  erpContext: {
    partnerERP: {
      system: 'Unknown',
      version: '',
      customName: '',
      hasCustomizations: false,
      notes: '',
    },
    targetSystem: {
      system: '',
      integrationMethod: '',
      dataOwner: '',
    },
  },
  documents: [],
  specFiles: [],
  sampleFiles: [],
  exceptionRules: '',
  partnerSpecificRules: null,
  mappings: [],
  transportType: '',
  transportConfig: {},
  testResults: [],
  testStatus: '',
  lastTestDate: '',
  testNotes: '',
  activationDate: '',
  monitoringEnabled: true,
};

export const AddTradingPartnerWizard = ({ open, onClose, onComplete, editPartnerId = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [persistedSteps, setPersistedSteps] = useState(new Set());
  const [savedPartnerId, setSavedPartnerId] = useState(null);
  const [savingStep, setSavingStep] = useState(false);
  const [navSaving, setNavSaving] = useState(false);
  const [loadingPartnerDetail, setLoadingPartnerDetail] = useState(false);
  const [formData, setFormData] = useState(() => ({ ...INITIAL_FORM_DATA }));
  const [sectionErrors, setSectionErrors] = useState({});
  const [saveHint, setSaveHint] = useState(null);
  const [saveHintError, setSaveHintError] = useState(null);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [previousBlockedOpen, setPreviousBlockedOpen] = useState(false);
  const lastSavedJsonRef = useRef('');
  const formDataRef = useRef(formData);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const isDirty =
    open &&
    lastSavedJsonRef.current &&
    JSON.stringify(formData) !== lastSavedJsonRef.current;

  const syncLastSaved = useCallback((data) => {
    lastSavedJsonRef.current = JSON.stringify(data);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (editPartnerId) {
      lastSavedJsonRef.current = '';
      setLoadingPartnerDetail(true);
      partnersService
        .getById(editPartnerId)
        .then((api) => {
          if (cancelled) return;
          const mapped = { ...INITIAL_FORM_DATA, ...apiPartnerToWizardForm(api) };
          setFormData(mapped);
          setSavedPartnerId(String(editPartnerId));
          setCurrentStep(1);
          const persisted = computePersistedStepsFromForm(mapped);
          setPersistedSteps(persisted);
          setCompletedSteps(new Set(persisted));
          syncLastSaved(mapped);
          setSectionErrors({});
        })
        .catch(() => {
          if (!cancelled) {
            toast.error('Could not load partner for editing');
            onClose?.();
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingPartnerDetail(false);
        });
      return () => {
        cancelled = true;
      };
    }
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setPersistedSteps(new Set());
    setSavedPartnerId(null);
    setSavingStep(false);
    const fresh = { ...INITIAL_FORM_DATA };
    setFormData(fresh);
    syncLastSaved(fresh);
    setSectionErrors({});
    return undefined;
  }, [open, editPartnerId, syncLastSaved]);

  const updateFormData = useCallback((step, data) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  useEffect(() => {
    setSectionErrors({});
  }, [currentStep]);

  const partnerId = editPartnerId || savedPartnerId;

  // In edit mode the Documents step (id 4) is hidden — documents are already set.
  const visibleSteps = STEPS.filter((s) => !(editPartnerId && s.editHidden));
  const visibleIds = visibleSteps.map((s) => s.id);
  const currentVisibleIndex = visibleIds.indexOf(currentStep);
  const nextStepId = currentVisibleIndex < visibleIds.length - 1 ? visibleIds[currentVisibleIndex + 1] : null;
  const prevStepId = currentVisibleIndex > 0 ? visibleIds[currentVisibleIndex - 1] : null;
  const isLastVisibleStep = currentVisibleIndex === visibleIds.length - 1;
  const currentStepMeta = visibleSteps.find((s) => s.id === currentStep) ?? STEPS.find((s) => s.id === currentStep);

  const persistCurrentStep = async (step, { isCreateFirstStep = false } = {}) => {
    const fd = formDataRef.current;
    const { ok, errors } = validateWizardStep(step, fd);
    if (!ok) {
      setSectionErrors(errors);
      return { ok: false, validationFailed: true };
    }
    setSectionErrors({});

    try {
      if (step === 1 && !partnerId && isCreateFirstStep) {
        const full = wizardFormToPartnerPayload(fd);
        const step1Body = Object.fromEntries(
          Object.entries({
            business_name: full.business_name,
            partner_code: full.partner_code,
            role: full.role,
            industry: full.industry,
            country: full.country,
            timezone: full.timezone,
            status: full.status,
            business_contact: full.business_contact,
            technical_contact: full.technical_contact,
          }).filter(([, v]) => v !== undefined)
        );
        const created = await partnersService.create(step1Body);
        const cid = created.id || created._id;
        if (cid) setSavedPartnerId(String(cid));
        syncLastSaved({ ...fd });
        setPersistedSteps((prev) => new Set([...prev, 1]));
        setCompletedSteps((prev) => new Set([...prev, 1]));
        return { ok: true };
      }

      const pid = editPartnerId || savedPartnerId;
      if (!pid) {
        toast.error('Save Step 1 first to create the partner record.');
        return { ok: false, validationFailed: false };
      }

      const payload = buildWizardSectionPayload(step, fd);
      if (Object.keys(payload).length === 0) {
        syncLastSaved({ ...fd });
        setPersistedSteps((prev) => new Set([...prev, step]));
        return { ok: true };
      }

      await partnersService.patch(pid, payload);
      syncLastSaved({ ...fd });
      setPersistedSteps((prev) => new Set([...prev, step]));
      return { ok: true };
    } catch (err) {
      let detail = err.response?.data?.detail ?? err.message;
      if (Array.isArray(detail)) {
        detail = detail.map((e) => e.msg || `${e.loc?.join('.')}: ${e.msg}`).join('; ');
      } else if (typeof detail === 'object' && detail !== null) {
        detail = JSON.stringify(detail);
      }
      const msg = String(detail);
      if (msg.toLowerCase().includes('partner code')) {
        setSectionErrors((prev) => ({ ...prev, partnerCode: msg }));
      }
      toast.error(msg);
      return { ok: false, validationFailed: false, error: msg };
    }
  };

  const handleSaveClick = async () => {
    setSavingStep(true);
    setSaveHintError(null);
    setSaveHint(null);
    try {
      const isFirstCreate = currentStep === 1 && !partnerId;
      const result = await persistCurrentStep(currentStep, { isCreateFirstStep: isFirstCreate });
      if (result.ok) {
        setSaveHint('saved');
        setTimeout(() => {
          setSaveHint(null);
        }, 2000);
        setCompletedSteps((prev) => new Set([...prev, currentStep]));
      } else if (!result.validationFailed) {
        setSaveHintError('Save failed');
      }
    } finally {
      setSavingStep(false);
    }
  };

  const handleNext = async () => {
    setNavSaving(true);
    setSaveHintError(null);
    try {
      const isFirstCreate = currentStep === 1 && !partnerId;
      const result = await persistCurrentStep(currentStep, { isCreateFirstStep: isFirstCreate });
      if (!result.ok) return;
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      if (nextStepId) setCurrentStep(nextStepId);
    } finally {
      setNavSaving(false);
    }
  };

  const handlePrevious = async () => {
    if (!prevStepId) return;
    setNavSaving(true);
    try {
      const result = await persistCurrentStep(currentStep, {
        isCreateFirstStep: currentStep === 1 && !partnerId,
      });
      if (!result.ok) {
        if (!result.validationFailed) setPreviousBlockedOpen(true);
        return;
      }
      setCurrentStep(prevStepId);
    } finally {
      setNavSaving(false);
    }
  };

  const goPreviousWithoutSave = () => {
    setPreviousBlockedOpen(false);
    if (prevStepId) setCurrentStep(prevStepId);
  };

  const handleSkip = async () => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    if (nextStepId) setCurrentStep(nextStepId);
  };

  const handleStepClick = (stepId) => {
    const stepIndex = visibleIds.indexOf(stepId);
    const canVisit = !!editPartnerId || stepId === 1 || (stepIndex > 0 && completedSteps.has(visibleIds[stepIndex - 1]));
    if (canVisit) setCurrentStep(stepId);
  };

  const handleFinalComplete = async () => {
    const pid = editPartnerId || savedPartnerId;
    if (!pid) {
      toast.error('Partner must be saved first.');
      return;
    }
    setSavingStep(true);
    try {
      const fd = formDataRef.current;
      const payload = buildWizardSectionPayload(9, fd);
      await partnersService.patch(pid, payload);
      syncLastSaved({ ...fd });
      const result = await onComplete?.({ ...fd, _savedPartnerId: pid });
      const ok = result !== false && (!result || result.success !== false);
      if (ok) onClose?.();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || e.message || 'Failed to finish partner setup');
    } finally {
      setSavingStep(false);
    }
  };

  const requestClose = () => {
    if (isDirty) setUnsavedDialogOpen(true);
    else onClose?.();
  };

  const progress = (persistedSteps.size / visibleSteps.length) * 100;

  const step1Errors = currentStep === 1 ? sectionErrors : {};

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <Step1BusinessPartner data={formData} onChange={(data) => updateFormData(1, data)} errors={step1Errors} />;
      case 2:
        return <Step2EDIProfile data={formData} onChange={(data) => updateFormData(2, data)} errors={sectionErrors} />;
      case 3:
        return (
          <Step3ERPContext data={formData} onChange={(data) => updateFormData(3, data)} onSkip={handleSkip} />
        );
      case 4:
        return <Step4Documents data={formData} onChange={(data) => updateFormData(4, data)} errors={sectionErrors} />;
      case 5:
        return (
          <Step5Specifications
            data={formData}
            onChange={(data) => updateFormData(5, data)}
            partnerId={editPartnerId || savedPartnerId}
          />
        );
      case 6:
        return <Step6Mapping data={formData} onChange={(data) => updateFormData(6, data)} errors={sectionErrors} />;
      case 7:
        return <Step7Transport data={formData} onChange={(data) => updateFormData(7, data)} errors={sectionErrors} />;
      case 8:
        return <Step8Testing data={formData} onChange={(data) => updateFormData(8, data)} />;
      case 9:
        return (
          <Step9GoLive
            data={formData}
            onChange={(data) => updateFormData(9, data)}
            onComplete={handleFinalComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent hideClose className="max-w-6xl h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl">
                  {editPartnerId ? 'Edit Trading Partner' : 'Add Trading Partner'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Step {currentVisibleIndex + 1} of {visibleSteps.length}: {currentStepMeta?.title}
                </p>
              </div>
              <Button variant="ghost" size="icon" type="button" onClick={requestClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-4">
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{Math.round(progress)}% Complete</span>
                <span>{persistedSteps.size} of {visibleSteps.length} sections saved</span>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden min-h-0">
            <div className="w-64 border-r border-border bg-muted/30 p-4 overflow-y-auto">
              <div className="space-y-2">
                {visibleSteps.map((step) => {
                  const stepIndex = visibleIds.indexOf(step.id);
                  const isPersisted = persistedSteps.has(step.id);
                  const isCurrent = currentStep === step.id;
                  const isAccessible = !!editPartnerId || step.id === 1 || (stepIndex > 0 && completedSteps.has(visibleIds[stepIndex - 1]));

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => handleStepClick(step.id)}
                      disabled={!isAccessible || savingStep || loadingPartnerDetail}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : isPersisted
                          ? 'bg-success-bg text-success-foreground hover:bg-success-bg/80'
                          : isAccessible
                          ? 'bg-card hover:bg-muted text-foreground'
                          : 'bg-card text-muted-foreground opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isPersisted ? (
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                        ) : (
                          <Circle className={`w-5 h-5 shrink-0 ${isCurrent ? 'fill-current' : ''}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{step.title}</span>
                            {step.optional && (
                              <Badge variant="secondary" className="text-xs">
                                Optional
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs opacity-75 mt-0.5">{step.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingPartnerDetail ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-mono">Loading partner…</p>
                </div>
              ) : (
                renderStepContent()
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => void handlePrevious()}
              disabled={!prevStepId || navSaving || loadingPartnerDetail}
            >
              {navSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronLeft className="w-4 h-4 mr-2" />}
              Previous
            </Button>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              <Button
                type="button"
                className="bg-primary hover:bg-[var(--primary-hover)] text-primary-foreground border-0"
                onClick={() => void handleSaveClick()}
                disabled={savingStep || navSaving || loadingPartnerDetail}
              >
                {savingStep ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              {saveHint === 'saved' && (
                <span className="text-sm text-[var(--status-success-text)] flex items-center gap-1 animate-in fade-in">
                  <Check className="w-4 h-4" /> Saved
                </span>
              )}
              {saveHintError && <span className="text-sm text-destructive">{saveHintError}</span>}

              <Button variant="ghost" type="button" onClick={requestClose}>
                Cancel
              </Button>

              {currentStepMeta?.optional && (
                <Button variant="outline" type="button" onClick={() => void handleSkip()}>
                  Skip & Continue
                </Button>
              )}

              {!isLastVisibleStep ? (
                <Button type="button" onClick={() => void handleNext()} disabled={savingStep || navSaving || loadingPartnerDetail}>
                  {navSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleFinalComplete()}
                  variant="success"
                  disabled={savingStep || navSaving || loadingPartnerDetail}
                >
                  {savingStep ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Complete Setup
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unsavedDialogOpen} onOpenChange={setUnsavedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnsavedDialogOpen(false);
                onClose?.();
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={previousBlockedOpen} onOpenChange={setPreviousBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save failed</AlertDialogTitle>
            <AlertDialogDescription>
              Save failed. Go back anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPreviousBlockedOpen(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={goPreviousWithoutSave}>Go Back Without Saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
