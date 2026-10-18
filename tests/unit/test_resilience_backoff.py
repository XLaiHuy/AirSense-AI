"""Unit tests for Circuit Breaker, Exponential Backoff, and Rate Limiting."""
import asyncio
import time
import pytest
from airsense_adapters.resilience import (
    BreakerState,
    CircuitBreaker,
    TokenBucketRateLimiter,
    fetch_with_jitter_retry,
)


def test_circuit_breaker_state_transitions():
    """Kiểm tra máy trạng thái Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)."""
    breaker = CircuitBreaker("test-service", failure_threshold=3, recovery_timeout_sec=0.1)
    assert breaker.state == BreakerState.CLOSED
    assert breaker.can_execute() is True

    # Ghi nhận 2 lần lỗi -> vẫn CLOSED
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.state == BreakerState.CLOSED

    # Lần lỗi thứ 3 -> Chuyển sang OPEN
    breaker.record_failure()
    assert breaker.state == BreakerState.OPEN
    assert breaker.can_execute() is False

    # Chờ hết thời gian recovery_timeout (0.1s)
    time.sleep(0.12)
    assert breaker.can_execute() is True
    assert breaker.state == BreakerState.HALF_OPEN

    # Lần gọi thử nghiệm thành công -> Quay lại CLOSED
    breaker.record_success()
    assert breaker.state == BreakerState.CLOSED
    assert breaker.failure_count == 0


def test_token_bucket_rate_limiter():
    """Kiểm tra cơ chế Token Bucket Rate Limiting."""
    limiter = TokenBucketRateLimiter(rate_per_second=2.0, capacity=2.0)
    assert limiter.acquire(1.0) is True
    assert limiter.acquire(1.0) is True
    # Hết token trong khoang -> từ chối
    assert limiter.acquire(1.0) is False

    # Chờ 0.5s để hồi 1 token
    time.sleep(0.55)
    assert limiter.acquire(1.0) is True


@pytest.mark.asyncio
async def test_fetch_with_jitter_retry_success():
    """Kiểm tra cơ chế retry khi có lỗi tạm thời và sau đó thành công."""
    attempts = 0

    async def flaky_fn():
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise ConnectionError("Lỗi kết nối mạng giả lập")
        return {"status": "ok"}

    result = await fetch_with_jitter_retry(flaky_fn, max_attempts=3, base_delay=0.01)
    assert result == {"status": "ok"}
    assert attempts == 2
