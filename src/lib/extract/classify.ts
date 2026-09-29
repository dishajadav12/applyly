import {
  ALERT_PHRASES,
  APPLICATION_PHRASES,
  ASSESSMENT_DOMAINS,
  ATS_DOMAINS,
  CANDIDATE_PORTAL_PATTERNS,
  CLASSIFY_SCORE_THRESHOLD,
  EVENT_TYPE_PRIORITY,
  MARKETING_WORDS,
  NOREPLY_PATTERNS,
  REJECTION_CONTEXT_WORD,
  REJECTION_PHRASES,
  SCORE_WEIGHTS,
  type EventType,
} from "@/lib/config";
import { registrableDomain } from "@/lib/gmail/domains";
import { escapeRegex } from "./text-utils";
import type { NormalizedMessage } from "./normalize";

export type ClassifyContext = {
  /** From user_settings.first_name; scores a human sender greeting the user by name. */
  firstName?: string;
  /** The user's own Gmail address; scores as "sent by user" alongside the SENT label. */
  selfEmail?: string;
};

export type ClassificationResult = {
  isJobRelated: boolean;
  score: number;
  eventType?: EventType;
  reasons: string[];
};

const ATS_AND_ASSESSMENT_DOMAINS = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS] as readonly string[];

// Phrase sets for event-type detection (A7 priority list); "rejection" and "interview_invite"
// have an extra fallback handled inline below. "other_update" is the catch-all default.
const PHRASE_SETS: Partial<Record<EventType, readonly string[]>> = {
  offer: ["offer letter", "pleased to offer", "job offer", "offer of employment", "extend an offer"],
  withdrawal: [
    "withdraw your application",
    "withdrawing your application",
    "have withdrawn",
    "no longer interested in this position",
    "removed your application",
  ],
  final_interview: ["final round", "virtual onsite", "onsite interview", "final interview"],
  interview_invite: [
    "invitation to interview",
    "schedule an interview",
    "schedule your interview",
    "interview availability",
    "phone screen",
    "technical interview",
  ],
  assessment: ["online assessment", "coding assessment", "technical assessment", "coding challenge"],
  application_confirmation: [
    "thank you for applying",
    "thanks for applying",
    "application received",
    "received your application",
    "your application has been received",
    "your application to",
    "your application for",
    "your recent application",
    "thank you for your interest in",
    "thanks for your interest in",
  ],
  recruiter_outreach: [
    "reaching out",
    "came across your profile",
    "exciting opportunity",
    "would love to chat",
    "open role",
    "connect about an opportunity",
  ],
};

// Words that turn a stage phrase into a hypothetical/future one ("if your skills are a
// strong match, we will schedule an interview" is still an application_confirmation, not
// an interview_invite). Guards every phrase set below against this common confirmation-
// email pattern of previewing later stages.
const CONDITIONAL_MARKERS = ["if ", "if you", "if your", "should you", "should your", "in the event", "may be invited", "might be invited"];

