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
    url?: string;
    outputs?: SessionOutput[];
    sourceContext?: {
        source: string;
        githubRepoContext?: {
            startingBranch: string;
        };
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
