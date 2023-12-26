import { EventEmitter, once } from "events";
import { State, VoiceState } from "../Constants";
import { Icelink, VoiceChannelOptions } from "../Icelink";

export interface StateUpdatePartial {
	channel_id?: string;
	session_id?: string;
	self_deaf: boolean;
	self_mute: boolean;
}

export interface ServerUpdate {
	token: string;
	guild_id: string;
	endpoint: string;
}

/** Represents a connection to a Discord voice channel. */
export class VoiceConnection extends EventEmitter {
	/**
	 * Main {@link Icelink} class.
	 * @readonly
	 */
	public readonly manager;
	/**
	 * A id of Guild that contains the connected voice channel.
	 * @readonly
	 */
	public readonly guildId;
	/** A id of the connected voice channel. */
	public channelId: string | null;
	/** A id of the Shard that contains the guild that contains the connected voice channel. */
	public shardId;
	/** Mute status in connected voice channel. */
	public muted;
	/** Deafen status in connected voice channel. */
	public deafened;
	/** A id of the last channelId connected to. */
	public lastChannelId: string | null = null;
	/** A id of the session for voice connection. */
	public sessionId: string | null = null;
	/** Region of connected voice channel. */
	public region: string | null = null;
	/** Last region of the connected voice channel */
	public lastRegion: string | null = null;
	/** Cached serverUpdate event from Lavalink Websocket. */
	public serverUpdate: ServerUpdate | null = null;
	/** Connection state. */
	public state: State = State.Disconnected;

	/**
	 * Creates a new VoiceConnection instance.
	 * @param manager The manager of this connection.
	 * @param options The options to pass in connection creation.
	 */
	public constructor(manager: Icelink, options: VoiceChannelOptions) {
		super();

		this.manager = manager;
		this.guildId = options.guildId;
		this.channelId = options.channelId;
		this.shardId = options.shardId;
		this.muted = options.mute ?? false;
		this.deafened = options.deaf ?? true;

		Object.defineProperties(this, {
			manager: { enumerable: false, writable: false },
			guildId: { enumerable: true, writable: false }
		});
	}

	/**
	 * Set the deafen status for the current bot user.
	 * @param deaf Boolean value to indicate whether to deafen or undeafen.
	 * @defaultValue true
	 */
	public setDeaf(deaf = true): void {
		this.deafened = deaf;

		this.sendVoiceUpdate();
	}

	/**
	 * Set the mute status for the current bot user.
	 * @param mute Boolean value to indicate whether to mute or unmute.
	 * @defaultValue false
	 */
	public setMute(mute = false): void {
		this.muted = mute;

		this.sendVoiceUpdate();
	}

	/**
	 * Disconnect the current bot user from the connected voice channel.
	 * @internal
	 */
	public disconnect(): void {
		if (this.state === State.Disconnected) return undefined;

		this.channelId = null;
		this.state = State.Disconnected;

		this.removeAllListeners();
		this.sendVoiceUpdate();

		this.manager.emit("debug", `[VOICE => NODE & DISCORD] Connection destroyed, guild: ${this.guildId}`);
	}

	/**
	 * Connect the current bot user to a voice channel.
	 * @internal
	 */
	public async connect(): Promise<void> {
		if (this.state === State.Connecting || this.state === State.Connected) return;

		this.state = State.Connecting;

		this.sendVoiceUpdate();
		this.manager.emit("debug", `[VOICE => DISCORD] Requesting connection, guild: ${this.guildId}`);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.manager.options.voiceConnectionTimeout * 1_000);

		try {
			const [status] = await once(this, "connectionUpdate", { signal: controller.signal });

			if (status !== VoiceState.SessionReady)
				switch (status) {
					case VoiceState.SessionIdMissing:
						throw new Error("The voice connection is not established due to missing session id");
					case VoiceState.SessionEndpointMissing:
						throw new Error("The voice connection is not established due to missing connection endpoint");
				}

			this.state = State.Connected;
		} catch (error: any) {
			this.manager.emit("debug", `[VOICE => DISCORD] Request connection failure, guild: ${this.guildId}`);

			if ((error as Error).name === "AbortError")
				throw new Error(
					`The voice connection is not established in ${this.manager.options.voiceConnectionTimeout} seconds`
				);

			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * Update Session ID, Channel ID, Deafen status and Mute status of this instance
	 * @internal
	 */
	public setStateUpdate({ session_id, channel_id, self_deaf, self_mute }: StateUpdatePartial): void {
		this.lastChannelId = this.channelId?.repeat(1) ?? null;
		this.channelId = channel_id ?? null;

		if (this.channelId && this.lastChannelId !== this.channelId)
			this.manager.emit(
				"debug",
				`[VOICE => DISCORD] Channel moved, old channel: ${this.lastChannelId}, new channel: ${this.channelId}, guild: ${this.guildId}`
			);

		if (!this.channelId) {
			this.state = State.Disconnected;

			this.manager.emit("debug", `[VOICE => DISCORD] Channel disconnected, guild: ${this.guildId}`);
		}

		this.deafened = self_deaf;
		this.muted = self_mute;
		this.sessionId = session_id ?? null;

		this.manager.emit(
			"debug",
			`[VOICE => DISCORD] State update received, session: ${this.sessionId}, guild: ${this.guildId}`
		);
	}

	/**
	 * Sets the server update data for this connection.
	 * @internal
	 */
	public setServerUpdate(data: ServerUpdate): void {
		if (!data.endpoint) {
			this.emit("connectionUpdate", VoiceState.SessionEndpointMissing);

			return undefined;
		}
		if (!this.sessionId) {
			this.emit("connectionUpdate", VoiceState.SessionIdMissing);

			return undefined;
		}

		this.lastRegion = this.region?.repeat(1) ?? null;
		this.region = data.endpoint.split(".").shift()?.replace(/[0-9]/g, "") ?? null;

		if (this.region && this.lastRegion !== this.region)
			this.manager.emit(
				"debug",
				`[VOICE => DISCORD] Voice region changed, old region: ${this.lastRegion}, new region: ${this.region}, guild: ${this.guildId}`
			);

		this.serverUpdate = data;

		this.emit("connectionUpdate", VoiceState.SessionReady);
		this.manager.emit("debug", `[VOICE => DISCORD] Server update received, guild: ${this.guildId}`);
	}

	/**
	 * Send voice data to Discord.
	 * @internal
	 */
	public sendVoiceUpdate(): void {
		this.manager.sendPacket(
			this.shardId,
			{
				op: 4,
				d: { guild_id: this.guildId, channel_id: this.channelId, self_deaf: this.deafened, self_mute: this.muted }
			},
			false
		);
	}
}
