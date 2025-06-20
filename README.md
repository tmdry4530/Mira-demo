# 🌈 MIRA - 똑똑한 AI 검증 시스템

> **M**ulti-validator **I**ntelligent **R**eliability **A**ssessment  
> 16명의 똑똑한 AI 검증자들이 함께 답을 확인하는 혁신적인 검증 플랫폼

![MIRA System](https://img.shields.io/badge/MIRA-v2.0-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-14-blue) ![Express](https://img.shields.io/badge/Express-4.x-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## 🎯 프로젝트 개요

MIRA는 질문을 여러 명제로 분할하고, 16개의 전문 AI 검증자가 각각 다른 관점에서 검증하여 신뢰할 수 있는 답변을 제공하는 시스템입니다.

### ✨ 핵심 기능

- 🧠 **지능적 명제 분할**: 복잡한 질문을 논리적 단위로 분해
- 🔍 **16개 전문 검증자**: 논리, 사실, 맥락, 종합 분야별 전문가
- 📊 **실시간 진행률 추적**: SSE를 통한 실시간 검증 상태 모니터링
- 🎨 **아름다운 UI/UX**: 어린이도 쉽게 사용할 수 있는 친근한 인터페이스
- 🔄 **백엔드 상태 동기화**: 프론트엔드-백엔드 간 완벽한 상태 동기화

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │     Backend      │    │  Gemini AI      │
│   (Next.js)     │◄──►│   (Express.js)   │◄──►│   Service       │
│                 │    │                  │    │                 │
│ • React 18      │    │ • TypeScript     │    │ • 16 Validators │
│ • TypeScript    │    │ • Rate Limiting  │    │ • Batch Process │
│ • Tailwind CSS  │    │ • SSE Streaming  │    │ • Error Retry   │
│ • Framer Motion │    │ • Progress Track │    │ • Consensus     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🎪 검증자 시스템

### 16개 전문 검증자 (4x4 그리드)

| 🧠 **논리적 검증자** | 📊 **사실 검증자** | 🌐 **맥락 검증자** | 🎯 **종합 검증자** |
| -------------------- | ------------------ | ------------------ | ------------------ |
| 논리적 일관성        | 사실 정확성        | 맥락 적합성        | 편향성             |
| 인과관계             | 데이터             | 시대적 배경        | 완전성             |
| 추론 타당성          | 통계               | 문화적 맥락        | 신뢰성             |
| 모순 탐지            | 출처               | 전문 분야          | 종합 평가          |

### 🔄 검증 프로세스

1. **질문 입력** → 사용자가 궁금한 것을 입력
2. **AI 답변 생성** → Gemini AI가 상세한 답변 생성
3. **명제 분할** → 답변을 검증 가능한 단위로 분해
4. **16개 검증자 실행** → 각 전문 분야별 동시 검증
5. **합의 분석** → 검증 결과 종합 및 신뢰도 계산
6. **최종 결과** → 검증된 답변과 신뢰도 제공

## 🚀 최근 업데이트 (2024)

### ✅ 백엔드-프론트엔드 동기화 문제 해결

- **문제**: 백엔드가 처리 중인데 프론트엔드에서 실패로 표시
- **해결**:
  - 🔍 스마트 에러 처리 (타임아웃 vs 실제 오류 구분)
  - 📡 실시간 백엔드 상태 모니터링
  - ⏰ 주기적 상태 체크 (5초 간격)
  - 🎯 사용자 친화적 상태 표시

### 🛠️ 기술적 개선사항

```typescript
// 스마트 에러 처리
if (err.name === "AbortError") {
  shouldFailAllValidators = false; // 상태 유지
} else if (err.message.includes("rate limit")) {
  shouldFailAllValidators = false; // Rate limit 시 상태 유지
}

// 백엔드 상태 모니터링
const checkBackendStatus = async () => {
  const response = await fetch(`/api/progress/status/${sessionId}`);
  // 실시간 상태 업데이트
};
```

## 📁 프로젝트 구조

```
diagram/
├── 📖 docs/                    # 프로젝트 문서 및 와이어프레임
├── 🔧 mira-backend/           # Express.js 백엔드 서버
│   ├── src/
│   │   ├── routes/api.ts      # 메인 API 라우트
│   │   ├── services/gemini.ts # Gemini AI 서비스
│   │   └── middleware/        # 미들웨어 (Rate Limiting)
│   └── package.json
├── 🎨 mira-frontend/          # Next.js 프론트엔드
│   ├── app/
│   │   ├── components/        # React 컴포넌트
│   │   │   ├── VerificationProcessV2.tsx  # 메인 검증 프로세스
│   │   │   ├── ui/            # UI 컴포넌트
│   │   │   └── ...
│   │   ├── api/               # Next.js API 라우트
│   │   └── hooks/             # 커스텀 React 훅
│   └── package.json
└── 📋 README.md               # 이 문서
```

## 🔧 설치 및 실행

### 필요 조건

- Node.js 18.0.0 이상
- npm 또는 yarn
- Gemini AI API 키

### 1️⃣ 저장소 클론

```bash
git clone <repository-url>
cd diagram
```

### 2️⃣ 백엔드 설정

```bash
cd mira-backend
npm install

# 환경 변수 설정
echo "GEMINI_API_KEY=your-gemini-api-key" > .env
echo "PORT=3001" >> .env

npm run dev
```

### 3️⃣ 프론트엔드 설정

```bash
cd mira-frontend
npm install

# 환경 변수 설정
echo "BACKEND_URL=http://localhost:3001" > .env.local

npm run dev
```

### 4️⃣ 브라우저에서 확인

```
http://localhost:3000
```

## 🎮 사용 방법

### 🌟 기본 사용법

1. **질문 입력**: 궁금한 것을 자연어로 입력
2. **AI 답변 대기**: Gemini AI가 답변 생성
3. **명제 분할 확인**: 답변이 논리적 단위로 분해됨
4. **검증 과정 관찰**: 16개 검증자가 실시간으로 검증
5. **결과 확인**: 검증된 답변과 신뢰도 확인

### 🔍 검증자 상태 이해하기

| 상태      | 표시                | 의미                    |
| --------- | ------------------- | ----------------------- |
| ⏸️ 대기   | 회색                | 검증 시작 전            |
| 🔍 검증중 | 파란색 + 애니메이션 | 현재 검증 진행 중       |
| ✅ 참     | 초록색              | 명제가 참으로 판단      |
| ❌ 거짓   | 빨간색              | 명제가 거짓으로 판단    |
| ⚠️ 실패   | 회색                | 검증 과정에서 오류 발생 |

---

<div align="center">

**🌟 MIRA로 더 신뢰할 수 있는 AI 답변을 경험하세요! 🌟**

[![GitHub stars](https://img.shields.io/github/stars/your-repo/mira?style=social)](https://github.com/tmdry4530/Mira-demo)
[![Follow on Twitter](https://img.shields.io/twitter/follow/your-handle?style=social)](https://twitter.com/_chamdom_)

</div>
