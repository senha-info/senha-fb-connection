import "node-firebird";

declare module "node-firebird" {
  interface Database {
    on(event: "commit" | "rollback", listener: () => void): this;
  }
}
