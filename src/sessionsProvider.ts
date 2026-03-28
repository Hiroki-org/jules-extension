import * as vscode from "vscode";
import {
  Session,
  Source as SourceType,
  Activity,
  ActivitiesResponse
} from "./types";
import { getBranchesForSession } from "./branchUtils";
import { GitHubAuth } from "./githubAuth";
import { SourcesCache, isCacheValid } from "./cache";
import { sanitizeError } from "./errorUtils";
import { formatPlanForNotification } from "./planUtils";
import {
  fetchLatestSessionArtifacts,
  getCachedSessionArtifacts
} from "./sessionArtifacts";
import { mapLimit } from "./asyncUtils";
import {
  getActivityCategory,
  getActivityIcon,
  pickFirstNonEmpty,
  getActivitySummaryText,
  getActivityLabelPrefix,
  getActivityThemeIcon,
  getActiveActivityKeys,
  ACTIVITY_UNION_KEYS,
  type ActivityCategory,
  type ActivityUnionKey,
} from "./activityUtils";
import { SessionTreeItem } from "./sessionTreeItem";
import {
  JulesApiClient,
} from "./julesApiClient";
import {
  isSessionActive,
  getActivitiesLatestCreateTimeKey,
  sessionActivitiesCache,
  fetchSessionActivitiesPaginated,
  addToActivitiesCache,
  logChannel,
  notifiedSessions,
  getStoredApiKey,
  fetchAllSessionsPaginated,
  mapApiStateToSessionState,
  previousSessionStates,
  extractPRs,
  notifyPlanAwaitingApproval,
  notifyUserFeedbackRequired,
  notifyPRCreated,
  buildSessionsListEndpoint,
  buildActivitiesListEndpoint,
  areSessionListsEqual,
  updatePreviousStates,
  getLatestActivityCreateTime,
  mergeActivitiesByIdentity,
  handleOpenInWebApp,
  SHOW_ACTIVITIES_COMMAND,
  MAX_ACTIVITIES_CACHE_SIZE,
  SESSION_STATE
} from "./extension";
import { sanitizeForLogging } from "./securityUtils";
import { ALL_SOURCES_ID, JULES_API_BASE_URL } from "./julesApiConstants";

