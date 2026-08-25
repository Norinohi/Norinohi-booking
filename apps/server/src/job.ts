/**
 * Shared startup and shutdown for the scheduled entry points (`sync-catalogue.ts`,
 * `drain-outbox.ts`, and the rest listed in `tsdown.config.ts`).
 *
 * These run as their own Railway services on a schedule (docs/scheduled-jobs.md),
 * which means nobody is watching them. Their `console.log` output goes to a
 * platform log that is only read once someone already suspects a problem, and an
 * exit code is visible only on the run that produced it. So each job emits one
 * wide event when it ends — outcome, duration, and its own counters — through the
 * same evlog drain the servers use, and that event is what an alert can fire on.
 *
 * The console output stays exactly as it was. It is what an operator running one
 * of these by hand actually reads, and the event is not a replacement for it.
 */
import { initLogger, log, parseError, type ParsedError } from "evlog";
import { observability } from "./observability";

/**
 * What a job may report about its run. Deliberately flat: these become attributes
 * on the wide event, and a nested object arrives at either vendor as a blob that
 * cannot be alerted on.
 */
export type JobMetric = string | number | boolean | null;

/*
 * Neither method exits. The scripts already decide their own exit code, and that
 * decision is load-bearing — Railway reads a non-zero exit as a Crashed run — so
 * `await job.failed(...)` goes in front of the `process.exit(1)` that was always
 * there rather than swallowing it.
 */
export interface JobRun {
  /** Emit the run's event and flush the drain. */
  done: (metrics?: Record<string, JobMetric>) => Promise<void>;
  /** Emit the run's event at error level and flush the drain. */
  failed: (reason: string, metrics?: Record<string, JobMetric>) => Promise<void>;
}

/**
 * Call once, at the top of a job entry point, before any work.
 *
 * One service name for every job rather than one per job: they share a schedule,
 * a container image and an on-call story, and `job` is an attribute you can filter
 * or alert on either way.
 */
export function startJob(name: string): JobRun {
  initLogger({
    env: { service: "yacht-charter-jobs" },
    drain: observability.drain,
  });

  const startedAt = Date.now();

  const end = async (
    outcome: "ok" | "failed",
    metrics: Record<string, JobMetric>,
    reason?: string,
  ): Promise<void> => {
    const base = {
      action: `job.${name}`,
      job: name,
      outcome,
      durationMs: Date.now() - startedAt,
      ...metrics,
    };
    const event = reason === undefined ? base : { ...base, reason };

    if (outcome === "ok") log.info(event);
    else log.error(event);

    await observability.flush();
  };

  /*
   * A job that throws past its top-level await currently dies with a stack trace and
   * nothing else — which is the failure most worth hearing about, and the one no
   * `job.failed(...)` call site can cover, because it is by definition the path
   * nobody wrote. Registered here so every job gets it from the one `startJob` call.
   */
  const reportCrash = async (thrown: ParsedError) => {
    // Registering these handlers takes over from Node's default, which prints the
    // stack before it exits. That trace is what an operator running the job by hand
    // reads, so print it first and keep the non-zero exit that followed it.
    console.error(thrown.raw);
    await end("failed", {}, thrown.message);
    process.exit(1);
  };
  process.once("unhandledRejection", (reason) => void reportCrash(parseError(reason)));
  process.once("uncaughtException", (error) => void reportCrash(parseError(error)));

  return {
    done: (metrics = {}) => end("ok", metrics),
    failed: (reason, metrics = {}) => end("failed", metrics, reason),
  };
}
