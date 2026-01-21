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

const artifactsCache = new Map<string, SessionArtifacts>();

export function getCachedSessionArtifacts(sessionId: string): SessionArtifacts | undefined {
    return artifactsCache.get(sessionId);
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

function extractChangeSetFiles(changeSet: Record<string, unknown>): ChangeSetFile[] {
    // 1. Try to extract from gitPatch.unidiffPatch
    const gitPatch = changeSet.gitPatch as Record<string, unknown> | undefined;
    if (gitPatch && typeof gitPatch.unidiffPatch === 'string') {
        const files = parseFilesFromDiff(gitPatch.unidiffPatch);
        if (files.length > 0) {
            return files;
        }
    }

    // 2. Try existing candidates
    const candidates = [
        changeSet.files,
        changeSet.entries,
        changeSet.changes,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            const files: ChangeSetFile[] = [];
            for (const entry of candidate) {
                if (!entry || typeof entry !== "object") {
                    continue;
                }
                const record = entry as Record<string, unknown>;
                const path = normalizePath(record.path ?? record.filePath ?? record.file ?? record.name);
                if (!path) {
                    continue;
                }
                const status = normalizeStatus(record.status ?? record.action ?? record.type);
                files.push({ path, status });
            }
            if (files.length > 0) {
                return files;
            }
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

function extractLatestChangeSet(activities: Activity[]): ChangeSetSummary | undefined {
    for (let i = activities.length - 1; i >= 0; i -= 1) {
        const artifacts = activities[i]?.artifacts;
        if (!artifacts || artifacts.length === 0) {
            continue;
        }
        for (const artifact of artifacts) {
            const changeSet = artifact?.changeSet;
            if (changeSet && typeof changeSet === "object") {
                return {
                    files: extractChangeSetFiles(changeSet),
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
    return {
        latestDiff: extractLatestDiff(activities),
        latestChangeSet: extractLatestChangeSet(activities),
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
    for (let i = 0; i < aFiles.length; i += 1) {
        if (aFiles[i].path !== bFiles[i].path || aFiles[i].status !== bFiles[i].status) {
            return false;
        }
    }
    return true;
}

export function updateSessionArtifactsCache(sessionId: string, activities: Activity[]): boolean {
    const latest = extractLatestArtifactsFromActivities(activities);
    const previous = artifactsCache.get(sessionId);

    const diffChanged = previous?.latestDiff !== latest.latestDiff;
    const changeSetChanged = !areChangeSetFilesEqual(previous?.latestChangeSet, latest.latestChangeSet);

    if (diffChanged || changeSetChanged) {
        artifactsCache.set(sessionId, latest);
        return true;
    }
    return false;
}

export async function fetchLatestSessionArtifacts(
    apiKey: string,
    sessionId: string,
    apiBaseUrl: string = DEFAULT_API_BASE_URL
): Promise<SessionArtifacts> {
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

    updateSessionArtifactsCache(sessionId, data.activities);
    return artifactsCache.get(sessionId) ?? {};
}
