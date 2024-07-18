/* eslint-disable tsdoc/syntax, id-length */
import { EventEmitter, once } from "node:events";
import { setTimeout, clearTimeout } from "node:timers";
import { State, VoiceState } from "../Constants";
import type { Esbatu, VoiceChannelOptions } from "../Esbatu";

export type StateUpdatePartial = {
    session_id?: string;
    channel_id: string | null;
    self_deaf: boolean;
    self_mute: boolean;
};

export type ServerUpdate = {
    token: string;
    endpoint: string;
};

/**
 * Represents a connection to a Discord voice channel.
 */
export class VoiceConnection extends EventEmitter {
    /**
     * Main {@link Esbatu} class.
     *
     * @readonly
     */
    public readonly manager;
    /**
     * A id of Guild that contains the connected voice channel.
     *
     * @readonly
     */
    public readonly guildId;
    /**
     * A id of the connected voice channel.
     */
    public channelId: string | null;
    /**
     * A id of the Shard that contains the guild that contains the connected voice channel.
     */
    public shardId;
    /**
     * Mute status in connected voice channel.
     */
    public muted;
    /**
     * Deafen status in connected voice channel.
     */
    public deafened;
    /**
     * A id of the last channelId connected to.
     */
    public lastChannelId: string | null = null;
    /**
     * A id of the session for voice connection.
     */
    public sessionId: string | null = null;
    /**
     * Region of connected voice channel.
     */
    public region: string | null = null;
    /**
     * Last region of the connected voice channel
     */
    public lastRegion: string | null = null;
    /**
     * Cached serverUpdate event from Lavalink Websocket.
     */
    public serverUpdate: ServerUpdate | null = null;
    /**
     * Connection state.
     */
    public state: State = State.Disconnected;

    /**
     * Creates a new VoiceConnection instance.
     *
     * @param manager The manager of this connection.
     * @param options The options to pass in connection creation.
     */
    public constructor(manager: Esbatu, options: VoiceChannelOptions) {
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
     *
     * @param deaf Boolean value to indicate whether to deafen or undeafen.
     * @defaultValue true
     */
    public setDeaf(deaf = true): void {
        this.deafened = deaf;

        this.sendVoiceUpdate();
    }

    /**
     * Set the mute status for the current bot user.
     *
     * @param mute Boolean value to indicate whether to mute or unmute.
     * @defaultValue false
     */
    public setMute(mute = false): void {
        this.muted = mute;

        this.sendVoiceUpdate();
    }

    /**
     * Disconnect the current bot user from the connected voice channel.
     *
     * @internal
     */
    public disconnect(): void {
        if (this.state === State.Disconnected) return undefined;

        this.channelId = null;
        this.state = State.Disconnected;

        this.removeAllListeners();
        this.sendVoiceUpdate();

        this.manager.emit("debug", `[VOICE => NODE & DISCORD] Connection destroyed, guild: ${this.guildId}.`);

        return undefined;
    }

    /**
     * Connect the current bot user to a voice channel.
     *
     * @internal
     */
    public async connect(): Promise<void> {
        if (this.state === State.Connecting || this.state === State.Connected) return;

        this.state = State.Connecting;

        this.sendVoiceUpdate();
        this.manager.emit("debug", `[VOICE => DISCORD] Requesting connection, guild: ${this.guildId}.`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.manager.options.voiceConnectionTimeout * 1_000);

        try {
            // eslint-disable-next-line typescript/no-unsafe-assignment
            const [status] = await once(this, "connectionUpdate", { signal: controller.signal });

            if (status !== VoiceState.SessionReady) {
                // eslint-disable-next-line default-case
                switch (status) {
                    case VoiceState.SessionIdMissing:
                        throw new Error("The voice connection is not established due to missing session id");
                    case VoiceState.SessionEndpointMissing:
                        throw new Error("The voice connection is not established due to missing connection endpoint");
                }
            }

            this.manager.emit("debug", `[VOICE => DISCORD] Request connected, guild: ${this.guildId}.`);

            this.state = State.Connected;
        } catch (error: any) {
            this.manager.emit("debug", `[VOICE => DISCORD] Request connection failure, guild: ${this.guildId}.`);

            if ((error as Error).name === "AbortError") {
                throw new Error(
                    `The voice connection is not established in ${this.manager.options.voiceConnectionTimeout} seconds`
                );
            }

            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Send voice data to Discord.
     *
     * @internal
     */
    public sendVoiceUpdate(): void {
        this.manager.sendPacket(
            this.shardId,
            {
                op: 4,
                d: {
                    guild_id: this.guildId,
                    channel_id: this.channelId,
                    self_deaf: this.deafened,
                    self_mute: this.muted
                }
            },
            false
        );
    }
}
