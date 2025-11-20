export const runtime = 'edge';

type InboundMessage = {
  activity_id?: string;
  session_id?: string;
  message?: string;
  time?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_meta?: any;
};

export async function GET(
  _req: Request,
  { params }: { params: { clientId: string } }
) {
  if (_req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }
  // Use the Edge runtime's WebSocketPair
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pair = new (globalThis as any).WebSocketPair();
  // Cast to any to satisfy TS - Edge runtime provides accept() on server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = pair[0] as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = pair[1] as any;

  server.accept();

  server.addEventListener('message', (event: MessageEvent) => {
    let payload: InboundMessage;
    try {
      payload = JSON.parse(String(event.data)) as InboundMessage;
    } catch {
      payload = { message: String(event.data) };
    }

    const activityId = payload.activity_id;
    const sessionId = payload.session_id ?? null;
    const timeNow = payload.time ?? null;
    const userMeta = payload.user_meta ?? null;

    const base = (payload.message ?? '').toString().trim();
    const reply = base.length > 0 ? `Echo (${params.clientId}): ${base}` : `Hello from server (${params.clientId})`;

    // Stream the reply word by word to mimic token streaming
    const words = reply.split(/(\s+)/); // keep spaces
    let i = 0;
    function sendNext() {
      if (i < words.length) {
        const token = words[i++];
        server.send(JSON.stringify({ type: 'message', content: token }));
        setTimeout(sendNext, 50);
      } else {
        server.send(JSON.stringify({ type: 'message', isComplete: true }));
      }
    }
    sendNext();
  });

  server.addEventListener('close', () => {
    // no-op
  });

  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is a special Response option in Edge runtime
    webSocket: client,
  });
}


