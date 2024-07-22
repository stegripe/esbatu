/* eslint-disable typescript/no-unsafe-assignment, typescript/naming-convention, typescript/no-shadow, tsdoc/syntax, no-await-in-loop, no-param-reassign */
import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { setTimeout } from "node:timers";
import { URL } from "node:url";
import type { EventPayload, ReadyPayload } from "lavalink-api-types/v4";
import { WebSocketOp } from "lavalink-api-types/v4";
import Websocket from "ws";
import { State, VoiceState, RedisKey } from "../Constants";
import type { NodeOption, Esbatu, VoiceChannelOptions } from "../Esbatu";
import type {
    PlayerUpdatePayload,
    TrackEndEventPayload,
    TrackExceptionEventPayload,
    TrackStartEventPayload,
    TrackStuckEventPayload,
    WebSocketClosedEventPayload
} from "../guild/Player";
import { Player } from "../guild/Player";
import { VoiceConnection } from "../guild/VoiceConnection";
import { Rest } from "./Rest";

export interface NodeStats {
    players: number;
    playingPlayers: number;
    memory: {
        reservable: number;
        used: number;
        free: number;
        allocated: number;
    };
    frameStats: {
        sent: number;
        deficit: number;
        nulled: number;
    } | null;
    cpu: {
        cores: number;
        systemLoad: number;
        lavalinkLoad: number;
    };
    uptime: number;
}

export interface NodeInfo {
    version: NodeInfoVersion;
    buildTime: number;
    git: NodeInfoGit;
    jvm: string;
    lavaplayer: string;
    sourceManagers: string[];
    filters: string[];
    plugins: NodeInfoPlugin[];
}

export interface NodeInfoVersion {
    semver: string;
    major: number;
    minor: number;
    patch: number;
    preRelease: string | null;
    build: string | null;
}

export interface NodeInfoGit {
    branch: string;
    commit: string;
    commitTime: number;
}

export interface NodeInfoPlugin {
    name: string;
    version: string;
}

interface ResumableHeaders {
    "Client-Name": string;
    "User-Agent": string;
    Authorization: string;
    "User-Id": string;
    "Session-Id": string;
}

type NonResumableHeaders = Omit<ResumableHeaders, "Session-Id"> & {};
type StatsPayload = NodeStats & { op: WebSocketOp.Stats };

/**
 * Represents a Lavalink node.
 */
export class Node {
    /**
     * Main {@link Esbatu} class.
     *
     * @readonly
     */
    public readonly manager;
    /**
     * A Lavalink {@link Rest | REST} API.
     *
     * @readonly
     */
    public readonly rest;
    /**
     * Name of this node.
     *
     * @readonly
     */
    public readonly name;
    /**
     * The number of reconnects to Lavalink.
     */
    public reconnects = 0;
    /**
     * The state of this connection.
     */
    public state: State = State.Disconnected;
    /**
     * Statistics from Lavalink.
     */
    public stats: NodeStats | null = null;
    /**
     * Websocket instance for the Lavalink.
     */
    public ws: Websocket | null = null;
    /**
     * SessionId of this Lavalink connection. (not to be confused with Discord SessionId)
     */
    public sessionId: string | null = null;
    /**
     * A URL of the Lavalink.
     *
     * @protected
     * @readonly
     * @internal
     */
    protected readonly url;
    /**
     * A credentials to access the Lavalink.
     *
     * @protected
     * @readonly
     * @internal
     */
    protected readonly authorization;
    /**
     * Websocket version this node will use.
     *
     * @protected
     * @readonly
     * @internal
     */
    protected readonly version: string = "/v4";
    /**
     * Boolean that represents if the node has initialized once.
     *
     * @private
     * @internal
     */
    private initialized = false;
    /**
     * Boolean that represents if this connection is destroyed.
     *
     * @private
     * @internal
     */
    private destroyed = false;

    /**
     * Creates a new Node instance for {@link Esbatu}.
     *
     * @param manager A {@link Esbatu} instance.
     * @param options Options on creating this node.
     */
    public constructor(manager: Esbatu, options: NodeOption) {
        this.manager = manager;
        this.rest = new (manager.options.structures.rest ?? Rest)(this, options);
        this.name = options.name;
        this.url = `${(options.secure ?? false) ? "wss" : "ws"}://${options.url}`;
        this.authorization = options.authorization;

        Object.defineProperties(this, {
            manager: { enumerable: false, writable: false },
            rest: { enumerable: true, writable: false },
            name: { enumerable: true, writable: false },
            url: { enumerable: true, writable: false },
            authorization: { enumerable: false, writable: false },
            version: { enumerable: true, writable: false },
            initialized: { enumerable: false, writable: true },
            destroyed: { enumerable: false, writable: true }
        });
    }

