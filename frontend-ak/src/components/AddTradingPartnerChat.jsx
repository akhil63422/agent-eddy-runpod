import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Mic, MicOff, Upload, FileText, Bot, User, CheckCircle2, Loader2, Pencil, Check, ChevronDown, FileBadge, FileIcon, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { partnerAIService } from '@/services/partnerAI';
import { partnersService } from '@/services/partners';
import { cn } from '@/lib/utils';

const DIGIT_WORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', oh: '0' };

/** Matches DB `trading_partners.partner_code` String(100). */
const PARTNER_CODE_MAX = 100;
/** ISA / interchange-style IDs: alphanumeric, typical padded length ≤ 15; cap for safety. */
const ISA_ID_MAX = 50;

// Normalize voice/typed input for partner code (handles "1 2 3", "W M T", "VEND-99", etc.)
const normalizePartnerCode = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw.toLowerCase().split(/\s+/).filter(Boolean);
  let out = '';
  for (const p of parts) {
    if (DIGIT_WORDS[p] !== undefined) {
      out += DIGIT_WORDS[p];
    } else {
      const cleaned = p.replace(/[^a-z0-9_-]/gi, '');
      out += cleaned;
    }
  }
  if (!out) {
    out = raw.replace(/\s/g, '').replace(/[^A-Za-z0-9_-]/g, '');
  }
  return out.toUpperCase().slice(0, PARTNER_CODE_MAX);
};

// Normalize voice for ISA sender/receiver IDs (e.g. "W M T zero zero one" → WMT001)
const normalizeIsaId = (text) => {
  const parts = String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .map((p) => (DIGIT_WORDS[p] !== undefined ? DIGIT_WORDS[p] : p.replace(/[^a-z0-9]/gi, '')))
    .join('')
    .toUpperCase()
    .slice(0, ISA_ID_MAX);
};

// Common voice→text corrections for email (e.g. "aunty" often misheard for "akhil")
const EMAIL_VOICE_CORRECTIONS = { aunty: 'akhil', aali: 'akhil' };

// Normalize voice for email - fix "aunty 6390 a gmail.com" → "akhil6390@gmail.com" (at/a → @, dot → .)
const normalizeEmailForVoice = (text) => {
  if (!text?.trim()) return text;
  let t = String(text).trim();
  t = t.replace(/\s+dot\s+/gi, '.').replace(/\s+at\s+/gi, ' @ ');
  const match = t.match(/^(.+?)\s+(?:a|at)\s+(\w+(?:\.\w+)*)$/i);
  if (match) {
    let local = match[1].replace(/\s/g, '');
    const domain = match[2].replace(/\s/g, '');
    Object.entries(EMAIL_VOICE_CORRECTIONS).forEach(([wrong, right]) => {
      local = local.replace(new RegExp(wrong, 'gi'), right);
    });
    return `${local}@${domain}`;
  }
  return t.replace(/\s/g, '').replace(/\.+/g, '.');
};

// Normalize voice for phone - "one two three four five six seven eight nine zero" → digits
const normalizePhoneForVoice = (text) => {
  if (!text?.trim()) return text;
  const parts = String(text).trim().toLowerCase().split(/\s+/);
  const result = parts.map((p) => DIGIT_WORDS[p] ?? p.replace(/\D/g, '')).join('');
  return result.slice(0, 20) || text.replace(/\s/g, '').replace(/\D/g, '').slice(0, 20) || text;
};

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('both') || (value.includes('customer') && value.includes('supplier'))) return 'Both';
  if (value.includes('customer') || value.includes('buyer') || value.includes('client')) return 'Customer';
  if (value.includes('supplier') || value.includes('vendor') || value.includes('seller')) return 'Supplier';
  return '';
};

/** Tolerate trailing commas and BOM (matches backend lenient JSON). */
const parseLenientJson = (text) => {
  const t = String(text || '').trim().replace(/^\uFEFF/, '');
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
};

const normalizeDocuments = (raw) => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;\s]+/);
  const out = list
    .map((entry) => {
      if (typeof entry === 'object' && entry?.transaction_set) return String(entry.transaction_set);
      const matched = String(entry || '').match(/\b(8[0-9]{2}|997)\b/);
      return matched ? matched[1] : '';
    })
    .filter(Boolean);
  return [...new Set(out)];
};

const mapUploadedExtractedDataToForm = (extractedData, previousFormData) => {
  const updates = {};
  let data = extractedData || {};

  // Full partner profile JSON (same shape as API / samples): merge nested blocks first
  const edi = data.edi_config && typeof data.edi_config === 'object' ? data.edi_config : null;
  const tc = data.transport_config && typeof data.transport_config === 'object' ? data.transport_config : null;
  if (edi) {
    data = {
      ...data,
      edi_standard: data.edi_standard || edi.standard,
      version: data.version || edi.version,
      isa_sender_id: data.isa_sender_id || edi.isa_sender_id,
      isa_receiver_id: data.isa_receiver_id || edi.isa_receiver_id,
      character_set: data.character_set || edi.character_set,
      functional_group: data.functional_group || edi.functional_group,
      gs_ids: data.gs_ids || (edi.gs_sender || edi.gs_receiver || edi.gsSender || edi.gsReceiver
        ? {
            sender: edi.gs_sender || edi.gsSender || '',
            receiver: edi.gs_receiver || edi.gsReceiver || '',
          }
        : undefined),
      delimiters: data.delimiters || (edi.element_separator || edi.segment_terminator || edi.component_separator
        ? {
            element: edi.element_separator || '*',
            segment: edi.segment_terminator || '~',
            sub_element: edi.component_separator || ':',
          }
        : undefined),
    };
  }
  if (tc) {
    data = {
      ...data,
      transport_type: data.transport_type || tc.type,
      transport_endpoint: data.transport_endpoint || (typeof tc.endpoint === 'object' ? tc.endpoint : undefined),
    };
    if (!data.transport_endpoint && typeof tc.endpoint === 'string' && tc.endpoint.trim()) {
      data.transport_endpoint = { host: tc.endpoint.trim() };
    }
  }
  if (Array.isArray(data.document_agreements) && data.document_agreements.length > 0 && !data.documents) {
    data = {
      ...data,
      documents: data.document_agreements
        .map((d) => (typeof d === 'object' && d ? d.transaction_set : d))
        .filter(Boolean),
    };
  }

  if (data.business_name) updates.businessName = data.business_name;
  if (data.partner_code) updates.partnerCode = normalizePartnerCode(data.partner_code) || data.partner_code;
  if (data.role) updates.role = normalizeRole(data.role) || data.role;
  if (data.industry) updates.industry = data.industry;
  if (data.country) updates.country = data.country;
  if (data.timezone) updates.timezone = data.timezone;
  if (data.edi_standard || data.ediStandard) updates.ediStandard = data.edi_standard || data.ediStandard;
  if (data.version) updates.version = String(data.version);
  if (data.isa_sender_id || data.isaSenderId) {
    updates.isaSenderId = normalizeIsaId(data.isa_sender_id || data.isaSenderId);
  }
  if (data.isa_receiver_id || data.isaReceiverId) {
    updates.isaReceiverId = normalizeIsaId(data.isa_receiver_id || data.isaReceiverId);
  }
  if (data.transport_type || data.transportType) updates.transportType = data.transport_type || data.transportType;

  if (data.gs_ids && typeof data.gs_ids === 'object') {
    updates.gsIds = {
      sender: String(data.gs_ids.sender || '').trim(),
      receiver: String(data.gs_ids.receiver || '').trim(),
    };
  }
  if (data.character_set) updates.characterSet = data.character_set;
  if (data.functional_group) {
    const fg = data.functional_group;
    updates.functionalGroups = Array.isArray(fg) ? fg : [String(fg)];
  }
  if (data.delimiters && typeof data.delimiters === 'object') {
    const d = data.delimiters;
    updates.delimiters = {
      element: d.element || '*',
      segment: d.segment || '~',
      subElement: d.sub_element || d.subElement || '>',
    };
  }
  if (data.status && ['Draft', 'Active', 'Testing', 'Suspended'].includes(String(data.status))) {
    updates.status = data.status;
  }
  if (data.notes != null && String(data.notes).trim()) {
    updates.exceptionRules = String(data.notes).trim();
  }
  if (data.erp_context && typeof data.erp_context === 'object') {
    const erp = data.erp_context;
    updates.erpContext = {
      partnerERP: {
        ...(previousFormData.erpContext?.partnerERP || {}),
        system: erp.backend_system || previousFormData.erpContext?.partnerERP?.system || 'Unknown',
        version: erp.version || previousFormData.erpContext?.partnerERP?.version || '',
        notes: erp.notes || previousFormData.erpContext?.partnerERP?.notes || '',
      },
      targetSystem: {
        ...(previousFormData.erpContext?.targetSystem || {}),
        system: erp.backend_system || previousFormData.erpContext?.targetSystem?.system || '',
        integrationMethod: erp.type || previousFormData.erpContext?.targetSystem?.integrationMethod || 'API',
      },
    };
  }
  if (data.transport_endpoint && typeof data.transport_endpoint === 'object') {
    const ep = data.transport_endpoint;
    updates.transportConfig = {
      ...(previousFormData.transportConfig || {}),
      host: ep.host || previousFormData.transportConfig?.host || '',
      port: ep.port != null ? String(ep.port) : (previousFormData.transportConfig?.port || '22'),
      path: ep.path || previousFormData.transportConfig?.path || '/',
      endpoint: ep,
    };
  }
  if (tc && typeof tc === 'object' && tc.credentials && typeof tc.credentials === 'object') {
    updates.transportConfig = {
      ...(previousFormData.transportConfig || {}),
      ...(updates.transportConfig || {}),
      credentials: tc.credentials,
    };
  }

  if (Array.isArray(data.document_agreements) && data.document_agreements.length > 0) {
    updates.documentAgreements = data.document_agreements
      .filter((d) => d && typeof d === 'object')
      .map((d) => ({
        transactionSet: String(d.transaction_set ?? d.transactionSet ?? '').trim(),
        direction: String(d.direction ?? 'Inbound').trim() || 'Inbound',
      }))
      .filter((d) => d.transactionSet);
  }

  const documents = normalizeDocuments(data.documents || data.document_types || data.transaction_sets);
  if (documents.length > 0) updates.documents = documents;

  const businessContact = {
    ...(previousFormData.businessContact || {}),
    ...(updates.businessContact || {}),
  };
  const technicalContact = {
    ...(previousFormData.technicalContact || {}),
    ...(updates.technicalContact || {}),
  };

  if (data.email) businessContact.email = data.email;
  if (data.phone) businessContact.phone = data.phone;
  if (data.business_contact?.name) businessContact.name = data.business_contact.name;
  if (data.business_contact?.email) businessContact.email = data.business_contact.email;
  if (data.business_contact?.phone) businessContact.phone = data.business_contact.phone;
  if (data.technical_contact?.name) technicalContact.name = data.technical_contact.name;
  if (data.technical_contact?.email) technicalContact.email = data.technical_contact.email;
  if (data.technical_contact?.phone) technicalContact.phone = data.technical_contact.phone;

  if (Object.values(businessContact).some((v) => String(v || '').trim())) {
    updates.businessContact = businessContact;
  }
  if (Object.values(technicalContact).some((v) => String(v || '').trim())) {
    updates.technicalContact = technicalContact;
  }

  return updates;
};

