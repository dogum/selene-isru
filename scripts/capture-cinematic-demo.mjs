// Compatibility entry point: <productionBaseUrl> <candidateDirectory>.
// The shared pipeline never replaces published media before review.
process.argv.splice(2, 0, 'product');
await import('./capture-video-set.mjs');
