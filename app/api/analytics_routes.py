from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.db.session import get_db
from app.db.models import TransactionDocument

router = APIRouter()

_STATUS_MAP = {
    "COMPLETED": "Completed",
    "FAILED": "Failed",
    "IN_PROGRESS": "Processing",
    "HITL_REQUIRED": "Needs Review",
    "APPROVED": "Ready for Dispatch",
    "REJECTED": "Rejected",
}

_TX_TO_DOC = {
    "PURCHASE_ORDER": "850",
    "SHIPMENT_NOTICE": "856",
    "INVOICE": "810",
    "PO_ACK": "855",
}


@router.get("/analytics/dashboard")
def get_dashboard(days: int = 7, db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    docs = db.query(TransactionDocument).filter(TransactionDocument.created_at >= since).all()
    total = len(docs)
    completed = sum(1 for d in docs if d.final_status == "COMPLETED")
    failed = sum(1 for d in docs if d.final_status == "FAILED")
    needs_review = sum(1 for d in docs if d.final_status == "HITL_REQUIRED")
    success_rate = round((completed / total * 100) if total else 0, 1)
    return {
        "total_documents": total,
        "completed": completed,
        "failed": failed,
        "needs_review": needs_review,
        "success_rate": success_rate,
        "days": days,
    }


@router.get("/analytics/operations-kpis")
def get_operations_kpis(db: Session = Depends(get_db)):
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_48h = now - timedelta(hours=48)

    all_docs = db.query(TransactionDocument).all()
    docs_24h = [d for d in all_docs if d.created_at and d.created_at >= since_24h]
    docs_prev = [d for d in all_docs if d.created_at and since_48h <= d.created_at < since_24h]

    inbound_24 = sum(1 for d in docs_24h if (d.direction or "").upper() == "INBOUND")
    outbound_24 = sum(1 for d in docs_24h if (d.direction or "").upper() == "OUTBOUND")
    outbound_prev = sum(1 for d in docs_prev if (d.direction or "").upper() == "OUTBOUND")

    trend_pct = 0
    if outbound_prev == 0:
        trend_pct = 100 if outbound_24 > 0 else 0
    else:
        trend_pct = round(((outbound_24 - outbound_prev) / outbound_prev) * 100, 1)

    terminal = {"COMPLETED", "APPROVED"}
    successful = sum(1 for d in docs_24h if d.final_status in terminal)
    active_exceptions = sum(1 for d in all_docs if d.final_status in {"HITL_PENDING", "HITL_REQUIRED", "FAILED"})

    total = len(all_docs)
    completed_all = sum(1 for d in all_docs if d.final_status in terminal)
    failed_all = sum(1 for d in all_docs if d.final_status == "FAILED")
    hitl_all = sum(1 for d in all_docs if d.final_status in {"HITL_PENDING", "HITL_REQUIRED"})

    return {
        # Fields Dashboard KPI cards expect
        "files_received": inbound_24,
        "files_sent": outbound_24,
        "files_sent_trend_pct": trend_pct,
        "successful_translations": successful,
        "active_exceptions": active_exceptions,
        # Legacy / extra fields
        "total": total,
        "completed": completed_all,
        "failed": failed_all,
        "needs_review": hitl_all,
        "success_rate": round((successful / len(docs_24h) * 100) if docs_24h else 0, 1),
    }


@router.get("/analytics/operations-kpis/detail")
def get_operations_kpi_detail(bucket: str = "", limit: int = 500):
    return {"bucket": bucket, "items": []}


@router.get("/analytics/trends")
def get_trends(metric: str = "documents", days: int = 30, split_by_direction: bool = False, db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    docs = db.query(TransactionDocument).filter(TransactionDocument.created_at >= since).all()
    by_day: dict = {}
    for d in docs:
        day = d.created_at.date().isoformat() if d.created_at else "unknown"
        if day not in by_day:
            by_day[day] = {"date": day, "inbound": 0, "outbound": 0, "total": 0}
        direction = (d.direction or "INBOUND").upper()
        if direction == "OUTBOUND":
            by_day[day]["outbound"] += 1
        else:
            by_day[day]["inbound"] += 1
        by_day[day]["total"] += 1
        by_day[day]["count"] = by_day[day]["total"]
    data = sorted(by_day.values(), key=lambda x: x["date"])
    return {"metric": metric, "data": data}


@router.get("/analytics/document-types")
def get_document_types(days: int = 7, limit: int = 5, db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    docs = db.query(TransactionDocument).filter(TransactionDocument.created_at >= since).all()
    counts: dict = {}
    for d in docs:
        t = _TX_TO_DOC.get(d.transaction_type or "", d.transaction_type or "Unknown")
        counts[t] = counts.get(t, 0) + 1
    data = [{"type": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])[:limit]]
    return {"data": data}


@router.get("/analytics/partner-performance")
def get_partner_performance(partner_id: Optional[str] = None, days: int = 30, period: Optional[str] = None):
    return {"data": []}


@router.get("/analytics/exception-sla")
def get_exception_sla(days: int = 7):
    return {"data": []}


@router.get("/analytics/summary")
def get_summary(period: str = "7d", db: Session = Depends(get_db)):
    days = int(period.rstrip("d")) if period.endswith("d") else 7
    return get_dashboard(days=days, db=db)


@router.get("/analytics/throughput")
def get_throughput(period: str = "7d"):
    return {"data": []}


@router.get("/analytics/exception-trends")
def get_exception_trends(period: str = "7d"):
    return {"data": []}


@router.get("/analytics/ai-performance")
def get_ai_performance(period: str = "7d", db: Session = Depends(get_db)):
    docs = db.query(TransactionDocument).filter(TransactionDocument.confidence_score.isnot(None)).all()
    avg = sum(d.confidence_score for d in docs if d.confidence_score) / len(docs) if docs else 0
    return {"avg_confidence": round(avg, 3), "total_processed": len(docs)}


@router.get("/analytics/sla")
def get_sla(period: str = "7d", db: Session = Depends(get_db)):
    days = int(period.rstrip("d")) if period.endswith("d") else 7
    since = datetime.now(timezone.utc) - timedelta(days=days)

    docs = db.query(TransactionDocument).filter(
        TransactionDocument.expected_dispatch_by.isnot(None),
        TransactionDocument.created_at >= since
    ).all()

    now = datetime.now(timezone.utc)
    within_sla = sum(
        1 for d in docs
        if d.final_status in ("COMPLETED", "APPROVED") and d.updated_at <= d.expected_dispatch_by
    )
    breached_sla = sum(
        1 for d in docs
        if now > d.expected_dispatch_by and d.final_status not in ("COMPLETED", "APPROVED")
    )

    # Calculate average processing time for completed docs
    completed_docs = [d for d in docs if d.final_status in ("COMPLETED", "APPROVED")]
    avg_ms = 0
    if completed_docs:
        total_ms = sum(
            (d.updated_at - d.created_at).total_seconds() * 1000
            for d in completed_docs
        )
        avg_ms = int(total_ms / len(completed_docs))

    total_docs = len(docs)

    return {
        "sla_compliance_rate": round(within_sla / total_docs * 100, 1) if total_docs > 0 else 0,
        "sla_threshold_ms": 24 * 3600 * 1000,
        "files_within_sla": within_sla,
        "files_breached_sla": breached_sla,
        "avg_processing_time_ms": avg_ms,
        "p95_processing_time_ms": 0,
        "p99_processing_time_ms": 0,
    }


@router.get("/analytics/ai-usage")
def get_ai_usage(period: str = "7d", db: Session = Depends(get_db)):
    days = int(period.rstrip("d")) if period.endswith("d") else 7
    since = datetime.now(timezone.utc) - timedelta(days=days)
    docs = db.query(TransactionDocument).filter(TransactionDocument.created_at >= since).all()

    # Global totals
    total_tokens = sum(d.total_tokens or 0 for d in docs)
    total_prompt = sum(d.prompt_tokens or 0 for d in docs)
    total_completion = sum(d.completion_tokens or 0 for d in docs)
    total_requests = sum(d.llm_call_count or 0 for d in docs)

    # Per-partner breakdown
    by_partner: dict = {}
    for d in docs:
        name = d.source_partner or d.destination_partner or "Unknown"
        if name not in by_partner:
            by_partner[name] = {"partner_name": name, "requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        by_partner[name]["requests"] += d.llm_call_count or 0
        by_partner[name]["prompt_tokens"] += d.prompt_tokens or 0
        by_partner[name]["completion_tokens"] += d.completion_tokens or 0
        by_partner[name]["total_tokens"] += d.total_tokens or 0

    return {
        "total_tokens": total_tokens,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_requests": total_requests,
        "by_partner": sorted(by_partner.values(), key=lambda x: -x["total_tokens"]),
    }
