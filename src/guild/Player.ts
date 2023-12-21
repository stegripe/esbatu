/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, max-lines */
import { EventEmitter } from "node:events";
import { Node } from "../node/index";
import { VoiceConnection } from "./VoiceConnection";
import { OpCodes, State } from "../Constants";
import { Exception, Track } from "../node/Rest";

export type TrackEndReason = "cleanup" | "finished" | "loadFailed" | "replaced" | "stopped";
export type PlayerEventType =
	| "TrackEndEvent"
	| "TrackExceptionEvent"
	| "TrackStartEvent"
	| "TrackStuckEvent"
	| "WebSocketClosedEvent";

export interface PlayOptions {
	track: string;
	options?: {
		noReplace?: boolean;
		pause?: boolean;
		startTime?: number;
		endTime?: number;
	};
}

export interface Band {
	band: number;
	gain: number;
}

export interface KaraokeSettings {
	level?: number;
	monoLevel?: number;
	filterBand?: number;
	filterWidth?: number;
}

export interface TimescaleSettings {
	speed?: number;
	pitch?: number;
	rate?: number;
}

export interface FreqSettings {
	frequency?: number;
	depth?: number;
}

export interface RotationSettings {
	rotationHz?: number;
}

export interface DistortionSettings {
	sinOffset?: number;
	sinScale?: number;
	cosOffset?: number;
	cosScale?: number;
	tanOffset?: number;
	tanScale?: number;
	offset?: number;
	scale?: number;
}

export interface ChannelMixSettings {
	leftToLeft?: number;
	leftToRight?: number;
	rightToLeft?: number;
	rightToRight?: number;
}

export interface LowPassSettings {
	smoothing?: number;
}

export interface PlayerEvent {
	op: OpCodes.Event;
	type: PlayerEventType;
	guildId: string;
}

export interface TrackStartEvent extends PlayerEvent {
	type: "TrackStartEvent";
	track: Track;
}

export interface TrackEndEvent extends PlayerEvent {
	type: "TrackEndEvent";
	track: Track | null;
	reason: TrackEndReason;
}

export interface TrackStuckEvent extends PlayerEvent {
	type: "TrackStuckEvent";
	track: Track;
	thresholdMs: number;
}

export interface TrackExceptionEvent extends PlayerEvent {
	type: "TrackExceptionEvent";
	exception: Exception;
}

export interface WebSocketClosedEvent extends PlayerEvent {
	type: "WebSocketClosedEvent";
	code: number;
	reason: string;
	byRemote: boolean;
}

export interface PlayerUpdate {
	op: OpCodes.PlayerUpdate;
	state: {
		time: number;
		position: number;
		connected: boolean;
		ping: number;
	};
}

export interface FilterOptions {
	volume?: number;
	equalizer?: Band[];
	karaoke?: KaraokeSettings | null;
	timescale?: TimescaleSettings | null;
	tremolo?: FreqSettings | null;
	vibrato?: FreqSettings | null;
	rotation?: RotationSettings | null;
	distortion?: DistortionSettings | null;
	channelMix?: ChannelMixSettings | null;
	lowPass?: LowPassSettings | null;
}

export declare interface Player {
	on: ((event: "closed", listener: (reason: WebSocketClosedEvent) => void) => this) &
		((event: "end", listener: (reason: TrackEndEvent) => void) => this) &
		((event: "exception", listener: (reason: TrackExceptionEvent) => void) => this) &
		((event: "resumed", listener: (player: Player) => void) => this) &
		((event: "start", listener: (data: TrackStartEvent) => void) => this) &
		((event: "stuck", listener: (data: TrackStuckEvent) => void) => this) &
		((event: "update", listener: (data: PlayerUpdate) => void) => this);
}

/** Wrapper object around Lavalink. */
export class Player extends EventEmitter {
	/**
	 * A Guild id on this player.
	 * @readonly
	 */
	public readonly guildId;
	/** Lavalink node this player is connected to. */
	public node;
	/** A identifier of the currently playing track. */
	public trackIdentifier: string | null = null;
	/** Global volume of the player. */
	public volume = 100;
	/** Pause status in current player. */
	public paused = false;
	/** Ping represents the number of milliseconds between heartbeat and ack. Could be `-1` if not connected. */
	public ping = 0;
	/** Position in ms of current playing the track. */
	public position = 0;
	/** An filters of the player. */
	public filters: FilterOptions = {};
	/**
	 * A encoded of the currently playing track.
	 * @private
	 * @internal
	 */
	private _encodedTrack: string | null = null;

