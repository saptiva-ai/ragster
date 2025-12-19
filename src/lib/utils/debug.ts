/**
 * Debug logging utility for RAG pipeline.
 * Only logs when DEBUG_RAG=true.
 *
 * Usage:
 *   import { debug } from "@/lib/utils/debug";
 *   debug.search("Fetching chunks...", { count: 10 });
 *   debug.citation("Quote validated");
 */

const IS_DEBUG = process.env.DEBUG_RAG === "true";
const IS_DEV = process.env.NODE_ENV !== "production";

type LogData = Record<string, unknown> | string | number | boolean | unknown | undefined;

function formatArgs(args: LogData[]): unknown[] {
  return args.map(arg => {
    if (arg === undefined) return "";
    if (typeof arg === "object") return arg;
    return arg;
  });
}

function createLogger(prefix: string) {
  return {
    log: (...args: LogData[]) => {
      if (IS_DEBUG) console.log(`[${prefix}]`, ...formatArgs(args));
    },
    warn: (...args: LogData[]) => {
      if (IS_DEBUG) console.warn(`[${prefix}]`, ...formatArgs(args));
    },
    error: (...args: LogData[]) => {
      if (IS_DEBUG) console.error(`[${prefix}]`, ...formatArgs(args));
    },
  };
}

/** Namespaced debug loggers */
export const debug = {
  /** Check if debug mode is enabled */
  enabled: IS_DEBUG,

  /** Check if dev mode (debug OR non-production) */
  isDev: IS_DEBUG || IS_DEV,

  /** Pipeline/search logging */
  pipeline: createLogger("Pipeline"),

  /** Hybrid search logging */
  search: createLogger("Search"),

  /** Chunk expansion logging */
  expand: createLogger("Expand"),

  /** List detection logging */
  list: createLogger("List"),

  /** Context building logging */
  context: createLogger("Context"),

  /** Citation validation logging */
  citation: createLogger("Citation"),

  /** Ordered expansion logging */
  ordered: createLogger("OrderedExpand"),

  /** MMR diversity logging */
  mmr: createLogger("MMR"),

  /** Generic debug log (use sparingly) */
  log: (...args: LogData[]) => {
    if (IS_DEBUG) console.log("[DEBUG]", ...formatArgs(args));
  },

  /** Generic debug warn */
  warn: (...args: LogData[]) => {
    if (IS_DEBUG) console.warn("[DEBUG]", ...formatArgs(args));
  },
};

export default debug;
