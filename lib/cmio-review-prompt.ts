// Pure module: LLM extraction prompt + roster for the CMIO Review tab.
// No imports, no side effects. Consumed by an API route that calls Claude
// (Anthropic SDK) once per transcript chunk to extract action-item rows
// as JSON, matching the CMIO_Weekly_Review Excel tracker's columns.

export interface ExtractedRow {
  date: string; // "YYYY-MM-DD" — the MEETING date
  analyst: string; // "Firstname Lastname" (owner), or "A & B" for shared
  presenter: string; // "Firstname Lastname" who raised it; may be "" (empty)
  topic: string; // short Division/Topic label
  action: string; // one imperative sentence, self-contained
  priority: "High" | "Medium" | "Low";
  status: "Open" | "In progress" | "Blocked" | "Done";
  source: string; // e.g. "Ely Davis @ 19:34, stated" or "Steve McCalley @ 4:02, inferred"
}

// email -> "Firstname Lastname" (Analyst column form)
export const CMIO_ROSTER: Record<string, string> = {
  "smccalley@phoenixchildrens.com": "Steve McCalley",
  "vvaidya@phoenixchildrens.com": "Vinay Vaidya (CMIO)",
  "kyeager@phoenixchildrens.com": "Karen Yeager",
  "rchelala@phoenixchildrens.com": "Robert Chelala",
  "jrakkar@phoenixchildrens.com": "Jay Rakkar",
  "rbuffone@phoenixchildrens.com": "Rebecca Buffone",
  "vkhatu@phoenixchildrens.com": "Vrinda Khatu",
  "kseth@phoenixchildrens.com": "K. Seth",
  "edavis4@phoenixchildrens.com": "Ely Davis",
};

const ROSTER_NAMES = Object.values(CMIO_ROSTER)
  .map((name) => name.replace(/\s*\(CMIO\)\s*$/, ""))
  .join(", ");

const NON_TEAM_COUNTERPARTIES =
  "Rick, Majid, Jesse, Sean, Cammy, Caitlin, Tyler (JIRA), Dr. Friedman, Dr. Hopkins, Dr. King, Dr. Sohal";

