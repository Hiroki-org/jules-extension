import { Source as SourceType } from './types';
import { fetchWithTimeout } from './fetchUtils';

interface SourcesListResponse {
    sources?: SourceType[];
    nextPageToken?: string;
}

export interface ListSourcesOptions {
    pageSize?: number;
    pageToken?: string;
    filter?: string;
}

export class JulesApiClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(apiKey: string, baseUrl: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    private async request<T>(endpoint: string, options?: RequestInit & { timeout?: number }): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetchWithTimeout(url, {
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

    async listSources(options: ListSourcesOptions = {}): Promise<SourcesListResponse> {
        const params = new URLSearchParams();
        params.set('pageSize', String(options.pageSize ?? 100));
        if (options.pageToken) {
            params.set('pageToken', options.pageToken);
        }
        if (options.filter) {
            params.set('filter', options.filter);
        }

        return this.request<SourcesListResponse>(`/sources?${params.toString()}`);
    }

    async listAllSources(options: { filter?: string } = {}): Promise<SourceType[]> {
        const allSources: SourceType[] = [];
        let pageToken: string | undefined;
        let page = 0;
        const MAX_PAGES = 100;

        do {
            page += 1;
            if (page > MAX_PAGES) {
                throw new Error(`Sources pagination exceeded max pages (${MAX_PAGES})`);
            }

            const response = await this.listSources({
                pageSize: 100,
                pageToken,
                filter: options.filter,
            });

            const sources = response.sources ?? [];
            allSources.push(...sources);
            pageToken = response.nextPageToken;
        } while (pageToken);

        return allSources;
    }
}