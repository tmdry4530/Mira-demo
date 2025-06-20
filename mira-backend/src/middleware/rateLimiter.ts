import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

// Rate Limiter 클래스 (Gemini API 할당량 관리)
export class RateLimiter {
  private requestCount: number = 0;
  private resetTime: Date = new Date();
  private readonly requestsPerMinute: number;
  private readonly resetIntervalMs: number = 60000; // 1분

  constructor(requestsPerMinute: number = 20) {
    // 기존 12에서 20으로 증가
    this.requestsPerMinute = requestsPerMinute;
    this.resetCounter();
  }

  private resetCounter() {
    this.requestCount = 0;
    this.resetTime = new Date(Date.now() + this.resetIntervalMs);

    // 자동 리셋 타이머
    setTimeout(() => {
      this.resetCounter();
    }, this.resetIntervalMs);
  }

  async waitForSlot(): Promise<void> {
    // 카운터가 리셋되었는지 확인
    if (Date.now() >= this.resetTime.getTime()) {
      this.resetCounter();
    }

    // 요청 한도에 도달했으면 대기
    if (this.requestCount >= this.requestsPerMinute) {
      const waitTime = this.resetTime.getTime() - Date.now();
      console.log(
        `🚦 Rate limit 도달. ${Math.ceil(waitTime / 1000)}초 대기...`
      );

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // 카운터 리셋
      this.resetCounter();
    }

    this.requestCount++;
    console.log(
      `📊 Rate limiter: ${this.requestCount}/${this.requestsPerMinute} 요청 사용됨`
    );
  }

  getStatus() {
    return {
      currentCount: this.requestCount,
      limit: this.requestsPerMinute,
      resetTime: this.resetTime,
      remainingRequests: Math.max(
        0,
        this.requestsPerMinute - this.requestCount
      ),
    };
  }
}

// 전역 Rate Limiter 인스턴스 (더 빠른 설정)
export const globalRateLimiter = new RateLimiter(20); // 분당 20개 요청

// 지수 백오프 유틸리티 (더 빠른 재시도)
export class ExponentialBackoff {
  private attempt: number = 0;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    maxAttempts: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 10000
  ) {
    this.maxAttempts = maxAttempts;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    while (this.attempt < this.maxAttempts) {
      try {
        // Rate limiting 적용
        await globalRateLimiter.waitForSlot();

        const result = await fn();

        // 성공하면 attempt 리셋
        this.attempt = 0;
        return result;
      } catch (error: any) {
        this.attempt++;

        // 429 오류 (Too Many Requests) 특별 처리
        if (error?.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // 30초 기본값으로 감소

          console.log(
            `⚠️ 429 오류 발생. ${waitTime / 1000}초 대기 후 재시도... (시도 ${
              this.attempt
            }/${this.maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // 마지막 시도였다면 오류 던지기
        if (this.attempt >= this.maxAttempts) {
          console.error(
            `❌ 최대 재시도 횟수 초과 (${this.maxAttempts}번): ${
              error?.message || error
            }`
          );
          throw error;
        }

        // 지수 백오프 대기 (더 빠른 설정)
        const delay = Math.min(
          this.baseDelayMs * Math.pow(1.5, this.attempt - 1), // 지수를 2에서 1.5로 감소
          this.maxDelayMs
        );

        console.log(
          `🔄 재시도 ${this.attempt}/${this.maxAttempts}: ${delay}ms 대기 후 재시도...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`최대 재시도 횟수 초과: ${this.maxAttempts}번`);
  }

  reset() {
    this.attempt = 0;
  }
}

// Express Rate Limiting Middleware
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // IP당 최대 1000개 요청 (증가)
  message: {
    error: "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const verificationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 50, // 검증 요청은 분당 50개까지 (증가)
  message: {
    error: "검증 요청이 너무 많습니다. 1분 후 다시 시도해주세요.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 커스텀 Rate Limiting 미들웨어 (더 관대한 설정)
export const customRateLimit = (windowMs: number, maxRequests: number) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: `요청 한도 초과. ${windowMs / 1000}초 후 다시 시도해주세요.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

/**
 * 개발 환경에서는 Rate Limiting을 비활성화하는 옵션
 */
export const createConditionalRateLimit = (limiter: any) => {
  return (req: any, res: any, next: any) => {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DISABLE_RATE_LIMIT === "true"
    ) {
      return next();
    }
    return limiter(req, res, next);
  };
};

/**
 * Rate Limiter 상태 정보 반환
 */
export const getRateLimitInfo = () => {
  return {
    general: {
      windowMs: 15 * 60 * 1000,
      max: 1000,
      windowMinutes: 15,
    },
    verification: {
      windowMs: 60 * 1000,
      max: 50,
      windowMinutes: 1,
    },
    disabled:
      process.env.NODE_ENV === "development" &&
      process.env.DISABLE_RATE_LIMIT === "true",
  };
};
