"""
Endpoint management API.

An Endpoint is a technical integration point for a trading partner:
  - Protocol: AS2 | SFTP | FTP | HTTPS | AS4 | VAN
  - Stores credentials, certificates, and protocol-specific settings
  - Supports connection testing (simulated in dev; real connectivity in prod)
"""
from typing import Optional
from datetime import datetime, timezone
import asyncio
import socket

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Endpoint, PartnerProfile
from app.core.logger import get_logger

log = get_logger("api.endpoints")
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class EndpointCreate(BaseModel):
    partner_id: str
    name: str
    protocol: str                       # AS2 | SFTP | FTP | HTTPS | AS4 | VAN
    direction: Optional[str] = "Both"  # Inbound | Outbound | Both
    status: Optional[str] = "Inactive"
    config: Optional[dict] = {}


class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    protocol: Optional[str] = None
    direction: Optional[str] = None
    status: Optional[str] = None
    config: Optional[dict] = None


# ── Serialiser ────────────────────────────────────────────────────────────────

def _serialize(e: Endpoint) -> dict:
    return {
        "id": e.id,
        "partner_id": e.partner_id,
        "name": e.name,
        "protocol": e.protocol,
        "direction": e.direction,
        "status": e.status,
        "config": e.config or {},
        "last_tested": e.last_tested.isoformat() if e.last_tested else None,
        "last_test_result": e.last_test_result,
        "last_test_message": e.last_test_message,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(endpoint_id: str, db: Session) -> Endpoint:
    e = db.query(Endpoint).filter(Endpoint.id == endpoint_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return e


async def _test_tcp(host: str, port: int, timeout: float = 5.0) -> tuple[bool, str]:
    """Attempt a raw TCP connection to verify host:port reachability."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        return True, f"TCP connection to {host}:{port} succeeded"
    except asyncio.TimeoutError:
        return False, f"Connection timed out after {timeout}s"
    except OSError as exc:
        return False, str(exc)


async def _run_test(protocol: str, config: dict) -> tuple[bool, str]:
    """
    Run protocol-specific connectivity test.
    Returns (success: bool, message: str).
    """
    protocol = (protocol or "").upper()

    if protocol in ("SFTP", "FTP", "FTPS"):
        host = config.get("host", "").strip()
        port = int(config.get("port") or (22 if protocol == "SFTP" else 21))
        if not host:
            return False, "Host is not configured"
        return await _test_tcp(host, port)

    if protocol == "AS2":
        url = config.get("partner_url", "").strip()
        if not url:
            return False, "Partner AS2 URL is not configured"
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if not host:
                return False, "Could not parse host from AS2 URL"
            return await _test_tcp(host, port)
        except Exception as exc:
            return False, str(exc)

    if protocol in ("HTTPS", "HTTP", "API"):
        url = config.get("url", "").strip()
        if not url:
            return False, "URL is not configured"
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if not host:
                return False, "Could not parse host from URL"
            return await _test_tcp(host, port)
        except Exception as exc:
            return False, str(exc)

    if protocol in ("AS4",):
        url = config.get("url", "").strip()
        if not url:
            return False, "AS4 endpoint URL is not configured"
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""
            port = parsed.port or 443
            if not host:
                return False, "Could not parse host from AS4 URL"
            return await _test_tcp(host, port)
        except Exception as exc:
            return False, str(exc)

    if protocol == "VAN":
        provider = config.get("provider", "").strip()
        if not provider:
            return False, "VAN provider is not configured"
        # VAN connectivity is broker-managed; we can only check if an API is configured
        api_url = config.get("api_url", "").strip()
        if api_url:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(api_url)
                host = parsed.hostname or ""
                port = parsed.port or 443
                return await _test_tcp(host, port)
            except Exception as exc:
                return False, str(exc)
        return True, f"VAN provider '{provider}' configured (no direct API URL to test)"

    return False, f"Unknown protocol: {protocol}"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/endpoints/", summary="List all endpoints (optionally filtered by partner_id)")
@router.get("/endpoints", include_in_schema=False)
def list_endpoints(partner_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Endpoint).order_by(Endpoint.created_at.desc())
    if partner_id:
        q = q.filter(Endpoint.partner_id == partner_id)
    return [_serialize(e) for e in q.all()]


@router.post("/endpoints/", summary="Create a new endpoint", status_code=201)
@router.post("/endpoints", include_in_schema=False, status_code=201)
def create_endpoint(body: EndpointCreate, db: Session = Depends(get_db)):
    e = Endpoint(
        partner_id=body.partner_id,
        name=body.name,
        protocol=body.protocol.upper(),
        direction=body.direction or "Both",
        status=body.status or "Inactive",
        config=body.config or {},
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    log.info(f"[endpoints] created id={e.id} partner={e.partner_id} protocol={e.protocol}")
    return _serialize(e)


@router.get("/endpoints/{endpoint_id}", summary="Get a single endpoint")
def get_endpoint(endpoint_id: str, db: Session = Depends(get_db)):
    return _serialize(_get_or_404(endpoint_id, db))


@router.put("/endpoints/{endpoint_id}", summary="Update an endpoint")
def update_endpoint(endpoint_id: str, body: EndpointUpdate, db: Session = Depends(get_db)):
    e = _get_or_404(endpoint_id, db)
    if body.name is not None:
        e.name = body.name
    if body.protocol is not None:
        e.protocol = body.protocol.upper()
    if body.direction is not None:
        e.direction = body.direction
    if body.status is not None:
        e.status = body.status
    if body.config is not None:
        e.config = body.config
    e.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.delete("/endpoints/{endpoint_id}", status_code=204, summary="Delete an endpoint")
def delete_endpoint(endpoint_id: str, db: Session = Depends(get_db)):
    e = _get_or_404(endpoint_id, db)
    db.delete(e)
    db.commit()
    log.info(f"[endpoints] deleted id={endpoint_id}")


@router.post("/endpoints/{endpoint_id}/test", summary="Test connectivity for an endpoint")
async def test_endpoint(endpoint_id: str, db: Session = Depends(get_db)):
    e = _get_or_404(endpoint_id, db)
    now = datetime.now(timezone.utc)

    success, message = await _run_test(e.protocol, e.config or {})

    e.last_tested = now
    e.last_test_result = "success" if success else "failed"
    e.last_test_message = message
    # Only auto-activate on explicit success; never downgrade Active → Inactive on test failure
    if success and e.status == "Inactive":
        e.status = "Active"
    elif not success:
        e.status = "Error"
    e.updated_at = now
    db.commit()
    db.refresh(e)

    log.info(f"[endpoints] test id={endpoint_id} result={e.last_test_result} msg={message}")
    return {
        "ok": success,
        "result": e.last_test_result,
        "message": message,
        "endpoint": _serialize(e),
    }
