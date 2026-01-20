export interface PlanStep {
  description?: string;
  title?: string;
}

export interface Plan {
  title?: string;
  steps?: Array<PlanStep | string>;
}

export function formatPlanStepText(step: unknown): string | null {
  if (typeof step === "string") {
    const trimmed = step.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof step === "object" && step !== null) {
    const desc = (step as { description?: unknown }).description;
    if (typeof desc === "string") {
      const trimmed = desc.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    const title = (step as { title?: unknown }).title;
    if (typeof title === "string") {
      const trimmed = title.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

export function formatPlanForNotification(
  plan: Plan,
  maxSteps: number,
  maxStepLength: number
): string {
  const parts: string[] = [];
  if (plan.title) {
    parts.push(`📋 ${plan.title}`);
  }
  if (plan.steps && plan.steps.length > 0) {
    const validSteps: string[] = [];
    for (const step of plan.steps) {
      const stepText = formatPlanStepText(step);
      if (!stepText) {
        continue;
      }
      validSteps.push(stepText);
    }

    const stepsPreview = validSteps.slice(0, maxSteps);
    stepsPreview.forEach((stepText, index) => {
      const truncatedStep = stepText.length > maxStepLength
        ? stepText.substring(0, maxStepLength - 3) + "..."
        : stepText;
      if (truncatedStep.trim().length === 0) {
        return;
      }
      parts.push(`${index + 1}. ${truncatedStep}`);
    });
    if (validSteps.length > maxSteps) {
      parts.push(`... and ${validSteps.length - maxSteps} more steps`);
    }
  }
  return parts.join("\n");
}