export function buildExtractionPrompt(args: {
  transcriptChunk: string;
  meetingDate: string;
  chunkIndex: number;
  chunkCount: number;
}): string {
  const { transcriptChunk, meetingDate, chunkIndex, chunkCount } = args;

  return `You are extracting action-item rows from a transcript of the Monday CMIO (Chief Medical Information Officer) weekly review meeting, for direct entry into the CMIO_Weekly_Review Excel tracker.

This is chunk ${chunkIndex + 1} of ${chunkCount} of one meeting's transcript. Extract only what THIS chunk supports — do not try to recall or invent content from other chunks. The caller merges and de-dupes rows across all chunks afterward, so it is fine if a commitment spans a chunk boundary: capture it if this chunk contains the actual commitment being made.

Return ONLY a JSON array of objects. No prose, no explanation, no markdown code fences — just the raw JSON array (an empty array [] if this chunk contains no action items).

Each object must have exactly these fields:
{
  "date": "YYYY-MM-DD",
  "analyst": "Firstname Lastname",
  "presenter": "Firstname Lastname or empty string",
  "topic": "short Division/Topic label",
  "action": "one imperative sentence",
  "priority": "High" | "Medium" | "Low",
  "status": "Open" | "In progress" | "Blocked" | "Done",
  "source": "Name @ timestamp, stated|inferred"
}

=== WHAT COUNTS AS AN ACTION ITEM ===
Log a row when: someone commits to doing something, someone is asked to do something, or the group agrees something must happen next. A decision that closes a question also counts — log it with status "Done".

Do NOT log ideas that are floated but not landed (e.g. "just spitballing," a suggestion nobody picked up). Omit those entirely.

Most commitments are embedded mid-sentence in ordinary conversation, not announced in a dedicated "action items" section — read for substance, not headers.

Merge duplicates: if the same commitment is restated or re-confirmed several times in this chunk, log it as ONE row, not several.

Ignore pure backchannel ("Mhm.", "Yeah.", "Gotcha.", "Right.") — these are not action items.

=== NOISY TRANSCRIPTION ===
This is an automated transcript and will contain misheard words and garbled names (e.g. "Yant.", "Bair."). If a proper noun is garbled but context makes the intended name clear (compare against the roster below), normalize it to the correct form. If it's unclear who is meant, keep the transcript's version as given rather than guessing.

Also normalize any "Lastname, Firstname" transcript formatting (e.g. "Mccalley, Steve") to the tracker's "Firstname Lastname" form.

=== PHI — PATIENT INFORMATION ===
Strip anything that identifies a specific patient before writing a row (names, MRNs, room numbers, unique identifying case details). Provider and staff names are fine and expected. If a would-be action item cannot be stated without patient-identifying detail, omit that row entirely rather than sanitize it in place.

=== FIELD-BY-FIELD GUIDANCE ===

date: Always "${meetingDate}" for every row from this meeting. This is the MEETING date, never a due date mentioned in conversation and never today's date.

analyst: The OWNER of the action item, in "Firstname Lastname" form, matched against this roster:
${ROSTER_NAMES}
For genuinely shared ownership, use "Firstname Lastname & Firstname Lastname" (e.g. "Robert Chelala & Karen Yeager"). If ownership is genuinely unclear from context, assign the most likely owner based on who is speaking about or responsible for that division — do not leave this blank.

presenter: Who raised or introduced the topic — this is often NOT the same as the owner, though in this Monday CMIO review each person typically presents their own divisions, so presenter and analyst matching is expected and normal. Leave presenter as "" (empty string) only when the topic emerged from open group discussion with no single person introducing it.

topic: A short Division/Topic label in the tracker's existing style — reuse the same label consistently for the same subject within this chunk. Examples: "Safety Dashboard", "USNWR 2027 Planning", "PSQ Dashboard (EMAR Administrations)", "Meeting Notes Automation".

action: One plain imperative sentence (e.g. "Rebuild the safety dashboard filters to exclude closed cases."), specific enough that someone could act on it without reading the transcript. If a due date was explicitly stated, fold it in at the end in the form "...(due 7/29)".

priority: Decide using this rubric, in order:
- If the meeting explicitly states a priority level, use it verbatim (mapped to High/Medium/Low).
- High: tied to a USNWR submission/scoring deadline; patient-safety or regulatory impact; explicitly requested by Vinay Vaidya (the CMIO) or a division chief; blocking someone else's work; or has a stated deadline within roughly 2 weeks.
- Medium: a committed deliverable with no hard external deadline — dashboard builds, validation work, division-requested reports, scheduled follow-ups. This is the DEFAULT for ordinary real work; use it whenever nothing pushes the item to High or Low.
- Low: process improvements, exploratory or "nice to have" work, backlog items, nothing pressing.
If torn between two levels, choose the LOWER one. Never leave priority blank — it must be exactly "High", "Medium", or "Low".

status: Do not default everything to "Open" — read the conversation for actual state.
- "Open": newly raised in this meeting, no work started yet.
- "In progress": work has visibly already started.
- "Blocked": waiting on someone or something outside the team's control.
- "Done": completed, or a decision was reached that closes the matter in this meeting.

source: One short clause: "<Presenter or speaker name> @ <timestamp from the transcript>, stated" or "..., inferred". Use "stated" when the person explicitly committed to or was assigned the action. Use "inferred" when you deduced the action item from surrounding context rather than an explicit statement. Never invent an action that cannot be traced to a specific moment in the transcript — if you can't point to a timestamp and speaker for it, don't log it.

=== ROSTER (email -> tracker name) ===
${Object.entries(CMIO_ROSTER)
  .map(([email, name]) => `${email} -> ${name}`)
  .join("\n")}

Recurring counterparties who appear in conversation but are NEVER owners on this team's tracker (they belong to other teams/departments): ${NON_TEAM_COUNTERPARTIES}. Use them freely as the "presenter" or in the action text where relevant, but never as "analyst".

If a name appears in the transcript that is not recognized from the roster or the counterparty list above, use it as given rather than guessing at a match.

=== TRANSCRIPT CHUNK (${chunkIndex + 1} of ${chunkCount}) ===
${transcriptChunk}`;
}
