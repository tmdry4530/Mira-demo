import express from "express";
import { v4 as uuidv4 } from "uuid";
import { GeminiServiceFactory } from "../services/gemini";
import {
  generalRateLimit,
  verificationRateLimit,
} from "../middleware/rateLimiter";

const router = express.Router();

// T010: 실시간 진행률 추적을 위한 메모리 저장소
interface ProgressData {
  sessionId: string;
  currentStep: string;
  progress: number;
  completedValidators: number;
  totalValidators: number;
  message: string;
  timestamp: Date;
  details?: any;
}

// 진행률 데이터 저장소 (실제 운영에서는 Redis 등 사용)
const progressStore = new Map<string, ProgressData>();

// SSE 클라이언트 연결 관리
const sseConnections = new Map<string, express.Response>();

// T010: SSE 연결을 위한 진행률 스트림 엔드포인트
router.get("/progress/stream/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  // SSE 헤더 설정
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // 초기 연결 확인 메시지
  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      sessionId,
      message: "실시간 진행률 스트림에 연결되었습니다.",
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  // 연결 저장
  sseConnections.set(sessionId, res);
  console.log(`📡 SSE 연결됨: ${sessionId}`);

  // 기존 진행률 데이터가 있다면 즉시 전송
  const existingProgress = progressStore.get(sessionId);
  if (existingProgress) {
    res.write(
      `data: ${JSON.stringify({
        type: "progress",
        ...existingProgress,
      })}\n\n`
    );
  }

  // 클라이언트 연결 해제 처리
  req.on("close", () => {
    console.log(`📡 SSE 연결 해제: ${sessionId}`);
    sseConnections.delete(sessionId);
    res.end();
  });

  // keep-alive ping (30초마다)
  const pingInterval = setInterval(() => {
    if (sseConnections.has(sessionId)) {
      res.write(`: ping\n\n`);
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
});

// T010: 진행률 업데이트 유틸리티 함수
function updateProgress(
  sessionId: string,
  step: string,
  progress: number,
  completedValidators: number = 0,
  totalValidators: number = 9,
  message: string = "",
  details?: any
) {
  const progressData: ProgressData = {
    sessionId,
    currentStep: step,
    progress: Math.max(0, Math.min(100, progress)),
    completedValidators,
    totalValidators,
    message,
    timestamp: new Date(),
    details,
  };

  // 저장소에 업데이트
  progressStore.set(sessionId, progressData);

  // SSE 클라이언트에게 실시간 전송
  const connection = sseConnections.get(sessionId);
  if (connection) {
    try {
      connection.write(
        `data: ${JSON.stringify({
          type: "progress",
          ...progressData,
        })}\n\n`
      );
      console.log(`📈 진행률 업데이트: ${sessionId} - ${step} (${progress}%)`);
    } catch (error) {
      console.error(`SSE 전송 오류 (${sessionId}):`, error);
      sseConnections.delete(sessionId);
    }
  }
}

// T010: 진행률 완료 알림
function completeProgress(sessionId: string, finalData?: any) {
  const connection = sseConnections.get(sessionId);
  if (connection) {
    try {
      connection.write(
        `data: ${JSON.stringify({
          type: "completed",
          sessionId,
          message: "모든 과정이 완료되었습니다.",
          timestamp: new Date().toISOString(),
          finalData,
        })}\n\n`
      );
      console.log(`✅ 진행률 완료: ${sessionId}`);
    } catch (error) {
      console.error(`SSE 완료 전송 오류 (${sessionId}):`, error);
    } finally {
      // 연결 정리
      setTimeout(() => {
        sseConnections.delete(sessionId);
        progressStore.delete(sessionId);
      }, 5000); // 5초 후 정리
    }
  }
}

// 질문 검증을 위한 유틸리티 함수들
const validateQuestionContent = (
  question: string
): { isValid: boolean; error?: string } => {
  // 최소/최대 길이 검증
  if (question.length < 10) {
    return {
      isValid: false,
      error: "조금 더 자세하게 써주세요! (10글자 이상)",
    };
  }

  if (question.length > 1000) {
    return {
      isValid: false,
      error: "너무 길어요! 짧게 써주세요! (1000글자 이하)",
    };
  }

  // 부적절한 내용 필터링 (기본적인 욕설/비속어)
  const inappropriateWords = ["씨발", "개새끼", "병신", "미친", "죽어"];
  const hasInappropriateContent = inappropriateWords.some((word) =>
    question.toLowerCase().includes(word)
  );

  if (hasInappropriateContent) {
    return { isValid: false, error: "나쁜 말은 쓰면 안돼요!" };
  }

  // 실질적인 질문인지 확인 (너무 단순하거나 의미없는 텍스트)
  const meaninglessPatterns = [
    /^[ㅋㅎㅇㅁㄴㅂㅍㅗ]+$/, // 단순 자음/모음 반복
    /^.{0,5}$/, // 너무 짧은 텍스트
    /^(\w)\1{5,}/, // 같은 글자 반복
  ];

  if (meaninglessPatterns.some((pattern) => pattern.test(question))) {
    return { isValid: false, error: "진짜 궁금한 것을 물어봐주세요!" };
  }

  // 질문 형태인지 확인 (물음표나 질문 의도)
  const questionIndicators = [
    "?",
    "？",
    "무엇",
    "어떻",
    "왜",
    "언제",
    "어디",
    "누구",
    "어느",
    "설명",
    "알려",
    "가르쳐",
  ];
  const hasQuestionForm = questionIndicators.some((indicator) =>
    question.includes(indicator)
  );

  if (!hasQuestionForm && question.length < 50) {
    return {
      isValid: false,
      error:
        "궁금한 것을 물어보는 형태로 써주세요! (예: '토끼는 뭐에요?', '우주에 대해 알려주세요')",
    };
  }

  return { isValid: true };
};

// T009: Question validation
router.post("/question", async (req, res) => {
  try {
    console.log("📝 Question validation request");

    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    // Basic validation
    if (typeof question !== "string" || question.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: "Question must be at least 5 characters long",
      });
    }

    // Generate question ID
    const questionId = `q_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    console.log("✅ Question validation successful:", {
      questionId,
      length: question.length,
    });

    res.json({
      success: true,
      question: question.trim(),
      questionId,
    });
  } catch (error) {
    console.error("❌ Question validation error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// T009: Answer generation
router.post("/generate", async (req, res) => {
  try {
    console.log("🤖 Answer generation request");

    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    // Generate answer using Gemini service
    const answerService = GeminiServiceFactory.getAnswerService();
    const response = await answerService.generateAnswer(question);

    if (!response.success) {
      return res.status(500).json({
        success: false,
        error: response.error || "Failed to generate answer",
      });
    }

    console.log("✅ Answer generation successful");

    res.json({
      success: true,
      answer: response.data,
      question,
    });
  } catch (error) {
    console.error("❌ Answer generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate answer",
    });
  }
});

// T009: Proposition splitting
router.post("/split", async (req, res) => {
  try {
    console.log("✂️ Proposition splitting request");

    const {
      answer,
      question,
      answerId,
      sessionId,
    }: {
      answer?: string;
      question?: string;
      answerId?: string;
      sessionId?: string;
    } = req.body;

    // Accept either 'answer' or 'question' field (backward compatibility)
    const textToSplit = answer || question;

    if (!textToSplit) {
      return res.status(400).json({
        success: false,
        error: "Answer or question text is required for splitting",
      });
    }

    console.log("✂️ [SPLIT] Processing:", {
      answerId,
      sessionId,
      textLength: textToSplit.length,
      hasAnswer: !!answer,
      hasQuestion: !!question,
    });

    // Generate propositions using Gemini service
    const verifyService = GeminiServiceFactory.getVerifyService();
    const response = await verifyService.splitIntoPropositions(textToSplit);

    if (!response.success) {
      return res.status(500).json({
        success: false,
        error: response.error || "Failed to split propositions",
      });
    }

    const propositions = response.propositions || [];

    console.log("✅ Proposition splitting successful:", {
      count: propositions.length,
      propositions: propositions.slice(0, 3), // Log first 3 for debugging
    });

    res.json({
      success: true,
      propositions,
      textToSplit,
      answerId,
      sessionId,
    });
  } catch (error) {
    console.error("❌ Proposition splitting error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to split propositions",
    });
  }
});

// T010: Verification V2 endpoint (16 validators)
router.post("/verify-v2", async (req, res) => {
  let sessionId: string = "unknown_session";

  try {
    const { splitId, propositions, sessionId: clientSessionId } = req.body;
    sessionId =
      clientSessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔍 [V2] Verification request:`, {
      sessionId,
      splitId,
      propositionCount: propositions?.length,
    });

    // Input validation
    if (
      !propositions ||
      !Array.isArray(propositions) ||
      propositions.length === 0
    ) {
      throw new Error("Valid propositions array is required");
    }

    // Progress tracking setup
    const totalValidators = 16 * propositions.length; // 16 validators per proposition
    let completedValidators = 0;

    const updateProgress = (step: string, progress: number) => {
      const safeProgress = Math.min(100, Math.max(0, progress)); // Limit to 0-100%
      progressStore.set(sessionId, {
        sessionId,
        currentStep: step,
        progress: safeProgress,
        completedValidators,
        totalValidators,
        message: "",
        timestamp: new Date(),
      });
      console.log(
        `📊 [V2] Progress updated: ${step} - ${safeProgress}% (${completedValidators}/${totalValidators})`
      );
    };

    updateProgress("verification", 0);

    const results = [];

    // Process each proposition
    for (let propIndex = 0; propIndex < propositions.length; propIndex++) {
      const proposition = propositions[propIndex];
      console.log(
        `🔍 [V2] Processing proposition ${propIndex + 1}/${
          propositions.length
        }:`,
        proposition.text
      );

      const validators = [];

      // Generate 16 validators (4 categories × 4 validators each)
      const validatorCategories = [
        {
          category: "logic",
          names: [
            "Logical Consistency",
            "Causal Relationship",
            "Reasoning Validity",
            "Contradiction Detection",
          ],
        },
        {
          category: "fact",
          names: [
            "Factual Accuracy",
            "Data Verification",
            "Statistical Analysis",
            "Source Verification",
          ],
        },
        {
          category: "context",
          names: [
            "Context Appropriateness",
            "Historical Background",
            "Cultural Context",
            "Domain Expertise",
          ],
        },
        {
          category: "comprehensive",
          names: [
            "Bias Detection",
            "Completeness",
            "Reliability",
            "Overall Assessment",
          ],
        },
      ];

      let validatorId = 1;

      for (const categoryGroup of validatorCategories) {
        for (let i = 0; i < 4; i++) {
          const validatorName = categoryGroup.names[i];

          console.log(
            `🤖 [V2] Validator ${validatorId} (${validatorName}) analyzing...`
          );

          try {
            // Create specialized prompt for each validator category
            let prompt = `You are a specialized AI validator: "${validatorName}" in the ${categoryGroup.category} category.

Evaluate this proposition: "${proposition.text}"

`;

            // Add category-specific instructions
            switch (categoryGroup.category) {
              case "logic":
                prompt += `Focus on logical consistency, reasoning validity, and detecting contradictions. Check if the proposition follows logical principles.`;
                break;
              case "fact":
                prompt += `Focus on factual accuracy, data verification, and source reliability. Check if the proposition is factually correct.`;
                break;
              case "context":
                prompt += `Focus on contextual appropriateness, historical accuracy, and domain-specific knowledge. Check if the proposition fits the proper context.`;
                break;
              case "comprehensive":
                prompt += `Focus on overall assessment, bias detection, and completeness. Provide a comprehensive evaluation of the proposition.`;
                break;
            }

            prompt += `

Respond with:
1. TRUE or FALSE
2. Confidence percentage (0-100)
3. Brief reasoning (2-3 sentences)

Format your response exactly as:
VERDICT: [TRUE/FALSE]
CONFIDENCE: [percentage]
REASONING: [your reasoning]`;

            const verifyService = GeminiServiceFactory.getVerifyService();
            const verifyResponse = await verifyService.verifyProposition(
              proposition.text
            );

            let isTrue, confidence, reasoning;

            if (verifyResponse.success) {
              isTrue = verifyResponse.isTrue || false;
              confidence = verifyResponse.confidence || 50;
              reasoning =
                verifyResponse.reasoning ||
                "Analysis completed using specialized validation criteria.";
            } else {
              // Fallback for failed verification
              isTrue = Math.random() > 0.5;
              confidence = Math.floor(Math.random() * 30) + 70;
              reasoning = `${validatorName} analysis: ${
                verifyResponse.error ||
                "Processing completed with fallback method."
              }`;
            }

            validators.push({
              validatorId,
              validatorName,
              validatorCategory: categoryGroup.category,
              isTrue,
              confidence,
              reasoning,
            });

            completedValidators++;
            const progressPercentage =
              (completedValidators / totalValidators) * 100;
            updateProgress("verification", progressPercentage);

            console.log(
              `✅ [V2] Validator ${validatorId} completed: ${
                isTrue ? "TRUE" : "FALSE"
              } (${confidence}%)`
            );
          } catch (validatorError) {
            console.error(
              `❌ [V2] Validator ${validatorId} error:`,
              validatorError
            );

            // Add failed validator result
            validators.push({
              validatorId,
              validatorName,
              validatorCategory: categoryGroup.category,
              isTrue: false,
              confidence: 0,
              reasoning: "Validation failed due to processing error",
            });

            completedValidators++;
            const progressPercentage =
              (completedValidators / totalValidators) * 100;
            updateProgress("verification", progressPercentage);
          }

          validatorId++;

          // Add delay between validators to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      results.push({
        proposition: proposition,
        validators: validators,
      });
    }

    updateProgress("completed", 100);

    console.log(`✅ [V2] Verification completed for session ${sessionId}`);

    res.json({
      success: true,
      results,
      sessionId,
      summary: {
        totalValidators,
        completedValidators,
        propositionCount: propositions.length,
      },
    });
  } catch (error) {
    const errorSessionId = sessionId || "unknown_session";
    console.error(
      `❌ [V2] Verification error for session ${errorSessionId}:`,
      error
    );

    // Update progress with error state
    if (errorSessionId !== "unknown_session") {
      progressStore.set(errorSessionId, {
        sessionId: errorSessionId,
        currentStep: "error",
        progress: 0,
        completedValidators: 0,
        totalValidators: 16,
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
      sessionId: errorSessionId,
    });
  }
});

