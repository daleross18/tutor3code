/**
 * Whether the server has the preview tunnel route (`/api/preview/tunnel`). A stock v0.1.10 server
 * has no route and sends no `enablePreviewTunnel`, which the v0.1.11 schema decodes as on.
 */
export const hasPreviewTunnelRoute = (config: {
  readonly environment: { readonly capabilities: { readonly previewTunnelSetting?: boolean } };
}): boolean => config.environment.capabilities.previewTunnelSetting === true;
