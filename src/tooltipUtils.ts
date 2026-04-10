/**
 * Tooltip generation utilities for session tree items
 */
import * as vscode from "vscode";
import type { Session, SourceType, PullRequestOutput } from "./types";

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
  hasDiff: boolean;
  hasChangeset: boolean;
  selectedSource?: SourceType;
  failureReasonPreview?: string;
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
  const { session, hasDiff, hasChangeset, selectedSource, failureReasonPreview } = context;

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
  const allPrs = session.outputs
    ?.map(o => o.pullRequest)
    .filter((pr): pr is NonNullable<PullRequestOutput> => !!pr && !!pr.url) || [];
  
  // De-duplicate PRs by URL to avoid redundant entries in the tooltip
  const prs = Array.from(new Map(allPrs.map(pr => [pr.url, pr])).values());

  if (prs.length > 0) {
    tooltip.appendMarkdown(`\n\n---`);
    tooltip.appendMarkdown(`\n\n🔗 **Pull Request${prs.length > 1 ? 's' : ''}**`);
    
    prs.forEach((pr, index) => {
      if (index > 0) {
        tooltip.appendMarkdown(`\n\n---`);
      }

      if (pr.title) {
        tooltip.appendMarkdown(`\n\n**`);
        tooltip.appendText(pr.title);
        tooltip.appendMarkdown(`**`);
      }
      
      const url = pr.url;
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      const repoInfoStr = match ? ` (${match[2]}#${match[3]})` : '';
      
      if (pr.description) {
        // Normalize line endings to \n
        const normalizedDesc = pr.description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Truncate at word boundary safely without leaving open markdown tokens
        // For simplicity, we just take 100 characters, but use appendText to safely render it.
        // But since we want blockquotes, we'll prefix blockquotes and then appendText the lines.
        let descPreview = normalizedDesc;
        if (descPreview.length > 100) {
          descPreview = descPreview.substring(0, 100) + '...';
        }
        
        // Use appendText to avoid executing random user markdown
        tooltip.appendMarkdown(`\n\n> `);
        tooltip.appendText(descPreview.replace(/\n/g, ' '));
      }
      
      tooltip.appendMarkdown(`\n\n[Open PR${repoInfoStr}](${url})`);
    });
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

  if (failureReasonPreview) {
    tooltip.appendMarkdown(`\n\n---`);
    tooltip.appendMarkdown(`\n\n❌ **Failure Reason:**\n\n`);
    tooltip.appendText(failureReasonPreview);
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
