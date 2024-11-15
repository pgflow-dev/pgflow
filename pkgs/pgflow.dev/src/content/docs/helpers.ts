/**
 * Strips the setup code from the code block, so we can focus on the important bits
 */
export function stripSetupCode(code: string) {
  return code.split(/\/{10,}\n/)[1];
}
