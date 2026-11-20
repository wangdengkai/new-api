export const meta = {
  apiVersion: 1,
  key: "model-name-rewrite",
  name: {
    en: "Response model name rewrite",
    zh: "响应模型名回写",
    "zh-TW": "回應模型名回寫",
  },
  description: {
    en: "Returns the model name the client requested in chat and Messages replies",
    zh: "在对话和 Messages 回复中返回客户端请求的模型名",
    "zh-TW": "在對話和 Messages 回覆中回傳用戶端請求的模型名",
  },
  version: "1.0.0",
  author: { name: "Local deployment" },
  relay: [
    { incoming_path: "/v1/chat/completions", upstream_path: "/v1/chat/completions", converter: "plugin" },
    { incoming_path: "/v1/messages", upstream_path: "/v1/messages", converter: "plugin" },
    { incoming_path: "/v1/models", upstream_path: "/v1/models", converter: "plugin" },
  ],
};

function contentTypeOf(response) {
  const headers = response.headers || {};
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "content-type") return headers[name];
  }
  return "application/json";
}

// rewriteModel replaces the model a client sees with the one it asked for.
// Chat Completions carries it at the top level; Claude Messages has it at the
// top level of a whole reply and inside message_start while streaming.
function rewriteModel(value, model) {
  if (value === null || typeof value !== "object") return;
  if (typeof value.model === "string") value.model = model;
  const message = value.message;
  if (message !== null && typeof message === "object" && typeof message.model === "string") {
    message.model = model;
  }
}

export function convertRequest(ctx, request) {
  if (request.body === undefined || request.body === null || typeof request.body !== "object") {
    throw new Error("JSON body required");
  }
  const requested =
    typeof request.body.model === "string" && request.body.model !== "" ? request.body.model : request.model;
  const body = { ...request.body, model: request.model || requested };
  return { body, stream: request.stream === true, state: { model: requested } };
}

export function convertResponse(ctx, response) {
  const contentType = contentTypeOf(response);
  if (typeof response.body !== "string") {
    return { bodyBase64: response.bodyBase64, contentType };
  }
  const model = ctx.state && typeof ctx.state.model === "string" ? ctx.state.model : "";
  if (ctx.path === "/v1/models" || model === "") {
    return { body: response.body, contentType };
  }
  let value;
  try {
    value = JSON.parse(response.body);
  } catch (err) {
    return { body: response.body, contentType };
  }
  if (response.status >= 200 && response.status < 300) rewriteModel(value, model);
  return { body: value, contentType };
}

export function convertStreamEvent(ctx, input) {
  if (input.done) return {};
  if (typeof input.dataBase64 === "string") {
    return { chunks: [{ bodyBase64: input.dataBase64 }] };
  }
  const event = typeof input.event === "string" && input.event !== "" ? { event: input.event } : {};
  const data = input.data;
  if (typeof data !== "string") {
    return { events: [{ ...event, data }] };
  }
  const model = ctx.state && typeof ctx.state.model === "string" ? ctx.state.model : "";
  if (model === "" || data === "[DONE]" || data.trim() === "") {
    return { events: [{ ...event, data }] };
  }
  let value;
  try {
    value = JSON.parse(data);
  } catch (err) {
    return { events: [{ ...event, data }] };
  }
  rewriteModel(value, model);
  return { events: [{ ...event, data: value }] };
}
