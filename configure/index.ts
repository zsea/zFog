import { ICrypto } from "../fs/icrypto";
import { IStorage } from "../fs/storage";
import { createAuthentication } from "./authentication";
import { createCrypto } from "./crypto";
import { createSaver } from "./saver";
import { server, ServerInfo } from "./server"
import { createStorage } from "./storage";

export function loadConfigure(type: "base64" | "plain" = "base64", name?: string): ServerInfo {
    name = name || "FOG_CONFIGURE";
    let v = process.env[name];
    if (!v) throw new Error("未找到配置信息");
    if (type === "base64") {
        v = Buffer.from(v, "base64").toString("utf8");
    }
    let cfg: server = JSON.parse(v);
    let auth = createAuthentication(cfg.authentication);
    let storages: IStorage[] = [];
    cfg.storages.map(m => createStorage(m)).forEach(s => {
        if (s) {
            storages.push(s);
        }
    });
    //console.log(storages);
    return {
        timeout: cfg.timeout || 0,
        path: cfg.path || "/",
        crypto: createCrypto(cfg.crypto),
        httpAuthentication: auth ? auth.authentication : undefined,
        privilegeManager: auth ? auth.privilege : undefined,
        storages: storages,
        saver: cfg.saver ? createSaver(cfg.saver, storages) : undefined,
        blockSize: cfg.blockSize || 1024 * 1024 * 2,
        copies:cfg.copies||1,
        copyMode:cfg.copyMode||"cycle"
    };
}