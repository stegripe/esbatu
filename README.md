# Icelink

> Icelink is an innovative project that surpasses Lavalink, offering a superior audio streaming experience. Built as a refined alternative, Icelink boasts enhanced stability, frequent updates, and a robust foundation that supports extendable structures. It introduces new handling mechanisms, ensures compatibility with ESM (ECMAScript Modules) and CommonJS, and integrates Redis caching for optimized performance. Icelink represents a cutting-edge solution for streaming music, elevating the user experience with its advanced features and forward-looking approach.

<div align="center">
    <a href="https://www.npmjs.com/package/icelink"><img src="https://img.shields.io/npm/v/icelink.svg?maxAge=3600" alt="NPM version" ><a/>
    <a href="https://www.npmjs.com/package/icelink"><img src="https://img.shields.io/npm/dt/icelink.svg?maxAge=3600" alt="NPM downloads" /></a>
    <a href="https://github.com/stegripe/icelink/actions"><img src="https://github.com/stegripe/icelink/actions/workflows/test.yml/badge.svg" alt="Tests status" /></a>
</div>

## Installation

**Node.js 18 or newer is required.**

```sh
npm install icelink
yarn add icelink
pnpm add icelink
bun add icelink
```

## Example usage

Create class extends Icelink for depending on your library implementation (like discord.js):

```js
import { Icelink } from "icelink";

export class extends Icelink {
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
import { Client } from "discord.js"

const client = new Client({
    intents: [
		"Guilds",
		"GuildMembers",
		"GuildVoiceStates",
		"GuildMessages"
	]
});

client.icelink = new Icelink(client, { nodes: [
    {
        name: "default",
        url: "localhost:2333",
        authorization: "youshallnotpass"
    }
]
});

client.icelink.on("error", (_, error) => console.error(error));
client.on("raw", packet => client.icelink.updateInstance(packet));
client.on("ready" async () => {
    client.icelink.id = client.user.id;

    for (const node of client.icelink.options.nodes)
		client.icelink.addNode(node).catch(error => client.icelink.emit("error", node.name, error));

    const node = client.icelink.idealNode;
    const player = await client.icelink.joinVoiceChannel({
        guildId: "836189103103811192",
        channelId: "721217201021217261",
        shardId: 0
    });

    const resultTrack = await player.node.rest.resolve("https://youtu.be/QAAap0ceNbo");

    await player.playTrack({ track: resultTrack.data.encoded });

    setTimeout(async () => {
        await client.icelink.leaveVoiceChannel(player.guildId);
    }, 60_000);
});

client.login("token");
```
