export interface ArtifactChangeSet {
    source?: string;
    gitPatch?: {
        unidiffPatch?: string;
        baseCommitId?: string;
        suggestedCommitMessage?: string;
    };
}

export interface ArtifactMedia {
    // media schema is not fully modeled here — we only need the base64 content
    mimeType?: string;
    data?: string; // base64
    url?: string; // optional absolute or relative URL
}

export interface ArtifactBashOutput {
    command?: string;
    output?: string;
    exitCode?: number;
}

export interface Artifact {
    changeSet?: ArtifactChangeSet;
    media?: ArtifactMedia[]; // multiple media objects
    bashOutput?: ArtifactBashOutput;
}

export interface Activity {
    name: string;
    id?: string;
    createTime?: string;
    originator?: "user" | "agent";
    type?: string;
    planGenerated?: { plan?: { title?: string; steps?: any[] } };
    planApproved?: { planId?: string };
    progressUpdated?: { title?: string; description?: string };
    sessionCompleted?: Record<string, never>;
    artifacts?: Artifact[]; // NEW
}

export interface ActivitiesResponse {
    activities: Activity[];
    nextPageToken?: string;
}
