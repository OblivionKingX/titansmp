// netlify/functions/send-email.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { to, subject, html, text, fromName } = JSON.parse(event.body);
    
    const apiKey = process.env.RESEND_API_KEY;
    const senderEmail = process.env.RESEND_SENDER_EMAIL || 'admin@titannetwork.eu';

    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Resend API Key not configured.' }) 
      };
    }

    const recipients = Array.isArray(to) ? to : [to];
    
    // If sending to multiple people, use BCC to protect privacy.
    // If sending to one person, we can put them in the TO field.
    const payload = {
      from: `TitanNetwork <${senderEmail}>`,
      to: recipients.length === 1 ? recipients[0] : [senderEmail],
      bcc: recipients.length > 1 ? recipients : undefined,
      subject,
      html: html || text,
      text: text || (html ? html.replace(/<[^>]*>?/gm, '') : '')
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (response.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: responseData })
      };
    } else {
      console.error('[Resend Error]', responseData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: responseData.message || 'Resend API Error' })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
