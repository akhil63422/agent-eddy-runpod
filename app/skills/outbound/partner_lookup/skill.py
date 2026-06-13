import json

from app.orchestrator.state import WorkflowState
from app.db.session import SessionLocal
from app.db.models import PartnerProfile
from app.core.logger import get_logger

log = get_logger("skill.partner_lookup")

# Our own default ISA credentials (can be overridden via env or settings)
_OUR_ISA_QUALIFIER = "ZZ"
_OUR_ISA_ID = "AGENTEDDY      "   # padded to 15
_OUR_GS_ID = "AGENTEDDY"


def _load_extra(p: PartnerProfile) -> dict:
    if p.van_provider:
        try:
            return json.loads(p.van_provider)
        except Exception:
            pass
    return {}


def _find_partner(destination: str) -> PartnerProfile | None:
    """Look up partner by partner_id, name, or ISA ID — case-insensitive."""
    db = SessionLocal()
    try:
        if not destination:
            return None
        dest_upper = destination.upper().strip()
        p = (
            db.query(PartnerProfile)
            .filter(PartnerProfile.partner_id == dest_upper)
            .first()
        )
        if not p:
            p = (
                db.query(PartnerProfile)
                .filter(PartnerProfile.partner_name.ilike(f"%{destination}%"))
                .first()
            )
        if not p:
            p = (
                db.query(PartnerProfile)
                .filter(PartnerProfile.isa_id.ilike(f"%{destination.strip()[:15]}%"))
                .first()
            )
        return p
    finally:
        db.close()


class PartnerLookupSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        destination = state.get("destination_partner", "")
        parsed = state.get("parsed_data", {})

        # Try destination_partner first, fall back to supplier from parsed data
        if not destination:
            destination = parsed.get("supplier") or parsed.get("supplier_id") or ""

        partner = _find_partner(destination)

        if partner:
            extra = _load_extra(partner)
            edi_cfg = extra.get("edi_config") or {}
            isa_qualifier = edi_cfg.get("isa_qualifier") or partner.isa_qualifier or "ZZ"
            isa_id = edi_cfg.get("isa_sender_id") or partner.isa_id or destination
            gs_id = (edi_cfg.get("gs_ids") or {}).get("sender") or partner.gs_id or destination
            edi_version = edi_cfg.get("version") or partner.edi_version or "005010"

            log.info(
                f"[partner_lookup] found partner={partner.partner_id}  "
                f"isa_qualifier={isa_qualifier}  isa_id={isa_id.strip()}  "
                f"edi_version={edi_version}"
            )
            profile_dict = {
                "partner_id": partner.partner_id,
                "partner_name": partner.partner_name,
                "isa_qualifier": isa_qualifier,
                "isa_id": isa_id,
                "gs_id": gs_id,
                "edi_version": edi_version,
                "document_agreements": partner.document_agreements or [],
                "notes": partner.notes,
                **extra,
            }
        else:
            # No profile — use destination string as-is with safe defaults
            log.info(f"[partner_lookup] no profile found for '{destination}' — using defaults")
            isa_qualifier = "ZZ"
            isa_id = f"{destination:<15}"[:15]
            gs_id = destination[:12] if destination else "RECEIVER"
            edi_version = "005010"
            profile_dict = {}

        completed = state.get("completed_skills", []) + ["partner_lookup"]
        return {
            **state,
            "partner_isa_qualifier": isa_qualifier,
            "partner_isa_id": isa_id,
            "partner_gs_id": gs_id,
            "partner_edi_version": edi_version,
            "our_isa_qualifier": _OUR_ISA_QUALIFIER,
            "our_isa_id": _OUR_ISA_ID,
            "our_gs_id": _OUR_GS_ID,
            "partner_profile": profile_dict,
            "destination_partner": destination,
            "current_skill": "partner_lookup",
            "completed_skills": completed,
        }
