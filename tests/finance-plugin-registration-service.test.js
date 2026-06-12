"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTestRuntime } = require("./helpers");

test("plugin registration persists Hermes callback URL by workspace", () => {
  const runtime = createTestRuntime();
  try {
    const first = runtime.pluginRegistrationService.registerHermesCallback({
      callback_url: "https://hermes.example.test/mobile/callback",
      external_workspace_id: "workspace-a",
    }, { actorRef: "test" });
    assert.equal(first.registration.provider, "hermes_mobile");
    assert.equal(first.registration.toolset, "finance");
    assert.equal(first.registration.external_workspace_id, "workspace-a");
    assert.equal(first.registration.callback_url, "https://hermes.example.test/mobile/callback");

    const second = runtime.pluginRegistrationService.registerHermesCallback({
      callbackUrl: "https://hermes.example.test/mobile/callback-v2",
      externalWorkspaceId: "workspace-a",
    }, { actorRef: "test" });
    assert.equal(second.registration.id, first.registration.id);
    assert.equal(second.registration.callback_url, "https://hermes.example.test/mobile/callback-v2");

    const readback = runtime.pluginRegistrationService.getHermesCallback({ external_workspace_id: "workspace-a" });
    assert.equal(readback.registration.id, first.registration.id);
  } finally {
    runtime.close();
  }
});

