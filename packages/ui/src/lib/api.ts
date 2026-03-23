export interface RenderOptions {
  engine?: string;
  format?: "markdown" | "html" | "json";
  wait_after_load?: number;
}

export interface ExtractResult {
  title: string;
  url: string;
  content: string;
}

export interface ExtractResponse {
  results: ExtractResult[];
  suggestions: string[];
  captcha: boolean;
  error: string | null;
}

export interface EnginesResponse {
  engines: string[];
}

export interface ProfilesResponse {
  profiles: string[];
}

export interface HealthResponse {
  status: string;
  scraper: {
    type: string;
    healthy: boolean;
  };
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res.json();
}

async function handleTextResponse(res: Response): Promise<string> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res.text();
}

export async function renderUrl(
  url: string,
  options: RenderOptions = {}
): Promise<string> {
  const params = new URLSearchParams({ url });
  if (options.engine) params.set("engine", options.engine);
  if (options.format) params.set("format", options.format);
  if (options.wait_after_load != null)
    params.set("wait_after_load", String(options.wait_after_load));

  const res = await fetch(`/render/?${params.toString()}`);
  return handleTextResponse(res);
}

export async function extractUrl(
  url: string,
  profile: string,
  timeout?: number
): Promise<ExtractResponse> {
  const params = new URLSearchParams({ url, profile });
  if (timeout != null) params.set("timeout", String(timeout * 1000));

  const res = await fetch(`/extract?${params.toString()}`);
  return handleResponse<ExtractResponse>(res);
}

export async function getEngines(): Promise<EnginesResponse> {
  const res = await fetch("/engines");
  return handleResponse<EnginesResponse>(res);
}

export async function getProfiles(): Promise<ProfilesResponse> {
  const res = await fetch("/profiles");
  return handleResponse<ProfilesResponse>(res);
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/health");
  return handleResponse<HealthResponse>(res);
}
