"""Resilience primitives for API Ingestion: Circuit Breaker, Exponential Backoff with Jitter, and Rate Limiting.
Conforms strictly to the Fault-Tolerance specifications in Section 4.2 of the Blueprint.
"""
import asyncio
from enum import Enum
import random
import time
from typing import Any, Callable, Optional


class BreakerState(str, Enum):
    CLOSED = "CLOSED"         # Bình thường, cho phép request đi qua
    OPEN = "OPEN"             # Đã ngắt mạch, chặn gọi upstream và trả fallback
    HALF_OPEN = "HALF_OPEN"   # Thử nghiệm 1 request thăm dò sau thời gian cooldown


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_sec: float = 60.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec
        self.state = BreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0

    def can_execute(self) -> bool:
        """Kiểm tra mạch có cho phép gọi upstream hay không."""
        if self.state == BreakerState.OPEN:
            now = time.time()
            if now - self.last_failure_time >= self.recovery_timeout_sec:
                self.state = BreakerState.HALF_OPEN
                return True
            return False
        return True

    def record_success(self):
        """Ghi nhận thành công, đóng mạch hoàn toàn."""
        self.failure_count = 0
        self.state = BreakerState.CLOSED

    def record_failure(self):
        """Ghi nhận thất bại, mở mạch nếu vượt ngưỡng."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = BreakerState.OPEN


class TokenBucketRateLimiter:
    """Token Bucket rate limiter cho client-side quota budget."""
    def __init__(self, rate_per_second: float, capacity: float):
        self.rate = rate_per_second
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.time()

    def acquire(self, tokens: float = 1.0) -> bool:
        now = time.time()
        elapsed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_update = now

        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False


async def fetch_with_jitter_retry(
    fetch_fn: Callable[[], Any],
    max_attempts: int = 4,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    circuit_breaker: Optional[CircuitBreaker] = None,
) -> Any:
    """Thực thi hàm gọi API bất đồng bộ với cơ chế Exponential Backoff có Full Jitter."""
    if circuit_breaker and not circuit_breaker.can_execute():
        raise RuntimeError(
            f"Circuit Breaker '{circuit_breaker.name}' đang ở trạng thái OPEN. Yêu cầu fallback."
        )

    for attempt in range(max_attempts):
        try:
            result = await fetch_fn()
            if circuit_breaker:
                circuit_breaker.record_success()
            return result
        except Exception as err:
            if circuit_breaker:
                circuit_breaker.record_failure()

            if attempt == max_attempts - 1:
                raise err

            # Tính thời gian chờ có Full Jitter: T = min(max_delay, base * 2^attempt) * random(0.5, 1.5)
            delay = min(max_delay, base_delay * (2 ** attempt))
            jitter = random.uniform(0.5, 1.5)
            sleep_time = delay * jitter
            await asyncio.sleep(sleep_time)