// Preferred female voice names (varies by OS/browser)
const FEMALE_VOICE_NAMES = [
  'Samantha', 'Victoria', 'Karen', 'Kate', 'Fiona', 'Tessa', 'Moira', 'Emma',
  'Microsoft Zira', 'Microsoft Aria', 'Google US English', 'Samantha (Premium)',
  'Sara', 'Allison', 'Susan', 'Ellen', 'Karen (Enhanced)', 'Ava',
];

const getFemaleVoice = () => {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  const preferred = enVoices.find((v) =>
    FEMALE_VOICE_NAMES.some((n) => v.name.toLowerCase().includes(n.toLowerCase()))
  );
  if (preferred) return preferred;
  const femaleLike = enVoices.find((v) =>
    /samantha|victoria|karen|kate|fiona|zira|aria|sara|emma|susan|ellen|ava|allison|moira|tessa/i.test(v.name)
  );
  return femaleLike || enVoices[0] || voices[0];
};

let currentTTSAudio = null;

const stopAllVoice = () => {
  window.speechSynthesis?.cancel();
  if (currentTTSAudio) {
    try {
      currentTTSAudio.pause();
      currentTTSAudio.currentTime = 0;
    } catch (_) {}
    currentTTSAudio = null;
  }
};

const speakWithFemaleVoice = async (text, onEnd) => {
  if (!text?.trim()) return;
  stopAllVoice();
  try {
    const blob = await partnerAIService.getTTSAudio(text);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentTTSAudio = audio;
    audio.onended = () => {
      currentTTSAudio = null;
      URL.revokeObjectURL(url);
      onEnd?.();
    };
    audio.onerror = () => {
      currentTTSAudio = null;
      URL.revokeObjectURL(url);
      fallbackSpeak(text, onEnd);
    };
    await audio.play();
  } catch {
    fallbackSpeak(text, onEnd);
  }
};

const fallbackSpeak = (text, onEnd) => {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const voice = getFemaleVoice();
  if (voice) u.voice = voice;
  u.rate = 0.92;
  u.pitch = 1.1;
  u.lang = 'en-US';
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
};

// Strip emojis and normalize text for clean TTS output
const toSpeakableText = (text) => {
  if (!text?.trim()) return '';
  return String(text)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Match voice input to multi-select options (e.g. "customer" -> "Customer", "america new york" -> "America/New_York")
const matchVoiceToOptions = (text, options = []) => {
  if (!text?.trim() || !options?.length) return null;
  const q = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  const lowerOptions = options.map((o) => ({ original: o, lower: o.toLowerCase().replace(/[_\-\/]/g, ' '), key: o.split(/[\s\(]/)[0]?.toLowerCase() }));
  // Exact or starts-with match
  for (const { original, lower, key } of lowerOptions) {
    if (lower === q || lower.startsWith(q) || q === key || q.startsWith(key)) return original;
  }
  // Partial match (e.g. "retail" in "Retail", "customer" in "Customer")
  for (const { original, lower, key } of lowerOptions) {
    if (lower.includes(q) || q.includes(key) || (q.length >= 2 && key?.includes(q))) return original;
  }
  // Multi-select: "850 and 810" or "850, 810" -> match each part
  const parts = q.split(/\s+and\s+|\s*,\s*|\s+/).filter((p) => p.length >= 2);
  const matched = [...new Set(parts.map((p) => lowerOptions.find(({ lower, key }) => lower.includes(p) || key?.includes(p) || p.includes(key))).filter(Boolean).map(({ original }) => original))];
  return matched.length > 0 ? (matched.length === 1 ? matched[0] : matched) : null;
};

// --- Field validation (blocks workflow until valid) ---
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

const validateField = (questionId, answer, formData, question) => {
  const val = String(answer || '').trim();
  const opts = question?.options || [];

  if (question?.required && !val) {
    return { valid: false, error: 'This field is required.', speak: "Sorry, this field is required. Please give me a valid answer." };
  }
  if (!question?.required && !val) return { valid: true };

  switch (questionId) {
    case 'businessName':
      if (val.length < 2) return { valid: false, error: 'Business name must be at least 2 characters.', speak: "That's too short. Please give me the full business name." };
      if (val.length > 200) return { valid: false, error: 'Business name is too long.', speak: "That's too long. Please give me a shorter business name." };
      return { valid: true };

    case 'partnerCode': {
      const code = normalizePartnerCode(val) || val.replace(/\s/g, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, PARTNER_CODE_MAX).toUpperCase();
      if (!code || code.length < 1) return { valid: false, error: 'Partner code required.', speak: "I couldn't understand the partner code. Please say or type it again." };
      if (code.length > PARTNER_CODE_MAX) return { valid: false, error: `Partner code max ${PARTNER_CODE_MAX} characters.`, speak: `Partner code can be at most ${PARTNER_CODE_MAX} characters. Please shorten it.` };
      if (!/^[A-Za-z0-9_-]+$/.test(code)) return { valid: false, error: 'Partner code: letters, numbers, hyphen, or underscore only.', speak: 'Partner code should use only letters, numbers, hyphens, or underscores. Please try again.' };
      return { valid: true };
    }

    case 'role':
    case 'ediStandard':
    case 'version':
    case 'transportType':
    case 'timezone': {
      const matched = matchVoiceToOptions(val, opts);
      if (!matched) return { valid: false, error: `Choose one of: ${opts.join(', ')}`, speak: `Sorry, I didn't recognize that. Please select one of the options: ${opts.slice(0, 3).join(', ')}.` };
      return { valid: true };
    }

    case 'industry':
      if (!val) return { valid: true };
      if (!matchVoiceToOptions(val, opts)) return { valid: false, error: `Choose one of: ${opts.join(', ')}`, speak: `Please select one of the options: ${opts.slice(0, 3).join(', ')}.` };
      return { valid: true };

    case 'country':
      if (val.length > 100) return { valid: false, error: 'Country name too long.', speak: "That's too long. Please give me a shorter country name." };
      return { valid: true };

    case 'businessContactEmail':
    case 'technicalContactEmail': {
      const email = normalizeEmailForVoice(val) || val;
      if (!email) return { valid: true };
      if (!EMAIL_REGEX.test(email)) return { valid: false, error: 'Invalid email.', speak: "That doesn't look like a valid email. Please say or type it again, like: example at company dot com." };
      return { valid: true };
    }

    case 'businessContactPhone':
    case 'technicalContactPhone': {
      const digits = (normalizePhoneForVoice(val) || val).replace(/\D/g, '');
      if (!digits) return { valid: true };
      if (digits.length < PHONE_MIN_DIGITS) return { valid: false, error: 'Phone needs at least 10 digits.', speak: "That phone number seems too short. Please say or type it again with at least 10 digits." };
      if (digits.length > PHONE_MAX_DIGITS) return { valid: false, error: 'Phone must be 10–15 digits.', speak: "That phone number is too long. Please provide 10 to 15 digits." };
      return { valid: true };
    }

    case 'businessContactName':
    case 'technicalContactName': {
      const invalidNamePhrases = ['now for the', 'what is', "what's", 'and their', 'their name', 'their email', 'their phone', 'the technical', 'the business', 'contact name', 'contact email', 'contact phone'];
      const valLower = val.toLowerCase();
      if (val.length > 100) return { valid: false, error: 'Name too long.', speak: "That name is too long. Please try again." };
      if (invalidNamePhrases.some((p) => valLower.includes(p) || valLower === p)) return { valid: false, error: "That doesn't look like a name.", speak: "That doesn't sound like a name. Please say or type the contact's name." };
      return { valid: true };
    }

    case 'isaSenderId':
    case 'isaReceiverId': {
      const id = normalizeIsaId(val) || String(val).trim().toUpperCase().replace(/\s+/g, '').slice(0, ISA_ID_MAX);
      if (!id) return { valid: false, error: 'Required.', speak: "That's required. Please provide the ISA ID." };
      if (!/^[A-Z0-9]+$/.test(id)) return { valid: false, error: 'ISA ID: letters and numbers only (no spaces).', speak: 'ISA IDs use letters and numbers only, with no spaces. Please try again.' };
      if (id.length > ISA_ID_MAX) return { valid: false, error: `ISA ID max ${ISA_ID_MAX} characters.`, speak: 'That ISA ID is too long. Please shorten it.' };
      return { valid: true };
    }

    case 'documents': {
      const parts = val.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
      const matched = parts.flatMap((p) => {
        const m = matchVoiceToOptions(p, opts);
        return m ? (Array.isArray(m) ? m : [m]) : [];
      });
      const unique = [...new Set(matched)];
      if (unique.length === 0) return { valid: false, error: 'Select at least one document type.', speak: "Please select at least one document type from the options below." };
      return { valid: true };
    }

    default:
      return { valid: true };
  }
};

// Conversation flow configuration
const CONVERSATION_FLOW = [
  {
    section: 'business',
    questions: [
      {
        id: 'businessName',
        question: "🎮 INITIALIZING PARTNER CONFIGURATION PROTOCOL...\n\nHey there! I'm your AI assistant. Let's set up a new trading partner together! 🚀\n\nFirst, what's the legal business name of the trading partner?",
        speak: "Hey there! I'm your AI assistant. Let's set up a new trading partner together. First, what's the legal business name of the trading partner?",
        type: 'text',
        required: true,
        placeholder: 'e.g., Walmart Inc.',
      },
      {
        id: 'partnerCode',
        question: `✨ Great! Now, what internal trading partner code should we use? Up to ${PARTNER_CODE_MAX} characters — letters, numbers, hyphen, or underscore (e.g. WMT or VEND-01).`,
        speak: `Great! What trading partner code should we use? Up to ${PARTNER_CODE_MAX} characters: letters, numbers, hyphen, or underscore. You can type it or say it.`,
        type: 'text',
        required: true,
        placeholder: `e.g., WMT, ACME-01 (max ${PARTNER_CODE_MAX} chars)`,
        maxLength: PARTNER_CODE_MAX,
      },
      {
        id: 'role',
        question: 'What role does this partner play? Are they a Customer, Supplier, or Both?',
        speak: "What role does this partner play? Are they a Customer, Supplier, or Both? You can select one of the options below, or say your answer.",
        type: 'multi-select',
        options: ['Customer', 'Supplier', 'Both'],
        required: true,
      },
      {
        id: 'industry',
        question: 'What industry are they in?',
        speak: "What industry are they in? You can select an option or tell me.",
        type: 'multi-select',
        options: ['Retail', 'Manufacturing', 'Logistics', 'Healthcare', 'Automotive', 'Other'],
        required: false,
      },
      {
        id: 'country',
        question: 'What country or region are they located in?',
        type: 'text',
        required: false,
        placeholder: 'e.g., United States',
      },
      {
        id: 'timezone',
        question: 'What timezone are they in?',
        speak: "What timezone are they in? Select one below or say it.",
        type: 'multi-select',
        options: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Other'],
        required: false,
      },
    ],
  },
  {
    section: 'businessContact',
    questions: [
      {
        id: 'businessContactName',
        question: "Let's set up the business contact. What's their name?",
        type: 'text',
        required: false,
        placeholder: 'e.g., John Doe',
      },
      {
        id: 'businessContactEmail',
        question: 'What is their email address?',
        type: 'text',
        required: false,
        placeholder: 'john.doe@company.com',
      },
      {
        id: 'businessContactPhone',
        question: 'And their phone number?',
        type: 'text',
        required: false,
        placeholder: '+1 (555) 123-4567',
      },
    ],
  },
  {
    section: 'technicalContact',
    questions: [
      {
        id: 'technicalContactName',
        question: "Now for the technical contact. What's their name?",
        type: 'text',
        required: false,
        placeholder: 'e.g., Jane Smith',
      },
      {
        id: 'technicalContactEmail',
        question: 'What is their email address?',
        type: 'text',
        required: false,
        placeholder: 'jane.smith@company.com',
      },
      {
        id: 'technicalContactPhone',
        question: 'And their phone number?',
        type: 'text',
        required: false,
        placeholder: '+1 (555) 987-6543',
      },
    ],
  },
  {
    section: 'ediProfile',
    questions: [
      {
        id: 'ediStandard',
        question: 'Moving on to EDI configuration. What EDI standard do they use?',
        speak: "Moving on to EDI configuration. What EDI standard do they use? You can select X12, EDIFACT, or TRADACOMS.",
        type: 'multi-select',
        options: ['X12', 'EDIFACT', 'TRADACOMS'],
        required: true,
      },
      {
        id: 'version',
        question: 'What version?',
        speak: "What version? Select 5010, 4010, or 3060.",
        type: 'multi-select',
        options: ['5010', '4010', '3060'],
        required: true,
      },
      {
        id: 'isaSenderId',
        question: 'What is the ISA Interchange Sender ID? (Letters and numbers — e.g. WMT001 or 123456789012345)',
        speak: 'What is the ISA Sender ID? Use letters and numbers, like W M T zero zero one, or all digits.',
        type: 'text',
        required: true,
        placeholder: 'e.g., WMT001',
        maxLength: ISA_ID_MAX,
      },
      {
        id: 'isaReceiverId',
        question: 'What is the ISA Interchange Receiver ID? (Letters and numbers)',
        speak: 'What is the ISA Receiver ID? Letters and numbers only.',
        type: 'text',
        required: true,
        placeholder: 'e.g., OURCO01',
        maxLength: ISA_ID_MAX,
      },
    ],
  },
  {
    section: 'documents',
    questions: [
      {
        id: 'documents',
        question: 'What document types will you exchange? You can select multiple.',
        speak: "What document types will you exchange? You can select multiple options below, or say them. For example, 850 and 810.",
        type: 'multi-select',
        options: ['850 (Purchase Order)', '810 (Invoice)', '856 (Advance Ship Notice)', '997 (Functional Acknowledgment)'],
        required: true,
        multiple: true,
      },
    ],
  },
  {
    section: 'transport',
    questions: [
      {
        id: 'transportType',
        question: 'How will files be transferred?',
        speak: "How will files be transferred? Select SFTP, S3, FTP, or AS2.",
        type: 'multi-select',
        options: ['SFTP', 'S3', 'FTP', 'AS2'],
        required: true,
      },
    ],
  },
];

const DOCUMENT_SELECT_OPTIONS =
  CONVERSATION_FLOW.find((s) => s.section === 'documents')?.questions?.[0]?.options ?? [];

const buildCountryOptions = () => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      const codes = Intl.supportedValuesOf('region').filter((c) => c.length === 2 && c !== 'ZZ');
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      return codes
        .map((code) => ({ code, label: dn.of(code) || code }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
  } catch (_) {}
  return [
    { code: 'US', label: 'United States' },
    { code: 'CA', label: 'Canada' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'DE', label: 'Germany' },
    { code: 'MX', label: 'Mexico' },
  ];
};

const COUNTRY_OPTIONS = buildCountryOptions();

const TIMEZONE_OPTIONS = (() => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').slice().sort();
    }
  } catch (_) {}
  return [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'UTC',
    'Europe/London',
  ];
})();

