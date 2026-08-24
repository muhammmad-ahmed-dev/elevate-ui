export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  branch: string;
  headCommit: string;
  modifiedFiles: string[];
  untrackedFiles: string[];
}

export interface Checkpoint {
  id: string;
  timestamp: number;
  headCommit: string;
  stashed: boolean;
  stashId?: string;
  description: string;
  untrackedFilesBaseline?: string[];
}

export interface RollbackResult {
  success: boolean;
  restoredCommit: string;
  error?: string;
}

export interface GateCheckResult {
  name: string;
  passed: boolean;
  command: string;
  output: string;
  error?: string;
  durationMs: number;
}

export interface VerificationResult {
  passed: boolean;
  typecheckPassed: boolean;
  buildPassed: boolean;
  gates: GateCheckResult[];
  errors: string[];
  totalDurationMs: number;
}
