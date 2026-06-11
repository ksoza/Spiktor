"""
turbovec Integration — Spiktor Memory Layer Upgrade
======================================================
ksoza/turbovec — Google TurboQuant in Rust/Python

Replaces Supabase pgvector for ALL vector operations in:
  - AIOS kernel memory manager
  - Subconscious turbovec index
  - GhOSTface memory bank
  - Research mode RAG

Why turbovec over FAISS/pgvector:
  - 10M documents = 4GB RAM (FAISS needs 31GB)
  - Online ingest — no training phase, add docs live
  - AVX-512 / NEON kernels — hardware-accelerated on ARM (Oracle Cloud) + x86
  - 4-bit quantization by default — 8x compression vs float32
  - Filtered search — metadata-gated queries
  - Air-gapped — no cloud dependency
  - Written in Rust — production-grade stability

Index types:
  FlatIndex     — exact search, small corpora (<100k docs)
  IVFIndex      — approximate, medium corpora (100k-10M docs)
  IdMapIndex    — maps external string IDs to internal uint64, best for agents
  FilteredIndex — metadata-aware search
"""

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger("spiktor.turbovec")

TURBOVEC_BASE  = os.environ.get("TURBOVEC_BASE_PATH", "/app/data/turbovec")
EMBEDDING_DIM  = int(os.environ.get("TURBOVEC_DIM", "1536"))
QUANTIZE_BITS  = int(os.environ.get("TURBOVEC_BITS", "4"))  # 4 or 8


# ── Index registry ────────────────────────────────────────────────────────────
# Each component gets its own named index for isolation

INDEX_REGISTRY = {
    "subconscious": f"{TURBOVEC_BASE}/subconscious",  # dreams, sessions, patterns
    "aios_memory":  f"{TURBOVEC_BASE}/aios",          # agent task history
    "ghostface":    f"{TURBOVEC_BASE}/ghostface",      # repo intelligence, HF models
    "research":     f"{TURBOVEC_BASE}/research",       # RAG documents
    "ksx":          f"{TURBOVEC_BASE}/ksx",            # blockchain / tokenomics docs
    "rip":          f"{TURBOVEC_BASE}/rip",            # platform codebase
    "ip_vault":     f"{TURBOVEC_BASE}/ip_vault",       # VCNL, PCBL, NIMBUS, QCNA patents
}


@dataclass
class VecDoc:
    """A document stored in a turbovec index."""
    id:       str
    text:     str
    metadata: dict
    vector:   Optional[np.ndarray] = None

    def stable_id(self) -> int:
        return int(hashlib.sha256(self.id.encode()).hexdigest()[:16], 16)


