/** AmarPDF support-reaction mail bridge.
 * Deploy as a Web app:
 * Execute as: Me
 * Who has access: Anyone
 * Then paste the deployed /exec URL into SUPPORT_NOTIFY_ENDPOINT in app.js.
 */
const TO_EMAIL = 'sajibkumarnath360@gmail.com';

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.event !== 'support_reaction') {
      return json_({ok:false, error:'invalid_event'});
    }

    const eventId = String(data.eventId || '').slice(0,120);
    if (!eventId) return json_({ok:false, error:'missing_event_id'});

    const cache = CacheService.getScriptCache();
    if (cache.get('reaction_' + eventId)) return json_({ok:true, duplicate:true});
    cache.put('reaction_' + eventId, '1', 21600);

    const tool = String(data.tool || 'unknown').slice(0,120);
    const timestamp = String(data.timestamp || new Date().toISOString()).slice(0,80);
    const ua = String(data.userAgent || 'unknown').slice(0,500);

    MailApp.sendEmail({
      to: TO_EMAIL,
      subject: 'AmarPDF — New Support Reaction ❤️',
      htmlBody:
        '<h2>Someone sent love to AmarPDF ❤️</h2>' +
        '<p><b>Tool:</b> ' + escapeHtml_(tool) + '</p>' +
        '<p><b>Time:</b> ' + escapeHtml_(timestamp) + '</p>' +
        '<p><b>Browser:</b> ' + escapeHtml_(ua) + '</p>'
    });

    return json_({ok:true});
  } catch (err) {
    return json_({ok:false, error:String(err)});
  }
}

function doGet() {
  return json_({ok:true, service:'AmarPDF support notification'});
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
