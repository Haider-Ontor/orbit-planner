import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { getSettings } from './settings';
import { today } from './dates';

// What Claude returns when it reads an email, message, page or voice transcript.
const ExtractedTask = z.object({
  title: z.string().describe('Short imperative title, e.g. "Submit visa application form"'),
  details: z.string().describe('One or two sentences of context. Empty string if none.'),
  due_date: z.string().nullable().describe('Deadline as YYYY-MM-DD, resolved against today. null if none.'),
  due_time: z.string().nullable().describe('Deadline time as 24h HH:MM in the user\'s local time. null if none.'),
  start_datetime: z.string().nullable().describe('If this is a meeting/class/appointment at a set time: local ISO datetime YYYY-MM-DDTHH:MM. Otherwise null.'),
  duration_minutes: z.number().nullable().describe('Expected length for events or estimated effort. null if unknown.'),
  impact: z.number().describe('1-5. Consequence / reward of doing it (5 = career, grades, money, legal).'),
  urgency: z.number().describe('1-5. How time-critical it is, independent of the deadline date.'),
  requirements: z.array(z.string()).describe('Concrete things needed to complete it: documents, fees, sign-ins, attachments, people to contact.'),
  links: z.array(z.string()).describe('URLs mentioned that are needed for the task.'),
  project_hint: z.string().nullable().describe('Name of a project from the provided list this belongs to, or null.'),
  repeat: z.string().nullable().describe('If it recurs: "daily", "weekdays", "weekly:Mon,Wed" or "every:N". Else null.'),
});

const Extraction = z.object({
  summary: z.string().describe('One-line summary of the source text.'),
  tasks: z.array(ExtractedTask),
});

export type ExtractedTask = z.infer<typeof ExtractedTask>;
export type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You turn messy input (emails, chat messages, web pages, lecture notes, voice transcripts) into an actionable task list for a busy person (study, work and personal life).

Rules:
- Only create tasks the reader actually has to do. Skip pleasantries, marketing and FYI content.
- Resolve relative dates ("next Friday", "within 7 days", "by end of month") against the given today date and timezone. Write dates as YYYY-MM-DD.
- If a deadline has a time and a timezone different from the user's, convert it to the user's local time.
- Put every prerequisite into "requirements" as a short checklist item (e.g. "Scan passport photo page", "Pay £50 application fee", "Get supervisor signature").
- Prefer one task with a requirements checklist over many tiny tasks, unless the steps have separate deadlines.
- Score impact and urgency honestly on 1-5; most everyday tasks are 2-3.
- If nothing is actionable, return an empty tasks array.`;

function client() {
  const key = getSettings().anthropicKey.trim();
  if (!key) throw new Error('Add your Claude API key in Settings → AI to use smart capture.');
  // Personal app: the key is the user's own and stays on their device.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
}

function contextLine(projects: string[]) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const d = new Date();
  return `Today is ${today()} (${d.toLocaleDateString('en-GB', { weekday: 'long' })}), local time ${d.toTimeString().slice(0, 5)}, timezone ${tz}.\n` +
    `Existing projects: ${projects.length ? projects.join('; ') : '(none)'}.`;
}

async function run(prompt: string, effort: 'low' | 'medium' | 'high'): Promise<Extraction> {
  const s = getSettings();
  let res;
  try {
    res = await client().beta.messages.parse({
      model: s.aiModel || 'claude-opus-5-5',
      max_tokens: 16000,
      // If the model declines, the API re-runs the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort, format: betaZodOutputFormat(Extraction) },
    });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to process this text.');
  if (res.stop_reason === 'max_tokens') throw new Error('The text produced too many tasks. Try pasting a shorter part.');
  if (!res.parsed_output) throw new Error('Could not read the AI response. Try again.');
  return res.parsed_output;
}

export function extractTasks(text: string, projects: string[]) {
  return run(`${contextLine(projects)}\n\nExtract the tasks from this text:\n<source>\n${text}\n</source>`, 'medium');
}

export function organizeNote(title: string, body: string, projects: string[]) {
  return run(
    `${contextLine(projects)}\n\nThis is one of my own notes (possibly a voice transcript with filler words). ` +
      `Pull out everything I said I need or want to do.\n<note title="${title.replace(/"/g, "'")}">\n${body}\n</note>`,
    'medium',
  );
}

/* ---------- goal breakdown → tasks with sub-tasks and deadlines ---------- */
const PlanSubAI = z.object({
  name: z.string().describe('Short, concrete sub-task (max ~60 characters)'),
  due_date: z.string().nullable().describe('Deadline YYYY-MM-DD within the plan dates, or null'),
});
const PlanTaskAI = z.object({
  name: z.string().describe('Short name of a task / phase (max ~60 characters)'),
  start_date: z.string().nullable().describe('YYYY-MM-DD the task should start'),
  due_date: z.string().nullable().describe('YYYY-MM-DD the task should be finished'),
  subtasks: z.array(PlanSubAI),
});
const Plan = z.object({ tasks: z.array(PlanTaskAI) });
export type PlanTasksAI = z.infer<typeof Plan>['tasks'];

const PLAN_SYSTEM = `You break a personal goal into a short, realistic plan that is easy to follow on a phone.
- 2 to 5 tasks, each with 1 to 5 sub-tasks. Every sub-task must be concrete and finishable (you know when it is done).
- Give each sub-task a deadline and each task a start and finish date, all between the plan start and finish dates.
- Spread the work across the available days; keep the last day for review or finishing.
- If the goal is bigger than the time available, plan the most important part and end with a sub-task "Decide next steps".`;

export async function planGoal(goal: string, details: string, startDate: string, finishBy: string): Promise<PlanTasksAI> {
  const s = getSettings();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let res;
  try {
    res = await client().beta.messages.parse({
      model: s.aiModel || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: PLAN_SYSTEM,
      messages: [{
        role: 'user',
        content: `Goal: ${goal}\n${details ? `Details: ${details}\n` : ''}Plan start: ${startDate}. Finish by: ${finishBy}. Today is ${today()} (timezone ${tz}).`,
      }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Plan) },
    });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to plan this goal.');
  if (!res.parsed_output?.tasks.length) throw new Error('Could not build a plan. Try adding a few details to the goal.');
  return res.parsed_output.tasks;
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude API key was rejected. Check Settings → AI.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key cannot use that model.';
  if (e instanceof Anthropic.NotFoundError) return 'Model not found. Check the model name in Settings → AI.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API. Wait a minute and retry.';
  if (e instanceof Anthropic.APIConnectionError) return 'No connection to the Claude API. Check your internet.';
  if (e instanceof Anthropic.APIError) return `Claude API error: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
