import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export type RiskLevel = 'safe' | 'sensitive';

export interface PlanStep {
  index: number;
  description: string;
  risk: RiskLevel;
  completed: boolean;
  completedAt?: string;
}

export interface PlanFrontmatter {
  title: string;
  taskRef: string;
  riskLevel: RiskLevel;
  created: string;
}

export interface PlanFile {
  filename: string;
  filepath: string;
  frontmatter: PlanFrontmatter;
  steps: PlanStep[];
}

export function createPlanFile(
  taskSlug: string,
  title: string,
  steps: Array<{ description: string; risk: RiskLevel }>,
  plansDir: string,
): PlanFile {
  const filename = `PLAN_${taskSlug}.md`;
  const filepath = path.join(plansDir, filename);
  const overallRisk: RiskLevel = steps.some(s => s.risk === 'sensitive') ? 'sensitive' : 'safe';

  const planFile: PlanFile = {
    filename,
    filepath,
    frontmatter: {
      title,
      taskRef: `${taskSlug}.md`,
      riskLevel: overallRisk,
      created: new Date().toISOString(),
    },
    steps: steps.map((s, i) => ({
      index: i + 1,
      description: s.description,
      risk: s.risk,
      completed: false,
    })),
  };

  writePlanFile(planFile);
  return planFile;
}

export function parsePlanFile(filepath: string): PlanFile {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const parsed = matter(raw);
  const frontmatter = parsed.data as PlanFrontmatter;
  const steps = parseStepsFromBody(parsed.content);

  return {
    filename: path.basename(filepath),
    filepath,
    frontmatter,
    steps,
  };
}

function parseStepsFromBody(body: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = body.split('\n');
  let index = 1;

  for (const line of lines) {
    const checkedMatch = line.match(/^- \[x\] Step (\d+): (.+?) \[(safe|sensitive).*\](?:\s+.*completed\s+(\S+))?/i);
    const uncheckedMatch = line.match(/^- \[ \] Step (\d+): (.+?) \[(safe|sensitive).*\]/i);

    if (checkedMatch) {
      steps.push({
        index: index++,
        description: checkedMatch[2].trim(),
        risk: checkedMatch[3] as RiskLevel,
        completed: true,
        completedAt: checkedMatch[4],
      });
    } else if (uncheckedMatch) {
      steps.push({
        index: index++,
        description: uncheckedMatch[2].trim(),
        risk: uncheckedMatch[3] as RiskLevel,
        completed: false,
      });
    }
  }

  return steps;
}

export function markStepComplete(plan: PlanFile, stepIndex: number): PlanFile {
  const steps = plan.steps.map(s =>
    s.index === stepIndex ? { ...s, completed: true, completedAt: new Date().toISOString() } : s,
  );
  return { ...plan, steps };
}

export function isComplete(plan: PlanFile): boolean {
  return plan.steps.length > 0 && plan.steps.every(s => s.completed);
}

export function writePlanFile(plan: PlanFile): void {
  const stepsBody = plan.steps
    .map(s => {
      const checkbox = s.completed ? '[x]' : '[ ]';
      const suffix = s.completed && s.completedAt ? ` completed ${s.completedAt}` : '';
      return `- ${checkbox} Step ${s.index}: ${s.description} [${s.risk}]${suffix}`;
    })
    .join('\n');

  const body = `\n# Plan: ${plan.frontmatter.title}\n\n${stepsBody}\n`;
  const content = matter.stringify(body, plan.frontmatter as unknown as Record<string, unknown>);
  const dir = path.dirname(plan.filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(plan.filepath, content, 'utf-8');
}
