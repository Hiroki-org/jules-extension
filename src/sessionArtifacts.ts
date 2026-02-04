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
    const lines = diff.split('\n');
    for (const line of lines) {
        // Match: diff --git a/path/to/file b/path/to/file
        if (line.startsWith('diff --git ')) {
            const parts = line.split(' ');
            if (parts.length >= 4) {
                const bPart = parts[3]; // b/path/to/file
                if (bPart.startsWith('b/')) {
                    files.push({ path: bPart.slice(2) });
                }
            }
        }
    }
    return files;
}

function extractChangeSetFiles(changeSet: Record<string, unknown>, fallbackDiff?: string): ChangeSetFile[] {
    const candidates = [
        changeSet.files,
        changeSet.changes,
        changeSet.entries,
        changeSet.changedFiles,
        changeSet.paths,
    ];

    const files: ChangeSetFile[] = [];
    const seenPaths = new Set<string>();

    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) {
            continue;
        }

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

        // If we successfully extracted files from this candidate type, we stop.
        // This assumes that one changeSet object uses only one consistent property name.
        if (files.length > 0) {
            return files;
        }
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

function extractLatestDiff(activities: Activity[]): string | undefined {
    for (let i = activities.length - 1; i >= 0; i -= 1) {
        // 1. Check direct gitPatch
        const diff = activities[i]?.gitPatch?.diff;
        if (typeof diff === "string" && diff.trim().length > 0) {
            return diff;
        }

        // 2. Check artifacts.changeSet.gitPatch.unidiffPatch
        const artifacts = activities[i]?.artifacts;
        if (Array.isArray(artifacts)) {
            for (const artifact of artifacts) {
                const uniDiff = (artifact.changeSet?.gitPatch as any)?.unidiffPatch;
                if (typeof uniDiff === "string" && uniDiff.trim().length > 0) {
                    return uniDiff;
                }
            }
        }
    }
    return undefined;
}

function extractLatestChangeSet(activities: Activity[], latestDiff?: string): ChangeSetSummary | undefined {
    for (let i = activities.length - 1; i >= 0; i -= 1) {
        const artifacts = activities[i]?.artifacts;
        if (!artifacts || artifacts.length === 0) {
            continue;
        }
        for (const artifact of artifacts) {
            const changeSet = artifact?.changeSet;
            if (changeSet && typeof changeSet === "object") {
                return {
                    files: extractChangeSetFiles(changeSet, latestDiff),
                    raw: changeSet,
                };
            }
        }
    }
    return undefined;
}

export function extractLatestArtifactsFromActivities(activities: Activity[]): SessionArtifacts {
    if (!Array.isArray(activities) || activities.length === 0) {
        return {};
    }

    const latestDiff = extractLatestDiff(activities);
    const latestChangeSet = extractLatestChangeSet(activities, latestDiff);

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

    const diffChanged = previousArtifacts?.latestDiff !== latest.latestDiff;
    const changeSetChanged = !areChangeSetFilesEqual(previousArtifacts?.latestChangeSet, latest.latestChangeSet);
    const timeChanged = updateTime !== previousEntry?.updateTime;

    if (diffChanged || changeSetChanged || (!!updateTime && timeChanged)) {
        artifactsCache.set(sessionId, {
            artifacts: latest,
            updateTime: updateTime
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

    const response = await fetchWithTimeout(`${apiBaseUrl}/${sessionId}/activities`, {
        method: "GET",
        headers: {
            "X-Goog-Api-Key": apiKey,
            "Content-Type": "application/json",
        },
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
