/* eslint-disable tsdoc/syntax */
import { EventEmitter } from "node:events";
import type { GatewayVoiceServerUpdateDispatch, GatewayVoiceStateUpdateDispatch } from "discord-api-types/v10";
import { GatewayDispatchEvents } from "discord-api-types/v10";
import type { Redis } from "ioredis";
import { name as packageName, version as packageVersion } from "../package.json";
import { State, VoiceState } from "./Constants";
import type { Player } from "./guild/Player";
import type { VoiceConnection } from "./guild/VoiceConnection";
import type { Rest } from "./node/Rest";
import { Node } from "./node/index";

export type VoiceChannelOptions = {
    /**
     * A id of Guild in which the {@link VoiceChannelOptions.channelId} of the voice channel is located.
     */
    guildId: string;
    /**
     * A id of Shard to track where this should send on sharded websockets, put 0 if you are unsharded.
     */
    shardId: number;
    /**
     * A id of the voice channel you want to connect to.
     */
    channelId: string;
    /**
     * Whether to deafen or undeafen the current bot user.
     */
    mute?: boolean;
    /**
     * Whether to mute or unmute the current bot user.
     */
    deaf?: boolean;
};

export type NodeOption = {
    /**
     * Name of this node.
     */
    name: string;
    /**
     * A credentials to access the Lavalink.
     */
    authorization: string;
    /**
     * A URL of the Lavalink.
     */
    url: string;
    /**
     * Whether to use secure protocols or not.
     */
    secure?: boolean;
};

export type EsbatuOptions = {
    /**
     * Whether to move players to a different Lavalink node when a node disconnect.
     */
    moveOnDisconnect?: boolean;
    /**
     * The {@link Node} options, for all the nodes.
     */
    nodes: NodeOption[];
    /**
     * Timeout before trying to reconnect.
     */
    reconnectInterval?: number;
    /**
     * Number of times to try and reconnect to Lavalink before giving up.
     */
    reconnectTries?: number;
    /**
     * Whether to use redis cache system to save the node session and channel id from players, or not.
     */
    redis?: Redis;
    /**
     * Whether to resume a connection on disconnect from the Lavalink. (Server Side)
     */
    resume?: boolean;
    /**
     * Whether to resume the players by doing it in the library side. (Client Side)
     */
    resumeByLibrary?: boolean;
    /**
     * Time to wait before lavalink starts to destroy the players of the disconnected client.
     */
    resumeTimeout?: number;
    /**
     * Time to wait for a response from the Lavalink REST API before giving up.
     */
    restTimeout?: number;
    /**
     * Custom or extend the structures for Esbatu to use.
     */
    structures?: Structures;
    /**
     * User Agent to use when making requests to Lavalink.
     */
    userAgent?: string;
    /**
     * Timeout before abort the voice connection.
     */
    voiceConnectionTimeout?: number;
};

type Constructor<T> = new (...args: any[]) => T;

export type Structures = {
    /**
     * A custom structure that extends the {@link Rest} class.
     */
    rest?: Constructor<Rest>;
    /**
     * A custom structure that extends the {@link Player} class.
     */
    player?: Constructor<Player>;
};

/**
 * Main Esbatu class.
 */
// @ts-expect-error ignore this ts(2300)
export abstract class Esbatu extends EventEmitter {
    /**
     * A Esbatu options.
     *
     * @readonly
     */
    public readonly options: Required<Omit<EsbatuOptions, "redis">>;
    /**
     * Connected Lavalink nodes.
     *
     * @readonly
     */
    public readonly nodes = new Map<string, Node>();
    /**
     * Voice connections being handled.
     *
     * @readonly
     */
    public readonly connections = new Map<string, VoiceConnection>();
    /**
     * Players being handled.
     *
     * @readonly
     */
    public readonly players = new Map<string, Player>();
    /**
     * redis cache being handle for save node session and players.
     *
     * @readonly
     */
    public readonly redis: Redis | null = null;
    /**
     * Esbatu instance identifier.
     */
    public id: string | null = null;

    /**
     * Creates a new Esbatu.
     *
     * @param options An options to pass to create this Esbatu instance.
     */
    public constructor(options: EsbatuOptions) {
        super();

        this.options = {
            moveOnDisconnect: options.moveOnDisconnect ?? false,
            nodes: options.nodes,
            reconnectInterval: options.reconnectInterval ?? 5,
            reconnectTries: options.reconnectTries ?? 3,
            resume: options.resume ?? false,
            resumeByLibrary: options.resumeByLibrary ?? false,
            resumeTimeout: options.resumeTimeout ?? 30,
            restTimeout: options.restTimeout ?? 60,
            structures: options.structures ?? {},
            userAgent: options.userAgent ?? `${packageName}/${packageVersion}`,
            voiceConnectionTimeout: options.voiceConnectionTimeout ?? 15
        };
        this.redis = options.redis ?? null;

        Object.defineProperties(this, {
            options: { enumerable: false, writable: false },
            nodes: { enumerable: true, writable: false },
            connections: { enumerable: true, writable: false },
            players: { enumerable: true, writable: false },
            redis: { enumerable: false, writable: false },
            id: { enumerable: false, writable: true }
        });
    }

