import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startFixture() {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'demo/whatsapp-fixture.html' : pathname === '/fixture.js' ? 'demo/fixture.js' : pathname.slice(1);
    if (!/^(?:demo|extension)\/[a-zA-Z0-9_.-]+$/.test(relative)) {
      response.writeHead(404).end(); return;
    }
    try {
      const data = await readFile(path.join(projectRoot, relative));
      const type = relative.endsWith('.css') ? 'text/css' : relative.endsWith('.js') ? 'text/javascript' : 'text/html';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8` }).end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

// Test double for the extension bridge only. Never included in the extension build.
export function installMockRuntime(baseUrl) {
  const memories = new Map();
  const listeners = [];
  const memory = chat => {
    const account=window.mockBridge?.accountLabel || 'Personal';
    const id = `${account==='Personal'?'':account+'|'}${chat?.id || 'unbound'}`;
    if (!memories.has(id)) memories.set(id, { messages: [], profile: '', examples: [], tasks: [], coverage: {retained:0,oldest:'',newest:'',retentionRemovals:0,completeHistory:false} });
    return memories.get(id);
  };
  const stats = { requests:0, accepted:0, acceptedCount:0, rewrites:0, wordsReviewed:0, categories:{}, recentFeedback:[], messageCount:0,capturedMessages:0,capturedTotal:0,incomingMessages:0,outgoingMessages:0,acceptedSuggestions:0,acceptedRewrites:0,copiedSuggestions:0,insertedSuggestions:0,feedbackCounts:{},commonIssues:[],pendingTasks:0,retentionRemovals:0,historyLimited:true };
  const state = chat => ({ ok: true, settings: { accountLabel: window.mockBridge.accountLabel, bridgeUrl: 'http://127.0.0.1:4318' }, memory: memory(chat), stats });
  window.mockBridge = { requests: [], calendars: [], delay: 0, saveProfileDelay:0, accountLabel:'Personal', calendarNeedsClarification:false, calendarAccount:'', memories, dispatch(message) { listeners.forEach(listener => listener(message, {}, () => {})); } };
  const handle = async message => {
    window.mockBridge.requests.push(JSON.parse(JSON.stringify(message)));
    switch (message.type) {
      case 'GET_STATE': return state(message.chat);
      case 'CAPTURE': {
        const m = memory(message.chat); const byId = new Map(m.messages.map(item => [item.id, item]));
        for (const item of message.messages || []) byId.set(item.id, item);
        m.messages = [...byId.values()];
        m.coverage.retained=m.messages.length;
        stats.capturedMessages=m.messages.length; stats.messageCount=m.messages.length;
        stats.outgoingMessages=m.messages.filter(item=>item.direction==='out').length;
        return state(message.chat);
      }
      case 'SAVE_PROFILE': if(window.mockBridge.saveProfileDelay) await new Promise(resolve=>setTimeout(resolve,window.mockBridge.saveProfileDelay)); memory(message.chat).profile = message.profile; return state(message.chat);
      case 'FORGET_CHAT': memories.delete(message.chat.id); return state(message.chat);
      case 'IMPORT_MESSAGES': memory(message.chat).messages.push(...message.messages); return state(message.chat);
      case 'UPDATE_TASK': {const task=memory(message.chat).tasks.find(task=>task.id===message.id);if(task)task.status=message.status;return state(message.chat);}
      case 'HEALTH': return { ok: true, ready: true, configured: true, model: 'test-double' };
      case 'OPEN_SETTINGS': return { ok: true };
      case 'GET_CALENDAR_ACCOUNT': return { ok: true, calendarAccount: window.mockBridge.calendarAccount };
      case 'SAVE_CALENDAR_ACCOUNT': window.mockBridge.calendarAccount = message.calendarAccount || ''; return { ok: true, calendarAccount: window.mockBridge.calendarAccount };
      case 'OPEN_CALENDAR_ACCOUNT': return { ok: true, opened: true };
      case 'OPEN_CALENDAR': window.mockBridge.calendars.push({ ...message.event, calendarAccount: window.mockBridge.calendarAccount }); return { ok: true, opened: true };
      case 'ACCEPT': stats.accepted += 1; stats.acceptedCount += 1; stats.acceptedSuggestions += 1; if(message.original) stats.acceptedRewrites += 1; return { ok: true, stats };
      case 'GENERATE': {
        if (window.mockBridge.delay) await new Promise(resolve => setTimeout(resolve, window.mockBridge.delay));
        stats.requests += 1;
        const result = {
          suggestions: [], explanation: '', feedback: [], event: null, commitments: [], mediaNotes: [],
        };
        if (message.mode === 'rewrite' || message.mode === 'reply') {
          result.suggestions = [
            { label: 'Natural', text: 'I can send you the updated design tomorrow morning. Does that work for you?', explanation: 'Clear wording and a natural question.' },
            { label: 'Warm', text: 'Happy to send the updated design tomorrow morning! Would that work for you?', explanation: 'A warmer, friendly tone.' },
            { label: 'Concise', text: 'I’ll send the updated design tomorrow morning. Does that work?', explanation: 'A shorter version with the same meaning.' },
          ];
          if (message.mode === 'rewrite') result.feedback = [{ category: 'Question formation', original: 'is that works', improved: 'does that work', reason: 'Use does with the base form of the verb.' }];
        } else if (message.mode === 'calendar') {
          result.event = { title: 'Design review', start: '2026-10-30T15:00:00+05:30', end: '2026-10-30T15:30:00+05:30', timeZone: 'Asia/Kolkata', location: 'Studio', description: 'Review the final design with Alex Rao.', needsClarification: false, questions: [] };
          if(window.mockBridge.calendarNeedsClarification) Object.assign(result.event,{start:'',end:'',needsClarification:true,questions:['Confirm the date and time.']});
        } else if (message.mode === 'explain') {
          result.explanation = 'Alex is asking for the final design tomorrow morning and proposing a review at 10.';
        } else if (message.mode === 'commitments') {
          result.commitments = [{ title: 'Send the final design', due: '2026-10-29', owner: 'You', source: '"Could you send the final version tomorrow morning?" — sender: Alex Rao, id: ABCDEF123456789, timestamp: 09:35, 27/10/2026' }];
          memory(message.chat).tasks=result.commitments.map((task,index)=>({...task,id:`test-task-${index}`,status:'pending'}));
        }
        return { ok: true, result };
      }
      default: return { ok: false, error: `Unimplemented test message: ${message.type}` };
    }
  };
  window.chrome = {
    runtime: {
      id: 'isolated-test-extension',
      getURL: resource => `${baseUrl}/extension/${resource}`,
      sendMessage(message, callback) {
        const task = handle(message);
        if (callback) { task.then(callback); return; }
        return task;
      },
      onMessage: { addListener(listener) { listeners.push(listener); }, removeListener(listener) { const i=listeners.indexOf(listener); if (i>=0) listeners.splice(i,1); } },
    },
  };
}
