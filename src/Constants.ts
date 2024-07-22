export enum State {
    Connecting = 0,
    Nearly = 1,
    Connected = 2,
    Reconnecting = 3,
    Disconnecting = 4,
    Disconnected = 5
}

export enum VoiceState {
    SessionReady = 0,
    SessionIdMissing = 1,
    SessionEndpointMissing = 2,
    SessionFailedUpdate = 3
}

export const RedisKey = {
    NodeSession: (name: string): string => `esbatu:node:${name}:session`,
    NodePlayers: (name: string): string => `esbatu:node:${name}:players`
};
