import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChangeDto,
  ConfigFilesDto,
  CoursePageDto,
  CourseSummaryDto,
  SyncStatusDto,
  UpcomingItemDto,
} from "@acacia/shared";
import { api } from "./api";

export interface DashboardDto {
  courses: CourseSummaryDto[];
  upcoming: UpcomingItemDto[];
  changes: ChangeDto[];
  sync: SyncStatusDto;
}

export interface AnalyzeResultDto {
  courseId: number;
  summary: string;
  proposal: unknown;
  heuristic: unknown;
  proposer: string;
}

export interface MirrorResultDto {
  downloaded: number;
  skipped: number;
  failed: number;
}

export type TaskState = "todo" | "doing" | "done";

export interface TaskRow {
  id: number;
  course_id: number | null;
  parent_id: number | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  state: TaskState;
}

export type ConfigKind = "info" | "workflow";
export type ItemState = UpcomingItemDto["localState"];

export const keys = {
  dashboard: (days: number) => ["dashboard", days] as const,
  courses: ["courses"] as const,
  course: (id: number) => ["course", id] as const,
  courseConfig: (id: number) => ["course", id, "config"] as const,
  changes: (limit: number) => ["changes", limit] as const,
  syncStatus: ["sync", "status"] as const,
  tasks: (courseId?: number) => ["tasks", courseId ?? null] as const,
};

export function useDashboard(days = 14) {
  return useQuery({
    queryKey: keys.dashboard(days),
    queryFn: () => api.get<DashboardDto>(`/dashboard?days=${days}`),
    refetchInterval: 60_000,
  });
}

export function useCourses() {
  return useQuery({
    queryKey: keys.courses,
    queryFn: () => api.get<CourseSummaryDto[]>("/courses"),
  });
}

export function useCourse(id: number) {
  return useQuery({
    queryKey: keys.course(id),
    queryFn: () => api.get<CoursePageDto>(`/courses/${id}`),
    enabled: Number.isFinite(id),
  });
}

export function useCourseConfig(id: number) {
  return useQuery({
    queryKey: keys.courseConfig(id),
    queryFn: () => api.get<ConfigFilesDto>(`/courses/${id}/config`),
    enabled: Number.isFinite(id),
  });
}

export function useSaveCourseConfig(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, yaml }: { kind: ConfigKind; yaml: string }) =>
      api.put<{ ok: boolean; resolved: unknown }>(`/courses/${id}/config/${kind}`, { yaml }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.courseConfig(id) });
      void qc.invalidateQueries({ queryKey: keys.course(id) });
      void qc.invalidateQueries({ queryKey: keys.courses });
    },
  });
}

export function useAnalyzeCourse(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AnalyzeResultDto>(`/courses/${id}/analyze`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.courseConfig(id) });
      void qc.invalidateQueries({ queryKey: keys.course(id) });
    },
  });
}

export function useMirrorFiles(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<MirrorResultDto>(`/courses/${id}/files/mirror`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.course(id) });
    },
  });
}

export function useChanges(limit = 100) {
  return useQuery({
    queryKey: keys.changes(limit),
    queryFn: () => api.get<ChangeDto[]>(`/changes?limit=${limit}`),
  });
}

export function useMarkChangesSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.post<unknown>("/changes/seen", { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["changes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSetItemState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, state }: { type: string; id: string; state: ItemState }) =>
      api.put<unknown>(`/items/${type}/${id}/state`, { state }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["course"] });
    },
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: keys.syncStatus,
    queryFn: () => api.get<SyncStatusDto>("/sync/status"),
    refetchInterval: (query) => (query.state.data?.running ? 2_000 : 30_000),
  });
}

export function useStartSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { skipFiles?: boolean } = {}) => api.post<{ started: boolean }>("/sync", opts),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.syncStatus });
    },
  });
}

export function useTasks(courseId?: number) {
  return useQuery({
    queryKey: keys.tasks(courseId),
    queryFn: () => api.get<TaskRow[]>(courseId === undefined ? "/tasks" : `/tasks?courseId=${courseId}`),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; course_id?: number; due_at?: string }) => api.post<TaskRow>("/tasks", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; state?: TaskState; title?: string; due_at?: string | null }) =>
      api.patch<TaskRow>(`/tasks/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<unknown>(`/tasks/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
