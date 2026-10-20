import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";

// Mock the store BEFORE importing app
vi.mock("./services/streamStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/streamStore")>();
  return {
    ...actual,
    listStreams: vi.fn(() => []),
    listStreamsByRecipient: vi.fn(() => []),
    listStreamsBySender: vi.fn(() => []),
  };
});

vi.mock("./services/cache", () => ({
  getCache: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
  initCache: vi.fn(),
}));

vi.mock("./services/eventHistory", () => ({
  getStreamHistory: vi.fn(),
  getAllEvents: vi.fn(),
  getGlobalEvents: vi.fn(),
  countAllEvents: vi.fn(),
  countStreamEvents: vi.fn(),
  recordEvent: vi.fn(),
  getStreamEventSummary: vi.fn(),
}));

vi.mock("./services/auth", () => ({
  authMiddleware: vi.fn((req: any, res: any, next: any) => next()),
  adminJwtAuth: vi.fn((req: any, res: any, next: any) => next()),
  generateChallenge: vi.fn(),
  refreshToken: vi.fn(),
  verifyChallengeAndIssueToken: vi.fn(),
}));

import { app } from "./index";

const INVALID = "NOTVALID";
const EMPTY_VALID = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("recipient streams consistency (#1056)", () => {
  it("400 for invalid checksum on GET /api/streams/recipient/:address", async () => {
    const res = await request(app).get(`/api/streams/recipient/${INVALID}`);
    expect(res.status).toBe(400);
  });

  it("400 for invalid checksum on GET /api/recipients/:accountId/streams", async () => {
    const res = await request(app).get(`/api/recipients/${INVALID}/streams`);
    expect(res.status).toBe(400);
  });

  it("400 for invalid checksum on GET /api/streams?recipient=<bad>", async () => {
    const res = await request(app).get(`/api/streams?recipient=${INVALID}`);
    expect(res.status).toBe(400);
  });

  it("200 + empty data for valid checksum with no streams (path route)", async () => {
    const res = await request(app).get(`/api/streams/recipient/${EMPTY_VALID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  it("200 + empty data for valid checksum with no streams (query route)", async () => {
    const res = await request(app).get(`/api/streams?recipient=${EMPTY_VALID}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});


describe("recipient streams DB failure (#1056)", () => {
  it("503 on path route when listStreamsByRecipient throws", async () => {
    const store = await import("./services/streamStore");
    const mock = vi.mocked(store.listStreamsByRecipient);
    mock.mockImplementation(() => {
      throw new Error("simulated timeout");
    });
    try {
      const res = await request(app).get(
        `/api/streams/recipient/${EMPTY_VALID}`
      );
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        code: "RECIPIENT_STREAMS_QUERY_FAILED",
      });
    } finally {
      mock.mockReset();
      mock.mockReturnValue([]);
    }
  });

  it("503 on /api/recipients/:accountId/streams when listStreamsByRecipient throws", async () => {
    const store = await import("./services/streamStore");
    const mock = vi.mocked(store.listStreamsByRecipient);
    mock.mockImplementation(() => {
      throw new Error("simulated timeout");
    });
    try {
      const res = await request(app).get(
        `/api/recipients/${EMPTY_VALID}/streams`
      );
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        code: "RECIPIENT_STREAMS_QUERY_FAILED",
      });
    } finally {
      mock.mockReset();
      mock.mockReturnValue([]);
    }
  });
});