	/**
	 * Creates a new Player instance on {@link Node}.
	 * @param guildId An instance of guildId
	 * @param node An instance of {@link Node}. (Lavalink API wrapper)
	 */
	public constructor(guildId: string, node: Node) {
		super();

		this.guildId = guildId;
		this.node = node;

		Object.defineProperties(this, {
			guildId: { enumerable: true, writable: false },
			_encodedTrack: { enumerable: false, writable: true }
		});
	}

	/**
	 * A voice connection on this player state.
	 * @readonly
	 */
	public get connection(): VoiceConnection {
		return this.node.manager.connections.get(this.guildId)!;
	}

	/**
	 * Move player to another node
	 * @param name Name of node to move to, or the default ideal node
	 * @returns true if the player was moved, false if not
	 */
	public async movePlayer(name?: string): Promise<boolean> {
		const node = this.node.manager.nodes.get(name!) ?? this.node.manager.idealNode;

		if (!node && ![...this.node.manager.nodes.values()].some(({ state }) => state === State.Connected)) {
			throw new Error("No available nodes to move to");
		}
		if (!node || node.name === this.node.name || node.state !== State.Connected) return false;

		let lastNode = this.node.manager.nodes.get(this.node.name);

		if (!lastNode || lastNode.state !== State.Connected) lastNode = this.node.manager.idealNode;

		await this.destroyPlayer();

		try {
			this.node = node;

			await this.resumePlayer();

			return true;
		} catch {
			this.node = lastNode!;

			await this.resumePlayer();

			return false;
		}
	}

	/** Destroys the player in remote lavalink side. */
	public destroyPlayer(): Promise<void> {
		return this.node.rest.destroyPlayer(this.guildId);
	}

