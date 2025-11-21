import { Source as SourceType } from './types';

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
}