    /**
     * Penalties for load balancing
     *
     * @returns Penalty score
     * @readonly
     * @internal
     */
    public get penalties(): number {
        let penalties = 0;

        if (!this.stats) return penalties;

        penalties += this.stats.players;
        penalties += Math.round(1.05 ** (100 * this.stats.cpu.systemLoad) * 10 - 10);

        if (this.stats.frameStats) {
            penalties += this.stats.frameStats.deficit;
            penalties += this.stats.frameStats.nulled * 2;
        }

        return penalties;
    }

    /**
     * If we should clean this node
     *
     * @private
     * @readonly
     * @internal
     */
    private get shouldClean(): boolean {
        return this.destroyed || this.reconnects >= this.manager.options.reconnectTries;
    }

    /**
     * Connect to the Lavalink Websocket.
     */
    public async connect(): Promise<void> {
        if (this.manager.id === null) throw new Error("Don't connect a node when the library is not yet ready");
        if (this.destroyed) {
            throw new Error(
                "You can't re-use the same instance of a node once disconnected, please re-add the node again"
            );
        }
        if (this.state === State.Connected) return undefined;

        let unSupportedVersion = false;

        try {
            const version = await (
                await fetch(`${this.url.replace("ws", "http")}/version`, {
                    headers: { Authorization: this.authorization, "User-Agent": this.manager.options.userAgent }
                })
            )
                // eslint-disable-next-line unicorn/no-await-expression-member
                .text();
            const versionRegex =
                /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+(?<buildmetadata>[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/u;

            if (Number(versionRegex.exec(version)?.at(1) ?? 0) !== 4) unSupportedVersion = true;
        } catch {
            /* empty */
        }

        if (unSupportedVersion) throw new Error(`This node (${this.name}) is only supported for v4`);

        this.state = State.Connecting;
        this.sessionId = (await this.manager.redis?.get(RedisKey.NodeSession(this.name.toLowerCase()))) ?? null;

        const headers: NonResumableHeaders | ResumableHeaders = {
            "Client-Name": this.manager.options.userAgent,
            "User-Agent": this.manager.options.userAgent,
            "User-Id": this.manager.id,
            Authorization: this.authorization
        };

        if (this.sessionId !== null) (headers as ResumableHeaders)["Session-Id"] = this.sessionId;

        this.manager.emit(
            "debug",
            `[WS => ${this.name}] Connecting ${this.url}, lavalink version: ${this.version}, trying to resume? ${Boolean(
                this.sessionId
            )}.`
        );

        if (!this.initialized) this.initialized = true;

        this.ws = new Websocket(new URL(`${this.url}${this.version}/websocket`), {
            headers
        } as Websocket.ClientOptions);

        this.ws.once("upgrade", this.open.bind(this));
        this.ws.once("close", this.close.bind(this));
        this.ws.on("error", this.error.bind(this));
        // eslint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks
        this.ws.on("message", async data => this.message(data).catch((error: unknown) => this.error(error as Error)));

        return undefined;
    }

    /**
     * Disconnect the from Lavalink Websocket.
     *
     * @param code Status code.
     * @param reason Reason for the disconnect.
     */
    public disconnect(code: number, reason?: string): void {
        if (this.destroyed) return undefined;

        this.destroyed = true;
        this.state = State.Disconnected;

        if (this.ws) this.ws.close(code, reason);
        else void this.clean();

        return undefined;
    }

    /**
     * Joins a voice channel.
     *
     * @param options The options to pass in connection creation.
     * @returns The created new Player.
     */
    public async joinVoiceChannel(options: VoiceChannelOptions): Promise<Player> {
        if (this.manager.connections.has(options.guildId))
            throw new Error("This guild already have an existing connection");

        const connection = new VoiceConnection(this.manager, options);

        this.manager.connections.set(connection.guildId, connection);

        try {
            await connection.connect();
        } catch (error) {
            this.manager.connections.delete(options.guildId);

            throw error;
        }

        try {
            const player = new (this.manager.options.structures.player ?? Player)(connection.guildId, this);

            await player.sendServerUpdate(connection);
            connection.on("connectionUpdate", async (state: VoiceState) => {
                if (state !== VoiceState.SessionReady) return;

                const IDataCache = await this.manager.redis?.get(RedisKey.NodePlayers(player.node.name.toLowerCase()));
                const dataCache = IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);
                const dataIndex = dataCache.indexOf(dataCache.find(({ guildId }) => guildId === connection.guildId)!);

                dataCache.at(dataIndex)!.guildId = connection.guildId;
                dataCache.at(dataIndex)!.channelId = connection.channelId!;
                dataCache.at(dataIndex)!.shardId = connection.shardId;
                dataCache.at(dataIndex)!.deaf = connection.deafened;
                dataCache.at(dataIndex)!.mute = connection.muted;

                await this.manager.redis?.set(
                    RedisKey.NodePlayers(player.node.name.toLowerCase()),
                    JSON.stringify(dataCache)
                );

                await player.sendServerUpdate(connection);
            });

            const IDataCache = await this.manager.redis?.get(RedisKey.NodePlayers(this.name.toLowerCase()));
            const dataCache = IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);

            if (!dataCache.some(({ guildId }) => guildId === options.guildId)) {
                dataCache.push({
                    guildId: options.guildId,
                    channelId: options.channelId,
                    shardId: options.shardId,
                    deaf: options.deaf ?? true,
                    mute: options.mute ?? false
                });

                await this.manager.redis?.set(RedisKey.NodePlayers(this.name.toLowerCase()), JSON.stringify(dataCache));
            }

            this.manager.players.set(player.guildId, player);

            return player;
        } catch (error) {
            connection.disconnect();
            this.manager.connections.delete(options.guildId);

            throw error;
        }
    }

