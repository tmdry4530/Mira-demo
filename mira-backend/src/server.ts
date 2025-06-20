import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import apiRoutes from "./routes/api";
import { generalRateLimit, getRateLimitInfo } from "./middleware/rateLimiter";

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Gemini API 키 설정 검증
const GEMINI_ANSWER_API_KEY = process.env.GEMINI_ANSWER_API_KEY;
const GEMINI_VERIFY_API_KEY = process.env.GEMINI_VERIFY_API_KEY;

if (!GEMINI_ANSWER_API_KEY || !GEMINI_VERIFY_API_KEY) {
  console.warn(
    "⚠️  Gemini API 키가 설정되지 않았습니다. 일부 기능이 제한될 수 있습니다."
  );
  console.warn(
    "   GEMINI_ANSWER_API_KEY:",
    GEMINI_ANSWER_API_KEY ? "✅ 설정됨" : "❌ 미설정"
  );
  console.warn(
    "   GEMINI_VERIFY_API_KEY:",
    GEMINI_VERIFY_API_KEY ? "✅ 설정됨" : "❌ 미설정"
  );
}

// 미들웨어 설정
app.use(
  helmet({
    // SSE를 위한 보안 헤더 설정
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    // SSE를 위한 헤더 허용
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    exposedHeaders: ["Cache-Control"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate Limiting 적용 (SSE 엔드포인트는 제외)
app.use((req, res, next) => {
  // SSE 엔드포인트는 Rate Limiting 제외
  if (req.path === "/api/progress/stream") {
    return next();
  }
  return generalRateLimit(req, res, next);
});

// 기본 라우트
app.get("/", (req, res) => {
  res.json({
    message: "Mira 합의메커니즘 API 서버가 실행 중입니다.",
    version: "1.0.0",
    status: "running",
    features: {
      sse: "enabled",
      realtime: "enabled",
    },
    apiKeys: {
      answerGeneration: GEMINI_ANSWER_API_KEY ? "configured" : "missing",
      propositionAndVerify: GEMINI_VERIFY_API_KEY ? "configured" : "missing",
    },
  });
});

// Health Check 엔드포인트
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    apiKeys: {
      answerGeneration: GEMINI_ANSWER_API_KEY ? "ok" : "missing",
      propositionAndVerify: GEMINI_VERIFY_API_KEY ? "ok" : "missing",
    },
  });
});

// API 라우트 연결
app.use("/api", apiRoutes);

// Rate Limiter 정보 조회
app.get("/rate-limit-info", (req, res) => {
  res.json({
    success: true,
    rateLimits: getRateLimitInfo(),
  });
});

// 404 핸들러
app.use("*", (req, res) => {
  res.status(404).json({
    error: "API 엔드포인트를 찾을 수 없습니다.",
    path: req.originalUrl,
  });
});

// 에러 핸들러
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Server Error:", err);
    res.status(500).json({
      error: "서버 내부 오류가 발생했습니다.",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 Mira API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`API 키 상태:`);
  console.log(
    `  - 답변 생성용: ${GEMINI_ANSWER_API_KEY ? "✅ 설정됨" : "❌ 미설정"}`
  );
  console.log(
    `  - 명제 분할/검증용: ${GEMINI_VERIFY_API_KEY ? "✅ 설정됨" : "❌ 미설정"}`
  );
});
