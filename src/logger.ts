/**
 * stderr-only logger.
 *
 * In stdio transport mode, stdout is reserved exclusively for JSON-RPC
 * messages. Writing anything else to stdout corrupts the protocol stream, so
 * every log line goes to stderr regardless of the active transport.
 */

function format(message: string, args: unknown[]): string {
  if (args.length === 0) return message;
  const extra = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  return `${message} ${extra}`;
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    process.stderr.write(`[INFO] ${format(message, args)}\n`);
  },
  error(message: string, ...args: unknown[]): void {
    process.stderr.write(`[ERROR] ${format(message, args)}\n`);
  },
};