    /**
     * Leaves a voice channel.
     *
     * @param guildId The id of the guild you want to delete.
     * @returns The destroyed / disconnected player or undefined if none.
     */
    public async leaveVoiceChannel(guildId: string): Promise<void> {
        const connection = this.manager.connections.get(guildId);
        const player = this.manager.players.get(guildId);

        if (connection) {
            connection.disconnect();
            this.manager.connections.delete(guildId);
        }
        if (player) {
            player.clean();

            try {
                await player.destroyPlayer();
            } catch {
                /* empty */
            }

            this.manager.players.delete(guildId);
        }

        const IDataCache = await this.manager.redis?.get(RedisKey.NodePlayers(this.name.toLowerCase()));
        const dataCache = IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);

        dataCache.splice(dataCache.indexOf(dataCache.find(({ guildId: id }) => id === guildId)!), 1);

        await this.manager.redis?.set(RedisKey.NodePlayers(this.name.toLowerCase()), JSON.stringify(dataCache));
    }

    /**
     * Handle connection open event from the Lavalink Websocket.
     *
     * @param response Response from Lavalink Websocket.
     * @private
     * @internal
     */
    private open(response: IncomingMessage): void {
        const resumed = response.headers["session-resumed"] === "true";

        this.manager.emit(
            "debug",
            `[WS => ${this.name}] Connection handshake done, upgrade headers resumed: ${resumed}.`
        );

        this.reconnects = 0;
        this.state = State.Nearly;
    }

    /**
     * Handle message from the Lavalink Websocket.
     *
     * @param message JSON message.
     * @private
     * @internal
     */
    private async message(message: Websocket.RawData): Promise<void> {
        if (Array.isArray(message)) message = Buffer.concat(message);
        if (message instanceof ArrayBuffer) message = Buffer.from(message);

        const data: EventPayload | PlayerUpdatePayload | ReadyPayload | StatsPayload | undefined = JSON.parse(
            // eslint-disable-next-line typescript/no-base-to-string
            message.toString()
        );

        if (!data) return undefined;
        if (this.destroyed || this.state === State.Reconnecting) return undefined;

        this.manager.emit("raw", this.name, data);

        switch (data.op) {
            case WebSocketOp.Stats:
                // @ts-expect-error ignore this ts(2790)
                delete data.op;

                this.stats = data;

                this.manager.emit(
                    "debug",
                    `[WS => ${this.name}] Node status update, server load of ${this.penalties}.`
                );

                break;
            case WebSocketOp.Ready: {
                this.state = State.Connected;
                this.sessionId = data.sessionId;

                const players = [...this.manager.players.values()].filter(player => player.node.name === this.name);
                const resumeByLibrary = Boolean(
                    this.initialized && this.manager.options.resumeByLibrary && players.length > 0
                );

                this.manager.emit(
                    "debug",
                    `[WS => ${this.name}] Lavalink is ready, lavalink resume: ${data.resumed}, esbatu resume: ${resumeByLibrary}.`
                );

                if (resumeByLibrary) {
                    try {
                        const playersWithData: Player[] = [];
                        const playersWithoutData: Player[] = [];

                        for (const player of this.manager.players.values()) {
                            const serverUpdate = this.manager.connections.get(player.guildId)?.serverUpdate;

                            if (serverUpdate) playersWithData.push(player);
                            else playersWithoutData.push(player);
                        }

                        await Promise.allSettled([
                            ...playersWithData.map(async player => player.resumePlayer()),
                            ...playersWithoutData.map(async ({ guildId }) => this.leaveVoiceChannel(guildId))
                        ]);
                    } catch (error) {
                        this.error(error as Error);
                    }
                }

                if (this.manager.options.resume) {
                    try {
                        await this.manager.redis?.set(RedisKey.NodeSession(this.name.toLowerCase()), this.sessionId);
                        await this.rest.updateSession(this.manager.options.resume, this.manager.options.resumeTimeout);

                        if (data.resumed) {
                            const IDataCache = await this.manager.redis?.get(
                                RedisKey.NodePlayers(this.name.toLowerCase())
                            );
                            const dataCache =
                                IDataCache === null ? [] : (JSON.parse(IDataCache ?? "") as VoiceChannelOptions[]);

                            for (const { guildId, channelId, shardId, mute, deaf } of dataCache) {
                                const player = await this.joinVoiceChannel({
                                    guildId,
                                    channelId,
                                    shardId,
                                    mute,
                                    deaf
                                    // eslint-disable-next-line typescript/no-empty-function
                                }).catch(() => {});

                                if (player) continue;

                                dataCache.splice(
                                    dataCache.indexOf(dataCache.find(({ guildId: id }) => id === guildId)!),
                                    1
                                );

                                await this.manager.redis?.set(
                                    RedisKey.NodePlayers(this.name.toLowerCase()),
                                    JSON.stringify(dataCache)
                                );
                            }
                        }

                        this.manager.emit("debug", `[WS => ${this.name}] Resuming configured.`);
                    } catch (error) {
                        this.error(error as Error);
                    }
                }

                this.manager.emit("ready", this.name, resumeByLibrary || data.resumed);

                break;
            }
            case WebSocketOp.Event:
            case WebSocketOp.PlayerUpdate: {
                const player = this.manager.players.get(data.guildId);

                if (!player) return undefined;
                if (data.op === WebSocketOp.Event)
                    player.onPlayerEvent(
                        data as
                            | TrackEndEventPayload
                            | TrackExceptionEventPayload
                            | TrackStartEventPayload
                            | TrackStuckEventPayload
                            | WebSocketClosedEventPayload
                    );
                else player.onPlayerUpdate(data);

                break;
            }
            default:
                this.manager.emit(
                    "debug",
                    `[WS => ${this.name}] Unknown opcodes message, type: ${data as unknown as string}.`
                );
        }

        return undefined;
    }

    /**
     * Handle closed event from the Lavalink Websocket.
     *
     * @param code Status close.
     * @param reason Reason for connection close.
     * @private
     * @internal
     */
    private close(code: number, reason: Buffer): void {
        this.manager.emit("debug", `[WS => ${this.name}] Connection closed, code: ${code || "unknown"}.`);
        this.manager.emit("close", this.name, code, reason.toString());

        if (this.shouldClean) void this.clean();
        else this.reconnect();
    }

    /**
     * To emit error events easily.
     *
     * @param error A error message.
     * @private
     * @internal
     */
    private error(error: Error): void {
        this.manager.emit("error", this.name, error);
    }

    /**
     * Destroys the Lavalink Websocket connection.
     *
     * @param count A total of players success to move another node.
     * @private
     * @internal
     */
    private destroy(count: number = 0): void {
        this.ws?.removeAllListeners();
        this.ws?.close();

        this.ws = null;
        this.sessionId = null;
        this.state = State.Disconnected;

        if (!this.shouldClean) return undefined;

        this.destroyed = true;

        this.manager.emit("disconnect", this.name, count);
        this.manager.nodes.delete(this.name);

        return undefined;
    }

    /**
     * Cleans and moves players to other nodes if possible.
     *
     * @private
     * @internal
     */
    private async clean(): Promise<void> {
        let count = 0;

        if (!this.manager.options.moveOnDisconnect) {
            this.destroy(count);
            return;
        }

        const players = [...this.manager.players.values()].filter(player => player.node.name === this.name);

        try {
            const data = await Promise.allSettled(players.map(async player => player.movePlayer()));

            count = data.filter(results => results.status === "fulfilled").length;
        } catch (error) {
            this.error(error as Error);
        }

        this.destroy(count);
    }

    /**
     * Reconnect to the Lavalink Websocket.
     *
     * @private
     * @internal
     */
    private reconnect(): void {
        if (this.state === State.Reconnecting) return undefined;
        if (this.state !== State.Disconnected) this.destroy();

        this.state = State.Reconnecting;
        this.reconnects++;

        this.manager.emit(
            "reconnecting",
            this.name,
            this.manager.options.reconnectTries - this.reconnects,
            this.manager.options.reconnectInterval
        );
        this.manager.emit(
            "debug",
            `[WS => ${this.name}] Reconnecting in ${this.manager.options.reconnectInterval} seconds, ${
                this.manager.options.reconnectTries - this.reconnects
            } tries left.`
        );

        setTimeout(async () => this.connect(), this.manager.options.reconnectInterval * 1_000);

        return undefined;
    }
}
