# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 - (2024-07-20)

### Features
* **Constants:** add constants for states ([97048ab](https://github.com/stegripe/esbatu/commit/97048ab))
* **Guild:** add Player and VoiceConnection components ([62c562c](https://github.com/stegripe/esbatu/commit/62c562c))
* **Icelink:** add Icelink and interface require ([2314785](https://github.com/stegripe/esbatu/commit/2314785))
* **Icelink:** make updateInstance for VoiceConnection ([7d2d879](https://github.com/stegripe/esbatu/commit/7d2d879))
* **Icelink:** use enum for redis ([f89abc2](https://github.com/stegripe/esbatu/commit/f89abc2))
* **Node:** add Node and Rest Api components ([7e43770](https://github.com/stegripe/esbatu/commit/7e43770))
* **Node:** make version regex for only supported v4 ([63800e3](https://github.com/stegripe/esbatu/commit/63800e3))
* **Player:** add redis cache handler for moving node ([bd60e76](https://github.com/stegripe/esbatu/commit/bd60e76))
* **Player:** make connected property for voice gateway ([c6412bf](https://github.com/stegripe/esbatu/commit/c6412bf))
* add more dependencies for lavalink api ([f73c86d](https://github.com/stegripe/esbatu/commit/f73c86d))
* add tsup config for prepack ([5c3a158](https://github.com/stegripe/esbatu/commit/5c3a158))

### Bug Fixes
* **Icelink:** fix not initialize by client ([a58e42d](https://github.com/stegripe/esbatu/commit/a58e42d))
* **Node:** fix dataCache duplicate while reconnect by client ([9fa59a7](https://github.com/stegripe/esbatu/commit/9fa59a7))
* **Node:** fix invalid scheme fetch ([881aaef](https://github.com/stegripe/esbatu/commit/881aaef))
* **Node:** fix leaveVoiceChannel throw for lavalink player not found ([1ac9a7a](https://github.com/stegripe/esbatu/commit/1ac9a7a))
* **Node:** fix new Player is not creates for redis cache ([ccfcb1c](https://github.com/stegripe/esbatu/commit/ccfcb1c))
* **Node:** fix node check version for reconnecting state ([3dba326](https://github.com/stegripe/esbatu/commit/3dba326))
* **Node:** fix overwrite redis cache after node reconnected ([e0f82ee](https://github.com/stegripe/esbatu/commit/e0f82ee))
* **Node:** fix player not filtering for clean ([a302df8](https://github.com/stegripe/esbatu/commit/a302df8))
* **Node:** fix redis cache for another node ([e4e5053](https://github.com/stegripe/esbatu/commit/e4e5053))
* **Node:** fix redis cache is not defined ([926ad1e](https://github.com/stegripe/esbatu/commit/926ad1e))
* **Player:** fix encodedTrack is type null after moving a node ([e21e894](https://github.com/stegripe/esbatu/commit/e21e894))
* **Player:** fix force event emit while node is moving ([b747cbf](https://github.com/stegripe/esbatu/commit/b747cbf))
* **Player:** fix node not exclude after disconnected ([24328a6](https://github.com/stegripe/esbatu/commit/24328a6))
* fix all imports missing ([4895344](https://github.com/stegripe/esbatu/commit/4895344))

### Documentation
* **Icelink:** grammar fix ([3f844b9](https://github.com/stegripe/esbatu/commit/3f844b9))
* **Icelink:** make jsdoc for updateInstance ([f027f6c](https://github.com/stegripe/esbatu/commit/f027f6c))

### Refactors
* **Icelink:** drop listen abstract method ([a670a35](https://github.com/stegripe/esbatu/commit/a670a35))
* **Node:** protect property for url and version ([d14e987](https://github.com/stegripe/esbatu/commit/d14e987))
* **Node:** remove nullable from resume handle ([773d809](https://github.com/stegripe/esbatu/commit/773d809))
* **Player:** make IdealExcludeCurrentNode as function ([8ea623f](https://github.com/stegripe/esbatu/commit/8ea623f))
* **Player:** make if operator for VoiceConnection on resumePlayer ([3c65139](https://github.com/stegripe/esbatu/commit/3c65139))
* **Player:** remove parameter default `null` from `setFilters` parent ([26528bb](https://github.com/stegripe/esbatu/commit/26528bb))
* **ServerUpdate:** remove guild_id data ([c166275](https://github.com/stegripe/esbatu/commit/c166275))
* **tsconfig:** disable `exactOptionalPropertyTypes` and `esModuleInterop` ([f25872d](https://github.com/stegripe/esbatu/commit/f25872d))
* **VoiceConnection:** move function to updateInstance on Icelink as merge ([0382629](https://github.com/stegripe/esbatu/commit/0382629))
* **VoiceConnection:** restructure property ([ac2c545](https://github.com/stegripe/esbatu/commit/ac2c545))
* fix all eslint breaking changes ([b1dee73](https://github.com/stegripe/esbatu/commit/b1dee73))
* fix all types conflicts ([c98dc10](https://github.com/stegripe/esbatu/commit/c98dc10))
* revert some pretty conflicts ([accb109](https://github.com/stegripe/esbatu/commit/accb109))

### Typings
* **LavalinkPlayer:** use nullish for `track` ([f51d339](https://github.com/stegripe/esbatu/commit/f51d339))
* **NodeInfoVersion:** use nullish for `preRelease` and `build` ([d5830fc](https://github.com/stegripe/esbatu/commit/d5830fc))
* **Track:** use nullish for `uri`, `artworkUrl`, and `isrc` ([b529692](https://github.com/stegripe/esbatu/commit/b529692))
* **UpdatePlayerOptions:** remove `undefined` type from all property ([df30010](https://github.com/stegripe/esbatu/commit/df30010))
