export interface PlanStep {
  description?: string;
  title?: string;
}

export interface Plan {
  title?: string;
  steps?: Array<PlanStep | string>;
}

/**
 * Extracts and normalizes step text from a plan step.
 * 
 * Handles multiple input formats:
 * - string: returned as-is (after trim)
 * - object with description: returns description if non-empty
 * - object with title: returns title as fallback if description is empty
 * - other values: returns null
 * 
 * All text is trimmed, and null is returned if the result is empty.
 * 
 * @param step - The step object or string to process
 * @returns Normalized step text, or null if empty/invalid
 */
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

/**
 * Formats a plan for display in a notification.
 * 
 * Handles mixed step types (string and object), skips empty steps, and applies
 * sensible defaults to input parameters:
 * - maxSteps: clamped to non-negative integer
 * - maxStepLength: clamped to at least 4 (to safely add "...")
 * 
 * If maxSteps is 0 after clamping, no steps are included.
 * If plan.title contains only whitespace, it is not included.
 * If plan.steps is not an array, steps are skipped entirely.
 * 
 * @param plan - Plan object with optional title and steps
 * @param maxSteps - Maximum number of steps to include (will be clamped to ≥0)
 * @param maxStepLength - Maximum character length per step (will be clamped to ≥4)
 * @returns Formatted markdown string for notification display
 */
export function formatPlanForNotification(
  plan: Plan,
  maxSteps: number,
  maxStepLength: number
): string {
  // Clamp input parameters to safe values
  const safeMaxSteps = Math.max(0, Math.floor(maxSteps));
  const safeMaxStepLength = Math.max(4, Math.floor(maxStepLength));

  const parts: string[] = [];
  // Include title if present and non-empty after trimming
  if (plan.title) {
    const trimmedTitle = plan.title.trim();
    if (trimmedTitle.length > 0) {
      parts.push(`📋 ${trimmedTitle}`);
    }
  }
  // Only process steps if safeMaxSteps > 0 and steps is a valid array
  if (safeMaxSteps > 0 && Array.isArray(plan.steps) && plan.steps.length > 0) {
    const validSteps: string[] = [];
    for (const step of plan.steps) {
      const stepText = formatPlanStepText(step);
      if (!stepText) {
        continue;
      }
      validSteps.push(stepText);
    }

    const stepsPreview = validSteps.slice(0, safeMaxSteps);
    stepsPreview.forEach((stepText, index) => {
      const truncatedStep = stepText.length > safeMaxStepLength
        ? stepText.substring(0, safeMaxStepLength - 3) + "..."
        : stepText;
      if (truncatedStep.trim().length === 0) {
        return;
      }
      parts.push(`${index + 1}. ${truncatedStep}`);
    });
    if (validSteps.length > safeMaxSteps) {
      parts.push(`... and ${validSteps.length - safeMaxSteps} more steps`);
    }
  }
  return parts.join("\n");
}

/**
 * Formats a plan as a full Markdown document for Review Plan display.
 *
 * This function creates a complete Markdown representation of the plan,
 * suitable for displaying in a virtual document via TextDocumentContentProvider.
 * Unlike formatPlanForNotification, this function does not truncate steps.
 *
 * @param plan - Plan object with optional title and steps
 * @param sessionTitle - Optional session title for context header
 * @returns Formatted Markdown string for virtual document display
 */
export function formatFullPlan(plan: Plan, sessionTitle?: string): string {
  const lines: string[] = [];

  // Header with session title if available
  if (sessionTitle) {
    lines.push(`# Plan Review: ${sessionTitle}`);
  } else {
    lines.push("# Plan Review");
  }
  lines.push("");

  // Plan title
  if (plan.title) {
    const trimmedTitle = plan.title.trim();
    if (trimmedTitle.length > 0) {
      lines.push(`## 📋 ${trimmedTitle}`);
      lines.push("");
    }
  }

  // Steps
  if (Array.isArray(plan.steps) && plan.steps.length > 0) {
    lines.push("### Steps");
    lines.push("");

    let stepNumber = 0;
    for (const step of plan.steps) {
      const stepText = formatPlanStepText(step);
      if (!stepText) {
        continue;
      }
      stepNumber++;
      lines.push(`${stepNumber}. ${stepText}`);
    }

    if (stepNumber === 0) {
      lines.push("*No steps defined in this plan.*");
    }
  } else {
    lines.push("*No steps defined in this plan.*");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Use the buttons in the editor to Approve or Cancel this plan.*");

  return lines.join("\n");
}
