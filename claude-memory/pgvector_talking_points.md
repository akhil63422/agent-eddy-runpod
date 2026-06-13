---
name: pgvector-talking-points
description: Elevator pitch and talking points for explaining pgvector roadmap to stakeholders/demos
metadata:
  type: reference
---

## Vector DB Talking Points

**Core message:** "Vector DB isn't integrated yet, but we have a clear 3-use-case roadmap for when we scale to 50+ partners."

### Full 30-second pitch:

"Vector DB isn't integrated yet, but we have a clear 3-use-case roadmap for when we scale to 50+ partners:

**1. Few-shot mapper memory** — Store successful canonical→ERP mappings, inject top-3 similar past examples into the Qwen prompt before LLM call. Boosts confidence from 85% → 97%+.

**2. HITL learning** — Embed every human correction, auto-apply similar past corrections to new docs from same partner. System learns partner quirks automatically.

**3. Anomaly detection** — Embed inbound docs, catch near-duplicates and unusual quantities early in the pipeline.

Right now we don't need it — the generic Qwen prompt handles mapping well at our scale (40 docs, 2 partners). But we're ready to add pgvector to PostgreSQL with `all-MiniLM-L6-v2` embeddings as soon as we hit the trigger: **50+ partners or recurring HITL patterns from the same partner.**

The implementation is straightforward: extend the transaction_documents table with a `vector(384)` column, embed on save, retrieve at mapper time. We use LangChain already, so integration is plug-and-play."

### If they push back on "why not now":

"We could add it today, but embeddings are most valuable when you have patterns to learn from. Right now each doc from different partners masks the partner-specific signal. At 50+ partners with 100+ docs each, those patterns become clear and ROI is 10x higher."

### Why this framing works:

- ✅ Shows you've designed ahead
- ✅ Explains the "why not yet" (premature optimization)
- ✅ Lists concrete, measurable ROI (85% → 97% confidence)
- ✅ Names the exact tech (pgvector, all-MiniLM-L6-v2)
- ✅ Gives a trigger condition (50+ partners)
- ✅ Frames it as low-effort when needed
- ✅ Demonstrates data-driven thinking

### Supporting facts to cite:

- Current scale: 40 docs, 2 partners → generic prompt works fine
- Trigger: 50+ partners OR recurring HITL patterns
- Model: `all-MiniLM-L6-v2` (384-dim, lightweight)
- Extension: PostgreSQL `pgvector`
- Column: `vector(384)` on `transaction_documents`
- Index: `ivfflat (embedding vector_cosine_ops)` for cosine similarity
- Integration: Via LangChain (already in stack)

### For deep dives (if needed):

**Use case #1 detail:** Each mapper success stores `(canonical_event_json, mapped_payload_json)` as vector pair. At inference, retrieve similar historical mappings from same partner, inject as few-shot examples in system prompt to Qwen. Reduces hallucination and boosts confidence.

**Use case #2 detail:** Every HITL correction (user edits vendor_id, fixes quantity, etc.) is stored with embedding. Next doc from same partner → retrieve similar past corrections → apply automatically before validator runs. Builds partner-specific rules over time without code changes.

**Use case #3 detail:** Inbound doc embedding checked against 90-day window for >0.95 cosine similarity (near-duplicates). Also flagged if anomalous (0.7 similarity to past docs but different supplier/qty). Catches invoice fraud patterns.
