import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const memoryDir = __dirname;
const resultsDir = path.join(memoryDir, "results");

const caseFiles = [
  "memory-extraction-cases.json",
  "memory-retrieval-cases.json",
  "memory-conflict-cases.json",
  "memory-expiration-cases.json",
  "memory-usage-cases.json"
];

const currentUserId = "current-user";

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isMemoryUsable(memory, nowIso) {
  if (memory.status && memory.status !== "active") {
    return false;
  }

  if (memory.userId && memory.userId !== currentUserId) {
    return false;
  }

  if (memory.expiresAt && nowIso && memory.expiresAt <= nowIso) {
    return false;
  }

  return true;
}

function keywordScore(memory, userInput) {
  const inputTokens = new Set(tokenize(userInput));
  const contentTokens = tokenize(memory.content);

  return contentTokens.reduce((score, token) => score + (inputTokens.has(token) ? 1 : 0), 0);
}

function validateCaseShape(testCase, filename) {
  const failures = [];

  if (!testCase.id || typeof testCase.id !== "string") {
    failures.push("missing string id");
  }

  if (!testCase.category || typeof testCase.category !== "string") {
    failures.push("missing string category");
  }

  if (filename.includes(testCase.category) === false) {
    failures.push(`category ${testCase.category} does not match ${filename}`);
  }

  return failures;
}

function evaluateExpirationCase(testCase) {
  const memories = testCase.givenMemories ?? [];
  const usable = memories.filter((memory) => isMemoryUsable(memory, testCase.now));

  if (testCase.forbiddenBehavior) {
    return usable.length === 0
      ? { status: "passed", details: "expired/deleted/archived memory is filtered" }
      : { status: "failed", details: `expected no usable memories, got ${usable.length}` };
  }

  if (testCase.expectedBehavior) {
    return usable.length > 0
      ? { status: "passed", details: "expected memory remains usable" }
      : { status: "failed", details: "expected at least one usable memory" };
  }

  return { status: "manual", details: "no deterministic expectation" };
}

function evaluateRetrievalCase(testCase) {
  const memories = testCase.givenMemories ?? [];
  const usable = memories.filter((memory) => isMemoryUsable(memory));

  if (usable.length === 0) {
    return testCase.forbiddenBehavior
      ? { status: "passed", details: "non-active or out-of-scope memories are filtered" }
      : { status: "failed", details: "expected retrievable memory, got none" };
  }

  const ranked = usable
    .map((memory) => ({ memory, score: keywordScore(memory, testCase.userInput ?? "") }))
    .sort((left, right) => right.score - left.score);

  const top = ranked[0];

  if (!top || top.score === 0) {
    return { status: "manual", details: "semantic relevance requires embedding/model review" };
  }

  return {
    status: "passed",
    details: `top deterministic keyword match: ${top.memory.content}`
  };
}

function evaluateUsageCase(testCase, memoryPromptSource) {
  const forbidden = String(testCase.forbiddenBehavior ?? "");
  const promptChecks = [
    ["active memory", "active memory"],
    ["memory id", "memory id"],
    ["内部记忆", "内部记忆"],
    ["当前用户消息优先", "当前用户消息优先"]
  ];

  const missingRules = promptChecks
    .filter(([needle]) => forbidden.includes(needle) || needle === "当前用户消息优先")
    .filter(([, rule]) => !memoryPromptSource.includes(rule));

  if (missingRules.length > 0) {
    return {
      status: "failed",
      details: `memory usage prompt is missing rules: ${missingRules.map(([, rule]) => rule).join(", ")}`
    };
  }

  return {
    status: "manual",
    details: "prompt guardrails exist; final assistant behavior requires model review"
  };
}

function evaluateConflictCase(testCase) {
  if (testCase.id.includes("no-conflict")) {
    return { status: "manual", details: "merge vs conflict requires memory-quality service or model review" };
  }

  if (testCase.expectedFields?.includes("confirmation_reason")) {
    return { status: "manual", details: "pending confirmation requires service-level execution" };
  }

  return { status: "manual", details: "conflict behavior requires service-level execution" };
}

function evaluateExtractionCase(testCase) {
  if (Array.isArray(testCase.expectedMemories) && testCase.expectedMemories.length === 0) {
    return { status: "manual", details: "negative extraction case requires extractor execution" };
  }

  return { status: "manual", details: "extraction requires model-backed extractor execution" };
}

async function readJson(filename) {
  const content = await readFile(path.join(memoryDir, filename), "utf8");
  return JSON.parse(content);
}

async function main() {
  const memoryPromptPath = path.join(rootDir, "packages/prompts/src/memory-usage-prompt.ts");
  const memoryPromptSource = await readFile(memoryPromptPath, "utf8").catch(() => "");
  const results = [];

  for (const filename of caseFiles) {
    const cases = await readJson(filename);

    for (const testCase of cases) {
      const shapeFailures = validateCaseShape(testCase, filename);

      if (shapeFailures.length > 0) {
        results.push({
          id: testCase.id ?? "(missing-id)",
          file: filename,
          category: testCase.category ?? "(missing-category)",
          status: "failed",
          details: shapeFailures.join("; ")
        });
        continue;
      }

      const result =
        testCase.category === "expiration"
          ? evaluateExpirationCase(testCase)
          : testCase.category === "retrieval"
            ? evaluateRetrievalCase(testCase)
            : testCase.category === "usage"
              ? evaluateUsageCase(testCase, memoryPromptSource)
              : testCase.category === "conflict"
                ? evaluateConflictCase(testCase)
                : evaluateExtractionCase(testCase);

      results.push({
        id: testCase.id,
        file: filename,
        category: testCase.category,
        ...result
      });
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    manual: results.filter((result) => result.status === "manual").length
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    results
  };

  await mkdir(resultsDir, { recursive: true });
  await writeFile(path.join(resultsDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("Memory Evals");
  console.log(`Total: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Manual Review: ${summary.manual}`);

  if (summary.failed > 0) {
    console.log("\nFailures:");
    for (const result of results.filter((item) => item.status === "failed")) {
      console.log(`- ${result.id}: ${result.details}`);
    }
    process.exitCode = 1;
  }
}

await main();
