import { GiteeStorage } from "../fs/devices/gitee"
import { GithubStorage } from "../fs/devices/github"
import { OSSStorage } from "../fs/devices/oss"
import { QuarkStorage } from "../fs/devices/quark"
import { IStorage, LocalStorage, NullStorage } from "../fs/storage"

export interface storage{
    type:"gitee"|"github"|"local"|"null"|"oss"|"quark"
    mode:number
    [key:string]:boolean|number|string
}

export function createStorage(item:storage):IStorage|void|undefined{
    let storage:IStorage|undefined;
    switch(item.type){
        case "null":{
            storage= new NullStorage();
            break;
        }
        case "local":{
            storage= new LocalStorage(item.path as string);
            break;
        }
        case "github":{
            storage= new GithubStorage(item.token as string,item.owner as string,item.repo as string,item.branch as string,item.root as string);
            break;
        }
        case "gitee":{
            storage= new GiteeStorage(item.token as string,item.owner as string,item.repo as string,item.branch as string,item.root as string);
            break;
        }
        case "oss":{
            storage=new OSSStorage(item.accessKey as string,item.secret as string,item.host as string,item.blucket as string,item.root as string)
        }
        case "quark":{
            storage=new QuarkStorage(item.cookies as string,item.root as string); 
        }
    }
    if(storage){
        storage.mode=item.mode;
        if(item.ref){
            (storage as any).ref=item.ref;
        }
    }
    return storage;
}