function includesPhrase(haystack: string, phrase: string): boolean {
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

function isHumanSender(msg: NormalizedMessage): boolean {
  const domain = registrableDomain(msg.from);
  const localPart = msg.from.split("@")[0] ?? "";
  const isNoreply = NOREPLY_PATTERNS.some((p) => localPart.toLowerCase().includes(p));
  const isAts = domain !== undefined && ATS_AND_ASSESSMENT_DOMAINS.includes(domain);
  return !isNoreply && !isAts;
}

/** Splits into sentence-ish fragments, so a conditional marker earlier in the SAME sentence can guard a phrase later in it. */
function sentences(haystack: string): string[] {
  return haystack
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First phrase found in any sentence, skipping a match a conditional marker earlier in that sentence guards. */
function findPhrase(sents: string[], phrases: readonly string[]): string | undefined {
  for (const sentence of sents) {
    for (const phrase of phrases) {
      const index = sentence.indexOf(phrase);
      if (index === -1) continue;
      const prefix = sentence.slice(0, index);
      if (CONDITIONAL_MARKERS.some((marker) => prefix.includes(marker))) continue;
      return phrase;
    }
  }
  return undefined;
}

function detectEventType(msg: NormalizedMessage, reasons: string[]): EventType {
  const haystack = `${msg.subject}\n${msg.text}`.toLowerCase();
  const sents = sentences(haystack);

  for (const type of EVENT_TYPE_PRIORITY) {
    if (type === "other_update") break; // fallback, applied after the loop

    if (type === "rejection") {
      const phrase = findPhrase(sents, REJECTION_PHRASES);
      const contextual = phrase ?? (haystack.includes(REJECTION_CONTEXT_WORD) && haystack.includes("application") ? REJECTION_CONTEXT_WORD : undefined);
      if (contextual) {
        reasons.push(`event type "rejection" from ${phrase ? `phrase "${phrase}"` : `"${REJECTION_CONTEXT_WORD}" + application context`}`);
        return "rejection";
      }
      continue;
    }

    if (type === "interview_invite") {
      const phrase = findPhrase(sents, PHRASE_SETS.interview_invite!);
      const fallback = phrase ?? (/\binterview\b/i.test(msg.subject) ? "subject:interview" : undefined);
      if (fallback) {
        reasons.push(`event type "interview_invite" from ${phrase ? `phrase "${phrase}"` : `subject containing "interview"`}`);
        return "interview_invite";
      }
      continue;
    }

    const phrase = findPhrase(sents, PHRASE_SETS[type] ?? []);
    if (phrase) {
      reasons.push(`event type "${type}" from phrase "${phrase}"`);
      return type;
    }
  }

  reasons.push('event type "other_update" (no more specific phrase matched)');
  return "other_update";
}

/**
 * Weighted classification (A7): job-related if the score reaches CLASSIFY_SCORE_THRESHOLD.
 * Event type is only computed when job-related, using the A7 priority list.
 */
export function classify(msg: NormalizedMessage, context: ClassifyContext = {}): ClassificationResult {
  const reasons: string[] = [];
  let score = 0;

  const subject = msg.subject;
  const body = msg.text;
  const domain = registrableDomain(msg.from);

  if (domain && ATS_AND_ASSESSMENT_DOMAINS.includes(domain)) {
    score += SCORE_WEIGHTS.atsSender;
    reasons.push(`+${SCORE_WEIGHTS.atsSender} sender domain "${domain}" is an ATS/assessment platform`);
  }

  const subjectPhrase = APPLICATION_PHRASES.find((p) => includesPhrase(subject, p));
  if (subjectPhrase) {
    score += SCORE_WEIGHTS.phraseInSubject;
    reasons.push(`+${SCORE_WEIGHTS.phraseInSubject} application phrase "${subjectPhrase}" in subject`);
  } else {
    const bodyPhrase = APPLICATION_PHRASES.find((p) => includesPhrase(body, p));
    if (bodyPhrase) {
      score += SCORE_WEIGHTS.phraseInBody;
      reasons.push(`+${SCORE_WEIGHTS.phraseInBody} application phrase "${bodyPhrase}" in body`);
    }
  }

  const portalPattern = CANDIDATE_PORTAL_PATTERNS.find((p) => body.toLowerCase().includes(p.toLowerCase()));
  if (portalPattern) {
    score += SCORE_WEIGHTS.candidatePortalLink;
    reasons.push(`+${SCORE_WEIGHTS.candidatePortalLink} candidate-portal link "${portalPattern}" in body`);
  }

  if (context.firstName && isHumanSender(msg)) {
    const greeting = new RegExp(`\\b(?:hi|hello|dear)\\s+${escapeRegex(context.firstName)}\\b`, "i");
    if (greeting.test(body)) {
      score += SCORE_WEIGHTS.humanGreetsByFirstName;
      reasons.push(`+${SCORE_WEIGHTS.humanGreetsByFirstName} human sender greets "${context.firstName}" by name`);
    }
  }

  const hasUnsubscribe = Boolean(msg.headers["list-unsubscribe"]);
  const marketingWord = MARKETING_WORDS.find((w) => includesPhrase(subject, w) || includesPhrase(body, w));
  if (hasUnsubscribe && marketingWord) {
    score += SCORE_WEIGHTS.unsubscribeWithMarketing;
    reasons.push(`${SCORE_WEIGHTS.unsubscribeWithMarketing} List-Unsubscribe header + marketing word "${marketingWord}"`);
  }

  const alertPhrase = ALERT_PHRASES.find((p) => includesPhrase(subject, p) || includesPhrase(body, p));
  if (alertPhrase && (domain === "linkedin.com" || domain === "indeed.com")) {
    score += SCORE_WEIGHTS.jobAlert;
    reasons.push(`${SCORE_WEIGHTS.jobAlert} LinkedIn/Indeed job-alert phrase "${alertPhrase}"`);
  }

  const isSelf = msg.labelIds.includes("SENT") || msg.from.toLowerCase() === context.selfEmail?.toLowerCase();
  if (isSelf) {
    score += SCORE_WEIGHTS.sentByUser;
    reasons.push(`${SCORE_WEIGHTS.sentByUser} message was sent by the user`);
  }

  const isJobRelated = score >= CLASSIFY_SCORE_THRESHOLD;
  reasons.push(`score ${score} ${isJobRelated ? ">=" : "<"} threshold ${CLASSIFY_SCORE_THRESHOLD} -> isJobRelated=${isJobRelated}`);

  const eventType = isJobRelated ? detectEventType(msg, reasons) : undefined;

  return { isJobRelated, score, eventType, reasons };
}
