/* eslint-disable @typescript-eslint/naming-convention */
import { Node, NodeInfo, NodeStats } from "./index";
import { NodeOption } from "../Icelink";
import { FilterOptions } from "../guild/Player";
import { fetch } from "undici";

export enum LoadType {
	Track = "track",
	Playlist = "playlist",
	Search = "search",
	Empty = "empty",
	Error = "error"
}

export interface Track {
	encoded: string;
	info: {
		identifier: string;
		isSeekable: boolean;
		author: string;
		length: number;
		isStream: boolean;
		position: number;
		title: string;
		uri: string | null;
		artworkUrl: string | null;
		isrc: string | null;
		sourceName: string;
	};
	pluginInfo: object;
}

export interface Playlist {
	info: {
		name: string;
		selectedTrack: number;
	};
	tracks: Track[];
	pluginInfo: object;
}

export interface Exception {
	message: string;
	severity: Severity;
	cause: string;
}

export type Severity = "common" | "fault" | "suspicious";
export type LavalinkResponse = EmptyResult | ErrorResult | PlaylistResult | SearchResult | TrackResult;

export interface TrackResult {
	loadType: LoadType.Track;
	data: Track;
}

export interface PlaylistResult {
	loadType: LoadType.Playlist;
	data: Playlist;
}

export interface SearchResult {
	loadType: LoadType.Search;
	data: Track[];
}

export interface EmptyResult {
	loadType: LoadType.Empty;
	data: null;
}

export interface ErrorResult {
	loadType: LoadType.Error;
	data: Exception;
}

export interface Address {
	address: string;
	failingTimestamp: number;
	failingTime: string;
}

export interface RoutePlanner {
	class:
		| "BalancingIpRoutePlanner"
		| "NanoIpRoutePlanner"
		| "RotatingIpRoutePlanner"
		| "RotatingNanoIpRoutePlanner"
		| null;
	details: {
		ipBlock: {
			type: string;
			size: string;
		};
		failingAddresses: Address[];
		rotateIndex: string;
		ipIndex: string;
		currentAddress: string;
		blockIndex: string;
		currentAddressIndex: string;
	} | null;
}

export interface LavalinkPlayer {
	guildId: string;
	track: Track | null;
	volume: number;
	paused: boolean;
	state: LavalinkPlayerState;
	voice: LavalinkPlayerVoiceState;
	filters: FilterOptions;
}

export interface LavalinkPlayerState {
	time: number;
	position: number;
	connected: boolean;
	ping: number;
}

export interface LavalinkPlayerVoiceState {
	token: string;
	endpoint: string;
	sessionId: string;
}

export interface UpdatePlayerInfo {
	guildId: string;
	playerOptions: UpdatePlayerOptions;
	noReplace?: boolean;
}

export interface UpdatePlayerOptions {
	track?:
		| {
				encoded?: string | null;
		  }
		| undefined;
	position?: number | undefined;
	endTime?: number | undefined;
	volume?: number | undefined;
	paused?: boolean | undefined;
	filters?: FilterOptions;
	voice?: LavalinkPlayerVoiceState;
}

export interface SessionInfo {
	resuming: boolean;
	timeout: number;
}

interface FetchOptions {
	endpoint: string;
	options: {
		[key: string]: unknown;
		headers?: Record<string, string>;
		params?: Record<string, string>;
		method?: string;
		body?: Record<string, unknown> | string[];
	};
}

interface FinalFetchOptions {
	method: string;
	headers: Record<string, string>;
	signal: AbortSignal;
	body?: string;
}

