/**
 * Shared API contract — mirrors backend DTOs in backend/TaskHub.Api/Api/Contracts.cs
 * and the pagination/filtering conventions in docs/09-api-contract.md.
 *
 * Sync strategy (documented in ADR-0012): these types are hand-maintained against the
 * backend OpenAPI output (/swagger/v1/swagger.json). CI runs `npm run contract:check`
 * which fetches the backend OpenAPI schema and verifies every endpoint used here
 * still exists with a compatible shape. If full client generation becomes worthwhile,
 * replace this module with an openapi-typescript generated file; the check script
 * already points at the same schema so the migration is mechanical.
 */
export interface UserDto { id: string; username: string }
export interface OrgRef { id: string; name: string; role?: string }
export interface MembershipDto { orgId: string; userId: string; username: string; role: string }
export type TodoStatus = 'Open' | 'Done';
export type TodoPriority = 'Low' | 'Medium' | 'High';
export interface TodoDto {
  id: string; orgId: string; title: string; description: string;
  status: TodoStatus; priority: TodoPriority; tags: string[];
  dueDate: string | null; createdAt: string; updatedAt: string;
  version: number; isDeleted: boolean; isArchived: boolean;
}
export interface PageDto<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number }
export interface ImportReport { accepted: number; rejected: number; rejectedRows: { index: number; clientProvidedId?: string; reasons: string[] }[]; duplicateRequest: boolean }
export interface AuditEntry { id: string; timestamp: string; actorUserId: string | null; orgId: string; action: string; entityType: string; entityId: string; correlationId: string }

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