class TurboVecIndex:
    """
    Wrapper around a single turbovec IdMapIndex.
    Handles: add, search, delete, persist, load.
    """

    def __init__(self, name: str, dim: int = EMBEDDING_DIM):
        self.name    = name
        self.dim     = dim
        self.path    = INDEX_REGISTRY.get(name, f"{TURBOVEC_BASE}/{name}")
        self._index  = None
        self._meta:  dict[str, dict] = {}   # id → metadata + text
        self._ready  = False

        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._try_init()

    def _try_init(self):
        try:
            from turbovec import IdMapIndex
            tvim_path = f"{self.path}.tvim"
            meta_path = f"{self.path}.meta.json"

            if Path(tvim_path).exists():
                self._index = IdMapIndex.load(tvim_path)
                if Path(meta_path).exists():
                    self._meta = json.loads(Path(meta_path).read_text())
                logger.info("turbovec[%s] loaded: %d docs", self.name, len(self._meta))
            else:
                self._index = IdMapIndex(dim=self.dim, bit_width=QUANTIZE_BITS)
                logger.info("turbovec[%s] created (dim=%d, %d-bit)", self.name, self.dim, QUANTIZE_BITS)

            self._ready = True
        except ImportError:
            logger.info("turbovec[%s] not installed — numpy cosine fallback", self.name)
            self._fallback: list[tuple[str, np.ndarray]] = []

    def add(self, doc: VecDoc) -> bool:
        """Add a document with its vector."""
        if doc.vector is None:
            logger.warning("turbovec[%s] add: no vector for %s", self.name, doc.id)
            return False

        vec    = doc.vector.reshape(1, -1).astype(np.float32)
        ext_id = np.array([doc.stable_id()], dtype=np.uint64)

        if self._ready and self._index is not None:
            self._index.add_with_ids(vec, ext_id)
            self._meta[doc.id] = {"text": doc.text[:500], "meta": doc.metadata,
                                   "ts": time.time()}
            self._persist()
            return True
        elif hasattr(self, "_fallback"):
            self._fallback.append((doc.id, doc.vector.copy()))
            self._meta[doc.id] = {"text": doc.text[:500], "meta": doc.metadata,
                                   "ts": time.time()}
            return True
        return False

    def search(self, query_vec: np.ndarray, k: int = 10,
               filter_meta: Optional[dict] = None) -> list[dict]:
        """Search for nearest neighbours. Returns list of {id, text, meta, score}."""
        q = query_vec.reshape(1, -1).astype(np.float32)

        candidates = []

        if self._ready and self._index is not None and len(self._meta) > 0:
            try:
                scores, ids = self._index.search(q, k=min(k * 3, len(self._meta)))
                id_reverse  = {int(hashlib.sha256(eid.encode()).hexdigest()[:16], 16): eid
                               for eid in self._meta}
                for i, uid in enumerate(ids.flatten()):
                    doc_id = id_reverse.get(int(uid))
                    if doc_id and doc_id in self._meta:
                        m = self._meta[doc_id]
                        candidates.append({
                            "id":    doc_id,
                            "text":  m["text"],
                            "meta":  m["meta"],
                            "score": float(scores.flatten()[i]) if hasattr(scores, "flatten") else 0.0
                        })
            except Exception as e:
                logger.debug("turbovec search error: %s", e)

        if not candidates and hasattr(self, "_fallback"):
            # numpy cosine
            scores_list = []
            for doc_id, vec in self._fallback:
                norm = np.linalg.norm(vec)
                if norm > 0:
                    sim = float(np.dot(q.flatten(), vec) / (np.linalg.norm(q) * norm))
                    scores_list.append((sim, doc_id))
            scores_list.sort(reverse=True)
            for sim, doc_id in scores_list[:k * 3]:
                if doc_id in self._meta:
                    m = self._meta[doc_id]
                    candidates.append({
                        "id": doc_id, "text": m["text"],
                        "meta": m["meta"], "score": sim
                    })

        # Apply metadata filter
        if filter_meta:
            candidates = [
                c for c in candidates
                if all(c["meta"].get(k) == v for k, v in filter_meta.items())
            ]

        return candidates[:k]

    def delete(self, doc_id: str) -> bool:
        if doc_id in self._meta:
            del self._meta[doc_id]
            self._persist()
            return True
        return False

    def _persist(self):
        try:
            if self._ready and self._index is not None:
                self._index.write(f"{self.path}.tvim")
            meta_path = Path(f"{self.path}.meta.json")
            meta_path.write_text(json.dumps(self._meta, indent=2))
        except Exception as e:
            logger.warning("turbovec[%s] persist error: %s", self.name, e)

    def stats(self) -> dict:
        return {
            "name":    self.name,
            "docs":    len(self._meta),
            "backend": "turbovec" if self._ready else "numpy",
            "dim":     self.dim,
            "bits":    QUANTIZE_BITS,
            "path":    self.path
        }


class TurboVecManager:
    """
    Manages all turbovec indices for Spiktor.
    Single access point for all vector operations.
    """

    _instances: dict[str, TurboVecIndex] = {}

    @classmethod
    def get(cls, name: str) -> TurboVecIndex:
        if name not in cls._instances:
            cls._instances[name] = TurboVecIndex(name)
        return cls._instances[name]

    @classmethod
    def all_stats(cls) -> dict:
        return {name: idx.stats() for name, idx in cls._instances.items()}

    @classmethod
    def preload_all(cls):
        """Initialize all known indices at startup."""
        for name in INDEX_REGISTRY:
            cls.get(name)
        logger.info("turbovec: %d indices ready", len(cls._instances))
