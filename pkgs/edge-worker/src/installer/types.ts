export interface StepResult {
  success: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

export interface InstallerResult {
  success: boolean;
  secrets: StepResult;
  migrations: StepResult;
  message: string;
}
