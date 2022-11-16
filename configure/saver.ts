import { GiteeStorage } from "../fs/devices/gitee"
import { GithubStorage } from "../fs/devices/github"
import { ArraySaver, INodeSaver, LocalSaver, MemorySaver } from "../fs/isaver"
import { IStorage } from "../fs/storage"

export interface saver{
    type:"gitee"|"github"|"local"|"array"|"memory"
    fromStorage:boolean
    [key:string]:string|boolean|number|saver[]

}

export function createSaver(s:saver,storages?:IStorage[]):INodeSaver|undefined{
    switch(s.type){
        case "local":{
            return new LocalSaver(s.path as string);
        }
        case "github":{
            if(s.fromStorage){
                let storage=(storages||[]).find(p=>p.type==="github");
                return storage as GithubStorage;
            }
            return new GithubStorage(s.token as string,s.owner as string,s.repo as string,s.branch as string,s.root as string);
        }
        case "gitee":{
            if(s.fromStorage){
                let storage=(storages||[]).find(p=>p.type==="gitee");
                return storage as GiteeStorage;
            }
            return new GiteeStorage(s.token as string,s.owner as string,s.repo as string,s.branch as string,s.root as string);
        }
        case "memory":{
            return new MemorySaver();
        }
        case "array":{
            let saver=new ArraySaver();
            if(s.children){
                let children:saver[]=s.children as saver[];
                for(let i=0;i<children.length;i++){
                    let child=createSaver(children[i],storages);
                    if(child){
                        saver.Add(child);
                    }
                }
            }
            return saver;
        }
    }
}