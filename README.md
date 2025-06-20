# MIRA - Multi-validator Intelligent Reliability Assessment

> **M**ulti-validator **I**ntelligent **R**eliability **A**ssessment  
> A revolutionary verification platform where 16 specialized AI validators collaboratively verify answers

![MIRA System](https://img.shields.io/badge/MIRA-v2.0-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-15-blue) ![Express](https://img.shields.io/badge/Express-4.x-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## Project Overview

MIRA is an advanced AI verification system that splits complex questions into multiple propositions and employs 16 specialized AI validators to examine each proposition from different perspectives, providing reliable and trustworthy answers.

### Core Features

- **Intelligent Proposition Splitting**: Decomposes complex questions into logical verification units
- **16 Specialized Validators**: Expert validators across Logic, Facts, Context, and Comprehensive analysis domains
- **Real-time Progress Tracking**: Live verification status monitoring via Server-Sent Events (SSE)
- **Professional UI/UX**: Clean and intuitive interface designed for optimal user experience
- **Backend-Frontend Synchronization**: Perfect state synchronization between frontend and backend systems

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │     Backend      │    │  Gemini AI      │
│   (Next.js)     │◄──►│   (Express.js)   │◄──►│   Service       │
│                 │    │                  │    │                 │
│ • React 19      │    │ • TypeScript     │    │ • 16 Validators │
│ • TypeScript    │    │ • Rate Limiting  │    │ • Batch Process │
│ • Tailwind CSS  │    │ • SSE Streaming  │    │ • Error Retry   │
│ • Framer Motion │    │ • Progress Track │    │ • Consensus     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Validator System

### 16 Specialized Validators (4x4 Grid)

| **Logic Validators**    | **Fact Validators**  | **Context Validators**  | **Comprehensive Validators** |
| ----------------------- | -------------------- | ----------------------- | ---------------------------- |
| Logical Consistency     | Factual Accuracy     | Context Appropriateness | Bias Detection               |
| Causal Relationship     | Data Verification    | Historical Background   | Completeness                 |
| Reasoning Validity      | Statistical Analysis | Cultural Context        | Reliability                  |
| Contradiction Detection | Source Verification  | Domain Expertise        | Overall Assessment           |

### Verification Process

1. **Question Input** → User submits their inquiry
2. **AI Answer Generation** → Gemini AI generates comprehensive response
3. **Proposition Splitting** → Answer decomposed into verifiable units
4. **16-Validator Execution** → Concurrent verification across specialized domains
5. **Consensus Analysis** → Results aggregation and confidence calculation
6. **Final Results** → Verified answer with reliability metrics

## Recent Updates (2024)

### Backend-Frontend Synchronization Resolution

**Problem**: Frontend displaying failure status while backend was still processing
**Solution**:

- Smart error processing (distinguishing timeout vs actual errors)
- Real-time backend status monitoring
- Periodic status checks (5-second intervals)
- User-friendly status indicators

### Technical Improvements

```typescript
// Smart Error Processing
if (err.name === "AbortError") {
  shouldFailAllValidators = false; // Maintain state
} else if (err.message.includes("rate limit")) {
  shouldFailAllValidators = false; // Maintain state during rate limiting
}

// Backend Status Monitoring
const checkBackendStatus = async () => {
  const response = await fetch(`/api/progress/status/${sessionId}`);
  // Real-time status updates
};
```

## Project Structure

```
diagram/
├── docs/                      # Project documentation and wireframes
├── mira-backend/             # Express.js backend server
│   ├── src/
│   │   ├── routes/api.ts     # Main API routes
│   │   ├── services/gemini.ts# Gemini AI service
│   │   └── middleware/       # Middleware (Rate Limiting)
│   └── package.json
├── mira-frontend/            # Next.js frontend
│   ├── app/
│   │   ├── components/       # React components
│   │   │   ├── VerificationProcessV2.tsx  # Main verification process
│   │   │   ├── ui/           # UI components
│   │   │   └── ...
│   │   ├── api/              # Next.js API routes
│   │   └── hooks/            # Custom React hooks
│   └── package.json
└── README.md                 # This document
```

## Installation and Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Gemini AI API key

### 1. Clone Repository

```bash
git clone <repository-url>
cd diagram
```

### 2. Backend Setup

```bash
cd mira-backend
npm install

# Environment configuration
echo "GEMINI_API_KEY=your-gemini-api-key" > .env
echo "PORT=3001" >> .env

npm run dev
```

### 3. Frontend Setup

```bash
cd mira-frontend
npm install

# Environment configuration
echo "BACKEND_URL=http://localhost:3001" > .env.local

npm run dev
```

### 4. Access Application

```
http://localhost:3000
```

## Usage Guide

### Basic Usage

1. **Question Input**: Submit your inquiry in natural language
2. **AI Response Generation**: Wait for Gemini AI to generate response
3. **Proposition Review**: Observe answer decomposition into logical units
4. **Verification Process**: Monitor real-time validation by 16 validators
5. **Results Analysis**: Review verified answer with confidence metrics

### Validator Status Reference

| Status    | Display          | Meaning                     |
| --------- | ---------------- | --------------------------- |
| Pending   | Gray             | Awaiting verification       |
| Verifying | Blue + Animation | Currently under validation  |
| True      | Green            | Proposition verified true   |
| False     | Red              | Proposition verified false  |
| Failed    | Gray             | Verification error occurred |

## API Documentation

### Core Endpoints

- `POST /api/question` - Submit question for validation
- `POST /api/generate` - Generate AI response
- `POST /api/split` - Split answer into propositions
- `POST /api/verify-v2` - Execute 16-validator verification
- `GET /api/progress/status/:sessionId` - Get real-time status

### Response Format

```typescript
interface VerificationResult {
  success: boolean;
  results: {
    proposition: string;
    validators: Array<{
      validatorId: number;
      isTrue: boolean;
      confidence: number;
      reasoning: string;
    }>;
  }[];
  consensus: {
    overallResult: boolean;
    confidence: number;
    agreement: number;
  };
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Experience more reliable AI answers with MIRA's advanced verification system.**
