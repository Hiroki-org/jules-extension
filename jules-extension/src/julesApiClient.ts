import { ActivitiesResponse, Activity } from "./types";

const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

export class JulesAPIClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getHeaders() {
        return {
            "X-Goog-Api-Key": this.apiKey,
            "Content-Type": "application/json",
        } as Record<string, string>;
    }

    async listActivities(sessionId: string): Promise<ActivitiesResponse> {
        const response = await fetch(`${JULES_API_BASE_URL}/${sessionId}/activities`, {
            method: "GET",
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to list activities: ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as ActivitiesResponse;
    }

    async getActivity(sessionId: string, activityName: string): Promise<Activity> {
        // resource name = sessions/{session}/activities/{activity}
        const response = await fetch(`${JULES_API_BASE_URL}/${activityName}`, {
            method: "GET",
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch activity: ${response.status} ${response.statusText}`);
        }
        return (await response.json()) as Activity;
    }
}
