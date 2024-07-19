/* eslint-disable tsdoc/syntax */
import { EventEmitter } from "node:events";
import type { PlayerUpdatePayload as IPlayerUpdatePayload, WebSocketOp } from "lavalink-api-types/v4";
import { WebSocketType } from "lavalink-api-types/v4";
import { RedisKey, State } from "../Constants";
import type { VoiceChannelOptions } from "../Esbatu";
import type { Exception, Track } from "../node/Rest";
import type { Node } from "../node/index";
import type { VoiceConnection } from "./VoiceConnection";

export type PlayOptions = {
    track: string;
    options?: {
        noReplace?: boolean;
        pause?: boolean;
        startTime?: number;
        endTime?: number;
    };
};

export type Band = {
    band: number;
    gain: number;
};

export type KaraokeSettings = {
    level?: number;
    monoLevel?: number;
    filterBand?: number;
    filterWidth?: number;
};

export type TimescaleSettings = {
    speed?: number;
    pitch?: number;
    rate?: number;
};

export type FreqSettings = {
    frequency?: number;
    depth?: number;
};

export type RotationSettings = {
    rotationHz?: number;
};

export type DistortionSettings = {
    sinOffset?: number;
    sinScale?: number;
    cosOffset?: number;
    cosScale?: number;
    tanOffset?: number;
    tanScale?: number;
    offset?: number;
    scale?: number;
};

export type ChannelMixSettings = {
    leftToLeft?: number;
    leftToRight?: number;
    rightToLeft?: number;
    rightToRight?: number;
};

export type LowPassSettings = {
    smoothing?: number;
};

export type EventPayload = {
    op: WebSocketOp.Event;
    guildId: string;
    type: WebSocketType;
};

export type TrackStartEventPayload = EventPayload & {
    type: WebSocketType.TrackStartEvent;
    track: Track;
};

export type TrackEndEventPayload = EventPayload & {
    type: WebSocketType.TrackEndEvent;
    track: Track | null;
    reason: TrackEndReason;
};

export enum TrackEndReason {
    Finished = "finished",
    LoadFailed = "loadFailed",
    Stopped = "stopped",
    Replaced = "replaced",
    Cleanup = "cleanup"
}

export type TrackStuckEventPayload = EventPayload & {
    type: WebSocketType.TrackStuckEvent;
    track: Track;
    thresholdMs: number;
};

export type TrackExceptionEventPayload = EventPayload & {
    type: WebSocketType.TrackExceptionEvent;
    track: Track;
    exception: Exception;
};

export type WebSocketClosedEventPayload = EventPayload & {
    type: WebSocketType.WebSocketClosedEvent;
    code: WebsocketCloseCode;
    reason: string;
    byRemote: boolean;
};

export enum WebsocketCloseCode {
    UnknownError = 4_000,
    UnknownOpCode = 4_001,
    DecodeError = 4_002,
    NotAuthenticated = 4_003,
    AuthenticatedError = 4_004,
    AlreadyAuthenticated = 4_005,
    SessionInvalid = 4_006,
    SessionTimeout = 4_009,
    ServerNotFound = 4_011,
    UnknownProtocol = 4_012,
    Disconnected = 4_014,
    VoiceServerCrashed = 4_015,
    UnknownEncryptionMode = 4_016
}

export type PlayerUpdatePayload = IPlayerUpdatePayload & { guildId: string };

export type FilterOptions = {
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
};

/**
 * Wrapper object around Lavalink.
 */
