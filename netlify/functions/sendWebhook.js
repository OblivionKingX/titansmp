const fetch = require("node-fetch");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { type, payload } = JSON.parse(event.body);

    if (!type || !payload) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: "Webhook type and payload are required." }) 
      };
    }

    const WEBHOOKS = {
      MEDIA_APP: process.env.WEBHOOK_MEDIA_APP,
      REPORT_PLAYER: process.env.WEBHOOK_REPORT_PLAYER,
      STAFF_APPLY: process.env.WEBHOOK_STAFF_APPLY,
      UNBAN_APPEAL: process.env.WEBHOOK_UNBAN_APPEAL
    };

    const url = WEBHOOKS[type];
    if (!url) {
      return { 
        statusCode: 404, 
        body: JSON.stringify({ error: "Webhook type not found." }) 
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Discord response error: ${response.status}`);
      return { 
        statusCode: 502, 
        body: JSON.stringify({ error: "Discord returned an error." }) 
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error("Failed to send webhook:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};
