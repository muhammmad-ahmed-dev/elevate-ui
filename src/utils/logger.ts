import pc from "picocolors";

export const logger = {
  info: (msg: string) => console.log(pc.blue("ℹ ") + msg),
  success: (msg: string) => console.log(pc.green("✔ ") + msg),
  warn: (msg: string) => console.log(pc.yellow("⚠ ") + msg),
  error: (msg: string) => console.error(pc.red("✖ ") + msg),
  step: (step: string, msg: string) => console.log(pc.cyan(`► [${step}] `) + msg),
  title: (msg: string) => console.log(pc.bold(pc.magenta(`\n=== ${msg} ===\n`))),
  dim: (msg: string) => console.log(pc.dim(msg)),
};
