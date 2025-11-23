import { Session, SourcesResponse, CreateSessionRequest, SessionResponse, Activity, ActivitiesResponse, Source as SourceType } from './types';

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
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    async getSource(sourceName: string): Promise<SourceType> {
        return this.request<SourceType>(`/${sourceName}`);
    }

    async getSessions(): Promise<Session[]> {
        const response = await this.request<{ sessions: Session[] }>('/sessions');
        return response.sessions;
    }

    async getSources(): Promise<SourcesResponse> {
        return this.request<SourcesResponse>('/sources');
    }

    async createSession(requestBody: CreateSessionRequest): Promise<SessionResponse> {
        return this.request<SessionResponse>('/sessions', {
            method: 'POST',
            body: JSON.stringify(requestBody),
        });
    }

    async verifyApiKey(): Promise<boolean> {
        try {
            await this.request('/sources');
            return true;
        } catch (error) {
            return false;
        }
    }

    async getActivities(sessionId: string): Promise<ActivitiesResponse> {
        return this.request<ActivitiesResponse>(`/${sessionId}/activities`);
    }

    async sendMessage(sessionId: string, prompt: string): Promise<void> {
        const url = `${this.baseUrl}/${sessionId}:sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ prompt }),
            headers: {
                'X-Goog-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `HTTP ${response.status}`);
            throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        // No need to parse a response body for a void-returning function.
    }

    async getSession(sessionId: string): Promise<Session> {
        return this.request<Session>(`/${sessionId}`);
    }

    async approvePlan(sessionId: string): Promise<void> {
        const url = `${this.baseUrl}/${sessionId}:approvePlan`;
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({}),
            headers: {
                'X-Goog-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => `HTTP ${response.status}`);
            throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
    }
}