// All tunable lists and thresholds live here (see PROJECT_SPEC.md A6/A7).
// Bump PARSER_VERSION whenever extraction behavior changes.

export const PARSER_VERSION = 11;

/** Job-related if classification score >= this. */
export const CLASSIFY_SCORE_THRESHOLD = 3;

/** Maximum messages processed by a single scan step request. */
export const SCAN_STEP_BATCH_SIZE = 40;

/** Phase 11: minimum gap between scan starts for one user, so repeated clicks can't spam Gmail/the DB. */
export const SCAN_START_RATE_LIMIT_MS = 10_000;

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

/**
 * ATS vendors that also hire (staff email candidates as employees). A person writing from one of these
 * domains means the vendor itself is the employer; for other ATS domains a person's name is never a company.
 */
export const VENDOR_AS_EMPLOYER_DOMAINS: readonly string[] = ["rippling.com", "gem.com", "dover.com", "workable.com"];

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
  "we got it",
  "thank you for considering",
  "thanks for considering",
  "effort you put into applying",
  "for applying with us",
  "interest in a career at",
  "considering a career",
  "application submitted",
  "submitted your application",
  "application has been submitted",
  "we received your application",
  "thank you for your application",
  "application was submitted",
  "your application was sent",
  "your application to",
  "your application for",
  "your recent application",
  "thank you for your interest in",
  "thanks for your interest in",
  "received your resume",
  "thanks for thinking of us",
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

/** Email open-tracking tools (Mailtrack etc.): their "opened" notifications are never application events. */
export const EMAIL_TRACKER_DOMAINS: readonly string[] = ["mailtrack.io", "mailtrack.com", "mailtracker.com", "mailtracker.io", "mailtracking.com", "yesware.com", "mixmax.com", "getnotify.com", "bananatag.com", "mailspring.com"];

/** Noise senders excluded from Q2 (newsletters, job-alert digests). */
export const Q2_EXCLUDED_SENDERS = [
  "substack.com",
  "medium.com",
  "beehiiv.com",
  "mailchimpapp.net",
  "jobs-listings@linkedin.com",
  "jobalerts-noreply@linkedin.com",
  ...EMAIL_TRACKER_DOMAINS,
] as const;

/** Q3: LinkedIn / Indeed application confirmations. */
export const Q3_SENDERS = [
  "jobs-noreply@linkedin.com",
  "indeed.com",
  "indeedapply",
] as const;

export const Q3_SUBJECT_TERMS = ["application", "applied"] as const;

/**
 * Q4: sender-name/address terms typical of recruiting mail. Catches confirmations whose wording
 * Q2's phrase list misses (Gmail's from: matches both display name and address).
 */
export const Q4_SENDER_TERMS = [
  "recruiting",
  "recruiter",
  "recruitment",
  "talent",
  "careers",
  "hiring",
  "applicant",
  "candidate",
  "campus",
  "jobs",
] as const;

/** Q4 noise: the same senders Q2 excludes, plus job boards/aggregators. */
export const Q4_EXCLUDED_SENDERS = [...Q2_EXCLUDED_SENDERS, "linkedin.com", "glassdoor.com", "ziprecruiter.com", "simplify.jobs"] as const;

/** Q5: learned employer domains per scan, split so no single Gmail query gets too long. */
export const Q5_DOMAINS_PER_QUERY = 40;

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
  supportSurvey: -6,
  emailTracker: -10,
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
  "early careers",
  "early career",
  "university recruiting",
  "talent team",
  "recruiting team",
  "careers team",
  "talent acquisition team",
] as const;

/** Substrings of ATS display names that name the vendor, not the employer; never used as a company fallback. */
export const GENERIC_SENDER_NAMES: readonly string[] = ["greenhouse", "lever", "workday", "ashby", "no-reply", "noreply", "do not reply", "jobvite", "icims", "smartrecruiters", "notification", "workable", "rippling"];

/**
 * Customer-support / help-desk platforms. Employers run candidate support (e.g. assessment help) through them,
 * so the sender domain names the vendor (Zendesk), never the employer.
 */
export const HELPDESK_DOMAINS: readonly string[] = ["zendesk.com", "freshdesk.com", "freshservice.com", "helpscoutmail.com", "intercom-mail.com", "intercom.io", "zohodesk.com", "kayako.com", "desk.com"];

/** Subject/body wording of open-tracking notifications (checked in the subject only, to avoid false hits). */
export const EMAIL_TRACKER_PHRASES = ["mailtracker", "mailtrack", "email tracker", "was opened by", "has been opened", "opened your email"] as const;