const REVIEW_ROLE_OPTIONS = ['Customer', 'Supplier', 'Both'];
const REVIEW_INDUSTRY_OPTIONS = ['Retail', 'Healthcare', 'Automotive', 'Manufacturing', 'Logistics', 'Other'];
const REVIEW_EDI_COMBO = [
  { key: 'x12_4010', label: 'X12 4010', ediStandard: 'X12', version: '4010' },
  { key: 'x12_5010', label: 'X12 5010', ediStandard: 'X12', version: '5010' },
  { key: 'x12_3060', label: 'X12 3060', ediStandard: 'X12', version: '3060' },
  { key: 'edifact', label: 'EDIFACT', ediStandard: 'EDIFACT', version: '' },
];
const REVIEW_X12_VERSIONS = ['4010', '5010', '3060'];
const REVIEW_STATUS_OPTIONS = ['Draft', 'Active', 'Testing', 'Suspended'];
const REVIEW_TRANSPORT_OPTIONS = ['SFTP', 'S3', 'FTP', 'AS2'];

const ediComboKeyFromForm = (fd) => {
  const std = String(fd.ediStandard || '').toUpperCase();
  const ver = String(fd.version || '').trim();
  if (std === 'EDIFACT') return 'edifact';
  if (std === 'X12' && ver === '4010') return 'x12_4010';
  if (std === 'X12' && ver === '5010') return 'x12_5010';
  if (std === 'X12' && ver === '3060') return 'x12_3060';
  if (std === 'X12' && ver) {
    const hit = REVIEW_EDI_COMBO.find((o) => o.ediStandard === 'X12' && o.version === ver);
    if (hit) return hit.key;
  }
  if (std === 'X12') return 'x12_5010';
  if (std === 'TRADACOMS') return 'x12_5010';
  return 'x12_5010';
};

const formatEdiDisplay = (fd) => {
  const std = String(fd.ediStandard || '').trim();
  const ver = String(fd.version || '').trim();
  if (!std && !ver) return '—';
  if (std.toUpperCase() === 'EDIFACT') return 'EDIFACT';
  if (std.toUpperCase() === 'X12' && ver) return `X12 ${ver}`;
  return [std, ver].filter(Boolean).join(' ') || '—';
};

// Review grid: id, label, kind, required, getValue(fd) for view mode
const REVIEW_ROWS = [
  { id: 'businessName', label: 'Business Name', kind: 'text', required: true, getValue: (fd) => fd.businessName },
  { id: 'partnerCode', label: 'Partner Code', kind: 'partnerCode', required: true, getValue: (fd) => fd.partnerCode },
  { id: 'role', label: 'Role', kind: 'role', required: true, getValue: (fd) => fd.role },
  { id: 'industry', label: 'Industry', kind: 'industry', required: false, getValue: (fd) => fd.industry },
  { id: 'country', label: 'Country', kind: 'country', required: false, getValue: (fd) => fd.country },
  { id: 'timezone', label: 'Timezone', kind: 'timezone', required: false, getValue: (fd) => fd.timezone },
  { id: 'businessContactName', label: 'Business Contact Name', kind: 'text', required: false, getValue: (fd) => fd.businessContact?.name },
  { id: 'businessContactEmail', label: 'Business Contact Email', kind: 'email', required: false, getValue: (fd) => fd.businessContact?.email },
  { id: 'businessContactPhone', label: 'Business Contact Phone', kind: 'phone', required: false, getValue: (fd) => fd.businessContact?.phone },
  { id: 'technicalContactName', label: 'Technical Contact Name', kind: 'text', required: false, getValue: (fd) => fd.technicalContact?.name },
  { id: 'technicalContactEmail', label: 'Technical Contact Email', kind: 'email', required: false, getValue: (fd) => fd.technicalContact?.email },
  { id: 'technicalContactPhone', label: 'Technical Contact Phone', kind: 'phone', required: false, getValue: (fd) => fd.technicalContact?.phone },
  { id: 'ediStandard', label: 'EDI Standard', kind: 'ediCombo', required: true, getValue: (fd) => formatEdiDisplay(fd) },
  { id: 'version', label: 'Version', kind: 'version', required: true, getValue: (fd) => fd.version },
  { id: 'isaSenderId', label: 'ISA Sender ID', kind: 'isa', required: true, getValue: (fd) => fd.isaSenderId },
  { id: 'isaReceiverId', label: 'ISA Receiver ID', kind: 'isa', required: true, getValue: (fd) => fd.isaReceiverId },
  { id: 'gsSender', label: 'GS Sender ID', kind: 'text', required: false, getValue: (fd) => fd.gsIds?.sender },
  { id: 'gsReceiver', label: 'GS Receiver ID', kind: 'text', required: false, getValue: (fd) => fd.gsIds?.receiver },
  { id: 'documents', label: 'Documents', kind: 'documents', required: true, getValue: (fd) => (Array.isArray(fd.documents) ? fd.documents.join(', ') : fd.documents) },
  { id: 'transportType', label: 'Transport', kind: 'transport', required: true, getValue: (fd) => fd.transportType },
  {
    id: 'transportHost',
    label: 'Transport endpoint',
    kind: 'transportHost',
    required: false,
    getValue: (fd) => {
      const cfg = fd.transportConfig || {};
      if (cfg.host) return [cfg.host, cfg.port, cfg.path].filter(Boolean).join(' · ');
      return cfg.endpoint ? (typeof cfg.endpoint === 'object' ? JSON.stringify(cfg.endpoint) : String(cfg.endpoint)) : '';
    },
  },
  { id: 'status', label: 'Status', kind: 'status', required: false, getValue: (fd) => fd.status },
  {
    id: 'exceptionRules',
    label: 'Notes',
    kind: 'notes',
    required: false,
    getValue: (fd) => {
      const t = fd.exceptionRules || fd.notes || '';
      if (!t) return '—';
      return t.length > 160 ? `${t.slice(0, 160)}…` : t;
    },
  },
];

