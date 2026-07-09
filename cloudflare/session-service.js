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
    const id = env.SESSION_VAULT.idFromName("main");
    return env.SESSION_VAULT.get(id).fetch(request);
  }
};