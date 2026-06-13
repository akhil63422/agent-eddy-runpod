from pydantic import BaseModel


class RelationshipOutput(BaseModel):
    source_partner: str
    destination_partner: str
    relationship_type: str   # BUYER_SELLER | SHIPPER_CARRIER | PROVIDER_PAYER | OEM_SUPPLIER
    direction: str           # OUTBOUND | INBOUND  (relative to source_partner)
