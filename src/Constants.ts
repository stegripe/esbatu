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

export enum OpCodes {
	PlayerUpdate = "playerUpdate",
	Stats = "stats",
	Event = "event",
	Ready = "ready"
}

export const RedisKey = {
	NodeSession: (name: string) => `icelink:node:${name}:session`,
	NodePlayers: (name: string) => `icelink:node:${name}:players`
};
