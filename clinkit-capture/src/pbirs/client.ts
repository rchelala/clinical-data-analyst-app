export interface PbirsClient {
  /** GET a JSON endpoint, returns parsed object */
  getJson(url: string): Promise<unknown>;
  /** POST JSON body, returns parsed response */
  postJson(url: string, body: object): Promise<unknown>;
  /** GET a binary endpoint, returns raw bytes */
  getBytes(url: string): Promise<Buffer>;
}
