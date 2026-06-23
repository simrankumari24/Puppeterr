const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

async function askAI(userMessage) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are an automation AI. Output ONLY Playwright commands."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    }
  );

  const data = await res.json();
  console.log("FULL RESPONSE:", data);
}
askAI("Say: DeepSeek R1 is online.").then(console.log);