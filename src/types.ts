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
    isPrivate?: boolean;
}

export interface SourcesResponse {
    sources: Source[];
}

// Pull Request output interface
export interface PullRequestOutput {
    url: string;
    title?: string;
    description?: string;
}

// Session output interface
export interface SessionOutput {
    pullRequest?: PullRequestOutput;
}

// Session state type
export type SessionState =
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | "PAUSED"
    | "AWAITING_PLAN_APPROVAL"
    | "AWAITING_USER_FEEDBACK"
    | "PLANNING";

// Session interface
export interface Session {
    name: string;
    title: string;
    state: SessionState;
    rawState: string;
    url?: string;
    outputs?: SessionOutput[];
    sourceContext?: {
        source: string;
        githubRepoContext?: {
            startingBranch?: string;
        };
    };
    requirePlanApproval?: boolean;
    createTime?: string;  // ISO 8601 timestamp
    updateTime?: string;  // ISO 8601 timestamp
    automationMode?: "AUTO_CREATE_PR" | "MANUAL" | "AUTOMATION_MODE_UNSPECIFIED";
}

// Convenience type alias
export type SourceType = Source;
