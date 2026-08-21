import { parentPort, workerData } from "node:worker_threads";

import {
  SqliteLifecycleStore,
  TRIAL_AGREEMENT_ACTION_VERSION,
} from "../../../dist/server/sqlite-lifecycle-store.js";

interface WorkerInput {
  readonly path: string;
  readonly gate: SharedArrayBuffer;
}

const input = workerData as WorkerInput;
const store = new SqliteLifecycleStore({ path: input.path });
let result;
try {
  const gate = new Int32Array(input.gate);
  Atomics.add(gate, 0, 1);
  parentPort?.postMessage({ kind: "ready" });
  Atomics.notify(gate, 0);
  Atomics.wait(gate, 1, 0);
  result = store.provisionTrialAccount({
    identity: {
      issuer: "https://cozy-bamboo-05-staging.authkit.app",
      subjectId: "concurrent-workos-user",
      tokenScopes: ["openid"],
    },
    termsId: "terms-trial-v1",
    scopePolicyId: "scope-trial-v1",
    actionVersion: TRIAL_AGREEMENT_ACTION_VERSION,
  });
} finally {
  store.close();
}
parentPort?.postMessage({ kind: "result", result });
