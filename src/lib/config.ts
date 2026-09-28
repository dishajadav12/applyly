// All tunable lists and thresholds live here (see PROJECT_SPEC.md A6/A7).
// Bump PARSER_VERSION whenever extraction behavior changes.

export const PARSER_VERSION = 1;

/** Job-related if classification score >= this. */
export const CLASSIFY_SCORE_THRESHOLD = 3;

/** Maximum messages processed by a single scan step request. */
export const SCAN_STEP_BATCH_SIZE = 40;

/** Body text is truncated to this many bytes after decoding. */
export const MAX_BODY_BYTES = 15 * 1024;

/** Reject extracted role captures longer than this. */
export const MAX_ROLE_LENGTH = 100;

// ---------------------------------------------------------------------------
// A6: Gmail search lists
// ---------------------------------------------------------------------------

/** Applicant-tracking-system sender domains. */
export const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "myworkday.com",
  "workday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "taleo.net",
  "successfactors.com",
  "eightfold.ai",
  "avature.net",
  "workable.com",
  "rippling.com",
  "dover.com",
  "gem.com",
] as const;

/** Third-party assessment / interview platform sender domains. */
export const ASSESSMENT_DOMAINS = [
  "hackerrank.com",
  "codesignal.com",
  "coderpad.io",
  "hirevue.com",
  "karat.com",
  "codility.com",
  "testgorilla.com",
  "vervoe.com",
  "modernhire.com",
  "goodtime.io",
] as const;

/** Q1 senders: ATS + assessment platforms. */
export const Q1_DOMAINS = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS] as const;

/**
 * Q2 phrases. Bare single words are deliberately excluded; "interview" is
 * matched in the subject only (Q2_SUBJECT_TERMS).
 */
export const Q2_PHRASES = [
  "thank you for applying",
  "thanks for applying",
  "application received",
  "received your application",
  "your application to",
  "your application for",
  "your recent application",
  "thank you for your interest in",
  "online assessment",
  "coding assessment",
  "technical assessment",
  "coding challenge",
  "invitation to interview",
  "schedule an interview",
  "schedule your interview",
  "interview availability",
  "phone screen",
  "technical interview",
  "final round",
  "virtual onsite",
  "other candidates",
  "not moving forward",
  "move forward with other",
  "decided not to proceed",
  "no longer under consideration",
  "offer letter",
  "hiring team",
  "talent acquisition",
  "university recruiting",
] as const;

export const Q2_SUBJECT_TERMS = ["interview"] as const;

/** Noise senders excluded from Q2 (newsletters, job-alert digests). */
export const Q2_EXCLUDED_SENDERS = [
  "substack.com",
  "medium.com",
  "beehiiv.com",
  "mailchimpapp.net",
  "jobs-listings@linkedin.com",
  "jobalerts-noreply@linkedin.com",
] as const;

/** Q3: LinkedIn / Indeed application confirmations. */
export const Q3_SENDERS = [
  "jobs-noreply@linkedin.com",
  "indeed.com",
  "indeedapply",
] as const;

export const Q3_SUBJECT_TERMS = ["application", "applied"] as const;

/** Appended to every query. */
export const QUERY_EXCLUSIONS = "-in:chats -in:spam -in:trash";

export const GMAIL_LIST_PAGE_SIZE = 500;

/** "Since …" scan preset: the start of the user's job search (local midnight). */
export const HISTORY_START = { year: 2026, monthIndex: 4, day: 1 } as const;

// ---------------------------------------------------------------------------
// A7: Classification
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  atsSender: 4,
  phraseInSubject: 3,
  phraseInBody: 2,
  candidatePortalLink: 2,
  humanGreetsByFirstName: 1,
  unsubscribeWithMarketing: -4,
  jobAlert: -6,
  sentByUser: -10,
} as const;

/** Application phrases matched in subject/body for positive scoring. */
export const APPLICATION_PHRASES = [
  ...Q2_PHRASES,
  "your application",
  "applied to",
  "applied for",
  "application status",
  "next steps",
  "we'd like to invite you",
] as const;

export const CANDIDATE_PORTAL_PATTERNS = [
  "myworkdayjobs",
  "boards.greenhouse.io",
  "/candidate",
] as const;

/** Marketing words that, with a List-Unsubscribe header, score negative. */
export const MARKETING_WORDS = [
  "newsletter",
  "webinar",
  "% off",
  "event",
  "sale",
] as const;

/** LinkedIn / Indeed job-alert phrases (score negative). */
export const ALERT_PHRASES = [
  "jobs you may be interested in",
  "new jobs for you",
  "recommended",
] as const;

export const REJECTION_PHRASES = [
  "other candidates",
  "not moving forward",
  "decided not to proceed",
  "no longer under consideration",
  "position has been filled",
] as const;

/** "unfortunately" only counts as rejection together with application context. */
export const REJECTION_CONTEXT_WORD = "unfortunately";

/** Event-type priority: first match wins. */
export const EVENT_TYPE_PRIORITY = [
  "offer",
  "rejection",
  "withdrawal",
  "final_interview",
  "interview_invite",
  "assessment",
  "application_confirmation",
  "recruiter_outreach",
  "other_update",
] as const;

export type EventType = (typeof EVENT_TYPE_PRIORITY)[number];

// ---------------------------------------------------------------------------
// A7: Company / role / recruiter / req id
// ---------------------------------------------------------------------------

/** Suffix/noise words stripped when computing company_key. */
export const COMPANY_SUFFIXES = [
  "inc",
  "llc",
  "ltd",
  "corp",
  "technologies",
  "labs",
  "recruiting",
  "careers",
  "talent",
  "hiring team",
] as const;

/** Sender domain (or domain fragment) → canonical company name. */
export const COMPANY_ALIASES: Record<string, string> = {
  datadoghq: "Datadog",
  "amazon.jobs": "Amazon",
  metacareers: "Meta",
};

export const FREEMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
] as const;

export const ROLE_KEYWORDS = [
  "engineer",
  "developer",
  "swe",
  "new grad",
  "university grad",
  "2027",
] as const;

export const RECRUITER_KEYWORDS = [
  "recruiter",
  "talent",
  "sourcer",
  "university recruiting",
] as const;

export const NOREPLY_PATTERNS = ["noreply", "no-reply", "donotreply", "do-not-reply"] as const;

/** Req ID patterns (A7). Lever posting UUIDs included. */
export const REQ_ID_PATTERNS: readonly RegExp[] = [
  /\bR-?\d{4,}\b/,
  /\bJR\d{5,}\b/,
  /\bReq(?:uisition)? ?(?:ID|#)?:? ?[\w-]+/i,
  /\bJob ID:? ?[\w-]+/i,
  /gh_jid=\d+/,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
];

// ---------------------------------------------------------------------------
// A8: Matching
// ---------------------------------------------------------------------------

export const ROLE_SIMILARITY_THRESHOLD = 0.85;

/** Tokens ignored when comparing roles. */
export const ROLE_IGNORED_TOKENS = [
  "new grad",
  "2027",
  "entry level",
  "early career",
  "university",
  "i",
] as const;

export const STATUS_RANK = {
  Applied: 10,
  "Recruiter Contacted": 20,
  Assessment: 30,
  Interviewing: 40,
  "Final Round": 50,
} as const;
