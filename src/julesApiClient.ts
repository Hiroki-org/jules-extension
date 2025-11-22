import * as vscode from 'vscode';
import {
    Source,
    Session,
    Activity,
    CreateSessionRequest,
    SessionResponse,
    SourcesResponse
} from './types';

export class JulesApiClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(apiKey: string, baseUrl: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Goog-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return response.json() as Promise<T>;
    }

    async listSources(): Promise<Source[]> {
        const response = await this.request<SourcesResponse>('/sources');
        return response.sources;
    }

    async getSource(sourceName: string): Promise<Source> {
        return this.request<Source>(`/${sourceName}`);
    }

    async createSession(requestBody: CreateSessionRequest): Promise<SessionResponse> {
        return this.request<SessionResponse>('/sessions', {
            method: 'POST',
            body: JSON.stringify(requestBody),
        });
    }

    async getSession(sessionId: string): Promise<Session> {
        return this.request<Session>(`/${sessionId}`);
    }

    async getActivities(sessionId: string): Promise<Activity[]> {
        const response = await this.request<{ activities: Activity[] }>(`/${sessionId}/activities`);
        return response.activities;
    }

    async approvePlan(sessionId: string): Promise<void> {
        await this.request(`/${sessionId}:approvePlan`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }

    async sendMessage(sessionId: string, prompt: string): Promise<void> {
        await this.request(`/${sessionId}:sendMessage`, {
            method: 'POST',
            body: JSON.stringify({ prompt }),
        });
    }
}