const getReviewDraftValue = (row, fd) => {
  if (!row) return '';
  if (row.kind === 'ediCombo') return ediComboKeyFromForm(fd);
  if (row.kind === 'notes') return String(fd.exceptionRules || fd.notes || '');
  if (row.kind === 'documents') return Array.isArray(fd.documents) ? fd.documents.join(', ') : String(fd.documents || '');
  if (row.kind === 'transportHost') return String(fd.transportConfig?.host || '');
  if (row.kind === 'status') return String(fd.status || 'Draft');
  const v = row.getValue(fd);
  if (v == null || v === '' || v === '—') return '';
  return String(v);
};

const mergeReviewPatch = (prev, patch) => {
  const next = { ...prev, ...patch };
  if (patch.businessContact) {
    next.businessContact = { ...(prev.businessContact || {}), ...patch.businessContact };
  }
  if (patch.technicalContact) {
    next.technicalContact = { ...(prev.technicalContact || {}), ...patch.technicalContact };
  }
  if (patch.gsIds) {
    next.gsIds = { ...(prev.gsIds || {}), ...patch.gsIds };
  }
  if (patch.transportConfig) {
    next.transportConfig = { ...(prev.transportConfig || {}), ...patch.transportConfig };
  }
  return next;
};

const applyReviewNormalized = (fd, rowId, normalized) => {
  switch (rowId) {
    case 'businessName':
      return { businessName: normalized };
    case 'partnerCode':
      return { partnerCode: normalized };
    case 'role':
      return { role: normalizeRole(normalized) || normalized };
    case 'industry':
      return { industry: normalized };
    case 'country':
      return { country: normalized };
    case 'timezone':
      return { timezone: normalized };
    case 'businessContactName':
      return { businessContact: { ...(fd.businessContact || {}), name: normalized } };
    case 'businessContactEmail':
      return { businessContact: { ...(fd.businessContact || {}), email: normalized } };
    case 'businessContactPhone':
      return { businessContact: { ...(fd.businessContact || {}), phone: normalized } };
    case 'technicalContactName':
      return { technicalContact: { ...(fd.technicalContact || {}), name: normalized } };
    case 'technicalContactEmail':
      return { technicalContact: { ...(fd.technicalContact || {}), email: normalized } };
    case 'technicalContactPhone':
      return { technicalContact: { ...(fd.technicalContact || {}), phone: normalized } };
    case 'ediStandard':
      return { ediStandard: normalized.ediStandard, version: normalized.version };
    case 'version':
      return { version: normalized };
    case 'isaSenderId':
      return { isaSenderId: normalized };
    case 'isaReceiverId':
      return { isaReceiverId: normalized };
    case 'gsSender':
      return { gsIds: { ...(fd.gsIds || {}), sender: normalized } };
    case 'gsReceiver':
      return { gsIds: { ...(fd.gsIds || {}), receiver: normalized } };
    case 'documents':
      return { documents: normalized };
    case 'transportType':
      return { transportType: normalized };
    case 'transportHost':
      return { transportConfig: { ...(fd.transportConfig || {}), host: normalized } };
    case 'status':
      return { status: normalized };
    case 'exceptionRules':
      return { exceptionRules: normalized };
    default:
      return {};
  }
};

const validateReviewSave = (row, draft, fd) => {
  if (!row) return { ok: true, normalized: draft };
  const raw = String(draft ?? '').trim();
  const empty = !raw;

  if (row.required && row.kind !== 'ediCombo' && row.kind !== 'version' && row.kind !== 'documents') {
    if (empty) return { ok: false, error: 'This field is required' };
  }

  switch (row.kind) {
    case 'text': {
      if (!row.required && empty) return { ok: true, normalized: '' };
      if (row.required && raw.length < 2) return { ok: false, error: 'This field is required' };
      if (raw.length > 500) return { ok: false, error: 'Value is too long' };
      return { ok: true, normalized: raw };
    }
    case 'partnerCode': {
      const code = raw.replace(/\s/g, '').toUpperCase().slice(0, PARTNER_CODE_MAX);
      if (!code) return { ok: false, error: 'This field is required' };
      if (!/^[A-Z0-9_]+$/.test(code)) return { ok: false, error: 'Only letters, numbers, underscores allowed' };
      return { ok: true, normalized: code };
    }
    case 'role': {
      if (empty) return { ok: false, error: 'This field is required' };
      const m = matchVoiceToOptions(raw, REVIEW_ROLE_OPTIONS);
      if (!m || Array.isArray(m)) return { ok: false, error: 'This field is required' };
      return { ok: true, normalized: m };
    }
    case 'industry': {
      if (!raw) return { ok: true, normalized: '' };
      const m = matchVoiceToOptions(raw, REVIEW_INDUSTRY_OPTIONS);
      if (!m || Array.isArray(m)) return { ok: false, error: 'Choose a valid industry' };
      return { ok: true, normalized: m };
    }
    case 'country':
      return { ok: true, normalized: raw };
    case 'timezone': {
      if (!raw) return { ok: true, normalized: '' };
      return { ok: true, normalized: raw };
    }
    case 'email': {
      if (!raw) return { ok: true, normalized: '' };
      const email = normalizeEmailForVoice(raw) || raw;
      if (!EMAIL_REGEX.test(email)) return { ok: false, error: 'Enter a valid email address' };
      return { ok: true, normalized: email };
    }
    case 'phone': {
      if (!raw) return { ok: true, normalized: '' };
      const digits = (normalizePhoneForVoice(raw) || raw).replace(/\D/g, '');
      if (digits.length < PHONE_MIN_DIGITS) return { ok: false, error: 'Phone needs at least 10 digits' };
      if (digits.length > PHONE_MAX_DIGITS) return { ok: false, error: 'Phone must be 10–15 digits' };
      return { ok: true, normalized: raw };
    }
    case 'ediCombo': {
      const hit = REVIEW_EDI_COMBO.find((o) => o.key === draft);
      if (!hit) return { ok: false, error: 'This field is required' };
      return { ok: true, normalized: { ediStandard: hit.ediStandard, version: hit.version } };
    }
    case 'version': {
      const isX12 = String(fd.ediStandard || '').toUpperCase() === 'X12';
      if (isX12) {
        if (!raw) return { ok: false, error: 'This field is required' };
        if (!REVIEW_X12_VERSIONS.includes(raw)) return { ok: false, error: 'Choose a valid version' };
        return { ok: true, normalized: raw };
      }
      return { ok: true, normalized: raw };
    }
    case 'isa': {
      if (!raw) return { ok: false, error: 'This field is required' };
      const id = normalizeIsaId(raw) || String(raw).trim().toUpperCase().replace(/\s+/g, '').slice(0, ISA_ID_MAX);
      if (!id) return { ok: false, error: 'This field is required' };
      if (!/^[A-Z0-9]+$/.test(id)) return { ok: false, error: 'ISA ID: letters and numbers only' };
      return { ok: true, normalized: id };
    }
    case 'documents': {
      if (!raw) return { ok: false, error: 'This field is required' };
      const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
      const codes = [];
      for (const p of parts) {
        const m = matchVoiceToOptions(p, DOCUMENT_SELECT_OPTIONS);
        if (!m) return { ok: false, error: 'Choose valid document types' };
        const opts = Array.isArray(m) ? m : [m];
        for (const o of opts) {
          const code = String(o).split(/\s/)[0];
          if (code) codes.push(code);
        }
      }
      const unique = [...new Set(codes)];
      if (unique.length === 0) return { ok: false, error: 'This field is required' };
      return { ok: true, normalized: unique };
    }
    case 'transport': {
      if (!raw) return { ok: false, error: 'This field is required' };
      const m = matchVoiceToOptions(raw, REVIEW_TRANSPORT_OPTIONS);
      if (!m || Array.isArray(m)) return { ok: false, error: 'This field is required' };
      return { ok: true, normalized: m };
    }
    case 'transportHost':
      return { ok: true, normalized: raw };
    case 'status': {
      if (!raw) return { ok: true, normalized: 'Draft' };
      const m = matchVoiceToOptions(raw, REVIEW_STATUS_OPTIONS);
      if (!m || Array.isArray(m)) return { ok: false, error: 'Choose a valid status' };
      return { ok: true, normalized: m };
    }
    case 'notes':
      return { ok: true, normalized: raw };
    default:
      return { ok: true, normalized: raw };
  }
};