/** Support-survey (CSAT) wording: such mail is never an application event. */
export const SURVEY_PHRASES = ["rate the support", "rate your support", "how did we do", "satisfaction survey", "rate your experience with"] as const;

/** Job boards and aggregators: their sender domain is never the employer. */
export const NON_EMPLOYER_SENDER_DOMAINS: readonly string[] = ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "joinhandshake.com", "wellfound.com", "simplify.jobs", "substack.com", ...HELPDESK_DOMAINS, ...EMAIL_TRACKER_DOMAINS];

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
  // The id must contain a digit, so "requirements" / "job description" are never read as ids.
  /\bReq(?:uisition)? ?(?:ID|#)?:? ?(?=[\w-]*\d)[\w-]+/i,
  /\bJob (?:ID|number|no\.?|#):? ?(?=[\w-]*\d)[\w-]+/i,
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

/** applications.status (A5 TS type). */
export type Status =
  | "Applied"
  | "Recruiter Contacted"
  | "Assessment"
  | "Interviewing"
  | "Final Round"
  | "Offer"
  | "Rejected"
  | "Withdrawn"
  | "Unknown";

/** "Terminal" (A8): a stage event of this type ends the application, unless a later stage event reopens it. */
export const TERMINAL_STATUS_BY_EVENT_TYPE = {
  offer: "Offer",
  rejection: "Rejected",
  withdrawal: "Withdrawn",
} as const satisfies Partial<Record<EventType, Status>>;

export const TERMINAL_STATUSES = Object.values(TERMINAL_STATUS_BY_EVENT_TYPE);

/**
 * Stage events (A8): the ones whose latest-dated occurrence decides whether an
 * application is terminal, and whose later occurrence can reopen it. application_confirmation,
 * recruiter_outreach, and other_update are deliberately excluded (not stage events), though
 * confirmation/recruiter_outreach still contribute to the status-rank fallback below.
 */
export const STAGE_EVENT_TYPES = [
  "assessment",
  "interview_invite",
  "final_interview",
  "offer",
  "rejection",
  "withdrawal",
] as const satisfies readonly EventType[];

/** Status rank contributed by each non-terminal event type, for the "highest-ranked stage seen" fallback (A8). */
export const STATUS_RANK_BY_EVENT_TYPE = {
  application_confirmation: STATUS_RANK.Applied,
  recruiter_outreach: STATUS_RANK["Recruiter Contacted"],
  assessment: STATUS_RANK.Assessment,
  interview_invite: STATUS_RANK.Interviewing,
  final_interview: STATUS_RANK["Final Round"],
} as const satisfies Partial<Record<EventType, number>>;

// ---------------------------------------------------------------------------
// A9: Dashboard table
// ---------------------------------------------------------------------------

/** Pipeline order for the Status column sort and the status filter chips (A9). */
export const STATUS_DISPLAY_ORDER = [
  "Applied",
  "Recruiter Contacted",
  "Assessment",
  "Interviewing",
  "Final Round",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Unknown",
] as const satisfies readonly Status[];

// ---------------------------------------------------------------------------
// A9: Detail panel / timeline
// ---------------------------------------------------------------------------

/** Human-readable timeline labels for each event_type (A9 detail panel). */
export const EVENT_TYPE_LABELS = {
  application_confirmation: "Application received",
  recruiter_outreach: "Recruiter outreach",
  assessment: "Assessment",
  interview_invite: "Interview invite",
  final_interview: "Final round",
  offer: "Offer",
  rejection: "Rejection",
  withdrawal: "Withdrawal",
  other_update: "Update",
} as const satisfies Record<EventType, string>;

// ---------------------------------------------------------------------------
// Phase 12: optional AI fallback (off by default)
// ---------------------------------------------------------------------------

/** A classification score below this counts as "low confidence" and is eligible for the AI fallback. */
export const AI_LOW_CONFIDENCE_THRESHOLD = CLASSIFY_SCORE_THRESHOLD + 2;

/** Only the first this many bytes of the (already-truncated) body are ever sent to an AI provider. */
export const AI_TEXT_BYTES = 2 * 1024;

export const AI_PROVIDERS = ["gemini", "ollama"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const AI_GEMINI_MODEL = "gemini-2.0-flash";
export const AI_OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
export const AI_OLLAMA_DEFAULT_MODEL = "llama3.2";
