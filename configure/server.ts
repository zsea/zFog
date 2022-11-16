import { ICrypto } from "../fs/icrypto"
import { INodeSaver } from "../fs/isaver"
import { IStorage } from "../fs/storage"
import { authentication } from "./authentication"
import { crypto } from "./crypto"
import { saver } from "./saver"
import { storage } from "./storage"
import { v2 as webdav } from 'webdav-server'

export interface server{
    timeout:number|undefined
    path:string|undefined
    crypto:crypto,
    saver?:saver,
    storages:storage[],
    authentication:authentication,
    blockSize?:number,
    copies?:number,
    copyMode:"random"|"cycle"|"all"
}
export interface ServerInfo{
    timeout:number,
    path:string,
    crypto:ICrypto,
    saver?:INodeSaver,
    storages:IStorage[],
    httpAuthentication?:webdav.HTTPAuthentication,
    privilegeManager?:webdav.PrivilegeManager,
    blockSize:number,
    copies:number,
    copyMode:"random"|"cycle"|"all"
}