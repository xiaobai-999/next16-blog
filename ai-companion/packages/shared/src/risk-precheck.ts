import type {
  ClassificationResult,
  ClassificationRiskType
} from "./schemas/classification";

export type RiskPrecheckResult = {
  matched: boolean;
  riskLevel: ClassificationResult["riskLevel"];
  riskType: ClassificationRiskType;
  riskUrgency: ClassificationResult["riskUrgency"];
  signals: string[];
};

type RiskPrecheckRule = {
  pattern: RegExp;
  riskType: ClassificationRiskType;
  signal: string;
};

const selfHarmTerms =
  "(?:不想活|想死|去死算了|结束(?:这)?一切|结束生命|自杀|轻生|杀了自己|伤害自己|弄死自己|割腕|跳楼)";
const harmToOthersTerms = "(?:杀了他|杀了她|杀人|弄死他|弄死她|伤害别人|报复.{0,12}人)";
const riskTerms = `(?:${selfHarmTerms}|${harmToOthersTerms})`;

const negatedSelfHarmPatterns = [
  new RegExp(`(?:没有|没|无|不会|不打算|不准备|并不|不是|从来没有).{0,10}${selfHarmTerms}`, "i"),
  new RegExp(`${selfHarmTerms}.{0,10}(?:想法|念头|打算|计划|冲动).{0,6}(?:没有|没|无)`, "i")
];

const negatedHarmToOthersPatterns = [
  new RegExp(`(?:没有|没|无|不会|不打算|不准备|并不|不是|从来没有).{0,10}${harmToOthersTerms}`, "i"),
  new RegExp(`${harmToOthersTerms}.{0,10}(?:想法|念头|打算|计划|冲动).{0,6}(?:没有|没|无)`, "i")
];

const fictionalRiskPatterns = [
  new RegExp(`(?:写小说|写故事|写剧本|创作|虚构|小说|故事|剧本).{0,24}${riskTerms}`, "i"),
  new RegExp(`(?:角色|人物|主角)(?:说|的台词|台词|对白).{0,16}${riskTerms}`, "i"),
  new RegExp(`${riskTerms}.{0,24}(?:台词|对白|怎么表现|怎么写|写法|小说|故事|剧本)`, "i")
];

const highRiskRules: RiskPrecheckRule[] = [
  { pattern: /(不想活|想死|去死算了|结束(?:这)?一切|结束生命|自杀|轻生)/i, riskType: "self_harm", signal: "self_harm_phrase" },
  { pattern: /(杀了自己|伤害自己|弄死自己|割腕|跳楼)/i, riskType: "self_harm", signal: "self_harm_method" },
  { pattern: /(杀了他|杀了她|杀人|弄死他|弄死她|伤害别人|报复.*人)/i, riskType: "harm_to_others", signal: "harm_to_others_phrase" },
  { pattern: /(马上|现在|今晚|今天).*(自杀|轻生|跳楼|割腕|杀人|杀了|弄死|不想活|想死|结束.*一切)/i, riskType: "immediate_danger", signal: "immediate_timing" }
];

const mediumRiskRules: RiskPrecheckRule[] = [
  { pattern: /(家暴|被打|虐待|威胁我|控制我)/i, riskType: "abuse", signal: "abuse_signal" },
  { pattern: /(未成年|小孩|孩子).*(陌生网友|私下见|危险|伤害|性|裸照|约见)/i, riskType: "minor_safety", signal: "minor_safety_signal" },
  { pattern: /(忽略|绕过).*(安全|规则|限制|政策)/i, riskType: "other", signal: "safety_rule_bypass" },
  { pattern: /(角色扮演|假装|虚构).*(自杀|杀人|伤害|绑架)/i, riskType: "other", signal: "roleplay_danger" }
];

export function uniqueSignals(signals: string[]) {
  return [...new Set(signals)].slice(0, 5);
}

function matchesAny(patterns: RegExp[], text: string) {
  return patterns.some((pattern) => pattern.test(text));
}

function isImmediateSignal(signals: string[]) {
  return signals.some((signal) => signal === "immediate_timing");
}

function shouldSuppressHighRiskRule(rule: RiskPrecheckRule, text: string) {
  if (matchesAny(fictionalRiskPatterns, text)) {
    return true;
  }

  if (rule.riskType === "harm_to_others") {
    return matchesAny(negatedHarmToOthersPatterns, text);
  }

  return matchesAny(negatedSelfHarmPatterns, text);
}

export function detectRiskPrecheck(text: string): RiskPrecheckResult {
  const highMatches = highRiskRules
    .filter((rule) => rule.pattern.test(text))
    .filter((rule) => !shouldSuppressHighRiskRule(rule, text));
  const mediumMatches = mediumRiskRules.filter((rule) => rule.pattern.test(text));
  const allMatches = [...highMatches, ...mediumMatches];

  if (allMatches.length === 0) {
    return {
      matched: false,
      riskLevel: "none",
      riskType: "none",
      riskUrgency: "none",
      signals: []
    };
  }

  const signals = uniqueSignals(allMatches.map((rule) => rule.signal));
  const firstHighMatch = highMatches[0];
  const firstMediumMatch = mediumMatches[0];

  if (firstHighMatch) {
    return {
      matched: true,
      riskLevel: "high",
      riskType: isImmediateSignal(signals) ? "immediate_danger" : firstHighMatch.riskType,
      riskUrgency: isImmediateSignal(signals) ? "immediate" : "unknown",
      signals
    };
  }

  return {
    matched: true,
    riskLevel: "medium",
    riskType: firstMediumMatch?.riskType ?? "unknown",
    riskUrgency: "unknown",
    signals
  };
}
