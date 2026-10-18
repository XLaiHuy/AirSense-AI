"""OpenAQ v3 Ingestion Adapter with API Key authentication and Rate Limit Throttling.
Rate limit: 100 requests / minute.
"""
from typing import Any, Dict, Optional
import httpx
from airsense_adapters.resilience import CircuitBreaker, TokenBucketRateLimiter, fetch_with_jitter_retry


class OpenAQAdapter:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.openaq.org/v3",
        timeout_sec: float = 10.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_sec = timeout_sec
        self.circuit_breaker = CircuitBreaker("OpenAQ-v3", failure_threshold=5, recovery_timeout_sec=60.0)
        # Giới hạn 100 requests/phút = ~1.6 req/s
        self.rate_limiter = TokenBucketRateLimiter(rate_per_second=1.6, capacity=10.0)

    async def fetch_latest_measurements(self, location_id: int) -> Dict[str, Any]:
        """Gọi OpenAQ v3 lấy số đo gần nhất của một trạm."""
        if not self.rate_limiter.acquire():
            raise RuntimeError("OpenAQ Client-side rate limit vượt ngưỡng cho phép (100 req/min)")

        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        url = f"{self.base_url}/locations/{location_id}/latest"

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()

        return await fetch_with_jitter_retry(
            _call,
            max_attempts=3,
            base_delay=1.5,
            circuit_breaker=self.circuit_breaker,
        )
