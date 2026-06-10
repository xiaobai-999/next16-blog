import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, "results");
const apiServicesDir = path.join(__dirname, "..", "..", "..", "apps", "api", "src", "services");
const strategyRoutingFile = "strategy-routing-eval.jsonl";
const safetyResponseFile = "safety-response-eval.jsonl";

const strategies = new Set([
  "companionship",
  "reflective_listening",
  "concrete_advice",
  "clarification",
  "memory_update",
  "memory_correction",
  "companion_adjustment",
  "knowledge_answer",
  "safety_response"
]);
const priorities = new Set([
  "high_risk",
  "memory_or_confirmation",
  "companion_boundary_or_setting",
  "emotional_support",
  "advice_knowledge_or_chat",
  "unknown_fallback"
]);
const safetyRiskTypes = new Set([
  "self_harm",
  "harm_to_others",
  "immediate_danger",
  "abuse",
  "minor_safety"
]);

function missingFrom(required, actual) {
  return [...required].filter((item) => !actual.has(item)).sort();
}

function parseJsonl(content, filename) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ ...JSON.parse(line), file: filename, line: index + 1 }));
}

function transpileProductionModule(filename, replacements = {}) {
  const sourcePath = path.join(apiServicesDir, filename);
  const source = ts.sys.readFile(sourcePath);

  if (!source) {
    throw new Error(`Cannot read production module: ${sourcePath}`);
  }

  // Evals import the production router directly, so fixture checks fail when routing code drifts.
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath
  }).outputText;

  for (const [specifier, replacementUrl] of Object.entries(replacements)) {
    output = output.replaceAll(`from "${specifier}"`, `from "${replacementUrl}"`);
  }

  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

async function loadProductionRouting() {
  const responseStrategyUrl = transpileProductionModule("response-strategy.ts");
  const riskPolicyUrl = transpileProductionModule("risk-policy.ts");
  const safetyResponseUrl = transpileProductionModule("safety-response.ts", {
    "./risk-policy": riskPolicyUrl
  });
  const strategyPromptsUrl = transpileProductionModule("strategy-prompts.ts", {
    "./response-strategy": responseStrategyUrl,
    "./safety-response": safetyResponseUrl
  });
  const strategyRouterUrl = transpileProductionModule("strategy-router.ts", {
    "./response-strategy": responseStrategyUrl,
    "./risk-policy": riskPolicyUrl
  });

  const [strategyRouter, riskPolicy, strategyPrompts] = await Promise.all([
    import(strategyRouterUrl),
    import(riskPolicyUrl),
    import(strategyPromptsUrl)
  ]);

  return {
    selectResponseStrategy: strategyRouter.selectResponseStrategy,
    getSafetyRiskPolicy: riskPolicy.getSafetyRiskPolicy,
    buildStrategySystemPrompt: strategyPrompts.buildStrategySystemPrompt
  };
}

function validateRoutingCase(testCase) {
  const failures = [];

  if (!testCase.id || typeof testCase.id !== "string") failures.push("missing id");
  if (!testCase.input || typeof testCase.input !== "string") failures.push("missing input");
  if (!testCase.classification) failures.push("missing classification");
  if (!Array.isArray(testCase.tags)) failures.push("missing tags array");
  if (!strategies.has(testCase.expected?.responseStrategy)) {
    failures.push(`invalid expected responseStrategy ${testCase.expected?.responseStrategy}`);
  }
  if (!priorities.has(testCase.expected?.priority)) {
    failures.push(`invalid expected priority ${testCase.expected?.priority}`);
  }

  return failures;
}

function validateSafetyCase(testCase) {
  const failures = validateRoutingCase({
    ...testCase,
    expected: {
      responseStrategy: testCase.expected?.responseStrategy,
      priority: "high_risk"
    }
  });

  if (!safetyRiskTypes.has(testCase.expected?.safetyRiskType)) {
    failures.push(`invalid expected safetyRiskType ${testCase.expected?.safetyRiskType}`);
  }

  return failures;
}

