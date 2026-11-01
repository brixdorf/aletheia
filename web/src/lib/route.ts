export type Route =
  | { name: "dashboard" }
  | { name: "new"; task: string; url: string; signIn: boolean }
  | { name: "audit"; id: string }
  | { name: "shared"; token: string }
  | { name: "compare"; ids: string[] }
  | { name: "not_found" };

export function matchRoute(pathname: string, search: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  const [head, id] = parts;

  if (parts.length === 0) return { name: "dashboard" };
  if (parts.length === 1 && head === "new") {
    return {
      name: "new",
      task: query.get("task") ?? "",
      url: query.get("url") ?? "",
      signIn: query.get("signIn") === "1",
    };
  }
  if (parts.length === 1 && head === "compare") {
    return { name: "compare", ids: (query.get("audits") ?? "").split(",").filter(Boolean) };
  }
  if (parts.length === 2 && head === "audits" && id) return { name: "audit", id };
  if (parts.length === 2 && head === "shared" && id) return { name: "shared", token: id };
  return { name: "not_found" };
}

export function newAuditHref({
  task,
  url,
  signIn,
}: {
  task: string;
  url: string;
  signIn: boolean;
}): string {
  const query = new URLSearchParams({ task, url });
  if (signIn) query.set("signIn", "1");
  return `/new?${query}`;
}
