import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCalendarEvent,
  CanvasCourse,
  CanvasDiscussionTopic,
  CanvasFile,
  CanvasFolder,
  CanvasModule,
  CanvasPage,
  CanvasTab,
  CanvasUser,
} from "./types.ts";

export interface CanvasClientOptions {
  baseUrl: string;
  token: string;
  /** Pause when the remaining rate-limit budget drops below this. Canvas starts at ~700. */
  rateLimitFloor?: number;
  perPage?: number;
  fetch?: typeof fetch;
  logger?: (msg: string) => void;
}

export class CanvasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`Canvas API ${status} for ${url}: ${body.slice(0, 200)}`);
    this.name = "CanvasApiError";
  }
}

type Query = Record<string, string | number | boolean | Array<string | number> | undefined>;

export class CanvasClient {
  private readonly apiBase: string;
  private readonly token: string;
  private readonly rateLimitFloor: number;
  private readonly perPage: number;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (msg: string) => void;

  constructor(opts: CanvasClientOptions) {
    this.apiBase = opts.baseUrl.replace(/\/+$/, "") + "/api/v1";
    this.token = opts.token;
    this.rateLimitFloor = opts.rateLimitFloor ?? 100;
    this.perPage = opts.perPage ?? 100;
    this.fetchImpl = opts.fetch ?? fetch;
    this.log = opts.logger ?? (() => {});
  }

  // ---------- low-level ----------

  private buildUrl(path: string, query: Query = {}): string {
    const url = path.startsWith("http") ? new URL(path) : new URL(this.apiBase + path);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k.endsWith("[]") ? k : `${k}[]`, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<{ data: T; response: Response }> {
    let attempt = 0;
    for (;;) {
      attempt++;
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });

      const remaining = Number(response.headers.get("X-Rate-Limit-Remaining") ?? "NaN");
      if (!Number.isNaN(remaining) && remaining < this.rateLimitFloor) {
        this.log(`rate limit low (${remaining}); backing off`);
        await sleep(2000);
      }

      if (response.status === 403 && (await response.clone().text()).includes("Rate Limit") && attempt < 5) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        throw new CanvasApiError(response.status, url, await response.text());
      }
      return { data: (await response.json()) as T, response };
    }
  }

  async get<T>(path: string, query?: Query): Promise<T> {
    const { data } = await this.request<T>(this.buildUrl(path, query));
    return data;
  }

  /** Follow RFC 5988 `Link: <...>; rel="next"` headers until exhausted. */
  async *paginate<T>(path: string, query: Query = {}): AsyncGenerator<T, void, void> {
    let url: string | null = this.buildUrl(path, { per_page: this.perPage, ...query });
    while (url) {
      const { data, response } = await this.request<T[]>(url);
      for (const item of data) yield item;
      url = parseNextLink(response.headers.get("Link"));
    }
  }

  async getAll<T>(path: string, query?: Query): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this.paginate<T>(path, query)) out.push(item);
    return out;
  }

  // ---------- endpoints ----------

  self(): Promise<CanvasUser> {
    return this.get<CanvasUser>("/users/self");
  }

  activeCourses(): Promise<CanvasCourse[]> {
    return this.getAll<CanvasCourse>("/courses", {
      enrollment_state: "active",
      include: ["term", "total_scores", "syllabus_body"],
      state: ["available"],
    });
  }

  course(courseId: number): Promise<CanvasCourse> {
    return this.get<CanvasCourse>(`/courses/${courseId}`, {
      include: ["term", "total_scores", "syllabus_body"],
    });
  }

  tabs(courseId: number): Promise<CanvasTab[]> {
    return this.getAll<CanvasTab>(`/courses/${courseId}/tabs`);
  }

  assignments(courseId: number): Promise<CanvasAssignment[]> {
    return this.getAll<CanvasAssignment>(`/courses/${courseId}/assignments`, {
      include: ["submission", "score_statistics"],
      order_by: "due_at",
    });
  }

  assignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
    return this.getAll<CanvasAssignmentGroup>(`/courses/${courseId}/assignment_groups`);
  }

  announcements(courseId: number, sinceIso?: string): Promise<CanvasDiscussionTopic[]> {
    return this.getAll<CanvasDiscussionTopic>("/announcements", {
      context_codes: [`course_${courseId}`],
      start_date: sinceIso ?? "2000-01-01",
      end_date: "2100-01-01",
    });
  }

  discussionTopics(courseId: number): Promise<CanvasDiscussionTopic[]> {
    return this.getAll<CanvasDiscussionTopic>(`/courses/${courseId}/discussion_topics`);
  }

  modules(courseId: number): Promise<CanvasModule[]> {
    return this.getAll<CanvasModule>(`/courses/${courseId}/modules`, { include: ["items"] });
  }

  moduleItems(courseId: number, moduleId: number) {
    return this.getAll<CanvasModule["items"] extends (infer U)[] | undefined ? U : never>(
      `/courses/${courseId}/modules/${moduleId}/items`,
    );
  }

  files(courseId: number): Promise<CanvasFile[]> {
    return this.getAll<CanvasFile>(`/courses/${courseId}/files`, { sort: "updated_at", order: "desc" });
  }

  file(fileId: number): Promise<CanvasFile> {
    return this.get<CanvasFile>(`/files/${fileId}`);
  }

  folders(courseId: number): Promise<CanvasFolder[]> {
    return this.getAll<CanvasFolder>(`/courses/${courseId}/folders`);
  }

  pages(courseId: number): Promise<CanvasPage[]> {
    return this.getAll<CanvasPage>(`/courses/${courseId}/pages`);
  }

  page(courseId: number, urlOrId: string | number): Promise<CanvasPage> {
    return this.get<CanvasPage>(`/courses/${courseId}/pages/${urlOrId}`);
  }

  calendarEvents(courseIds: number[], startIso: string, endIso: string): Promise<CanvasCalendarEvent[]> {
    return this.getAll<CanvasCalendarEvent>("/calendar_events", {
      context_codes: courseIds.map((id) => `course_${id}`),
      type: "event",
      start_date: startIso,
      end_date: endIso,
    });
  }

  /** Download a file to bytes. Canvas file URLs are pre-signed and short-lived; refetch via file() first. */
  async downloadFile(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new CanvasApiError(res.status, url, await res.text());
    return new Uint8Array(await res.arrayBuffer());
  }
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m?.[1]) return m[1];
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