function ReviewCountryPicker({ value, onChange, disabled, hasError }) {
  const [open, setOpen] = useState(false);
  const display = String(value || '').trim() || 'Select country…';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full min-w-0 flex-1 items-center justify-between rounded-md border bg-[var(--bg-elevated)] px-3 text-left text-sm text-[var(--text-primary)] transition-all duration-100',
            hasError ? 'border-[var(--status-error-text)]' : 'border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--mdb-green-dark)]'
          )}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] border-[var(--border-focus)] bg-[var(--bg-elevated)] p-0 text-[var(--text-primary)]" align="start">
        <Command className="bg-background">
          <CommandInput placeholder="Search country…" className="text-[var(--text-primary)]" />
          <CommandList>
            <CommandEmpty className="text-[var(--text-primary)]/80">No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_OPTIONS.map(({ code, label }) => (
                <CommandItem
                  key={code}
                  value={`${label} ${code}`}
                  className="text-[var(--text-primary)] data-[selected=true]:bg-[var(--bg-elevated)]"
                  onSelect={() => {
                    onChange(label);
                    setOpen(false);
                  }}
                >
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ReviewTimezonePicker({ value, onChange, disabled, hasError }) {
  const [open, setOpen] = useState(false);
  const display = String(value || '').trim() || 'Select timezone…';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full min-w-0 flex-1 items-center justify-between rounded-md border bg-[var(--bg-elevated)] px-3 text-left text-sm text-[var(--text-primary)] transition-all duration-100',
            hasError ? 'border-[var(--status-error-text)]' : 'border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--mdb-green-dark)]'
          )}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] max-h-[320px] border-[var(--border)] bg-background p-0 text-cyan-50" align="start">
        <Command className="bg-background">
          <CommandInput placeholder="Search timezone…" className="text-[var(--text-primary)]" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty className="text-[var(--text-primary)]/80">No timezone found.</CommandEmpty>
            <CommandGroup>
              {TIMEZONE_OPTIONS.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  className="font-mono text-xs text-[var(--text-primary)] data-[selected=true]:bg-[var(--bg-elevated)]"
                  onSelect={() => {
                    onChange(tz);
                    setOpen(false);
                  }}
                >
                  {tz}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const AddTradingPartnerChat = ({
  open,
  onClose,
  onComplete,
  voiceInputEnabled = false,
  voiceOutputEnabled = false,
  initialFormPrefill = null,
}) => {
  const [messages, setMessages] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState({ section: 0, question: 0 });
  const [inputValue, setInputValue] = useState('');
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [aiStatus, setAiStatus] = useState('checking'); // 'active' | 'fallback' | 'checking'
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewEditingId, setReviewEditingId] = useState(null);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewFieldError, setReviewFieldError] = useState('');
  const [pendingSpecFiles, setPendingSpecFiles] = useState([]);   // [{ localId, name, size, file }]
  const [pendingSampleFiles, setPendingSampleFiles] = useState([]); // [{ localId, name, size, file }]
  const [specUploadError, setSpecUploadError] = useState(null);
  const [sampleUploadError, setSampleUploadError] = useState(null);
  const specInputRef = useRef(null);
  const sampleInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const formDataRef = useRef(formData);
  const currentQuestionIndexRef = useRef(currentQuestionIndex);
  const isProcessingRef = useRef(false);
  const voiceInputEnabledRef = useRef(voiceInputEnabled);
  const reviewDraftRef = useRef('');
  formDataRef.current = formData;
  currentQuestionIndexRef.current = currentQuestionIndex;
  isProcessingRef.current = isProcessing;
  voiceInputEnabledRef.current = voiceInputEnabled;
  reviewDraftRef.current = reviewDraft;

  useEffect(() => {
    if (open) {
      setReviewEditingId(null);
      setReviewDraft('');
      setReviewFieldError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialFormPrefill || typeof initialFormPrefill !== 'object') return;
    const merged = Object.fromEntries(
      Object.entries(initialFormPrefill).filter(([, v]) => v != null && String(v).trim() !== ''),
    );
    if (Object.keys(merged).length === 0) return;
    setFormData((fd) => ({ ...fd, ...merged }));
  }, [open, initialFormPrefill]);

  // Check AI backend status on mount
  useEffect(() => {
    const checkAI = async () => {
      try {
        const result = await partnerAIService.getStatus();
        setAiStatus(result?.available ? 'active' : 'fallback');
      } catch {
        setAiStatus('fallback');
      }
    };
    if (open) checkAI();
  }, [open]);

  // Load TTS voices when dialog opens (Chrome loads voices async)
  useEffect(() => {
    if (open && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const onVoicesChanged = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
    }
  }, [open]);

  // Initialize conversation when dialog opens
  useEffect(() => {
    if (open) {
      setReviewMode(false);
      if (messages.length === 0) {
        const firstQuestion = CONVERSATION_FLOW[0].questions[0];
        setMessages([
          {
            id: '1',
            type: 'ai',
            content: firstQuestion.question,
            speak: firstQuestion.speak,
            questionId: firstQuestion.id,
            questionType: firstQuestion.type,
            options: firstQuestion.options,
          },
        ]);
      }
    }
  }, [open]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-start listening when TTS ends
  const startAutoListening = useCallback(() => {
    if (!voiceInputEnabledRef.current) return;
    if (!recognitionRef.current) return;
    if (isProcessingRef.current) return;
    try {
      window.speechSynthesis?.cancel();
      setIsListening(true);
      toast.info('Listening... Speak now.');
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Auto-start listen failed:', e);
      setIsListening(false);
    }
  }, []);

  const startAutoListeningRef = useRef(startAutoListening);
  startAutoListeningRef.current = startAutoListening;

  // Voice output (TTS): speak the question when voiceOutputEnabled, then auto-start listening when voiceInputEnabled
  useEffect(() => {
    if (!open || messages.length === 0 || !voiceOutputEnabled) return;
    const last = messages[messages.length - 1];
    if (last?.type !== 'ai' || !last.questionId || !last.content) return;
    if (last.id?.startsWith('summary-') || last.id?.startsWith('complete-')) return;
    const speakable = last.speak ? last.speak : toSpeakableText(last.content);
    if (!speakable) return;
    const isSelectOnly = last.options && last.options.length > 0;
    speakWithFemaleVoice(speakable, () => {
      if (voiceInputEnabled && !isSelectOnly) setTimeout(() => startAutoListeningRef.current?.(), 400);
    });
    return () => window.speechSynthesis?.cancel();
  }, [messages, open, voiceOutputEnabled, voiceInputEnabled]);

  // Browser fallback: SpeechRecognition (Chrome)
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript?.trim()) {
          const idx = currentQuestionIndexRef.current;
          const q = CONVERSATION_FLOW[idx?.section]?.questions[idx?.question];
          let answerText = transcript.trim();
          if (q?.id === 'partnerCode') answerText = normalizePartnerCode(answerText) || answerText;
          else if (q?.id === 'isaSenderId' || q?.id === 'isaReceiverId') answerText = normalizeIsaId(answerText) || answerText;
          else if (/Email|email/i.test(q?.id || '')) answerText = normalizeEmailForVoice(answerText) || answerText;
          else if (/Phone|phone/i.test(q?.id || '')) answerText = normalizePhoneForVoice(answerText) || answerText;
          else if (q?.options?.length) {
            const matched = matchVoiceToOptions(answerText, q.options);
            answerText = Array.isArray(matched) ? matched.join(', ') : (matched || answerText);
          }
          setTimeout(() => handleAnswer(answerText, idx).catch(console.error), 100);
        }
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const startListening = async () => {
    if (isListening) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsListening(true);
    toast.info('Listening... Speak now.');

    // Try backend Whisper first (server-side, more accurate)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        toast.info('Transcribing...', { duration: 2000 });
        try {
          const idx = currentQuestionIndexRef.current;
          const q = CONVERSATION_FLOW[idx?.section]?.questions[idx?.question];
          const result = await partnerAIService.processVoice(blob, { current_question: q?.id });
          if (result?.success && result?.text?.trim()) {
            setIsListening(false);
            let answerText = result.text.trim();
            if (q?.id === 'partnerCode') answerText = normalizePartnerCode(answerText) || answerText;
            else if (q?.id === 'isaSenderId' || q?.id === 'isaReceiverId') answerText = normalizeIsaId(answerText) || answerText;
            else if (/Email|email/i.test(q?.id || '')) answerText = normalizeEmailForVoice(answerText) || answerText;
            else if (/Phone|phone/i.test(q?.id || '')) answerText = normalizePhoneForVoice(answerText) || answerText;
            else if (q?.options?.length) {
              const matched = matchVoiceToOptions(answerText, q.options);
              answerText = Array.isArray(matched) ? matched.join(', ') : (matched || answerText);
            }
            await handleAnswer(answerText, idx);
            toast.success('Voice recognized');
          } else {
            throw new Error(result?.error || 'No transcription');
          }
        } catch (err) {
          console.warn('Backend voice failed, using browser:', err);
          if (recognitionRef.current) recognitionRef.current.start();
          else {
            setIsListening(false);
            toast.error('Voice not available. Please type your answer.');
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      // Auto-stop after 10s
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 10000);
    } catch (err) {
      console.warn('Microphone access failed:', err);
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        setIsListening(false);
        toast.error('Microphone access denied. Please type your answer.');
      }
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current?.state === 'listening') {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    toast.info('Processing document with AI...');

    const looksJson =
      (file.name || '').toLowerCase().endsWith('.json') ||
      (file.type || '').includes('json');

    let parsedLocal = null;
    if (looksJson) {
      try {
        const rawText = await file.text();
        parsedLocal = parseLenientJson(rawText);
        if (Array.isArray(parsedLocal) && parsedLocal[0] && typeof parsedLocal[0] === 'object') {
          parsedLocal = parsedLocal[0];
        }
      } catch {
        parsedLocal = null;
      }
    }

    try {
      let result = { success: false, extracted_data: {}, confidence: 0 };
      try {
        result = await partnerAIService.processDocument(file);
      } catch (apiErr) {
        console.warn('Document API error (will use local JSON if available):', apiErr);
        if (looksJson && parsedLocal && typeof parsedLocal === 'object') {
          toast.info('Server extraction unavailable — loaded partner fields from your file.');
        } else {
          throw apiErr;
        }
      }

      // File wins over empty API; API can still overlay when both have keys
      const fromApi =
        result.success && result.extracted_data && typeof result.extracted_data === 'object'
          ? result.extracted_data
          : {};
      const extractedData =
        parsedLocal && typeof parsedLocal === 'object'
          ? { ...fromApi, ...parsedLocal }
          : fromApi;

      if (extractedData && Object.keys(extractedData).length > 0) {
        setUploadedFiles((prev) => {
          if (prev.some((p) => p.name === file.name)) return prev;
          return [
            ...prev,
            {
              name: file.name,
              extracted: extractedData,
              confidence: result.confidence ?? 0.95,
            },
          ];
        });

        // Auto-fill form data from extracted fields (flat + nested partner profile JSON)
        setFormData((prev) => ({ ...prev, ...mapUploadedExtractedDataToForm(extractedData, prev) }));

        // Let user verify every imported field in the review grid, then submit
        setReviewMode(true);
        setInputValue('');
        setSelectedOptions([]);

        // Show AI response in chat (summary, not a wall of JSON)
        const docPreview =
          Array.isArray(extractedData.documents) && extractedData.documents.length > 0
            ? extractedData.documents
            : Array.isArray(extractedData.document_agreements)
              ? extractedData.document_agreements.map((d) => d?.transaction_set).filter(Boolean)
              : [];
        const summaryLines = [
          extractedData.business_name && `Business: ${extractedData.business_name}`,
          extractedData.partner_code && `Code: ${extractedData.partner_code}`,
          extractedData.role && `Role: ${extractedData.role}`,
          extractedData.edi_standard && extractedData.version && `EDI: ${extractedData.edi_standard} ${extractedData.version}`,
          extractedData.isa_sender_id && `ISA sender: ${extractedData.isa_sender_id}`,
          extractedData.isa_receiver_id && `ISA receiver: ${extractedData.isa_receiver_id}`,
          extractedData.transport_type && `Transport: ${extractedData.transport_type}`,
          docPreview.length > 0 && `Documents: ${docPreview.join(', ')}`,
        ].filter(Boolean);
        setMessages((prev) => [...prev, {
          id: `ai-extract-${Date.now()}`,
          type: 'ai',
          content: `📄 Imported **${file.name}**.\n\n${summaryLines.map((l) => `• ${l}`).join('\n')}\n\n✅ **Review & edit** the fields below (scroll down in this window), then click **Submit Partner**.`,
        }]);
        
        toast.success(`Loaded partner profile from file (${Object.keys(extractedData).length} top-level fields). Review and submit.`);
      } else {
        toast.error(
          looksJson
            ? 'Could not read partner fields from this file. Check JSON is valid (no trailing comma after the last }).'
            : 'Failed to extract data from document'
        );
      }
    } catch (error) {
      console.error('Error processing document:', error);
      toast.error('Error processing document. Please try again.');
    } finally {
      try {
        event.target.value = '';
      } catch (_) {}
      setIsProcessing(false);
    }
  };

  const handleOptionSelect = (option) => {
    const currentSection = CONVERSATION_FLOW[currentQuestionIndex.section];
    const currentQuestion = currentSection.questions[currentQuestionIndex.question];
    
    if (currentQuestion.multiple) {
      // Multi-select
      setSelectedOptions(prev => 
        prev.includes(option) 
          ? prev.filter(o => o !== option)
          : [...prev, option]
      );
    } else {
      // Single select
      setSelectedOptions([option]);
      handleAnswer(option);
    }
  };

  const handleAnswer = async (answer, overrideIndex = null) => {
    if (!answer || !answer.trim()) return;
    if (isProcessing) return;
    stopAllVoice();
    const idx = overrideIndex ?? currentQuestionIndex;
    const currentSection = CONVERSATION_FLOW[idx.section];
    const currentQuestion = currentSection?.questions[idx.question];
    
    if (!currentQuestion) return;
    
    // Validate before accepting - block workflow on failure
    const validation = validateField(currentQuestion.id, answer, formDataRef.current, currentQuestion);
    if (!validation.valid) {
      const errorContent = `❌ ${validation.error}\n\nPlease try again.`;
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'ai',
        content: errorContent,
        speak: validation.speak,
        questionId: currentQuestion.id,
        questionType: currentQuestion.type,
        options: currentQuestion.options,
      }]);
      return;
    }
    
    // Add user message
    const userMessageId = `user-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: userMessageId,
      type: 'user',
      content: answer,
    }]);

    // Update form data based on section first
    const updates = {};
    
    if (currentSection.section === 'businessContact') {
      const fieldMap = {
        'businessContactName': 'name',
        'businessContactEmail': 'email',
        'businessContactPhone': 'phone',
      };
      const fieldName = fieldMap[currentQuestion.id] || currentQuestion.id.replace('businessContact', '').toLowerCase();
      updates.businessContact = {
        ...(formData.businessContact || {}),
        [fieldName]: answer,
      };
    } else if (currentSection.section === 'technicalContact') {
      const fieldMap = {
        'technicalContactName': 'name',
        'technicalContactEmail': 'email',
        'technicalContactPhone': 'phone',
      };
      const fieldName = fieldMap[currentQuestion.id] || currentQuestion.id.replace('technicalContact', '').toLowerCase();
      updates.technicalContact = {
        ...(formData.technicalContact || {}),
        [fieldName]: answer,
      };
    } else if (currentQuestion.id === 'documents') {
      updates.documents = answer.split(', ').map(doc => doc.split(' ')[0]);
    } else if (currentQuestion.id === 'partnerCode') {
      updates.partnerCode = normalizePartnerCode(answer);
    } else if (currentQuestion.id === 'isaSenderId' || currentQuestion.id === 'isaReceiverId') {
      updates[currentQuestion.id] = normalizeIsaId(answer);
    } else {
      updates[currentQuestion.id] = answer;
    }
    
    setFormData(prev => ({ ...prev, ...updates }));

    // Process with AI to extract information (non-blocking, don't wait for it)
    setIsProcessing(true);
    
    // Process AI in background without blocking (optional - failures don't block flow)
    (async () => {
      try {
        const conversationHistory = messages
          .filter(m => m.type === 'user' || m.type === 'ai')
          .map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: String(m.content || '')
          }))
          .slice(-10);

        // Sanitize context - only plain serializable values (avoids 422)
        const safeFormData = {};
        try {
          Object.keys(formData || {}).forEach((k) => {
            const v = formData[k];
            if (v !== undefined && v !== null && typeof v !== 'function') {
              if (typeof v === 'object' && !Array.isArray(v) && v.constructor?.name !== 'Object') return;
              safeFormData[k] = v;
            }
          });
        } catch (_) {}
        const context = {
          current_section: currentSection.section,
          current_question: currentQuestion.id,
          form_data: safeFormData,
        };

        const result = await partnerAIService.processChat(
          String(answer || ''),
          conversationHistory,
          context
        );

        if (result && result.success && result.extracted_data) {
          const aiUpdates = {};
          const extracted = result.extracted_data;
          
          if (extracted.business_name) aiUpdates.businessName = extracted.business_name;
          if (extracted.partner_code) {
            aiUpdates.partnerCode = normalizePartnerCode(extracted.partner_code) || String(extracted.partner_code).trim().toUpperCase().slice(0, PARTNER_CODE_MAX);
          }
          if (extracted.role) aiUpdates.role = extracted.role;
          if (extracted.industry) aiUpdates.industry = extracted.industry;
          if (extracted.country) aiUpdates.country = extracted.country;
          if (extracted.timezone) aiUpdates.timezone = extracted.timezone;
          if (extracted.email) {
            aiUpdates.businessContact = {
              ...(formData.businessContact || {}),
              email: extracted.email,
            };
          }
          if (extracted.phone) {
            aiUpdates.businessContact = {
              ...(aiUpdates.businessContact || formData.businessContact || {}),
              phone: extracted.phone,
            };
          }

          setFormData(prev => ({ ...prev, ...aiUpdates }));
        }

        if (result && result.response && result.response.trim()) {
          setMessages(prev => [...prev, {
            id: `ai-${Date.now()}`,
            type: 'ai',
            content: result.response,
          }]);
        }
      } catch (error) {
        console.error('Error processing with AI:', error);
        // Silently continue - AI is optional
      }
    })();

    moveToNextQuestion(idx);
  };

  const moveToNextQuestion = (fromIndex = null) => {
    setIsProcessing(true);
    const idx = fromIndex ?? currentQuestionIndex;
    const delayMs = 2000;
    setTimeout(() => {
      let nextSection = idx.section;
      let nextQuestion = idx.question + 1;

      // Check if we've completed all questions in current section
      if (nextQuestion >= CONVERSATION_FLOW[nextSection].questions.length) {
        nextSection++;
        nextQuestion = 0;
      }

      // Check if we've completed all sections -> go to Review & Edit step
      if (nextSection >= CONVERSATION_FLOW.length) {
        const summary = generateSummary();
        setMessages(prev => [...prev, {
          id: `summary-${Date.now()}`,
          type: 'ai',
          content: summary.replace('Finalizing your trading partner setup...', 'Please review your answers below. You can edit any field before submitting.'),
        }]);
        setTimeout(() => {
          setReviewMode(true);
          setIsProcessing(false);
        }, 2000);
        return;
      }

      const nextQ = CONVERSATION_FLOW[nextSection].questions[nextQuestion];
      
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: nextQ.question,
        speak: nextQ.speak,
        questionId: nextQ.id,
        questionType: nextQ.type,
        options: nextQ.options,
      }]);

      setCurrentQuestionIndex({ section: nextSection, question: nextQuestion });
      setInputValue('');
      setSelectedOptions([]);
      setIsProcessing(false);
    }, delayMs);
  };

  const generateSummary = () => {
    const sections = [
      formData.businessName && `Business: ${formData.businessName} (${formData.partnerCode || 'N/A'})`,
      formData.role && `Role: ${formData.role}`,
      formData.ediStandard && `EDI: ${formData.ediStandard} ${formData.version || ''}`,
      formData.documents && formData.documents.length > 0 && `Documents: ${formData.documents.join(', ')}`,
      formData.transportType && `Transport: ${formData.transportType}`,
    ].filter(Boolean);
    
    return `🎉 Perfect! Here's a summary of what we've set up:\n\n${sections.map(s => `✓ ${s}`).join('\n')}\n\n⚡ Finalizing your trading partner setup...`;
  };

  const handleSendMessage = async (e, message = inputValue) => {
    // Prevent any form submission or navigation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    }
    
    if (!message.trim() && selectedOptions.length === 0) return;
    if (isProcessing) return;

    const answer = selectedOptions.length > 0 ? selectedOptions.join(', ') : message;
    const currentAnswer = answer.trim(); // Store before clearing
    
    if (!currentAnswer) return;
    
    // Clear input immediately
    setInputValue('');
    setSelectedOptions([]);
    
    // Use requestAnimationFrame to ensure state updates happen after preventDefault
    requestAnimationFrame(async () => {
      try {
        await handleAnswer(currentAnswer);
      } catch (error) {
        console.error('Error sending message:', error);
        toast.error('Error sending message. Please try again.');
        setIsProcessing(false);
      }
    });
  };

  const beginReviewEdit = (rowId) => {
    if (reviewEditingId && reviewEditingId !== rowId) {
      const prevRow = REVIEW_ROWS.find((r) => r.id === reviewEditingId);
      const v = validateReviewSave(prevRow, reviewDraftRef.current, formDataRef.current);
      if (v.ok) {
        const prevFd = formDataRef.current;
        const merged = mergeReviewPatch(prevFd, applyReviewNormalized(prevFd, prevRow.id, v.normalized));
        formDataRef.current = merged;
        setFormData(merged);
      }
    }
    const row = REVIEW_ROWS.find((r) => r.id === rowId);
    if (!row) return;
    setReviewEditingId(rowId);
    setReviewDraft(getReviewDraftValue(row, formDataRef.current));
    setReviewFieldError('');
  };

  const saveReviewRow = () => {
    if (!reviewEditingId) return;
    const row = REVIEW_ROWS.find((r) => r.id === reviewEditingId);
    const v = validateReviewSave(row, reviewDraft, formDataRef.current);
    if (!v.ok) {
      setReviewFieldError(v.error);
      return;
    }
    const prevFd = formDataRef.current;
    const merged = mergeReviewPatch(prevFd, applyReviewNormalized(prevFd, row.id, v.normalized));
    formDataRef.current = merged;
    setFormData(merged);
    setReviewEditingId(null);
    setReviewDraft('');
    setReviewFieldError('');
  };

  const cancelReviewRow = () => {
    setReviewEditingId(null);
    setReviewDraft('');
    setReviewFieldError('');
  };

  const handleComplete = async () => {
    stopAllVoice();
    let snapshot = formDataRef.current;
    if (reviewEditingId) {
      const row = REVIEW_ROWS.find((r) => r.id === reviewEditingId);
      const v = validateReviewSave(row, reviewDraftRef.current, snapshot);
      if (!v.ok) {
        setReviewFieldError(v.error);
        return;
      }
      snapshot = mergeReviewPatch(snapshot, applyReviewNormalized(snapshot, row.id, v.normalized));
      formDataRef.current = snapshot;
      setFormData(snapshot);
      setReviewEditingId(null);
      setReviewDraft('');
      setReviewFieldError('');
    }

    setIsProcessing(true);

    setMessages((prev) => [...prev, {
      id: `complete-${Date.now()}`,
      type: 'ai',
      content: "Perfect! I've got everything I need. Let me save your partner to the database...",
    }]);

    try {
      const finalData = {
        ...snapshot,
        status: snapshot.status || 'Draft',
        businessContact: snapshot.businessContact || { name: '', email: '', phone: '' },
        technicalContact: snapshot.technicalContact || { name: '', email: '', phone: '' },
        delimiters: snapshot.delimiters || { element: '*', segment: '~', subElement: '>' },
        erpContext: snapshot.erpContext || {
          partnerERP: { system: 'Unknown', version: '', customName: '', hasCustomizations: false, notes: '' },
          targetSystem: { system: '', integrationMethod: '', dataOwner: '' },
        },
        documents: snapshot.documents || [],
        mappings: snapshot.mappings || [],
        testResults: snapshot.testResults || [],
        monitoringEnabled: snapshot.monitoringEnabled !== undefined ? snapshot.monitoringEnabled : true,
      };
      
      const result = await onComplete(finalData);
      
      if (result?.success) {
        // Upload all pending spec / sample files
        const pid = result.partnerId || finalData._savedPartnerId;
        if (pid) {
          for (const pf of pendingSpecFiles) {
            if (pf.file) {
              try {
                await partnersService.uploadSpecFile(pid, pf.file);
              } catch (e) {
                toast.error(`Spec file "${pf.name}" upload failed: ${e?.response?.data?.detail || e.message}`);
              }
            }
          }
          for (const pf of pendingSampleFiles) {
            if (pf.file) {
              try {
                await partnersService.uploadSampleFile(pid, pf.file);
              } catch (e) {
                toast.error(`Sample file "${pf.name}" upload failed: ${e?.response?.data?.detail || e.message}`);
              }
            }
          }
        }
        stopAllVoice();
        onClose?.();
      }
      // Errors: parent onComplete already shows a toast with API detail
    } catch (error) {
      console.error('Error completing partner setup:', error);
      toast.error(error?.message || 'Error saving partner. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const reviewInputClass = (active) =>
    cn(
      'h-9 min-w-0 flex-1 rounded-md border bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)] transition-all duration-100 placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--mdb-green-dark)]',
      active ? 'border-[var(--status-error-text)]' : 'border-[var(--border-focus)]'
    );

  const renderReviewEditor = (row) => {
    const err = !!reviewFieldError && reviewEditingId === row.id;
    const isX12 = String(formData.ediStandard || '').toUpperCase() === 'X12';

    if (row.kind === 'role') {
      return (
        <Select value={reviewDraft || undefined} onValueChange={setReviewDraft}>
          <SelectTrigger className={reviewInputClass(err)}>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent className="max-h-72 border-[var(--border)] bg-background text-[var(--text-primary)]">
            {REVIEW_ROLE_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.kind === 'industry') {
      return (
        <Select value={reviewDraft || undefined} onValueChange={setReviewDraft}>
          <SelectTrigger className={reviewInputClass(err)}>
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent className="max-h-72 border-[var(--border)] bg-background text-[var(--text-primary)]">
            {REVIEW_INDUSTRY_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.kind === 'country') {
      return <ReviewCountryPicker value={reviewDraft} onChange={setReviewDraft} disabled={false} hasError={err} />;
    }
    if (row.kind === 'timezone') {
      return <ReviewTimezonePicker value={reviewDraft} onChange={setReviewDraft} disabled={false} hasError={err} />;
    }
    if (row.kind === 'ediCombo') {
      return (
        <Select value={reviewDraft || undefined} onValueChange={setReviewDraft}>
          <SelectTrigger className={reviewInputClass(err)}>
            <SelectValue placeholder="EDI standard" />
          </SelectTrigger>
          <SelectContent className="max-h-72 border-[var(--border)] bg-background text-[var(--text-primary)]">
            {REVIEW_EDI_COMBO.map((o) => (
              <SelectItem key={o.key} value={o.key} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.kind === 'version') {
      if (isX12) {
        return (
          <Select value={reviewDraft || undefined} onValueChange={setReviewDraft}>
            <SelectTrigger className={reviewInputClass(err)}>
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent className="border-[var(--border)] bg-background text-[var(--text-primary)]">
              {REVIEW_X12_VERSIONS.map((o) => (
                <SelectItem key={o} value={o} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <Input
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          className={reviewInputClass(err)}
          placeholder="Version (optional)"
        />
      );
    }
    if (row.kind === 'documents') {
      return (
        <Input
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          className={reviewInputClass(err)}
          placeholder="e.g. 850, 810"
        />
      );
    }
    if (row.kind === 'transport') {
      return (
        <Select value={reviewDraft || undefined} onValueChange={setReviewDraft}>
          <SelectTrigger className={reviewInputClass(err)}>
            <SelectValue placeholder="Transport" />
          </SelectTrigger>
          <SelectContent className="border-[var(--border)] bg-background text-[var(--text-primary)]">
            {REVIEW_TRANSPORT_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.kind === 'status') {
      return (
        <Select value={reviewDraft || 'Draft'} onValueChange={setReviewDraft}>
          <SelectTrigger className={reviewInputClass(err)}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="border-[var(--border)] bg-background text-[var(--text-primary)]">
            {REVIEW_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} className="font-mono text-[var(--text-primary)] focus:bg-[var(--bg-elevated)]">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (row.kind === 'notes') {
      return (
        <Textarea
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          className={cn(reviewInputClass(err), 'min-h-[72px] resize-y py-2')}
          placeholder="Notes"
        />
      );
    }
    if (row.kind === 'partnerCode') {
      return (
        <Input
          value={reviewDraft}
          onChange={(e) =>
            setReviewDraft(
              e.target.value.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9_]/g, ''),
            )
          }
          className={reviewInputClass(err)}
          placeholder="PARTNER_CODE"
          maxLength={PARTNER_CODE_MAX}
        />
      );
    }
    if (row.kind === 'email') {
      return (
        <Input
          type="email"
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          className={reviewInputClass(err)}
          placeholder="email@example.com"
        />
      );
    }
    if (row.kind === 'phone') {
      return (
        <Input
          value={reviewDraft}
          onChange={(e) => setReviewDraft(e.target.value)}
          className={reviewInputClass(err)}
          placeholder="Phone"
        />
      );
    }
    return (
      <Input
        value={reviewDraft}
        onChange={(e) => setReviewDraft(e.target.value)}
        className={reviewInputClass(err)}
      />
    );
  };

  const currentQuestion = CONVERSATION_FLOW[currentQuestionIndex.section]?.questions[currentQuestionIndex.question];
  const progress = reviewMode ? 100 : ((currentQuestionIndex.section * 100 + (currentQuestionIndex.question + 1) * (100 / CONVERSATION_FLOW[currentQuestionIndex.section]?.questions.length)) / CONVERSATION_FLOW.length);

  return (
    <Dialog open={open} onOpenChange={(openState) => { if (!openState) { stopAllVoice(); onClose?.(); } }}>
      <style>{`
        [data-radix-dialog-overlay] {
          background: rgba(0, 0, 0, 0.9) !important;
          backdrop-filter: blur(4px);
          z-index: 9998 !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
        }
        [data-radix-dialog-content] {
          z-index: 9999 !important;
          position: fixed !important;
          left: 50% !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          max-height: 90vh !important;
          overflow-y: auto !important;
        }
      `}</style>
      <DialogContent hideClose className="max-w-4xl h-[90vh] flex flex-col p-0 bg-[var(--bg-surface)] border border-[var(--border-focus)] overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                <Bot className="w-5 h-5 text-[var(--mdb-green)]" />
                AI Partner Setup
              </DialogTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 flex items-center gap-2">
                Configure your trading partner via AI conversation
                {aiStatus === 'active' && (
                  <Badge variant="outline" className="text-xs border-[var(--status-success)] text-[var(--status-success-text)]">AI Active</Badge>
                )}
                {aiStatus === 'fallback' && (
                  <Badge variant="outline" className="text-xs border-[var(--border-focus)] text-[var(--text-secondary)]">AI Fallback</Badge>
                )}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="mt-4">
            <Progress value={progress} className="h-1.5" />
            <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-secondary)]">
              <span>{Math.round(progress)}% complete</span>
              <span>{reviewMode ? 'Review & edit' : `Section ${currentQuestionIndex.section + 1} / ${CONVERSATION_FLOW.length}`}</span>
            </div>
          </div>
        </DialogHeader>

        {/* Chat Messages or Review & Edit */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg-base)]">
          {reviewMode ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Verify every value before creating the partner. Click Edit to change a field inline (save or cancel per field). File import fills the same fields as the wizard.
              </p>
              <div className="grid gap-3">
                {REVIEW_ROWS.map((row) => {
                  const val = row.getValue(formData);
                  const display = val != null && val !== '' ? String(val) : '—';
                  const isEditing = reviewEditingId === row.id;
                  return (
                    <motion.div
                      key={row.id}
                      layout
                      className={cn(
                        'flex flex-col gap-2 rounded-lg border bg-[var(--bg-elevated)] p-4 transition-all duration-100 hover:border-[var(--border-focus)]',
                        isEditing ? 'border-[var(--mdb-green-dark)]' : 'border-[var(--border)]',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{row.label}</span>
                          {isEditing ? (
                            <div
                              className="flex w-full flex-col gap-2"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  const tag = (e.target && e.target.tagName) || '';
                                  if (tag === 'INPUT') {
                                    e.preventDefault();
                                    saveReviewRow();
                                  }
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelReviewRow();
                                }
                              }}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-0 flex-1 basis-[200px]">{renderReviewEditor(row)}</div>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-9 shrink-0 border-0 bg-primary px-3 text-primary-foreground hover:bg-[var(--primary-hover)]"
                                  onClick={saveReviewRow}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-9 shrink-0"
                                  onClick={cancelReviewRow}
                                >
                                  Cancel
                                </Button>
                      </div>
                              {reviewFieldError ? (
                                <p className="text-xs text-[var(--status-error-text)]">{reviewFieldError}</p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="block whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">{display}</span>
                          )}
                        </div>
                        {!isEditing ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                            onClick={() => beginReviewEdit(row.id)}
                            className="shrink-0"
                      >
                            <Pencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                        ) : null}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── File uploads (multi) ── */}
              <div className="mt-2 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Partner Files <span className="font-normal normal-case text-[var(--text-muted)]">(optional · multiple allowed)</span>
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Spec files */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FileBadge className="w-4 h-4 text-[var(--mdb-green)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">Specification Documents</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">PDF/DOC EDI mapping guides · max 20 MB each</p>
                    {pendingSpecFiles.map((pf) => (
                      <div key={pf.localId} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-focus)] bg-[var(--bg-base)] px-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-[var(--mdb-green)] flex-shrink-0" />
                          <span className="text-xs text-[var(--text-primary)] truncate">{pf.name}</span>
                          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                            {pf.size < 1024 * 1024 ? `${(pf.size / 1024).toFixed(1)} KB` : `${(pf.size / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                        </div>
                        <button type="button" onClick={() => { setPendingSpecFiles((s) => s.filter((f) => f.localId !== pf.localId)); setSpecUploadError(null); }}
                          className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => specInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--border)] py-2.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {pendingSpecFiles.length > 0 ? 'Add another' : 'Upload PDF'}
                    </button>
                    {specUploadError && <p className="flex items-center gap-1 text-xs text-[var(--status-error-text)]"><AlertCircle className="w-3 h-3" />{specUploadError}</p>}
                    <input ref={specInputRef} type="file" accept=".pdf,.doc,.docx" multiple className="sr-only"
                      onChange={(e) => {
                        Array.from(e.target.files || []).forEach((f) => {
                          setPendingSpecFiles((s) => [...s, { localId: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f }]);
                        });
                        setSpecUploadError(null);
                        e.target.value = '';
                      }} />
                  </div>

                  {/* Sample EDI files */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FileIcon className="w-4 h-4 text-[var(--status-info-text)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">Sample EDI Files</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">.edi transaction files for AI training · max 10 MB each</p>
                    {pendingSampleFiles.map((pf) => (
                      <div key={pf.localId} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-focus)] bg-[var(--bg-base)] px-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-[var(--status-info-text)] flex-shrink-0" />
                          <span className="text-xs text-[var(--text-primary)] truncate">{pf.name}</span>
                          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                            {pf.size < 1024 * 1024 ? `${(pf.size / 1024).toFixed(1)} KB` : `${(pf.size / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                        </div>
                        <button type="button" onClick={() => { setPendingSampleFiles((s) => s.filter((f) => f.localId !== pf.localId)); setSampleUploadError(null); }}
                          className="text-[var(--text-muted)] hover:text-[var(--status-error-text)] flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => sampleInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-[var(--border)] py-2.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {pendingSampleFiles.length > 0 ? 'Add another' : 'Upload .edi File'}
                    </button>
                    {sampleUploadError && <p className="flex items-center gap-1 text-xs text-[var(--status-error-text)]"><AlertCircle className="w-3 h-3" />{sampleUploadError}</p>}
                    <input ref={sampleInputRef} type="file" accept=".edi,.txt,.x12" multiple className="sr-only"
                      onChange={(e) => {
                        Array.from(e.target.files || []).forEach((f) => {
                          setPendingSampleFiles((s) => [...s, { localId: `${Date.now()}-${Math.random()}`, name: f.name, size: f.size, file: f }]);
                        });
                        setSampleUploadError(null);
                        e.target.value = '';
                      }} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => handleComplete()}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Submit Partner
                </Button>
              </div>
            </motion.div>
          ) : (
          <>
          <AnimatePresence>
            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.type === 'ai' && (
                  <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0 border border-[var(--mdb-green)]/40">
                    <Bot className="w-4 h-4 text-[var(--mdb-green)]" />
                  </div>
                )}
                
                <div
                  className={`max-w-[80%] rounded-lg p-3.5 ${
                    message.type === 'user'
                      ? 'bg-[var(--mdb-teal)] border border-[var(--border-focus)]'
                      : 'bg-[var(--bg-elevated)] border border-[var(--border)]'
                  }`}
                >
                  <p className={`text-sm whitespace-pre-wrap ${
                    message.type === 'user' ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-primary)]'
                  }`}>{message.content}</p>
                  
                  {/* Options for multi-select */}
                  {message.questionType === 'multi-select' && message.options && (
                    <div className="mt-3 space-y-2">
                      {message.options.map((option, optIdx) => {
                        const isSelected = selectedOptions.includes(option);
                        return (
                          <motion.button
                            key={option}
                            onClick={() => handleOptionSelect(option)}
                            whileHover={{ scale: 1.05, x: 5 }}
                            whileTap={{ scale: 0.95 }}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border transition-all font-medium text-sm ${
                              isSelected
                                ? 'bg-[var(--mdb-green-dark)] text-[var(--text-primary)] border-[var(--mdb-green)]'
                                : 'bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{option}</span>
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 500 }}
                                >
                                  <CheckCircle2 className="w-5 h-5 text-[var(--text-primary)]" />
                                </motion.div>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  {/* File upload indicator */}
                  {message.file && (
                    <motion.div 
                      className="mt-2 flex items-center gap-2 text-xs text-[var(--text-primary)]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <FileText className="w-3 h-3" />
                      {message.file}
                    </motion.div>
                  )}
                </div>

                {message.type === 'user' && (
                  <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0 border border-[var(--border-focus)]">
                    <User className="w-4 h-4 text-[var(--text-secondary)]" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isProcessing && (
            <motion.div 
              className="flex gap-3 justify-start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--mdb-green)]/40">
                <Bot className="w-4 h-4 text-[var(--mdb-green)]" />
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-3.5">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-secondary)]" />
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
          </>
          )}
        </div>

        {/* Uploaded Files Summary */}
        {uploadedFiles.length > 0 && (
          <motion.div 
            className="px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Extracted from:</span>
              {uploadedFiles.map((file, idx) => (
                <Badge 
                  key={idx} 
                  variant="outline"
                  className="text-xs border-[var(--status-success)] text-[var(--status-success-text)]"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  {file.name}
                </Badge>
              ))}
            </div>
          </motion.div>
        )}

        {/* Input Area - voice + keyboard combined (hidden in review mode) */}
        {!reviewMode && (
        <div 
          className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-surface)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="flex items-center gap-2">
              <input
              ref={fileInputRef}
                type="file"
              accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.json,.xml,application/json,text/xml,application/xml"
                onChange={handleFileUpload}
              className="sr-only"
              tabIndex={-1}
              />
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  type="button"
                  size="icon"
                disabled={isProcessing}
                aria-label="Upload partner profile file (JSON, XML, or other supported formats)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                  className="flex-shrink-0"
                  variant="outline"
                title="Upload JSON, XML, PDF, or spreadsheet"
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </motion.div>
            {voiceInputEnabled && (
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  type="button"
                  size="icon"
                  onClick={isListening ? stopListening : startAutoListening}
                  disabled={isProcessing || (currentQuestion?.options?.length > 0)}
                  variant={isListening ? 'destructive' : 'outline'}
                  className={`flex-shrink-0 ${isListening ? 'animate-pulse' : ''}`}
                  title={currentQuestion?.options?.length > 0 ? 'Select an option above' : (isListening ? 'Stop' : 'Voice input')}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              </motion.div>
            )}
            <Input
              type="text"
              value={inputValue}
              maxLength={currentQuestion?.maxLength > 0 ? currentQuestion.maxLength : undefined}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation?.();
                  handleSendMessage(e);
                  return false;
                }
              }}
              placeholder={
                currentQuestion?.options?.length > 0
                  ? 'Select an option above (voice disabled for this question)'
                  : voiceInputEnabled
                    ? (currentQuestion?.placeholder || 'Type or speak your answer...')
                    : (currentQuestion?.placeholder || 'Type your answer...')
              }
              disabled={isProcessing || (currentQuestion?.options?.length > 0)}
              className="flex-1 bg-[var(--bg-elevated)] border-[var(--border-focus)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                type="button"
                onClick={(e) => handleSendMessage(e)}
                disabled={
                  isProcessing ||
                  (currentQuestion?.options?.length > 0 ? selectedOptions.length === 0 : !inputValue.trim() && selectedOptions.length === 0)
                }
                className="flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>

          {/* Selected Options Display */}
          {selectedOptions.length > 0 && currentQuestion?.multiple && (
            <motion.div 
              className="mt-2 flex items-center gap-2 flex-wrap"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="text-xs text-[var(--text-secondary)] font-medium">Selected:</span>
              {selectedOptions.map((option, idx) => (
                <motion.div
                  key={idx}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  <Badge variant="outline" className="text-xs border-[var(--mdb-green-dark)] text-[var(--text-primary)]">
                    {option}
                    <button
                      onClick={() => setSelectedOptions(prev => prev.filter((_, i) => i !== idx))}
                      className="ml-2 hover:text-[var(--status-error-text)] transition-colors"
                    >
                      ×
                    </button>
                  </Badge>
                </motion.div>
              ))}
              <Button
                type="button"
                size="sm"
                onClick={(e) => handleSendMessage(e)}
                className="text-xs h-7"
              >
                Confirm
              </Button>
            </motion.div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