// @ts-expect-error ignore this ts(2300)
export class Player extends EventEmitter {
    /**
     * A Guild id on this player.
     *
     * @readonly
     */
    public readonly guildId;
    /**
     * Lavalink node this player is connected to.
     */
    public node;
    /**
     * A identifier of the currently playing track.
     */
    public trackIdentifier: string | null = null;
    /**
     * Global volume of the player.
     */
    public volume = 100;
    /**
     * Pause status in current player.
     */
    public paused = false;
    /**
     * Ping represents the number of milliseconds between heartbeat and ack. Could be `-1` if not connected.
     */
    public ping = 0;
    /**
     * Position in ms of current playing the track.
     */
    public position = 0;
    /**
     * An filters of the player.
     */
    public filters: FilterOptions = {};
    /**
     * Whether Lavalink is connected to the voice gateway.
     */
    public connected = false;
    /**
     * A encoded of the currently playing track.
     *
     * @private
     * @internal
     */
    private _encodedTrack: string | null = null;
    private _prepareMove = false;

    /**
     * Creates a new Player instance on {@link Node}.
     *
     * @param guildId An instance of guildId
     * @param node An instance of {@link Node}. (Lavalink API wrapper)
     */
    public constructor(guildId: string, node: Node) {
        super();

        this.guildId = guildId;
        this.node = node;

        Object.defineProperties(this, {
            guildId: { enumerable: true, writable: false },
            _encodedTrack: { enumerable: false, writable: true },
            _prepareMove: { enumerable: false, writable: true }
        });
    }

    /**
     * A voice connection on this player state.
     *
     * @readonly
     */
    public get connection(): VoiceConnection {
        // eslint-disable-next-line typescript/no-non-null-assertion
        return this.node.manager.connections.get(this.guildId)!;
    }

    /**
     * Move player to another node
     *
     * @param name Name of node to move to, or the default ideal node
     * @returns true if the player was moved, false if not
     */
    public async movePlayer(name?: string): Promise<boolean> {
        const idealExcludeCurrentNode = (): Node | undefined =>
            [...this.node.manager.nodes.values()]
                .filter(node0 => node0.name !== this.node.name && node0.state === State.Connected)
                .sort((a, b) => a.penalties - b.penalties)
                .shift();
        // eslint-disable-next-line typescript/no-non-null-assertion
        const node = this.node.manager.nodes.get(name!) ?? idealExcludeCurrentNode();

        if (!node || node.name === this.node.name) return false;
        if (node.state !== State.Connected) throw new Error("No available nodes to move to");

        let lastNode = this.node.manager.nodes.get(this.node.name);

        if (!lastNode || lastNode.state !== State.Connected) lastNode = idealExcludeCurrentNode();

        const ICurrentDataCache = await this.node.manager.redis?.get(
            RedisKey.NodePlayers(this.node.name.toLowerCase())
        );
        const currentDataCache =
            ICurrentDataCache === null ? [] : (JSON.parse(ICurrentDataCache ?? "") as VoiceChannelOptions[]);

        currentDataCache.splice(
            // eslint-disable-next-line typescript/no-non-null-assertion
            currentDataCache.indexOf(currentDataCache.find(({ guildId: id }) => id === this.guildId)!),
            1
        );

        this._prepareMove = true;

        await this.node.manager.redis?.set(
            RedisKey.NodePlayers(this.node.name.toLowerCase()),
            JSON.stringify(currentDataCache)
        );
        if (this.node.state === State.Connected) await this.destroyPlayer();

        try {
            this.node = node;

            const IDataCache = await this.node.manager.redis?.get(RedisKey.NodePlayers(this.node.name.toLowerCase()));
            const dataCache = IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);

            dataCache.push({
                guildId: this.guildId,
                // eslint-disable-next-line typescript/no-non-null-assertion
                channelId: this.connection.channelId!,
                shardId: this.connection.shardId,
                deaf: this.connection.deafened,
                mute: this.connection.muted
            });

            await this.resumePlayer();
            await this.node.manager.redis?.set(
                RedisKey.NodePlayers(this.node.name.toLowerCase()),
                JSON.stringify(dataCache)
            );

            this._prepareMove = false;

            return true;
        } catch {
            // eslint-disable-next-line typescript/no-non-null-assertion
            this.node = lastNode!;

            const IDataCache = await this.node.manager.redis?.get(RedisKey.NodePlayers(this.node.name.toLowerCase()));
            const dataCache = IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);

