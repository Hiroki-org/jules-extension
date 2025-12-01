export interface GitHubBranch {
    displayName: string;
}

export interface GitHubRepo {
    owner: string;
    repo: string;
    isPrivate: boolean;
    defaultBranch: GitHubBranch;
    branches: GitHubBranch[];
}

export interface Source {
    name: string;
    id: string;
    url?: string;
    description?: string;
    githubRepo?: GitHubRepo;
}

export interface SourcesResponse {
    sources: Source[];
}

// セッション関連の型定義
export interface SessionOutput {
    pullRequest?: {
        url: string;
        title: string;
        description: string;
    };
}

export interface Session {
    name: string;
    title: string;
    state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    rawState: string;
    outputs?: SessionOutput[];
    sourceContext?: {
        source: string;
    };
    requirePlanApproval?: boolean;
}

export interface SessionState {
    name: string;
    state: string;
    rawState: string;
    outputs?: SessionOutput[];
    isTerminated?: boolean;
}

export interface SessionsResponse {
    sessions: Session[];
}

// アクティビティ関連の型定義
export interface Plan {
    title?: string;
    steps?: string[];
}

export interface Activity {
    name: string;
    createTime: string;
    originator: "user" | "agent";
    id: string;
    type?: string;
    planGenerated?: { plan: Plan };
    planApproved?: { planId: string };
    progressUpdated?: { title: string; description?: string };
    sessionCompleted?: Record<string, never>;
}

export interface ActivitiesResponse {
    activities: Activity[];
}

// PR関連の型定義
export interface PRStatusCache {
    [prUrl: string]: {
        isClosed: boolean;
        lastChecked: number;
    };
}

// セッション作成リクエストの型定義
export interface CreateSessionRequest {
    prompt: string;
    sourceContext: {
        source: string;
        githubRepoContext?: {
            startingBranch: string;
        };
    };
    automationMode: "AUTO_CREATE_PR" | "MANUAL";
    title: string;
    requirePlanApproval?: boolean;
}

export interface SessionResponse {
    name: string;
}

// QuickPick関連の型定義
import * as vscode from 'vscode';

export interface SourceQuickPickItem extends vscode.QuickPickItem {
    source: Source;
}
