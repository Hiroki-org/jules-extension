/**
 * Tooltip generation utilities for session tree items
 */
import * as vscode from "vscode";
import type { Session, SourceType } from "./types";

// State descriptions for tooltips
export const stateDescriptionMap: Record<string, string> = {
  'STATE_UNSPECIFIED': 'Unknown state',
  'QUEUED': 'Queued',
  'PLANNING': 'Planning',
  'AWAITING_PLAN_APPROVAL': 'Awaiting plan approval',
  'AWAITING_USER_FEEDBACK': 'Awaiting user feedback',
  'IN_PROGRESS': 'In progress',
  'PAUSED': 'Paused',
  'FAILED': 'Failed',
  'COMPLETED': 'Completed',
  'CANCELLED': 'Cancelled',
};

export interface TooltipContext {
  session: Session;
  prUrl: string | null;
  hasDiff: boolean;
  hasChangeset: boolean;
  selectedSource?: SourceType;
}

/**
 * Get privacy icon based on private status
 */
export function getPrivacyIcon(isPrivate?: boolean): string {
  if (isPrivate === true) {
    return '🔒 ';
  } else if (isPrivate === false) {
    return '🌐 ';
  }
  return '';
}

/**
 * Get privacy status text
 */
export function getPrivacyStatusText(isPrivate?: boolean, format: 'short' | 'long' = 'short'): string {
  if (isPrivate === true) {
    return format === 'long' ? ' (Private)' : '';
  } else if (isPrivate === false) {
    return format === 'long' ? ' (Public)' : '';
  }
  return '';
}

/**
 * Build a MarkdownString tooltip for a session
 */
export function buildSessionTooltip(context: TooltipContext): vscode.MarkdownString {
  const { session, prUrl, hasDiff, hasChangeset, selectedSource } = context;

  const tooltip = new vscode.MarkdownString(`**${session.title || session.name}**`, true);
  tooltip.appendMarkdown(`\n\nStatus: **${session.state}**`);

  // Add state description from rawState
  if (session.rawState && stateDescriptionMap[session.rawState]) {
    const stateDescription = stateDescriptionMap[session.rawState];
    tooltip.appendMarkdown(`\n\nState: ${stateDescription}`);
  }

  if (session.requirePlanApproval) {
    tooltip.appendMarkdown(`\n\n⚠️ **Plan Approval Required**`);
  }

  // Add automation mode
  if (session.automationMode) {
    const automationLabel = session.automationMode === 'AUTO_CREATE_PR'
      ? '🤖 Auto Create PR'
      : session.automationMode === 'MANUAL'
        ? '✋ Manual'
        : session.automationMode;
    tooltip.appendMarkdown(`\n\nMode: ${automationLabel}`);
  }

  // Add Pull Request info if available
  if (prUrl) {
    const prTitle = session.outputs?.find(o => o.pullRequest?.url === prUrl)?.pullRequest?.title;
    tooltip.appendMarkdown(`\n\n---`);
    tooltip.appendMarkdown(`\n\n🔗 **Pull Request**`);
    if (prTitle) {
      tooltip.appendMarkdown(`\n\n${prTitle}`);
    }
    tooltip.appendMarkdown(`\n\n[Open PR](${prUrl})`);
  }

  // Add diff/changeset availability
  if (hasDiff || hasChangeset) {
    const artifacts: string[] = [];
    if (hasDiff) { artifacts.push('📄 Diff'); }
    if (hasChangeset) { artifacts.push('📁 Changeset'); }
    tooltip.appendMarkdown(`\n\nArtifacts: ${artifacts.join(', ')}`);
  }

  if (session.sourceContext?.source) {
    // Extract repo name if possible for cleaner display
    const source = session.sourceContext.source;
    const repoMatch = source.match(/sources\/github\/(.+)/);
    const repoName = repoMatch ? repoMatch[1] : source;
    const lockIcon = getPrivacyIcon(selectedSource?.isPrivate);
    const privacyStatus = getPrivacyStatusText(selectedSource?.isPrivate, 'long');

    tooltip.appendMarkdown(`\n\nSource: ${lockIcon}\`${repoName}\`${privacyStatus}`);
  }

  // Add starting branch if available
  if (session.sourceContext?.githubRepoContext?.startingBranch) {
    tooltip.appendMarkdown(`\n\nBranch: \`${session.sourceContext.githubRepoContext.startingBranch}\``);
  }

  // Add timestamps
  if (session.createTime || session.updateTime) {
    tooltip.appendMarkdown(`\n\n---`);
    if (session.createTime) {
      const createDate = new Date(session.createTime);
      tooltip.appendMarkdown(`\n\nCreated: ${createDate.toLocaleString()}`);
    }
    if (session.updateTime) {
      const updateDate = new Date(session.updateTime);
      tooltip.appendMarkdown(`\n\nUpdated: ${updateDate.toLocaleString()}`);
    }
  }

  tooltip.appendMarkdown(`\n\n---`);
  tooltip.appendMarkdown(`\n\nID: \`${session.name}\``);

  return tooltip;
}

/**
 * Get the state description for a given raw state
 */
export function getStateDescription(rawState: string): string | undefined {
  return stateDescriptionMap[rawState];
}
