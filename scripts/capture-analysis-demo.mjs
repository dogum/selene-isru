// Compatibility entry point: <productionBaseUrl> <candidateDirectory>.
// Native 1080p H.264 replaces the legacy 540p WebM workflow.
process.argv.splice(2, 0, 'analysis');
await import('./capture-video-set.mjs');
