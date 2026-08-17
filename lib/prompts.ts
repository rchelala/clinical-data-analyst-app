export type Language = "dax" | "sql";
export type Density = "brief" | "detailed" | "step-by-step";

const densityInstructions: Record<Density, string> = {
  brief: `Add short, concise inline comments (1 short phrase each) only on the most important lines.
Comment every meaningful operation but keep each comment under 10 words.`,

  detailed: `Add thorough inline comments explaining the purpose and logic of each meaningful line or clause.
Each comment should be a clear sentence describing WHAT is happening and WHY.
Group related lines with a section header comment where appropriate.`,

  "step-by-step": `Add very detailed step-by-step inline comments as if explaining the code to someone completely new to the language.
For every line or clause:
- Explain WHAT it does
- Explain WHY it is needed
- Mention any important DAX/SQL behavior or gotcha relevant to that line
Use section header comments to break the logic into phases (e.g., // === FILTER CONTEXT === ).`,
};

export function buildPrompt(code: string, language: Language, density: Density): string {
  const langLabel = language === "dax" ? "DAX (Data Analysis Expressions for Power BI / SSAS)" : "SQL";
  const commentChar = language === "dax" ? "//" : "--";

  return `You are an expert ${langLabel} developer and teacher.

Your task: Add inline comments to the ${langLabel} code below.

Comment style rules:
- Every comment MUST start with ${commentChar}** (two asterisks immediately after the comment characters, then a space, then the comment text)
  Example: ${commentChar}** This filter removes cancelled orders
- Place comments on the same line as the code when the line is short enough, otherwise on the line ABOVE
- Never modify the actual code — only add comments
- Do NOT wrap the output in markdown fences or backticks
- Return ONLY the commented code, nothing else
- Add this exact line as the very first line of your output:
  ${commentChar}** *** Commented by DAX & SQL Commenter App ***

Comment density instruction:
${densityInstructions[density]}

${langLabel} code to comment:
${code}`;
}

export function buildWeeklyUpdatePrompt(structuredMarkdown: string, analystName: string): string {
  return `You are an analytics manager's trusted analyst, ${analystName}, writing your own weekly status update.

Rewrite the structured worklist data below into a scannable, sectioned weekly status update suitable for sharing with your manager and team.

The data has two kinds of items: work COMPLETED in the past week (marked "✓ Completed") and work that is still OUTSTANDING (open or in-progress tasks, marked "[ ]" or "[~]"). Every item must be accounted for — fold both into the one-line narrative you write for it.

OUTPUT FORMAT — the block between the >>> markers below shows the SHAPE to follow. Its
content is fictional filler used only to illustrate spacing and line structure. Never copy
any name, date, ticket identifier, or phrase out of it — every word you output must come
from the worklist data at the end of this message.

>>>
Meetings this week:
6/02 - Example meeting with a stakeholder group
6/04 - Example working session

Dashboard:
Example Dashboard One - Short narrative of what happened, in one or two sentences
Example Dashboard Two - Short narrative of what happened

Report Subscriptions:
Example Subscription - Short narrative of what happened

Tasks:
Example Parent Project:
X11 first task narrative
X12 & X13: second task narrative

PSQ:
Example PSQ - Short narrative of what happened
>>>

Rules:
- Use exactly these five section headings, in this order, each alone on its own line ending with a colon: "Meetings this week:", "Dashboard:", "Report Subscriptions:", "Tasks:", "PSQ:"
- ALWAYS print every heading, even when there is nothing to report under it. Print the heading and move on to the next section — leave it blank. Never write "None", "N/A", or "No activity".
- One item per line in the form "Name - short narrative". Keep each line to one or two sentences.
- Under "Tasks:", group by the parent project name from the source data (the bolded name in the "Tasks assigned to me" section). Put that parent name on its own line ending with a colon, then one line per task beneath it.
- Preserve ticket identifiers exactly as written in the source (e.g. J23, J30 & J31, i14). Never invent an identifier and never drop one.
- Include EVERY entry and EVERY task group from the source data. Do not merge two groups into one, and do not omit a group because it is short.
- Report only what the worklist data states. Never add a dashboard, meeting, subscription, PSQ, person, or ticket that does not appear in it.
- Map the source sections onto the output sections: Dashboards → "Dashboard:", Report Subscriptions → "Report Subscriptions:", Tasks assigned to me → "Tasks:", PSQs → "PSQ:".
- Skip source entries marked "_No activity this week_" rather than writing a line saying nothing happened.
- Plain text only — no markdown, no bold, no bullets or leading dashes, no code fences, no numbering.
- One blank line between sections. No preamble (e.g. "Here is your update") and no sign-off.

Structured worklist data:
${structuredMarkdown}`;
}

export function buildSummaryPrompt(code: string, language: Language): string {
  const langLabel = language === "dax" ? "DAX (Data Analysis Expressions for Power BI / SSAS)" : "SQL";

  return `You are an expert ${langLabel} developer.

Analyze the following ${langLabel} code and provide a concise plain-English summary.

Your summary must include:
1. **What it does** — one sentence describing the overall purpose
2. **Key operations** — bullet points covering the main logic steps, filters, joins, or calculations
3. **Output** — what data or result it produces

Keep the total summary under 150 words. Do not include any code. Do not use markdown fences.

${langLabel} code:
${code}`;
}