export class JulesSessionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private static silentOutputChannel: vscode.OutputChannel = {
    name: "silent-channel",
    append: () => {},
    appendLine: () => {},
    replace: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };

  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private sessionsCache: Session[] = [];
  private deletingSessions: Set<string> = new Set();
  private isFetching = false;
  private lastBranchRefreshTime: number = 0;
  private readonly BRANCH_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
  private lastArtifactsPrefetchTime: number = 0;
  private readonly ARTIFACTS_PREFETCH_INTERVAL = 3 * 60 * 1000; // 3 minutes

  // Activity フィルタ関連のプロパティ
  private activityCategoryFilter: Set<ActivityCategory> = new Set();
  private lastSelectedSessionId: string | undefined;
  private progressStatusBarItem: vscode.StatusBarItem | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  getActivityCategoryFilter(): Set<ActivityCategory> {
    return this.activityCategoryFilter;
  }

  setActivityCategoryFilter(filter: Set<ActivityCategory>): void {
    this.activityCategoryFilter = filter;
    this._onDidChangeTreeData.fire(undefined);
  }

  setLastSelectedSessionId(sessionId: string | undefined): void {
    this.lastSelectedSessionId = sessionId;
  }

  setProgressStatusBarItem(item: vscode.StatusBarItem): void {
    this.progressStatusBarItem = item;
  }

  private async updateProgressStatusBarForSelectedSession(
    apiKey: string,
    sessions: Session[],
  ): Promise<void> {
    if (!this.progressStatusBarItem || !this.lastSelectedSessionId) {
      this.progressStatusBarItem?.hide();
      return;
    }

    const selectedSession = sessions.find(
      (session) => session.name === this.lastSelectedSessionId,
    );
    if (!selectedSession || !isSessionActive(selectedSession)) {
      this.progressStatusBarItem.hide();
      return;
    }

    try {
      const sessionId = selectedSession.name;
      const latestCreateTimeKey = getActivitiesLatestCreateTimeKey(sessionId);
      const cachedActivities = sessionActivitiesCache.get(sessionId) ?? [];

      const newActivities = await fetchSessionActivitiesPaginated(
        apiKey,
        sessionId,
        {
          showPaginationProgress: false,
        },
      );
      const activities = mergeActivitiesByIdentity(
        cachedActivities,
        newActivities,
      );
      addToActivitiesCache(sessionId, activities);

      const latestCreateTime = getLatestActivityCreateTime(activities);
      if (latestCreateTime) {
        await this.context.globalState.update(
          latestCreateTimeKey,
          latestCreateTime,
        );
      }

      let latestProgress: Activity | undefined;
      let maxTime = -Infinity;

      for (const activity of activities) {
        if (activity.progressUpdated && activity.createTime) {
          const parsedTime = Date.parse(activity.createTime);
          if (!Number.isNaN(parsedTime) && parsedTime > maxTime) {
            maxTime = parsedTime;
            latestProgress = activity;
          }
        }
      }

      if (latestProgress?.progressUpdated) {
        const title = latestProgress.progressUpdated.title || "Working...";
        this.progressStatusBarItem.text = `$(sync~spin) Jules: ${title}`;
        this.progressStatusBarItem.tooltip =
          latestProgress.progressUpdated.description || "";
        this.progressStatusBarItem.show();
      } else {
        this.progressStatusBarItem.hide();
      }
    } catch (error) {
      logChannel.appendLine(
        `Jules: Failed to update progress status bar: ${sanitizeError(error)}`,
      );
      this.progressStatusBarItem.hide();
    }
  }

  private sendNotifications(
    sessions: Session[],
    notificationType: string,
    notifier: (session: Session) => Promise<void>,
  ) {
    if (sessions.length === 0) {
      return;
    }

    logChannel.appendLine(
      `Jules: Found ${sessions.length} sessions awaiting ${notificationType}`,
    );
    for (const session of sessions) {
      if (!notifiedSessions.has(session.name)) {
        notifier(session).catch((error) => {
          logChannel.appendLine(
            `Jules: Failed to show ${notificationType} notification for session '${sanitizeForLogging(session.name)}' (${sanitizeForLogging(session.title)}): ${sanitizeError(error)}`,
          );
        });
        notifiedSessions.add(session.name);
      }
    }
  }

  private async fetchAndProcessSessions(
    isBackground: boolean = false,
    forceUIUpdate: boolean = false,
  ): Promise<void> {
    if (this.isFetching) {
      logChannel.appendLine("Jules: Fetch already in progress. Skipping.");
      return;
    }
    this.isFetching = true;
    logChannel.appendLine("Jules: Starting to fetch and process sessions...");

    try {
      const apiKey = await getStoredApiKey(this.context);
      if (!apiKey) {
        this.sessionsCache = [];
        this.progressStatusBarItem?.hide();
        return;
      }

      const fetchedSessions = await fetchAllSessionsPaginated(
        apiKey,
        !isBackground,
      );

      logChannel.appendLine(
        `Jules: Found ${fetchedSessions.length} total sessions`,
      );

      // Filter out sessions that are currently being deleted to prevent race conditions
      // where a background refresh re-adds a session that was optimistically removed.
      const allSessionsMapped: Session[] = [];
      for (let i = 0; i < fetchedSessions.length; i++) {
        const session = fetchedSessions[i];
        if (!this.deletingSessions.has(session.name)) {
          allSessionsMapped.push({
            ...session,
            rawState: session.state,
            state: mapApiStateToSessionState(session.state),
          });
        }
      }

      // デバッグ: 全セッションのrawStateをログ出力
      logChannel.appendLine(
        `Jules: Debug - Total sessions: ${allSessionsMapped.length}`,
      );
      const stateCounts = allSessionsMapped.reduce(
        (acc, s) => {
          acc[s.rawState] = (acc[s.rawState] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      logChannel.appendLine(
        `Jules: Debug - State counts: ${JSON.stringify(stateCounts)}`,
      );

      // --- Optimization: Check if sessions changed ---
      const sessionsChanged = !areSessionListsEqual(
        this.sessionsCache,
        allSessionsMapped,
      );

      if (sessionsChanged) {
        // Optimization: Single pass iteration over sessions to identify notification candidates
        const sessionsToNotifyPlan: Session[] = [];
        const sessionsToNotifyFeedback: Session[] = [];
        const completedSessions: Session[] = [];

        for (const session of allSessionsMapped) {
          const prevState = previousSessionStates.get(session.name);
          const isNotTerminated = !prevState?.isTerminated;

          if (!isNotTerminated) {
            continue;
          }

          // Check Plan Approval
          if (session.rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
            const isStateChanged =
              !prevState ||
              prevState.rawState !== SESSION_STATE.AWAITING_PLAN_APPROVAL;
            if (isStateChanged) {
              sessionsToNotifyPlan.push(session);
            }
          }

          // Check User Feedback
          if (session.rawState === SESSION_STATE.AWAITING_USER_FEEDBACK) {
            const isStateChanged =
              !prevState ||
              prevState.rawState !== SESSION_STATE.AWAITING_USER_FEEDBACK;
            if (isStateChanged) {
              sessionsToNotifyFeedback.push(session);
            }
          }

          // Check Completed
          if (
            session.state === "COMPLETED" &&
            (!prevState || prevState.state !== "COMPLETED")
          ) {
            const prs = extractPRs(session);
            if (prs.length > 0) {
              completedSessions.push(session);
            }
          }
        }

        // Notify Plan Approval
        await this.sendNotifications(
          sessionsToNotifyPlan,
          "plan approval",
          (session) =>
            notifyPlanAwaitingApproval(session, this.context, apiKey),
        );

        // Notify User Feedback
        await this.sendNotifications(
          sessionsToNotifyFeedback,
          "user feedback",
          notifyUserFeedbackRequired,
        );

        // Notify Completed (PR Created)
        if (completedSessions.length > 0) {
          logChannel.appendLine(
            `Jules: Found ${completedSessions.length} completed sessions`,
          );
          for (const session of completedSessions) {
            const prs = extractPRs(session);
            if (prs.length > 0) {
              notifyPRCreated(session, prs).catch((error) => {
                logChannel.appendLine(
                  `Jules: Failed to show PR notification: ${sanitizeError(error)}`,
                );
              });
            }
          }
        }
      }

      // --- Update previous states after all checks ---
      // We always run this to check PR status for completed sessions (external state)
      const statesChanged = await updatePreviousStates(
        allSessionsMapped,
        this.context,
      );

      // --- Update the cache ---
      this.sessionsCache = allSessionsMapped;

      await this.updateProgressStatusBarForSelectedSession(
        apiKey,
        allSessionsMapped,
      );

      // Always try to prefetch artifacts for recent sessions to ensure context menus match user expectation.
      // Optimization: Do not await to allow immediate UI update.
      void this._prefetchArtifactsForRecentSessions(
        apiKey,
        allSessionsMapped,
      ).catch((error) => {
        logChannel.appendLine(
          `Jules: Error during background artifact prefetch: ${sanitizeError(error)}`,
        );
      });

      if (isBackground) {
        // Errors are handled inside _refreshBranchCacheInBackground, so we call it fire-and-forget.
        // The void operator is used to intentionally ignore the promise and avoid lint errors about floating promises.
        void this._refreshBranchCacheInBackground(apiKey);
      }

      // Only fire event if meaningful change occurred
      if (sessionsChanged || statesChanged || forceUIUpdate) {
        if (forceUIUpdate && !sessionsChanged && !statesChanged) {
          logChannel.appendLine("Jules: Forcing UI update (artifacts changed)");
        }
        this._onDidChangeTreeData.fire();
      } else {
        logChannel.appendLine("Jules: No view updates required.");
      }
    } catch (error) {
      if (!isBackground) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(message);
      }
      logChannel.appendLine(
        `Jules: Error during fetchAndProcessSessions: ${sanitizeError(error)}`,
      );
      // Retain cache on error to avoid losing data
    } finally {
      this.isFetching = false;
      logChannel.appendLine(
        "Jules: Finished fetching and processing sessions.",
      );
    }
  }

  private async _refreshBranchCacheInBackground(apiKey: string): Promise<void> {
    // Optimization: Throttle background branch refresh to avoid excessive I/O and CPU usage
    // The cache TTL is 5 minutes, so we check every 4 minutes to keep it relatively fresh without polling constantly.
    const now = Date.now();
    if (now - this.lastBranchRefreshTime < this.BRANCH_REFRESH_INTERVAL) {
      return;
    }

    // Update timestamp immediately to prevent concurrent refreshes
    this.lastBranchRefreshTime = now;

    const selectedSource =
      this.context.globalState.get<SourceType>("selected-source");
    if (!selectedSource || selectedSource.id === ALL_SOURCES_ID) {
      return;
    }

    console.log(
      `Jules: Background refresh, updating branches for ${selectedSource.name}`,
    );
    try {
      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
      // Use forceRefresh: false to respect the cache TTL (5 min).
      // The createSession command handles stale cache gracefully by re-fetching if the selected branch is missing from the remote list.
      await getBranchesForSession(
        selectedSource,
        apiClient,
        JulesSessionsProvider.silentOutputChannel,
        this.context,
        { forceRefresh: false, showProgress: false, silent: true },
      );
      console.log(
        "Jules: Branch cache updated successfully during background refresh",
      );
    } catch (error: unknown) {
      console.error(
        `Jules: Failed to update branch cache during background refresh for ${sanitizeForLogging(selectedSource.name)}: ${sanitizeError(error)}`,
      );
    }
  }

  private async _prefetchArtifactsForRecentSessions(
    apiKey: string,
    sessions: Session[],
  ): Promise<void> {
    // Throttle prefetch to avoid excessive API calls during frequent refreshes
    const now = Date.now();
    if (
      now - this.lastArtifactsPrefetchTime <
      this.ARTIFACTS_PREFETCH_INTERVAL
    ) {
      return;
    }

    // Update timestamp immediately to prevent concurrent prefetches
    this.lastArtifactsPrefetchTime = now;

    // Prefetch artifacts for the top N sessions to enable context menu items (diff/changeset)
    // without requiring the user to manually run "Show Activities".
    const TARGET_COUNT = 5;
    const targetSessions = sessions.slice(0, TARGET_COUNT);

    if (targetSessions.length === 0) {
      return;
    }

    let hasChanges = false;

    // Run fetches in parallel
    const results = await Promise.allSettled(
      targetSessions.map(async (session) => {
        const before = getCachedSessionArtifacts(session.name);
        await fetchLatestSessionArtifacts(
          apiKey,
          session.name,
          JULES_API_BASE_URL,
          session.updateTime,
        );
        const after = getCachedSessionArtifacts(session.name);

        // Check if availability of diff/changeset flipped
        const hadDiff = !!before?.latestDiff;
        const hasDiff = !!after?.latestDiff;
        const hadChangeset = !!before?.latestChangeSet;
        const hasChangeset = !!after?.latestChangeSet;

        return hadDiff !== hasDiff || hadChangeset !== hasChangeset;
      }),
    );

    // Log rejected promises for debugging and monitoring
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const session = targetSessions[index];
        console.error(
          `Jules: Failed to prefetch artifacts for session ${sanitizeForLogging(session.name)}: ${sanitizeError(result.reason)}`,
        );
      }
    });

    // If any session resulted in a relevant state change, refresh the tree
    hasChanges = results.some(
      (r) => r.status === "fulfilled" && r.value === true,
    );

    if (hasChanges) {
      console.log(
        "Jules: Artifacts updated during prefetch, triggering tree refresh.",
      );
      this._onDidChangeTreeData.fire();
    }
  }

  async refresh(
    isBackground: boolean = false,
    forceUIUpdate: boolean = false,
  ): Promise<void> {
    console.log(
      `Jules: refresh() called (isBackground: ${isBackground}, forceUIUpdate: ${forceUIUpdate}), starting fetch.`,
    );
    await this.fetchAndProcessSessions(isBackground, forceUIUpdate);
  }

  public removeSession(sessionId: string): void {
    this.sessionsCache = this.sessionsCache.filter((s) => s.name !== sessionId);
    this._onDidChangeTreeData.fire();
  }

  public markSessionAsDeleting(sessionId: string): void {
    this.deletingSessions.add(sessionId);
  }

  public unmarkSessionAsDeleting(sessionId: string): void {
    this.deletingSessions.delete(sessionId);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    // If the cache is empty, it might be the first load.
    if (this.sessionsCache.length === 0 && !this.isFetching) {
      await this.fetchAndProcessSessions();
    }

    const selectedSource =
      this.context.globalState.get<SourceType>("selected-source");

    if (!selectedSource) {
      return [];
    }

    // Now, use the cache to build the tree
    let filteredSessions: Session[] = [];

    if (selectedSource.id === ALL_SOURCES_ID) {
      filteredSessions = this.sessionsCache;
      console.log(
        `Jules: Showing all ${filteredSessions.length} sessions (All Repositories selected)`,
      );
    } else {
      filteredSessions = this.sessionsCache.filter(
        (session) => session.sourceContext?.source === selectedSource.name,
      );
      console.log(
        `Jules: Found ${filteredSessions.length} sessions for the selected source from cache`,
      );
    }

    // Filter out sessions with closed PRs if the setting is enabled
    const hideClosedPRs = vscode.workspace
      .getConfiguration("jules-extension")
      .get<boolean>("hideClosedPRSessions", true);

    if (hideClosedPRs) {
      // We no longer need to check PR status on every render.
      // The `isTerminated` flag in `previousSessionStates` handles this.
      const beforeFilterCount = filteredSessions.length;
      filteredSessions = filteredSessions.filter((session) => {
        const prevState = previousSessionStates.get(session.name);
        // Hide if the session is marked as terminated.
        return !prevState?.isTerminated;
      });
      const filteredCount = beforeFilterCount - filteredSessions.length;
      if (filteredCount > 0) {
        console.log(
          `Jules: Filtered out ${filteredCount} terminated sessions (${beforeFilterCount} -> ${filteredSessions.length})`,
        );
      }
    }

    if (filteredSessions.length === 0) {
      return [];
    }

    // Retrieve full source list from cache to look up source details for each session
    // when "All repositories" is selected.
    let sourcesMap: Map<string, SourceType> | undefined;
    if (selectedSource.id === ALL_SOURCES_ID) {
      const cachedSources =
        this.context.globalState.get<SourcesCache>("jules.sources");
      if (cachedSources?.sources) {
        sourcesMap = new Map(cachedSources.sources.map((s) => [s.name, s]));
      }
    }

    return filteredSessions.map((session) => {
      let sessionSource = selectedSource;
      // If "All repositories" is selected, try to find the actual source object for this session
      if (
        selectedSource.id === ALL_SOURCES_ID &&
        session.sourceContext?.source &&
        sourcesMap
      ) {
        const foundSource = sourcesMap.get(session.sourceContext.source);
        if (foundSource) {
          sessionSource = foundSource;
        }
      }
      return new SessionTreeItem(session, sessionSource);
    });
  }
}
