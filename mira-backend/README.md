# Mira 합의메커니즘 백엔드

Mira 합의메커니즘 시연 웹앱의 백엔드 API 서버입니다.

## 📋 프로젝트 개요

이 백엔드는 다음 기능을 제공합니다:

- ✅ T001: 프로젝트 초기 설정 및 인프라 구축
- ✅ T002: AI API 연동 시스템 (Gemini API 통합)
- ✅ T003: 질문 입력 및 검증 시스템
- ✅ T004: AI 답변 생성 시스템
- ✅ T005: 명제 분할 시스템 (Gemini API를 통한 답변 분할 및 시각화)
- 🚧 T006: 9개 검증자 병렬 시스템 (예정)

## 🛠 기술 스택

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.x
- **Language**: TypeScript 5.7.x
- **AI API**: Google Gemini (분리된 API 키 사용)
- **Validation**: 커스텀 질문 검증 로직
- **Security**: Rate Limiting, CORS 설정

## 🚀 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# 서버 설정
PORT=3001
NODE_ENV=development

# Gemini API 키 (답변 생성용)
GEMINI_ANSWER_API_KEY=your_gemini_api_key_for_answers

# Gemini API 키 (명제 분할 및 검증용)
GEMINI_VERIFY_API_KEY=your_gemini_api_key_for_verification

# CORS 설정
CORS_ORIGIN=http://localhost:3000

# Rate Limiting 설정
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AI_MAX_REQUESTS=20
RATE_LIMIT_VERIFY_MAX_REQUESTS=50
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 프로덕션 빌드 및 실행

```bash
npm run build
npm start
```

## 📡 API 엔드포인트

### 질문 관련

- `POST /api/question` - 질문 검증 및 저장
- `POST /api/generate` - AI 답변 생성

### 명제 분할 (T005 신규)

- `POST /api/split` - 답변을 검증 가능한 명제들로 분할

### 검증 관련 (T006에서 확장 예정)

- `POST /api/verify-single` - 단일 명제 검증 (개발/테스트용)
- `POST /api/verify` - 9개 검증자 병렬 검증 (구조만 구현)
- `GET /api/progress` - 검증 진행률 확인
- `GET /api/consensus` - 합의 결과 조회

### 시스템

- `GET /api/status` - 서비스 상태 확인

## 🔧 서비스 구조

### Gemini 서비스 팩토리

- **GeminiAnswerService**: 답변 생성 전용 (별도 API 키)
- **GeminiVerifyService**: 명제 분할 및 검증 전용 (별도 API 키)

### 미들웨어

- **Rate Limiting**: API 종류별 차등 제한
- **CORS**: 프론트엔드 연동 허용
- **에러 핸들링**: 전역 에러 처리

## 🧪 테스트

```bash
# 단일 API 테스트
node test-api.js

# 서비스 상태 확인
curl http://localhost:3001/api/status
```

## 📝 명제 분할 시스템 (T005)

### 기능 설명

- AI 답변을 검증 가능한 독립적인 명제들로 자동 분할
- 각 명제는 사실/거짓으로 판단 가능한 구체적인 문장
- Gemini API의 낮은 temperature(0.1) 설정으로 일관된 결과 보장

### 예시

**입력 답변**: "토끼는 달릴 수 있고, 하늘을 날 수 있다."
**분할 결과**:

- 토끼는 달릴 수 있다
- 토끼는 하늘을 날 수 있다

### API 사용법

```bash
curl -X POST http://localhost:3001/api/split \
  -H "Content-Type: application/json" \
  -d '{
    "answerId": "a_123456789",
    "answer": "토끼는 달릴 수 있고, 하늘을 날 수 있다."
  }'
```

## 🔮 다음 단계 (T006)

9개 검증자 병렬 시스템 구현 예정:

- 각 명제에 대해 9개의 독립적인 Gemini API 호출
- 3x3 그리드 형태의 검증자 배치
- 실시간 검증 진행률 추적
- 과반수(5/9) 기준 합의 메커니즘
