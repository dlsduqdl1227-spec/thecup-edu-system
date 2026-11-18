declare module "web-push" {
  const webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    generateRequestDetails(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string,
      options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number; urgency: string; contentEncoding: string }):
      { endpoint: string; headers: Record<string,string>; body: Uint8Array };
  };
  export default webpush;
}
