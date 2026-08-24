"""
The "agent-readable catalog" half of the AI Growth & Agentic Commerce brief.

This is intentionally a plain, structured JSON feed rather than something an
agent has to scrape off HTML - this is the same principle ACP's product feed
spec and Google's AP2 rely on: agents transact reliably with merchants that
publish structured, machine-readable product + policy data, not with
merchants that only render pixels for humans.
"""
from __future__ import annotations
import json
from typing import Optional
from backend.config import CATALOG_PATH
from backend.models import Product


def _load() -> list[Product]:
    with open(CATALOG_PATH, "r") as f:
        raw = json.load(f)
    return [Product(**item) for item in raw]


def search_products(
    query: Optional[str] = None,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    limit: int = 10,
) -> list[Product]:
    products = _load()
    results = []
    for p in products:
        if query:
            haystack = " ".join([p.name, p.description, *p.tags]).lower()
            # AND-match: every word in the query must appear somewhere in the
            # product's text, not the whole query as one contiguous phrase -
            # "jbl speaker" should still match "JBL Go 3 Portable Speaker".
            query_words = query.lower().split()
            if not all(word in haystack for word in query_words):
                continue
        if category and p.category != category:
            continue
        if max_price is not None and p.price > max_price:
            continue
        results.append(p)
    return results[:limit]


def get_product(product_id: str) -> Optional[Product]:
    for p in _load():
        if p.id == product_id:
            return p
    return None
