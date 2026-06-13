export interface LineItem {
  line_number?: number
  product_id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  extended_amount?: number
}

export interface Party {
  role: string
  name: string
  id: string
  address?: string
  city?: string
  state?: string
}

export interface Totals {
  subtotal?: number
  discount?: number
  tax?: number
  grand_total: number
  currency: string
}

export interface CanonicalEvent {
  transaction_type: string
  document_number: string
  document_date: string
  parties: Party[]
  items: LineItem[]
  totals: Totals
  audit?: { processed_at: string; confidence: number }
  // flat fields (backward compat)
  buyer: string
  supplier: string
  po_number: string
  invoice_number: string
  shipment_id: string
  ship_date: string
  delivery_date: string
  total_amount: number
  currency: string
  source_format: string
  source_partner: string
  destination_partner: string
  relationship_type: string
  direction: string
}

export interface OutboundResult {
  document_id: string
  final_status: string
  transaction_type: string
  source_partner: string
  destination_partner: string
  edi_output: string
  validation_errors: string[]
  completed_skills: string[]
}

export interface DocumentAgreement {
  type: string
  enabled: boolean
}

export interface PartnerProfile {
  id: string
  partner_id: string
  partner_name: string
  isa_qualifier: string
  isa_id: string
  gs_id: string | null
  edi_version: string
  transport: string | null
  van_provider: string | null
  document_agreements: DocumentAgreement[]
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProcessResult {
  document_id: string
  final_status: string
  transaction_type: string
  source_format: string
  source_partner: string
  destination_partner: string
  confidence_score: number
  canonical_event: CanonicalEvent
  mapped_payload: Record<string, unknown>
  mapping_explanations: string[]
  unmapped_fields: string[]
  validation_errors: string[]
  hitl_required: boolean
  completed_skills: string[]
}
