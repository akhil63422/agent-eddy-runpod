import json

from app.orchestrator.state import WorkflowState
from app.db.session import SessionLocal
from app.db.models import PartnerProfile
from app.core.logger import get_logger

log = get_logger("skill.inbound_partner_lookup")


def _load_extra(p: PartnerProfile) -> dict:
    """Load extra fields from van_provider JSON blob."""
    if p.van_provider:
        try:
            return json.loads(p.van_provider)
        except Exception:
            pass
    return {}


def _find_partner(partner_name: str) -> PartnerProfile | None:
    """Look up partner by partner_id, name, or ISA ID — case-insensitive."""
    db = SessionLocal()
    try:
        if not partner_name:
            return None
        partner_upper = partner_name.upper().strip()

        # Try exact partner_id match first
        p = (
            db.query(PartnerProfile)
            .filter(PartnerProfile.partner_id == partner_upper)
            .first()
        )
        if not p:
            # Try fuzzy name match
            p = (
                db.query(PartnerProfile)
                .filter(PartnerProfile.partner_name.ilike(f"%{partner_name}%"))
                .first()
            )
        if not p:
            # Try ISA ID match
            p = (
                db.query(PartnerProfile)
                .filter(PartnerProfile.isa_id.ilike(f"%{partner_name.strip()[:15]}%"))
                .first()
            )
        return p
    finally:
        db.close()


class InboundPartnerLookupSkill:
    async def execute(self, state: WorkflowState) -> WorkflowState:
        """Look up source partner and load their profile including ground truth files."""
        source = state.get("source_partner", "")
        parsed = state.get("parsed_data", {})

        # Try source_partner first, fall back to supplier from parsed data
        if not source:
            source = parsed.get("supplier") or parsed.get("supplier_id") or ""

        partner = _find_partner(source)

        if partner:
            extra = _load_extra(partner)
            edi_cfg = extra.get("edi_config") or {}
            isa_qualifier = edi_cfg.get("isa_qualifier") or partner.isa_qualifier or "ZZ"
            isa_id = edi_cfg.get("isa_sender_id") or partner.isa_id or source
            gs_id = (edi_cfg.get("gs_ids") or {}).get("sender") or partner.gs_id or source
            edi_version = edi_cfg.get("version") or partner.edi_version or "005010"

            # Load ground truth files
            wizard_metadata = extra.get("wizard_metadata", {})
            spec_files = wizard_metadata.get("spec_files", [])
            sample_files = wizard_metadata.get("sample_files", [])

            log.info(
                f"[inbound_partner_lookup] found partner={partner.partner_id}  "
                f"isa_qualifier={isa_qualifier}  isa_id={isa_id.strip()}  "
                f"edi_version={edi_version}  "
                f"spec_files={len(spec_files)}  sample_files={len(sample_files)}"
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
                "sla_hours": partner.sla_hours or 24,
                **extra,  # Includes wizard_metadata, spec_files, sample_files
            }
        else:
            log.info(f"[inbound_partner_lookup] no profile found for '{source}' — using defaults")
            isa_qualifier = "ZZ"
            isa_id = f"{source:<15}"[:15]
            gs_id = source[:12] if source else "SENDER"
            edi_version = "005010"
            profile_dict = {}

        completed = state.get("completed_skills", []) + ["inbound_partner_lookup"]
        return {
            **state,
            "partner_profile": profile_dict,
            "source_partner": source,
            "current_skill": "inbound_partner_lookup",
            "completed_skills": completed,
        }
