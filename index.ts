import { v2 as webdav } from '@zsea/webdav-server'
import { FogFileSystem } from './fs/FogFileSystem';
import { logger } from "./logger"
import { BlockManager, INodeManager } from './fs/inode';
import { StorageManager } from './fs/storage';
import { FogStorageManager } from './fs/FogStorageManager';
import { loadConfigure } from './configure/index';
import Express from 'express';
import { CryptoManager } from './fs/icrypto';

(async function main() {
    let configure = await loadConfigure((process.env["FOG_CONFIGURE_TYPE"]||"base64") as "base64" | "plain" | "file");
    let reqHeaders:{[name:string]:string}|undefined;
    if(configure.useHost){
        reqHeaders={"host":configure.useHost}
    }

    const express = Express();
    const server = new webdav.WebDAVServer({
        httpAuthentication: configure.httpAuthentication,
        privilegeManager: configure.privilegeManager,
        //port: Number(process.env.PORT || process.env["WEBPORT"] || 3000),
        storageManager: new FogStorageManager(configure.totalSize),
        reqHeaders:reqHeaders,
        usedProtocol:configure.useProtocol
    });
    server.beforeRequest((ctx, next) => {
        logger.info(`[${ctx.request.method}] ${ctx.requested.path.toString()}`);
        next();
    })
    server.afterRequest(ctx=>{
        logger.info(`[${ctx.request.method}] ${ctx.requested.path.toString()} ===> [${ctx.response.statusCode}] ${ctx.response.statusMessage}`);
    })
    // 开始挂载文件系统 
    let storageManager: StorageManager = new StorageManager();
    for (let storage of configure.storages) {

        if (!await storage.initialize()) {
            logger.error(`存储器 ${storage.type}/${storage.id} 初始化失败。`);
        }
        storageManager.Add(storage);
    }
    if (!storageManager.Length()) {
        throw new Error("没有可用的存储器。");
    }

    let inodeManager: INodeManager = new INodeManager(() => {
        return new BlockManager(storageManager, configure.copies, configure.copyMode, new CryptoManager(configure.crypto))
    }, configure.saver);
    if (!await inodeManager.initialize()) {
        throw new Error("inode文件初始化失败。");
    }
    let fogFs = new FogFileSystem(inodeManager, configure.blockSize);
    if (await server.setFileSystemAsync(configure.path||"/", fogFs)) {
        logger.info(`文件系统挂载成功 ${configure.path||"/"}`);
    }
    else {
        logger.error("文件系统挂载失败");
    }

    // 结束文件系统挂载
    express.get("/",(req,res,next)=>{
        res.send('雾盘!');
    })
    express.use(webdav.extensions.express('/', server));
    let httpServer =express.listen(Number(process.env.PORT || process.env["WEBPORT"] || 3000),()=>{
        httpServer.setTimeout(configure.timeout||0);
        logger.info(`服务启动成功`, httpServer.address());
    })
})();