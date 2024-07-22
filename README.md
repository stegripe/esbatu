# Esbatu

> Esbatu surpasses Lavalink with enhanced stability, frequent updates, and support for ESM and CommonJS, offering a superior audio streaming experience. It features new handling mechanisms and uses Redis to manage current song/session resources, preventing replay issues.

<div align="center">
    <a href="https://www.npmjs.com/package/esbatu"><img src="https://img.shields.io/npm/v/esbatu.svg?maxAge=3600" alt="NPM version" ><a/>
    <a href="https://www.npmjs.com/package/esbatu"><img src="https://img.shields.io/npm/dt/esbatu.svg?maxAge=3600" alt="NPM downloads" /></a>
    <a href="https://github.com/stegripe/esbatu/actions"><img src="https://github.com/stegripe/esbatu/actions/workflows/test.yaml/badge.svg" alt="Tests status" /></a>
</div>

## Installation

**Node.js 18 or newer is required.**

```sh
npm install esbatu # npm
pnpm add esbatu # pnpm
yarn add esbatu # yarn
bun add esbatu # bun
```

## Example usage

Create class extends Esbatu for depending on your library implementation (like discord.js):

```js
import { Esbatu } from "esbatu";

export class extends Esbatu {
    constructor(client, options) {
        super(options);

        this.client = client;
    }

    sendPacket(shardId, payload, important) {
        return this.client.ws.shards.get(shardId)?.send(payload, important);
    }
}
```

Afterwards we can create a quite simple example:

```js
import { Client } from "discord.js";
import { Esbatu } from "./Esbatu.js";

const client = new Client({
    intents: ["Guilds", "GuildMembers", "GuildVoiceStates", "GuildMessages"]
});

client.esbatu = new Esbatu(client, {
    nodes: [
        {
            name: "default",
            url: "localhost:2333",
            authorization: "youshallnotpass"
        }
    ]
});

client.esbatu.on("error", (_, error) => console.error(error));
client.on("raw", packet => client.esbatu.updateInstance(packet));
client.on("ready", async () => {
    client.esbatu.id = client.user.id;

    for (const node of client.esbatu.options.nodes)
        client.esbatu.addNode(node).catch(error => client.esbatu.emit("error", node.name, error));

    const node = client.esbatu.idealNode;
    const player = await node.joinVoiceChannel({
        guildId: "972407605295198258",
        channelId: "972421158664298506",
        shardId: 0
    });

    const resultTrack = await player.node.rest.resolve("https://youtu.be/caryNKvasJI");

    await player.playTrack({
        track: resultTrack.data.encoded
    });

    setTimeout(async () => {
        await client.esbatu.leaveVoiceChannel(player.guildId);
    }, 60_000);
});

client.login("token");
```
