import { Agent, routeAgentRequest } from "agents";

export class PuppeterrRuntimeAgent extends Agent {
  async onStart() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL
      )
    `;

    if (!this.state || typeof this.state !== "object") {
      this.setState({
        counter: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastEventKind: null
      });
      return;
    }

    this.setState({
      counter: Number(this.state.counter || 0),
      createdAt: this.state.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastEventKind: this.state.lastEventKind || null
    });
  }

  async logEvent(kind, payload = {}) {
    const eventKind = String(kind || "event").trim() || "event";
    const body = JSON.stringify(payload || {});
    const createdAt = new Date().toISOString();
    await this.sql`
      INSERT INTO events (kind, payload, created_at)
      VALUES (${eventKind}, ${body}, ${createdAt})
    `;
    this.setState({
      ...(this.state || {}),
      updatedAt: createdAt,
      lastEventKind: eventKind
    });
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        agent: "PuppeterrRuntimeAgent",
        state: this.state || null
      });
    }

    if (method === "GET" && url.pathname === "/state") {
      return Response.json({
        ok: true,
        state: this.state || null
      });
    }

    if (method === "POST" && url.pathname === "/increment") {
      const current = Number(this.state?.counter || 0) + 1;
      const payload = { counter: current };
      this.setState({
        ...(this.state || {}),
        counter: current,
        updatedAt: new Date().toISOString()
      });
      await this.logEvent("increment", payload);
      return Response.json({ ok: true, counter: current });
    }

    if (method === "POST" && url.pathname === "/events") {
      const body = await request.json().catch(() => ({}));
      await this.logEvent(body.kind || "event", body.payload || body);
      return Response.json({ ok: true });
    }

    if (method === "GET" && url.pathname === "/events") {
      const requestedLimit = Number(url.searchParams.get("limit") || 20);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 20));
      const rows = await this.sql`
        SELECT id, kind, payload, created_at
        FROM events
        ORDER BY id DESC
        LIMIT ${limit}
      `;
      return Response.json({ ok: true, events: rows });
    }

    return Response.json({
      ok: true,
      message: "Hello from PuppeterrRuntimeAgent",
      state: this.state || null,
      routes: ["/health", "/state", "/increment", "/events"]
    });
  }
}

export class SessionVault {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async readAll() {
    return (await this.state.storage.get("sessions")) || {};
  }

  async writeAll(sessions) {
    await this.state.storage.put("sessions", sessions);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/session\/([^/]+)$/);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const key = decodeURIComponent(match[1]);
    const method = request.method.toUpperCase();
    const sessions = await this.readAll();

    if (method === "GET") {
      if (!Object.prototype.hasOwnProperty.call(sessions, key)) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(JSON.stringify(sessions[key]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (method === "PUT" || method === "POST") {
      const body = await request.json();
      sessions[key] = body;
      await this.writeAll(sessions);
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (method === "DELETE") {
      delete sessions[key];
      await this.writeAll(sessions);
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "puppeterr-session-service",
        agentRoutes: "/agents/...",
        sessionRoutes: ["/session/:key", "/health"]
      });
    }

    const id = env.SESSION_VAULT.idFromName("main");
    return env.SESSION_VAULT.get(id).fetch(request);
  }
};
