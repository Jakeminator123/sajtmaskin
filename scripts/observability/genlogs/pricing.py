# -*- coding: utf-8 -*-
"""Tokenvolym → pengar med `config/ai_models/pricing.json` som enda prisägare.

Matchningsreglerna speglar `scripts/db/generation-cost-price.mjs` /
`src/lib/billing/model-cost.ts`: provider-prefix strippas och längsta
`match`-strängen vinner, så `gpt-5` aldrig skuggar `gpt-5.5`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PRICING_REL_PATH = "config/ai_models/pricing.json"
DEFAULT_TIER = "standard"

_PROVIDER_PREFIXES = ("openai/", "anthropic-direct/", "anthropic/")


def normalize_model_id(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    for prefix in _PROVIDER_PREFIXES:
        if value.startswith(prefix):
            value = value[len(prefix) :]
            break
    return value


@dataclass
class ModelPrice:
    key: str
    label: str
    provider: str
    input_per_1m: float
    output_per_1m: float
    cached_input_per_1m: float | None
    estimated: bool


class PricingTable:
    def __init__(self, raw: dict[str, Any] | None, *, error: str | None = None) -> None:
        self._raw = raw or {}
        self.error = error
        self.tier = DEFAULT_TIER

    @classmethod
    def load(cls, repo_root: Path) -> "PricingTable":
        path = repo_root / PRICING_REL_PATH
        try:
            return cls(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as exc:
            return cls(None, error=f"{PRICING_REL_PATH}: {exc}")

    @property
    def verified_at(self) -> str | None:
        value = self._raw.get("verifiedAt")
        return str(value) if value else None

    @property
    def usd_to_sek(self) -> float:
        fx = self._raw.get("fx") or {}
        try:
            return float(fx.get("usdToSek") or 0) or 0.0
        except (TypeError, ValueError):
            return 0.0

    def price_for_model(self, raw_model: Any, *, tier: str = DEFAULT_TIER) -> ModelPrice | None:
        normalized = normalize_model_id(raw_model)
        if not normalized:
            return None
        models = self._raw.get("models") or {}
        best_key: str | None = None
        best_len = 0
        for key, entry in models.items():
            if not isinstance(entry, dict):
                continue
            candidates = entry.get("match") or [key]
            if not isinstance(candidates, list):
                candidates = [key]
            for candidate in candidates:
                text = str(candidate).lower()
                if text and text in normalized and len(text) > best_len:
                    best_key, best_len = key, len(text)
        if best_key is None:
            return None
        entry = models[best_key]
        tiers = entry.get("tiers") or {}
        rates = tiers.get(tier) or tiers.get(DEFAULT_TIER) or {}
        try:
            input_rate = float(rates.get("input"))
        except (TypeError, ValueError):
            return None
        # Embedding-modeller har `output: null` i pricing.json — de producerar
        # inga output-tokens. Utan den här nollan blev de tysta "utan pris".
        output_raw = rates.get("output")
        try:
            output_rate = float(output_raw) if output_raw is not None else 0.0
        except (TypeError, ValueError):
            output_rate = 0.0
        cached_raw = rates.get("cachedInput")
        try:
            cached_rate = float(cached_raw) if cached_raw is not None else None
        except (TypeError, ValueError):
            cached_rate = None
        return ModelPrice(
            key=best_key,
            label=str(entry.get("label") or best_key),
            provider=str(entry.get("provider") or "okänd"),
            input_per_1m=input_rate,
            output_per_1m=output_rate,
            cached_input_per_1m=cached_rate,
            estimated=bool(entry.get("estimated")),
        )

    def cost_usd(
        self,
        raw_model: Any,
        *,
        prompt_tokens: int,
        completion_tokens: int,
        cached_input_tokens: int = 0,
        tier: str = DEFAULT_TIER,
    ) -> tuple[float | None, ModelPrice | None]:
        """USD för en tokenvolym. `None` när modellen saknar pris."""
        price = self.price_for_model(raw_model, tier=tier)
        if price is None:
            return None, None
        cached = max(0, min(int(cached_input_tokens or 0), int(prompt_tokens or 0)))
        uncached = max(0, int(prompt_tokens or 0) - cached)
        cached_rate = (
            price.cached_input_per_1m if price.cached_input_per_1m is not None else price.input_per_1m
        )
        usd = (
            uncached * price.input_per_1m
            + cached * cached_rate
            + max(0, int(completion_tokens or 0)) * price.output_per_1m
        ) / 1_000_000
        return usd, price

    def to_sek(self, usd: float | None) -> float | None:
        if usd is None:
            return None
        rate = self.usd_to_sek
        return round(usd * rate, 4) if rate else None
