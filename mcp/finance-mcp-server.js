"use strict";

const { createFinanceRuntime } = require("../adapters/finance-runtime");
const { createFinanceMcpDispatcherCore } = require("./finance-mcp-dispatcher");
const { TOOL_SCHEMAS } = require("./finance-tool-contract");

function createFinanceMcpDispatcher(runtime = createFinanceRuntime()) {
  return createFinanceMcpDispatcherCore({ runtime, schemas: TOOL_SCHEMAS });
}

if (require.main === module) {
  const runtime = createFinanceRuntime();
  const dispatcher = createFinanceMcpDispatcher(runtime);
  const tool = process.argv[2] || "finance.get_summary";
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  dispatcher.dispatch(tool, args, { role: "owner", actorRef: "local-cli" })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      runtime.close();
    })
    .catch((err) => {
      runtime.close();
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  TOOL_SCHEMAS,
  createFinanceMcpDispatcher,
};
