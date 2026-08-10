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

Rewrite the structured worklist data below into a concise, professional weekly status update in prose, suitable for sharing with your manager and team.

The data has two kinds of items: work COMPLETED in the past week (marked "✓ Completed") and work that is still OUTSTANDING (open or in-progress tasks, marked "[ ]" or "[~]"). Your update must cover both — first what you accomplished this week, then what remains open or in progress.

Guidance:
- Group related work by theme rather than listing every dashboard mechanically
- Lead with the most important completed progress first, then cover outstanding/in-progress work
- Always account for the outstanding items — do not drop open or in-progress tasks
- If there is genuinely no completed work and no outstanding work, say so plainly; otherwise never describe the week as "quiet" or without activity
- Keep it tight — a few short paragraphs, not a wall of text
- No preamble (e.g. "Here is your update") and no sign-off — just the update itself
- Plain, professional tone — no markdown fences, no headers, no bullet lists; write in flowing paragraphs

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
