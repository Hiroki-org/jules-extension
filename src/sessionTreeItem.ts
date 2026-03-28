import * as vscode from "vscode";
import { Session, Source as SourceType } from "./types";
import { getPullRequestUrlForSession } from "./sessionContextMenu";
import { getCachedSessionArtifacts } from "./sessionArtifacts";
import { truncateForDisplay } from "./activityUtils";
import { buildSessionTooltip } from "./tooltipUtils";
import { SHOW_ACTIVITIES_COMMAND, SESSION_STATE, getLatestSessionFailedReason } from "./extension";

export class SessionTreeItem extends vscode.TreeItem {
  // API state to icon mapping for 10 states
  private static readonly stateIconMap: Record<string, vscode.ThemeIcon> = {
    STATE_UNSPECIFIED: new vscode.ThemeIcon("question"),
    QUEUED: new vscode.ThemeIcon("watch"),
    PLANNING: new vscode.ThemeIcon("loading~spin"),
    AWAITING_PLAN_APPROVAL: new vscode.ThemeIcon("checklist"),
    AWAITING_USER_FEEDBACK: new vscode.ThemeIcon("comment-discussion"),
    IN_PROGRESS: new vscode.ThemeIcon("sync~spin"),
    PAUSED: new vscode.ThemeIcon("debug-pause"),
    FAILED: new vscode.ThemeIcon("error"),
    COMPLETED: new vscode.ThemeIcon("check"),
    CANCELLED: new vscode.ThemeIcon("close"),
  };

  public readonly prUrl: string | null;
  public readonly hasDiff: boolean;
  public readonly hasChangeset: boolean;

  constructor(
    public readonly session: Session,
    private readonly selectedSource?: SourceType,
  ) {
    super(session.title || session.name, vscode.TreeItemCollapsibleState.None);

    // Calculate prUrl once and cache it
    this.prUrl = getPullRequestUrlForSession(session);
    const cachedArtifacts = getCachedSessionArtifacts(session.name);
    this.hasDiff = Boolean(cachedArtifacts?.latestDiff);
    this.hasChangeset = Boolean(cachedArtifacts?.latestChangeSet);

    // Build tooltip using extracted utility function
    const failureReasonPreview =
      session.state === "FAILED"
        ? truncateForDisplay(
            getLatestSessionFailedReason(session.name) ?? "",
            200,
          )
        : undefined;

    this.tooltip = buildSessionTooltip({
      session,
      hasDiff: this.hasDiff,
      hasChangeset: this.hasChangeset,
      selectedSource: this.selectedSource,
      failureReasonPreview:
        failureReasonPreview && failureReasonPreview.length > 0
          ? failureReasonPreview
          : undefined,
    });

    this.description = session.state;
    this.iconPath = this.getIcon(session.rawState);

    // Build contextValue using array for idempotent result
    const contextValues = ["jules-session"];
    if (session.url) {
      contextValues.push("jules-session-with-url");
    }
    if (this.prUrl) {
      contextValues.push("jules-session-with-pr");
    }
    if (this.hasDiff) {
      contextValues.push("jules-session-with-diff");
    }
    if (this.hasChangeset) {
      contextValues.push("jules-session-with-changeset");
    }
    if (session.rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
      contextValues.push("jules-session-awaiting-plan");
    }
    if (session.state === "FAILED") {
      contextValues.push("jules-session-failed");
    }
    this.contextValue = contextValues.join(" ");

    this.command = {
      command: SHOW_ACTIVITIES_COMMAND,
      title: "Show Activities",
      arguments: [session.name],
    };
  }

  private getIcon(rawState?: string): vscode.ThemeIcon {
    if (!rawState) {
      return SessionTreeItem.stateIconMap["STATE_UNSPECIFIED"];
    }

    // Use direct mapping for all 9 states
    return (
      SessionTreeItem.stateIconMap[rawState] ||
      SessionTreeItem.stateIconMap["STATE_UNSPECIFIED"]
    );
  }
}
