async function handleChatRequest(req, res, deps) {
  const sendJson = deps.sendJson;
  const readJsonBody = deps.readJsonBody;
  const ensureCurrentChat = deps.ensureCurrentChat;
  const getActiveModels = deps.getActiveModels;
  const buildDETRContext = deps.buildDETRContext;
  const analyzeUploadedImageWithVision = deps.analyzeUploadedImageWithVision;
  const routeGoal = deps.routeGoal;
  const appendChatMessage = deps.appendChatMessage;
  const parseSlashCommand = deps.parseSlashCommand;
  const resolveSlashModelCommand = deps.resolveSlashModelCommand;
  const clearRuntimeModelOverride = deps.clearRuntimeModelOverride;
  const setRuntimeModelOverride = deps.setRuntimeModelOverride;
  const getRuntimeModelOverride = deps.getRuntimeModelOverride;
  const looksLikeTaskGoal = deps.looksLikeTaskGoal;
  const status = deps.status;
  const agentMsg = deps.agentMsg;
  const broadcast = deps.broadcast;
  const errLog = deps.errLog;
  const runTask = deps.runTask;
  const isAgentRunning = deps.isAgentRunning;
  const setAgentRunning = deps.setAgentRunning;
  const getPage = deps.getPage;
  const getSessionHistory = deps.getSessionHistory;

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rawMessage = String(body.message || "").trim();
    const userId = body.userId || null;
    const chatId = body.chatId || ensureCurrentChat(userId).chat.id;
    const imageB64Upload = String(body.imageB64 || "").trim();
    const annotatedImageB64 = String(body.annotatedImageB64 || "").trim();
    const detrDetections = Array.isArray(body.detrDetections) ? body.detrDetections : [];
    const detectedShapes = Array.isArray(body.detectedShapes) ? body.detectedShapes : [];
    const semanticAnalysis = typeof body.semanticAnalysis === "object" ? body.semanticAnalysis : {};
    const layoutAnalysis = body.layoutAnalysis && typeof body.layoutAnalysis === "object" ? body.layoutAnalysis : null;
    const wantsLayoutAnalysis = /ascii|page\s*map|layout|bbox|bounding\s*box|screenshot/i.test(rawMessage);

    let message = rawMessage;
    if (imageB64Upload && (detrDetections.length > 0 || detectedShapes.length > 0 || Object.keys(semanticAnalysis).length > 0)) {
      const detrCtx = detrDetections.length > 0 ? buildDETRContext(detrDetections) : "No DETR detections.";
      const shapeCtx = detectedShapes.length > 0
        ? `Shape Analysis:\n${detectedShapes.slice(0, 10).map((s, i) => `  ${i + 1}. ${s.type}: area=${Math.round(s.area || 0)}, conf=${(s.confidence || 0).toFixed(2)}`).join("\n")}`
        : "No geometric shapes detected.";
      const semanticCtx = semanticAnalysis.description
        ? `Semantic Tag: ${semanticAnalysis.description}${semanticAnalysis.confidence ? ` (${(semanticAnalysis.confidence * 100).toFixed(1)}% conf)` : ""}`
        : "No semantic classification.";

      const { chat: imgChat } = ensureCurrentChat(userId);
      const imgModels = getActiveModels(imgChat);
      const visionSummary = await analyzeUploadedImageWithVision(
        annotatedImageB64 || imageB64Upload, detrCtx, rawMessage, imgModels.vision
      );
      const layoutCtx = wantsLayoutAnalysis && layoutAnalysis && layoutAnalysis.formatted
        ? `\n\n[Page layout analysis]\n${String(layoutAnalysis.formatted || "")}`
        : "";
      message = rawMessage
        ? `${rawMessage}\n\n[Attached image analysis]\nDETR detections:\n${detrCtx}\n\n${shapeCtx}\n\n${semanticCtx}\n\nVision summary:\n${visionSummary}${layoutCtx}`
        : `[Attached image analysis]\nDETR detections:\n${detrCtx}\n\n${shapeCtx}\n\n${semanticCtx}\n\nVision summary:\n${visionSummary}${layoutCtx}`;
      status(`Image enriched: ${detrDetections.length} DETR objects, ${detectedShapes.length} shapes, ${semanticAnalysis.description ? "semantic: " + semanticAnalysis.description : "no semantic tag"}.`);
    } else if (imageB64Upload) {
      const { chat: imgChat2 } = ensureCurrentChat(userId);
      const imgModels2 = getActiveModels(imgChat2);
      const visionOnly = await analyzeUploadedImageWithVision(imageB64Upload, "No DETR data.", rawMessage, imgModels2.vision);
      const layoutCtx = wantsLayoutAnalysis && layoutAnalysis && layoutAnalysis.formatted
        ? `\n\n[Page layout analysis]\n${String(layoutAnalysis.formatted || "")}`
        : "";
      message = rawMessage ? `${rawMessage}\n\n[Image vision summary]\n${visionOnly}${layoutCtx}` : `[Image vision summary]\n${visionOnly}${layoutCtx}`;
    }

    if (!message && !imageB64Upload) {
      sendJson(res, 400, { error: "Message is required" });
      return;
    }

    if (isAgentRunning()) {
      sendJson(res, 409, { error: "Agent is already running a task" });
      return;
    }

    const { store, chat } = ensureCurrentChat(userId);
    const activeChat = store.chats.find(item => item.id === chatId);
    if (!activeChat) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }

    const command = parseSlashCommand(message);
    const slashModel = command ? resolveSlashModelCommand(command) : null;
    if (slashModel && command) {
      if (slashModel.kind === "reset") {
        clearRuntimeModelOverride(chatId, userId);
        appendChatMessage(chatId, "user", message, { command: command.command });
        appendChatMessage(chatId, "assistant", "Model override cleared. I’ll go back to the chat’s saved models until you set another command.", {
          completed: true,
          command: command.command,
          model: null
        });
        sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, reset: true });
        broadcast("chat_sync", { chatId });
        return;
      }

      if (slashModel.kind === "model") {
        if (!slashModel.modelId) {
          appendChatMessage(chatId, "user", message, { command: command.command });
          appendChatMessage(chatId, "assistant", `I couldn’t find a model matching "${slashModel.query}" in the catalog, so I left the current model active.`, {
            completed: true,
            command: command.command,
            model: null,
            matched: false
          });
          sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, matched: false });
          broadcast("chat_sync", { chatId });
          return;
        }

        setRuntimeModelOverride(chatId, slashModel.modelId, userId);
        appendChatMessage(chatId, "user", message, { command: command.command });
        appendChatMessage(chatId, "assistant", `Model override set to ${slashModel.modelId}. I’ll keep using it until you start a new task or reset it.`, {
          completed: true,
          command: command.command,
          model: slashModel.modelId,
          matched: true
        });
        sendJson(res, 200, { ok: true, chatId, command: command.command, model: slashModel.modelId, matched: true });
        broadcast("chat_sync", { chatId });
        return;
      }
    }

    if (getRuntimeModelOverride(activeChat) && looksLikeTaskGoal(message)) {
      clearRuntimeModelOverride(chatId, userId);
    }

    appendChatMessage(chatId, "user", message);
    sendJson(res, 202, { ok: true, chatId });

    const models = getActiveModels(activeChat);
    const routed = await routeGoal(message, getSessionHistory(), models);

    if (routed.mode === "chat") {
      appendChatMessage(chatId, "assistant", routed.chatReply, { completed: true });
      agentMsg(routed.chatReply);
      broadcast("chat_sync", { chatId });
    } else {
      await runTask(routed.taskGoal, models, chatId);
      const page = getPage();
      if (page) broadcast("url", { url: page.url() });
    }
  } catch (err) {
    errLog("Chat handler: " + err.message);
    broadcast("task_done", { answer: "Something went wrong: " + err.message, completed: false });
    setAgentRunning(false);
  }
}

module.exports = { handleChatRequest };