export const source = String.raw`
await (async () => {
  const databaseName = "t3code:connection-runtime";
  const storeName = "catalog";
  const documentKey = "document";
  const gatewayPrefix = "gateway:";
  const emptyCatalog = () => ({
    schemaVersion: 1,
    targets: [],
    profiles: [],
    credentials: [],
    remoteDpopTokens: [],
  });
  const isRecord = (value) => typeof value === "object" && value !== null;
  const list = (value) => Array.isArray(value) ? value : [];
  const parseCatalog = (value) => {
    if (typeof value !== "string") {
      return emptyCatalog();
    }
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : emptyCatalog();
    } catch {
      return emptyCatalog();
    }
  };
  const connectionId = (environmentId) => gatewayPrefix + environmentId;
  const environmentIdFromConnectionId = (value) =>
    typeof value === "string" && value.startsWith(gatewayPrefix)
      ? value.slice(gatewayPrefix.length)
      : null;
  const openDatabase = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
    });
  const readCatalog = (database) =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(documentKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const writeCatalog = (database, catalog) =>
    new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(JSON.stringify(catalog), documentKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  const upsertByConnectionId = (current, next) => {
    const values = new Map();
    for (const item of current) {
      if (isRecord(item) && typeof item.connectionId === "string") {
        values.set(item.connectionId, item);
      }
    }
    for (const item of next) {
      if (isRecord(item) && typeof item.connectionId === "string") {
        values.set(item.connectionId, item);
      }
    }
    return [...values.values()];
  };
  const database = await openDatabase();
  try {
    const rawCatalog = await readCatalog(database);
    const catalog = parseCatalog(rawCatalog);
    const targets = list(catalog.targets);
    const profiles = list(catalog.profiles);
    const credentials = list(catalog.credentials);
    const installedGatewayEnvironmentIds = targets
      .filter((target) => isRecord(target) && typeof target.connectionId === "string")
      .filter((target) => target.connectionId.startsWith(gatewayPrefix))
      .map((target) => typeof target.environmentId === "string" ? target.environmentId : null)
      .filter((environmentId) => environmentId !== null);
    const response = await fetch("/api/gateway/t3code-catalog/sync", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installedGatewayEnvironmentIds }),
    });
    if (!response.ok) {
      console.warn("Gateway catalog sync failed.", response.status);
      return;
    }
    const sync = await response.json();
    const removeEnvironmentIds = new Set(list(sync.removeEnvironmentIds));
    const shouldRemoveGatewayEntry = (entry) => {
      if (!isRecord(entry) || typeof entry.connectionId !== "string") {
        return false;
      }
      const environmentId =
        typeof entry.environmentId === "string"
          ? entry.environmentId
          : environmentIdFromConnectionId(entry.connectionId);
      return environmentId !== null && removeEnvironmentIds.has(environmentId);
    };
    const nextCatalog = {
      schemaVersion: 1,
      targets: upsertByConnectionId(
        targets.filter((target) => !shouldRemoveGatewayEntry(target)),
        list(sync.upsertTargets),
      ),
      profiles: upsertByConnectionId(
        profiles.filter((profile) => !shouldRemoveGatewayEntry(profile)),
        list(sync.upsertProfiles),
      ),
      credentials: upsertByConnectionId(
        credentials.filter((credential) => !shouldRemoveGatewayEntry(credential)),
        list(sync.upsertCredentials),
      ),
      remoteDpopTokens: list(catalog.remoteDpopTokens),
    };
    await writeCatalog(database, nextCatalog);
  } catch (error) {
    console.warn("Gateway catalog bootstrap failed.", error);
  } finally {
    database.close();
  }
})();`;
