import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mbc/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function connectSocket(): GameSocket {
  return io({ withCredentials: true, transports: ['websocket', 'polling'] });
}

type AckResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Emit with an acknowledgement, as a promise that rejects with the server's message. */
export function request<E extends keyof ClientToServerEvents, T = object>(
  socket: GameSocket, event: E, payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<{ ok: true } & T> {
  return new Promise((resolve, reject) => {
    const emit = socket.emit as unknown as (e: string, p: unknown, cb: (r: AckResult<T>) => void) => void;
    emit.call(socket, event, payload, r => (r.ok ? resolve(r) : reject(new Error(r.error))));
  });
}
