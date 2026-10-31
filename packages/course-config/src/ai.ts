import type { CourseInfoInput, CourseWorkflowInput } from "./schema.ts";
import type { CourseSnapshot } from "./heuristics.ts";

/**
 * AI-assisted proposal interface. v1 ships the interface and a no-op
 * implementation; a real provider (Vercel AI SDK + structured output against
 * CourseInfoSchema / CourseWorkflowSchema) plugs in behind it.
 *
 * Contract: proposers NEVER write config. They return a proposal + a human-readable
 * summary; the server stores it via ConfigStore.writeGenerated and the UI shows a
 * diff for the user to accept/edit/reject.
 */

export interface ProposalInput {
  snapshot: CourseSnapshot;
  /** Extracted plain text of the syllabus, when available. */
  syllabusText: string | null;
  /** Current heuristic result, so the model only fills gaps. */
  heuristic: CourseInfoInput;
}

export interface InfoProposal {
  info: CourseInfoInput;
  summary: string;
}

export interface WorkflowProposal {
  workflow: CourseWorkflowInput;
  summary: string;
}

export interface Proposer {
  readonly name: string;
  proposeInfo(input: ProposalInput): Promise<InfoProposal>;
  proposeWorkflow(input: ProposalInput & { info: CourseInfoInput }): Promise<WorkflowProposal>;
}

export class NoopProposer implements Proposer {
  readonly name = "noop";
  async proposeInfo(input: ProposalInput): Promise<InfoProposal> {
    return { info: input.heuristic, summary: "AI proposer not configured; showing heuristic analysis only." };
  }
  async proposeWorkflow(): Promise<WorkflowProposal> {
    return { workflow: {}, summary: "AI proposer not configured." };
  }
}
