/**
 * Role-based direction matrix for display.
 * Same logic as backend: direction depends on viewer's role + doc type.
 * Buyer: 850/820 Out; 855/856/810 In
 * Supplier: 850/820 In; 855/856/810 Out
 */
const DIRECTION_MATRIX = {
  buyer: { 850: 'Outbound', 855: 'Inbound', 856: 'Inbound', 810: 'Inbound', 820: 'Outbound', 997: 'Inbound', 999: 'Inbound' },
  supplier: { 850: 'Inbound', 855: 'Outbound', 856: 'Outbound', 810: 'Outbound', 820: 'Inbound', 997: 'Inbound', 999: 'Inbound' },
};

function extractDocType(docType) {
  if (!docType || typeof docType !== 'string') return '';
  const m = docType.match(/(\d{3})/);
  return m ? m[1] : docType;
}

function roleToKey(role) {
  if (!role) return null;
  const r = String(role).trim().toLowerCase();
  if (r === 'customer' || r === 'buyer') return 'buyer';
  if (r === 'supplier' || r === 'vendor') return 'supplier';
  return null;
}

/**
 * Get display direction for a document based on viewer's role.
 * When viewer is Supplier, 810/856 show as Outbound; when Buyer, show as Inbound.
 * @param {string} viewerRole - 'Supplier' | 'Customer' from localStorage
 * @param {string} docType - e.g. 'X12 850', '850'
 * @returns {string} 'Inbound' | 'Outbound' - fallback to stored direction if no role
 */
export function getDisplayDirection(viewerRole, docType) {
  const roleKey = roleToKey(viewerRole);
  if (!roleKey) return null;
  const doc = extractDocType(docType);
  const dir = DIRECTION_MATRIX[roleKey]?.[doc];
  return dir || null;
}