/** Wrapper around for the Lavalink REST API. */
export class Rest {
	/** Decode for single or multiple of track. */
	public decode = {
		/**
		 * Decode a single track into it's info.
		 * @param encodedTrack A encoded track.
		 * @returns Promise that resolves to a track.
		 */
		singleTrack: (encodedTrack: string): Promise<Track> =>
			this.request({ endpoint: "/decodetrack", options: { params: { encodedTrack } } }),

		/**
		 * Decodes multiple tracks into their info.
		 * @param encodeds A encodeds track.
		 * @returns Promise that resolves to an array of tracks.
		 */
		multipleTracks: (encodeds: string[]): Promise<Track[]> =>
			this.request({
				endpoint: "/decodetracks",
				options: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: encodeds
				}
			})
	};

	/**
	 * {@link Node} that initialized this instance.
	 * @readonly
	 */
	public readonly node;
	/**
	 * A URL of the Lavalink.
	 * @protected
	 * @readonly
	 * @internal
	 */
	protected readonly url;
	/**
	 * A credentials to access the Lavalink.
	 * @protected
	 * @readonly
	 * @internal
	 */
	protected readonly authorization;
	/**
	 * Rest version to use.
	 * @protected
	 * @readonly
	 * @internal
	 */
	protected readonly version: string = "/v4";

	/**
	 * Create a Lavalink REST API class instance on {@link Node}.
	 * @param node An instance of {@link Node}.
	 * @param options The options to initialize this rest class.
	 */
	public constructor(node: Node, options: NodeOption) {
		this.node = node;
		this.url = `${options.secure ? "https" : "http"}://${options.url}`;
		this.authorization = options.authorization;

		Object.defineProperties(this, {
			decode: { enumerable: false, writable: false },
			node: { enumerable: true, writable: false },
			url: { enumerable: false, writable: false },
			authorization: { enumerable: false, writable: false },
			version: { enumerable: false, writable: false }
		});
	}

	/**
	 * SessionId for Lavalink REST API. (not to be confused with Discord SessionId)
	 * @protected
	 * @readonly
	 * @internal
	 */
	protected get sessionId(): string {
		return this.node.sessionId!;
	}

	/**
	 * Resolve a new track.
	 * @param identifier A track identifier.
	 * @returns A promise that resolves to a Lavalink response.
	 */
	public resolve(identifier: string): Promise<LavalinkResponse> {
		return this.request({
			endpoint: "/loadtracks",
			options: { params: { identifier } }
		});
	}

	/**
	 * Gets all the Player State with the specified sessionId.
	 * @returns Promise that resolves to an array of Lavalink players.
	 */
	public getPlayers(): Promise<LavalinkPlayer[]> {
		return this.request({ endpoint: `/sessions/${this.sessionId}/players`, options: {} });
	}

	/**
	 * Get the Player State with the specified guildId.
	 * @param guildId guildId where this player is.
	 * @returns Promise that resolves to a Lavalink player.
	 */
	public getPlayer(guildId: string): Promise<LavalinkPlayer> {
		return this.request({
			endpoint: `/sessions/${this.sessionId}/players/${guildId}`,
			options: {}
		});
	}

	/**
	 * Update the Player State on the Lavalink Server
	 * @param data A data for update the Player state.
	 * @returns Promise that resolves to a Lavalink player.
	 */
	public updatePlayer(data: UpdatePlayerInfo): Promise<LavalinkPlayer> {
		return this.request({
			endpoint: `/sessions/${this.sessionId}/players/${data.guildId}`,
			options: {
				method: "PATCH",
				params: { noReplace: data.noReplace?.toString() ?? "false" },
				headers: { "Content-Type": "application/json" },
				body: data.playerOptions as Record<string, unknown>
			}
		});
	}

	/**
	 * Delete the Player State from the Lavalink Server.
	 * @param guildId guildId where this player is.
	 */
	public async destroyPlayer(guildId: string): Promise<void> {
		await this.request({
			endpoint: `/sessions/${this.sessionId}/players/${guildId}`,
			options: { method: "DELETE" }
		});
	}

	/**
	 * Updates the session with a resume boolean and timeout.
	 * @param resuming Whether resuming is enabled for this session or not.
	 * @param timeout Timeout to wait for resuming.
	 * @returns Promise that resolves to a session info response.
	 */
	public updateSession(resuming: boolean, timeout: number): Promise<SessionInfo> {
		return this.request({
			endpoint: `/sessions/${this.sessionId}`,
			options: {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: { resuming, timeout }
			}
		});
	}

	/**
	 * Gets the status of this node.
	 * @returns Promise that resolves to a node stats response.
	 */
	public stats(): Promise<NodeStats> {
		return this.request({ endpoint: "/stats", options: {} });
	}

	/**
	 * Get routeplanner status from Lavalink.
	 * @returns Promise that resolves to a routeplanner response.
	 */
	public getRoutePlannerStatus(): Promise<RoutePlanner> {
		return this.request({ endpoint: "/routeplanner/status", options: {} });
	}

	/**
	 * Release blacklisted IP address into pool of IPs.
	 * @param address IP address.
	 */
	public async unmarkFailedAddress(address: string): Promise<void> {
		await this.request({
			endpoint: "/routeplanner/free/address",
			options: {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: { address }
			}
		});
	}

	/** Get a Lavalink information. */
	public getLavalinkInfo(): Promise<NodeInfo> {
		return this.request({
			endpoint: "/info",
			options: { headers: { "Content-Type": "application/json" } }
		});
	}

	/**
	 * Make a request to Lavalink.
	 * @param fetchOptions a options for fetch to get the data from Lavalink REST API.
	 * @private
	 * @internal
	 */
	private async request<T = unknown>(fetchOptions: FetchOptions): Promise<T> {
		const { endpoint, options } = fetchOptions;
		const headers = {
			Authorization: this.authorization,
			"User-Agent": this.node.manager.options.userAgent,
			...(options.headers ?? {})
		};
		const url = new URL(`${this.url}${this.version}${endpoint}`);

		if (options.params) url.search = new URLSearchParams(options.params).toString();

		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), this.node.manager.options.restTimeout * 1_000);
		const method = options.method?.toUpperCase() ?? "GET";
		const finalFetchOptions: FinalFetchOptions = {
			method,
			headers,
			signal: abortController.signal
		};

		if (!["GET", "HEAD"].includes(method) && options.body) finalFetchOptions.body = JSON.stringify(options.body);

		const request = await fetch(url.toString(), finalFetchOptions).finally(() => clearTimeout(timeout));

		if (!request.ok) {
			const response = await request.json().catch(() => null);

			if ("message" in (response as any)) {
				throw new Error(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					`Rest request failed with response code: ${request.status}, message: ${(response as any).message}`
				);
			} else {
				throw new Error(`Rest request failed with response code: ${request.status}`);
			}
		}

		try {
			return (await request.json()) as T;
		} catch {
			return undefined as T;
		}
	}
}
