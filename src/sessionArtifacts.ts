import { fetchWithTimeout } from "./fetchUtils";

const DEFAULT_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

interface Activity {
    createTime?: string;
    gitPatch?: {
        diff?: string;
    };
    artifacts?: Artifact[];
}

interface Artifact {
    changeSet?: Record<string, unknown>;
}

interface ActivitiesResponse {
    activities: Activity[];
}

export interface ChangeSetFile {
    path: string;
    status?: string;
}

export interface ChangeSetSummary {
    files: ChangeSetFile[];
    raw: Record<string, unknown>;
}

export interface SessionArtifacts {
    latestDiff?: string;
    latestChangeSet?: ChangeSetSummary;
}

interface CachedSessionArtifacts {
    artifacts: SessionArtifacts;
    updateTime?: string;
}

const artifactsCache = new Map<string, CachedSessionArtifacts>();

export function getCachedSessionArtifacts(sessionId: string): SessionArtifacts | undefined {
    return artifactsCache.get(sessionId)?.artifacts;
}

function normalizePath(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

function normalizeStatus(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseFilesFromDiff(diff: string): ChangeSetFile[] {
    const files: ChangeSetFile[] = [];
    let pos = 0;
    while (pos < diff.length) {
        let nextLineBreak = diff.indexOf('\n', pos);
        if (nextLineBreak === -1) {
            nextLineBreak = diff.length;
        }

        // Optimization: Use startsWith to avoid line substring if not a diff line
        if (diff.startsWith('diff --git ', pos)) {
            const line = diff.substring(pos, nextLineBreak);
            // Match: diff --git a/path/to/file b/path/to/file
            // Robustly handle both quoted and unquoted filenames for spaces.
            const prefix = 'diff --git ';
            const path1StartIndex = prefix.length;

            if (path1StartIndex < line.length) {
                let path2StartIndex = -1;
                // Find the start of the second path.
                if (line[path1StartIndex] === '"') {
                    // First path is quoted, find its end quote.
                    const path1EndQuoteIndex = line.indexOf('"', path1StartIndex + 1);
                    if (path1EndQuoteIndex !== -1 && line[path1EndQuoteIndex + 1] === ' ') {
                        path2StartIndex = path1EndQuoteIndex + 2;
                    }
                } else {
                    // First path is not quoted.
                    const path1EndSpaceIndex = line.indexOf(' ', path1StartIndex);
                    if (path1EndSpaceIndex !== -1) {
                        path2StartIndex = path1EndSpaceIndex + 1;
                    }
                }

                if (path2StartIndex !== -1 && path2StartIndex < line.length) {
                    let bPart: string;
                    if (line[path2StartIndex] === '"') {
                        // Second path is quoted.
                        const path2EndQuoteIndex = line.indexOf('"', path2StartIndex + 1);
                        bPart = line.substring(path2StartIndex + 1, path2EndQuoteIndex !== -1 ? path2EndQuoteIndex : undefined);
                    } else {
                        // Second path is not quoted.
                        const path2EndSpaceIndex = line.indexOf(' ', path2StartIndex);
                        bPart = line.substring(path2StartIndex, path2EndSpaceIndex !== -1 ? path2EndSpaceIndex : undefined);
                    }

                    if (bPart.startsWith('b/')) {
                        files.push({ path: bPart.slice(2) });
                    }
                }
            }
        }
        pos = nextLineBreak + 1;
    }
    return files;
}

function tryExtractFromCandidate(candidate: unknown): ChangeSetFile[] | null {
    if (!Array.isArray(candidate) || candidate.length === 0) {
        return null;
    }

    const files: ChangeSetFile[] = [];
    const seenPaths = new Set<string>();

    for (const entry of candidate) {
        let extractedPath: string | null = null;
        let extractedStatus: string | undefined = undefined;

        if (typeof entry === 'string') {
            extractedPath = normalizePath(entry);
        } else if (entry && typeof entry === 'object') {
            const record = entry as Record<string, unknown>;
            extractedPath = normalizePath(record.path ?? record.filePath ?? record.file ?? record.name ?? record.filename);
            extractedStatus = normalizeStatus(record.status ?? record.action ?? record.type);
        }

        if (extractedPath && !seenPaths.has(extractedPath)) {
            files.push({ path: extractedPath, status: extractedStatus });
            seenPaths.add(extractedPath);
        }
    }

    return files.length > 0 ? files : null;
}

function extractChangeSetFiles(changeSet: Record<string, unknown>, fallbackDiff?: string): ChangeSetFile[] {
    const files = tryExtractFromCandidate(changeSet.files) ??
                  tryExtractFromCandidate(changeSet.changes) ??
                  tryExtractFromCandidate(changeSet.entries) ??
                  tryExtractFromCandidate(changeSet.changedFiles) ??
                  tryExtractFromCandidate(changeSet.paths);

    if (files) {
        return files;
    }

    // Fallback: Try to extract from diff if available
    if (fallbackDiff) {
        // We only use the explicitly provided fallbackDiff (which comes from gitPatch.diff)
        // We DO NOT look at changeSet.gitPatch.unidiffPatch here anymore.
        const diffFiles = parseFilesFromDiff(fallbackDiff);
        if (diffFiles.length > 0) {
            return diffFiles;
        }
    }

    return [];
}

export function extractLatestArtifactsFromActivities(activities: Activity[]): SessionArtifacts {
    if (!Array.isArray(activities) || activities.length === 0) {
        return {};
    }

    let latestDiff: string | undefined;
    let latestChangeSetRaw: Record<string, unknown> | undefined;

    // Iterate backwards to find the latest artifacts
    for (let i = activities.length - 1; i >= 0; i--) {
        const activity = activities[i];
        if (!activity) {
            continue;
        }

        // Check direct gitPatch for diff (Priority 1)
        if (!latestDiff) {
            const diff = activity.gitPatch?.diff;
            if (typeof diff === "string" && diff.trim().length > 0) {
                latestDiff = diff;
            }
        }

        const artifacts = activity.artifacts;
        if (Array.isArray(artifacts)) {
            // If we still need to find something, scan artifacts
            if (!latestChangeSetRaw || !latestDiff) {
                for (const artifact of artifacts) {
                    // Check for ChangeSet
                    if (!latestChangeSetRaw) {
                        const changeSet = artifact?.changeSet;
                        if (changeSet && typeof changeSet === "object") {
                            latestChangeSetRaw = changeSet as Record<string, unknown>;
                        }
                    }

                    // Check for Diff from artifact (Priority 2)
                    if (!latestDiff) {
                        const uniDiff = (artifact.changeSet?.gitPatch as any)?.unidiffPatch;
                        if (typeof uniDiff === "string" && uniDiff.trim().length > 0) {
                            latestDiff = uniDiff;
                        }
                    }
                }
            }
        }

        // If both are found, we can stop early
        if (latestDiff && latestChangeSetRaw) {
            break;
        }
    }

    let latestChangeSet: ChangeSetSummary | undefined;
    if (latestChangeSetRaw) {
        latestChangeSet = {
            files: extractChangeSetFiles(latestChangeSetRaw, latestDiff),
            raw: latestChangeSetRaw,
        };
    }

    return {
        latestDiff,
        latestChangeSet,
    };
}

function areChangeSetFilesEqual(a?: ChangeSetSummary, b?: ChangeSetSummary): boolean {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    const aFiles = a.files ?? [];
    const bFiles = b.files ?? [];
    if (aFiles.length !== bFiles.length) {
        return false;
    }

    // Sort files by path to ensure order-independence
    const sortedA = [...aFiles].sort((x, y) => x.path.localeCompare(y.path));
    const sortedB = [...bFiles].sort((x, y) => x.path.localeCompare(y.path));

    for (let i = 0; i < sortedA.length; i += 1) {
        if (sortedA[i].path !== sortedB[i].path || sortedA[i].status !== sortedB[i].status) {
            return false;
        }
    }
    return true;
}

export function updateSessionArtifactsCache(sessionId: string, activities: Activity[], updateTime?: string): boolean {
    const latest = extractLatestArtifactsFromActivities(activities);
    const previousEntry = artifactsCache.get(sessionId);
    const previousArtifacts = previousEntry?.artifacts;
    const nextUpdateTime = updateTime ?? previousEntry?.updateTime;

    const diffChanged = previousArtifacts?.latestDiff !== latest.latestDiff;
    const changeSetChanged = !areChangeSetFilesEqual(previousArtifacts?.latestChangeSet, latest.latestChangeSet);
    const timeChanged = updateTime !== previousEntry?.updateTime;

    if (diffChanged || changeSetChanged || (!!updateTime && timeChanged)) {
        artifactsCache.set(sessionId, {
            artifacts: latest,
            updateTime: nextUpdateTime
        });
    }
    return diffChanged || changeSetChanged || (!!updateTime && timeChanged);
}

export async function fetchLatestSessionArtifacts(
    apiKey: string,
    sessionId: string,
    apiBaseUrl: string = DEFAULT_API_BASE_URL,
    sessionUpdateTime?: string
): Promise<SessionArtifacts> {
    const cached = artifactsCache.get(sessionId);
    if (sessionUpdateTime && cached && cached.updateTime === sessionUpdateTime) {
        return cached.artifacts;
    }

    const headers = {
        "X-Goog-Api-Key": apiKey,
        "Content-Type": "application/json",
    };

    // Optimization: Try to fetch only the latest activities (newest first) to avoid large payload
    // We request 50 items, which should be enough to find the latest artifacts in most cases.
    try {
        const params = new URLSearchParams({
            pageSize: "50",
            orderBy: "create_time desc"
        });
        const optimizedUrl = `${apiBaseUrl}/${sessionId}/activities?${params.toString()}`;

        const response = await fetchWithTimeout(optimizedUrl, {
            method: "GET",
            headers,
        });

        if (response.ok) {
            const data = (await response.json()) as ActivitiesResponse;

            // Check if we got valid activities
            if (data.activities && Array.isArray(data.activities) && data.activities.length > 0) {
                const activities = data.activities;

                // Check if the response respected the sort order (Newest first)
                // Timestamps are ISO strings, lexicographical comparison works, but Date parse is safer.
                const act0 = activities[0];
                const actLast = activities[activities.length - 1];
                const firstTime = act0 && act0.createTime ? new Date(act0.createTime).getTime() : 0;
                const lastTime = actLast && actLast.createTime ? new Date(actLast.createTime).getTime() : 0;

                // If first >= last, it's likely Descending (Newest -> Oldest).
                // If the API ignored orderBy and returned Ascending (Oldest -> Newest), first < last.
                if (firstTime >= lastTime) {
                    // The extraction logic expects activities in chronological order (Oldest -> Newest).
                    // Since we received them in reverse (Newest -> Oldest), we must reverse them back.
                    const reversedActivities = [...activities].reverse();

                    // Attempt to extract artifacts from this subset
                    const latest = extractLatestArtifactsFromActivities(reversedActivities);

                    // If we found ANY artifacts in this latest window, we can be confident they are the LATEST.
                    if (latest.latestDiff || latest.latestChangeSet) {
                        updateSessionArtifactsCache(sessionId, reversedActivities, sessionUpdateTime);
                        return artifactsCache.get(sessionId)?.artifacts ?? {};
                    }
                }
            } else if (data.activities && Array.isArray(data.activities) && data.activities.length === 0) {
                 // Empty list means no activities at all. No need to fallback.
                 updateSessionArtifactsCache(sessionId, [], sessionUpdateTime);
                 return {};
            }
        }
    } catch (error) {
        // Ignore optimization errors (network, parsing, etc.) and fallback to full fetch
        // console.warn(`[Jules] Optimized fetch failed, falling back: ${error}`);
    }

    // Fallback: Fetch all activities (without pagination/sorting)
    // This handles cases where:
    // 1. API doesn't support optimization params
    // 2. Optimization fetch failed
    // 3. No artifacts found in the latest 50 items (but might exist in older history)
    const response = await fetchWithTimeout(`${apiBaseUrl}/${sessionId}/activities`, {
        method: "GET",
        headers,
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as ActivitiesResponse;
    if (!data.activities || !Array.isArray(data.activities)) {
        throw new Error("Invalid response format from API.");
    }

    updateSessionArtifactsCache(sessionId, data.activities, sessionUpdateTime);
    return artifactsCache.get(sessionId)?.artifacts ?? {};
}
