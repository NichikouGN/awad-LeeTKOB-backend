import "dotenv/config";
import { ClassRepository } from "./modules/class/class.repository";
import { ClassService } from "./modules/class/class.service";
import { DrizzleLabRepository } from "./modules/lab/lab.repository";
import { LabService } from "./modules/lab/lab.service";
import { DockerSandbox } from "./modules/judging/docker-sandbox";
import {
  createJudgeConsumer,
  JudgeQueue,
  OutboxDispatcher,
} from "./modules/judging/judging.queue";
import { PostgresJudgeQueueRepository } from "./modules/judging/judging.repository";
import { JudgeWorker } from "./modules/judging/judging.service";
import { DrizzleSubmissionRepository } from "./modules/submissions/submission.repository";
import { UserRepository } from "./modules/user/user.repository";
import { UserService } from "./modules/user/user.service";
import { db, pool } from "./db/db";
import { createConfiguredReviewer } from "./modules/constraint-review/config";
import { DrizzleModelLedger } from "./modules/constraint-review/drizzle-model-ledger";
import { PostgresReviewWriter } from "./modules/constraint-review/review-writer";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
  maxRetriesPerRequest: null,
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
};
const workerId = `${process.env.HOSTNAME ?? "judge-worker"}-${process.pid}`;

const submissionRepository = new DrizzleSubmissionRepository(db);
const userService = new UserService(new UserRepository(db));
const classService = new ClassService(new ClassRepository(db), userService);
const labService = new LabService(new DrizzleLabRepository(db), classService);
const sandbox = new DockerSandbox({
  image: process.env.JUDGE_SANDBOX_IMAGE ?? "leetkob-cpp-sandbox:local",
  compileTimeoutMs: 10_000,
  outputLimitBytes: 1_048_576,
});
const judgeWorker = new JudgeWorker(
  new PostgresJudgeQueueRepository(pool, new PostgresReviewWriter()),
  submissionRepository,
  labService,
  sandbox,
  {
    workerId,
    leaseMs: 60_000,
    heartbeatMs: 15_000,
    maxAttempts: 3,
    requireReviewIdentity: process.env.MODEL_OFF === "0",
    identityProvider: {
      async getReviewIdentity(userId) {
        const user = await userService.getUserProfile(userId);
        return [user.displayName, user.email, user.userId];
      },
    },
    reviewer: createConfiguredReviewer({
      ledger: new DrizzleModelLedger(db),
      onDecision: (decision) => console.info("Constraint review", decision),
    }),
  },
);
const queue = new JudgeQueue(redisConnection);
const dispatcher = new OutboxDispatcher(pool, queue);
const consumer = createJudgeConsumer(judgeWorker, {
  connection: redisConnection,
  concurrency: Number(process.env.JUDGE_CONCURRENCY ?? 2),
  lockDuration: 60_000,
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await dispatcher.stop();
  await consumer.close();
  await queue.close();
  await pool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await dispatcher.start();
console.info("Judge worker started", { workerId });
