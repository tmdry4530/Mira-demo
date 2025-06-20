import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ExponentialBackoff,
  globalRateLimiter,
} from "../middleware/rateLimiter";

// Gemini API 클라이언트 인터페이스
interface GeminiConfig {
  apiKey: string;
  modelName?: string;
  temperature?: number;
  maxRetries?: number;
  baseRetryDelay?: number;
  batchSize?: number;
  batchDelay?: number;
}

// API 응답 타입 정의
export interface GeminiResponse {
  success: boolean;
  data?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
}

// 명제 분할 응답 타입
export interface PropositionSplitResponse {
  success: boolean;
  propositions?: string[];
  error?: string;
}

// 검증 응답 타입
export interface VerificationResponse {
  success: boolean;
  isTrue?: boolean;
  confidence?: number;
  reasoning?: string;
  error?: string;
}

/**
 * Rate Limiter 클래스
 */
class RateLimiter {
  private static requestCount = 0;
  private static lastResetTime = Date.now();
  private static readonly REQUEST_LIMIT = 12; // 분당 요청 제한 (여유를 둠)
  private static readonly RESET_INTERVAL = 60000; // 1분

  static async checkAndWait(): Promise<void> {
    const now = Date.now();

    // 1분이 지나면 카운터 리셋
    if (now - this.lastResetTime >= this.RESET_INTERVAL) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    // 요청 제한에 도달했으면 대기
    if (this.requestCount >= this.REQUEST_LIMIT) {
      const waitTime = this.RESET_INTERVAL - (now - this.lastResetTime);
      console.log(
        `🕐 Rate limit 도달. ${Math.ceil(waitTime / 1000)}초 대기 중...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime + 1000));
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }

    this.requestCount++;
  }
}

/**
 * Gemini API 기본 클래스
 */
class BaseGeminiService {
  protected genAI: GoogleGenerativeAI;
  protected model: any;
  protected maxRetries: number;
  protected baseRetryDelay: number;

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error("Gemini API 키가 제공되지 않았습니다.");
    }

    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.modelName || "gemini-2.5-flash-lite-preview-06-17",
    });
    this.maxRetries = config.maxRetries || 3;
    this.baseRetryDelay = config.baseRetryDelay || 2000;
  }

  /**
   * 지수 백오프와 rate limiting이 포함된 API 호출
   */
  protected async callWithRetry(prompt: string): Promise<GeminiResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Rate limiting 확인 및 대기
        await RateLimiter.checkAndWait();

        console.log(`🔄 Gemini API 호출 시도 ${attempt}/${this.maxRetries}`);

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 사용량 정보 추출 (가능한 경우)
        const usage = {
          promptTokens: 0, // Gemini API에서는 기본적으로 제공하지 않음
          candidatesTokens: 0,
          totalTokens: 0,
        };

        return {
          success: true,
          data: text,
          usage,
        };
      } catch (error: any) {
        lastError = error as Error;
        console.error(
          `❌ Gemini API 호출 실패 (시도 ${attempt}/${this.maxRetries}):`,
          error.message
        );

        // 429 오류인 경우 더 긴 대기 시간 적용
        let retryDelay = this.baseRetryDelay * Math.pow(2, attempt - 1); // 지수 백오프

        if (error.status === 429) {
          // 429 오류의 경우 더 긴 대기 시간
          retryDelay = Math.max(retryDelay, 45000); // 최소 45초 대기
          console.log(
            `⚠️ Rate limit 오류 감지. 긴 대기 시간 적용: ${retryDelay / 1000}초`
          );
        }

        // 마지막 시도가 아니면 재시도 전 대기
        if (attempt < this.maxRetries) {
          console.log(`⏳ ${retryDelay / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    return {
      success: false,
      error: `Gemini API 호출 실패: ${lastError?.message || "알 수 없는 오류"}`,
    };
  }
}

/**
 * 답변 생성용 Gemini 서비스
 */
export class GeminiAnswerService extends BaseGeminiService {
  constructor(apiKey: string) {
    super({
      apiKey,
      modelName: "gemini-2.5-flash-lite-preview-06-17",
      temperature: 0.7,
      maxRetries: 3,
      baseRetryDelay: 2000,
    });
  }

  /**
   * 사용자 질문에 대한 AI 답변 생성
   */
  async generateAnswer(question: string): Promise<GeminiResponse> {
    console.log("🤖 답변 생성 시작:", question);

    const prompt = `Please answer the following question in a simple and fun way, as if explaining to a 5-year-old child. Always respond in English.
🌟 Tone and Style:
- Use friendly and warm language
- Use simple words instead of difficult ones
- Include cute emojis and analogies
- Explain in 2-3 sentences clearly and concisely

Example Style:
- "You know what? 🌟"
- "Imagine! It's like ~ 😊"
- "Isn't that amazing? ✨"

Question: ${question}

Child-friendly answer in English:`;

    const response = await this.callWithRetry(prompt);

    if (response.success) {
      console.log("✅ 답변 생성 완료");
    } else {
      console.error("❌ 답변 생성 실패:", response.error);
    }

    return response;
  }
}

/**
 * 명제 분할 및 검증용 Gemini 서비스
 */
export class VerifyService {
  private model: any;
  private backoff: ExponentialBackoff;

  constructor(apiKey: string) {
    this.initializeModel(apiKey);
    this.backoff = new ExponentialBackoff(3, 500, 5000); // 더 빠른 재시도
  }

  private initializeModel(apiKey: string) {
    if (!apiKey) {
      console.error("❌ VerifyService: API 키가 제공되지 않았습니다");
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite-preview-06-17", // 2.5 Flash Lite Preview 모델로 변경
        generationConfig: {
          temperature: 0.1, // 기존 설정 유지
          maxOutputTokens: 200, // 응답 길이 제한으로 속도 향상
        },
      });
      console.log("✅ VerifyService: 모델 초기화 완료");
    } catch (error) {
      console.error("❌ VerifyService 초기화 실패:", error);
    }
  }

  // AI 답변을 검증 가능한 명제들로 분할
  async splitIntoPropositions(answer: string): Promise<any> {
    if (!this.model) {
      return {
        success: false,
        error: "VerifyService is not initialized",
      };
    }

    console.log("🔪 명제 분할 시작");

    const prompt = `Please split the following text into verifiable independent propositions (fact-checkable statements).
Each proposition should contain one specific fact and should be able to be judged as true/false.

Rules:
1. Write each proposition on one line
2. Start with "- " in list format
3. Exclude subjective opinions or ambiguous expressions
4. Include only specific and verifiable facts

Text: ${answer}

Proposition list:`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // 응답에서 명제들 추출
      const lines = responseText.split("\n");
      const propositions = lines
        .filter((line: string) => line.trim().startsWith("- "))
        .map((line: string) => line.trim().substring(2).trim())
        .filter((prop: string) => prop.length > 0);

      if (propositions.length === 0) {
        return {
          success: false,
          error: "Cannot extract propositions.",
        };
      }

      console.log(`✅ 명제 분할 완료: ${propositions.length}개 명제 생성`);
      return {
        success: true,
        propositions,
      };
    } catch (error) {
      console.error("❌ 명제 분할 중 오류:", error);
      return {
        success: false,
        error: `Proposition splitting error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  // 빠른 배치 검증 (9개를 한 번에)
  async verifyPropositions(propositions: string[]): Promise<any[]> {
    if (!this.model) {
      throw new Error("VerifyService is not initialized");
    }

    console.log(`🔍 배치 검증 시작: ${propositions.length}개 명제`);

    // 더 큰 배치로 처리 (9개씩)
    const BATCH_SIZE = 9; // 배치 크기 증가
    const BATCH_DELAY = 1500; // 배치 간 대기시간 감소 (2초 → 1.5초)

    const results: any[] = [];

    for (let i = 0; i < propositions.length; i += BATCH_SIZE) {
      const batch = propositions.slice(i, i + BATCH_SIZE);

      console.log(
        `🔄 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 시작 (${
          batch.length
        }개)`
      );

      // 배치 내에서 병렬 처리
      const batchPromises = batch.map(async (proposition, index) => {
        try {
          return await this.backoff.executeWithRetry(async () => {
            const result = await this.verifyProposition(proposition);
            return {
              index: i + index,
              ...result,
            };
          });
        } catch (error) {
          console.error(`❌ 명제 ${i + index + 1} 검증 실패:`, error);
          return {
            index: i + index,
            success: false,
            isTrue: false,
            confidence: 0,
            reasoning: `Verification failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      console.log(`✅ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료`);

      // 다음 배치 전 짧은 대기
      if (i + BATCH_SIZE < propositions.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // 원래 순서대로 정렬
    results.sort((a, b) => a.index - b.index);

    console.log(`🎉 전체 배치 검증 완료: ${results.length}개 결과`);
    return results.map(({ index, ...rest }) => rest);
  }

  async verifyProposition(proposition: string): Promise<any> {
    if (!this.model) {
      throw new Error("VerifyService is not initialized");
    }

    const prompt = `Please verify the following proposition quickly:

Proposition: "${proposition}"

Answer briefly in 1-2 sentences based on the following criteria:
1. Determine if this proposition is true or false
2. Confidence level (0-100)
3. Key evidence in one line

Respond only in JSON format:
{
  "isTrue": true/false,
  "confidence": 0-100,
  "reasoning": "brief evidence"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text().trim();

      try {
        const parsed = JSON.parse(responseText);

        return {
          success: true,
          isTrue: Boolean(parsed.isTrue),
          confidence: Math.max(
            0,
            Math.min(100, parseInt(parsed.confidence) || 50)
          ),
          reasoning: (parsed.reasoning || "No reasoning provided").substring(
            0,
            100
          ), // Length limit
        };
      } catch (parseError) {
        console.warn("JSON 파싱 실패, 텍스트 분석 시도:", responseText);

        // Simple keyword analysis
        const isTrue = /true|correct|accurate|right|valid/i.test(responseText);
        const confidence = responseText.match(/(\d+)%?/)?.[1]
          ? parseInt(responseText.match(/(\d+)%?/)[1])
          : 50;

        return {
          success: true,
          isTrue,
          confidence: Math.max(0, Math.min(100, confidence)),
          reasoning: responseText.substring(0, 100),
        };
      }
    } catch (error) {
      console.error("❌ 명제 검증 중 오류:", error);

      throw new Error(
        error instanceof Error
          ? error.message
          : "Unknown error occurred during proposition verification"
      );
    }
  }

  // 서비스 상태 확인
  isReady(): boolean {
    return this.model !== null && this.model !== undefined;
  }

  // Connection test
  async testConnection(): Promise<boolean> {
    try {
      await this.verifyProposition("This is a test proposition.");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Gemini 서비스 팩토리
 */
export class GeminiServiceFactory {
  private static answerService: GeminiAnswerService | null = null;
  private static verifyService: VerifyService | null = null;

  /**
   * 답변 생성 서비스 인스턴스 반환
   */
  static getAnswerService(): GeminiAnswerService {
    const apiKey = process.env.GEMINI_ANSWER_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_ANSWER_API_KEY environment variable is not set.");
    }

    if (!this.answerService) {
      this.answerService = new GeminiAnswerService(apiKey);
    }

    return this.answerService;
  }

  /**
   * 검증 서비스 인스턴스 반환
   */
  static getVerifyService(): VerifyService {
    const apiKey = process.env.GEMINI_VERIFY_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_VERIFY_API_KEY environment variable is not set.");
    }

    if (!this.verifyService) {
      this.verifyService = new VerifyService(apiKey);
    }

    return this.verifyService;
  }

  /**
   * 서비스 상태 확인
   */
  static checkServiceHealth(): { answer: boolean; verify: boolean } {
    return {
      answer: !!process.env.GEMINI_ANSWER_API_KEY,
      verify: !!process.env.GEMINI_VERIFY_API_KEY,
    };
  }
}
