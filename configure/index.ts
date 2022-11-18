import { IStorage } from "../fs/storage";
import { createAuthentication } from "./authentication";
import { createCrypto } from "./crypto";
import { createSaver } from "./saver";
import { server, ServerInfo } from "./server"
import { createStorage } from "./storage";
import fs from "fs/promises"
import { logger } from "../logger";
import { NoneCrypto } from "../fs/icrypto";

export async function loadConfigure(type: "base64" | "plain" | "file" = "base64", name?: string): Promise<ServerInfo> {
    name = name || "FOG_CONFIGURE";
    logger.info(`配置方式:${type}`);
    logger.info(`配置变量名称：${name}`)
    let v = process.env[name];
    if(type==="file"){
        v=await fs.readFile("configure.json","utf8");
    }
    else if(type==="base64"&&v){
        v = Buffer.from(v, "base64").toString("utf8");
    }
    
    if (!v) throw new Error("未找到配置信息");
    
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
        crypto: cfg.crypto? cfg.crypto.map(p=>createCrypto(p)):[new NoneCrypto("")],
        httpAuthentication: auth ? auth.authentication : undefined,
        privilegeManager: auth ? auth.privilege : undefined,
        storages: storages,
        saver: cfg.saver ? createSaver(cfg.saver, storages) : undefined,
        blockSize: cfg.blockSize || 1024 * 1024 * 2,
        copies: cfg.copies || 1,
        copyMode: cfg.copyMode || "cycle",
        useHost:cfg.useHost,
        useProtocol:cfg.useProtocol,
        totalSize:(cfg.totalSize===null||cfg.totalSize===undefined)?-1:cfg.totalSize
    };
}