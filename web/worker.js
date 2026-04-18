/**
 * Worker script to handle Chinese (non-ASCII) URL paths.
 *
 * Cloudflare Workers Static Assets double-encodes non-ASCII directory names
 * in its manifest, so a browser request for /article/中文标题/ won't match.
 *
 * This worker intercepts every request, decodes the URL path, and fetches
 * the asset via the ASSETS binding with the decoded path. This bypasses
 * the manifest matching issue entirely.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Decode the pathname (handles %E4%B8%AD -> 中 etc.)
    // Then re-encode only the parts that the ASSETS binding expects
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      decodedPath = url.pathname;
    }

    // Build a new URL with the decoded path for the ASSETS fetch
    const assetUrl = new URL(request.url);
    assetUrl.pathname = decodedPath;

    // Try fetching from static assets
    const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    return response;
  },
};