	/**
	 * Play a new track.
	 * @param playable Options for playing this track.
	 */
	public async playTrack(playable: PlayOptions): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: {
				track: { encoded: playable.track },
				paused: playable.options?.pause,
				position: playable.options?.startTime,
				endTime: playable.options?.endTime
			},
			noReplace: playable.options?.noReplace ?? false
		});

		this.trackIdentifier = player.track?.info.identifier ?? null;
		this.paused = player.paused;
		this.position = player.state.position;
		this._encodedTrack = player.track?.encoded ?? null;
	}

	/** Stop the currently playing track. */
	public async stopTrack(): Promise<void> {
		this.position = 0;
		this._encodedTrack = null;

		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: { track: { encoded: null } }
		});
	}

	/**
	 * Pause or unpause the currently playing track.
	 * @param paused Boolean value to specify whether to pause or unpause the current bot user.
	 */
	public async setPaused(paused = true): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: { paused }
		});

		this.paused = player.paused;
	}

	/**
	 * Seek to a specific time in the currently playing track.
	 * @param position Position to seek to in milliseconds.
	 */
	public async seekTo(position: number): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: { position }
		});

		this.position = player.state.position;
	}

	/**
	 * Sets the global volume of the player.
	 * @param volume Target volume 0-1000.
	 */
	public async setGlobalVolume(volume: number): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: { volume },
			noReplace: true
		});

		this.volume = player.volume;

		return undefined;
	}

	/**
	 * Sets the filter volume of the player.
	 * @param volume Target volume 0.0-5.0.
	 */
	public setFilterVolume(volume: number): Promise<void> {
		return this.setFilters({ volume });
	}

	/**
	 * Change the equalizer settings applied to to the Player State.
	 * @param equalizer An array of objects that conforms to the Bands type that define volumes at different frequencies.
	 */
	public setEqualizer(equalizer: Band[]): Promise<void> {
		return this.setFilters({ equalizer });
	}

	/**
	 * Change the karaoke settings applied to to the Player State.
	 * @param karaoke An object that conforms to the KaraokeSettings type that defines a range of frequencies to mute.
	 */
	public setKaraoke(karaoke: KaraokeSettings | null = null): Promise<void> {
		return this.setFilters({ karaoke });
	}

	/**
	 * Change the timescale settings applied to to the Player State.
	 * @param timescale An object that conforms to the TimescaleSettings type that defines the time signature to play the audio at.
	 */
	public setTimescale(timescale: TimescaleSettings | null = null): Promise<void> {
		return this.setFilters({ timescale });
	}

	/**
	 * Change the tremolo settings applied to to the Player State.
	 * @param tremolo An object that conforms to the FreqSettings type that defines an oscillation in volume.
	 */
	public setTremolo(tremolo: FreqSettings | null = null): Promise<void> {
		return this.setFilters({ tremolo });
	}

	/**
	 * Change the vibrato settings applied to to the Player State.
	 * @param vibrato An object that conforms to the FreqSettings type that defines an oscillation in pitch.
	 */
	public setVibrato(vibrato: FreqSettings | null = null): Promise<void> {
		return this.setFilters({ vibrato });
	}

	/**
	 * Change the rotation settings applied to the Player State.
	 * @param rotation An object that conforms to the RotationSettings type that defines the frequency of audio rotating round the listener.
	 */
	public setRotation(rotation: RotationSettings | null = null): Promise<void> {
		return this.setFilters({ rotation });
	}

	/**
	 * Change the distortion settings applied to the Player State.
	 * @param distortion An object that conforms to DistortionSettings that defines distortions in the audio.
	 */
	public setDistortion(distortion: DistortionSettings | null = null): Promise<void> {
		return this.setFilters({ distortion });
	}

	/**
	 * Change the channel mix settings applied to the Player State.
	 * @param channelMix An object that conforms to ChannelMixSettings that defines how much the left and right channels affect each other. (setting all factors to 0.5 causes both channels to get the same audio)
	 */
	public setChannelMix(channelMix: ChannelMixSettings | null = null): Promise<void> {
		return this.setFilters({ channelMix });
	}

	/**
	 * Change the low pass settings applied to the Player State.
	 * @param lowPass An object that conforms to LowPassSettings that defines the amount of suppression on higher frequencies.
	 */
	public setLowPass(lowPass: LowPassSettings | null = null): Promise<void> {
		return this.setFilters({ lowPass });
	}

	/**
	 * Change the all filter settings applied to the Player State.
	 * @param filters An object that conforms to FilterOptions that defines all filters to apply/modify.
	 */
	public async setFilters(filters: FilterOptions): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: { filters },
			noReplace: true
		});

		this.filters = player.filters;
	}

	/** Clear all filters applied to the Player State. */
	public clearFilters(): Promise<void> {
		return this.setFilters({
			volume: 1,
			equalizer: [],
			karaoke: null,
			timescale: null,
			tremolo: null,
			vibrato: null,
			rotation: null,
			distortion: null,
			channelMix: null,
			lowPass: null
		});
	}

	/**
	 * Resumes the current track after lavalink is disconnect.
	 * @internal
	 */
	public async resumePlayer(): Promise<void> {
		await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: {
				track: { encoded: this._encodedTrack },
				position: this.position,
				volume: this.volume,
				paused: this.paused,
				filters: this.filters,
				voice: {
					token: this.connection.serverUpdate!.token,
					endpoint: this.connection.serverUpdate!.endpoint,
					sessionId: this.connection.sessionId!
				}
			}
		});

		this.connection.sendVoiceUpdate();
	}

	/**
	 * Cleans this player instance.
	 * @internal
	 */
	public clean(): void {
		this.trackIdentifier = null;
		this.volume = 100;
		this.position = 0;
		this.filters = {};
		this._encodedTrack = null;

		this.removeAllListeners();
	}

	/**
	 * Sends server update to lavalink, or resume the current track by node session.
	 * @internal
	 */
	public async sendServerUpdate(connection: VoiceConnection): Promise<void> {
		const player = await this.node.rest.updatePlayer({
			guildId: this.guildId,
			playerOptions: {
				voice: {
					token: connection.serverUpdate!.token,
					endpoint: connection.serverUpdate!.endpoint,
					sessionId: connection.sessionId!
				}
			},
			noReplace: true
		});

		this.trackIdentifier = player.track?.info.identifier ?? null;
		this.position = player.state.position;
		this.ping = player.state.ping;
		this.volume = player.volume;
		this.paused = player.paused;
		this.filters = player.filters;
		this._encodedTrack = player.track?.encoded ?? null;

		return undefined;
	}

	/**
	 * Handle player update data from Lavalink Websocket.
	 * @internal
	 */
	public onPlayerUpdate(data: { state: { position: number; ping: number } }): void {
		const { position, ping } = data.state;

		this.position = position;
		this.ping = ping;

		this.emit("update", data);

		return undefined;
	}

	/**
	 * Handle player events received from Lavalink Websocket.
	 * @param data JSON data from Lavalink.
	 * @internal
	 */
	public onPlayerEvent(data: { type: string; track: Track }): void {
		switch (data.type) {
			case "TrackStartEvent":
				this.trackIdentifier = data.track.info.identifier;
				this._encodedTrack = data.track.encoded;

				this.emit("start", data);

				break;
			case "TrackEndEvent":
				this._encodedTrack = null;

				this.emit("end", data);

				break;
			case "TrackStuckEvent":
				this.emit("stuck", data);

				break;
			case "TrackExceptionEvent":
				this.emit("exception", data);

				break;
			case "WebSocketClosedEvent":
				this.emit("closed", data);

				break;
			default:
				this.node.manager.emit(
					"debug",
					`[PLAYER => ${this.node.name}]: Unknown Player Event Type ${data.type}, Guild: ${this.guildId}`
				);
		}
	}
}