    /**
     * A ideal Lavalink node if available connected.
     *
     * @readonly
     */
    public get idealNode(): Node | undefined {
        return [...this.nodes.values()]
            .filter(node => node.state === State.Connected)
            .sort((a, b) => a.penalties - b.penalties)
            .shift();
    }

    /**
     * Add a Lavalink node to the pool of available nodes.
     *
     * @param options A node options for instance.
     */
    public async addNode(options: NodeOption): Promise<void> {
        const node = new Node(this, options);

        await node.connect();

        this.nodes.set(node.name, node);
    }

    /**
     * Remove a Lavalink node from the pool of available nodes.
     *
     * @param name Name of the node.
     * @param reason Reason of removing the node.
     */
    public removeNode(name: string, reason = "Remove node executed"): void {
        const node = this.nodes.get(name);

        if (!node) throw new Error("The node name you specified doesn't exist");

        node.disconnect(1_000, reason);
    }

    /**
     * update an instance for voice connection (voice state, and voice server).
     *
     * @param packet Packet instance from Discord Gateway.
     */
    public updateInstance(packet: GatewayVoiceServerUpdateDispatch | GatewayVoiceStateUpdateDispatch): void {
        const guildId = packet.d.guild_id ?? "";
        const connection = this.connections.get(guildId);
        const AllowedPackets: GatewayDispatchEvents[] = [
            GatewayDispatchEvents.VoiceStateUpdate,
            GatewayDispatchEvents.VoiceServerUpdate
        ];

        if (!connection || !AllowedPackets.includes(packet.t)) return undefined;

        if (packet.t === GatewayDispatchEvents.VoiceServerUpdate) {
            if (packet.d.endpoint === null) {
                connection.emit("connectionUpdate", VoiceState.SessionEndpointMissing);

                return undefined;
            }
            if (connection.sessionId === null) {
                connection.emit("connectionUpdate", VoiceState.SessionIdMissing);

                return undefined;
            }

            connection.lastRegion = connection.region?.repeat(1) ?? null;
            connection.region = packet.d.endpoint.split(".").shift()?.replace(/\d/gu, "") ?? null;

            connection.serverUpdate = {
                token: packet.d.token,
                endpoint: packet.d.endpoint
            };

            if (connection.region !== null && connection.lastRegion !== connection.region) {
                this.emit(
                    "debug",
                    `[VOICE => DISCORD] Voice region changed, old region: ${connection.lastRegion}, new region: ${connection.region}, guild: ${guildId}.`
                );
            }

            connection.emit("connectionUpdate", VoiceState.SessionReady);
            this.emit("debug", `[VOICE => DISCORD] Server update received, guild: ${guildId}.`);

            return undefined;
        }

        const userId = packet.d.user_id;

        if (userId !== this.id) return undefined;

        connection.lastChannelId = connection.channelId?.repeat(1) ?? null;
        connection.channelId = packet.d.channel_id;
        connection.deafened = packet.d.self_deaf;
        connection.muted = packet.d.self_mute;
        connection.sessionId = packet.d.session_id;

        if (connection.channelId !== null && connection.lastChannelId !== connection.channelId) {
            this.emit(
                "debug",
                `[VOICE => DISCORD] Channel moved, old channel: ${connection.lastChannelId}, new channel: ${connection.channelId}, guild: ${guildId}.`
            );
        }

        if (connection.channelId === null) {
            connection.state = State.Disconnected;

            this.emit("debug", `[VOICE => DISCORD] Channel disconnected, guild: ${guildId}.`);

            return undefined;
        }

        this.emit(
            "debug",
            `[VOICE => DISCORD] State update received, session: ${connection.sessionId}, guild: ${guildId}.`
        );

        return undefined;
    }

    /**
     * sendPacket is where your library send packets to Discord Gateway.
     *
     * @abstract
     */
    public abstract sendPacket(shardId: number, payload: unknown, important: boolean): void;
}

// @ts-expect-error ignore this ts(2300)
// eslint-disable-next-line typescript/no-redeclare
export type Esbatu = EventEmitter & {
    on: ((
        event: "reconnecting",
        listener: (name: string, reconnectsLeft: number, reconnectInterval: number) => void
    ) => Esbatu) &
        ((event: "close", listener: (name: string, code: number, reason: string) => void) => Esbatu) &
        ((event: "debug", listener: (debug: string) => void) => Esbatu) &
        ((event: "disconnect", listener: (name: string, count: number) => void) => Esbatu) &
        ((event: "error", listener: (name: string, error: Error) => void) => Esbatu) &
        ((event: "raw", listener: (name: string, data: unknown) => void) => Esbatu) &
        ((event: "ready", listener: (name: string, reconnected: boolean) => void) => Esbatu);
};
