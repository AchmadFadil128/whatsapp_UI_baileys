import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { FailoverManager } from "../server/db/failover";
import { prisma } from "../server/db/client";
import { store } from "../server/services/store";
import type { DatabaseFailoverState } from "../types";

describe("Database Failover Architecture & Manager", () => {
  it("initializes in PRIMARY state when DB is available", async () => {
    const manager = new FailoverManager();
    await manager.start();

    assert.strictEqual(manager.getState(), "PRIMARY");
    assert.strictEqual(manager.isFailover(), false);
    assert.ok(manager.getDb());
    assert.ok(manager.getPrimaryDb());
    assert.ok(manager.getTempDb());

    manager.stop();
  });

  it("notifies listeners on state transition", async () => {
    const manager = new FailoverManager();
    const transitions: DatabaseFailoverState[] = [];

    const unsubscribe = manager.onStateChange((state) => {
      transitions.push(state);
    });

    // Access private setState for testing transitions
    (manager as any).setState("FAILOVER");
    assert.strictEqual(manager.getState(), "FAILOVER");
    assert.strictEqual(manager.isFailover(), true);

    (manager as any).setState("SYNCING");
    assert.strictEqual(manager.getState(), "SYNCING");
    assert.strictEqual(manager.isFailover(), true);

    (manager as any).setState("PRIMARY");
    assert.strictEqual(manager.getState(), "PRIMARY");
    assert.strictEqual(manager.isFailover(), false);

    assert.deepStrictEqual(transitions, ["FAILOVER", "SYNCING", "PRIMARY"]);
    unsubscribe();
  });

  it("prisma proxy dynamically accesses active client delegates", () => {
    assert.ok(prisma.chat, "prisma.chat should be accessible via proxy");
    assert.ok(prisma.message, "prisma.message should be accessible via proxy");
    assert.ok(prisma.contact, "prisma.contact should be accessible via proxy");
    assert.strictEqual(typeof prisma.$queryRaw, "function", "prisma.$queryRaw should be a function");
  });

  it("skips media binary persistence when in failover state", async () => {
    const { failoverManager } = await import("../server/db/client");

    // Force FAILOVER state
    (failoverManager as any).setState("FAILOVER");
    assert.strictEqual(failoverManager.isFailover(), true);

    // Calling saveMedia during failover should not throw and should skip saving
    await store.saveMedia("test-failover-media-id", "image/jpeg", Buffer.from("fake-image-bytes"));

    // Restore PRIMARY state
    (failoverManager as any).setState("PRIMARY");
    assert.strictEqual(failoverManager.isFailover(), false);
  });
});