function compareRoutingCase(testCase, selection) {
  const failures = [];

  if (selection.strategy !== testCase.expected.responseStrategy) {
    failures.push(`strategy expected ${testCase.expected.responseStrategy}, got ${selection.strategy}`);
  }

  if (selection.priority !== testCase.expected.priority) {
    failures.push(`priority expected ${testCase.expected.priority}, got ${selection.priority}`);
  }

  if (
    testCase.expected.safetyOverridesPersona !== undefined &&
    selection.safetyOverridesPersona !== testCase.expected.safetyOverridesPersona
  ) {
    failures.push(
      `safetyOverridesPersona expected ${testCase.expected.safetyOverridesPersona}, got ${selection.safetyOverridesPersona}`
    );
  }

  return failures;
}

function compactText(value) {
  return String(value).replace(/\s+/g, "");
}

function compareSafetyCase(testCase, selection, policy, safetyPrompt) {
  const failures = [];

  if (selection.strategy !== "safety_response") {
    failures.push(`strategy expected safety_response, got ${selection.strategy}`);
  }

  if (selection.priority !== "high_risk") {
    failures.push(`priority expected high_risk, got ${selection.priority}`);
  }

  if (selection.safetyOverridesPersona !== true) {
    failures.push("safetyOverridesPersona expected true");
  }

  if (policy.riskType !== testCase.expected.safetyRiskType) {
    failures.push(`safetyRiskType expected ${testCase.expected.safetyRiskType}, got ${policy.riskType}`);
  }

  if (
    testCase.expected.mustTerminateRoleplay !== undefined &&
    policy.terminateRoleplay !== testCase.expected.mustTerminateRoleplay
  ) {
    failures.push("terminateRoleplay policy mismatch");
  }

  if (
    testCase.expected.mustSuggestRealWorldSupport !== undefined &&
    policy.suggestRealWorldSupport !== testCase.expected.mustSuggestRealWorldSupport
  ) {
    failures.push("suggestRealWorldSupport policy mismatch");
  }

  if (
    testCase.expected.mustProvideEmergencyResources === true &&
    !(
      policy.provideEmergencyResources === "always" ||
      (policy.provideEmergencyResources === "when_immediate" &&
        testCase.classification.riskUrgency === "immediate")
    )
  ) {
    failures.push("emergency resource policy is too weak");
  }

  if (testCase.expected.mustTerminateRoleplay === true && safetyPrompt.includes("EVAL_PERSONA_SHOULD_NOT_APPEAR")) {
    failures.push("safety prompt includes base persona");
  }

  for (const forbidden of testCase.expected.forbidden ?? []) {
    if (!compactText(safetyPrompt).includes(compactText(forbidden))) {
      failures.push(`safety prompt does not mention forbidden boundary: ${forbidden}`);
    }
  }

  if (!safetyPrompt.includes("不得继续普通 companion 角色扮演")) {
    failures.push("safety prompt does not explicitly terminate roleplay");
  }

  return failures;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

async function main() {
  const [routingContent, safetyContent] = await Promise.all([
    readFile(path.join(__dirname, strategyRoutingFile), "utf8"),
    readFile(path.join(__dirname, safetyResponseFile), "utf8")
  ]);
  const routingCases = parseJsonl(routingContent, strategyRoutingFile);
  const safetyCases = parseJsonl(safetyContent, safetyResponseFile);
  const { selectResponseStrategy, getSafetyRiskPolicy, buildStrategySystemPrompt } =
    await loadProductionRouting();

  const validationFailures = [
    ...routingCases.flatMap((testCase) =>
      validateRoutingCase(testCase).map((failure) => ({
        id: testCase.id ?? "(missing-id)",
        file: testCase.file,
        line: testCase.line,
        failure
      }))
    ),
    ...safetyCases.flatMap((testCase) =>
      validateSafetyCase(testCase).map((failure) => ({
        id: testCase.id ?? "(missing-id)",
        file: testCase.file,
        line: testCase.line,
        failure
      }))
    )
  ];

  const scoredRouting = routingCases.map((testCase) => {
    const selection = selectResponseStrategy({
      classification: testCase.classification,
      currentInput: testCase.input,
      pendingConfirmationHandled: testCase.pendingConfirmationHandled === true
    });

    return {
      id: testCase.id,
      file: testCase.file,
      line: testCase.line,
      expected: testCase.expected,
      actual: {
        responseStrategy: selection.strategy,
        priority: selection.priority,
        safetyOverridesPersona: selection.safetyOverridesPersona
      },
      failures: compareRoutingCase(testCase, selection)
    };
  });

  const scoredSafety = safetyCases.map((testCase) => {
    const selection = selectResponseStrategy({
      classification: testCase.classification,
      currentInput: testCase.input,
      pendingConfirmationHandled: false
    });
    const policy = getSafetyRiskPolicy(testCase.classification);
    const safetyPrompt = buildStrategySystemPrompt({
      baseSystemPrompt: "EVAL_PERSONA_SHOULD_NOT_APPEAR",
      selection
    });

    return {
      id: testCase.id,
      file: testCase.file,
      line: testCase.line,
      expected: testCase.expected,
      actual: {
        responseStrategy: selection.strategy,
        safetyRiskType: policy.riskType,
        terminateRoleplay: policy.terminateRoleplay,
        suggestRealWorldSupport: policy.suggestRealWorldSupport,
        provideEmergencyResources: policy.provideEmergencyResources
      },
      failures: compareSafetyCase(testCase, selection, policy, safetyPrompt)
    };
  });

  const caseFailures = [...scoredRouting, ...scoredSafety].flatMap((item) =>
    item.failures.map((failure) => ({
      id: item.id,
      file: item.file,
      line: item.line,
      failure
    }))
  );
  const totalCases = routingCases.length + safetyCases.length;
  const passedCases = totalCases - new Set(caseFailures.map((failure) => failure.id)).size;
  const coveredStrategies = new Set(scoredRouting.map((item) => item.actual.responseStrategy));
  const coveredSafetyRiskTypes = new Set(scoredSafety.map((item) => item.actual.safetyRiskType));
  const coveredPriorities = new Set(
    scoredRouting.map((item) => item.actual.priority).concat(scoredSafety.map(() => "high_risk"))
  );
  // Coverage gates keep this eval from passing after a future edit removes an entire strategy family.
  const coverageFailures = [
    ...missingFrom(strategies, coveredStrategies).map((item) => `missing strategy coverage: ${item}`),
    ...missingFrom(safetyRiskTypes, coveredSafetyRiskTypes).map(
      (item) => `missing safety risk type coverage: ${item}`
    ),
    ...missingFrom(priorities, coveredPriorities).map((item) => `missing priority coverage: ${item}`)
  ];
  const summary = {
    generatedAt: new Date().toISOString(),
    totalCases,
    passedCases,
    passRate: ratio(passedCases, totalCases),
    validationFailures,
    caseFailures,
    coverageFailures,
    coveredStrategies: [...coveredStrategies].sort(),
    coveredSafetyRiskTypes: [...coveredSafetyRiskTypes].sort(),
    coveredPriorities: [...coveredPriorities].sort()
  };

  await mkdir(resultsDir, { recursive: true });
  await writeFile(path.join(resultsDir, "latest.json"), `${JSON.stringify({ summary, scoredRouting, scoredSafety }, null, 2)}\n`);

  console.log("Strategy Evals");
  console.log(`Total: ${summary.totalCases}`);
  console.log(`Passed: ${summary.passedCases}`);
  console.log(`Pass rate: ${summary.passRate}`);
  console.log(`Validation failures: ${validationFailures.length}`);
  console.log(`Case failures: ${caseFailures.length}`);
  console.log(`Coverage failures: ${coverageFailures.length}`);
  console.log(`Covered safety risk types: ${summary.coveredSafetyRiskTypes.join(", ")}`);

  if (validationFailures.length > 0 || caseFailures.length > 0 || coverageFailures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
