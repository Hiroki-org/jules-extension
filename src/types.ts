import * as vscode from 'vscode';

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

// from extension.ts
export interface PRStatusCache {
    [prUrl: string]: {
      isClosed: boolean;
      lastChecked: number;
    };
  }

export interface SourceQuickPickItem extends vscode.QuickPickItem {
    source: Source;
}

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

export interface ComposerOptions {
    title: string;
    placeholder?: string;
    value?: string;
    showCreatePrCheckbox?: boolean;
    showRequireApprovalCheckbox?: boolean;
}

export interface ComposerResult {
    prompt: string;
    createPR: boolean;
    requireApproval: boolean;
}

export interface SessionsResponse {
    sessions: Session[];
}

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
