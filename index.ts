import { v2 as webdav } from 'webdav-server'
import HTTPPut from "./server/HTTPPut"
import * as http from 'http';
import { GiteeStorage } from "./fs/storages/gitee"
import { IZseaStorage, ZseaFileSystem, ZseaSerializer } from "./fs/ZseaFileSystem"
import { ZseaStorageManager } from './fs/ZseaStorageManager';
import log4js from "log4js"
import { LoadConfigure, StorageConfigure, UserConfigure } from "./configure"
import { GithubStorage } from './fs/storages/github';
const logger = log4js.getLogger("WEBDAV");
logger.level = "TRACE";



async function Mount(fs: StorageConfigure, server: webdav.WebDAVServer): Promise<boolean> {
    let storage: IZseaStorage | null | undefined = null;
    if (fs.type === "gitee") {
        storage = new GiteeStorage(fs.accessToken as string, fs.owner as string, fs.repo as string, fs.branch as string);
    }
    else if (fs.type === "github") {
        storage = new GithubStorage(fs.accessToken as string, fs.owner as string, fs.repo as string, fs.branch as string)
    }
    if (!storage) return false;
    let fileSystem = new ZseaFileSystem(storage, fs.blockSize || 1024 * 1024 * 4);
    await fileSystem.Initialization();
    if (!await new Promise(function (resolve, reject) {

        server.setFileSystem(fs.mountPoint || "/", fileSystem, (successed) => {
            resolve(successed);
        });
    })) {
        logger.error(`文件系统挂载失败,类型 ${fs.type} 挂载点：${fs.mountPoint}`);
        return false;
    }

    return true;
}
function getUsers(users?: UserConfigure[]): {userManager:webdav.SimpleUserManager,privilegeManager:webdav.SimplePathPrivilegeManager} | undefined | null {
    if (!users || users.length == 0) return;
    let userManager = new webdav.SimpleUserManager();
    let privilegeManager = new webdav.SimplePathPrivilegeManager();
    users.every((u) => {
        let user= userManager.addUser(u.username, u.password, false);
        privilegeManager.setRights(user, u.path||"/", u.rights || ['all']);
    });
    return {
        userManager:userManager,
        privilegeManager:privilegeManager
    };
}

(async function main() {
    let configures = await LoadConfigure();
    let user_db=getUsers(configures.users);
    const server = new webdav.WebDAVServer({
        httpAuthentication: user_db?.userManager ?(configures.authenticateType==="digest"?new webdav.HTTPDigestAuthentication(user_db?.userManager,"fogWebdav"):new webdav.HTTPBasicAuthentication(user_db?.userManager , 'fogWebdav'))  : undefined,
        privilegeManager: user_db?.privilegeManager ? user_db?.privilegeManager : undefined,
        port: Number(process.env.PORT || process.env["WEBPORT"] || 3000),
        storageManager: new ZseaStorageManager()
    });
    for(let s of configures.fs){
        await Mount(s,server);
    }
    server.beforeRequest((ctx,next)=>{
        logger.info(`[${ctx.request.method}] ${ctx.requested.path.toString()}`);
        
        next();
    })
    server.method("PUT",new HTTPPut());
    let httpServer = await new Promise<http.Server | undefined>(function (resolve, reject) {
        server.start((httpServer?: http.Server) => {
            resolve(httpServer);
        })
    });
    if (!httpServer) {
        logger.error(`服务启动失败`);
        return;
    }
    httpServer.setTimeout(0);
    //logger.info(`超时时间：${httpServer.timeout}`);
    logger.info(`服务启动成功`, httpServer.address());
})();
