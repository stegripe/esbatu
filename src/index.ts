import { version as packageVersion } from "../package.json";

export * as Constants from "./Constants";
export * from "./Icelink";
export * from "./node/index";
export * from "./node/Rest";
export * from "./guild/Player";
export * from "./guild/VoiceConnection";

/** The {@link https://github.com/stegripe/icelink#readme | Icelink} version that you are currently using. */
export const version = packageVersion;