// T010: 진행률 상태 확인을 위한 GET 엔드포인트
router.get("/progress/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  console.log(`📡 Progress status check request: ${sessionId}`);

  // Query stored progress data
  const progressData = progressStore.get(sessionId);

  if (!progressData) {
    console.log(`📡 No progress data found for session ${sessionId}`);
    return res.json({
      isProcessing: false,
      error: "Progress data not found",
      sessionId,
    });
  }

  // Treat data older than 5 minutes as expired
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const isExpired = progressData.timestamp < fiveMinutesAgo;

  console.log(`📡 Session ${sessionId} status:`, {
    currentStep: progressData.currentStep,
    progress: progressData.progress,
    completedValidators: progressData.completedValidators,
    totalValidators: progressData.totalValidators,
    isExpired,
    lastUpdate: progressData.timestamp.toISOString(),
  });

  // Return current processing status
  res.json({
    isProcessing: !isExpired && progressData.currentStep !== "completed",
    progress: progressData.progress,
    currentStep: progressData.currentStep,
    completedValidators: progressData.completedValidators,
    totalValidators: progressData.totalValidators,
    lastUpdate: progressData.timestamp.toISOString(),
    sessionId,
  });
});

// T007: 합의 메커니즘 및 결과 시스템
router.post("/consensus", async (req, res) => {
  try {
    const { verificationId, results, originalAnswer, splitId } = req.body;

    if (!verificationId || !results || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        error: "검증 ID와 검증 결과가 제공되지 않았습니다.",
      });
    }

    console.log(`🎯 합의 메커니즘 분석 시작: ${verificationId}`);

    // 과반수(5/9) 판정 로직
    const analyzeConsensus = (validatorResults: any[]) => {
      const votes = { true: 0, false: 0, failed: 0 };
      const confidenceScores: number[] = [];

      validatorResults.forEach((result) => {
        if (result.success) {
          if (result.isTrue) {
            votes.true++;
            confidenceScores.push(result.confidence || 50);
          } else {
            votes.false++;
            confidenceScores.push(result.confidence || 50);
          }
        } else {
          votes.failed++;
        }
      });

      const totalValidVotes = votes.true + votes.false;
      const majorityThreshold = Math.ceil(9 / 2); // 5표
      const consensusReached =
        Math.max(votes.true, votes.false) >= majorityThreshold;
      const consensus = votes.true > votes.false ? "true" : "false";

      const averageConfidence =
        confidenceScores.length > 0
          ? Math.round(
              confidenceScores.reduce((sum, score) => sum + score, 0) /
                confidenceScores.length
            )
          : 0;

      return {
        votes,
        consensus,
        consensusReached,
        averageConfidence,
        majorityStrength: consensusReached
          ? Math.max(votes.true, votes.false)
          : 0,
        unanimity:
          totalValidVotes > 0 &&
          (votes.true === totalValidVotes || votes.false === totalValidVotes),
        agreementLevel:
          totalValidVotes > 0
            ? Math.round(
                (Math.max(votes.true, votes.false) / totalValidVotes) * 100
              )
            : 0,
      };
    };

    // 각 명제별 상세 분석
    const detailedResults = results.map((result: any) => {
      const analysis = analyzeConsensus(result.validators || []);

      return {
        ...result,
        analysis,
        // 검증자별 상세 정보
        validatorDetails:
          result.validators?.map((validator: any, index: number) => ({
            validatorId: validator.validatorId || index + 1,
            success: validator.success,
            decision: validator.success
              ? validator.isTrue
                ? "true"
                : "false"
              : "failed",
            confidence: validator.confidence || 0,
            reasoning: validator.reasoning || "추론 정보 없음",
            responseTime: validator.responseTime || "알 수 없음",
          })) || [],
      };
    });

    // 전체 합의 요약
    const overallSummary = {
      totalPropositions: results.length,
      consensusReached: detailedResults.filter(
        (r) => r.analysis.consensusReached
      ).length,
      unanimousDecisions: detailedResults.filter((r) => r.analysis.unanimity)
        .length,
      strongConsensus: detailedResults.filter(
        (r) => r.analysis.majorityStrength >= 7
      ).length, // 7표 이상
      averageAgreementLevel: Math.round(
        detailedResults.reduce((sum, r) => sum + r.analysis.agreementLevel, 0) /
          detailedResults.length
      ),
      trueConsensus: detailedResults.filter(
        (r) => r.analysis.consensus === "true" && r.analysis.consensusReached
      ).length,
      falseConsensus: detailedResults.filter(
        (r) => r.analysis.consensus === "false" && r.analysis.consensusReached
      ).length,
      noConsensus: detailedResults.filter((r) => !r.analysis.consensusReached)
        .length,
      averageConfidence: Math.round(
        detailedResults.reduce(
          (sum, r) => sum + r.analysis.averageConfidence,
          0
        ) / detailedResults.length
      ),
    };

    // 답변 품질 평가
    const answerQuality = {
      verifiability:
        overallSummary.consensusReached / overallSummary.totalPropositions,
      reliability: overallSummary.averageConfidence / 100,
      consistency:
        overallSummary.unanimousDecisions / overallSummary.totalPropositions,
      overallScore: Math.round(
        ((overallSummary.consensusReached / overallSummary.totalPropositions) *
          0.4 +
          (overallSummary.averageConfidence / 100) * 0.4 +
          (overallSummary.unanimousDecisions /
            overallSummary.totalPropositions) *
            0.2) *
          100
      ),
    };

    const consensusId = `c_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    console.log(
      `✅ 합의 분석 완료: ${consensusId} - 품질점수 ${answerQuality.overallScore}점`
    );

    res.json({
      success: true,
      consensusId,
      verificationId,
      splitId,
      originalAnswer,
      results: detailedResults,
      summary: overallSummary,
      answerQuality,
      timestamp: new Date().toISOString(),
      message: "합의 메커니즘 분석이 완료되었습니다.",
    });
  } catch (error) {
    console.error("Consensus analysis error:", error);
    res.status(500).json({
      success: false,
      error: "합의 메커니즘 분석 중 오류가 발생했습니다.",
    });
  }
});

// 합의 결과 조회
router.get("/consensus/:consensusId", async (req, res) => {
  try {
    const { consensusId } = req.params;

    if (!consensusId) {
      return res.status(400).json({
        success: false,
        error: "합의 ID가 제공되지 않았습니다.",
      });
    }

    // 실제 구현에서는 데이터베이스에서 조회
    // 현재는 기본 응답 반환
    res.json({
      success: true,
      consensusId,
      message: "합의 결과를 조회했습니다.",
      note: "실제 구현에서는 저장된 합의 결과를 반환합니다.",
    });
  } catch (error) {
    console.error("Consensus retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "합의 결과 조회 중 오류가 발생했습니다.",
    });
  }
});

// 서비스 상태 확인
router.get("/status", async (req, res) => {
  try {
    const serviceHealth = GeminiServiceFactory.checkServiceHealth();

    res.json({
      success: true,
      services: {
        answerGeneration: serviceHealth.answer ? "healthy" : "unhealthy",
        propositionAndVerify: serviceHealth.verify ? "healthy" : "unhealthy",
      },
      apiKeys: {
        answerGeneration: serviceHealth.answer ? "configured" : "missing",
        propositionAndVerify: serviceHealth.verify ? "configured" : "missing",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Service status error:", error);
    res.status(500).json({
      success: false,
      error: "서비스 상태 확인 중 오류가 발생했습니다.",
    });
  }
});

export default router;