            dataCache.push({
                guildId: this.guildId,
                // eslint-disable-next-line typescript/no-non-null-assertion
                channelId: this.connection.channelId!,
                shardId: this.connection.shardId,
                deaf: this.connection.deafened,
                mute: this.connection.muted
            });

            await this.resumePlayer();
            await this.node.manager.redis?.set(
                RedisKey.NodePlayers(this.node.name.toLowerCase()),
                JSON.stringify(dataCache)
            );

            this._prepareMove = false;

            return false;
        }
    }

    /**
     * Destroys the player in remote lavalink side.
     */
    public async destroyPlayer(): Promise<void> {
        return this.node.rest.destroyPlayer(this.guildId);
    }

    /**
     * Play a new track.
     *
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
            noReplace: playable.options?.noReplace
        });

        this.trackIdentifier = player.track?.info.identifier ?? null;
        this.paused = player.paused;
        this.position = player.state.position;
        this._encodedTrack = player.track?.encoded ?? null;
    }

    /**
     * Stop the currently playing track.
     */
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
     *
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
     *
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
     *
     * @param volume Target volume 0-1000.
     */
    public async setGlobalVolume(volume: number): Promise<void> {
        const player = await this.node.rest.updatePlayer({
            guildId: this.guildId,
            playerOptions: { volume },
            noReplace: true
        });

        this.volume = player.volume;
    }

    /**
     * Sets the filter volume of the player.
     *
     * @param volume Target volume 0.0-5.0.
     */
    public async setFilterVolume(volume: number): Promise<void> {
        return this.setFilters({ volume });
    }

    /**
     * Change the equalizer settings applied to to the Player State.
     *
     * @param equalizer An array of objects that conforms to the Bands type that define volumes at different frequencies.
     */
    public async setEqualizer(equalizer: Band[]): Promise<void> {
        return this.setFilters({ equalizer });
    }

    /**
     * Change the karaoke settings applied to to the Player State.
     *
     * @param karaoke An object that conforms to the KaraokeSettings type that defines a range of frequencies to mute.
     */
    public async setKaraoke(karaoke: KaraokeSettings): Promise<void> {
        return this.setFilters({ karaoke });
    }

    /**
     * Change the timescale settings applied to to the Player State.
     *
     * @param timescale An object that conforms to the TimescaleSettings type that defines the time signature to play the audio at.
     */
    public async setTimescale(timescale: TimescaleSettings): Promise<void> {
        return this.setFilters({ timescale });
    }

    /**
     * Change the tremolo settings applied to to the Player State.
     *
     * @param tremolo An object that conforms to the FreqSettings type that defines an oscillation in volume.
     */
    public async setTremolo(tremolo: FreqSettings): Promise<void> {
        return this.setFilters({ tremolo });
    }

    /**
     * Change the vibrato settings applied to to the Player State.
     *
     * @param vibrato An object that conforms to the FreqSettings type that defines an oscillation in pitch.
     */
    public async setVibrato(vibrato: FreqSettings): Promise<void> {
        return this.setFilters({ vibrato });
    }

    /**
     * Change the rotation settings applied to the Player State.
     *
     * @param rotation An object that conforms to the RotationSettings type that defines the frequency of audio rotating round the listener.
     */
    public async setRotation(rotation: RotationSettings): Promise<void> {
        return this.setFilters({ rotation });
    }

    /**
     * Change the distortion settings applied to the Player State.
     *
     * @param distortion An object that conforms to DistortionSettings that defines distortions in the audio.
     */
    public async setDistortion(distortion: DistortionSettings): Promise<void> {
        return this.setFilters({ distortion });
    }

    /**
     * Change the channel mix settings applied to the Player State.
     *
     * @param channelMix An object that conforms to ChannelMixSettings that defines how much the left and right channels affect each other. (setting all factors to 0.5 causes both channels to get the same audio)
     */
    public async setChannelMix(channelMix: ChannelMixSettings): Promise<void> {
        return this.setFilters({ channelMix });
    }

    /**
     * Change the low pass settings applied to the Player State.
     *
     * @param lowPass An object that conforms to LowPassSettings that defines the amount of suppression on higher frequencies.
     */
    public async setLowPass(lowPass: LowPassSettings): Promise<void> {
        return this.setFilters({ lowPass });
    }

    /**
     * Change the all filter settings applied to the Player State.
     *
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

    /**
     * Clear all filters applied to the Player State.
     */
    public async clearFilters(): Promise<void> {
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
     *
     * @internal
     */
    public async resumePlayer(): Promise<void> {
        const { state } = await this.node.rest.updatePlayer({
            guildId: this.guildId,
            playerOptions: {
                track: { encoded: this._encodedTrack },
                position: this.position,
                paused: this.paused,
                filters: this.filters,
                voice: {
                    token: this.connection.serverUpdate?.token ?? "",
                    endpoint: this.connection.serverUpdate?.endpoint ?? "",
                    sessionId: this.connection.sessionId ?? ""
                }
            }
        });

        if (!state.connected) this.connection.sendVoiceUpdate();
    }

    /**
     * Cleans this player instance.
     *
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
     *
     * @internal
     */
    public async sendServerUpdate(connection: VoiceConnection): Promise<void> {
        const player = await this.node.rest.updatePlayer({
            guildId: this.guildId,
            playerOptions: {
                voice: {
                    token: connection.serverUpdate?.token ?? "",
                    endpoint: connection.serverUpdate?.endpoint ?? "",
                    sessionId: connection.sessionId ?? ""
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
        this.connected = player.state.connected;
        this._encodedTrack = player.track?.encoded ?? null;
    }

    /**
     * Handle player update data from Lavalink Websocket.
     *
     * @internal
     */
    public onPlayerUpdate(data: PlayerUpdatePayload): void {
        if (this._prepareMove) return undefined;

        const { position, ping, connected } = data.state;

        this.position = position;
        this.ping = ping;
        this.connected = connected;

        this.emit("update", data);

        return undefined;
    }

    /**
     * Handle player events received from Lavalink Websocket.
     *
     * @param data JSON data from Lavalink.
     * @internal
     */
    public onPlayerEvent(
        data:
            | TrackEndEventPayload
            | TrackExceptionEventPayload
            | TrackStartEventPayload
            | TrackStuckEventPayload
            | WebSocketClosedEventPayload
    ): void {
        if (this._prepareMove) return undefined;

        switch (data.type) {
            case WebSocketType.TrackStartEvent:
                this.trackIdentifier = data.track.info.identifier;
                this._encodedTrack = data.track.encoded;

                this.emit("start", data);

                break;
            case WebSocketType.TrackEndEvent:
                this.emit("end", data);

                break;
            case WebSocketType.TrackStuckEvent:
                this.emit("stuck", data);

                break;
            case WebSocketType.TrackExceptionEvent:
                this.emit("exception", data);

                break;
            case WebSocketType.WebSocketClosedEvent:
                this.emit("closed", data);

                break;
            default:
                this.node.manager.emit(
                    "debug",
                    `[PLAYER => ${this.node.name}] Unknown player message, type: ${data as unknown as string}, guild: ${this.guildId}.`
                );
        }

        return undefined;
    }
}

// @ts-expect-error ignore this ts(2300)
// eslint-disable-next-line typescript/no-redeclare
export declare type Player = {
    on: ((event: "closed", listener: (reason: WebSocketClosedEventPayload) => void) => Player) &
        ((event: "end", listener: (reason: TrackEndEventPayload) => void) => Player) &
        ((event: "exception", listener: (reason: TrackExceptionEventPayload) => void) => Player) &
        ((event: "resumed", listener: (player: Player) => void) => Player) &
        ((event: "start", listener: (data: TrackStartEventPayload) => void) => Player) &
        ((event: "stuck", listener: (data: TrackStuckEventPayload) => void) => Player) &
        ((event: "update", listener: (data: PlayerUpdatePayload) => void) => Player);
};
