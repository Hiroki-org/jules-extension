import * as vscode from 'vscode';
import { Session, SessionOutput, SessionState } from './types';

/**
 * Maps API state string to internal Session state enum.
 */
export function mapApiStateToSessionState(
  apiState: string
): "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  switch (apiState) {
    case "PLANNING":
    case "AWAITING_PLAN_APPROVAL":
    case "AWAITING_USER_FEEDBACK":
    case "IN_PROGRESS":
    case "QUEUED":
    case "STATE_UNSPECIFIED":
      return "RUNNING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "PAUSED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "RUNNING"; // default to RUNNING
  }
}

/**
 * Checks if two lists of session outputs are deeply equal.
 */
export function areOutputsEqual(a?: SessionOutput[], b?: SessionOutput[]): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const prA = a[i]?.pullRequest;
    const prB = b[i]?.pullRequest;

    if (
      prA?.url !== prB?.url ||
      prA?.title !== prB?.title ||
      prA?.description !== prB?.description
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if two lists of sessions are equal in content.
 */
export function areSessionListsEqual(a: Session[], b: Session[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }

  const mapA = new Map(a.map((s) => [s.name, s]));

  for (const s2 of b) {
    const s1 = mapA.get(s2.name);
    if (!s1) {
      return false;
    }
    if (
      s1.state !== s2.state ||
      s1.rawState !== s2.rawState ||
      s1.title !== s2.title ||
      s1.requirePlanApproval !== s2.requirePlanApproval ||
      JSON.stringify(s1.sourceContext) !== JSON.stringify(s2.sourceContext) ||
      !areOutputsEqual(s1.outputs, s2.outputs)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Extracts the PR URL from a session or session state.
 */
export function extractPRUrl(sessionOrState: Session | SessionState): string | null {
  return (
    sessionOrState.outputs?.find((o) => o.pullRequest)?.pullRequest?.url || null
  );
}

/**
 * Identifies sessions that have newly completed and have a PR.
 */
export function checkForCompletedSessions(
  currentSessions: Session[],
  previousSessionStates: Map<string, SessionState>
): Session[] {
  const completedSessions: Session[] = [];
  for (const session of currentSessions) {
    const prevState = previousSessionStates.get(session.name);
    if (prevState?.isTerminated) {
      continue; // Skip terminated sessions
    }
    if (
      session.state === "COMPLETED" &&
      (!prevState || prevState.state !== "COMPLETED")
    ) {
      const prUrl = extractPRUrl(session);
      if (prUrl) {
        // Only count as a new completion if there's a PR URL.
        completedSessions.push(session);
      }
    }
  }
  return completedSessions;
}

/**
 * Identifies sessions that have transitioned to a specific target state.
 */
export function checkForSessionsInState(
  currentSessions: Session[],
  targetState: string,
  previousSessionStates: Map<string, SessionState>,
  logChannel?: vscode.OutputChannel
): Session[] {
  return currentSessions.filter((session) => {
    const prevState = previousSessionStates.get(session.name);
    const isNotTerminated = !prevState?.isTerminated;
    const isTargetState = session.rawState === targetState;
    const isStateChanged = !prevState || prevState.rawState !== targetState;
    const willNotify = isNotTerminated && isTargetState && isStateChanged;
    if (isTargetState && logChannel) {
      logChannel.appendLine(`Jules: Debug - Session ${session.name}: terminated=${!isNotTerminated}, rawState=${session.rawState}, prevRawState=${prevState?.rawState}, willNotify=${willNotify}`);
    }
    return willNotify;
  });
}
